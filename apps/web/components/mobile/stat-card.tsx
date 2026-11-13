'use client';

import { cn } from '@/lib/utils';

// 移动指标卡（product/平台布局.md 移动页 · 字号角色）：
// 标签用 label、数值用 numeric 强调角色；emphasis 用于「当前资金总额 · 此刻」这类非期间值。

export function MobileStatCard({
  label,
  value,
  note,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  emphasis?: boolean;
}): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-xl border border-border p-4',
        emphasis ? 'border-l-2 border-l-primary/40 bg-muted/40' : 'bg-card',
      )}
    >
      <p className="text-mobile-label text-muted-foreground">{label}</p>
      <p className="mt-1 text-mobile-numeric-strong font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-mobile-label text-muted-foreground">{note}</p> : null}
    </div>
  );
}
