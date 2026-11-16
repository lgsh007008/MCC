'use client';

import { useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { ProductionBatchDialog } from '@/components/production/batch-dialog';
import {
  MobileListCard,
  MobileListLoadMore,
  MobileListPage,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 移动生产批次列表（product/生产与库存.md R-生产-006）。

type BatchList = ApiSchemas['ProductionBatchListDto'];
type BatchRow = ApiSchemas['ProductionBatchDto'];

const PAGE_SIZE = 20;

async function fetchBatches(page: number): Promise<BatchList> {
  const { data, response } = await api.GET('/api/v1/production-batches', {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });
  if (!response.ok || !data) {
    throw new Error('加载失败，请稍后重试');
  }
  return data;
}

export default function MobileProductionBatchesPage(): React.ReactElement {
  const canManage = useCan('production:manage');
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['production-batches', index + 1],
      queryFn: () => fetchBatches(index + 1),
    })),
  });
  const items: BatchRow[] = listQueries.flatMap((query) => query.data?.items ?? []);
  const lastQuery = listQueries[listQueries.length - 1];
  const total = lastQuery?.data?.total ?? 0;
  const loading = listQueries.some((query) => query.isFetching);
  const error = lastQuery?.isError ? '加载失败，请稍后重试' : null;
  const hasMore = items.length < total;

  return (
    <MobileListPage
      title="生产批次"
      backHref="/m/production"
      action={
        canManage ? (
          <Button
            type="button"
            className="h-12 flex-1 text-mobile-body"
            onClick={() => setDialogOpen(true)}
          >
            新建生产批次
          </Button>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}
      {!error && loading && items.length === 0 ? <MobileListState>加载中…</MobileListState> : null}
      {!error && !loading && items.length === 0 ? <MobileListState>暂无生产批次</MobileListState> : null}

      {items.map((row) => (
        <MobileListCard
          key={row.id}
          href={`/m/production/batches/${row.id}`}
          topLeft={row.batchDate}
          topRight={row.status === 'open' ? '进行中' : row.kind === 'opening' ? '期初' : '已关闭'}
          title={row.code}
          amount={`${formatQuantity(row.timberVolume)} m³`}
          subtitle={`批次金额 ${formatAmount(row.timberAmount)} 元 · 待结转 ${formatAmount(row.pendingAmount)} 元`}
          note={row.note || undefined}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((value) => value + 1)} />
      ) : null}
      <ProductionBatchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setPage(1);
          void queryClient.invalidateQueries({ queryKey: ['production-batches'] });
        }}
      />
    </MobileListPage>
  );
}
