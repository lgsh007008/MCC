import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// 包装设计（product/包装设计.md R-包装设计-006 / design/包装设计.md §9）：
// 方案库 → 新建工作台 → 单元目录 → 顶栏内联方案名 → 首次保存 → 发布 / 导出 → 打印报告。
// 工作台结构：平台侧栏自动折叠、顶栏只有发布 / 打印 / 保存 / 导出、
// 左栏单元目录树（类型 → 模板）、画布内右侧工具卡 / 底部三图标卡；工作台 1:1 单单元。

const projectName = `e2e包装-${Date.now()}`;
const crateName = `e2e包装木箱-${Date.now()}`;

test.describe.configure({ timeout: 120_000 });
test.use({ viewport: { width: 1280, height: 800 } });

const login = async (page: import('@playwright/test').Page): Promise<void> => {
  await page.goto('/login');
  await page.getByPlaceholder('如 TN-00001').fill('TN-00001');
  await page.getByPlaceholder('请输入账号').fill('admin');
  await page.getByPlaceholder('请输入密码').fill('Mcc@2026');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
};

const expect3DOrFallback = async (page: import('@playwright/test').Page): Promise<void> => {
  await expect
    .poll(async () => {
      const canvas = await page.locator('canvas').count();
      const fallback = await page.getByText('当前浏览器不支持 WebGL，已回退到轴测图。').count();
      return canvas + fallback;
    })
    .toBeGreaterThan(0);
};

const sidebarState = async (
  page: import('@playwright/test').Page,
): Promise<import('@playwright/test').Locator> => page.locator('[data-slot="sidebar"]').first();

// 归档没有公开 API；e2e 直接把测试方案置为 ARCHIVED，验证只读路径。
const runPackagingDbScript = (script: string): void => {
  const envFile = join(__dirname, '../../server/.env');
  const databaseUrl =
    process.env.DATABASE_URL ??
    (existsSync(envFile)
      ? /^DATABASE_URL=(.+)$/m.exec(readFileSync(envFile, 'utf8'))?.[1]?.trim()
      : undefined);
  if (!databaseUrl) {
    throw new Error('DATABASE_URL 未配置，无法清理包装测试数据');
  }
  // 脚本落盘再执行：-e 走命令行时，bash 会把反引号当命令替换、把 ${} 当变量展开，Linux CI 上必挂。
  // 落盘放在 server 目录下，才能按该包的 node_modules 解析 @mcc/db。
  const file = join(__dirname, '../../server', `.e2e-db-script-${Date.now()}-${Math.random().toString(16).slice(2)}.mts`);
  writeFileSync(file, script, 'utf8');
  try {
    execSync(`pnpm --filter @mcc/server exec tsx "${file}"`, {
      cwd: join(__dirname, '../..'),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } finally {
    rmSync(file, { force: true });
  }
};

const archiveProject = (id: string): void => {
  runPackagingDbScript(
    "import { PrismaClient } from '@mcc/db'; const p = new PrismaClient(); " +
      `p.packagingProject.update({ where: { id: '${id}' }, data: { status: 'ARCHIVED' } })` +
      '.then(() => p.$disconnect()).catch((e) => { console.error(e); process.exit(1); });',
  );
};

// 软删除会保留行；e2e 结束后硬删除测试方案，级联清理单元与版本。
test.afterAll(() => {
  runPackagingDbScript(
    "import { PrismaClient } from '@mcc/db'; const p = new PrismaClient(); " +
      'p.packagingProject.deleteMany({ where: { OR: [' +
      "{ name: { startsWith: 'e2e包装-' } }, " +
      "{ name: { startsWith: 'e2e包装木箱-' } }, " +
      "{ name: { startsWith: 'e2e木箱-' } }, " +
      "{ name: { startsWith: 'e2e托盘-' } }] } })" +
      '.then((r) => { console.log(`deleted ${r.count} e2e packaging projects`); return p.$disconnect(); })' +
      '.catch((e) => { console.error(e); process.exit(1); });',
  );
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const inject = (): void => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal{display:none!important}';
      document.head.appendChild(style);
    };
    if (document.head) {
      inject();
    } else {
      document.addEventListener('DOMContentLoaded', inject);
    }
  });
});

test('包装设计：单元目录、顶栏内联方案名、单单元保存、只读与打印报告', async ({ page }) => {
  await login(page);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  let projectId = '';

  try {
    await page.goto('/admin/packaging-design');
    await expect(page.getByText('关键字', { exact: true })).toBeVisible();

    // 方案库页面平台侧栏保持平台自身状态（不因工作台路由特例）
    const sidebar = await sidebarState(page);
    await page.getByRole('link', { name: '新建包装方案' }).click();
    await expect(page).toHaveURL(/\/admin\/packaging-design\/new$/);
    await expect(page.getByTestId('packaging-workbench')).toBeVisible();

    // 进入工作台时平台侧栏自动折叠为图标栏，且可手动展开
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    await page.getByRole('button', { name: '展开侧边栏' }).click();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');

    // 新建初始态：引导展示 + 未选结构前保存禁用
    await expect(page.getByText('可用包装结构')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    const unitPanel = page.getByRole('complementary', { name: '单元面板' });
    await unitPanel.getByRole('button', { name: '托盘 · 九墩块四向进叉' }).click();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await unitPanel.getByRole('button', { name: '返回单元目录' }).click();

    // 顶栏：无返回 / 方案号 / 视图切换；方案名为内联输入；动作顺序为 发布 / 打印 / 保存 / 导出
    const topbar = page.getByTestId('packaging-workbench').locator('header').first();
    await expect(topbar.getByRole('link', { name: '返回方案库' })).toHaveCount(0);
    await expect(topbar.getByText('PD-新方案')).toHaveCount(0);
    await expect(topbar.getByRole('button', { name: '2D', exact: true })).toHaveCount(0);
    const nameInput = topbar.getByLabel('方案名称');
    await expect(nameInput).toHaveValue('未命名方案');
    // 默认名较短：输入框随内容收缩，状态徽标紧邻，不出现大段空白
    const nameBox = await nameInput.boundingBox();
    const statusBox = await topbar.getByText('草稿', { exact: true }).boundingBox();
    expect(nameBox!.width).toBeLessThanOrEqual(160);
    expect(statusBox!.x - (nameBox!.x + nameBox!.width)).toBeLessThanOrEqual(48);
    for (const name of ['发布', '打印', '保存', '导出']) {
      await expect(topbar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    const publishBox = await topbar
      .getByRole('button', { name: '发布', exact: true })
      .boundingBox();
    const printBox = await topbar.getByRole('button', { name: '打印', exact: true }).boundingBox();
    const saveBox = await topbar.getByRole('button', { name: '保存', exact: true }).boundingBox();
    const exportBox = await topbar.getByRole('button', { name: '导出', exact: true }).boundingBox();
    expect(publishBox!.x).toBeLessThan(printBox!.x);
    expect(printBox!.x).toBeLessThan(saveBox!.x);
    expect(saveBox!.x).toBeLessThan(exportBox!.x);

    // 未保存：发布 / 打印禁用，导出可用且含 10 个导出项
    await expect(topbar.getByRole('button', { name: '发布', exact: true })).toBeDisabled();
    await expect(topbar.getByRole('button', { name: '打印', exact: true })).toBeDisabled();
    await topbar.getByRole('button', { name: '导出' }).click();
    const exportMenu = page.getByRole('menu');
    await expect(exportMenu.getByRole('menuitem')).toHaveCount(10);
    for (const name of [
      'SVG 俯视图',
      'SVG 主视图',
      'SVG 侧视图',
      'SVG 轴测图',
      'SVG 整图',
      'DXF 图纸',
      'BOM CSV',
      '开料 CSV',
      'OBJ 模型',
      'STL 模型',
    ]) {
      await expect(exportMenu.getByRole('menuitem', { name })).toBeVisible();
    }
    await expect(exportMenu.getByRole('menuitem', { name: '撤销' })).toHaveCount(0);
    const svgViewPromise = page.waitForEvent('download');
    await exportMenu.getByRole('menuitem', { name: 'SVG 俯视图' }).click();
    const svgViewDownload = await svgViewPromise;
    expect(svgViewDownload.suggestedFilename()).toMatch(/-俯视图\.svg$/);
    await page.keyboard.press('Escape');

    // 视图栏在画布内：模式 + 2D 方向 + 尺寸信息 / 缩放
    const viewbar = page.getByTestId('packaging-viewbar');
    await expect(viewbar.getByRole('button', { name: '2D', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of ['三视图', '俯视', '主视', '侧视', '轴测']) {
      await expect(viewbar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByText(/叉孔净高/)).toBeVisible();

    await viewbar.getByRole('button', { name: '俯视', exact: true }).click();
    await expect(viewbar.getByRole('button', { name: '俯视', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // 2D / 3D 共用同一画布框，切换视图不改变框尺寸
    const frame = page.getByTestId('viewport-frame');
    const frame2d = (await frame.boundingBox())!;
    await viewbar.getByRole('button', { name: '3D', exact: true }).click();
    await expect3DOrFallback(page);
    // 2D / 3D 缩放控件统一：都有 − / + / 复位，且不再出现「复位视角」
    await expect(viewbar.getByRole('button', { name: '放大' })).toBeVisible();
    await expect(viewbar.getByRole('button', { name: '缩小' })).toBeVisible();
    await expect(viewbar.getByRole('button', { name: '复位视图' })).toBeVisible();
    await expect(viewbar.getByRole('button', { name: '复位视角' })).toHaveCount(0);
    await viewbar.getByRole('button', { name: '放大' }).click();
    const frame3d = (await frame.boundingBox())!;
    expect(frame3d.width).toBeCloseTo(frame2d.width, 1);
    expect(frame3d.height).toBeCloseTo(frame2d.height, 1);
    await viewbar.getByRole('button', { name: '2D', exact: true }).click();
    await expect(page.locator('svg[aria-label="包装工程图"]')).toBeVisible();

    // 左栏：单元目录树（父级 = 类型，子级 = 模板），无增删 / 复制 / 排序
    await expect(unitPanel.getByText('目录', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('托盘', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('普通木箱', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('滑木箱', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('框架箱', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('围板', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('垫木', { exact: true })).toBeVisible();
    await expect(unitPanel.getByText('钢带箱', { exact: true })).toBeVisible();
    await expect(unitPanel.getByRole('button', { name: '添加托盘' })).toHaveCount(0);
    await expect(unitPanel.getByRole('button', { name: '添加木箱' })).toHaveCount(0);
    await expect(unitPanel.getByRole('button', { name: '复制单元' })).toHaveCount(0);
    await expect(unitPanel.getByRole('button', { name: '删除单元' })).toHaveCount(0);
    const palletItem = unitPanel.getByRole('button', {
      name: '托盘 · 九墩块四向进叉',
    });
    await expect(palletItem).toHaveAttribute('aria-pressed', 'true');

    // 左栏边缘把手：收起后 48px 竖条整条可点展开
    await unitPanel.getByRole('button', { name: '收起左栏' }).click();
    await expect(unitPanel.getByRole('button', { name: '展开左栏' })).toBeVisible();
    await expect(unitPanel.getByText('单元参数')).toBeVisible();
    await unitPanel.getByRole('button', { name: '展开左栏' }).click();
    await expect(unitPanel.getByRole('button', { name: '收起左栏' })).toBeVisible();

    // 目录选择木箱 → 参数；返回目录 → 选回托盘
    await unitPanel.getByRole('button', { name: '普通木箱 · 普通木箱 G 型' }).click();
    await expect(unitPanel.getByLabel('内长（mm）')).toBeVisible();
    await expect(unitPanel.getByText('普通木箱 G 型').first()).toBeVisible();
    await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
    await unitPanel.getByRole('button', { name: '托盘 · 九墩块四向进叉' }).click();
    await expect(unitPanel.getByLabel('上铺板模式')).toContainText('自动');
    await expect(unitPanel.getByLabel('下铺板模式')).toContainText('自动');
    await unitPanel.getByLabel('长度（mm）').fill('1300');
    await expect(unitPanel.getByText(/1300 × 800 × \d+ mm/)).toBeVisible();

    // 顶栏方案名内联编辑；点击不打开右栏
    await nameInput.fill(projectName);
    await expect(nameInput).toHaveValue(projectName);
    await expect(page.getByRole('complementary', { name: '工具面板' })).toHaveCount(0);

    // 首次保存：弹窗默认名称取顶栏值，只填方案名称与客户
    await page.getByRole('button', { name: '保存', exact: true }).click();
    const saveDialog = page.getByRole('dialog');
    await expect(saveDialog.getByRole('heading', { name: '保存方案' })).toBeVisible();
    await expect(saveDialog.getByLabel('方案名称')).toHaveValue(projectName);
    await saveDialog.getByLabel('客户名称').fill('E2E 客户');
    await saveDialog.getByRole('button', { name: '保存并进入工作台' }).click();
    await expect(page).toHaveURL(/\/admin\/packaging-design\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';
    await expect(page.getByText('已保存', { exact: true })).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');

    // 保存只提交当前单元：服务端只有 1 个单元
    const detail = await page.request.get(`/api/v1/packaging/projects/${projectId}`, {
      headers: auth,
    });
    expect(detail.ok()).toBe(true);
    const saved = (await detail.json()) as {
      name: string;
      units: Array<{ unitType: string }>;
    };
    expect(saved.name).toBe(projectName);
    expect(saved.units).toHaveLength(1);
    expect(saved.units[0]!.unitType).toBe('PALLET');

    // 首次保存后类型固定：跨类型目录项禁用，同类型模板仍可换（需确认）
    await expect(unitPanel.getByText('目录', { exact: true })).toBeVisible();
    await expect(
      unitPanel.getByRole('button', { name: '普通木箱 · 普通木箱 G 型' }),
    ).toBeDisabled();
    await expect(unitPanel.getByRole('button', { name: '托盘 · 三纵梁两向进叉' })).toBeEnabled();
    await unitPanel.getByRole('button', { name: '托盘 · 三纵梁两向进叉' }).click();
    const changeTemplateDialog = page.getByRole('alertdialog');
    await expect(
      changeTemplateDialog.getByText('更换模板会按新模板重新生成构件，手动修改过的构件将丢失。'),
    ).toBeVisible();
    await changeTemplateDialog.getByRole('button', { name: '更换' }).click();
    await expect(unitPanel.getByLabel('结构模板')).toContainText('三纵梁两向进叉');

    // 右栏「方案」标签不再有方案名称，只保留客户 / 范围 / 备注 / 当前单元合计
    const rail = page.getByRole('complementary', { name: '工具条' });
    await rail.getByRole('button', { name: '方案' }).click();
    const toolPanel = page.getByRole('complementary', { name: '工具面板' });
    await expect(toolPanel).toBeVisible();
    await expect(toolPanel.getByLabel('方案名称')).toHaveCount(0);
    await expect(toolPanel.getByLabel('客户名称')).toHaveValue('E2E 客户');
    await expect(toolPanel.getByLabel('使用范围')).toBeVisible();
    await expect(toolPanel.getByLabel('备注')).toBeVisible();
    await toolPanel.getByRole('button', { name: '收起右栏' }).click();

    // 已保存方案的打印报告
    await page.getByRole('button', { name: '打印', exact: true }).click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByRole('heading', { name: '包装方案结构图与木材料单' })).toBeVisible();
    await expect(page.getByText(/结论：优良/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '木材料单', exact: true })).toBeVisible();
    await expect(page.getByText(/筛查级结果，不代表承载合格/).first()).toBeVisible();

    // 方案库卡片：缩略图 + 状态徽标 + 客户；列表页不再有卡片 / 列表切换
    await page.goto('/admin/packaging-design');
    const card = page.locator('article').filter({ hasText: projectName });
    await expect(card).toBeVisible();
    await expect(card.getByText('草稿', { exact: true })).toBeVisible();
    await expect(card.getByText('E2E 客户')).toBeVisible();
    await expect(card.locator('svg[aria-label="包装工程图"]')).toBeVisible();
    await expect(card.getByText('进入设计')).toBeVisible();
    await expect(card.getByRole('button', { name: '复制' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: '卡片' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '列表' })).toHaveCount(0);
  } finally {
    if (projectId) {
      await page.request.delete(`/api/v1/packaging/projects/${projectId}`, {
        headers: auth,
      });
    } else {
      const list = await page.request.get('/api/v1/packaging/projects', {
        headers: auth,
        params: { keyword: projectName, page: 1, pageSize: 10 },
      });
      if (list.ok()) {
        const data = (await list.json()) as { items: Array<{ id: string }> };
        for (const item of data.items) {
          await page.request.delete(`/api/v1/packaging/projects/${item.id}`, {
            headers: auth,
          });
        }
      }
    }
  }
});

test('包装设计：目录切木箱、单单元保存、导出、发布、复制草稿与归档只读', async ({ page }) => {
  await login(page);

  const refresh = await page.request.post('/api/v1/auth/refresh', { data: {} });
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };
  let projectId = '';
  let duplicateId = '';

  try {
    await page.goto('/admin/packaging-design/new');
    await expect(page.getByTestId('packaging-workbench')).toBeVisible();
    await expect(page.getByText('可用包装结构')).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();

    const unitPanel = page.getByRole('complementary', { name: '单元面板' });
    await unitPanel.getByRole('button', { name: '普通木箱 · 普通木箱 G 型' }).click();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
    await expect(unitPanel.getByText('目录', { exact: true })).toBeVisible();

    // 目录切换木箱 → 参数联动外尺寸
    await unitPanel.getByRole('button', { name: '普通木箱 · 普通木箱 G 型' }).click();
    await expect(unitPanel.getByLabel('内长（mm）')).toBeVisible();
    await expect(unitPanel.getByText('普通木箱 G 型').first()).toBeVisible();
    await unitPanel.getByLabel('内长（mm）').fill('1000');
    await expect(unitPanel.getByText('1210 × 1010 × 1020 mm')).toBeVisible();

    await page.getByRole('button', { name: '保存', exact: true }).click();
    const saveDialog = page.getByRole('dialog');
    await saveDialog.getByLabel('方案名称').fill(crateName);
    await saveDialog.getByRole('button', { name: '保存并进入工作台' }).click();
    await expect(page).toHaveURL(/\/admin\/packaging-design\/[0-9a-f-]{36}$/);
    projectId = page.url().split('/').pop() ?? '';

    // 单单元保存：服务端只有 1 个 CRATE
    const detail = await page.request.get(`/api/v1/packaging/projects/${projectId}`, {
      headers: auth,
    });
    expect(detail.ok()).toBe(true);
    const saved = (await detail.json()) as {
      units: Array<{ unitType: string }>;
    };
    expect(saved.units.map((item) => item.unitType)).toEqual(['CRATE']);

    // 图纸集 + DXF 导出
    const viewbar = page.getByTestId('packaging-viewbar');
    await viewbar.getByRole('button', { name: '图纸', exact: true }).click();
    await expect(page.locator('svg[aria-label="图纸集"]')).toBeVisible();
    await page.getByRole('button', { name: '导出' }).click();
    const dxfPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'DXF 图纸' }).click();
    const dxfDownload = await dxfPromise;
    expect(dxfDownload.suggestedFilename()).toMatch(/\.dxf$/);
    await expect(page.getByRole('menu')).toBeHidden();

    // 料单 CSV 只从顶栏导出
    await page.getByRole('button', { name: '导出' }).click();
    const bomPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'BOM CSV' }).click();
    const bomDownload = await bomPromise;
    expect(bomDownload.suggestedFilename()).toMatch(/BOM\.csv$/);

    // 发布生成不可变版本，设计数据锁定
    await page.getByRole('button', { name: '发布', exact: true }).click();
    await expect(page.getByText(/已发布 R01/)).toBeVisible();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled();

    // 版本列表在右侧「版本」标签
    const rail = page.getByRole('complementary', { name: '工具条' });
    await rail.getByRole('button', { name: '版本' }).click();
    const toolPanel = page.getByRole('complementary', { name: '工具面板' });
    await expect(toolPanel).toBeVisible();
    await expect(toolPanel.getByRole('tab')).toHaveCount(4);
    await expect(toolPanel.getByText('R01', { exact: true })).toBeVisible();
    await expect(toolPanel.getByText('1 个版本')).toBeVisible();
    await toolPanel.getByRole('button', { name: '查看' }).click();
    const revisionDialog = page.getByRole('dialog');
    await expect(revisionDialog.getByRole('heading', { name: /版本详情 R01/ })).toBeVisible();
    await revisionDialog.getByRole('button', { name: '按版本打印' }).click();
    await expect(page).toHaveURL(/\/report\?revision=1$/);
    await expect(page.getByText(/正在查看历史快照 R01/)).toBeVisible();
    await page.goto(`/admin/packaging-design/${projectId}`);
    await expect(page.getByTestId('packaging-workbench')).toBeVisible();

    // 新建下一版本：回到草稿，历史版本保留
    await page.getByRole('button', { name: '新建下一版本' }).click();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '发布', exact: true })).toBeEnabled();

    // 归档只读：直接置 ARCHIVED 后刷新
    archiveProject(projectId);
    await page.reload();
    await expect(page.getByTestId('packaging-workbench')).toBeVisible();
    await expect(
      page.getByText('方案已归档，设计数据已锁定；可导出、打印或复制方案。'),
    ).toBeVisible();
    await expect(page.getByLabel('方案名称')).toBeDisabled();
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '导出', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: '打印', exact: true })).toBeEnabled();

    // 复制已归档方案 → 新草稿、名称追加「副本」、新编号
    const duplicate = await page.request.post(`/api/v1/packaging/projects/${projectId}/duplicate`, {
      headers: auth,
    });
    expect(duplicate.ok()).toBe(true);
    const copied = (await duplicate.json()) as {
      id: string;
      code: string;
      name: string;
      status: string;
    };
    duplicateId = copied.id;
    expect(copied.status).toBe('DRAFT');
    expect(copied.name).toBe(`${crateName} 副本`);
    expect(copied.code).not.toBe('');
    const copiedDetail = await page.request.get(`/api/v1/packaging/projects/${duplicateId}`, {
      headers: auth,
    });
    expect(copiedDetail.ok()).toBe(true);
    const copiedBody = (await copiedDetail.json()) as {
      units: Array<{ unitType: string }>;
    };
    expect(copiedBody.units).toHaveLength(1);

    // 归档方案仍可打印
    await page.getByRole('button', { name: '打印', exact: true }).click();
    await expect(page).toHaveURL(/\/report$/);
    await expect(page.getByRole('heading', { name: '包装方案结构图与木材料单' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '木材料单', exact: true }).first(),
    ).toBeVisible();
    // 报告页只负责打印，BOM / 开料 CSV 统一从工作台顶栏导出
    await expect(page.getByRole('button', { name: '导出 BOM CSV' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '打印 / 另存 PDF' })).toBeVisible();
  } finally {
    if (duplicateId) {
      await page.request.delete(`/api/v1/packaging/projects/${duplicateId}`, {
        headers: auth,
      });
    }
    if (projectId) {
      await page.request.delete(`/api/v1/packaging/projects/${projectId}`, {
        headers: auth,
      });
    } else {
      const list = await page.request.get('/api/v1/packaging/projects', {
        headers: auth,
        params: { keyword: crateName, page: 1, pageSize: 10 },
      });
      if (list.ok()) {
        const data = (await list.json()) as { items: Array<{ id: string }> };
        for (const item of data.items) {
          await page.request.delete(`/api/v1/packaging/projects/${item.id}`, {
            headers: auth,
          });
        }
      }
    }
  }
});

test('包装设计：铺板自动 / 手动、上限提示与木箱参数联动', async ({ page }) => {
  await login(page);
  await page.goto('/admin/packaging-design/new');
  await expect(page.getByTestId('packaging-workbench')).toBeVisible();
  await expect(page.getByText('可用包装结构')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();

  const unitPanel = page.getByRole('complementary', { name: '单元面板' });
  await unitPanel.getByRole('button', { name: '托盘 · 九墩块四向进叉' }).click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();
  await expect(unitPanel.getByLabel('上铺板模式')).toContainText('自动');

  // 自动 → 手动：初值取模板默认 5，构件表同步
  await unitPanel.getByLabel('上铺板模式').click();
  await page.getByRole('option', { name: '手动' }).click();
  await expect(unitPanel.getByLabel('上铺板数量')).toHaveValue('5');
  await unitPanel.getByLabel('上铺板数量').fill('6');
  await page.getByTestId('bottom-launcher').getByRole('button', { name: '打开构件表' }).click();
  const bottomPanel = page.getByRole('region', { name: '底部面板' });
  await expect(bottomPanel.getByLabel('第 1 行数量')).toHaveValue('6');
  await expect(bottomPanel.getByText('手动', { exact: true }).first()).toBeVisible();

  // 超出上限：显式提示，构件按 10 计算
  await unitPanel.getByLabel('上铺板数量').fill('12');
  await expect(unitPanel.getByText(/手动上限 10 块/)).toBeVisible();
  await expect(bottomPanel.getByLabel('第 1 行数量')).toHaveValue('10');

  // 托盘长宽变化：构件长度重算
  await unitPanel.getByLabel('长度（mm）').fill('1300');
  await expect(bottomPanel.getByLabel('第 1 行长度')).toHaveValue('1300');

  // 结论卡：载荷变化驱动等级；集中载荷降为可用
  const rail = page.getByRole('complementary', { name: '工具条' });
  await rail.getByRole('button', { name: '校验' }).click();
  const toolPanel = page.getByRole('complementary', { name: '工具面板' });
  await expect(toolPanel.getByText('优良', { exact: true })).toBeVisible();
  await unitPanel.getByLabel('目标载荷（kg）').fill('1000');
  await expect(toolPanel.getByText('需调整', { exact: true })).toBeVisible();
  await unitPanel.getByLabel('目标载荷（kg）').fill('400');
  await expect(toolPanel.getByText('优良', { exact: true })).toBeVisible();
  await unitPanel.getByLabel('载荷形式').click();
  await page.getByRole('option', { name: '集中' }).click();
  await expect(toolPanel.getByText('可用', { exact: true })).toBeVisible();
  await toolPanel.getByRole('button', { name: '收起右栏' }).click();

  // 木箱：参数分组与外尺寸完整推导
  await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
  await unitPanel.getByRole('button', { name: '普通木箱 · 普通木箱 G 型' }).click();
  await expect(unitPanel.getByLabel('面板厚（mm）')).toHaveValue('15');
  await expect(unitPanel.getByLabel('底板厚（mm）')).toHaveValue('15');
  await expect(unitPanel.getByLabel('底部支承（mm）')).toHaveValue('90');
  await expect(unitPanel.getByLabel('框架厚度（mm）')).toHaveValue('90');
  await unitPanel.getByLabel('内长（mm）').fill('1000');
  await expect(unitPanel.getByText('1210 × 1010 × 1020 mm')).toBeVisible();
  await expect(page.getByText(/1210 × 1010 × 1020 mm/).first()).toBeVisible();

  // 滑木箱：目录分组、滑木数量与外尺寸
  await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
  await unitPanel.getByRole('button', { name: '滑木箱 · 滑木箱 G 型' }).click();
  await expect(unitPanel.getByLabel('滑木数量')).toHaveValue('3');
  await expect(unitPanel.getByLabel('滑木宽度（mm）')).toHaveValue('90');
  await expect(unitPanel.getByText('1410 × 1010 × 1020 mm')).toBeVisible();

  // 钢带箱：无框架、钢带数量 / 宽度 / 方向与外尺寸
  await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
  await unitPanel.getByRole('button', { name: '钢带箱 · 钢带箱 G 型' }).click();
  await expect(unitPanel.getByLabel('框架厚度（mm）')).toHaveValue('0');
  await expect(unitPanel.getByLabel('钢带数量（道）')).toHaveValue('4');
  await expect(unitPanel.getByLabel('钢带宽度（mm）')).toHaveValue('30');
  await expect(unitPanel.getByLabel('钢带方向')).toContainText('横向');
  await expect(unitPanel.getByText('1230 × 830 × 1020 mm')).toBeVisible();
  await unitPanel.getByLabel('钢带方向').click();
  await page.getByRole('option', { name: '纵横' }).click();
  await expect(unitPanel.getByLabel('钢带方向')).toContainText('纵横');

  // 框架箱：默认无面板、盖板有、框架尺寸与面板覆盖
  await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
  await unitPanel.getByRole('button', { name: '框架箱 · 框架箱 G 型' }).click();
  await expect(unitPanel.getByLabel('框架厚度（mm）')).toHaveValue('90');
  await expect(unitPanel.getByLabel('滑木宽度（mm）')).toHaveValue('90');
  await expect(unitPanel.getByLabel('面板覆盖')).toContainText('无');
  await expect(unitPanel.getByLabel('盖板')).toContainText('有');
  await expect(unitPanel.getByText('1380 × 980 × 1110 mm')).toBeVisible();
  await unitPanel.getByLabel('面板覆盖').click();
  await page.getByRole('option', { name: '侧端' }).click();
  await expect(unitPanel.getByLabel('面板覆盖')).toContainText('侧端');
  await expect(unitPanel.getByText('1410 × 1010 × 1110 mm')).toBeVisible();

  // 围板：每层四块围板、层数与外尺寸
  await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
  await unitPanel.getByRole('button', { name: '围板 · 围板 G 型' }).click();
  await expect(unitPanel.getByLabel('单层高度（mm）')).toHaveValue('200');
  await expect(unitPanel.getByLabel('板厚（mm）')).toHaveValue('8');
  await expect(unitPanel.getByLabel('铰链数量 / 层')).toHaveValue('4');
  await expect(unitPanel.getByText('1216 × 816 × 200 mm')).toBeVisible();
  await unitPanel.getByLabel('层数').fill('2');
  await expect(unitPanel.getByText('1216 × 816 × 400 mm')).toBeVisible();

  // 垫木：平行排列外宽随数量累加
  await unitPanel.getByRole('button', { name: '返回单元目录' }).click();
  await unitPanel.getByRole('button', { name: '垫木 · 垫木 G 型' }).click();
  await expect(unitPanel.getByLabel('长度（mm）')).toHaveValue('1200');
  await expect(unitPanel.getByLabel('宽度（mm）')).toHaveValue('90');
  await expect(unitPanel.getByLabel('厚度（mm）')).toHaveValue('90');
  await expect(unitPanel.getByLabel('数量')).toHaveValue('3');
  await expect(unitPanel.getByText('1200 × 270 × 90 mm')).toBeVisible();
  await unitPanel.getByLabel('数量').fill('4');
  await expect(unitPanel.getByText('1200 × 360 × 90 mm')).toBeVisible();
});

test('包装设计：方案库、画布内工具卡 / 面板、底部图标卡、撤销重做、草稿恢复与分屏', async ({
  page,
}) => {
  await login(page);

  await page.goto('/admin/packaging-design');
  await expect(page.getByText('关键字', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '新建包装方案' })).toBeVisible();

  await page.getByRole('link', { name: '新建包装方案' }).click();
  await expect(page).toHaveURL(/\/admin\/packaging-design\/new$/);
  await expect(page.getByTestId('packaging-workbench')).toBeVisible();
  await expect(page.getByRole('complementary', { name: '单元面板' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: '单元树' })).toHaveCount(0);
  await expect(page.getByText('可用包装结构')).toBeVisible();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
  await page
    .getByRole('complementary', { name: '单元面板' })
    .getByRole('button', { name: '托盘 · 九墩块四向进叉' })
    .click();
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeEnabled();

  // 2D 画布框保持在画布内；2D / 3D 共用同一框
  const canvas = page.getByTestId('workbench-canvas');
  const frame = page.getByTestId('viewport-frame');
  await expect(frame).toBeVisible();
  // 等右栏宽度过渡结束，再在同一帧内取坐标，避免动画过程中测量
  await page.waitForTimeout(300);
  const boxes = await page.evaluate(() => {
    const read = (selector: string): { x: number; y: number; width: number; height: number } => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      canvas: read('[data-testid="workbench-canvas"]'),
      frame: read('[data-testid="viewport-frame"]'),
    };
  });
  expect(boxes.frame.x).toBeGreaterThanOrEqual(boxes.canvas.x);
  expect(boxes.frame.x + boxes.frame.width).toBeLessThanOrEqual(
    boxes.canvas.x + boxes.canvas.width,
  );
  expect(boxes.frame.y + boxes.frame.height).toBeLessThanOrEqual(
    boxes.canvas.y + boxes.canvas.height,
  );

  // 关闭态：右侧工具条卡在画布内（绝对定位）→ 打开 320px 白列（可拖宽）→ 4 个 icon+文案标签 → 收起回卡
  const rail = page.getByRole('complementary', { name: '工具条' });
  await expect(rail).toBeVisible();
  await expect(canvas.getByRole('complementary', { name: '工具条' })).toBeVisible();
  expect(await rail.evaluate((element) => getComputedStyle(element).position)).toBe('absolute');
  await rail.getByRole('button', { name: '构件' }).click();
  const toolPanel = page.getByRole('complementary', { name: '工具面板' });
  await expect(toolPanel).toBeVisible();
  await expect(toolPanel.getByRole('tab')).toHaveCount(4);
  for (const name of ['方案', '构件', '校验', '版本']) {
    await expect(toolPanel.getByRole('tab', { name, exact: true })).toBeVisible();
  }
  await expect(toolPanel.getByRole('button', { name: '收起右栏' })).toBeVisible();
  await expect(toolPanel.getByRole('button', { name: '关闭' })).toHaveCount(0);
  await expect(rail).toHaveCount(0);
  await expect(toolPanel.getByRole('tab', { name: '构件', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await toolPanel.getByRole('tab', { name: '校验', exact: true }).click();
  await expect(toolPanel.getByRole('tab', { name: '校验', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // 右栏与底栏一致：左边缘可拖宽（默认 320，向左拖 80 → 约 400）
  const panelBox = (await toolPanel.boundingBox())!;
  expect(panelBox.width).toBeCloseTo(320, 0);
  await page.mouse.move(panelBox.x + 3, panelBox.y + 120);
  await page.mouse.down();
  await page.mouse.move(panelBox.x + 3 - 80, panelBox.y + 120, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await toolPanel.boundingBox())!.width).toBeGreaterThan(360);

  await toolPanel.getByRole('button', { name: '收起右栏' }).click();
  await expect(toolPanel).toHaveCount(0);
  await expect(rail).toBeVisible();
  await rail.getByRole('button', { name: '方案' }).click();
  await expect(toolPanel.getByRole('tab', { name: '方案', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await toolPanel.getByRole('button', { name: '收起右栏' }).click();

  // 关闭态：底部三图标卡 → 打开 3 个 icon+文案标签 → 切换 BOM → 收起回卡
  const launcher = page.getByTestId('bottom-launcher');
  await expect(launcher).toBeVisible();
  // 关闭态两侧图标卡厚度一致：右侧 rail 宽 = 底部 launcher 高 = 46px
  const railBox = await rail.locator('div').first().boundingBox();
  const launcherBox = await launcher.locator('div').first().boundingBox();
  expect(railBox!.width).toBeCloseTo(46, 0);
  expect(launcherBox!.height).toBeCloseTo(46, 0);
  await expect(launcher.getByRole('button')).toHaveCount(3);
  await expect(launcher.getByRole('button', { name: '打开构件表' })).toBeVisible();
  await expect(launcher.getByRole('button', { name: '打开BOM' })).toBeVisible();
  await expect(launcher.getByRole('button', { name: '打开开料' })).toBeVisible();
  await launcher.getByRole('button', { name: '打开构件表' }).click();
  const bottomPanel = page.getByRole('region', { name: '底部面板' });
  await expect(bottomPanel).toBeVisible();
  await expect(launcher).toBeHidden();
  await expect(bottomPanel.getByRole('tab')).toHaveCount(3);
  for (const name of ['构件表', 'BOM', '开料']) {
    await expect(bottomPanel.getByRole('tab', { name, exact: true })).toBeVisible();
  }
  await expect(bottomPanel.getByRole('button', { name: '收起底栏' })).toBeVisible();

  // 紧凑表：表头 12 / 行高 36（三个明细 tab 共用）
  const denseTable = page.locator('[data-slot="table-container"][data-density="dense"]').first();
  await expect(denseTable).toBeVisible();
  expect(
    await denseTable
      .locator('[data-slot="table-head"]')
      .first()
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('12px');
  expect(
    await denseTable
      .locator('[data-slot="table-row"]')
      .nth(1)
      .evaluate((element) => getComputedStyle(element).height),
  ).toBe('36px');

  await bottomPanel.getByRole('tab', { name: 'BOM', exact: true }).click();
  await expect(bottomPanel.getByText('按构件汇总体积、重量与材料费。')).toBeVisible();
  await expect(bottomPanel.getByRole('button', { name: '导出 BOM CSV' })).toHaveCount(0);
  await bottomPanel.getByRole('button', { name: '收起底栏' }).click();
  await expect(bottomPanel).toHaveCount(0);
  await expect(launcher).toBeVisible();

  // 构件表编辑 + 顶栏撤销 / 重做按钮 + 键盘撤销 / 重做
  const undoButton = page.getByRole('button', { name: '撤销', exact: true });
  const redoButton = page.getByRole('button', { name: '重做', exact: true });
  await expect(undoButton).toBeDisabled();
  await expect(redoButton).toBeDisabled();
  await launcher.getByRole('button', { name: '打开构件表' }).click();
  await bottomPanel.getByRole('tab', { name: '构件表', exact: true }).click();
  const quantity = page.getByLabel('第 1 行数量');
  await quantity.fill('6');
  await expect(quantity).toHaveValue('6');
  await expect(undoButton).toBeEnabled();
  await expect(redoButton).toBeDisabled();
  await canvas.click({ position: { x: 6, y: 6 } });
  await undoButton.click();
  await expect(quantity).toHaveValue('5');
  await expect(redoButton).toBeEnabled();
  await redoButton.click();
  await expect(quantity).toHaveValue('6');
  await page.keyboard.press('Control+z');
  await expect(quantity).toHaveValue('5');
  await page.keyboard.press('Control+Shift+z');
  await expect(quantity).toHaveValue('6');

  // 本机草稿（800ms 防抖）→ 刷新后恢复
  await expect(quantity).toHaveValue('6');
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.getByText(/发现本机草稿/)).toBeVisible();
  await page.getByRole('button', { name: '恢复草稿' }).click();
  // 成功提示为画布顶部 Toast，约 2.5s 后自动消失
  const restoreToast = page.getByText('已恢复本机草稿');
  await expect(restoreToast).toBeVisible();
  await expect(restoreToast).toHaveCount(0, { timeout: 5000 });

  // 分屏：2D + 3D（模式在画布视图栏）
  const viewbar = page.getByTestId('packaging-viewbar');
  await viewbar.getByRole('button', { name: '分屏', exact: true }).click();
  await expect(page.locator('svg[aria-label="包装工程图"]')).toBeVisible();
  await expect3DOrFallback(page);
  // 分屏只保留「复位」，不显示加减缩放
  await expect(viewbar.getByRole('button', { name: '放大' })).toHaveCount(0);
  await expect(viewbar.getByRole('button', { name: '复位视图' })).toBeVisible();
});
