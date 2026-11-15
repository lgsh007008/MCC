'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { CountHelpDialog } from '@/components/production/count-help-dialog';
import { Segmented } from '@/components/ui/segmented';
import {
  MobileDateRangeFields,
  defaultMobileDateRange,
} from '@/components/mobile/date-range-fields';
import {
  MobileListCard,
  MobileListLoadMore,
  MobileListPage,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

// 移动盘点记录列表（product/生产与库存.md R-生产-003）：
// 顶部分段「原木 / 方木」(?tab=timber) + 日期筛选 + 卡片列表 + 底部新建；
// 卡片点击进只读详情，不提供编辑 / 删除。

type CountList = ApiSchemas['InventoryCountListDto'];
type CountRow = ApiSchemas['InventoryCountListItemDto'];
type TargetType = 'raw_log' | 'timber';

const PAGE_SIZE = 20;

async function fetchCounts(
  page: number,
  dateFrom: string,
  dateTo: string,
  targetType: TargetType,
): Promise<CountList> {
  const { data, response } = await api.GET('/api/v1/inventory/counts', {
    params: {
      query: {
        page,
        pageSize: PAGE_SIZE,
        targetType,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      },
    },
  });
  if (!response.ok || !data) {
    throw new Error('加载失败，请稍后重试');
  }
  return data;
}

// useSearchParams 在静态预渲染时需要 Suspense 边界（Next.js CSR bailout 要求）
export default function MobileInventoryCountsPage(): React.ReactElement {
  return (
    <Suspense fallback={<p className="p-6 text-mobile-body text-muted-foreground">加载中…</p>}>
      <MobileInventoryCountsPageInner />
    </Suspense>
  );
}

function MobileInventoryCountsPageInner(): React.ReactElement {
  const canManage = useCan('inventory:manage');
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetType: TargetType =
    searchParams.get('tab') === 'timber' ? 'timber' : 'raw_log';
  const [filters, setFilters] = useState(defaultMobileDateRange());
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);

  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['inventory-counts', targetType, index + 1, applied],
      queryFn: () => fetchCounts(index + 1, applied.dateFrom, applied.dateTo, targetType),
    })),
  });
  const items: CountRow[] = listQueries.flatMap((query) => query.data?.items ?? []);
  const lastQuery = listQueries[listQueries.length - 1];
  const total = lastQuery?.data?.total ?? 0;
  const loading = listQueries.some((query) => query.isFetching);
  const error = lastQuery?.isError ? '加载失败，请稍后重试' : null;
  const hasMore = items.length < total;

  return (
    <MobileListPage
      title="库存盘点"
      backHref="/m/production"
      headerAction={
        <Button
          type="button"
          variant="link"
          className="h-auto px-1 text-mobile-label"
          onClick={() => setHelpOpen(true)}
        >
          口径说明
        </Button>
      }
      search={
        <div className="space-y-3">
          <Segmented
            value={targetType === 'timber' ? 'timber' : 'raw'}
            ariaLabel="盘点类型"
            options={[
              { value: 'raw', label: '原木盘点' },
              { value: 'timber', label: '方木盘点' },
            ]}
            onValueChange={(next) => {
              setPage(1);
              router.replace(
                next === 'timber'
                  ? '/m/production/inventory/counts?tab=timber'
                  : '/m/production/inventory/counts',
              );
            }}
          />
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <MobileDateRangeFields
              dateFrom={filters.dateFrom}
              dateTo={filters.dateTo}
              onChange={setFilters}
            />
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                className="h-12 flex-1 text-mobile-body"
                onClick={() => {
                  setApplied(filters);
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
                  const defaults = defaultMobileDateRange();
                  setFilters(defaults);
                  setApplied(defaults);
                  setPage(1);
                }}
              >
                重置
              </Button>
            </div>
          </section>
        </div>
      }
      action={
        canManage ? (
          <Link
            href={`/m/production/inventory/counts/new?targetType=${targetType}`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            新建盘点
          </Link>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}
      {!error && loading && items.length === 0 ? <MobileListState>加载中…</MobileListState> : null}
      {!error && !loading && items.length === 0 ? <MobileListState>暂无盘点记录</MobileListState> : null}

      {items.map((row) => (
        <MobileListCard
          key={row.id}
          href={`/m/production/inventory/counts/${row.id}`}
          topLeft={row.adjustmentDate}
          topRight={row.targetType === 'timber' ? '方木' : '原木'}
          title={row.code}
          amount={`${formatAmount(row.differenceAmount)} 元`}
          amountClassName={row.differenceAmount.startsWith('-') ? 'text-destructive' : undefined}
          subtitle={`${row.operatorName} · 盘盈 ${row.gainCount} 项 · 盘亏 ${row.lossCount} 项`}
          note={row.note || undefined}
          footer={
            row.targetType === 'timber'
              ? `方木差异 ${formatQuantity(row.timberDifferenceVolume)} m³`
              : `原木差异 ${formatQuantity(row.rawDifferenceTons)} 吨`
          }
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((value) => value + 1)} />
      ) : null}
      <CountHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </MobileListPage>
  );
}
