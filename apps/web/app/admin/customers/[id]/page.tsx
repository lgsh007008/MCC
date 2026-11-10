'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { api } from '@/lib/api';

// 客户详情页（product/customer.md R-客户-001 页面设计）：信息条 + 联系信息 / 备注（只读）。
// 不嵌该客户的销售单列表（需求明确不做）；累计下单方量取 order 的汇总接口。

interface CustomerDetail {
  id: string;
  code: string;
  name: string;
  contact: string;
  status: string;
  note: string;
  createdAt: string;
}

export default function CustomerDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [volume, setVolume] = useState('0.0000');
  const [error, setError] = useState<string | null>(null);

  // 面包屑页面标识 = 客户编号
  usePageCrumb(customer ? [{ title: customer.code }] : []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/customers/{id}', {
          params: { path: { id: params.id } },
        });
        if (!cancelled) {
          if (response.ok && data) {
            setCustomer(data);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/sale-orders/customer-volume-summary', {
          params: { query: { customerIds: params.id } },
        });
        if (!cancelled && response.ok && data) {
          setVolume(data.items[0]?.totalVolume ?? '0.0000');
        }
      } catch {
        if (!cancelled) {
          setVolume('0.0000');
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
  if (!customer) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">
        {customer.name}
        <span className="ml-3 text-sm font-normal text-muted-foreground">（{customer.code}）</span>
      </h1>

      <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-card p-4 text-sm">
        <span>
          客户编号：<strong>{customer.code}</strong>
        </span>
        <span>
          状态：<strong>{customer.status === 'active' ? '启用' : '停用'}</strong>
        </span>
        <span>
          累计下单方量：<strong>{volume}</strong> m³
        </span>
        <span>
          创建日期：<strong>{customer.createdAt}</strong>
        </span>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
        <div>
          <span className="text-muted-foreground">联系信息：</span>
          <span className="whitespace-pre-wrap">{customer.contact || '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">备注：</span>
          <span className="whitespace-pre-wrap">{customer.note || '—'}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Link href={`/admin/customers/${customer.id}/edit`} className={buttonVariants()}>
          编辑
        </Link>
        <Link href="/admin/customers" className={buttonVariants({ variant: 'outline' })}>
          返回列表
        </Link>
      </div>
    </div>
  );
}
