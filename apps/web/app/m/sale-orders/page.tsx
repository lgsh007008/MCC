'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
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
interface OrderListItem {
  id: string;
  saleDate: string;
  customerName: string;
  totalVolume: string;
  totalAmount: string;
}

const PAGE_SIZE = 20;

export default function MobileSaleOrdersPage(): React.ReactElement {
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState({ keyword: '', page: 1 });
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/sale-orders', {
          params: {
            query: {
              page: query.page,
              pageSize: PAGE_SIZE,
              customerName: query.keyword || undefined,
              sortBy: 'saleDate',
              sortOrder: 'desc',
            },
          },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('加载失败，请稍后重试');
          return;
        }
        setItems((prev) => (query.page === 1 ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setError(null);
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
  }, [query]);

  const handleSearch = (value?: string): void => {
    const next = (value ?? keyword).trim();
    setItems([]);
    setTotal(0);
    setQuery({ keyword: next, page: 1 });
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
          className={cn(buttonVariants(), 'h-12 flex-1 text-base')}
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
        <MobileListCard key={order.id} href={`/m/sale-orders/${order.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-medium tabular-nums">{order.saleDate}</p>
              <p className="mt-1 truncate text-base">{order.customerName}</p>
            </div>
            <ChevronRightIcon className="mt-1 size-5 shrink-0 text-muted-foreground" />
          </div>
          <div className="mt-3 flex items-end justify-between gap-3">
            <span className="text-sm text-muted-foreground tabular-nums">
              合计方量 {order.totalVolume} m³
            </span>
            <span className="text-xl font-semibold tabular-nums">{order.totalAmount} 元</span>
          </div>
        </MobileListCard>
      ))}

      {hasMore ? (
        <MobileListLoadMore
          loading={loading}
          onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
        />
      ) : null}
    </MobileListPage>
  );
}
