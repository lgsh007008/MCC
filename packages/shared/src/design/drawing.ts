import type { PalletGeometry, PalletPiece } from '../pallet.geometry';

// 图纸模型（design/包装设计.md §4.3）：
// 把几何转成「图幅 + 图框 + 视图 + 图层 + 图元」，SVG / DXF / 打印都消费这份模型。
// 坐标单位统一为 mm（纸张坐标），渲染器只负责映射到像素或 DXF 组码。

export type DrawingLayer = 'OUTLINE' | 'HIDDEN' | 'DIM' | 'TEXT' | 'FRAME' | 'TITLE';

export type DrawingEntity =
  | { kind: 'line'; layer: DrawingLayer; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'rect'; layer: DrawingLayer; x: number; y: number; w: number; h: number }
  | { kind: 'polyline'; layer: DrawingLayer; points: Array<[number, number]> }
  | {
      kind: 'text';
      layer: DrawingLayer;
      x: number;
      y: number;
      text: string;
      size: number;
      anchor?: 'start' | 'middle' | 'end';
    }
  | {
      kind: 'dimension';
      layer: DrawingLayer;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      text: string;
      offset: number;
    };

export type DrawingViewKind = 'top' | 'front' | 'side' | 'iso';

export interface DrawingView {
  kind: DrawingViewKind;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}

export interface DrawingSheet {
  paper: { width: number; height: number; size: 'A3' };
  frame: { x: number; y: number; w: number; h: number };
  titleBlock: { x: number; y: number; w: number; h: number };
  views: DrawingView[];
  entities: DrawingEntity[];
  drawingNo: string;
  scale: number;
  meta: {
    projectCode: string;
    projectName: string;
    customerName: string;
    unitName: string;
    unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP';
    revision: number;
    date: string;
  };
}

export interface DrawingUnitInput {
  projectCode: string;
  projectName: string;
  customerName: string;
  revision: number;
  unitName: string;
  unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP';
  drawingNo: string;
  geometry: PalletGeometry;
  date?: string;
}

const PAPER = { width: 420, height: 297, size: 'A3' as const };
const FRAME = { x: 10, y: 10, w: 400, h: 277 };
const TITLE_BLOCK = { x: 15, y: 247, w: 390, h: 35 };
const VIEW_W = 180;
const VIEW_H = 100;
const SCALE_DENOMS = [5, 10, 20, 25, 50, 100];

const pickScale = (widthMm: number, heightMm: number, viewW: number, viewH: number): number => {
  const availableW = viewW - 16;
  const availableH = viewH - 16;
  return (
    SCALE_DENOMS.find(
      (denom) => widthMm / denom <= availableW && heightMm / denom <= availableH,
    ) ?? 100
  );
};

const pickScaleByFactor = (factor: number): number =>
  SCALE_DENOMS.find((denom) => 1 / denom <= factor) ?? 100;

const isoPoint = (x: number, y: number, z: number): [number, number] => [
  (x - y) * 0.866,
  (x + y) * 0.5 - z,
];

const pieceFaces = (piece: PalletPiece): Array<Array<[number, number]>> => {
  const x1 = piece.x;
  const y1 = piece.y;
  const z1 = piece.z;
  const x2 = piece.x + piece.l;
  const y2 = piece.y + piece.w;
  const z2 = piece.z + piece.h;
  const top: Array<[number, number]> = [
    isoPoint(x1, y1, z2),
    isoPoint(x2, y1, z2),
    isoPoint(x2, y2, z2),
    isoPoint(x1, y2, z2),
  ];
  const front: Array<[number, number]> = [
    isoPoint(x1, y2, z1),
    isoPoint(x2, y2, z1),
    isoPoint(x2, y2, z2),
    isoPoint(x1, y2, z2),
  ];
  const side: Array<[number, number]> = [
    isoPoint(x2, y1, z1),
    isoPoint(x2, y2, z1),
    isoPoint(x2, y2, z2),
    isoPoint(x2, y1, z2),
  ];
  return [top, front, side];
};

const text = (
  layer: DrawingLayer,
  x: number,
  y: number,
  value: string,
  size: number,
  anchor?: 'start' | 'middle' | 'end',
): DrawingEntity => ({ kind: 'text', layer, x, y, text: value, size, anchor });

export function buildUnitDrawingSheets(input: DrawingUnitInput): DrawingSheet[] {
  const { geometry } = input;
  const entities: DrawingEntity[] = [];
  const views: DrawingView[] = [];

  entities.push({ kind: 'rect', layer: 'FRAME', x: FRAME.x, y: FRAME.y, w: FRAME.w, h: FRAME.h });
  entities.push({
    kind: 'rect',
    layer: 'TITLE',
    x: TITLE_BLOCK.x,
    y: TITLE_BLOCK.y,
    w: TITLE_BLOCK.w,
    h: TITLE_BLOCK.h,
  });
  entities.push({
    kind: 'line',
    layer: 'TITLE',
    x1: TITLE_BLOCK.x,
    y1: TITLE_BLOCK.y + 13,
    x2: TITLE_BLOCK.x + TITLE_BLOCK.w,
    y2: TITLE_BLOCK.y + 13,
  });
  entities.push({
    kind: 'line',
    layer: 'TITLE',
    x1: TITLE_BLOCK.x,
    y1: TITLE_BLOCK.y + 24,
    x2: TITLE_BLOCK.x + TITLE_BLOCK.w,
    y2: TITLE_BLOCK.y + 24,
  });
  entities.push({
    kind: 'line',
    layer: 'TITLE',
    x1: TITLE_BLOCK.x + 250,
    y1: TITLE_BLOCK.y + 13,
    x2: TITLE_BLOCK.x + 250,
    y2: TITLE_BLOCK.y + TITLE_BLOCK.h,
  });
  entities.push({
    kind: 'line',
    layer: 'TITLE',
    x1: TITLE_BLOCK.x + 330,
    y1: TITLE_BLOCK.y + 13,
    x2: TITLE_BLOCK.x + 330,
    y2: TITLE_BLOCK.y + TITLE_BLOCK.h,
  });

  const date = input.date ?? new Date().toISOString().slice(0, 10);
  entities.push(text('TITLE', TITLE_BLOCK.x + 5, TITLE_BLOCK.y + 8, '包装方案结构图', 5));
  entities.push(text('TITLE', TITLE_BLOCK.x + 5, TITLE_BLOCK.y + 20, `方案 ${input.projectCode}`, 3));
  entities.push(text('TITLE', TITLE_BLOCK.x + 255, TITLE_BLOCK.y + 20, `图号 ${input.drawingNo}`, 3));
  entities.push(text('TITLE', TITLE_BLOCK.x + 335, TITLE_BLOCK.y + 20, `比例 1:${pickScale(geometry.L, geometry.W, VIEW_W, VIEW_H)}`, 3));
  entities.push(text('TITLE', TITLE_BLOCK.x + 5, TITLE_BLOCK.y + 31, `客户 ${input.customerName || '—'}`, 3));
  entities.push(text('TITLE', TITLE_BLOCK.x + 255, TITLE_BLOCK.y + 31, `单元 ${input.unitName}`, 3));
  entities.push(text('TITLE', TITLE_BLOCK.x + 335, TITLE_BLOCK.y + 31, `版本 R${String(input.revision).padStart(2, '0')}`, 3));
  entities.push(text('TITLE', TITLE_BLOCK.x + 335, TITLE_BLOCK.y + 8, date, 3));

  entities.push(text('TEXT', 15, 236, '单位：mm', 2.5));
  entities.push(text('TEXT', 55, 236, '未注公差按 GB/T 1804-m', 2.5));
  entities.push(text('TEXT', 15, 242, '本图用于方案沟通与备料参考，不构成承载认证。', 2.5));

  // 俯视 / 主视 / 侧视 / 轴测，2×2 布局
  const topView: DrawingView = { kind: 'top', label: '俯视', x: 15, y: 18, w: VIEW_W, h: VIEW_H, scale: pickScale(geometry.L, geometry.W, VIEW_W, VIEW_H) };
  const frontView: DrawingView = { kind: 'front', label: '主视', x: 205, y: 18, w: VIEW_W, h: VIEW_H, scale: pickScale(geometry.L, geometry.H, VIEW_W, VIEW_H) };
  const sideView: DrawingView = { kind: 'side', label: '侧视', x: 15, y: 128, w: VIEW_W, h: VIEW_H, scale: pickScale(geometry.W, geometry.H, VIEW_W, VIEW_H) };

  const isoPoints = geometry.pieces.flatMap((piece) => pieceFaces(piece).flat());
  const isoMinX = Math.min(...isoPoints.map(([u]) => u));
  const isoMaxX = Math.max(...isoPoints.map(([u]) => u));
  const isoMinY = Math.min(...isoPoints.map(([, v]) => v));
  const isoMaxY = Math.max(...isoPoints.map(([, v]) => v));
  const isoWidth = Math.max(1, isoMaxX - isoMinX);
  const isoHeight = Math.max(1, isoMaxY - isoMinY);
  const isoFactor = Math.min((VIEW_W - 16) / isoWidth, (VIEW_H - 16) / isoHeight);
  const isoView: DrawingView = { kind: 'iso', label: '轴测', x: 205, y: 128, w: VIEW_W, h: VIEW_H, scale: pickScaleByFactor(isoFactor) };

  views.push(topView, frontView, sideView, isoView);

  const topWidth = geometry.L / topView.scale;
  const topHeight = geometry.W / topView.scale;
  const topOriginX = topView.x + (topView.w - topWidth) / 2;
  const topOriginY = topView.y + (topView.h - topHeight) / 2;
  for (const piece of geometry.pieces) {
    entities.push({
      kind: 'rect',
      layer: 'OUTLINE',
      x: topOriginX + piece.x / topView.scale,
      y: topOriginY + piece.y / topView.scale,
      w: piece.l / topView.scale,
      h: piece.w / topView.scale,
    });
  }
  entities.push(text('TEXT', topView.x + topView.w / 2, topView.y + topView.h + 5, topView.label, 3.5, 'middle'));
  entities.push({
    kind: 'dimension',
    layer: 'DIM',
    x1: topOriginX,
    y1: topOriginY + topHeight + 4,
    x2: topOriginX + topWidth,
    y2: topOriginY + topHeight + 4,
    text: `${geometry.L} mm`,
    offset: 2,
  });

  const frontWidth = geometry.L / frontView.scale;
  const frontHeight = geometry.H / frontView.scale;
  const frontOriginX = frontView.x + (frontView.w - frontWidth) / 2;
  const frontOriginY = frontView.y + (frontView.h - frontHeight) / 2;
  for (const piece of geometry.pieces) {
    entities.push({
      kind: 'rect',
      layer: 'OUTLINE',
      x: frontOriginX + piece.x / frontView.scale,
      y: frontOriginY + (geometry.H - piece.z - piece.h) / frontView.scale,
      w: piece.l / frontView.scale,
      h: piece.h / frontView.scale,
    });
  }
  entities.push(text('TEXT', frontView.x + frontView.w / 2, frontView.y + frontView.h + 5, frontView.label, 3.5, 'middle'));
  entities.push({
    kind: 'dimension',
    layer: 'DIM',
    x1: frontOriginX + frontWidth + 4,
    y1: frontOriginY,
    x2: frontOriginX + frontWidth + 4,
    y2: frontOriginY + frontHeight,
    text: `${geometry.H} mm`,
    offset: 2,
  });

  const sideWidth = geometry.W / sideView.scale;
  const sideHeight = geometry.H / sideView.scale;
  const sideOriginX = sideView.x + (sideView.w - sideWidth) / 2;
  const sideOriginY = sideView.y + (sideView.h - sideHeight) / 2;
  for (const piece of geometry.pieces) {
    entities.push({
      kind: 'rect',
      layer: 'OUTLINE',
      x: sideOriginX + piece.y / sideView.scale,
      y: sideOriginY + (geometry.H - piece.z - piece.h) / sideView.scale,
      w: piece.w / sideView.scale,
      h: piece.h / sideView.scale,
    });
  }
  entities.push(text('TEXT', sideView.x + sideView.w / 2, sideView.y + sideView.h + 5, sideView.label, 3.5, 'middle'));
  entities.push({
    kind: 'dimension',
    layer: 'DIM',
    x1: sideOriginX + sideWidth + 4,
    y1: sideOriginY,
    x2: sideOriginX + sideWidth + 4,
    y2: sideOriginY + sideHeight,
    text: `${geometry.H} mm`,
    offset: 2,
  });

  const isoScale = isoView.scale;
  const isoOriginX = isoView.x + (isoView.w - isoWidth / isoScale) / 2 - isoMinX / isoScale;
  const isoOriginY = isoView.y + (isoView.h - isoHeight / isoScale) / 2 - isoMinY / isoScale;
  for (const piece of geometry.pieces.slice().sort((a, b) => a.z + a.x + a.y - (b.z + b.x + b.y))) {
    for (const face of pieceFaces(piece)) {
      entities.push({
        kind: 'polyline',
        layer: 'OUTLINE',
        points: face.map(([u, v]) => [isoOriginX + u / isoScale, isoOriginY + v / isoScale]),
      });
    }
  }
  entities.push(text('TEXT', isoView.x + isoView.w / 2, isoView.y + isoView.h + 5, isoView.label, 3.5, 'middle'));

  return [
    {
      paper: PAPER,
      frame: FRAME,
      titleBlock: TITLE_BLOCK,
      views,
      entities,
      drawingNo: input.drawingNo,
      scale: topView.scale,
      meta: {
        projectCode: input.projectCode,
        projectName: input.projectName,
        customerName: input.customerName,
        unitName: input.unitName,
        unitType: input.unitType,
        revision: input.revision,
        date,
      },
    },
  ];
}
