'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BUSINESS_SUMMARY_CATEGORY_LABELS,
  type BusinessSummaryCategory,
} from '@mcc/shared';
import { BusinessSummaryHelpDialog } from '@/components/finance/business-summary-help-dialog';
import { CashSummaryHelpDialog } from '@/components/finance/cash-summary-help-dialog';
import { MobileListState } from '@/components/mobile/list';
import { MobileStatCard } from '@/components/mobile/stat-card';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Segmented } from '@/components/ui/segmented';
import { api } from '@/lib/api';

// 收支汇总移动页（product/finance.md R-财务-001 移动页；适老化基线）：
// 分段按钮切 Tab（写 ?tab=funds）；指标纵向单列；分类小计为单列行；口径弹窗复用 PC 组件。

interface FinanceSummary {
  totalIncome: string;
  totalExpense: string;
  netAmount: string;
  orderCount: number;
  cashEntryCount: number;
  categories: Array<{ category: BusinessSummaryCategory; amount: string }>;
}

interface CashSummary {
  receipts: string;
  payments: string;
  netFlow: string;
  totalFunds: string;
  accounts: Array<{ id: string; name: string; balance: string; active: boolean }>;
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
const defaultRange = (): { dateFrom: string; dateTo: string } => ({
  dateFrom: monthStart(),
  dateTo: localToday(),
});

function SummaryContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'funds' ? 'funds' : 'business';
  const [businessHelpOpen, setBusinessHelpOpen] = useState(false);
  const [cashHelpOpen, setCashHelpOpen] = useState(false);
  const [filters, setFilters] = useState(defaultRange());
  const [applied, setApplied] = useState(defaultRange());

  // 移动端无 QueryClientProvider（只在 PC 壳挂载），用 effect 取数
  const [data, setData] = useState<FinanceSummary | null>(null);
  const [isError, setIsError] = useState(false);
  const [cash, setCash] = useState<CashSummary | null>(null);
  const [cashError, setCashError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: res, response } = await api.GET('/api/v1/finance/summary', {
          params: {
            query: {
              dateFrom: applied.dateFrom || undefined,
              dateTo: applied.dateTo || undefined,
            },
          },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !res) {
          setIsError(true);
          return;
        }
        setData({ ...res, categories: res.categories as FinanceSummary['categories'] });
        setIsError(false);
      } catch {
        if (!cancelled) {
          setIsError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applied]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data: res, response } = await api.GET('/api/v1/finance/cash-summary', {
          params: {
            query: {
              dateFrom: applied.dateFrom || undefined,
              dateTo: applied.dateTo || undefined,
            },
          },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !res) {
          setCashError(true);
          return;
        }
        setCash(res as CashSummary);
        setCashError(false);
      } catch {
        if (!cancelled) {
          setCashError(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applied]);

  return (
    <div className="pb-8">
      <MobileHeader title="收支汇总" backHref="/m/finance" />

      <div className="space-y-4 p-4">
        <Segmented
          ariaLabel="收支口径"
          value={tab}
          options={[
            { value: 'business', label: '经营收支' },
            { value: 'funds', label: '资金收付' },
          ]}
          onValueChange={(next) =>
            router.replace(next === 'funds' ? '?tab=funds' : '/m/finance/summary')
          }
        />

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <span className="text-mobile-label text-muted-foreground">日期从</span>
            <DatePicker
              value={filters.dateFrom}
              onChange={(value) => setFilters({ ...filters, dateFrom: value })}
              size="touch"
              className="w-full"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-mobile-label text-muted-foreground">日期至</span>
            <DatePicker
              value={filters.dateTo}
              onChange={(value) => setFilters({ ...filters, dateTo: value })}
              size="touch"
              className="w-full"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="h-12 flex-1 text-mobile-body"
              onClick={() => setApplied({ ...filters })}
            >
              查询
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 text-mobile-body"
              onClick={() => {
                const defaults = defaultRange();
                setFilters(defaults);
                setApplied(defaults);
              }}
            >
              重置
            </Button>
          </div>
        </section>

        {tab === 'business' ? (
          <>
            {isError ? (
              <p className="text-mobile-body text-destructive">汇总加载失败，请稍后重试</p>
            ) : null}

            <div className="space-y-3">
              {[
                { label: '总收入', value: data?.totalIncome ?? '0.00' },
                { label: '总支出', value: data?.totalExpense ?? '0.00' },
                { label: '净额', value: data?.netAmount ?? '0.00' },
              ].map((card) => (
                <MobileStatCard key={card.label} label={card.label} value={`${card.value} 元`} />
              ))}
            </div>

            <div className="flex items-start justify-between gap-3">
              <p className="text-mobile-body text-muted-foreground">
                收入按销售单确认（赊销也计入），支出按实际付款计入，净额不等于手里的现金。
              </p>
              <Button
                type="button"
                variant="link"
                size="xs"
                className="shrink-0 px-0 text-mobile-body"
                onClick={() => setBusinessHelpOpen(true)}
              >
                口径说明
              </Button>
            </div>

            <section className="rounded-xl border border-border bg-card p-4">
              <p className="text-mobile-label text-muted-foreground">
                本期计入 {data?.orderCount ?? 0} 张销售单、{data?.cashEntryCount ?? 0} 条收支流水
              </p>
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {(data?.categories ?? []).map((row) => (
                  <div key={row.category} className="flex items-center justify-between gap-3">
                    <span className="text-mobile-body">
                      {BUSINESS_SUMMARY_CATEGORY_LABELS[row.category]}
                    </span>
                    <span className="text-mobile-numeric tabular-nums">{row.amount} 元</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {cashError ? (
              <p className="text-mobile-body text-destructive">资金汇总加载失败，请稍后重试</p>
            ) : null}

            <div className="space-y-3">
              {[
                { label: '期间收款', value: cash?.receipts ?? '0.00' },
                { label: '期间付款', value: cash?.payments ?? '0.00' },
                { label: '净流入', value: cash?.netFlow ?? '0.00' },
              ].map((card) => (
                <MobileStatCard key={card.label} label={card.label} value={`${card.value} 元`} />
              ))}
              <MobileStatCard
                emphasis
                label="当前资金总额 · 此刻"
                value={`${cash?.totalFunds ?? '0.00'} 元`}
                note="不随日期筛选变化"
              />
            </div>

            <div className="flex items-start justify-between gap-3">
              <p className="text-mobile-body text-muted-foreground">
                收款与付款按流水实际发生计入，内部转账不算；净流入 = 收款 − 付款。
              </p>
              <Button
                type="button"
                variant="link"
                size="xs"
                className="shrink-0 px-0 text-mobile-body"
                onClick={() => setCashHelpOpen(true)}
              >
                口径说明
              </Button>
            </div>

            <section className="rounded-xl border border-border bg-card p-4">
              <p className="text-mobile-label text-muted-foreground">账户余额</p>
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {(cash?.accounts ?? []).length === 0 ? (
                  <p className="text-mobile-body text-muted-foreground">暂无资金账户</p>
                ) : (
                  (cash?.accounts ?? []).map((account) => (
                    <div key={account.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-mobile-body">
                        {account.name}
                        {account.active ? '' : '（停用）'}
                      </span>
                      <span className="text-mobile-numeric tabular-nums">{account.balance} 元</span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>

      <BusinessSummaryHelpDialog open={businessHelpOpen} onOpenChange={setBusinessHelpOpen} />
      <CashSummaryHelpDialog open={cashHelpOpen} onOpenChange={setCashHelpOpen} />
    </div>
  );
}

// useSearchParams 需要 Suspense 边界（Next App Router）
export default function MobileFinanceSummaryPage(): React.ReactElement {
  return (
    <Suspense fallback={<MobileListState>加载中…</MobileListState>}>
      <SummaryContent />
    </Suspense>
  );
}
