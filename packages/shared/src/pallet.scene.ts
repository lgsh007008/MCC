import { isNotchedStringer, type PalletPiece } from './pallet.geometry';
import { PALLET_ROLE_COLORS } from './pallet.templates';

// 3D 场景描述（design/托盘设计.md §3.3）：只产出 mesh 数据，不依赖 Three.js。
// 前端 Three.js 组件按 kind 创建 BoxGeometry 或开槽纵梁的 ExtrudeGeometry。

export type PalletMesh =
  | {
      kind: 'box';
      center: [number, number, number];
      size: [number, number, number];
      color: string;
      componentIndex: number;
    }
  | {
      kind: 'notchedStringer';
      center: [number, number, number];
      size: [number, number, number];
      notchWidth: number;
      notchHeight: number;
      color: string;
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
        componentIndex: piece.componentIndex,
      };
    }
    return { kind: 'box', center, size, color, componentIndex: piece.componentIndex };
  });
}
