'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import {
  MobileListCard,
  MobileListLoadMore,
  MobileListPage,
  MobileListSearch,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 销售单移动列表（product/order.md 移动页）：搜索（客户名称模糊）+ 卡片列表 + 加载更多；
// 样式统一走 components/mobile/list.tsx（与客户档案等移动列表一致）。
type OrderListItem = ApiSchemas['SaleOrderListItemDto'];
type OrderListPage = ApiSchemas['SaleOrderListDto'];

const PAGE_SIZE = 20;

async function fetchSaleOrders(page: number, customerName: string): Promise<OrderListPage> {
  const { data: res, response } = await api.GET('/api/v1/sale-orders', {
    params: {
      query: {
        page,
        pageSize: PAGE_SIZE,
        customerName: customerName || undefined,
        sortBy: 'saleDate',
        sortOrder: 'desc',
      },
    },
  });
  if (!response.ok || !res) {
    throw new Error('加载失败，请稍后重试');
  }
  return res;
}

export default function MobileSaleOrdersPage(): React.ReactElement {
  const [keyword, setKeyword] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);

  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['sale-orders', index + 1, applied],
      queryFn: () => fetchSaleOrders(index + 1, applied),
    })),
  });
  const items: OrderListItem[] = listQueries.flatMap((query) => query.data?.items ?? []);
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
      title="成品销售单"
      backHref="/m"
      search={
        <MobileListSearch
          value={keyword}
          onChange={setKeyword}
          onSearch={handleSearch}
          placeholder="搜索客户名称"
        />
      }
      action={
        <Link
          href="/m/sale-orders/new"
          className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
        >
          新建销售单
        </Link>
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}

      {!error && loading && items.length === 0 ? (
        <MobileListState>加载中…</MobileListState>
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <MobileListState>暂无销售单</MobileListState>
      ) : null}

      {items.map((order) => (
        <MobileListCard
          key={order.id}
          href={`/m/sale-orders/${order.id}`}
          topLeft={order.saleDate}
          title={order.customerName}
          note={`合计方量 ${order.totalVolume} m³`}
          amount={`${order.totalAmount} 元`}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((prev) => prev + 1)} />
      ) : null}
    </MobileListPage>
  );
}
