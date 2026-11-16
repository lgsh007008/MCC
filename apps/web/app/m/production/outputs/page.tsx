'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { OutputCostHelpDialog } from '@/components/production/output-cost-help-dialog';
import {
  MobileListCard,
  MobileListLoadMore,
  MobileListPage,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

// 移动方木产出列表（product/生产与库存.md R-生产-005）：
// 卡片按产出日期倒序 + 加载更多 + 底部新建；不设筛选组与批量操作。

type OutputList = ApiSchemas['ProductionOutputListDto'];
type OutputRow = ApiSchemas['ProductionOutputListItemDto'];

const PAGE_SIZE = 20;

async function fetchOutputs(page: number): Promise<OutputList> {
  const { data, response } = await api.GET('/api/v1/production-outputs', {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });
  if (!response.ok || !data) {
    throw new Error('加载失败，请稍后重试');
  }
  return data;
}

export default function MobileProductionOutputsPage(): React.ReactElement {
  const canManage = useCan('production:manage');
  const [page, setPage] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['production-outputs', index + 1],
      queryFn: () => fetchOutputs(index + 1),
    })),
  });
  const items: OutputRow[] = listQueries.flatMap((query) => query.data?.items ?? []);
  const lastQuery = listQueries[listQueries.length - 1];
  const total = lastQuery?.data?.total ?? 0;
  const loading = listQueries.some((query) => query.isFetching);
  const error = lastQuery?.isError ? '加载失败，请稍后重试' : null;
  const hasMore = items.length < total;

  return (
    <MobileListPage
      title="方木产出"
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
      action={
        canManage ? (
          <Link
            href="/m/production/outputs/new"
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            新建方木产出
          </Link>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}
      {!error && loading && items.length === 0 ? <MobileListState>加载中…</MobileListState> : null}
      {!error && !loading && items.length === 0 ? <MobileListState>暂无方木产出单</MobileListState> : null}

      {items.map((row) => (
        <MobileListCard
          key={row.id}
          href={`/m/production/outputs/${row.id}`}
          topLeft={row.outputDate}
          title={row.code}
          amount={`${formatQuantity(row.totalVolume)} m³`}
          subtitle={`批次 ${row.batchCode} · ${row.lineCount} 行产出 · 本次结转 ${formatAmount(row.settledAmount)} 元`}
          note={row.note || undefined}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((value) => value + 1)} />
      ) : null}
      <OutputCostHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </MobileListPage>
  );
}
