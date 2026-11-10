'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 销售单移动列表（product/order.md 移动页）：卡片列表 + 加载更多，无筛选 / 多选 / 批量操作；
// 底部固定「新建销售单」。数据与 PC 列表同一接口（按销售日期倒序）。
interface OrderListItem {
  id: string;
  code: string;
  saleDate: string;
  customerName: string;
  totalVolume: string;
  totalAmount: string;
}

const PAGE_SIZE = 20;

export default function MobileSaleOrdersPage(): React.ReactElement {
  const [items, setItems] = useState<OrderListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/sale-orders', {
          params: {
            query: { page, pageSize: PAGE_SIZE, sortBy: 'saleDate', sortOrder: 'desc' },
          },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('加载失败，请稍后重试');
          return;
        }
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
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
  }, [page]);

  const hasMore = items.length < total;

  return (
    <div className="pb-24">
      <MobileHeader title="成品销售单" backHref="/m" />

      <div className="space-y-3 p-4">
        {error ? <p className="text-base text-destructive">{error}</p> : null}

        {!error && loading && items.length === 0 ? (
          <p className="py-6 text-center text-base text-muted-foreground">加载中…</p>
        ) : null}

        {!error && !loading && items.length === 0 ? (
          <p className="py-6 text-center text-base text-muted-foreground">暂无销售单</p>
        ) : null}

        {items.map((order) => (
          <Link
            key={order.id}
            href={`/m/sale-orders/${order.id}`}
            className="block rounded-xl border border-border bg-card p-4 hover:bg-muted/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-medium tabular-nums">{order.saleDate}</p>
                <p className="mt-1 truncate text-base">{order.customerName}</p>
              </div>
              <ChevronRightIcon className="mt-1 size-5 shrink-0 text-muted-foreground" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-sm text-muted-foreground tabular-nums">{order.code}</span>
              <span className="text-xl font-semibold tabular-nums">{order.totalAmount} 元</span>
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">
              合计方量 {order.totalVolume} m³
            </p>
          </Link>
        ))}

        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-base"
            disabled={loading}
            onClick={() => setPage((prev) => prev + 1)}
          >
            {loading ? '加载中…' : '加载更多'}
          </Button>
        ) : null}
      </div>

      <MobileActionBar>
        <Link
          href="/m/sale-orders/new"
          className={cn(buttonVariants(), 'h-12 flex-1 text-base')}
        >
          新建销售单
        </Link>
      </MobileActionBar>
    </div>
  );
}
