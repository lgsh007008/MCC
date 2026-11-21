#!/usr/bin/env node
/**
 * 文档体系校验（`0-文档驱动开发机制.md` 的可机器验证部分）。
 *
 * 检查八项：
 *   1. product / design 同名配对
 *   2. 领域地图登记与磁盘文件一致
 *   3. 需求编号唯一、格式合法、领域前缀与声明一致
 *   4. 正文中的内部引用可达（Markdown 链接 + 反引号 .md 路径）
 *   5. 正文变更必须新增 changelog 版本小节，或在当日小节追加一行
 *   6. changelog 历史行只增不改（活跃区 + 指针指向的归档区双池）
 *   7. 归档文件只允许追加
 *   8. 活跃 changelog 不超过保留窗口（12 节 / 20,000 字符）
 *
 * 用法：pnpm docs:check
 * 环境变量：DOCS_BASE_REF（CI 基线提交；缺省 HEAD，即工作区改动对 HEAD）
 *   基线不可用时只跳过 5～7 三项，结构校验与保留窗口仍会执行。
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, ".AAAdocs");
const PRODUCT_DIR = path.join(DOCS, "product");
const DESIGN_DIR = path.join(DOCS, "design");
const ARCHIVE_DIR = path.join(DOCS, "archive", "changelog");
const EXCLUDED_TOP = new Set(["mock", "参考", "archive"]);
const MAX_CHANGELOG_SECTIONS = 12;
const MAX_CHANGELOG_CHARS = 20000;

const errors = [];
const warnings = [];
let linkCount = 0;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const addError = (check, file, line, message) =>
  errors.push({ check, file: file ? rel(file) : "", line, message });
const addWarning = (check, file, line, message) =>
  warnings.push({ check, file: file ? rel(file) : "", line, message });

// ---------- 读取 ----------

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === DOCS && EXCLUDED_TOP.has(entry.name)) continue;
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      out.push(...walk(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

const docs = walk(DOCS).map((file) => {
  const content = fs.readFileSync(file, "utf8");
  return { file, content, lines: content.split(/\r?\n/) };
});

// ---------- 通用解析 ----------

const CHANGELOG_RE = /^#{2,3}\s+(?:\d+\.\s*)?Changelog\s*$/;

function changelogIndex(lines) {
  return lines.findIndex((line) => CHANGELOG_RE.test(line.trim()));
}

function versionSectionIndexes(lines, start) {
  const indexes = [];
  if (start < 0) return indexes;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    if (/^###\s+v\d{8}\b/.test(lines[i].trim())) indexes.push(i);
  }
  return indexes;
}

const isTableRow = (line) => {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.split("|").length >= 3;
};

const isSeparatorRow = (line) => /^\|[\s:|-]+\|$/.test(line.trim());

const normalizeRow = (line) => line.trim().replace(/\s+/g, " ");

function collectChangelogRows(lines, start) {
  const rows = [];
  if (start < 0) return rows;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2}\s/.test(lines[i])) break;
    if (isTableRow(lines[i]) && !isSeparatorRow(lines[i])) {
      rows.push(normalizeRow(lines[i]));
    }
  }
  return rows;
}

// 正文 = 全文去掉 changelog 的表格行与版本标题；脚注等 changelog 之外的改动同样需要 changelog 行
function bodyOf(lines) {
  const start = changelogIndex(lines);
  return lines
    .filter((line, i) => {
      if (start < 0 || i < start) return true;
      return !isTableRow(line) && !/^###\s+v\d{8}\b/.test(line.trim());
    })
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim() !== "")
    .join("\n");
}

function todayVersion() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `v${date.replaceAll("-", "")}`;
}

// ---------- 1. changelog 存在性 ----------

for (const doc of docs) {
  if (changelogIndex(doc.lines) < 0) {
    addError(
      "changelog",
      doc.file,
      1,
      "缺少 Changelog 章节（所有文档必须可追溯变更）",
    );
  }
}

// ---------- 2. 保留窗口（12 节 / 20,000 字符） ----------

for (const doc of docs) {
  const start = changelogIndex(doc.lines);
  if (start < 0) continue;
  const sectionCount = versionSectionIndexes(doc.lines, start).length;
  const regionChars = doc.lines.slice(start).join("\n").length;
  if (
    sectionCount > 1 &&
    (sectionCount > MAX_CHANGELOG_SECTIONS || regionChars > MAX_CHANGELOG_CHARS)
  ) {
    addError(
      "归档",
      doc.file,
      start + 1,
      `changelog 有 ${sectionCount} 个版本小节 / ${regionChars} 字符，超过保留窗口（${MAX_CHANGELOG_SECTIONS} 节 / ${MAX_CHANGELOG_CHARS} 字符）；按「Changelog 归档」归档`,
    );
  } else if (sectionCount === 1 && regionChars > MAX_CHANGELOG_CHARS) {
    addWarning(
      "归档",
      doc.file,
      start + 1,
      `changelog 仅 1 个版本小节但 ${regionChars} 字符，超过上限；单节不拆分，允许保留`,
    );
  }
}

// ---------- 3. product / design 配对 ----------

const productDocs = docs.filter(
  (doc) => path.dirname(doc.file) === PRODUCT_DIR,
);
const designDocs = docs.filter((doc) => path.dirname(doc.file) === DESIGN_DIR);
const productNames = new Set(productDocs.map((doc) => path.basename(doc.file)));
const designNames = new Set(designDocs.map((doc) => path.basename(doc.file)));

for (const name of productNames) {
  if (!designNames.has(name)) {
    addError(
      "配对",
      path.join(PRODUCT_DIR, name),
      1,
      `缺少同名实现设计 design/${name}`,
    );
  }
}
for (const name of designNames) {
  if (!productNames.has(name)) {
    addError(
      "配对",
      path.join(DESIGN_DIR, name),
      1,
      `缺少同名需求文档 product/${name}`,
    );
  }
}

// ---------- 3. 领域地图登记 ----------

const indexDoc = docs.find(
  (doc) => doc.file === path.join(DOCS, "1-产品文档.md"),
);
if (!indexDoc) {
  addError("领域地图", "", 0, "找不到 .AAAdocs/1-产品文档.md");
} else {
  const registered = new Map();
  indexDoc.lines.forEach((line, i) => {
    for (const match of line.matchAll(/\]\(([^)]+)\)/g)) {
      let target = match[1].trim();
      try {
        target = decodeURIComponent(target);
      } catch {
        // 保留原样
      }
      const parsed = target.match(
        /(?:^|\/)(product|design)\/([^/)]+\.md)(?:#.*)?$/,
      );
      if (!parsed) continue;
      const abs = path.join(DOCS, parsed[1], parsed[2]);
      registered.set(abs, i + 1);
    }
  });

  for (const doc of [...productDocs, ...designDocs]) {
    if (!registered.has(doc.file)) {
      addError("领域地图", doc.file, 1, "未在 1-产品文档.md 领域地图登记");
    }
  }
  for (const [file, line] of registered) {
    if (!fs.existsSync(file)) {
      addError(
        "领域地图",
        indexDoc.file,
        line,
        `领域地图登记的文件不存在：${rel(file)}`,
      );
    }
  }
}

// ---------- 4. 需求编号 ----------

const R_HEADING =
  /^#{2,4}\s+R-([\u4e00-\u9fa5A-Za-z0-9_]+)-(\d{3})(?=[：:\s（(]|$)/;
const seenIds = new Map();

for (const doc of productDocs) {
  const preamble = doc.lines.slice(0, 20).join("\n");
  const current = preamble.match(/编号规则[：:][^\n]*?`R-([^`-]+)-NNN`/);
  const allowed = new Set();
  if (current) allowed.add(current[1]);
  for (const match of preamble.matchAll(/历史编号[^\n]*?`R-([^`-]+)-\d{3}/g)) {
    allowed.add(match[1]);
  }
  if (!current) {
    addWarning(
      "编号",
      doc.file,
      1,
      "未找到「编号规则：`R-<领域>-NNN`」声明，跳过前缀一致性校验",
    );
  }

  doc.lines.forEach((line, i) => {
    const match = line.match(R_HEADING);
    if (!match) return;
    const id = `R-${match[1]}-${match[2]}`;
    const previous = seenIds.get(id);
    if (previous) {
      addError(
        "编号",
        doc.file,
        i + 1,
        `${id} 与 ${rel(previous.file)}:${previous.line} 重复（编号即身份，永不复用）`,
      );
    } else {
      seenIds.set(id, { file: doc.file, line: i + 1 });
    }
    if (current && !allowed.has(match[1])) {
      addError(
        "编号",
        doc.file,
        i + 1,
        `${id} 的领域前缀「${match[1]}」不在本文件声明的编号段（${[...allowed].join(" / ")}）`,
      );
    }
  });
}

// ---------- 5. 内部引用 ----------

function resolveReference(fromFile, rawTarget) {
  let target = rawTarget.trim().replace(/^<|>$/g, "");
  try {
    target = decodeURIComponent(target);
  } catch {
    // 保留原样
  }
  if (!target || target.startsWith("#")) return null;
  if (/^(?:https?:|mailto:|tel:|file:|data:)/i.test(target)) return null;
  const clean = target.split("#")[0].split("?")[0].replaceAll("\\", "/");
  if (!clean) return null;
  // 文档内引用存在两种写法：相对当前文件，或相对文档根 .AAAdocs/（如 product/order.md）
  const bases = clean.startsWith("/")
    ? [ROOT]
    : [DOCS, path.dirname(fromFile), ROOT];
  const candidates = [
    ...new Set(bases.map((base) => path.resolve(base, clean))),
  ];
  return {
    candidates,
    found: candidates.find((candidate) => fs.existsSync(candidate)) || null,
  };
}

function collectAllTableRows(lines) {
  return lines
    .filter((line) => isTableRow(line) && !isSeparatorRow(line))
    .map(normalizeRow);
}

// 归档区双池：只在活跃文档指针链接的 .AAAdocs/archive/changelog/ 文件中找
function loadArchiveRowCounts(doc) {
  const counts = new Map();
  const start = changelogIndex(doc.lines);
  if (start < 0) return counts;
  const seen = new Set();
  for (let i = start + 1; i < doc.lines.length; i += 1) {
    const plain = doc.lines[i].replace(/`[^`]*`/g, "");
    for (const match of plain.matchAll(
      /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    )) {
      const resolved = resolveReference(doc.file, match[1]);
      if (!resolved?.found) continue;
      const archiveFile = path.resolve(resolved.found);
      if (!archiveFile.startsWith(ARCHIVE_DIR + path.sep)) continue;
      if (!archiveFile.endsWith(".md") || seen.has(archiveFile)) continue;
      seen.add(archiveFile);
      const lines = fs.readFileSync(archiveFile, "utf8").split(/\r?\n/);
      for (const row of collectAllTableRows(lines)) {
        counts.set(row, (counts.get(row) || 0) + 1);
      }
    }
  }
  return counts;
}

const FENCE_RE = /^\s*(```|~~~)/;
const INLINE_MD_PATH = /`([^`\n]+\.md)`/g;

for (const doc of docs) {
  const cl = changelogIndex(doc.lines);
  let inFence = false;
  let fenceToken = "";

  doc.lines.forEach((line, i) => {
    const fence = line.match(FENCE_RE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceToken = fence[1];
      } else if (line.trim().startsWith(fenceToken)) {
        inFence = false;
        fenceToken = "";
      }
      return;
    }
    if (inFence) return;

    // changelog 表格是历史记录，允许引用已删除的文件；只检查表格外的现行文本
    const inChangelog = cl >= 0 && i >= cl;
    if (
      inChangelog &&
      (isTableRow(line) || /^###\s+v\d{8}\b/.test(line.trim()))
    )
      return;

    const plain = line.replace(/`[^`]*`/g, "");
    for (const match of plain.matchAll(
      /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
    )) {
      const resolved = resolveReference(doc.file, match[1]);
      if (!resolved) continue;
      linkCount += 1;
      if (!resolved.found) {
        addError(
          "引用",
          doc.file,
          i + 1,
          `Markdown 链接目标不存在：${match[1]}`,
        );
      }
    }

    for (const match of line.matchAll(INLINE_MD_PATH)) {
      const target = match[1].trim();
      if (/[<>*?{}\s]/.test(target)) continue;
      if (/NNNN|NNN|YYYY/.test(target)) continue;
      const resolved = resolveReference(doc.file, target);
      if (!resolved) continue;
      linkCount += 1;
      if (!resolved.found) {
        addError("引用", doc.file, i + 1, `文档引用不存在：${target}`);
      }
    }
  });
}

// ---------- 6. changelog 增量与历史只读 ----------

function git(args) {
  try {
    // core.quotepath=false：中文文件名按原文输出，避免被转成八进制转义
    return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function changedDocFiles(baseRef) {
  let output = "";
  if (baseRef === "HEAD") {
    output += git(["diff", "--name-only", "HEAD"]) || "";
    output += "\n";
    output +=
      git(["ls-files", "--others", "--exclude-standard", "--", ".AAAdocs"]) ||
      "";
  } else {
    output = git(["diff", "--name-only", baseRef, "HEAD"]) || "";
  }
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((file) => file.startsWith(".AAAdocs/"))
        .filter((file) => file.endsWith(".md"))
        .filter((file) => !/^\.AAAdocs\/(?:mock|参考)\//.test(file)),
    ),
  ];
}

const baseRef = process.env.DOCS_BASE_REF?.trim() || "HEAD";
let gitChecksEnabled = true;

if (
  baseRef !== "HEAD" &&
  !git(["rev-parse", "--verify", `${baseRef}^{commit}`])
) {
  addWarning(
    "changelog",
    "",
    0,
    `基线提交 ${baseRef} 不可用，跳过 changelog 增量与历史只读校验`,
  );
  gitChecksEnabled = false;
}

if (gitChecksEnabled) {
  const today = todayVersion();
  const archivePrefix = `${rel(path.join(DOCS, "archive"))}/`;

  for (const file of changedDocFiles(baseRef)) {
    const abs = path.join(ROOT, file);

    if (file.startsWith(archivePrefix)) {
      if (!fs.existsSync(abs)) {
        addError("归档", abs, 1, "归档文件不允许删除");
        continue;
      }
      const oldContent = git(["show", `${baseRef}:${file}`]);
      if (oldContent === null) continue; // 本次新建的归档文件，无历史行可比

      const oldLines = oldContent
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map(normalizeRow);
      const newLines = fs
        .readFileSync(abs, "utf8")
        .split(/\r?\n/)
        .filter((line) => line.trim() !== "")
        .map(normalizeRow);
      const counts = new Map();
      for (const line of newLines) {
        counts.set(line, (counts.get(line) || 0) + 1);
      }
      const removed = [];
      for (const line of oldLines) {
        const available = counts.get(line) || 0;
        if (available > 0) counts.set(line, available - 1);
        else removed.push(line);
      }
      if (removed.length > 0) {
        addError(
          "归档",
          abs,
          1,
          `归档文件只允许追加，已有内容被修改或删除，共 ${removed.length} 行；首行：${removed[0].slice(0, 80)}`,
        );
      }
      continue;
    }

    if (!fs.existsSync(abs)) continue; // 删除文件不在此处判定

    const newContent = fs.readFileSync(abs, "utf8");
    const newLines = newContent.split(/\r?\n/);
    const newCl = changelogIndex(newLines);
    const oldContent = git(["show", `${baseRef}:${file}`]);
    const isAdded = oldContent === null;
    const oldLines = oldContent === null ? [] : oldContent.split(/\r?\n/);
    const oldCl = oldContent === null ? -1 : changelogIndex(oldLines);

    const bodyChanged = isAdded || bodyOf(oldLines) !== bodyOf(newLines);
    if (!bodyChanged) continue;

    if (newCl < 0) {
      addError("changelog", abs, 1, "正文已变更，但文档没有 Changelog 章节");
      continue;
    }

    // 版本小节是作者记录变更日期的位置；工作区跨天未提交时，不能要求小节日期等于当前日期，
    // 但必须能在本次 diff 中看到新增小节或当日追加行。
    const oldHeadings = new Set(
      oldLines
        .map((line) => line.trim())
        .filter((line) => /^###\s+v\d{8}\b/.test(line)),
    );
    let changeLine = -1;
    let changeVersion = "";
    for (let i = newCl + 1; i < newLines.length; i += 1) {
      const line = newLines[i].trim();
      if (!/^###\s+v\d{8}\b/.test(line)) continue;
      if (!oldHeadings.has(line)) {
        changeLine = i;
        changeVersion = line.replace(/^###\s+/, "").split(/\s/)[0];
      }
    }

    if (changeLine < 0) {
      // 同日追加：没有新增小节时，必须落在当日小节。
      for (let i = newCl + 1; i < newLines.length; i += 1) {
        const line = newLines[i].trim();
        if (!/^###\s+v\d{8}\b/.test(line)) continue;
        if (line.startsWith(`### ${today}`)) {
          changeLine = i;
          changeVersion = today;
        }
      }
    }

    if (changeLine < 0) {
      addError(
        "changelog",
        abs,
        1,
        `正文已变更，但 changelog 未新增版本小节，也未在 ${today} 小节追加行`,
      );
      continue;
    }

    let nextVersionLine = newLines.length;
    for (let i = changeLine + 1; i < newLines.length; i += 1) {
      if (/^###\s+v\d{8}\b/.test(newLines[i].trim())) {
        nextVersionLine = i;
        break;
      }
    }

    let rowAdded = false;
    if (isAdded) {
      rowAdded = newLines
        .slice(changeLine + 1, nextVersionLine)
        .some((line) => isTableRow(line) && !isSeparatorRow(line));
    } else {
      const diff = git(["diff", "-U0", baseRef, "--", file]) || "";
      let newLineNo = 0;
      for (const line of diff.split(/\r?\n/)) {
        const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (hunk) {
          newLineNo = Number(hunk[1]);
          continue;
        }
        if (line.startsWith("+++") || line.startsWith("---")) continue;
        if (line.startsWith("+")) {
          if (
            isTableRow(line.slice(1)) &&
            !isSeparatorRow(line.slice(1)) &&
            newLineNo > changeLine &&
            newLineNo <= nextVersionLine
          ) {
            rowAdded = true;
          }
          newLineNo += 1;
        }
      }
    }

    if (!rowAdded) {
      addError(
        "changelog",
        abs,
        changeLine + 1,
        `${changeVersion} 小节未追加 changelog 行`,
      );
    }

    if (!isAdded && oldCl >= 0 && newCl >= 0) {
      const oldRows = collectChangelogRows(oldLines, oldCl);
      const newRows = collectChangelogRows(newLines, newCl);
      const counts = new Map();
      for (const row of newRows) counts.set(row, (counts.get(row) || 0) + 1);
      const missing = [];
      for (const row of oldRows) {
        const available = counts.get(row) || 0;
        if (available > 0) {
          counts.set(row, available - 1);
        } else {
          missing.push(row);
        }
      }
      if (missing.length > 0) {
        const archiveCounts = loadArchiveRowCounts({
          file: abs,
          lines: newLines,
        });
        const stillMissing = [];
        for (const row of missing) {
          const available = archiveCounts.get(row) || 0;
          if (available > 0) archiveCounts.set(row, available - 1);
          else stillMissing.push(row);
        }
        if (stillMissing.length > 0) {
          addError(
            "changelog",
            abs,
            oldCl + 1,
            `changelog 历史行既不在活跃区也不在归档（只增不改），共 ${stillMissing.length} 行；首行：${stillMissing[0].slice(0, 80)}`,
          );
        }
      }
    }
  }
}

// ---------- 输出 ----------

for (const warning of warnings) {
  const loc = warning.line
    ? `${warning.file}:${warning.line}`
    : warning.file || "（全局）";
  console.warn(`警告 [${warning.check}] ${loc}：${warning.message}`);
}

if (errors.length > 0) {
  console.error(`\n文档校验失败：${errors.length} 项\n`);
  for (const error of errors) {
    const loc = error.line
      ? `${error.file}:${error.line}`
      : error.file || "（全局）";
    console.error(`  [${error.check}] ${loc}`);
    console.error(`    ${error.message}`);
  }
  console.error("");
  process.exit(1);
}

const archiveFileCount = fs.existsSync(ARCHIVE_DIR)
  ? walk(ARCHIVE_DIR).length
  : 0;

console.log(
  `文档校验通过：${docs.length} 个文档 + ${archiveFileCount} 个归档文件，${seenIds.size} 条需求编号，${linkCount} 处内部引用。`,
);
