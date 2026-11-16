'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useCan } from '@/components/auth/permission-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ProductionBatchDialog } from '@/components/production/batch-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 生产批次详情（product/生产与库存.md R-生产-006）：成本池 + 领用 / 产出 / 方木明细 + 关闭批次。

type BatchDetail = ApiSchemas['ProductionBatchDetailDto'];

const STATUS_LABELS: Record<string, string> = { open: '进行中', closed: '已关闭' };
const KIND_LABELS: Record<string, string> = { opening: '期初库存', production: '生产批次' };

export default function ProductionBatchDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const canManage = useCan('production:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const query = useQuery({
    queryKey: ['production-batches', id],
    queryFn: async (): Promise<BatchDetail> => {
      const { data, response } = await api.GET('/api/v1/production-batches/{id}', {
        params: { path: { id } },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败');
      }
      return data;
    },
  });
  usePageCrumb(query.data ? [{ title: query.data.code }] : []);

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
            ? `批次 ${query.data.code} 还有待结转 ${formatAmount(query.data.pendingAmount)} 元，关闭时会一次性转入本批次方木池；关闭后不能新增或修改领用 / 产出。`
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
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">生产批次不存在或加载失败。</p>;
  }
  const batch = query.data;
  const canEdit = canManage && batch.status === 'open' && batch.kind === 'production';

  return (
    <PageFrame
      title={batch.code}
      actions={
        <>
          {canEdit ? (
            <Button type="button" onClick={() => setEditOpen(true)}>
              编辑
            </Button>
          ) : null}
          {canManage && batch.status === 'open' && batch.kind === 'production' ? (
            <Button type="button" variant="destructive" disabled={closing} onClick={() => void closeBatch()}>
              {closing ? '关闭中…' : '关闭批次'}
            </Button>
          ) : null}
          <Link href="/admin/production/batches" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div><span className="text-muted-foreground">批次日期：</span>{batch.batchDate}</div>
            <div><span className="text-muted-foreground">类型：</span>{KIND_LABELS[batch.kind] ?? batch.kind}</div>
            <div><span className="text-muted-foreground">状态：</span>{STATUS_LABELS[batch.status] ?? batch.status}</div>
            <div><span className="text-muted-foreground">关闭时间：</span>{batch.closedAt ? batch.closedAt.slice(0, 19).replace('T', ' ') : '—'}</div>
            <div><span className="text-muted-foreground">方木方数：</span>{formatQuantity(batch.timberVolume)} m³</div>
            <div><span className="text-muted-foreground">方木金额：</span>{formatAmount(batch.timberAmount)} 元</div>
            <div><span className="text-muted-foreground">平均成本：</span>{formatQuantity(batch.timberUnitCost)} 元/m³</div>
            <div><span className="text-muted-foreground">待结转：</span>{formatAmount(batch.pendingAmount)} 元</div>
            <div><span className="text-muted-foreground">关闭结转：</span>{formatAmount(batch.closedSettledAmount)} 元</div>
            <div className="sm:col-span-2 xl:col-span-4">
              <span className="text-muted-foreground">备注：</span>{batch.note || '—'}
            </div>
          </div>
          {actionError ? <p className="mt-2 text-sm text-destructive">{actionError}</p> : null}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">领用（{batch.issues.length}）</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>编号</TableHead>
                <TableHead>领用日期</TableHead>
                <TableHead className="text-right">领用吨数</TableHead>
                <TableHead className="text-right">已结转（元）</TableHead>
                <TableHead className="text-right">待结转（元）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.issues.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">暂无领用</TableCell></TableRow>
              ) : (
                batch.issues.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell>
                      <Link href={`/admin/production/issues/${issue.id}`} className="text-primary hover:underline">
                        {issue.code}
                      </Link>
                    </TableCell>
                    <TableCell>{issue.issueDate}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(issue.tons)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(issue.settledAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(issue.pendingAmount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">产出（{batch.outputs.length}）</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>编号</TableHead>
                <TableHead>产出日期</TableHead>
                <TableHead className="text-right">产出方数</TableHead>
                <TableHead className="text-right">本次结转（元）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.outputs.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-muted-foreground">暂无产出</TableCell></TableRow>
              ) : (
                batch.outputs.map((output) => (
                  <TableRow key={output.id}>
                    <TableCell>
                      <Link href={`/admin/production/outputs/${output.id}`} className="text-primary hover:underline">
                        {output.code}
                      </Link>
                    </TableCell>
                    <TableCell>{output.outputDate}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(output.totalVolume)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(output.settledAmount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">方木明细</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>长度（mm）</TableHead>
                <TableHead>宽度（mm）</TableHead>
                <TableHead>高度（mm）</TableHead>
                <TableHead className="text-right">方数（m³）</TableHead>
                <TableHead className="text-right">平均成本（元/m³）</TableHead>
                <TableHead className="text-right">金额（元）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batch.timberLines.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">暂无方木库存</TableCell></TableRow>
              ) : (
                batch.timberLines.map((line) => (
                  <TableRow key={`${line.lengthMm}x${line.widthMm}x${line.heightMm}`}>
                    <TableCell>{line.lengthMm}</TableCell>
                    <TableCell>{line.widthMm}</TableCell>
                    <TableCell>{line.heightMm}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(line.quantity)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatQuantity(line.unitCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatAmount(line.amount)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

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
    </PageFrame>
  );
}
