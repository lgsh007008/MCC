'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { SupplierForm } from '@/components/supplier/supplier-form';
import { api } from '@/lib/api';

// 供应商编辑页（product/supplier.md R-供应商-001）：与新建共用表单组件。
export default function SupplierEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();

  const supplierQuery = useQuery({
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
  const supplier = supplierQuery.data;
  const initial = supplier
    ? {
        code: supplier.code,
        name: supplier.name,
        contact: supplier.contact,
        openingPayable: supplier.openingPayable,
        note: supplier.note,
      }
    : undefined;
  const error = supplierQuery.isError ? '供应商不存在或加载失败' : null;

  usePageCrumb(initial ? [{ title: initial.code }, { title: '编辑' }] : [{ title: '编辑' }]);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  return (
    <SupplierForm
      title={
        <>
          编辑供应商
          <span className="ml-3 text-xs font-normal text-muted-foreground">（{initial.code}）</span>
        </>
      }
      supplierId={params.id}
      initial={initial}
    />
  );
}
