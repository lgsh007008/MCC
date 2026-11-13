'use client';

import { cn } from '@/lib/utils';

// 分段切换（product/平台布局.md 移动页；design/平台布局.md §1.8）：
// 少量互斥选项的整行等宽按钮，48px 高、选中实心；移动端替代 PC 页内 Tab 与下拉。

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
}: {
  value: T;
  options: Array<SegmentedOption<T>>;
  onValueChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex w-full gap-2">
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
              'h-12 flex-1 rounded-lg border text-base font-medium transition-colors',
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
