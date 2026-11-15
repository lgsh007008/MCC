'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calcVolumeM3, sumVolumes, type ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { outputCostWarnings } from '@/lib/timber-cost';
import { randomUuid } from '@/lib/uuid';
import { cn } from '@/lib/utils';

// 方木产出表单（product/生产与库存.md R-生产-005）：
// 新建与编辑共用；多行净尺寸产出；方量由 shared 纯函数实时计算，服务端重算落账。

const MAX_ROWS = 200;

interface FormRow {
  id?: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  pieces: string;
  note: string;
}

export interface ProductionOutputFormInitial {
  id: string;
  code: string;
  outputDate: string;
  note: string;
  outputs: Array<{
    id: string;
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    pieces: number;
    note: string;
  }>;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const intOk = (value: string): boolean => /^[1-9]\d*$/.test(value);

const emptyRow = (): FormRow => ({
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  pieces: '',
  note: '',
});

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('flex items-start gap-2', className)}>
      <Label className="w-24 shrink-0 pt-1.5 text-right text-xs text-muted-foreground">{label}</Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ProductionOutputForm({
  initial,
}: {
  initial?: ProductionOutputFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [outputDate, setOutputDate] = useState(initial?.outputDate ?? localToday());
  const [note, setNote] = useState(initial?.note ?? '');
  const [rows, setRows] = useState<FormRow[]>(
    initial
      ? initial.outputs.map((output) => ({
          id: output.id,
          lengthMm: String(output.lengthMm),
          widthMm: String(output.widthMm),
          heightMm: String(output.heightMm),
          pieces: String(output.pieces),
          note: output.note,
        }))
      : [emptyRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 待结转来源提示（product/生产与库存.md R-生产-005）：让录入人知道本次产出会结转哪几笔领用
  const summaryQuery = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: async (): Promise<ApiSchemas['InventorySummaryDto']> => {
      const { data, response } = await api.GET('/api/v1/inventory/summary');
      if (!response.ok || !data) {
        throw new Error('库存加载失败');
      }
      return data;
    },
  });
  const summary = summaryQuery.data;

  const totalVolume = sumVolumes(
    rows.map((row) => {
      if (!intOk(row.lengthMm) || !intOk(row.widthMm) || !intOk(row.heightMm) || !intOk(row.pieces)) {
        return '0.0000';
      }
      return calcVolumeM3(Number(row.lengthMm), Number(row.widthMm), Number(row.heightMm), Number(row.pieces));
    }),
  );

  function updateRow(index: number, patch: Partial<FormRow>): void {
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function addRow(): void {
    if (rows.length >= MAX_ROWS) {
      return;
    }
    setRows((prev) => [...prev, emptyRow()]);
  }

  function copyRow(index: number): void {
    if (rows.length >= MAX_ROWS) {
      return;
    }
    const source = rows[index];
    if (!source) {
      return;
    }
    setRows((prev) => [...prev, { ...source, id: undefined }]);
  }

  function removeRow(index: number): void {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!outputDate) {
      setError('请选择产出日期');
      return;
    }
    for (const [index, row] of rows.entries()) {
      if (!intOk(row.lengthMm) || !intOk(row.widthMm) || !intOk(row.heightMm)) {
        setError(`第 ${index + 1} 行：长、宽、高须为大于 0 的整数毫米`);
        return;
      }
      if (!intOk(row.pieces)) {
        setError(`第 ${index + 1} 行：根数须为大于 0 的整数`);
        return;
      }
    }
    const body = {
      outputDate,
      note,
      outputs: rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        lengthMm: Number(row.lengthMm),
        widthMm: Number(row.widthMm),
        heightMm: Number(row.heightMm),
        pieces: Number(row.pieces),
        note: row.note,
      })),
    };
    setSaving(true);
    try {
      if (!initial) {
        const warnings = await outputCostWarnings(outputDate);
        if (warnings.length > 0) {
          const proceed = await confirm({
            title: '产出成本提示',
            description: `${warnings.join('；')}。仍要保存吗？`,
            confirmText: '仍然保存',
          });
          if (!proceed) {
            return;
          }
        }
      }
      const { data, response } = initial
        ? await api.PUT('/api/v1/production-outputs/{id}', {
            params: { path: { id: initial.id } },
            body,
          })
        : await api.POST('/api/v1/production-outputs', {
            headers: { 'Idempotency-Key': randomUuid() },
            body,
          });
      if (!response.ok || !data) {
        throw new Error('保存失败');
      }
      await queryClient.invalidateQueries({ queryKey: ['production-outputs'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      router.push(`/admin/production/outputs/${data.id}`);
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      title={initial ? `编辑方木产出 ${initial.code}` : '新建方木产出'}
      actions={
        <>
          <Button type="submit" form="production-output-form" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                initial ? `/admin/production/outputs/${initial.id}` : '/admin/production/outputs',
              )
            }
          >
            取消
          </Button>
        </>
      }
    >
      <form id="production-output-form" className="space-y-4" onSubmit={submit}>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 xl:grid-cols-2">
            <Field label="产出日期">
              <DatePicker value={outputDate} onChange={setOutputDate} className="w-40" />
            </Field>
            <Field label="备注">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="min-h-8 w-full max-w-72"
                placeholder="可选"
              />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            每次产出会把当时整个待结转池一次性全额转入方木池，不做部分结转；同一批领用请在一张产出单内录完。
          </p>
          {summary && !summary.needsOpening ? (
            summary.pendingAmount === '0.00' ? (
              <p className="mt-1 text-xs text-destructive">
                当前没有待结转成本，产出将按 0 成本入库；请先录原木领用。
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                当前待结转 {formatAmount(summary.pendingAmount)} 元，来自{' '}
                {summary.earliestPendingIssueCode}
                {summary.pendingIssueCount > 1 ? ` 等 ${summary.pendingIssueCount} 笔领用` : ' 这笔领用'}
                ；保存后全部转入方木池。
              </p>
            )
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">产出明细</h2>
            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
              <PlusIcon data-icon="inline-start" />
              添加产出明细
            </Button>
          </div>
          <Table containerClassName="max-h-[420px] overflow-y-auto">
            <TableHeader>
              <TableRow>
                <TableHead>长度（mm）</TableHead>
                <TableHead>宽度（mm）</TableHead>
                <TableHead>高度（mm）</TableHead>
                <TableHead>根数</TableHead>
                <TableHead>方量（m³）</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="w-24">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => {
                const volumeOk =
                  intOk(row.lengthMm) && intOk(row.widthMm) && intOk(row.heightMm) && intOk(row.pieces);
                const rowVolume = volumeOk
                  ? calcVolumeM3(Number(row.lengthMm), Number(row.widthMm), Number(row.heightMm), Number(row.pieces))
                  : '0.0000';
                return (
                  <TableRow key={row.id ?? index}>
                    <TableCell>
                      <Input value={row.lengthMm} onChange={(event) => updateRow(index, { lengthMm: event.target.value })} inputMode="numeric" className="w-20" />
                    </TableCell>
                    <TableCell>
                      <Input value={row.widthMm} onChange={(event) => updateRow(index, { widthMm: event.target.value })} inputMode="numeric" className="w-20" />
                    </TableCell>
                    <TableCell>
                      <Input value={row.heightMm} onChange={(event) => updateRow(index, { heightMm: event.target.value })} inputMode="numeric" className="w-20" />
                    </TableCell>
                    <TableCell>
                      <Input value={row.pieces} onChange={(event) => updateRow(index, { pieces: event.target.value })} inputMode="numeric" className="w-20" />
                    </TableCell>
                    <TableCell className="tabular-nums">{rowVolume}</TableCell>
                    <TableCell>
                      <Input value={row.note} onChange={(event) => updateRow(index, { note: event.target.value })} className="min-w-32" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="复制行" title="复制行" onClick={() => copyRow(index)} disabled={rows.length >= MAX_ROWS}>
                          <CopyIcon />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="删除行" title="删除行" onClick={() => removeRow(index)} disabled={rows.length === 1}>
                          <Trash2Icon className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">产出总方数</span>
            <span className="tabular-nums font-medium">{totalVolume}</span>
          </div>
        </section>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </PageFrame>
  );
}
