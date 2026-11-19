import type { DrawingEntity, DrawingLayer, DrawingSheet } from './drawing';

// DXF R12 渲染器（design/包装设计.md §4.3 / ADR-013）：
// 消费同一份图元模型，输出 AutoCAD 可打开的 ASCII DXF；不依赖任何图形库。
// R12 不支持 LWPOLYLINE，因此矩形与多段线统一拆成 LINE。

const LAYER_COLORS: Record<DrawingLayer, number> = {
  OUTLINE: 7,
  HIDDEN: 8,
  DIM: 3,
  TEXT: 2,
  FRAME: 7,
  TITLE: 7,
};

const LAYER_LINETYPES: Record<DrawingLayer, string> = {
  OUTLINE: 'CONTINUOUS',
  HIDDEN: 'DASHED',
  DIM: 'CONTINUOUS',
  TEXT: 'CONTINUOUS',
  FRAME: 'CONTINUOUS',
  TITLE: 'CONTINUOUS',
};

const LAYERS: DrawingLayer[] = ['OUTLINE', 'HIDDEN', 'DIM', 'TEXT', 'FRAME', 'TITLE'];

const pair = (code: number | string, value: string | number): string => `${code}\n${value}\n`;
const num = (value: number): string => Number(value.toFixed(4)).toString();

const lineEntity = (layer: DrawingLayer, x1: number, y1: number, x2: number, y2: number): string =>
  pair(0, 'LINE') +
  pair(8, layer) +
  pair(10, num(x1)) +
  pair(20, num(y1)) +
  pair(30, 0) +
  pair(11, num(x2)) +
  pair(21, num(y2)) +
  pair(31, 0);

const rectEntity = (layer: DrawingLayer, x: number, y: number, w: number, h: number): string =>
  [
    lineEntity(layer, x, y, x + w, y),
    lineEntity(layer, x + w, y, x + w, y + h),
    lineEntity(layer, x + w, y + h, x, y + h),
    lineEntity(layer, x, y + h, x, y),
  ].join('');

const textEntity = (
  layer: DrawingLayer,
  x: number,
  y: number,
  value: string,
  size: number,
  anchor?: 'start' | 'middle' | 'end',
): string => {
  const base =
    pair(0, 'TEXT') +
    pair(8, layer) +
    pair(10, num(x)) +
    pair(20, num(y)) +
    pair(30, 0) +
    pair(40, num(size)) +
    pair(1, value.replaceAll('\n', ' '));
  if (!anchor || anchor === 'start') {
    return base;
  }
  return base + pair(72, anchor === 'middle' ? 1 : 2) + pair(11, num(x)) + pair(21, num(y)) + pair(31, 0);
};

const entityToDxf = (entity: DrawingEntity): string => {
  if (entity.kind === 'line') {
    return lineEntity(entity.layer, entity.x1, entity.y1, entity.x2, entity.y2);
  }
  if (entity.kind === 'rect') {
    return rectEntity(entity.layer, entity.x, entity.y, entity.w, entity.h);
  }
  if (entity.kind === 'polyline') {
    const points = [...entity.points];
    if (points.length > 2) {
      points.push(points[0]!);
    }
    return points
      .slice(0, -1)
      .map((point, index) => {
        const next = points[index + 1]!;
        return lineEntity(entity.layer, point[0], point[1], next[0], next[1]);
      })
      .join('');
  }
  if (entity.kind === 'text') {
    return textEntity(entity.layer, entity.x, entity.y, entity.text, entity.size, entity.anchor);
  }
  const midX = (entity.x1 + entity.x2) / 2;
  const midY = (entity.y1 + entity.y2) / 2;
  const horizontal = Math.abs(entity.y1 - entity.y2) < 0.001;
  const textX = horizontal ? midX : midX + entity.offset;
  const textY = horizontal ? midY - entity.offset : midY;
  return (
    lineEntity('DIM', entity.x1, entity.y1, entity.x2, entity.y2) +
    textEntity('DIM', textX, textY, entity.text, 3, horizontal ? 'middle' : 'start')
  );
};

const table = (name: string, count: number, entries: string): string =>
  pair(0, 'TABLE') + pair(2, name) + pair(70, count) + entries + pair(0, 'ENDTAB');

const ltypeTable = (): string =>
  table(
    'LTYPE',
    2,
    pair(0, 'LTYPE') +
      pair(2, 'CONTINUOUS') +
      pair(70, 0) +
      pair(3, 'Solid line') +
      pair(72, 65) +
      pair(73, 0) +
      pair(40, 0) +
      pair(0, 'LTYPE') +
      pair(2, 'DASHED') +
      pair(70, 0) +
      pair(3, 'Dashed') +
      pair(72, 65) +
      pair(73, 2) +
      pair(40, 6) +
      pair(49, 3) +
      pair(49, -3),
  );

const layerTable = (): string =>
  table(
    'LAYER',
    LAYERS.length,
    LAYERS.map(
      (layer) =>
        pair(0, 'LAYER') +
        pair(2, layer) +
        pair(70, 0) +
        pair(62, LAYER_COLORS[layer]) +
        pair(6, LAYER_LINETYPES[layer]),
    ).join(''),
  );

export function drawingToDxf(sheet: DrawingSheet): string {
  const header =
    pair(0, 'SECTION') +
    pair(2, 'HEADER') +
    pair(9, '$ACADVER') +
    pair(1, 'AC1009') +
    pair(9, '$INSUNITS') +
    pair(70, 4) +
    pair(0, 'ENDSEC');

  const tables =
    pair(0, 'SECTION') +
    pair(2, 'TABLES') +
    ltypeTable() +
    layerTable() +
    pair(0, 'ENDSEC');

  const entities =
    pair(0, 'SECTION') + pair(2, 'ENTITIES') + sheet.entities.map(entityToDxf).join('') + pair(0, 'ENDSEC');

  return header + tables + entities + pair(0, 'EOF');
}
