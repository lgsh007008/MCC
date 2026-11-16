'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ProductionBatchDialog } from '@/components/production/batch-dialog';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

// 移动生产批次详情（product/生产与库存.md R-生产-006）。

type BatchDetail = ApiSchemas['ProductionBatchDetailDto'];

export default function MobileProductionBatchDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const canManage = useCan('production:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const query = useQuery({
    queryKey: ['production-batches', params.id],
    queryFn: async (): Promise<BatchDetail> => {
      const { data, response } = await api.GET('/api/v1/production-batches/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败');
      }
      return data;
    },
  });

  async function closeBatch(): Promise<void> {
    if (!query.data) {
      return;
    }
    setActionError(null);
    setClosing(true);
    try {
      const ok = await confirm({
        title: '关闭生产批次',
        description:
          query.data.pendingAmount !== '0.00'
            ? `批次还有待结转 ${formatAmount(query.data.pendingAmount)} 元，关闭时会一次性转入本批次方木池；关闭后不能新增或修改领用 / 产出。`
            : `将关闭批次 ${query.data.code}，关闭后不能新增或修改领用 / 产出。`,
        confirmText: '关闭批次',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/production-batches/{id}/close', {
            params: { path: { id: query.data!.id } },
          });
          if (!response.ok) {
            throw new Error('关闭失败');
          }
        },
      });
      if (ok) {
        await queryClient.invalidateQueries({ queryKey: ['production-batches'] });
        await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
        await query.refetch();
      }
    } catch {
      setActionError('关闭失败：批次可能还有待结转但无方木库存，请先录产出或删除领用');
    } finally {
      setClosing(false);
    }
  }

  if (query.isPending) {
    return (
      <div>
        <MobileHeader title="生产批次详情" backHref="/m/production/batches" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <MobileHeader title="生产批次详情" backHref="/m/production/batches" />
        <p className="p-4 text-mobile-body text-destructive">生产批次不存在或加载失败。</p>
      </div>
    );
  }
  const batch = query.data;
  const canEdit = canManage && batch.status === 'open' && batch.kind === 'production';

  return (
    <div className="pb-24">
      <MobileHeader title={batch.code} backHref="/m/production/batches" />
      <div className="space-y-4 p-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <MobileInfoRow label="批次日期" value={batch.batchDate} />
          <MobileInfoRow label="类型" value={batch.kind === 'opening' ? '期初库存' : '生产批次'} />
          <MobileInfoRow label="状态" value={batch.status === 'open' ? '进行中' : '已关闭'} />
          <MobileInfoRow label="方木方数" value={`${formatQuantity(batch.timberVolume)} m³`} />
          <MobileInfoRow label="方木金额" value={`${formatAmount(batch.timberAmount)} 元`} />
          <MobileInfoRow label="平均成本" value={`${formatQuantity(batch.timberUnitCost)} 元/m³`} />
          <MobileInfoRow label="待结转" value={`${formatAmount(batch.pendingAmount)} 元`} />
          <MobileInfoRow label="关闭结转" value={`${formatAmount(batch.closedSettledAmount)} 元`} />
          <MobileInfoRow label="备注" value={batch.note || '—'} />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-mobile-body font-semibold">领用（{batch.issues.length}）</h2>
          {batch.issues.length === 0 ? (
            <p className="text-mobile-label text-muted-foreground">暂无领用</p>
          ) : (
            batch.issues.map((issue) => (
              <Link
                key={issue.id}
                href={`/m/production/issues/${issue.id}`}
                className="flex items-center justify-between gap-2 text-mobile-label"
              >
                <span className="text-primary">{issue.code}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatQuantity(issue.tons)} 吨 · 待结转 {formatAmount(issue.pendingAmount)} 元
                </span>
              </Link>
            ))
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-mobile-body font-semibold">产出（{batch.outputs.length}）</h2>
          {batch.outputs.length === 0 ? (
            <p className="text-mobile-label text-muted-foreground">暂无产出</p>
          ) : (
            batch.outputs.map((output) => (
              <Link
                key={output.id}
                href={`/m/production/outputs/${output.id}`}
                className="flex items-center justify-between gap-2 text-mobile-label"
              >
                <span className="text-primary">{output.code}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatQuantity(output.totalVolume)} m³ · 结转 {formatAmount(output.settledAmount)} 元
                </span>
              </Link>
            ))
          )}
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-mobile-body font-semibold">方木明细</h2>
          {batch.timberLines.length === 0 ? (
            <p className="text-mobile-label text-muted-foreground">暂无方木库存</p>
          ) : (
            batch.timberLines.map((line) => (
              <div
                key={`${line.lengthMm}x${line.widthMm}x${line.heightMm}`}
                className="flex items-center justify-between gap-2 text-mobile-label"
              >
                <span>{line.lengthMm}×{line.widthMm}×{line.heightMm}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatQuantity(line.quantity)} m³ · {formatAmount(line.amount)} 元
                </span>
              </div>
            ))
          )}
        </section>

        {canManage && batch.status === 'open' && batch.kind === 'production' ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-mobile-body text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={closing}
              onClick={() => void closeBatch()}
            >
              {closing ? '关闭中…' : '关闭生产批次'}
            </Button>
            {actionError ? (
              <p role="alert" className="text-mobile-body text-destructive">
                {actionError}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
      <MobileActionBar>
        {canEdit ? (
          <Button
            type="button"
            className="h-12 flex-1 text-mobile-body"
            onClick={() => setEditOpen(true)}
          >
            编辑
          </Button>
        ) : null}
        <Link
          href="/m/production/batches"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
        >
          返回列表
        </Link>
      </MobileActionBar>
      <ProductionBatchDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{
          id: batch.id,
          code: batch.code,
          batchDate: batch.batchDate,
          note: batch.note,
        }}
        onSaved={() => void query.refetch()}
      />
    </div>
  );
}
