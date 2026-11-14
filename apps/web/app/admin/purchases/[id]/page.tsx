'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useCan } from '@/components/auth/permission-context';
import { buttonVariants } from '@/components/ui/button';
import { api } from '@/lib/api';

// 采购单详情页（product/purchase.md R-采购-001）：与销售单 / 客户详情同构——
// 横排信息条 + 长文本卡；操作区只放编辑 / 返回列表，删除只在列表行操作。

type PurchaseDetail = ApiSchemas['PurchaseOrderDto'];

export default function PurchaseDetailPage(): React.ReactElement {
  const canManage = useCan('purchase:manage');
  const params = useParams<{ id: string }>();

  const orderQuery = useQuery({
    queryKey: ['purchases', params.id],
    queryFn: async (): Promise<PurchaseDetail> => {
      const { data: res, response } = await api
        .GET('/api/v1/purchase-orders/{id}', {
          params: { path: { id: params.id } },
        })
        .catch(() => {
          throw new Error('加载失败，请稍后重试');
        });
      if (!response.ok || !res) {
        throw new Error('采购单不存在或加载失败');
      }
      return res;
    },
  });

  const order = orderQuery.data;

  const accountsQuery = useQuery({
    queryKey: ['finance-accounts', 'options'],
    queryFn: async (): Promise<ApiSchemas['FinanceAccountDto'][]> => {
      const { data: res, response } = await api.GET('/api/v1/finance/accounts');
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items;
    },
    enabled: Boolean(order?.settleAccountId),
  });

  const accountName = order?.settleAccountId
    ? (accountsQuery.data?.find((item) => item.id === order.settleAccountId)?.name ?? '')
    : '';

  usePageCrumb(order ? [{ title: order.code }] : []);

  if (orderQuery.isError) {
    return <p className="text-sm text-destructive">{orderQuery.error.message}</p>;
  }
  if (orderQuery.isPending || !order) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <PageFrame
      title={
        <>
          采购单 {order.code}
          <span className="ml-3 text-xs font-normal text-muted-foreground">
            （{order.supplierName}）
          </span>
        </>
      }
      actions={
        <>
          {canManage ? (
            <Link href={`/admin/purchases/${order.id}/edit`} className={buttonVariants()}>
              编辑
            </Link>
          ) : null}
          <Link href="/admin/purchases" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-6 rounded-lg border border-border bg-card p-4 text-sm">
          <span>
            采购单号：<strong>{order.code}</strong>
          </span>
          <span>
            供应商：<strong>{order.supplierName}</strong>
          </span>
          <span>
            采购日期：<strong>{order.purchaseDate}</strong>
          </span>
          <span>
            结算方式：<strong>{order.settlementMode === 'settled' ? '现结' : '赊购'}</strong>
          </span>
          {order.settlementMode === 'settled' ? (
            <>
              <span>
                付款账户：<strong>{accountName || '—'}</strong>
              </span>
              <span>
                实付金额：<strong>{order.paidAmount ?? '—'}</strong> 元
              </span>
            </>
          ) : null}
          <span>
            创建日期：<strong>{order.createdAt}</strong>
          </span>
          {order.note ? <span>备注：{order.note}</span> : null}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <h2 className="text-sm font-semibold">吨数与金额</h2>
          <div className="flex flex-wrap gap-6">
            <span>
              送货吨数：<strong>{order.deliveredTons}</strong> 吨
            </span>
            <span>
              结算吨数：<strong>{order.settledTons}</strong> 吨
            </span>
            <span>
              单价：<strong>{order.unitPrice}</strong> 元/吨
            </span>
            <span>
              小计金额：<strong>{order.subtotalAmount}</strong> 元
            </span>
            <span>
              其他金额：<strong>{order.otherAmount}</strong> 元
            </span>
            <span>
              合计金额：<strong>{order.totalAmount}</strong> 元
            </span>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
