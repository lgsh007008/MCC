'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileSaleOrderForm } from '@/components/mobile/sale-order-form';
import type { SaleOrderFormInitial } from '@/components/order/sale-order-form';
import { api } from '@/lib/api';

// 销售单移动编辑页（product/order.md 移动页）：加载现有单据后进入共用移动表单。
export default function MobileSaleOrderEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<SaleOrderFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/sale-orders/{id}', {
          params: { path: { id: params.id } },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('销售单不存在或加载失败');
          return;
        }
        setInitial(data);
      } catch {
        if (!cancelled) {
          setError('销售单不存在或加载失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return <p className="p-4 text-base text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="p-4 text-base text-muted-foreground">加载中…</p>;
  }
  return <MobileSaleOrderForm orderId={params.id} initial={initial} />;
}
