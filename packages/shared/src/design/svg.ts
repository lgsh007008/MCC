import type { DrawingEntity, DrawingLayer, DrawingSheet, DrawingViewKind } from './drawing';

// SVG 渲染器（design/包装设计.md §4.3）：消费图纸模型，输出可下载 / 可打印的 SVG。
// 坐标单位与图纸模型一致（mm），width/height 用 mm，浏览器打印时按实际图幅输出。

const LAYER_STYLE: Record<
  DrawingLayer,
  { stroke: string; width: number; dash?: string; fill: string }
> = {
  OUTLINE: { stroke: '#111111', width: 0.35, fill: 'none' },
  HIDDEN: { stroke: '#777777', width: 0.25, dash: '2 1', fill: 'none' },
  DIM: { stroke: '#1f5fbf', width: 0.25, fill: 'none' },
  TEXT: { stroke: 'none', width: 0, fill: '#111111' },
  FRAME: { stroke: '#111111', width: 0.5, fill: 'none' },
  TITLE: { stroke: '#111111', width: 0.4, fill: '#111111' },
};

const escapeXml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const num = (value: number): string => Number(value.toFixed(3)).toString();

const styleAttrs = (layer: DrawingLayer): string => {
  const style = LAYER_STYLE[layer];
  return [
    `stroke="${style.stroke}"`,
    `stroke-width="${style.width}"`,
    style.dash ? `stroke-dasharray="${style.dash}"` : '',
    `fill="${style.fill}"`,
  ]
    .filter(Boolean)
    .join(' ');
};

const entityToSvg = (entity: DrawingEntity): string => {
  if (entity.kind === 'line') {
    return `<line x1="${num(entity.x1)}" y1="${num(entity.y1)}" x2="${num(entity.x2)}" y2="${num(entity.y2)}" ${styleAttrs(entity.layer)} />`;
  }
  if (entity.kind === 'rect') {
    return `<rect x="${num(entity.x)}" y="${num(entity.y)}" width="${num(entity.w)}" height="${num(entity.h)}" ${styleAttrs(entity.layer)} />`;
  }
  if (entity.kind === 'polyline') {
    const points = entity.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ');
    return `<polyline points="${points}" ${styleAttrs(entity.layer)} />`;
  }
  if (entity.kind === 'text') {
    const anchor = entity.anchor === 'middle' ? 'middle' : entity.anchor === 'end' ? 'end' : 'start';
    return `<text x="${num(entity.x)}" y="${num(entity.y)}" font-size="${num(entity.size)}" font-family="sans-serif" text-anchor="${anchor}" fill="${LAYER_STYLE[entity.layer].fill}">${escapeXml(entity.text)}</text>`;
  }
  const midX = (entity.x1 + entity.x2) / 2;
  const midY = (entity.y1 + entity.y2) / 2;
  const horizontal = Math.abs(entity.y1 - entity.y2) < 0.001;
  const textX = horizontal ? midX : midX + entity.offset;
  const textY = horizontal ? midY - entity.offset : midY;
  return [
    `<line x1="${num(entity.x1)}" y1="${num(entity.y1)}" x2="${num(entity.x2)}" y2="${num(entity.y2)}" ${styleAttrs('DIM')} />`,
    `<text x="${num(textX)}" y="${num(textY)}" font-size="3" font-family="sans-serif" text-anchor="${horizontal ? 'middle' : 'start'}" fill="#1f5fbf">${escapeXml(entity.text)}</text>`,
  ].join('');
};

export function drawingToSvg(sheet: DrawingSheet): string {
  const body = sheet.entities.map(entityToSvg).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheet.paper.width} ${sheet.paper.height}" width="${sheet.paper.width}mm" height="${sheet.paper.height}mm">`,
    `<rect x="0" y="0" width="${sheet.paper.width}" height="${sheet.paper.height}" fill="#ffffff" />`,
    body,
    '</svg>',
  ].join('\n');
}

interface SvgBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const entityBox = (entity: DrawingEntity): SvgBox => {
  if (entity.kind === 'line') {
    return {
      x1: Math.min(entity.x1, entity.x2),
      y1: Math.min(entity.y1, entity.y2),
      x2: Math.max(entity.x1, entity.x2),
      y2: Math.max(entity.y1, entity.y2),
    };
  }
  if (entity.kind === 'rect') {
    return { x1: entity.x, y1: entity.y, x2: entity.x + entity.w, y2: entity.y + entity.h };
  }
  if (entity.kind === 'polyline') {
    const xs = entity.points.map(([x]) => x);
    const ys = entity.points.map(([, y]) => y);
    return {
      x1: Math.min(...xs),
      y1: Math.min(...ys),
      x2: Math.max(...xs),
      y2: Math.max(...ys),
    };
  }
  if (entity.kind === 'text') {
    const width = Math.max(1, entity.text.length * entity.size * 0.7);
    const x1 =
      entity.anchor === 'middle'
        ? entity.x - width / 2
        : entity.anchor === 'end'
          ? entity.x - width
          : entity.x;
    return { x1, y1: entity.y - entity.size, x2: x1 + width, y2: entity.y + entity.size * 0.5 };
  }
  return {
    x1: Math.min(entity.x1, entity.x2) - entity.offset,
    y1: Math.min(entity.y1, entity.y2) - entity.offset,
    x2: Math.max(entity.x1, entity.x2) + entity.offset,
    y2: Math.max(entity.y1, entity.y2) + entity.offset,
  };
};

const intersects = (left: SvgBox, right: SvgBox): boolean =>
  left.x1 <= right.x2 && left.x2 >= right.x1 && left.y1 <= right.y2 && left.y2 >= right.y1;

/**
 * 单视图 SVG（product/包装设计.md R-包装设计-008 · 导出）：
 * 保留 A3 图框与标题栏，只输出指定视图及其标注；整图导出仍用 drawingToSvg。
 */
export function drawingToViewSvg(sheet: DrawingSheet, kind: DrawingViewKind): string {
  const view = sheet.views.find((item) => item.kind === kind);
  if (!view) {
    return drawingToSvg(sheet);
  }
  const box: SvgBox = {
    x1: view.x - 10,
    y1: view.y - 10,
    x2: view.x + view.w + 10,
    y2: view.y + view.h + 12,
  };
  const entities = sheet.entities
    .filter(
      (entity) =>
        entity.layer === 'FRAME' ||
        entity.layer === 'TITLE' ||
        intersects(entityBox(entity), box),
    )
    .map((entity) =>
      entity.kind === 'text' &&
      entity.layer === 'TITLE' &&
      entity.text.startsWith('比例 1:')
        ? { ...entity, text: `比例 1:${view.scale}` }
        : entity,
    );
  const body = entities.map(entityToSvg).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheet.paper.width} ${sheet.paper.height}" width="${sheet.paper.width}mm" height="${sheet.paper.height}mm">`,
    `<rect x="0" y="0" width="${sheet.paper.width}" height="${sheet.paper.height}" fill="#ffffff" />`,
    body,
    '</svg>',
  ].join('\n');
}
