'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  FINANCE_CASH_CATEGORIES_BY_DIRECTION,
  FINANCE_CASH_CATEGORY_LABELS,
  type FinanceCashCategoryValue,
  type FinanceCashDirection,
} from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { FinanceCashCard, type MobileCashEntry } from '@/components/mobile/finance-cash-card';
import { MobileListState } from '@/components/mobile/list';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { Button, buttonVariants } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 资金流水移动页（product/finance.md R-财务-002 移动页；适老化基线）：
// 单列、无左栏；账户用大号下拉替代主从筛选；流水为卡片列表 + 加载更多；
// 底部固定合计与「登记流水」；不做批量与横向滚动。

interface AccountOption {
  id: string;
  name: string;
}

interface CashEntryRow extends MobileCashEntry {
  code: string;
}

interface CashEntrySummary {
  receipts: string;
  payments: string;
  net: string;
}

const PAGE_SIZE = 20;

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

export default function MobileFinanceCashPage(): React.ReactElement {
  const canManage = useCan('finance:manage');
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountId, setAccountId] = useState('');
  const [filters, setFilters] = useState({
    ...defaultRange(),
    direction: '' as FinanceCashDirection | '',
    category: '' as FinanceCashCategoryValue | '',
  });
  const [applied, setApplied] = useState(filters);
  const [items, setItems] = useState<CashEntryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<CashEntrySummary>({
    receipts: '0.00',
    payments: '0.00',
    net: '0.00',
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/finance/accounts');
        if (!cancelled && response.ok && data) {
          setAccounts(
            data.items
              .filter((item) => item.active)
              .map((item) => ({ id: item.id, name: item.name })),
          );
        }
      } catch {
        if (!cancelled) {
          setAccounts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const { data: res, response } = await api.GET('/api/v1/finance/cash-entries', {
          params: {
            query: {
              page,
              pageSize: PAGE_SIZE,
              direction: (applied.direction || undefined) as FinanceCashDirection | undefined,
              category: (applied.category || undefined) as FinanceCashCategoryValue | undefined,
              accountId: accountId || undefined,
              dateFrom: applied.dateFrom || undefined,
              dateTo: applied.dateTo || undefined,
            },
          },
        });
        if (cancelled) {
          return;
        }
        if (response.ok && res) {
          const rows = res.items as CashEntryRow[];
          setItems((prev) => (page === 1 ? rows : [...prev, ...rows]));
          setTotal(res.total);
          setSummary(res.summary);
          setError(null);
        } else {
          setError('加载失败，请稍后重试');
        }
      } catch {
        if (!cancelled) {
          setError('加载失败，请稍后重试');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, applied, accountId]);

  const categoryOptions: FinanceCashCategoryValue[] =
    filters.direction === 'transfer'
      ? []
      : filters.direction === ''
        ? Object.values(FINANCE_CASH_CATEGORIES_BY_DIRECTION).flat()
        : FINANCE_CASH_CATEGORIES_BY_DIRECTION[filters.direction];

  const canLoadMore = items.length < total;

  return (
    <div className="pb-32">
      <MobileHeader title="资金流水" backHref="/m/finance" />

      <div className="space-y-3 p-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <span className="text-mobile-label text-muted-foreground">账户</span>
            <Select
              value={accountId}
              onChange={(value) => {
                setAccountId(value);
                setPage(1);
              }}
              options={[
                { value: '', label: '全部账户' },
                ...accounts.map((account) => ({ value: account.id, label: account.name })),
              ]}
              className="h-12 w-full px-3 text-mobile-body"
            />
          </div>

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

          <div className="space-y-1.5">
            <span className="text-mobile-label text-muted-foreground">方向</span>
            <Segmented
              ariaLabel="方向"
              value={filters.direction}
              options={[
                { value: '', label: '全部' },
                { value: 'in', label: '收款' },
                { value: 'out', label: '付款' },
                { value: 'transfer', label: '内部转账' },
              ]}
              onValueChange={(next) => {
                const direction = next as FinanceCashDirection | '';
                const allowed =
                  direction === '' || direction === 'transfer'
                    ? null
                    : FINANCE_CASH_CATEGORIES_BY_DIRECTION[direction];
                setFilters({
                  ...filters,
                  direction,
                  category:
                    direction === 'transfer' ||
                    (allowed && filters.category !== '' && !allowed.includes(filters.category))
                      ? ''
                      : filters.category,
                });
              }}
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-mobile-label text-muted-foreground">收支分类</span>
            <Select
              value={filters.category}
              onChange={(value) =>
                setFilters({ ...filters, category: value as FinanceCashCategoryValue | '' })
              }
              disabled={filters.direction === 'transfer'}
              options={[
                {
                  value: '',
                  label: filters.direction === 'transfer' ? '内部转账无分类' : '全部分类',
                },
                ...categoryOptions.map((value) => ({
                  value,
                  label: FINANCE_CASH_CATEGORY_LABELS[value],
                })),
              ]}
              className="h-12 w-full px-3 text-mobile-body"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="h-12 flex-1 text-mobile-body"
              onClick={() => {
                setApplied({ ...filters });
                setPage(1);
              }}
            >
              查询
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 text-mobile-body"
              onClick={() => {
                const defaults = { ...defaultRange(), direction: '' as const, category: '' as const };
                setFilters(defaults);
                setApplied(defaults);
                setAccountId('');
                setPage(1);
              }}
            >
              重置
            </Button>
          </div>
        </section>

        {error ? <p className="text-mobile-body text-destructive">{error}</p> : null}

        {items.length === 0 && !loading ? (
          <MobileListState>暂无资金流水</MobileListState>
        ) : (
          <div className="space-y-3">
            {items.map((entry) => (
              <FinanceCashCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}

        {loading ? (
          <p className="py-2 text-center text-mobile-body text-muted-foreground">加载中…</p>
        ) : null}

        {canLoadMore && !loading ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-mobile-body"
            onClick={() => setPage((prev) => prev + 1)}
          >
            加载更多
          </Button>
        ) : null}
      </div>

      <MobileActionBar>
        <div className="min-w-0 flex-1 text-mobile-label leading-5">
          <p className="tabular-nums">收 {summary.receipts} · 付 {summary.payments}</p>
          <p className="tabular-nums">
            净 <span className="font-semibold">{summary.net}</span>
          </p>
        </div>
        {canManage ? (
          <Link
            href="/m/finance/cash/new"
            className={cn(buttonVariants(), 'h-12 shrink-0 px-5 text-mobile-body')}
          >
            登记流水
          </Link>
        ) : null}
      </MobileActionBar>
    </div>
  );
}
