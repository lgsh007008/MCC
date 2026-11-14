'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { absMoney } from '@mcc/shared';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { api } from '@/lib/api';

// 客户详情页（product/customer.md R-客户-001 页面设计）：信息条 + 联系信息 / 备注（只读）。
// 不嵌该客户的销售单列表（需求明确不做）；累计下单方量取 order 的汇总接口，
// 应收三项（累计销售 / 累计收款 / 欠款）取 finance 的批量应收接口。

type CustomerDetail = ApiSchemas['CustomerDto'];

export default function CustomerDetailPage(): React.ReactElement {
  const canManage = useCan('customer:manage');
  const params = useParams<{ id: string }>();

  const customerQuery = useQuery({
    queryKey: ['customers', params.id],
    queryFn: async (): Promise<CustomerDetail> => {
      const { data: res, response } = await api
        .GET('/api/v1/customers/{id}', {
          params: { path: { id: params.id } },
        })
        .catch(() => {
          throw new Error('加载失败，请稍后重试');
        });
      if (!response.ok || !res) {
        throw new Error('客户不存在或加载失败');
      }
      return res;
    },
  });

  const volumeQuery = useQuery({
    queryKey: ['sale-orders', 'customer-volume-summary', params.id],
    queryFn: async (): Promise<ApiSchemas['CustomerVolumeSummaryDto']> => {
      const { data: res, response } = await api.GET('/api/v1/sale-orders/customer-volume-summary', {
        params: { query: { customerIds: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  const receivableQuery = useQuery({
    queryKey: ['finance', 'receivables', params.id],
    queryFn: async (): Promise<ApiSchemas['FinanceReceivableListDto']> => {
      const { data: res, response } = await api.GET('/api/v1/finance/receivables', {
        params: { query: { customerIds: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  const customer = customerQuery.data;
  const volume = volumeQuery.data?.items[0]?.totalVolume ?? '0.0000';
  const receivableItem = receivableQuery.data?.items[0];
  const receivable = {
    sales: receivableItem?.sales ?? '0.00',
    receipts: receivableItem?.receipts ?? '0.00',
    outstanding: receivableItem?.outstanding ?? '0.00',
  };

  // 面包屑页面标识 = 客户编号
  usePageCrumb(customer ? [{ title: customer.code }] : []);

  if (customerQuery.isError) {
    return <p className="text-sm text-destructive">{customerQuery.error.message}</p>;
  }
  if (customerQuery.isPending || !customer) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <PageFrame
      title={
        <>
          {customer.name}
          <span className="ml-3 text-xs font-normal text-muted-foreground">
            （{customer.code}）
          </span>
        </>
      }
      actions={
        <>
          {canManage ? (
            <Link href={`/admin/customers/${customer.id}/edit`} className={buttonVariants()}>
              编辑
            </Link>
          ) : null}
          <Link href="/admin/customers" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <div className="space-y-4">
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
          累计销售：<strong>{receivable.sales}</strong>
        </span>
        <span>
          累计收款：<strong>{receivable.receipts}</strong>
        </span>
        {customer.openingDebt !== '0.00' ? (
          <span>
            期初欠款：<strong>{customer.openingDebt}</strong>
          </span>
        ) : null}
        <span>
          欠款：
          <strong>
            {receivable.outstanding.startsWith('-')
              ? `${absMoney(receivable.outstanding)}（预收）`
              : receivable.outstanding}
          </strong>
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

      </div>
    </PageFrame>
  );
}
