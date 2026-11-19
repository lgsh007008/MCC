'use client';

import * as React from 'react';
import type { DrawingEntity, DrawingLayer, DrawingSheet } from '@mcc/shared';

// 图纸视图（design/包装设计.md §4.3）：渲染图纸模型，不在组件里重新计算图元。
// 屏幕与打印共用同一份图元；DXF 导出由 shared 的 drawingToDxf 完成。

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

function Entity({ entity }: { entity: DrawingEntity }): React.ReactElement {
  const style = LAYER_STYLE[entity.layer];
  if (entity.kind === 'line') {
    return (
      <line
        x1={entity.x1}
        y1={entity.y1}
        x2={entity.x2}
        y2={entity.y2}
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        fill="none"
      />
    );
  }
  if (entity.kind === 'rect') {
    return (
      <rect
        x={entity.x}
        y={entity.y}
        width={entity.w}
        height={entity.h}
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        fill={entity.layer === 'TITLE' ? '#ffffff' : style.fill}
      />
    );
  }
  if (entity.kind === 'polyline') {
    return (
      <polyline
        points={entity.points.map(([x, y]) => `${x},${y}`).join(' ')}
        stroke={style.stroke}
        strokeWidth={style.width}
        strokeDasharray={style.dash}
        fill="none"
      />
    );
  }
  if (entity.kind === 'text') {
    return (
      <text
        x={entity.x}
        y={entity.y}
        fontSize={entity.size}
        fontFamily="sans-serif"
        textAnchor={entity.anchor ?? 'start'}
        fill={style.fill}
      >
        {entity.text}
      </text>
    );
  }
  const midX = (entity.x1 + entity.x2) / 2;
  const midY = (entity.y1 + entity.y2) / 2;
  const horizontal = Math.abs(entity.y1 - entity.y2) < 0.001;
  return (
    <g>
      <line
        x1={entity.x1}
        y1={entity.y1}
        x2={entity.x2}
        y2={entity.y2}
        stroke={LAYER_STYLE.DIM.stroke}
        strokeWidth={LAYER_STYLE.DIM.width}
        fill="none"
      />
      <text
        x={horizontal ? midX : midX + entity.offset}
        y={horizontal ? midY - entity.offset : midY}
        fontSize={3}
        fontFamily="sans-serif"
        textAnchor={horizontal ? 'middle' : 'start'}
        fill={LAYER_STYLE.DIM.stroke}
      >
        {entity.text}
      </text>
    </g>
  );
}

interface SheetViewProps {
  sheet: DrawingSheet;
  className?: string;
  /** 由外层统一画布框提供边框与圆角时，去掉自身卡片样式 */
  frameless?: boolean;
  /** 是否渲染图纸自身的 FRAME 图层（A3 图框 / 标题栏）；工作台屏幕预览可关闭，打印与报告保留 */
  showFrame?: boolean;
}

export function SheetView({
  sheet,
  className,
  frameless = false,
  showFrame = true,
}: SheetViewProps): React.ReactElement {
  const entities = showFrame
    ? sheet.entities
    : sheet.entities.filter((entity) => entity.layer !== 'FRAME');
  return (
    <div
      className={`w-full overflow-hidden ${frameless ? '' : 'rounded-lg border border-border'} bg-white ${className ?? ''}`}
    >
      <svg
        viewBox={`0 0 ${sheet.paper.width} ${sheet.paper.height}`}
        className="h-auto w-full"
        role="img"
        aria-label="图纸集"
      >
        <rect x={0} y={0} width={sheet.paper.width} height={sheet.paper.height} fill="#ffffff" />
        {entities.map((entity, index) => (
          <Entity key={`${entity.kind}-${index}`} entity={entity} />
        ))}
      </svg>
    </div>
  );
}
