'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

// 移动方木产出详情（product/生产与库存.md R-生产-005）：只读明细 + 编辑 / 删除。

type ProductionOutput = ApiSchemas['ProductionOutputDto'];

export default function MobileProductionOutputDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const canManage = useCan('production:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['production-outputs', params.id],
    queryFn: async (): Promise<ProductionOutput> => {
      const { data, response } = await api.GET('/api/v1/production-outputs/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败');
      }
      return data;
    },
  });

  async function remove(): Promise<void> {
    if (!query.data) {
      return;
    }
    setActionError(null);
    try {
      const ok = await confirm({
        title: '删除方木产出单',
        description: `将删除 ${query.data.code}。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/production-outputs/{id}', {
            params: { path: { id: query.data!.id } },
          });
          if (!response.ok) {
            throw new Error('删除失败');
          }
        },
      });
      if (ok) {
        await queryClient.invalidateQueries({ queryKey: ['production-outputs'] });
        await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
        router.replace('/m/production/outputs');
      }
    } catch {
      setActionError('删除失败，请稍后重试');
    }
  }

  if (query.isPending) {
    return (
      <div>
        <MobileHeader title="方木产出详情" backHref="/m/production/outputs" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <MobileHeader title="方木产出详情" backHref="/m/production/outputs" />
        <p className="p-4 text-mobile-body text-destructive">方木产出单不存在或加载失败。</p>
      </div>
    );
  }
  const output = query.data;

  return (
    <div className="pb-24">
      <MobileHeader title={output.code} backHref="/m/production/outputs" />
      <div className="space-y-4 p-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <MobileInfoRow label="产出日期" value={output.outputDate} />
          <MobileInfoRow label="产出总方数" value={`${formatQuantity(output.totalVolume)} m³`} />
          <MobileInfoRow label="本次结转金额" value={`${formatAmount(output.settledAmount)} 元`} />
          <MobileInfoRow
            label="来源领用单"
            value={output.sourceIssueCodes.length > 0 ? output.sourceIssueCodes.join('、') : '—'}
          />
          <MobileInfoRow label="创建时间" value={output.createdAt.slice(0, 19).replace('T', ' ')} />
          <MobileInfoRow label="备注" value={output.note || '—'} />
        </section>

        {output.outputs.map((line) => (
          <section key={line.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="text-mobile-body font-semibold">第 {line.seq} 行</h2>
            <MobileInfoRow label="长度" value={`${line.lengthMm} mm`} />
            <MobileInfoRow label="宽度" value={`${line.widthMm} mm`} />
            <MobileInfoRow label="高度" value={`${line.heightMm} mm`} />
            <MobileInfoRow label="根数" value={String(line.pieces)} />
            <MobileInfoRow label="方量" value={`${formatQuantity(line.volumeM3)} m³`} />
            <MobileInfoRow label="备注" value={line.note || '—'} />
          </section>
        ))}

        {canManage ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-mobile-body text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void remove()}
            >
              <Trash2Icon className="size-4" />
              删除方木产出单
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
        {canManage ? (
          <Link
            href={`/m/production/outputs/${output.id}/edit`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/production/outputs"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
