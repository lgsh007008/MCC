import type { PackagingPartInput } from '../packaging.schemas';
import type { PalletComponentInput } from '../pallet.schemas';
import type { PalletGeometry, PalletPiece } from '../pallet.geometry';
import type { PalletIssue } from '../pallet.validation';

// 木箱 G 型（product/包装设计.md R-包装设计-007 / R-包装设计-016）：
// 结构（几何）与配置（参数）分离；外尺寸与构件都由参数派生，手工修改只作为覆盖。
// 几何输出仍使用 PalletGeometry，2D / 3D / BOM 与托盘共用同一条渲染与导出链。

export interface CrateParams {
  /** 内长 */
  innerLengthMm: number;
  /** 内宽 */
  innerWidthMm: number;
  /** 内高 */
  innerHeightMm: number;
  /** 面板厚：侧板 / 端板 / 盖板共用 */
  thicknessMm: number;
  /** 底板厚 */
  bottomThicknessMm: number;
  /** 底部支承高度（滑木高度） */
  baseHeightMm: number;
  /** 框架厚度（立柱截面宽） */
  frameThicknessMm: number;
  /** 钢带道数；0 表示不配 */
  steelStrapCount?: number;
  /** 滑木数量，默认 3 */
  runnerCount?: number;
  /** 滑木宽度，默认 90 */
  runnerWidthMm?: number;
  /** 钢带宽度，默认 30 */
  strapWidthMm?: number;
  /** 钢带方向：横向 / 纵横 */
  strapDirection?: 'horizontal' | 'both';
}

export const CRATE_DEFAULT_PARAMS: Required<CrateParams> = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  innerHeightMm: 900,
  thicknessMm: 15,
  bottomThicknessMm: 15,
  baseHeightMm: 90,
  frameThicknessMm: 90,
  steelStrapCount: 2,
  runnerCount: 3,
  runnerWidthMm: 90,
  strapWidthMm: 30,
  strapDirection: 'horizontal',
};

const positive = (value: number, fallback = 0): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const intOr = (value: number, fallback: number): number => Math.max(1, Math.round(positive(value, fallback)));

export interface CrateOuterSize {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

/** 外尺寸派生：长 / 宽 = 内 + 2 × (板厚 + 框架)；高 = 内 + 底板 + 盖板 + 底部支承。 */
export function deriveCrateOuter(params: CrateParams): CrateOuterSize {
  const innerLengthMm = intOr(params.innerLengthMm, CRATE_DEFAULT_PARAMS.innerLengthMm);
  const innerWidthMm = intOr(params.innerWidthMm, CRATE_DEFAULT_PARAMS.innerWidthMm);
  const innerHeightMm = intOr(params.innerHeightMm, CRATE_DEFAULT_PARAMS.innerHeightMm);
  const thicknessMm = intOr(params.thicknessMm, CRATE_DEFAULT_PARAMS.thicknessMm);
  const bottomThicknessMm = intOr(params.bottomThicknessMm, thicknessMm);
  const baseHeightMm = intOr(params.baseHeightMm, CRATE_DEFAULT_PARAMS.baseHeightMm);
  const frameThicknessMm = Number.isFinite(params.frameThicknessMm)
    ? Math.max(0, Math.round(params.frameThicknessMm))
    : CRATE_DEFAULT_PARAMS.frameThicknessMm;
  return {
    lengthMm: innerLengthMm + 2 * (thicknessMm + frameThicknessMm),
    widthMm: innerWidthMm + 2 * (thicknessMm + frameThicknessMm),
    heightMm: baseHeightMm + bottomThicknessMm + innerHeightMm + thicknessMm,
  };
}

/** 由参数派生木箱构件；构件表只展示与覆盖，不再承担结构定义。 */
export function deriveCrateParts(params: CrateParams): PackagingPartInput[] {
  const innerLengthMm = intOr(params.innerLengthMm, CRATE_DEFAULT_PARAMS.innerLengthMm);
  const innerWidthMm = intOr(params.innerWidthMm, CRATE_DEFAULT_PARAMS.innerWidthMm);
  const innerHeightMm = intOr(params.innerHeightMm, CRATE_DEFAULT_PARAMS.innerHeightMm);
  const thicknessMm = intOr(params.thicknessMm, CRATE_DEFAULT_PARAMS.thicknessMm);
  const bottomThicknessMm = intOr(params.bottomThicknessMm, thicknessMm);
  const baseHeightMm = intOr(params.baseHeightMm, CRATE_DEFAULT_PARAMS.baseHeightMm);
  const frameThicknessMm = Number.isFinite(params.frameThicknessMm)
    ? Math.max(0, Math.round(params.frameThicknessMm))
    : CRATE_DEFAULT_PARAMS.frameThicknessMm;
  const outer = deriveCrateOuter(params);
  const steelStrapCount = Math.max(
    0,
    Math.min(6, Math.round(params.steelStrapCount ?? CRATE_DEFAULT_PARAMS.steelStrapCount ?? 2)),
  );
  const strapWidthMm = Math.max(
    10,
    Math.min(60, Math.round(params.strapWidthMm ?? CRATE_DEFAULT_PARAMS.strapWidthMm ?? 30)),
  );
  const strapBoth = params.strapDirection === 'both';
  const horizontalStrapCount = strapBoth ? Math.ceil(steelStrapCount / 2) : steelStrapCount;
  const longitudinalStrapCount = strapBoth ? Math.floor(steelStrapCount / 2) : 0;
  const runnerCount = Math.max(1, Math.min(6, Math.round(params.runnerCount ?? 3)));
  const runnerWidthMm = intOr(params.runnerWidthMm ?? 90, 90);

  const parts: PackagingPartInput[] = [
    {
      role: 'bottomDeck',
      name: '底板',
      materialCode: 'plywood',
      orientation: 'x',
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      heightMm: bottomThicknessMm,
      quantity: 1,
      wastePct: 0.06,
      processCost: 3,
      priceOverride: 0,
    },
    {
      role: 'panel',
      name: '侧板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: innerLengthMm,
      widthMm: thicknessMm,
      heightMm: innerHeightMm,
      quantity: 2,
      wastePct: 0.08,
      processCost: 1.2,
      priceOverride: 0,
    },
    {
      role: 'panel',
      name: '端板',
      materialCode: 'pine',
      orientation: 'y',
      // 端板包住两侧侧板，下料长度按外宽扣框架后的净宽。
      lengthMm: innerWidthMm + 2 * thicknessMm,
      widthMm: thicknessMm,
      heightMm: innerHeightMm,
      quantity: 2,
      wastePct: 0.08,
      processCost: 1.2,
      priceOverride: 0,
    },
    {
      role: 'topDeck',
      name: '盖板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      heightMm: thicknessMm,
      quantity: 1,
      wastePct: 0.08,
      processCost: 1.5,
      priceOverride: 0,
    },
    {
      role: 'runner',
      name: '滑木',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: outer.lengthMm,
      widthMm: runnerWidthMm,
      heightMm: baseHeightMm,
      quantity: runnerCount,
      wastePct: 0.1,
      processCost: 4,
      priceOverride: 0,
    },
  ];

  if (frameThicknessMm > 0) {
    parts.push({
      role: 'frame',
      name: '立柱',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: frameThicknessMm,
      widthMm: frameThicknessMm,
      heightMm: innerHeightMm,
      quantity: 4,
      wastePct: 0.1,
      processCost: 2,
      priceOverride: 0,
    });
  }

  if (horizontalStrapCount > 0) {
    parts.push({
      role: 'steelStrap',
      name: strapBoth ? '钢带（横向）' : '钢带',
      materialCode: 'steel-strap',
      orientation: 'x',
      lengthMm: strapWidthMm,
      widthMm: outer.widthMm,
      heightMm: 1,
      quantity: horizontalStrapCount,
      wastePct: 0,
      processCost: 0,
      priceOverride: 0,
    });
  }

  if (longitudinalStrapCount > 0) {
    parts.push({
      role: 'steelStrap',
      name: '钢带（纵向）',
      materialCode: 'steel-strap',
      orientation: 'y',
      lengthMm: outer.lengthMm,
      widthMm: strapWidthMm,
      heightMm: 1,
      quantity: longitudinalStrapCount,
      wastePct: 0,
      processCost: 0,
      priceOverride: 0,
    });
  }

  return parts;
}

export interface CrateGeometryProject {
  outerLengthMm: number;
  outerWidthMm: number;
  innerHeightMm: number;
  thicknessMm: number;
  bottomThicknessMm?: number;
  baseHeightMm?: number;
  frameThicknessMm?: number;
}

const maxHeight = (parts: PalletComponentInput[], fallback: number): number =>
  parts.length === 0 ? fallback : Math.max(...parts.map((part) => positive(part.heightMm, fallback)));

const spread = (count: number, start: number, end: number, size: number): number[] => {
  const q = Math.max(1, Math.round(count));
  const safeEnd = Math.max(start, end - size);
  return Array.from({ length: q }, (_, index) =>
    q === 1 ? (end - size) / 2 : start + (index * (safeEnd - start)) / (q - 1),
  );
};

const PLANK_TARGET_WIDTH_MM = 150;
const PLANK_GAP_MM = 2.5;

/*
 * 板材按目标板宽拆条，板条之间留工艺缝：
 * 几何上呈现真实拼板，BOM 仍按整板下料（拼条属加工工艺）。
 */
const splitPlanks = (total: number): Array<{ start: number; size: number }> => {
  const safeTotal = Math.max(1, total);
  const count = Math.max(1, Math.ceil(safeTotal / PLANK_TARGET_WIDTH_MM));
  const size = (safeTotal - PLANK_GAP_MM * (count - 1)) / count;
  return Array.from({ length: count }, (_, index) => ({
    start: index * (size + PLANK_GAP_MM),
    size,
  }));
};

export function buildCrateGeometry(
  project: CrateGeometryProject,
  components: PalletComponentInput[],
): PalletGeometry {
  const L = positive(project.outerLengthMm, 1);
  const W = positive(project.outerWidthMm, 1);
  const defaultT = positive(project.thicknessMm, 15);
  const defaultBottomT = positive(project.bottomThicknessMm ?? defaultT, defaultT);

  const runners = components.filter((component) => component.role === 'runner');
  const bottoms = components.filter(
    (component) => component.role === 'bottomDeck' || component.name.includes('底板'),
  );
  const lids = components.filter(
    (component) => component.role === 'topDeck' || component.name.includes('盖板'),
  );
  const panels = components.filter((component) => component.role === 'panel');
  const frames = components.filter((component) => component.role === 'frame');

  const baseHeight = Math.max(
    positive(project.baseHeightMm ?? 0, 0),
    maxHeight(runners, 0),
  );
  const bottomT = maxHeight(bottoms, defaultBottomT);
  const lidT = maxHeight(lids, defaultT);
  const innerH = positive(
    project.innerHeightMm,
    Math.max(1, maxHeight(panels, 1)),
  );
  const frameT = Math.max(
    0,
    positive(project.frameThicknessMm ?? 0, 0),
    frames.length > 0 ? Math.max(...frames.map((frame) => positive(frame.widthMm, 0))) : 0,
  );
  const H = baseHeight + bottomT + innerH + lidT;
  const pieces: PalletPiece[] = [];

  const push = (
    x: number,
    y: number,
    z: number,
    l: number,
    w: number,
    h: number,
    role: PalletPiece['role'],
    componentIndex: number,
    label: string,
  ): void => {
    pieces.push({ x, y, z, l, w, h, role, componentIndex, label });
  };

  components.forEach((component, componentIndex) => {
    const quantity = Math.max(1, Math.round(component.quantity));
    if (component.role === 'runner') {
      const ys = spread(quantity, 0, W, component.widthMm);
      ys.forEach((y, index) => {
        push(
          0,
          y,
          0,
          L,
          component.widthMm,
          component.heightMm,
          component.role,
          componentIndex,
          quantity > 1 ? `${component.name} ${index + 1}` : component.name,
        );
      });
      return;
    }
    if (component.role === 'bottomDeck' || component.name.includes('底板')) {
      push(0, 0, baseHeight, L, W, component.heightMm, component.role, componentIndex, component.name);
      return;
    }
    if (component.role === 'topDeck' || component.name.includes('盖板')) {
      splitPlanks(L).forEach((plank) => {
        push(
          plank.start,
          0,
          baseHeight + bottomT + innerH,
          plank.size,
          W,
          component.heightMm,
          component.role,
          componentIndex,
          component.name,
        );
      });
      return;
    }
    if (component.role === 'frame') {
      const positions: Array<[number, number]> = [
        [0, 0],
        [Math.max(0, L - component.lengthMm), 0],
        [0, Math.max(0, W - component.widthMm)],
        [Math.max(0, L - component.lengthMm), Math.max(0, W - component.widthMm)],
      ];
      for (let i = 0; i < quantity; i += 1) {
        const [x, y] = positions[i % positions.length]!;
        push(
          x,
          y,
          baseHeight + bottomT,
          component.lengthMm,
          component.widthMm,
          component.heightMm,
          component.role,
          componentIndex,
          `${component.name} ${i + 1}`,
        );
      }
      return;
    }
    if (component.role === 'steelStrap') {
      /*
       * 钢带围绕箱体外表面一圈：竖带贴在前后（或左右）面外，
       * 顶带 / 底带压在箱盖与底座下沿，避免渲染成一整面实心墙。
       * 横向构件的带宽记在 lengthMm，纵向构件的带宽记在 widthMm。
       */
      const bandT = (width: number): number => Math.max(1.5, Math.round(width * 0.08));
      if (component.orientation === 'y') {
        const band = Math.max(1, component.widthMm);
        const bandThickness = bandT(band);
        const ys = spread(quantity, 0, W, band);
        ys.forEach((y, index) => {
          const label = quantity > 1 ? `${component.name} ${index + 1}` : component.name;
          push(-bandThickness, y, -bandThickness, bandThickness, band, H + bandThickness, component.role, componentIndex, `${label} 左竖带`);
          push(L, y, -bandThickness, bandThickness, band, H + bandThickness, component.role, componentIndex, `${label} 右竖带`);
          push(-bandThickness, y, H, L + bandThickness * 2, band, bandThickness, component.role, componentIndex, `${label} 顶带`);
          push(-bandThickness, y, -bandThickness, L + bandThickness * 2, band, bandThickness, component.role, componentIndex, `${label} 底带`);
        });
        return;
      }
      const band = Math.max(1, component.lengthMm);
      const bandThickness = bandT(band);
      const xs = spread(quantity, 0, L, band);
      xs.forEach((x, index) => {
        const label = quantity > 1 ? `${component.name} ${index + 1}` : component.name;
        push(x, -bandThickness, -bandThickness, band, bandThickness, H + bandThickness, component.role, componentIndex, `${label} 前竖带`);
        push(x, W, -bandThickness, band, bandThickness, H + bandThickness, component.role, componentIndex, `${label} 后竖带`);
        push(x, -bandThickness, H, band, W + bandThickness * 2, bandThickness, component.role, componentIndex, `${label} 顶带`);
        push(x, -bandThickness, -bandThickness, band, W + bandThickness * 2, bandThickness, component.role, componentIndex, `${label} 底带`);
      });
      return;
    }
    /*
     * 面板按外轮廓扣减摆放：侧板夹在立柱之间、端板包住侧板，
     * 四边与框架 / 相邻板齐平；板面再按目标板宽拆条，呈现真实拼板。
     */
    if (component.role === 'panel' && component.orientation === 'x') {
      const panelT = Math.max(1, component.widthMm);
      const ys = spread(quantity, frameT, W - frameT, panelT);
      const panelLength = Math.max(1, L - 2 * frameT - 2 * panelT);
      const planks = splitPlanks(panelLength);
      ys.forEach((y) => {
        planks.forEach((plank) => {
          push(
            frameT + panelT + plank.start,
            y,
            baseHeight + bottomT,
            plank.size,
            panelT,
            component.heightMm,
            component.role,
            componentIndex,
            component.name,
          );
        });
      });
      return;
    }
    if (component.role === 'panel') {
      const panelT = Math.max(1, component.widthMm);
      const xs = spread(quantity, frameT, L - frameT, panelT);
      const panelLength = Math.max(1, W - 2 * frameT);
      const planks = splitPlanks(panelLength);
      xs.forEach((x) => {
        planks.forEach((plank) => {
          push(
            x,
            frameT + plank.start,
            baseHeight + bottomT,
            panelT,
            plank.size,
            component.heightMm,
            component.role,
            componentIndex,
            component.name,
          );
        });
      });
      return;
    }
    // 其余构件（木条、垫木、自定义）：居中放在箱体内部，保证可见与可编辑。
    push(
      Math.max(0, (L - component.lengthMm) / 2),
      Math.max(0, (W - component.widthMm) / 2),
      baseHeight + bottomT,
      component.lengthMm,
      component.widthMm,
      component.heightMm,
      component.role,
      componentIndex,
      component.name,
    );
  });

  return {
    pieces,
    L,
    W,
    H,
    topDeckHeight: lidT,
    bottomDeckHeight: bottomT,
    forkPocketHeight: 0,
  };
}

export function validateCrateStructure(components: PalletComponentInput[]): PalletIssue[] {
  const issues: PalletIssue[] = [];
  if (components.length === 0) {
    issues.push({ level: 'error', message: '至少需要一个构件' });
    return issues;
  }
  components.forEach((component) => {
    const name = component.name || '未命名构件';
    if (component.lengthMm <= 0 || component.widthMm <= 0 || component.heightMm <= 0) {
      issues.push({ level: 'error', message: `${name}存在零尺寸或负尺寸` });
    }
    if (component.quantity <= 0) {
      issues.push({ level: 'error', message: `${name}数量必须大于 0` });
    }
  });
  const hasBottom = components.some(
    (component) => component.role === 'bottomDeck' || component.name.includes('底板'),
  );
  const hasLid = components.some(
    (component) => component.role === 'topDeck' || component.name.includes('盖板'),
  );
  const wallQuantity = components
    .filter((component) => component.role === 'panel')
    .reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  if (!hasBottom) {
    issues.push({ level: 'error', message: '木箱缺少底板' });
  }
  if (!hasLid) {
    issues.push({ level: 'error', message: '木箱缺少盖板' });
  }
  if (wallQuantity < 2) {
    issues.push({ level: 'error', message: '木箱至少需要 2 块侧板或端板' });
  }
  return issues;
}
