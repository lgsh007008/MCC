'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { CustomerForm, type CustomerFormInitial } from '@/components/customer/customer-form';
import { api } from '@/lib/api';

// 客户编辑页（product/customer.md R-客户-001 页面设计）：加载现有客户后进入共用表单。
export default function CustomerEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<CustomerFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 面包屑页面标识：编号（链接回详情）/ 编辑
  usePageCrumb(
    initial
      ? [{ title: initial.code, href: `/admin/customers/${params.id}` }, { title: '编辑' }]
      : [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/customers/{id}', {
          params: { path: { id: params.id } },
        });
        if (!cancelled) {
          if (response.ok && data) {
            setInitial(data);
          } else {
            setError('客户不存在或加载失败');
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
      <h1 className="text-xl font-semibold">编辑客户 {initial.code}</h1>
      <CustomerForm customerId={params.id} initial={initial} />
    </div>
  );
}
