'use client';

import * as React from 'react';
import { ChevronsDownIcon, ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// 工作台面板的边缘把手（design/包装设计.md §9.2）：
// 左侧栏贴右边缘、右侧栏贴左边缘、底部面板贴上沿中央；默认很淡，hover 显示底色与 tooltip。

export type PanelHandleSide = 'left' | 'right' | 'bottom';

const ICONS = {
  left: ChevronsLeftIcon,
  right: ChevronsRightIcon,
  bottom: ChevronsDownIcon,
} as const;

const SIZE: Record<PanelHandleSide, string> = {
  left: 'h-10 w-4',
  right: 'h-10 w-4',
  bottom: 'h-4 w-10',
};

const PLACEMENT: Record<PanelHandleSide, string> = {
  left: 'right-0 top-1/2 -translate-y-1/2 rounded-l-md',
  right: 'left-0 top-1/2 -translate-y-1/2 rounded-r-md',
  bottom: 'left-1/2 top-0 -translate-x-1/2 rounded-b-md',
};

interface PanelHandleProps {
  side: PanelHandleSide;
  label: string;
  onClick: () => void;
  className?: string;
}

export function PanelHandle({
  side,
  label,
  onClick,
  className,
}: PanelHandleProps): React.ReactElement {
  const Icon = ICONS[side];
  return (
    <button
      type="button"
      data-panel-handle
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'absolute z-10 flex items-center justify-center bg-background text-muted-foreground shadow-sm ring-1 ring-border/70 transition-colors hover:bg-muted hover:text-foreground hover:ring-border',
        SIZE[side],
        PLACEMENT[side],
        className,
      )}
    >
      <Icon className="size-3.5" />
    </button>
  );
}
