'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import {
  MobilePurchaseForm,
  type MobilePurchaseFormInitial,
} from '@/components/mobile/purchase-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';

// 采购单移动编辑（product/purchase.md 移动页）：与新建共用表单。
export default function MobilePurchaseEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data, isError } = useQuery({
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

  const initial: MobilePurchaseFormInitial | undefined = data
    ? {
        code: data.code,
        supplierId: data.supplierId,
        supplierName: data.supplierName,
        purchaseDate: data.purchaseDate,
        deliveredTons: data.deliveredTons,
        settledTons: data.settledTons,
        unitPrice: data.unitPrice,
        otherAmount: data.otherAmount,
        settlementMode: data.settlementMode === 'settled' ? 'settled' : 'credit',
        settleAccountId: data.settleAccountId ?? null,
        paidAmount: data.paidAmount ?? null,
        note: data.note,
      }
    : undefined;

  const error = isError && !initial ? '采购单不存在或加载失败' : null;

  if (error) {
    return (
      <div>
        <MobileHeader title="编辑采购单" backHref="/m/purchase/orders" />
        <p className="p-4 text-mobile-body text-destructive">{error}</p>
      </div>
    );
  }
  if (!initial) {
    return (
      <div>
        <MobileHeader title="编辑采购单" backHref="/m/purchase/orders" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  return <MobilePurchaseForm orderId={params.id} initial={initial} />;
}
