'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { SaleOrderForm, type SaleOrderFormInitial } from '@/components/order/sale-order-form';
import { api } from '@/lib/api';

// 销售单编辑页（product/order.md R-订单-001 页面设计）：加载现有单据后进入共用表单。
export default function SaleOrderEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  // 与详情页共用同一查询键：详情 ↔ 编辑切换直接命中缓存，先渲染再后台刷新
  const { data: initial, error: queryError } = useQuery({
    queryKey: ['sale-order', params.id],
    queryFn: async (): Promise<SaleOrderFormInitial> => {
      const { data, response } = await api.GET('/api/v1/sale-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !data) {
        throw new Error('销售单不存在或加载失败');
      }
      return data;
    },
  });
  const error = queryError ? '销售单不存在或加载失败' : null;

  // 面包屑页面标识：单号（链接回详情）/ 编辑（product/order.md 表单页）
  usePageCrumb(
    initial
      ? [{ title: initial.code, href: `/admin/sale-orders/${params.id}` }, { title: '编辑' }]
      : [],
  );

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return <SaleOrderForm title={`编辑销售单 ${initial.code}`} orderId={params.id} initial={initial} />;
}