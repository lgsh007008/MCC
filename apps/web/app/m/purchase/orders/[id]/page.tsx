'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { calcSettlementDifference, type ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCan } from '@/components/auth/permission-context';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileListState } from '@/components/mobile/list';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 采购单移动详情（product/purchase.md 移动页）：与销售单详情同构——
// 固定标题「采购单详情」；主卡（供应商 + 日期 + 结算方式 + 备注）；「吨数与金额」独立分区；
// 内容区危险操作（描边 + 图标 + 错误提示）；底部 MobileActionBar 只放编辑 / 返回。
type PurchaseDetail = ApiSchemas['PurchaseOrderDto'];

export default function MobilePurchaseDetailPage(): React.ReactElement {
  const canManage = useCan('purchase:manage');
  const confirm = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['purchases', params.id],
    queryFn: async (): Promise<PurchaseDetail> => {
      const { data: res, response } = await api.GET('/api/v1/purchase-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('采购单不存在或加载失败');
      }
      return res;
    },
  });

  // 现结付款账户名称：DTO 只带 id，经账户列表匹配（与销售单详情同法）
  const accountsQuery = useQuery({
    queryKey: ['finance-accounts'],
    queryFn: async (): Promise<ApiSchemas['FinanceAccountDto'][]> => {
      const { data: res, response } = await api.GET('/api/v1/finance/accounts');
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items;
    },
    enabled: Boolean(orderQuery.data?.settleAccountId),
  });

  const order = orderQuery.data;
  const accountName =
    accountsQuery.data?.find((item) => item.id === order?.settleAccountId)?.name ?? '';
  const error = orderQuery.isError && !order ? '采购单不存在或加载失败' : null;

  async function handleDelete(): Promise<void> {
    setDeleteError(null);
    try {
      await confirm({
        title: '删除采购单',
        description: `${order?.supplierName ?? ''} · ${order?.purchaseDate ?? ''}，删除后不可恢复，编号不回收；现结派生的付款流水一并删除，账户余额回退。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          setDeleting(true);
          try {
            const { response } = await api.DELETE('/api/v1/purchase-orders/{id}', {
              params: { path: { id: params.id } },
            });
            if (!response.ok) {
              throw new Error('删除失败，请稍后重试');
            }
            await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
            router.replace('/m/purchase/orders');
          } finally {
            setDeleting(false);
          }
        },
      });
    } catch {
      setDeleteError('删除失败，请稍后重试');
    }
  }

  if (error) {
    return (
      <div>
        <MobileHeader title="采购单详情" backHref="/m/purchase/orders" />
        <MobileListState tone="error">{error}</MobileListState>
      </div>
    );
  }
  if (!order) {
    return (
      <div>
        <MobileHeader title="采购单详情" backHref="/m/purchase/orders" />
        <MobileListState>加载中…</MobileListState>
      </div>
    );
  }

  const settled = order.settlementMode === 'settled';
  const settlementDiff = settled
    ? calcSettlementDifference(order.totalAmount, order.paidAmount ?? '0.00')
    : '0.00';
  const settlementText = settled
    ? `现结 · ${accountName || '账户已删除'} · 实付 ${order.paidAmount ?? '—'} 元${
        settlementDiff === '0.00'
          ? ''
          : settlementDiff.startsWith('-')
            ? `（预付 ${settlementDiff.slice(1)} 元）`
            : `（抹零 ${settlementDiff} 元）`
      }`
    : '赊购';

  return (
    <div className="pb-24">
      <MobileHeader title="采购单详情" backHref="/m/purchase/orders" />

      <div className="space-y-4 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-mobile-label text-muted-foreground">供应商</p>
          <p className="mt-1 text-mobile-title font-semibold">{order.supplierName}</p>
          <p className="mt-1 text-mobile-body text-muted-foreground tabular-nums">
            {order.purchaseDate}
          </p>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <MobileInfoRow label="结算方式" value={settlementText} />
            <MobileInfoRow label="备注" value={order.note || '—'} />
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-mobile-body font-semibold">吨数与金额</h2>
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <MobileInfoRow label="送货吨数" value={`${order.deliveredTons} 吨`} />
            <MobileInfoRow label="结算吨数" value={`${order.settledTons} 吨`} />
            <MobileInfoRow label="单价" value={`${order.unitPrice} 元/吨`} />
            <MobileInfoRow label="小计金额" value={`${order.subtotalAmount} 元`} />
            <MobileInfoRow label="其他金额" value={`${order.otherAmount} 元`} />
            <div className="border-t border-border pt-2">
              <MobileInfoRow
                label="合计金额"
                value={
                  <span className="font-semibold tabular-nums">{order.totalAmount} 元</span>
                }
              />
            </div>
          </div>
        </section>

        {canManage ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-mobile-body text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              <Trash2Icon className="size-4" />
              删除采购单
            </Button>
            {deleteError ? (
              <p role="alert" className="text-mobile-body text-destructive">
                {deleteError}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <MobileActionBar>
        {canManage ? (
          <Link
            href={`/m/purchase/orders/${order.id}/edit`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/purchase/orders"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
