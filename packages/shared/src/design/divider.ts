import type { PackagingPartInput } from '../packaging.schemas';
import type { PalletComponentInput } from './pallet/schemas';
import type { PalletGeometry, PalletPiece } from './pallet/geometry';
import type { PalletIssue } from './pallet/validation';

// 围板 G 型（product/包装设计.md R-包装设计-021）：
// 配套托盘的箱体围挡，每层 4 块围板（长边 2、宽边 2），层间叠放；
// 不含底板、盖板与滑木，外尺寸与构件由参数派生，几何仍输出 PalletGeometry。

export interface DividerParams {
  /** 内长 */
  innerLengthMm: number;
  /** 内宽 */
  innerWidthMm: number;
  /** 单层高度 */
  layerHeightMm: number;
  /** 层数 1–3 */
  layerCount: number;
  /** 板厚 */
  thicknessMm: number;
  /** 端部搭接宽度 */
  lapWidthMm: number;
  /** 每层铰链数量 0–4 */
  hingeCount: number;
}

export const DIVIDER_DEFAULT_PARAMS: Required<DividerParams> = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  layerHeightMm: 200,
  layerCount: 1,
  thicknessMm: 8,
  lapWidthMm: 30,
  hingeCount: 4,
};

const intOr = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;

const clampInt = (value: number, fallback: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : fallback));

export interface DividerOuterSize {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

/** 外尺寸：长 / 宽 = 内 + 2 × 板厚；高 = 单层高度 × 层数。 */
export function deriveDividerOuter(params: DividerParams): DividerOuterSize {
  const innerLengthMm = intOr(params.innerLengthMm, DIVIDER_DEFAULT_PARAMS.innerLengthMm);
  const innerWidthMm = intOr(params.innerWidthMm, DIVIDER_DEFAULT_PARAMS.innerWidthMm);
  const thicknessMm = intOr(params.thicknessMm, DIVIDER_DEFAULT_PARAMS.thicknessMm);
  const layerHeightMm = intOr(params.layerHeightMm, DIVIDER_DEFAULT_PARAMS.layerHeightMm);
  const layerCount = clampInt(params.layerCount, 1, 1, 3);
  return {
    lengthMm: innerLengthMm + 2 * thicknessMm,
    widthMm: innerWidthMm + 2 * thicknessMm,
    heightMm: layerHeightMm * layerCount,
  };
}

/** 派生围板构件：长围板 / 宽围板按层数，铰链按每层数量。 */
export function deriveDividerParts(params: DividerParams): PackagingPartInput[] {
  const innerLengthMm = intOr(params.innerLengthMm, DIVIDER_DEFAULT_PARAMS.innerLengthMm);
  const innerWidthMm = intOr(params.innerWidthMm, DIVIDER_DEFAULT_PARAMS.innerWidthMm);
  const thicknessMm = intOr(params.thicknessMm, DIVIDER_DEFAULT_PARAMS.thicknessMm);
  const layerHeightMm = intOr(params.layerHeightMm, DIVIDER_DEFAULT_PARAMS.layerHeightMm);
  const layerCount = clampInt(params.layerCount, 1, 1, 3);
  const hingeCount = clampInt(params.hingeCount, DIVIDER_DEFAULT_PARAMS.hingeCount, 0, 4);

  const parts: PackagingPartInput[] = [
    {
      role: 'panel',
      name: '长围板',
      materialCode: 'plywood',
      orientation: 'x',
      lengthMm: innerLengthMm,
      widthMm: thicknessMm,
      heightMm: layerHeightMm,
      quantity: 2 * layerCount,
      wastePct: 0.08,
      processCost: 1.2,
      priceOverride: 0,
    },
    {
      role: 'panel',
      name: '宽围板',
      materialCode: 'plywood',
      orientation: 'y',
      lengthMm: innerWidthMm,
      widthMm: thicknessMm,
      heightMm: layerHeightMm,
      quantity: 2 * layerCount,
      wastePct: 0.08,
      processCost: 1.2,
      priceOverride: 0,
    },
  ];

  if (hingeCount > 0) {
    parts.push({
      role: 'custom',
      name: '铰链',
      materialCode: 'steel-strap',
      orientation: 'x',
      lengthMm: 40,
      widthMm: 20,
      heightMm: 2,
      quantity: hingeCount * layerCount,
      wastePct: 0,
      processCost: 0,
      priceOverride: 0,
    });
  }

  return parts;
}

export interface DividerGeometryProject {
  outerLengthMm: number;
  outerWidthMm: number;
  layerHeightMm: number;
  layerCount: number;
  thicknessMm: number;
}

export function buildDividerGeometry(
  project: DividerGeometryProject,
  components: PalletComponentInput[],
): PalletGeometry {
  const L = Math.max(1, project.outerLengthMm);
  const W = Math.max(1, project.outerWidthMm);
  const layerHeight = Math.max(1, project.layerHeightMm);
  const layerCount = clampInt(project.layerCount, 1, 1, 3);
  const thickness = Math.max(1, project.thicknessMm);
  const H = layerHeight * layerCount;
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
    if (component.role === 'panel' && component.orientation === 'x') {
      for (let layer = 0; layer < layerCount; layer += 1) {
        const z = layer * layerHeight;
        for (let i = 0; i < 2; i += 1) {
          push(
            0,
            i === 0 ? 0 : Math.max(0, W - thickness),
            z,
            L,
            thickness,
            layerHeight,
            component.role,
            componentIndex,
            `${component.name} L${layer + 1}-${i + 1}`,
          );
        }
      }
      return;
    }
    if (component.role === 'panel') {
      for (let layer = 0; layer < layerCount; layer += 1) {
        const z = layer * layerHeight;
        for (let i = 0; i < 2; i += 1) {
          push(
            i === 0 ? 0 : Math.max(0, L - thickness),
            0,
            z,
            thickness,
            W,
            layerHeight,
            component.role,
            componentIndex,
            `${component.name} L${layer + 1}-${i + 1}`,
          );
        }
      }
      return;
    }
    if (component.name.includes('铰链')) {
      const positions: Array<[number, number]> = [
        [0, 0],
        [Math.max(0, L - 40), 0],
        [0, Math.max(0, W - 20)],
        [Math.max(0, L - 40), Math.max(0, W - 20)],
      ];
      const quantity = Math.max(1, Math.round(component.quantity));
      for (let i = 0; i < quantity; i += 1) {
        const layer = Math.floor(i / Math.max(1, Math.round(quantity / layerCount)));
        const [x, y] = positions[i % positions.length]!;
        push(
          x,
          y,
          Math.min(H - 2, (layer + 1) * layerHeight - 2),
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
    push(
      Math.max(0, (L - component.lengthMm) / 2),
      Math.max(0, (W - component.widthMm) / 2),
      0,
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
    topDeckHeight: 0,
    bottomDeckHeight: 0,
    forkPocketHeight: 0,
  };
}

export function validateDividerStructure(
  components: PalletComponentInput[],
  params: Pick<DividerParams, 'layerCount' | 'lapWidthMm' | 'innerLengthMm' | 'innerWidthMm'>,
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
  const layerCount = clampInt(params.layerCount, 1, 1, 3);
  const longQuantity = components
    .filter((component) => component.name === '长围板')
    .reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  const wideQuantity = components
    .filter((component) => component.name === '宽围板')
    .reduce((sum, component) => sum + Math.max(0, component.quantity), 0);
  if (longQuantity < 2 * layerCount || wideQuantity < 2 * layerCount) {
    issues.push({ level: 'error', message: '每层至少需要 2 块长围板与 2 块宽围板' });
  }
  const limit = Math.min(
    Math.max(0, params.innerLengthMm),
    Math.max(0, params.innerWidthMm),
  ) / 2;
  if (params.lapWidthMm > limit) {
    issues.push({ level: 'error', message: '搭接宽度必须小于板长的一半' });
  }
  return issues;
}
