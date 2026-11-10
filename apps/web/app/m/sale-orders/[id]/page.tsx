'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Trash2Icon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCan } from '@/components/auth/permission-context';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 销售单移动详情（product/order.md 移动页）：只读卡片，无面包屑 / 标签页；
// 底部固定「编辑」「返回列表」；`order:manage` 在明细下方可删除整单（二次确认）。
interface SaleOrderItemDetail {
  id: string;
  pricingMode: 'volume' | 'piece';
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  pieces: number;
  volumeM3: string;
  price: string;
  lineAmount: string;
  otherAmount: string;
  note: string;
}

interface SaleOrderDetail {
  id: string;
  saleDate: string;
  customerName: string;
  totalVolume: string;
  subtotalAmount: string;
  otherAmount: string;
  totalAmount: string;
  note: string;
  items: SaleOrderItemDetail[];
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-base">{value}</span>
    </div>
  );
}

export default function MobileSaleOrderDetailPage(): React.ReactElement {
  const canManage = useCan('order:manage');
  const router = useRouter();
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<SaleOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/sale-orders/{id}', {
          params: { path: { id: params.id } },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('销售单不存在或加载失败');
          return;
        }
        setOrder(data);
      } catch {
        if (!cancelled) {
          setError('销售单不存在或加载失败');
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
        <MobileHeader title="销售单详情" backHref="/m/sale-orders" />
        <p className="p-4 text-base text-destructive">{error}</p>
      </div>
    );
  }
  if (!order) {
    return (
      <div>
        <MobileHeader title="销售单详情" backHref="/m/sale-orders" />
        <p className="p-4 text-base text-muted-foreground">加载中…</p>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <MobileHeader title="销售单详情" backHref="/m/sale-orders" />

      <div className="space-y-4 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">客户</p>
          <p className="mt-1 text-2xl font-semibold">{order.customerName}</p>
          <p className="mt-1 text-base text-muted-foreground tabular-nums">{order.saleDate}</p>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <InfoRow label="产品类型" value="方木" />
            <InfoRow label="备注" value={order.note || '—'} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">合计</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground">合计方量</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{order.totalVolume} m³</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">合计金额</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{order.totalAmount} 元</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            小计 {order.subtotalAmount} 元 · 其他 {order.otherAmount} 元
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-base font-semibold">明细（{order.items.length} 行）</h2>
          {order.items.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-medium">第 {index + 1} 行</span>
                <span className="text-lg font-semibold tabular-nums">{item.lineAmount} 元</span>
              </div>
              <p className="mt-2 text-base tabular-nums">
                {item.lengthMm} × {item.widthMm} × {item.heightMm} mm · {item.pieces} 根
              </p>
              <p className="mt-1 text-base text-muted-foreground">
                方量 {item.volumeM3} m³ · 单价 {item.price}{' '}
                {item.pricingMode === 'piece' ? '元/根' : '元/m³'}
                {item.otherAmount !== '0.00' ? ` · 其他 ${item.otherAmount} 元` : ''}
              </p>
              {item.note ? (
                <p className="mt-1 text-base text-muted-foreground">备注：{item.note}</p>
              ) : null}
            </div>
          ))}
        </section>

        {canManage ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              <Trash2Icon className="size-4" />
              删除销售单
            </Button>
            {deleteError ? (
              <p role="alert" className="text-base text-destructive">
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
            className={cn(buttonVariants(), 'h-12 flex-1 text-base')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/sale-orders"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-base')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
