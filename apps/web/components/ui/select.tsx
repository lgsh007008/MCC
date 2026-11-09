'use client';

import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// 应用内下拉（product/平台布局.md 二次确认规范同源的组件纪律）：
// 底座为 @base-ui/react/select（无头、可访问性完整），不使用浏览器原生 select。
// 页面禁止直接写原生 select；需要远程搜索 / 多选时在本组件上扩展，不改调用方形态。

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  id,
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}): React.ReactElement {
  const selected = options.find((option) => option.value === value);
  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => onChange((next as string | null) ?? '')}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={cn(
          'flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-sm outline-none',
          'focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span className={cn('truncate', selected ? undefined : 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={4} className="z-50">
          <SelectPrimitive.Popup className="max-h-72 min-w-[var(--anchor-width)] overflow-y-auto rounded-md border border-border bg-popover p-1 text-sm text-popover-foreground shadow-md">
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className="flex cursor-default items-center justify-between gap-2 rounded-sm px-2 py-1.5 outline-none data-[highlighted]:bg-muted data-[disabled]:opacity-50"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon className="size-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
