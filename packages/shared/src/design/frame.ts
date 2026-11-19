import type { PackagingPartInput } from '../packaging.schemas';
import type { PalletComponentInput } from '../pallet.schemas';
import type { PalletGeometry, PalletPiece } from '../pallet.geometry';
import type { PalletIssue } from '../pallet.validation';

// 框架箱 G 型（product/包装设计.md R-包装设计-020）：
// 以滑木底座 + 底板 + 四角立柱 + 上下框梁承力，面板与盖板可选；
// 外尺寸与构件由参数派生，几何输出仍使用 PalletGeometry，与托盘 / 木箱共用渲染链。

export type FramePanelCoverage = 'none' | 'sides' | 'full';

export interface FrameParams {
  /** 内长 */
  innerLengthMm: number;
  /** 内宽 */
  innerWidthMm: number;
  /** 内高 */
  innerHeightMm: number;
  /** 框架厚度：立柱与框梁截面 */
  frameThicknessMm: number;
  /** 底板厚 */
  bottomThicknessMm: number;
  /** 底部支承高度（滑木高度） */
  baseHeightMm: number;
  /** 滑木宽度，默认 90 */
  runnerWidthMm?: number;
  /** 面板厚；0 表示无面板 */
  panelThicknessMm: number;
  /** 面板覆盖：无 / 侧端 / 全包 */
  panelCoverage?: FramePanelCoverage;
  /** 盖板开关 */
  hasLid?: boolean;
  /** 钢带道数；0 表示不配 */
  steelStrapCount?: number;
}

export const FRAME_DEFAULT_PARAMS: Required<FrameParams> = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  innerHeightMm: 900,
  frameThicknessMm: 90,
  bottomThicknessMm: 15,
  baseHeightMm: 90,
  runnerWidthMm: 90,
  panelThicknessMm: 15,
  panelCoverage: 'none',
  hasLid: true,
  steelStrapCount: 0,
};

const intOr = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;

const atLeastZero = (value: number | undefined, fallback: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.round(value as number)) : fallback;

export interface FrameOuterSize {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

const coverageOf = (params: FrameParams): FramePanelCoverage =>
  params.panelCoverage === 'sides' || params.panelCoverage === 'full'
    ? params.panelCoverage
    : 'none';

/** 外尺寸派生：长 / 宽 = 内 + 2 × 框架 +（有面板时 2 × 面板厚）；高 = 滑木 + 底板 + 内高 + 框架 +（盖板厚）。 */
export function deriveFrameOuter(params: FrameParams): FrameOuterSize {
  const innerLengthMm = intOr(params.innerLengthMm, FRAME_DEFAULT_PARAMS.innerLengthMm);
  const innerWidthMm = intOr(params.innerWidthMm, FRAME_DEFAULT_PARAMS.innerWidthMm);
  const innerHeightMm = intOr(params.innerHeightMm, FRAME_DEFAULT_PARAMS.innerHeightMm);
  const frameThicknessMm = intOr(params.frameThicknessMm, FRAME_DEFAULT_PARAMS.frameThicknessMm);
  const bottomThicknessMm = intOr(params.bottomThicknessMm, FRAME_DEFAULT_PARAMS.bottomThicknessMm);
  const baseHeightMm = intOr(params.baseHeightMm, FRAME_DEFAULT_PARAMS.baseHeightMm);
  const panelThicknessMm = atLeastZero(params.panelThicknessMm, FRAME_DEFAULT_PARAMS.panelThicknessMm);
  const hasPanels = coverageOf(params) !== 'none';
  const includeLid = params.hasLid !== false || coverageOf(params) === 'full';
  const lidThicknessMm = includeLid ? panelThicknessMm : 0;
  const panelOuter = hasPanels ? 2 * panelThicknessMm : 0;
  return {
    lengthMm: innerLengthMm + 2 * frameThicknessMm + panelOuter,
    widthMm: innerWidthMm + 2 * frameThicknessMm + panelOuter,
    heightMm: baseHeightMm + bottomThicknessMm + innerHeightMm + frameThicknessMm + lidThicknessMm,
  };
}

/** 由参数派生框架箱构件；面板与盖板按覆盖与开关生成。 */
export function deriveFrameParts(params: FrameParams): PackagingPartInput[] {
  const innerLengthMm = intOr(params.innerLengthMm, FRAME_DEFAULT_PARAMS.innerLengthMm);
  const innerWidthMm = intOr(params.innerWidthMm, FRAME_DEFAULT_PARAMS.innerWidthMm);
  const innerHeightMm = intOr(params.innerHeightMm, FRAME_DEFAULT_PARAMS.innerHeightMm);
  const frameThicknessMm = intOr(params.frameThicknessMm, FRAME_DEFAULT_PARAMS.frameThicknessMm);
  const bottomThicknessMm = intOr(params.bottomThicknessMm, FRAME_DEFAULT_PARAMS.bottomThicknessMm);
  const baseHeightMm = intOr(params.baseHeightMm, FRAME_DEFAULT_PARAMS.baseHeightMm);
  const runnerWidthMm = intOr(params.runnerWidthMm ?? 90, 90);
  const panelThicknessMm = atLeastZero(params.panelThicknessMm, FRAME_DEFAULT_PARAMS.panelThicknessMm);
  const coverage = coverageOf(params);
  const hasLid = params.hasLid !== false || coverage === 'full';
  const steelStrapCount = Math.max(0, Math.min(4, Math.round(params.steelStrapCount ?? 0)));
  const outer = deriveFrameOuter(params);
  const beamLengthMm = innerLengthMm + 2 * frameThicknessMm;
  const beamWidthMm = innerWidthMm;

  const parts: PackagingPartInput[] = [
    {
      role: 'runner',
      name: '滑木',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: outer.lengthMm,
      widthMm: runnerWidthMm,
      heightMm: baseHeightMm,
      quantity: 3,
      wastePct: 0.1,
      processCost: 4,
      priceOverride: 0,
    },
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
    },
    {
      role: 'frame',
      name: '上框梁',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: beamLengthMm,
      widthMm: frameThicknessMm,
      heightMm: frameThicknessMm,
      quantity: 2,
      wastePct: 0.08,
      processCost: 2,
      priceOverride: 0,
    },
    {
      role: 'frame',
      name: '下框梁',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: beamLengthMm,
      widthMm: frameThicknessMm,
      heightMm: frameThicknessMm,
      quantity: 2,
      wastePct: 0.08,
      processCost: 2,
      priceOverride: 0,
    },
    {
      role: 'frame',
      name: '侧框梁',
      materialCode: 'pine',
      orientation: 'y',
      lengthMm: beamWidthMm,
      widthMm: frameThicknessMm,
      heightMm: frameThicknessMm,
      quantity: 2,
      wastePct: 0.08,
      processCost: 2,
      priceOverride: 0,
    },
  ];

  if (coverage !== 'none' && panelThicknessMm > 0) {
    parts.push(
      {
        role: 'panel',
        name: '侧板',
        materialCode: 'pine',
        orientation: 'x',
        lengthMm: innerLengthMm,
        widthMm: panelThicknessMm,
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
        lengthMm: innerWidthMm,
        widthMm: panelThicknessMm,
        heightMm: innerHeightMm,
        quantity: 2,
        wastePct: 0.08,
        processCost: 1.2,
        priceOverride: 0,
      },
    );
  }

  if (hasLid && panelThicknessMm > 0) {
    parts.push({
      role: 'topDeck',
      name: '盖板',
      materialCode: 'pine',
      orientation: 'x',
      lengthMm: outer.lengthMm,
      widthMm: outer.widthMm,
      heightMm: panelThicknessMm,
      quantity: 1,
      wastePct: 0.08,
      processCost: 1.5,
      priceOverride: 0,
    });
  }

  if (steelStrapCount > 0) {
    parts.push({
      role: 'steelStrap',
      name: '钢带',
      materialCode: 'steel-strap',
      orientation: 'x',
      lengthMm: 30,
      widthMm: outer.widthMm,
      heightMm: 1,
      quantity: steelStrapCount,
      wastePct: 0,
      processCost: 0,
      priceOverride: 0,
    });
  }

  return parts;
}

export interface FrameGeometryProject {
  outerLengthMm: number;
  outerWidthMm: number;
  innerHeightMm: number;
  frameThicknessMm: number;
  bottomThicknessMm: number;
  baseHeightMm: number;
  outerHeightMm: number;
}

const maxHeight = (parts: PalletComponentInput[], fallback: number): number =>
  parts.length === 0 ? fallback : Math.max(...parts.map((part) => Math.max(0, part.heightMm)));

const spread = (count: number, start: number, end: number, size: number): number[] => {
  const q = Math.max(1, Math.round(count));
  const safeEnd = Math.max(start, end - size);
  return Array.from({ length: q }, (_, index) =>
    q === 1 ? (end - size) / 2 : start + (index * (safeEnd - start)) / (q - 1),
  );
};

export function buildFrameGeometry(
  project: FrameGeometryProject,
  components: PalletComponentInput[],
): PalletGeometry {
  const L = Math.max(1, project.outerLengthMm);
  const W = Math.max(1, project.outerWidthMm);
  const innerH = Math.max(1, project.innerHeightMm);
  const baseHeight = Math.max(
    0,
    project.baseHeightMm,
    maxHeight(
      components.filter((component) => component.role === 'runner'),
      0,
    ),
  );
  const bottomT = Math.max(
    0,
    project.bottomThicknessMm,
    maxHeight(
      components.filter((component) => component.role === 'bottomDeck'),
      project.bottomThicknessMm,
    ),
  );
  const frameT = Math.max(
    0,
    project.frameThicknessMm,
    components
      .filter((component) => component.role === 'frame')
      .reduce((max, component) => Math.max(max, component.widthMm), 0),
  );
  const H = Math.max(project.outerHeightMm, baseHeight + bottomT + innerH + frameT);
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
      const z = baseHeight + bottomT + innerH + frameT;
      const h = Math.min(component.heightMm, Math.max(0, H - z));
      push(0, 0, z, L, W, h, component.role, componentIndex, component.name);
      return;
    }
    if (component.name.includes('立柱')) {
      const positions: Array<[number, number]> = [
        [0, 0],
        [Math.max(0, L - frameT), 0],
        [0, Math.max(0, W - frameT)],
        [Math.max(0, L - frameT), Math.max(0, W - frameT)],
      ];
      for (let i = 0; i < quantity; i += 1) {
        const [x, y] = positions[i % positions.length]!;
        push(
          x,
          y,
          baseHeight + bottomT,
          frameT,
          frameT,
          component.heightMm,
          component.role,
          componentIndex,
          `${component.name} ${i + 1}`,
        );
      }
      return;
    }
    if (component.name.includes('上框梁') || component.name.includes('下框梁')) {
      const z = component.name.includes('上框梁')
        ? baseHeight + bottomT + innerH
        : baseHeight + bottomT;
      for (let i = 0; i < quantity; i += 1) {
        const y = i % 2 === 0 ? 0 : Math.max(0, W - frameT);
        push(
          0,
          y,
          z,
          component.lengthMm,
          frameT,
          frameT,
          component.role,
          componentIndex,
          `${component.name} ${i + 1}`,
        );
      }
      return;
    }
    if (component.name.includes('侧框梁')) {
      const z = baseHeight + bottomT + innerH;
      for (let i = 0; i < quantity; i += 1) {
        const x = i % 2 === 0 ? 0 : Math.max(0, L - frameT);
        push(
          x,
          frameT,
          z,
          frameT,
          component.lengthMm,
          frameT,
          component.role,
          componentIndex,
          `${component.name} ${i + 1}`,
        );
      }
      return;
    }
    if (component.role === 'panel' && component.orientation === 'x') {
      const panelT = Math.max(0, component.widthMm);
      for (let i = 0; i < quantity; i += 1) {
        const y = i % 2 === 0 ? 0 : Math.max(0, W - panelT);
        push(
          frameT,
          y,
          baseHeight + bottomT,
          component.lengthMm,
          panelT,
          component.heightMm,
          component.role,
          componentIndex,
          quantity > 1 ? `${component.name} ${i + 1}` : component.name,
        );
      }
      return;
    }
    if (component.role === 'panel') {
      const panelT = Math.max(0, component.widthMm);
      for (let i = 0; i < quantity; i += 1) {
        const x = i % 2 === 0 ? 0 : Math.max(0, L - panelT);
        push(
          x,
          frameT,
          baseHeight + bottomT,
          panelT,
          component.lengthMm,
          component.heightMm,
          component.role,
          componentIndex,
          quantity > 1 ? `${component.name} ${i + 1}` : component.name,
        );
      }
      return;
    }
    if (component.role === 'steelStrap') {
      const xs = spread(quantity, 0, L, component.lengthMm);
      xs.forEach((x, index) => {
        push(
          x,
          0,
          0,
          component.lengthMm,
          W,
          H,
          component.role,
          componentIndex,
          quantity > 1 ? `${component.name} ${index + 1}` : component.name,
        );
      });
      return;
    }
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
    topDeckHeight: components
      .filter((component) => component.role === 'topDeck')
      .reduce((max, component) => Math.max(max, component.heightMm), 0),
    bottomDeckHeight: bottomT,
    forkPocketHeight: 0,
  };
}

export function validateFrameStructure(
  components: PalletComponentInput[],
  params: Pick<FrameParams, 'panelCoverage' | 'hasLid'> = {},
): PalletIssue[] {
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
  const quantityOf = (name: string): number =>
    components
      .filter((component) => component.name === name)
      .reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  if (quantityOf('立柱') < 4) {
    issues.push({ level: 'error', message: '框架箱至少需要 4 根立柱' });
  }
  if (quantityOf('上框梁') < 2) {
    issues.push({ level: 'error', message: '框架箱至少需要 2 根上框梁' });
  }
  if (quantityOf('下框梁') < 2) {
    issues.push({ level: 'error', message: '框架箱至少需要 2 根下框梁' });
  }
  const coverage = params.panelCoverage ?? 'none';
  const panelQuantity = components
    .filter((component) => component.role === 'panel')
    .reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  if (coverage !== 'none' && panelQuantity < 4) {
    issues.push({ level: 'error', message: '面板覆盖非「无」时需要 4 块侧板 / 端板' });
  }
  const hasLid = params.hasLid !== false || coverage === 'full';
  const lidQuantity = components
    .filter((component) => component.role === 'topDeck')
    .reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  if (hasLid && lidQuantity < 1) {
    issues.push({ level: 'error', message: '盖板开关为「有」时需要盖板构件' });
  }
  return issues;
}
