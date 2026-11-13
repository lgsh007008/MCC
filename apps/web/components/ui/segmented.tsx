'use client';

import { cn } from '@/lib/utils';

// 分段切换（product/平台布局.md 移动页；design/平台布局.md §1.8）：
// 少量互斥选项的整行等宽按钮，48px 高、选中实心；移动端替代 PC 页内 Tab 与下拉。
// 选项 ≥4 时传 columns={2} 排两列，避免 18px 中文在窄屏把按钮撑破。

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onValueChange,
  ariaLabel,
  disabled = false,
  columns = 1,
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
  columns?: 1 | 2;
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('w-full gap-2', columns === 2 ? 'grid grid-cols-2' : 'flex')}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'h-12 rounded-lg border text-base font-medium transition-colors',
              columns === 2 ? 'w-full' : 'flex-1',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground',
              disabled ? 'opacity-50' : 'active:opacity-80',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
