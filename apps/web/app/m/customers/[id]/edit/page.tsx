'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileCustomerForm, type MobileCustomerFormInitial } from '@/components/mobile/customer-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileListState } from '@/components/mobile/list';
import { api } from '@/lib/api';

// 客户移动编辑页（product/customer.md 移动页）：加载现有档案后进入共用移动表单。
export default function MobileCustomerEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<MobileCustomerFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/customers/{id}', {
          params: { path: { id: params.id } },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('客户不存在或加载失败');
          return;
        }
        setInitial(data);
      } catch {
        if (!cancelled) {
          setError('客户不存在或加载失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

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
