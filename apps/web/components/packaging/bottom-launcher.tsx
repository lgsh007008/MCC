'use client';

import * as React from 'react';
import {
  FileSpreadsheetIcon,
  ScissorsIcon,
  Table2Icon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type BottomTab = 'parts' | 'bom' | 'cutting';

export const BOTTOM_TABS: Array<{ value: BottomTab; label: string; icon: LucideIcon }> = [
  { value: 'parts', label: '构件表', icon: Table2Icon },
  { value: 'bom', label: 'BOM', icon: FileSpreadsheetIcon },
  { value: 'cutting', label: '开料', icon: ScissorsIcon },
];

export const BOTTOM_TAB_LABELS: Record<BottomTab, string> = {
  parts: '构件表',
  bom: 'BOM',
  cutting: '开料',
};

interface BottomLauncherProps {
  visible: boolean;
  onOpen: (tab: BottomTab) => void;
  disabled?: boolean;
}

// 底部关闭态 launcher（design/包装设计.md §9.2）：画布内底部居中的横向图标卡，
// 与右侧工具条卡同圆角 / 同边框 / 同阴影 / 同按钮尺寸；关闭态暂不显示数量徽标。
export function BottomLauncher({
  visible,
  onOpen,
  disabled = false,
}: BottomLauncherProps): React.ReactElement {
  return (
    <div
      data-testid="bottom-launcher"
      aria-label="底部明细入口"
      aria-hidden={!visible}
      aria-disabled={disabled}
      inert={!visible || disabled}
      className={cn(
        'absolute bottom-3 left-1/2 z-20 -translate-x-1/2 transition-[opacity,visibility] duration-200 ease-linear',
        visible
          ? disabled
            ? 'pointer-events-none opacity-40'
            : 'opacity-100'
          : 'pointer-events-none invisible opacity-0',
      )}
    >
      <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-md">
        {BOTTOM_TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onOpen(item.value)}
              aria-label={`打开${item.label}`}
              title={item.label}
              className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
