'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import {
  MobileSupplierForm,
  type MobileSupplierFormInitial,
} from '@/components/mobile/supplier-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';

// 供应商移动编辑（product/supplier.md 移动页）。
export default function MobileSupplierEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data, isError } = useQuery({
    queryKey: ['suppliers', params.id],
    queryFn: async (): Promise<ApiSchemas['SupplierDto']> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('供应商不存在或加载失败');
      }
      return res;
    },
  });

  const initial: MobileSupplierFormInitial | undefined = data
    ? {
        code: data.code,
        name: data.name,
        contact: data.contact,
        openingPayable: data.openingPayable,
        note: data.note,
      }
    : undefined;

  const error = isError && !initial ? '供应商不存在或加载失败' : null;

  if (error) {
    return (
      <div>
        <MobileHeader title="编辑供应商" backHref="/m/purchase/suppliers" />
        <p className="p-4 text-mobile-body text-destructive">{error}</p>
      </div>
    );
  }
  if (!initial) {
    return (
      <div>
        <MobileHeader title="编辑供应商" backHref="/m/purchase/suppliers" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  return <MobileSupplierForm title="编辑供应商" supplierId={params.id} initial={initial} />;
}
