'use client';

import { DatePicker } from '@/components/ui/date-picker';

// 移动日期区间筛选（product/平台布局.md 移动页 · 筛选）：
// 与收支汇总 / 资金流水一致——单列整行「日期从 / 日期至」两个控件，占满整行；
// 默认区间为本月 1 日至今天，重置回默认区间（不是清空）。

const pad = (value: number): string => String(value).padStart(2, '0');

export function defaultMobileDateRange(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  return {
    dateFrom: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
    dateTo: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
  };
}

export function MobileDateRangeFields({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (next: { dateFrom: string; dateTo: string }) => void;
}): React.ReactElement {
  return (
    <>
      <div className="space-y-1.5">
        <span className="text-mobile-label text-muted-foreground">日期从</span>
        <DatePicker
          value={dateFrom}
          onChange={(value) => onChange({ dateFrom: value, dateTo })}
          size="touch"
          className="w-full"
        />
      </div>
      <div className="space-y-1.5">
        <span className="text-mobile-label text-muted-foreground">日期至</span>
        <DatePicker
          value={dateTo}
          onChange={(value) => onChange({ dateFrom, dateTo: value })}
          size="touch"
          className="w-full"
        />
      </div>
    </>
  );
}
