'use client';

import * as React from 'react';
import {
  BoxesIcon,
  FileTextIcon,
  HistoryIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectorTab } from './inspector';

interface ToolRailProps {
  active: boolean;
  onOpen: (tab: InspectorTab) => void;
  disabled?: boolean;
}

const TOOLS: Array<{ value: InspectorTab; label: string; icon: LucideIcon }> = [
  { value: 'project', label: '方案', icon: FileTextIcon },
  { value: 'part', label: '构件', icon: BoxesIcon },
  { value: 'validation', label: '校验', icon: ShieldCheckIcon },
  { value: 'revisions', label: '版本', icon: HistoryIcon },
];

// 右侧关闭态工具条（design/包装设计.md §9.2）：绝对定位在画布内容内的竖向图标卡
// （46px、rounded-xl、边框、阴影），不占独立列；打开 Inspector 时淡出；关闭态暂不显示状态点。
export function ToolRail({ active, onOpen, disabled = false }: ToolRailProps): React.ReactElement {
  return (
    <aside
      aria-label="工具条"
      aria-hidden={!active}
      aria-disabled={disabled}
      inert={!active || disabled}
      data-state={active ? 'closed' : 'open'}
      className={cn(
        'absolute right-3 top-1/2 z-20 -translate-y-1/2 transition-[opacity,visibility] duration-200 ease-linear',
        active
          ? disabled
            ? 'pointer-events-none opacity-40'
            : 'opacity-100'
          : 'pointer-events-none invisible opacity-0',
      )}
    >
      <div className="flex w-[46px] flex-col items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-md">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.value}
              type="button"
              onClick={() => onOpen(tool.value)}
              aria-label={tool.label}
              title={tool.label}
              className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
