import { isNotchedStringer, type PalletPiece } from './pallet.geometry';
import type { PalletComponentRole } from './pallet.schemas';
import { PALLET_ROLE_COLORS } from './pallet.templates';

// 3D 场景描述（design/包装设计.md §4.4）：只产出 mesh 数据，不依赖 Three.js。
// 前端 Three.js 组件按 kind 创建 BoxGeometry 或开槽纵梁的 ExtrudeGeometry，
// 按 role 选择材质（木质 / 钢带）。

export type PalletMesh =
  | {
      kind: 'box';
      center: [number, number, number];
      size: [number, number, number];
      color: string;
      role: PalletComponentRole;
      componentIndex: number;
    }
  | {
      kind: 'notchedStringer';
      center: [number, number, number];
      size: [number, number, number];
      notchWidth: number;
      notchHeight: number;
      color: string;
      role: PalletComponentRole;
      componentIndex: number;
    };

export function buildPalletScene(pieces: PalletPiece[]): PalletMesh[] {
  return pieces.map((piece) => {
    const center: [number, number, number] = [
      piece.x + piece.l / 2,
      piece.y + piece.w / 2,
      piece.z + piece.h / 2,
    ];
    const size: [number, number, number] = [piece.l, piece.w, piece.h];
    const color = PALLET_ROLE_COLORS[piece.role] ?? '#9eaa9f';
    if (isNotchedStringer(piece)) {
      return {
        kind: 'notchedStringer',
        center,
        size,
        notchWidth: piece.l * 0.18,
        notchHeight: piece.h * 0.58,
        color,
        role: piece.role,
        componentIndex: piece.componentIndex,
      };
    }
    return {
      kind: 'box',
      center,
      size,
      color,
      role: piece.role,
      componentIndex: piece.componentIndex,
    };
  });
}
