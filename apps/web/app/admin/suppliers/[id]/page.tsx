'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { absMoney } from '@mcc/shared';
import type { ApiSchemas } from '@mcc/shared';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useCan } from '@/components/auth/permission-context';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

// 供应商详情页（product/supplier.md R-供应商-001）：与客户详情同构——
// 横排信息条（含应付三项）+ 联系信息 / 备注卡；操作区只放编辑 / 返回列表。

type SupplierDetail = ApiSchemas['SupplierDto'];

export default function SupplierDetailPage(): React.ReactElement {
  const canManage = useCan('supplier:manage');
  const params = useParams<{ id: string }>();

  const supplierQuery = useQuery({
    queryKey: ['suppliers', params.id],
    queryFn: async (): Promise<SupplierDetail> => {
      const { data: res, response } = await api
        .GET('/api/v1/suppliers/{id}', {
          params: { path: { id: params.id } },
        })
        .catch(() => {
          throw new Error('加载失败，请稍后重试');
        });
      if (!response.ok || !res) {
        throw new Error('供应商不存在或加载失败');
      }
      return res;
    },
  });

  const payableQuery = useQuery({
    queryKey: ['finance', 'payables', params.id],
    queryFn: async (): Promise<ApiSchemas['FinancePayableListDto']> => {
      const { data: res, response } = await api.GET('/api/v1/finance/payables', {
        params: { query: { supplierIds: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  const supplier = supplierQuery.data;
  const payableItem = payableQuery.data?.items[0];
  const payable = {
    purchases: payableItem?.purchases ?? '0.00',
    payments: payableItem?.payments ?? '0.00',
    outstanding: payableItem?.outstanding ?? '0.00',
  };

  usePageCrumb(supplier ? [{ title: supplier.code }] : []);

  if (supplierQuery.isError) {
    return <p className="text-sm text-destructive">{supplierQuery.error.message}</p>;
  }
  if (supplierQuery.isPending || !supplier) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  const outstanding =
    payable.outstanding.startsWith('-')
      ? `${absMoney(payable.outstanding)}（预付）`
      : payable.outstanding;

  return (
    <PageFrame
      title={
        <>
          {supplier.name}
          <span className="ml-3 text-xs font-normal text-muted-foreground">（{supplier.code}）</span>
        </>
      }
      actions={
        <>
          {canManage ? (
            <Link href={`/admin/suppliers/${supplier.id}/edit`} className={buttonVariants()}>
              编辑
            </Link>
          ) : null}
          <Link href="/admin/suppliers" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-card p-4 text-sm">
          <span>
            供应商编号：<strong>{supplier.code}</strong>
          </span>
          <span>
            名称：<strong>{supplier.name}</strong>
          </span>
          <span>
            状态：<strong>{supplier.status === 'active' ? '启用' : '停用'}</strong>
          </span>
          {supplier.openingPayable !== '0.00' ? (
            <span>
              期初应付：<strong>{supplier.openingPayable}</strong>
            </span>
          ) : null}
          <span>
            累计采购：<strong>{payable.purchases}</strong>
          </span>
          <span>
            累计付款：<strong>{payable.payments}</strong>
          </span>
          <span>
            应付：<strong>{outstanding}</strong>
          </span>
          <span>
            创建日期：<strong>{supplier.createdAt}</strong>
          </span>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <div>
            <span className="text-muted-foreground">联系信息：</span>
            <span className="whitespace-pre-wrap">{supplier.contact || '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">备注：</span>
            <span className="whitespace-pre-wrap">{supplier.note || '—'}</span>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
