import type { PalletComponentInput, PalletComponentRole, PalletTemplateType } from './pallet.schemas';

// 托盘几何（design/包装设计.md §4.1 / §4.2）：
// 构件 → 3D 盒子；2D 视图只做投影映射，不碰 DOM；前端 SVG 与 Three.js 共用本文件。

export interface PalletGeometryProject {
  lengthMm: number;
  widthMm: number;
  templateType: PalletTemplateType;
}

export interface PalletPiece {
  x: number;
  y: number;
  z: number;
  l: number;
  w: number;
  h: number;
  role: PalletComponentRole;
  componentIndex: number;
  label: string;
}

export interface PalletGeometry {
  pieces: PalletPiece[];
  L: number;
  W: number;
  H: number;
  topDeckHeight: number;
  bottomDeckHeight: number;
  forkPocketHeight: number;
}

const positive = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

export function buildPalletGeometry(
  project: PalletGeometryProject,
  components: PalletComponentInput[],
): PalletGeometry {
  const L = positive(project.lengthMm);
  const W = positive(project.widthMm);
  const heights = components.map((component) => positive(component.heightMm));
  const H = heights.reduce((sum, height) => sum + height, 0);
  const pieces: PalletPiece[] = [];

  components.forEach((component, componentIndex) => {
    const q = Math.max(1, Math.round(positive(component.quantity)));
    const l = positive(component.lengthMm);
    const w = positive(component.widthMm);
    const h = positive(component.heightMm);
    const z = heights.slice(componentIndex + 1).reduce((sum, height) => sum + height, 0);

    if (component.role === 'block') {
      const cols = Math.ceil(Math.sqrt(q));
      const rows = Math.ceil(q / cols);
      for (let i = 0; i < q; i += 1) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = cols === 1 ? (L - l) / 2 : (col * Math.max(0, L - l)) / (cols - 1);
        const y = rows === 1 ? (W - w) / 2 : (row * Math.max(0, W - w)) / (rows - 1);
        pieces.push({
          x,
          y,
          z,
          l,
          w,
          h,
          role: component.role,
          componentIndex,
          label: q > 1 ? `${component.name} ${i + 1}` : component.name,
        });
      }
      return;
    }

    if (component.orientation === 'y') {
      // 构件沿宽度方向铺设：几何 x 尺寸 = 板宽，y 尺寸 = 构件长度；沿 x 均分。
      const pieceL = w;
      const pieceW = l;
      for (let i = 0; i < q; i += 1) {
        const x = q === 1 ? (L - pieceL) / 2 : (i * Math.max(0, L - pieceL)) / (q - 1);
        pieces.push({
          x,
          y: 0,
          z,
          l: pieceL,
          w: pieceW,
          h,
          role: component.role,
          componentIndex,
          label: q > 1 ? `${component.name} ${i + 1}` : component.name,
        });
      }
      return;
    }

    // 沿长度方向铺设：沿 y 均分。
    for (let i = 0; i < q; i += 1) {
      const y = q === 1 ? (W - w) / 2 : (i * Math.max(0, W - w)) / (q - 1);
      pieces.push({
        x: 0,
        y,
        z,
        l,
        w,
        h,
        role: component.role,
        componentIndex,
        label: q > 1 ? `${component.name} ${i + 1}` : component.name,
      });
    }
  });

  const topDeckHeight = Math.max(
    0,
    ...components
      .filter((component) => ['topDeck', 'endDeck', 'plywood'].includes(component.role))
      .map((component) => positive(component.heightMm)),
  );
  const bottomDeckHeight = Math.max(
    0,
    ...components
      .filter((component) => component.role === 'bottomDeck')
      .map((component) => positive(component.heightMm)),
  );

  return {
    pieces,
    L,
    W,
    H,
    topDeckHeight,
    bottomDeckHeight,
    forkPocketHeight: Math.max(0, H - topDeckHeight - bottomDeckHeight),
  };
}

export type PalletView = 'top' | 'front' | 'side';

export interface PalletRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function projectPalletPiece(piece: PalletPiece, view: PalletView, totalHeight: number): PalletRect {
  if (view === 'top') {
    return { x: piece.x, y: piece.y, w: piece.l, h: piece.w };
  }
  if (view === 'front') {
    return { x: piece.x, y: totalHeight - piece.z - piece.h, w: piece.l, h: piece.h };
  }
  return { x: piece.y, y: totalHeight - piece.z - piece.h, w: piece.w, h: piece.h };
}

export function sortPiecesForView(pieces: PalletPiece[], view: PalletView): PalletPiece[] {
  if (view === 'top') {
    return [...pieces].sort((a, b) => a.z - b.z);
  }
  return [...pieces].sort((a, b) => a.y - b.y || a.x - b.x);
}

export interface PalletIsoPoint {
  u: number;
  v: number;
}

/** 标准 30° 轴测投影：u 为水平方向，v 为屏幕向下方向。 */
export function projectIsometricPoint(x: number, y: number, z: number): PalletIsoPoint {
  return { u: (x - y) * 0.866, v: (x + y) * 0.5 - z };
}

export function sortPiecesForIsometric(pieces: PalletPiece[]): PalletPiece[] {
  return [...pieces].sort((a, b) => a.z - b.z || a.x + a.y - (b.x + b.y));
}

export function isNotchedStringer(piece: PalletPiece): boolean {
  return piece.role === 'stringer' && piece.label.includes('开槽');
}
