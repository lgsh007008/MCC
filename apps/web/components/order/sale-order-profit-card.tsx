'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MaterialProfitHelpDialog } from '@/components/production/material-profit-help-dialog';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { api } from '@/lib/api';

type Profit = ApiSchemas['SaleOrderProfitDto'];

function statusLabel(status: Profit['materialCostStatus']): string {
  return status === 'final' ? '已锁定' : '成本待补';
}

function profitText(profit: Profit): string {
  return profit.materialProfit ?? '—';
}

function marginText(profit: Profit): string {
  return profit.materialMargin === null ? '—' : `${profit.materialMargin}%`;
}

export function SaleOrderProfitCard({ orderId }: { orderId: string }): React.ReactElement | null {
  const canView = useCan('profit:view');
  const canManage = useCan('profit:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const query = useQuery({
    queryKey: ['sale-order-profit', orderId],
    enabled: canView,
    queryFn: async (): Promise<Profit> => {
      const { data, response } = await api.GET('/api/v1/sale-orders/{id}/profit', {
        params: { path: { id: orderId } },
      });
      if (!response.ok || !data) {
        throw new Error('材料毛利加载失败');
      }
      return data;
    },
  });

  if (!canView) {
    return null;
  }
  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">材料毛利加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-muted-foreground">材料毛利暂不可用。</p>;
  }
  const profit = query.data;

  async function recalculate(): Promise<void> {
    const ok = await confirm({
      title: '重算材料成本',
      description: '将按下单时点重新取当前方木平均成本并锁定；重算后不再自动变化。',
      confirmText: '重算',
      onConfirm: async () => {
        const { response } = await api.POST('/api/v1/sale-orders/{id}/recalculate-cost', {
          params: { path: { id: orderId } },
        });
        if (!response.ok) {
          throw new Error('重算失败');
        }
      },
    });
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ['sale-order-profit', orderId] });
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">材料毛利</h2>
          <Button
            type="button"
            variant="link"
            size="xs"
            className="h-auto px-0 text-xs"
            onClick={() => setHelpOpen(true)}
          >
            口径说明
          </Button>
        </div>
        <span className={profit.materialCostStatus === 'final' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {statusLabel(profit.materialCostStatus)}
        </span>
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><span className="text-muted-foreground">确认收入：</span>{profit.revenue}</div>
        <div><span className="text-muted-foreground">材料成本：</span>{profit.materialCostAmount}</div>
        <div><span className="text-muted-foreground">材料毛利：</span>{profitText(profit)}</div>
        <div><span className="text-muted-foreground">材料毛利率：</span>{marginText(profit)}</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">下单时成本快照，未含人工与费用。</p>
      {profit.materialCostStatus === 'pending' && canManage ? (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={recalculate}>
          重算材料成本
        </Button>
      ) : null}
      <MaterialProfitHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </section>
  );
}

export function MobileSaleOrderProfit({ orderId }: { orderId: string }): React.ReactElement | null {
  const canView = useCan('profit:view');
  const canManage = useCan('profit:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [helpOpen, setHelpOpen] = useState(false);
  const query = useQuery({
    queryKey: ['sale-order-profit', orderId],
    enabled: canView,
    queryFn: async (): Promise<Profit> => {
      const { data, response } = await api.GET('/api/v1/sale-orders/{id}/profit', {
        params: { path: { id: orderId } },
      });
      if (!response.ok || !data) {
        throw new Error('材料毛利加载失败');
      }
      return data;
    },
  });

  if (!canView) {
    return null;
  }
  if (query.isPending) {
    return <p className="text-mobile-body text-muted-foreground">材料毛利加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-mobile-body text-muted-foreground">材料毛利暂不可用。</p>;
  }
  const profit = query.data;

  async function recalculate(): Promise<void> {
    const ok = await confirm({
      title: '重算材料成本',
      description: '将按下单时点重新取当前方木平均成本并锁定；重算后不再自动变化。',
      confirmText: '重算',
      onConfirm: async () => {
        const { response } = await api.POST('/api/v1/sale-orders/{id}/recalculate-cost', {
          params: { path: { id: orderId } },
        });
        if (!response.ok) {
          throw new Error('重算失败');
        }
      },
    });
    if (ok) {
      await queryClient.invalidateQueries({ queryKey: ['sale-order-profit', orderId] });
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <h2 className="text-mobile-title font-semibold">材料毛利</h2>
          <Button
            type="button"
            variant="link"
            className="h-auto px-0 text-mobile-label"
            onClick={() => setHelpOpen(true)}
          >
            口径说明
          </Button>
        </div>
        <span className={profit.materialCostStatus === 'final' ? 'text-mobile-caption text-muted-foreground' : 'text-mobile-caption text-destructive'}>
          {statusLabel(profit.materialCostStatus)}
        </span>
      </div>
      <MobileInfoRow label="确认收入" value={profit.revenue} />
      <MobileInfoRow label="材料成本" value={profit.materialCostAmount} />
      <MobileInfoRow label="材料毛利" value={profitText(profit)} />
      <MobileInfoRow label="材料毛利率" value={marginText(profit)} />
      <p className="text-mobile-caption text-muted-foreground">下单时成本快照，未含人工与费用。</p>
      {profit.materialCostStatus === 'pending' && canManage ? (
        <Button type="button" variant="outline" className="w-full" onClick={recalculate}>
          重算材料成本
        </Button>
      ) : null}
      <MaterialProfitHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </section>
  );
}
