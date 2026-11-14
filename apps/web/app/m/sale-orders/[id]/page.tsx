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
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 销售单移动详情（product/order.md 移动页）：只读卡片，无面包屑 / 标签页；
// 底部固定「编辑」「返回列表」；`order:manage` 在明细下方可删除整单（二次确认）。
type SaleOrderDetail = ApiSchemas['SaleOrderDto'];

export default function MobileSaleOrderDetailPage(): React.ReactElement {
  const canManage = useCan('order:manage');
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['sale-orders', params.id],
    queryFn: async (): Promise<SaleOrderDetail> => {
      const { data: res, response } = await api.GET('/api/v1/sale-orders/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('销售单不存在或加载失败');
      }
      return res;
    },
  });

  // 现结收款账户名称：DTO 只带 id，经账户列表匹配（与 PC 详情同法）
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
  const settleAccountName =
    accountsQuery.data?.find((item) => item.id === order?.settleAccountId)?.name ?? '';
  const error = orderQuery.isError && !order ? '销售单不存在或加载失败' : null;

  async function handleDelete(): Promise<void> {
    setDeleteError(null);
    try {
      await confirm({
        title: '删除销售单',
        description: `${order?.customerName ?? ''} · ${order?.saleDate ?? ''}，删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          setDeleting(true);
          try {
            const { response } = await api.DELETE('/api/v1/sale-orders/{id}', {
              params: { path: { id: params.id } },
            });
            if (!response.ok) {
              throw new Error('删除失败，请稍后重试');
            }
            await queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
            router.replace('/m/sale-orders');
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
        <MobileHeader title="销售单详情" backHref="/m/sale-orders" />
        <p className="p-4 text-mobile-body text-destructive">{error}</p>
      </div>
    );
  }
  if (!order) {
    return (
      <div>
        <MobileHeader title="销售单详情" backHref="/m/sale-orders" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }

  const settled = order.settlementMode === 'settled';
  const settlementDiff = settled
    ? calcSettlementDifference(order.totalAmount, order.receivedAmount)
    : '0.00';
  const settlementText = settled
    ? `现结 · ${settleAccountName || '账户已删除'} · 实收 ${order.receivedAmount} 元${
        settlementDiff === '0.00'
          ? ''
          : settlementDiff.startsWith('-')
            ? `（预收 ${settlementDiff.slice(1)} 元）`
            : `（抹零 ${settlementDiff} 元）`
      }`
    : '赊销';

  return (
    <div className="pb-24">
      <MobileHeader title="销售单详情" backHref="/m/sale-orders" />

      <div className="space-y-4 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-mobile-label text-muted-foreground">客户</p>
          <p className="mt-1 text-mobile-title font-semibold">{order.customerName}</p>
          <p className="mt-1 text-mobile-body text-muted-foreground tabular-nums">{order.saleDate}</p>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <MobileInfoRow label="产品类型" value="方木" />
            <MobileInfoRow label="结算方式" value={settlementText} />
            <MobileInfoRow label="备注" value={order.note || '—'} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-mobile-label text-muted-foreground">合计</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-mobile-label text-muted-foreground">合计方量</p>
              <p className="mt-1 text-mobile-numeric font-semibold tabular-nums">
                {order.totalVolume} m³
              </p>
            </div>
            <div>
              <p className="text-mobile-label text-muted-foreground">合计金额</p>
              <p className="mt-1 text-mobile-numeric font-semibold tabular-nums">
                {order.totalAmount} 元
              </p>
            </div>
          </div>
          <p className="mt-2 text-mobile-label text-muted-foreground">
            小计 {order.subtotalAmount} 元 · 其他 {order.otherAmount} 元
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-mobile-body font-semibold">明细（{order.items.length} 行）</h2>
          {order.items.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-mobile-body font-medium">第 {index + 1} 行</span>
                <span className="text-mobile-numeric font-semibold tabular-nums">
                  {item.lineAmount} 元
                </span>
              </div>
              <p className="mt-2 text-mobile-label tabular-nums">
                {item.lengthMm} × {item.widthMm} × {item.heightMm} mm · {item.pieces} 根
              </p>
              <p className="mt-1 text-mobile-label text-muted-foreground">
                方量 {item.volumeM3} m³ · 单价 {item.price}{' '}
                {item.pricingMode === 'piece' ? '元/根' : '元/m³'}
                {item.otherAmount !== '0.00' ? ` · 其他 ${item.otherAmount} 元` : ''}
              </p>
              {item.note ? (
                <p className="mt-1 text-mobile-label text-muted-foreground">备注：{item.note}</p>
              ) : null}
            </div>
          ))}
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
              删除销售单
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
            href={`/m/sale-orders/${order.id}/edit`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/sale-orders"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
