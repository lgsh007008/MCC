'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import {
  MobileListCard,
  MobileListLoadMore,
  MobileListPage,
  MobileListSearch,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 采购单移动列表（product/purchase.md 移动页）：搜索（供应商名称模糊）+ 卡片列表 + 加载更多；
// 查询交互与销售单列表一致（回车查询、清除、回第 1 页）。
type PurchaseListItem = ApiSchemas['PurchaseOrderDto'];
type PurchaseListPage = ApiSchemas['PurchaseOrderListDto'];

const PAGE_SIZE = 20;

async function fetchPurchaseOrders(page: number, supplierName: string): Promise<PurchaseListPage> {
  const { data: res, response } = await api.GET('/api/v1/purchase-orders', {
    params: {
      query: {
        page,
        pageSize: PAGE_SIZE,
        supplierName: supplierName || undefined,
      },
    },
  });
  if (!response.ok || !res) {
    throw new Error('加载失败，请稍后重试');
  }
  return res;
}

export default function MobilePurchasesPage(): React.ReactElement {
  const canManage = useCan('purchase:manage');
  const [keyword, setKeyword] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);

  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['purchase-orders', index + 1, applied],
      queryFn: () => fetchPurchaseOrders(index + 1, applied),
    })),
  });
  const items: PurchaseListItem[] = listQueries.flatMap((query) => query.data?.items ?? []);
  const lastQuery = listQueries[listQueries.length - 1];
  const total = listQueries.reduce((acc, query) => query.data?.total ?? acc, 0);
  const loading = listQueries.some((query) => query.isFetching);
  const error = lastQuery?.isError ? '加载失败，请稍后重试' : null;

  const handleSearch = (value?: string): void => {
    setApplied((value ?? keyword).trim());
    setPage(1);
  };

  const hasMore = items.length < total;

  return (
    <MobileListPage
      title="采购单"
      backHref="/m/purchase"
      search={
        <MobileListSearch
          value={keyword}
          onChange={setKeyword}
          onSearch={handleSearch}
          placeholder="搜索供应商名称"
        />
      }
      action={
        canManage ? (
          <Link
            href="/m/purchase/orders/new"
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            新建采购单
          </Link>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}
      {!error && loading && items.length === 0 ? (
        <MobileListState>加载中…</MobileListState>
      ) : null}
      {!error && !loading && items.length === 0 ? (
        <MobileListState>暂无采购单</MobileListState>
      ) : null}

      {items.map((order) => (
        <MobileListCard
          key={order.id}
          href={`/m/purchase/orders/${order.id}`}
          topRight={order.settlementMode === 'settled' ? '现结' : '赊购'}
          title={order.supplierName}
          subtitle={`${order.purchaseDate} · 合计 ${order.totalAmount}`}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((value) => value + 1)} />
      ) : null}
    </MobileListPage>
  );
}
