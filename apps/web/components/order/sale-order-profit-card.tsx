'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { Button } from '@/components/ui/button';
import {
  CostLayerRow,
  MaterialProfitHelpDialog,
  type SaleCostLayer,
} from '@/components/production/material-profit-help-dialog';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { api } from '@/lib/api';

type Profit = ApiSchemas['SaleOrderProfitDto'];

const INLINE_LAYER_LIMIT = 3;

function statusLabel(status: Profit['materialCostStatus']): string {
  return status === 'final' ? '已锁定' : '成本待补';
}

function profitText(profit: Profit): string {
  return profit.materialProfit ?? '—';
}

function marginText(profit: Profit): string {
  return profit.materialMargin === null ? '—' : `${profit.materialMargin}%`;
}

// 来源摘要：只列批次编号，不重复展示金额（金额已在指标行）。
function layersSummary(layers: SaleCostLayer[]): string {
  const codes = [...new Set(layers.map((layer) => layer.batchCode || '负库存'))];
  if (codes.length <= 2) {
    return codes.join('、');
  }
  return `${codes.slice(0, 2).join('、')} 等 ${codes.length} 个批次`;
}

export function SaleOrderProfitCard({ orderId }: { orderId: string }): React.ReactElement | null {
  const canView = useCan('profit:view');
  const [helpOpen, setHelpOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
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

  const layers = profit.costLayers;
  const visibleLayers = layers.slice(0, INLINE_LAYER_LIMIT);
  const hasMoreLayers = layers.length > INLINE_LAYER_LIMIT;

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
        <div className="flex flex-wrap items-center gap-2">
          <span className={profit.materialCostStatus === 'final' ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
            {statusLabel(profit.materialCostStatus)}
          </span>
          {profit.materialCostStatus === 'pending' ? (
            <span className="text-xs text-muted-foreground">补录产出后，编辑保存本单即可补上成本</span>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><span className="text-muted-foreground">确认收入：</span>{profit.revenue}</div>
        <div><span className="text-muted-foreground">材料成本：</span>{profit.materialCostAmount}</div>
        <div><span className="text-muted-foreground">材料毛利：</span>{profitText(profit)}</div>
        <div><span className="text-muted-foreground">材料毛利率：</span>{marginText(profit)}</div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">下单时按批次先进先出快照，未含人工与费用。</p>
      {layers.length > 0 ? (
        <div className="mt-3 border-t border-border pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">成本来源：{layersSummary(layers)}</p>
            <Button
              type="button"
              variant="link"
              size="xs"
              className="h-auto px-0 text-xs"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? '收起成本来源' : '展开成本来源'}
              <ChevronDownIcon className={expanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </Button>
          </div>
          {expanded ? (
            <div className="mt-2 divide-y divide-border rounded-md border border-border">
              {visibleLayers.map((layer, index) => (
                <CostLayerRow key={`${layer.batchCode}-${index}`} layer={layer} />
              ))}
              {hasMoreLayers ? (
                <div className="px-3 py-1.5 text-right">
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    className="h-auto px-0 text-xs"
                    onClick={() => setHelpOpen(true)}
                  >
                    查看全部（{layers.length} 层）
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <MaterialProfitHelpDialog open={helpOpen} onOpenChange={setHelpOpen} costLayers={layers} />
    </section>
  );
}

export function MobileSaleOrderProfit({ orderId }: { orderId: string }): React.ReactElement | null {
  const canView = useCan('profit:view');
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

  const layers = profit.costLayers;
  const visibleLayers = layers.slice(0, INLINE_LAYER_LIMIT);
  const hasMoreLayers = layers.length > INLINE_LAYER_LIMIT;

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
        <div className="text-right">
          <p className={profit.materialCostStatus === 'final' ? 'text-mobile-caption text-muted-foreground' : 'text-mobile-caption text-destructive'}>
            {statusLabel(profit.materialCostStatus)}
          </p>
          {profit.materialCostStatus === 'pending' ? (
            <p className="mt-0.5 text-mobile-caption text-muted-foreground">补录产出后，编辑保存本单即可补上成本</p>
          ) : null}
        </div>
      </div>
      <MobileInfoRow label="确认收入" value={profit.revenue} />
      <MobileInfoRow label="材料成本" value={profit.materialCostAmount} />
      <MobileInfoRow label="材料毛利" value={profitText(profit)} />
      <MobileInfoRow label="材料毛利率" value={marginText(profit)} />
      <p className="text-mobile-caption text-muted-foreground">下单时按批次先进先出快照，未含人工与费用。</p>
      {layers.length > 0 ? (
        <div className="rounded-lg border border-border">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="min-w-0 truncate text-mobile-caption text-muted-foreground">
              成本来源：{layersSummary(layers)}
            </p>
            {hasMoreLayers ? (
              <Button
                type="button"
                variant="link"
                className="h-auto shrink-0 px-0 text-mobile-caption"
                onClick={() => setHelpOpen(true)}
              >
                查看全部
              </Button>
            ) : null}
          </div>
          <div className="divide-y divide-border">
            {visibleLayers.map((layer, index) => (
              <div
                key={`${layer.batchCode}-${index}`}
                className="flex items-start justify-between gap-2 px-3 py-2 text-mobile-label"
              >
                <div className="min-w-0">
                  <p className="truncate">{layer.batchCode || '负库存'}</p>
                  <p className="mt-0.5 truncate text-mobile-caption text-muted-foreground">
                    {layer.lengthMm}×{layer.widthMm}×{layer.heightMm} · {layer.unitCost} 元/m³
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p>{layer.volumeM3} m³</p>
                  <p className="mt-0.5 text-mobile-caption text-muted-foreground">{layer.amount} 元</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <MaterialProfitHelpDialog open={helpOpen} onOpenChange={setHelpOpen} costLayers={layers} />
    </section>
  );
}
