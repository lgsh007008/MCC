'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { MobileSaleOrderForm } from '@/components/mobile/sale-order-form';
import { api } from '@/lib/api';

// 销售单移动编辑页（product/order.md 移动页）：加载现有单据后进入共用移动表单。
export default function MobileSaleOrderEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data: initial, isError } = useQuery({
    queryKey: ['sale-orders', params.id],
    queryFn: async (): Promise<ApiSchemas['SaleOrderDto']> => {
      const { data: res, response } = await api.GET('/api/v1/sale-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('销售单不存在或加载失败');
      }
      return res;
    },
  });

  const error = isError && !initial ? '销售单不存在或加载失败' : null;

  if (error) {
    return <p className="p-4 text-mobile-body text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>;
  }
  return <MobileSaleOrderForm orderId={params.id} initial={initial} />;
}
