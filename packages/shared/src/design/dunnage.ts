import type { PackagingPartInput } from '../packaging.schemas';
import type { PalletComponentInput } from './pallet/schemas';
import type { PalletGeometry, PalletPiece } from './pallet/geometry';
import type { PalletIssue } from './pallet/validation';

// 垫木 G 型（product/包装设计.md R-包装设计-022）：
// 支撑 / 隔离 / 加固用的梁件，没有箱体与围挡；平行或交叉排列，
// 外尺寸与构件由参数派生，几何仍输出 PalletGeometry。

export type DunnageArrangement = 'parallel' | 'cross';

export interface DunnageParams {
  /** 单根长度 */
  lengthMm: number;
  /** 单根宽度 */
  widthMm: number;
  /** 单根厚度 */
  thicknessMm: number;
  /** 数量 1–20 */
  quantity: number;
  /** 排列：平行 / 交叉 */
  arrangement?: DunnageArrangement;
}

export const DUNNAGE_DEFAULT_PARAMS: Required<DunnageParams> = {
  lengthMm: 1200,
  widthMm: 90,
  thicknessMm: 90,
  quantity: 3,
  arrangement: 'parallel',
};

const intOr = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;

const clampInt = (value: number, fallback: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : fallback));

export interface DunnageOuterSize {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

const arrangementOf = (params: DunnageParams): DunnageArrangement =>
  params.arrangement === 'cross' ? 'cross' : 'parallel';

/** 外尺寸：平行 = 长 ×（数量 × 宽）× 厚；交叉 = 长 × 宽 ×（2 × 厚）。 */
export function deriveDunnageOuter(params: DunnageParams): DunnageOuterSize {
  const lengthMm = intOr(params.lengthMm, DUNNAGE_DEFAULT_PARAMS.lengthMm);
  const widthMm = intOr(params.widthMm, DUNNAGE_DEFAULT_PARAMS.widthMm);
  const thicknessMm = intOr(params.thicknessMm, DUNNAGE_DEFAULT_PARAMS.thicknessMm);
  const quantity = clampInt(params.quantity, 3, 1, 20);
  return arrangementOf(params) === 'cross'
    ? { lengthMm, widthMm, heightMm: 2 * thicknessMm }
    : { lengthMm, widthMm: quantity * widthMm, heightMm: thicknessMm };
}

/** 派生垫木构件：平行为一组，交叉为上下两组。 */
export function deriveDunnageParts(params: DunnageParams): PackagingPartInput[] {
  const lengthMm = intOr(params.lengthMm, DUNNAGE_DEFAULT_PARAMS.lengthMm);
  const widthMm = intOr(params.widthMm, DUNNAGE_DEFAULT_PARAMS.widthMm);
  const thicknessMm = intOr(params.thicknessMm, DUNNAGE_DEFAULT_PARAMS.thicknessMm);
  const quantity = clampInt(params.quantity, 3, 1, 20);
  const base = {
    role: 'dunnage' as const,
    materialCode: 'pine',
    lengthMm,
    widthMm,
    heightMm: thicknessMm,
    quantity,
    wastePct: 0.1,
    processCost: 1,
    priceOverride: 0,
  };
  if (arrangementOf(params) === 'cross') {
    return [
      { ...base, name: '垫木（下层）', orientation: 'x' },
      { ...base, name: '垫木（上层）', orientation: 'y' },
    ];
  }
  return [{ ...base, name: '垫木', orientation: 'x' }];
}

export interface DunnageGeometryProject {
  outerLengthMm: number;
  outerWidthMm: number;
  outerHeightMm: number;
  arrangement: DunnageArrangement;
}

const spread = (count: number, start: number, end: number, size: number): number[] => {
  const q = Math.max(1, Math.round(count));
  const safeEnd = Math.max(start, end - size);
  return Array.from({ length: q }, (_, index) =>
    q === 1 ? (end - size) / 2 : start + (index * (safeEnd - start)) / (q - 1),
  );
};

export function buildDunnageGeometry(
  project: DunnageGeometryProject,
  components: PalletComponentInput[],
): PalletGeometry {
  const L = Math.max(1, project.outerLengthMm);
  const W = Math.max(1, project.outerWidthMm);
  const thickness = Math.max(1, components[0]?.heightMm ?? 1);
  const H = project.arrangement === 'cross' ? 2 * thickness : thickness;
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
    const upper = component.name.includes('上层');
    if (project.arrangement === 'cross' && upper) {
      const xs = spread(quantity, 0, L, component.heightMm);
      xs.forEach((x, index) => {
        push(
          x,
          0,
          Math.max(0, H - component.heightMm),
          component.heightMm,
          W,
          component.heightMm,
          component.role,
          componentIndex,
          quantity > 1 ? `${component.name} ${index + 1}` : component.name,
        );
      });
      return;
    }
    if (project.arrangement === 'cross') {
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
    const ys = spread(quantity, 0, W, component.widthMm);
    ys.forEach((y, index) => {
      push(
        0,
        y,
        0,
        component.lengthMm,
        component.widthMm,
        component.heightMm,
        component.role,
        componentIndex,
        quantity > 1 ? `${component.name} ${index + 1}` : component.name,
      );
    });
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

export function validateDunnageStructure(
  components: PalletComponentInput[],
  params: Pick<DunnageParams, 'quantity' | 'arrangement'>,
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
  if (params.arrangement === 'cross' && params.quantity < 2) {
    issues.push({ level: 'error', message: '交叉排列时至少需要 2 根' });
  }
  return issues;
}
