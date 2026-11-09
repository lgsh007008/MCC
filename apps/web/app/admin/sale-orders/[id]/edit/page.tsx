'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { SaleOrderForm, type SaleOrderFormInitial } from '@/components/order/sale-order-form';
import { api } from '@/lib/api';

// 销售单编辑页（product/order.md R-订单-001 页面设计）：加载现有单据后进入共用表单。
export default function SaleOrderEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<SaleOrderFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 面包屑页面标识：单号（链接回详情）/ 编辑（product/order.md 表单页）
  usePageCrumb(
    initial
      ? [{ title: initial.code, href: `/admin/sale-orders/${params.id}` }, { title: '编辑' }]
      : [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/sale-orders/{id}', {
          params: { path: { id: params.id } },
        });
        if (!cancelled) {
          if (response.ok && data) {
            setInitial(data);
          } else {
            setError('销售单不存在或加载失败');
          }
        }
      } catch {
        if (!cancelled) {
          setError('加载失败，请稍后重试');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">编辑销售单 {initial.code}</h1>
      <SaleOrderForm orderId={params.id} initial={initial} />
    </div>
  );
}