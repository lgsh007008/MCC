'use client';

import * as React from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// 应用内日期选择：底座为 @base-ui/react/popover（无头、焦点与外部点击处理完整），
// 日历面板自建（无需新增日期库）；不使用浏览器原生 input[type=date]。
// 值格式固定 YYYY-MM-DD，与接口字段一致。

const pad = (value: number): string => String(value).padStart(2, '0');

const parseValue = (value?: string): { y: number; m: number; d: number } | null => {
  if (!value) {
    return null;
  }
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) {
    return null;
  }
  return { y, m, d };
};

const formatValue = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

const todayParts = (): { y: number; m: number; d: number } => {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
};

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = '选择日期',
  disabled,
  className,
  size = 'default',
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** touch：移动 Web 适老化基线（ADR-011），触发区与日历单元放大到 44px 以上 */
  size?: 'default' | 'touch';
}): React.ReactElement {
  const selected = parseValue(value);
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<{ y: number; m: number }>(() => {
    const base = selected ?? todayParts();
    return { y: base.y, m: base.m };
  });

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      const base = selected ?? todayParts();
      setView({ y: base.y, m: base.m });
    }
    setOpen(next);
  };

  const firstWeekday = new Date(view.y, view.m - 1, 1).getDay();
  const mondayOffset = (firstWeekday + 6) % 7;
  const daysInMonth = new Date(view.y, view.m, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: mondayOffset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const today = todayParts();

  const shiftMonth = (delta: number): void => {
    setView((prev) => {
      const monthIndex = prev.y * 12 + (prev.m - 1) + delta;
      return { y: Math.floor(monthIndex / 12), m: (monthIndex % 12) + 1 };
    });
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger
        id={id}
        disabled={disabled}
        className={cn(
          'flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm outline-none',
          'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
          size === 'touch' && 'h-12 px-3 text-base',
          className,
        )}
      >
        <span className={cn('truncate', selected ? undefined : 'text-muted-foreground')}>
          {selected ? value : placeholder}
        </span>
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={4} className="z-50">
          <Popover.Popup className="rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md">
            <div className="flex items-center justify-between pb-2">
              <button
                type="button"
                aria-label="上个月"
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
                  size === 'touch' && 'size-11',
                )}
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeftIcon className="size-4" />
              </button>
              <span className="text-sm font-medium">
                {view.y} 年 {view.m} 月
              </span>
              <button
                type="button"
                aria-label="下个月"
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-md hover:bg-muted',
                  size === 'touch' && 'size-11',
                )}
                onClick={() => shiftMonth(1)}
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEK_LABELS.map((label) => (
                <span key={label} className="py-1">
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((day, index) => {
                if (day === null) {
                  return <span key={`empty-${index}`} />;
                }
                const isSelected =
                  selected?.y === view.y && selected.m === view.m && selected.d === day;
                const isToday = today.y === view.y && today.m === view.m && today.d === day;
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={`${view.y}-${pad(view.m)}-${pad(day)}`}
                    aria-pressed={isSelected}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm tabular-nums hover:bg-muted',
                      size === 'touch' && 'h-11 w-11 text-base',
                      isSelected && 'bg-primary text-primary-foreground hover:bg-primary',
                      !isSelected && isToday && 'border border-border',
                    )}
                    onClick={() => {
                      onChange(formatValue(view.y, view.m, day));
                      setOpen(false);
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
              <button
                type="button"
                className={cn(
                  'rounded-sm px-1 py-0.5 text-muted-foreground hover:text-foreground',
                  size === 'touch' && 'px-3 py-2 text-sm',
                )}
                onClick={() => {
                  const now = todayParts();
                  onChange(formatValue(now.y, now.m, now.d));
                  setOpen(false);
                }}
              >
                今天
              </button>
              <button
                type="button"
                className={cn(
                  'rounded-sm px-1 py-0.5 text-muted-foreground hover:text-foreground',
                  size === 'touch' && 'px-3 py-2 text-sm',
                )}
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                清除
              </button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
