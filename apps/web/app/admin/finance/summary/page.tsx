'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FINANCE_CATEGORY_LABELS, type FinanceCategoryValue } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';

// 收支汇总页（product/finance.md R-财务-001 页面设计；聚合页模式见 product/平台布局.md）：
// 筛选区（日期区间，默认本月）→ 三张指标卡（总收入 / 总成本 / 净利润）→ 分类小计表。
// 数据实时聚合，不落库（接口按日期区间计算）。

interface FinanceSummary {
  totalIncome: string;
  totalCost: string;
  netProfit: string;
  eventCount: number;
  categories: Array<{
    category: FinanceCategoryValue;
    income: string;
    cost: string;
    net: string;
  }>;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const monthStart = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
};

export default function FinanceSummaryPage(): React.ReactElement {
  const [filters, setFilters] = useState({ dateFrom: monthStart(), dateTo: localToday() });
  const [applied, setApplied] = useState({ dateFrom: monthStart(), dateTo: localToday() });
  const { data, isError } = useQuery({
    queryKey: ['finance-summary', applied.dateFrom, applied.dateTo],
    queryFn: async (): Promise<FinanceSummary> => {
      const { data: res, response } = await api.GET('/api/v1/finance/summary', {
        params: {
          query: {
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
          },
        },
      });
      if (!response.ok || !res) {
        throw new Error('汇总加载失败');
      }
      return {
        ...res,
        categories: res.categories as FinanceSummary['categories'],
      };
    },
  });

  const cards: Array<{ label: string; value: string }> = [
    { label: '总收入', value: data?.totalIncome ?? '0.00' },
    { label: '总成本', value: data?.totalCost ?? '0.00' },
    { label: '净利润', value: data?.netProfit ?? '0.00' },
  ];

  const resetFilters = (): void => {
    const defaults = { dateFrom: monthStart(), dateTo: localToday() };
    setFilters(defaults);
    setApplied(defaults);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...filters });
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">日期从</span>
          <DatePicker
            value={filters.dateFrom}
            onChange={(value) => setFilters({ ...filters, dateFrom: value })}
            placeholder="开始日期"
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">日期至</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(value) => setFilters({ ...filters, dateTo: value })}
            placeholder="结束日期"
            className="w-36"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button type="button" variant="outline" onClick={resetFilters}>
          重置
        </Button>
      </form>

      {isError ? <p className="text-sm text-destructive">汇总加载失败，请稍后重试</p> : null}

      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-medium tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
        <p className="text-right text-xs text-muted-foreground">
          共 {data?.eventCount ?? 0} 条事件（口径：业务发生额，含赊销，不等于现金流入）
        </p>
      </div>

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>分类</TableHead>
              <TableHead className="text-right">收入</TableHead>
              <TableHead className="text-right">成本</TableHead>
              <TableHead className="text-right">净额</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.categories ?? []).map((row) => (
              <TableRow key={row.category}>
                <TableCell>{FINANCE_CATEGORY_LABELS[row.category]}</TableCell>
                <TableCell className="text-right tabular-nums">{row.income}</TableCell>
                <TableCell className="text-right tabular-nums">{row.cost}</TableCell>
                <TableCell className="text-right tabular-nums">{row.net}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
