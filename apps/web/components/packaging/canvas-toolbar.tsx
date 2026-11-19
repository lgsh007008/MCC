'use client';

import * as React from 'react';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PalletDrawingView } from './drawing-view-2d';

export type CanvasView =
  | 'three'
  | 'top'
  | 'front'
  | 'side'
  | 'iso'
  | '3d'
  | 'sheet'
  | 'split';

export type CanvasMode = '2d' | '3d' | 'sheet' | 'split';

const MODE_OPTIONS: Array<{ value: CanvasMode; label: string }> = [
  { value: '2d', label: '2D' },
  { value: '3d', label: '3D' },
  { value: 'sheet', label: '图纸' },
  { value: 'split', label: '分屏' },
];

const VIEW_OPTIONS: Array<[PalletDrawingView, string]> = [
  ['three', '三视图'],
  ['top', '俯视'],
  ['front', '主视'],
  ['side', '侧视'],
  ['iso', '轴测'],
];

interface CanvasToolbarProps {
  mode: CanvasMode;
  drawingView: PalletDrawingView;
  info: string;
  compact?: boolean;
  onModeChange: (mode: CanvasMode) => void;
  onDrawingViewChange: (view: PalletDrawingView) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

// 画布视图栏（product/包装设计.md R-包装设计-006 · 画布 / design §9.2）：
// 画布内容的一部分（非浮卡）：2D / 3D / 图纸 / 分屏 + 2D 方向 + 尺寸信息 / 缩放 / 复位；
// 2D / 3D / 分屏统一「复位」，文字标签用下划线激活，尺寸信息与缩放为文字控件。
export function CanvasToolbar({
  mode,
  drawingView,
  info,
  compact = false,
  onModeChange,
  onDrawingViewChange,
  onZoomIn,
  onZoomOut,
  onReset,
}: CanvasToolbarProps): React.ReactElement {
  const is2D = mode === '2d';
  return (
    <div
      data-testid="packaging-viewbar"
      className="flex h-10 shrink-0 items-center gap-2 overflow-hidden border-b border-border bg-background px-3"
    >
      <div
        role="group"
        aria-label="画布模式"
        className="flex shrink-0 items-center gap-0.5 rounded-md bg-muted p-0.5"
      >
        {MODE_OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onModeChange(option.value)}
              aria-pressed={active}
              className={cn(
                'h-6 rounded px-2 text-wb-body transition-colors',
                active
                  ? 'bg-background font-semibold text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {is2D ? (
        <>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
          <div role="group" aria-label="2D 视图方向" className="flex shrink-0 items-center gap-0.5">
            {VIEW_OPTIONS.map(([value, label]) => {
              const active = drawingView === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onDrawingViewChange(value)}
                  aria-pressed={active}
                  className={cn(
                    'flex h-7 items-center border-b-2 px-2 text-wb-body transition-colors',
                    active
                      ? 'border-primary font-semibold text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
        {compact ? null : (
          <span className="hidden min-w-0 truncate text-wb-meta text-muted-foreground lg:inline lg:max-w-[220px] xl:max-w-[320px]">
            {info}
          </span>
        )}
        {mode === '2d' || mode === '3d' ? (
          <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="画布缩放">
            <Button size="icon-xs" variant="ghost" onClick={onZoomOut} aria-label="缩小">
              <MinusIcon />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={onZoomIn} aria-label="放大">
              <PlusIcon />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              className="text-wb-meta"
              onClick={onReset}
              aria-label="复位视图"
            >
              复位
            </Button>
          </div>
        ) : mode === 'split' ? (
          <Button size="xs" variant="ghost" className="text-wb-meta" onClick={onReset} aria-label="复位视图">
            复位
          </Button>
        ) : null}
      </div>
    </div>
  );
}
