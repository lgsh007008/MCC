'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { CustomerForm } from '@/components/customer/customer-form';
import { api } from '@/lib/api';

// 客户编辑页（product/customer.md R-客户-001 页面设计）：加载现有客户后进入共用表单。
export default function CustomerEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();

  const customerQuery = useQuery({
    queryKey: ['customers', params.id],
    queryFn: async (): Promise<ApiSchemas['CustomerDto']> => {
      const { data: res, response } = await api.GET('/api/v1/customers/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('客户不存在或加载失败');
      }
      return res;
    },
  });
  const initial = customerQuery.data;
  const error = customerQuery.isError ? '客户不存在或加载失败' : null;

  // 面包屑页面标识：编号（链接回详情）/ 编辑
  usePageCrumb(
    initial
      ? [{ title: initial.code, href: `/admin/customers/${params.id}` }, { title: '编辑' }]
      : [],
  );

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!initial) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <CustomerForm
      title={`编辑客户 ${initial.code}`}
      customerId={params.id}
      initial={initial}
    />
  );
}
