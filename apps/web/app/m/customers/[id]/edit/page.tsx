'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { MobileCustomerForm } from '@/components/mobile/customer-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileListState } from '@/components/mobile/list';
import { api } from '@/lib/api';

// 客户移动编辑页（product/customer.md 移动页）：加载现有档案后进入共用移动表单。
export default function MobileCustomerEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data: initial, isError } = useQuery({
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

  const error = isError && !initial ? '客户不存在或加载失败' : null;

  if (error) {
    return (
      <div>
        <MobileHeader title="编辑客户" backHref="/m/customers" />
        <MobileListState tone="error">{error}</MobileListState>
      </div>
    );
  }
  if (!initial) {
    return (
      <div>
        <MobileHeader title="编辑客户" backHref="/m/customers" />
        <MobileListState>加载中…</MobileListState>
      </div>
    );
  }
  return <MobileCustomerForm customerId={params.id} initial={initial} />;
}
