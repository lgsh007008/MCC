'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BUSINESS_SUMMARY_CATEGORY_LABELS,
  FINANCE_ACCOUNT_CHANNEL_LABELS,
  FINANCE_ACCOUNT_KIND_LABELS,
  type ApiSchemas,
} from '@mcc/shared';
import { BusinessSummaryHelpDialog } from '@/components/finance/business-summary-help-dialog';
import { CashSummaryHelpDialog } from '@/components/finance/cash-summary-help-dialog';
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
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';

// 收支汇总页（product/finance.md R-财务-001 / R-财务-002；聚合页 + 页内 Tab）：
// Tab 1 经营收支（三卡 + 分类小计 + 口径说明弹窗）；Tab 2 资金收付（期间三卡 + 当前资金总额 + 账户余额）。
// Tab 写入 ?tab=funds，默认经营收支；两个 Tab 共用一份日期筛选。

// 类型取自契约生成产物（ADR-006），不手写 DTO
type FinanceSummary = ApiSchemas['FinanceSummaryDto'];
type CashSummary = ApiSchemas['FinanceCashSummaryDto'];

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const monthStart = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
};
const defaultRange = (): { dateFrom: string; dateTo: string } => ({
  dateFrom: monthStart(),
  dateTo: localToday(),
});

export default function FinanceSummaryPage(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'funds' ? 'funds' : 'business';
  const [businessHelpOpen, setBusinessHelpOpen] = useState(false);
  const [cashHelpOpen, setCashHelpOpen] = useState(false);

  // 共用一份日期筛选：切 Tab 保留已查询区间，未点查询的输入丢弃
  const [filters, setFilters] = useState(defaultRange());
  const [applied, setApplied] = useState(defaultRange());

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
      return res;
    },
  });

  const { data: cash, isError: cashError } = useQuery({
    queryKey: ['finance-cash-summary', applied.dateFrom, applied.dateTo],
    queryFn: async (): Promise<CashSummary> => {
      const { data: res, response } = await api.GET('/api/v1/finance/cash-summary', {
        params: {
          query: {
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
          },
        },
      });
      if (!response.ok || !res) {
        throw new Error('资金汇总加载失败');
      }
      return res;
    },
  });

  const cards: Array<{ label: string; value: string }> = [
    { label: '总收入', value: data?.totalIncome ?? '0.00' },
    { label: '总支出', value: data?.totalExpense ?? '0.00' },
    { label: '净额', value: data?.netAmount ?? '0.00' },
  ];

  // 期间三卡 + 「当前资金总额 · 此刻」：四卡同排，资金总额卡靠竖线、浅底与「此刻」区分
  const fundCards: Array<{ label: string; value: string; current?: boolean; note?: string }> = [
    { label: '期间收款', value: cash?.receipts ?? '0.00' },
    { label: '期间付款', value: cash?.payments ?? '0.00' },
    { label: '净流入', value: cash?.netFlow ?? '0.00' },
    {
      label: '当前资金总额 · 此刻',
      value: cash?.totalFunds ?? '0.00',
      current: true,
      note: '不随日期筛选变化',
    },
  ];

  const setTab = (next: string): void => {
    router.replace(next === 'funds' ? '?tab=funds' : '/admin/finance/summary');
  };

  const filterForm = (
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
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          const defaults = defaultRange();
          setFilters(defaults);
          setApplied(defaults);
        }}
      >
        重置
      </Button>
    </form>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <Tabs
        value={tab}
        items={[
          { value: 'business', label: '经营收支' },
          { value: 'funds', label: '资金收付' },
        ]}
        onValueChange={setTab}
      />

      {filterForm}

      {tab === 'business' ? (
        <>
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
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                看这段时间生意赚了多少：收入按销售单、采购按采购单确认（赊销赊购都计入），工资费用按实付计入，所以净额不等于手里的现金。本期计入{' '}
                {data?.orderCount ?? 0} 张销售单、{data?.purchaseCount ?? 0} 张采购单、
                {data?.cashEntryCount ?? 0} 条收支流水。
              </p>
              <Button
                type="button"
                variant="link"
                size="xs"
                className="shrink-0 px-0 text-xs"
                onClick={() => setBusinessHelpOpen(true)}
              >
                分类口径说明
              </Button>
            </div>
          </div>

          <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
            <Table containerClassName="h-full overflow-y-auto">
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
                <TableRow>
                  <TableHead>分类</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.categories ?? []).map((row) => (
                  <TableRow key={row.category}>
                    <TableCell>{BUSINESS_SUMMARY_CATEGORY_LABELS[row.category]}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <>
          {cashError ? (
            <p className="text-sm text-destructive">资金汇总加载失败，请稍后重试</p>
          ) : null}

          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {fundCards.map((card) => (
                <div
                  key={card.label}
                  className={
                    card.current
                      ? 'rounded-lg border border-border border-l-2 border-l-primary/40 bg-muted/40 p-4'
                      : 'rounded-lg border border-border bg-card p-4'
                  }
                >
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-xl font-medium tabular-nums xl:text-2xl">
                    {card.value}
                  </p>
                  {card.note ? (
                    <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                看这段时间钱怎么动：收款与付款按流水实际发生计入，内部转账不算；净流入 = 收款 − 付款。
              </p>
              <Button
                type="button"
                variant="link"
                size="xs"
                className="shrink-0 px-0 text-xs"
                onClick={() => setCashHelpOpen(true)}
              >
                资金口径说明
              </Button>
            </div>
          </div>

          <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
            <Table containerClassName="h-full overflow-y-auto">
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
                <TableRow>
                  <TableHead>账户编号</TableHead>
                  <TableHead>账户名称</TableHead>
                  <TableHead>类型 / 渠道</TableHead>
                  <TableHead className="text-right">当前余额</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(cash?.accounts ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      暂无资金账户
                    </TableCell>
                  </TableRow>
                ) : (
                  (cash?.accounts ?? []).map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>{account.code}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>
                        {FINANCE_ACCOUNT_KIND_LABELS[account.kind]} ·{' '}
                        {FINANCE_ACCOUNT_CHANNEL_LABELS[account.channel]}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{account.balance}</TableCell>
                      <TableCell>{account.active ? '启用' : '停用'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <BusinessSummaryHelpDialog open={businessHelpOpen} onOpenChange={setBusinessHelpOpen} />
      <CashSummaryHelpDialog open={cashHelpOpen} onOpenChange={setCashHelpOpen} />
    </div>
  );
}
