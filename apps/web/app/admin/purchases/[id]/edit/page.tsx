'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { PurchaseForm, type PurchaseFormInitial } from '@/components/purchase/purchase-form';
import { api } from '@/lib/api';

// 采购单编辑页（product/purchase.md R-采购-001）：与新建共用表单组件。
export default function PurchaseEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();

  const purchaseQuery = useQuery({
    queryKey: ['purchases', params.id],
    queryFn: async (): Promise<ApiSchemas['PurchaseOrderDto']> => {
      const { data: res, response } = await api.GET('/api/v1/purchase-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('采购单不存在或加载失败');
      }
      return res;
    },
  });
  const purchase = purchaseQuery.data;
  const initial: PurchaseFormInitial | undefined = purchase
    ? {
        code: purchase.code,
        supplierId: purchase.supplierId,
        supplierName: purchase.supplierName,
        purchaseDate: purchase.purchaseDate,
        deliveredTons: purchase.deliveredTons,
        settledTons: purchase.settledTons,
        unitPrice: purchase.unitPrice,
        otherAmount: purchase.otherAmount,
        settlementMode: purchase.settlementMode === 'settled' ? 'settled' : 'credit',
        settleAccountId: purchase.settleAccountId ?? null,
        paidAmount: purchase.paidAmount ?? null,
        note: purchase.note,
      }
    : undefined;
  const error = purchaseQuery.isError ? '采购单不存在或加载失败' : null;

  usePageCrumb(initial ? [{ title: initial.code }, { title: '编辑' }] : [{ title: '编辑' }]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  return (
    <PurchaseForm
      title={
        <>
          编辑采购单
          <span className="ml-3 text-xs font-normal text-muted-foreground">（{initial.code}）</span>
        </>
      }
      orderId={params.id}
      initial={initial}
    />
  );
}
