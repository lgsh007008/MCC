'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calcVolumeM3, sumVolumes, type ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MobileField } from '@/components/mobile/field';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import { outputCostWarnings } from '@/lib/timber-cost';
import { randomUuid } from '@/lib/uuid';

// 移动方木产出表单（product/生产与库存.md R-生产-005）：
// 单列；日期、备注 + 产出行卡片；底部常驻产出总方数与保存。

const MAX_ROWS = 200;
const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const intOk = (value: string): boolean => /^[1-9]\d*$/.test(value);

interface Row {
  id?: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  pieces: string;
  note: string;
}

const emptyRow = (): Row => ({ lengthMm: '', widthMm: '', heightMm: '', pieces: '', note: '' });

export interface MobileProductionOutputFormInitial {
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

export function MobileProductionOutputForm({
  initial,
}: {
  initial?: MobileProductionOutputFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [outputDate, setOutputDate] = useState(initial?.outputDate ?? localToday());
  const [note, setNote] = useState(initial?.note ?? '');
  const [rows, setRows] = useState<Row[]>(
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

  // 待结转来源提示（product/生产与库存.md R-生产-005）
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
    rows.map((row) =>
      intOk(row.lengthMm) && intOk(row.widthMm) && intOk(row.heightMm) && intOk(row.pieces)
        ? calcVolumeM3(Number(row.lengthMm), Number(row.widthMm), Number(row.heightMm), Number(row.pieces))
        : '0.0000',
    ),
  );

  function updateRow(index: number, patch: Partial<Row>): void {
    setRows((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function submit(): Promise<void> {
    setError(null);
    if (!outputDate) {
      setError('请选择产出日期');
      return;
    }
    for (const [index, row] of rows.entries()) {
      if (!intOk(row.lengthMm) || !intOk(row.widthMm) || !intOk(row.heightMm)) {
        setError(`第 ${index + 1} 行：长宽高须为大于 0 的整数毫米`);
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
      router.push(`/m/production/outputs/${data.id}`);
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <MobileHeader
        title={initial ? `编辑方木产出 ${initial.code}` : '新建方木产出'}
        backHref={initial ? `/m/production/outputs/${initial.id}` : '/m/production/outputs'}
      />
      <div className="space-y-4 p-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <MobileField label="产出日期">
            <DatePicker value={outputDate} onChange={setOutputDate} size="touch" />
          </MobileField>
          <MobileField label="备注">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="min-h-12 text-mobile-body"
              placeholder="可选"
            />
          </MobileField>
          <p className="text-mobile-label text-muted-foreground">
            每次产出会把当时整个待结转池一次性全额转入方木池，不做部分结转；同一批领用请在一张产出单内录完。
          </p>
          {summary && !summary.needsOpening ? (
            summary.pendingAmount === '0.00' ? (
              <p className="text-mobile-label text-destructive">
                当前没有待结转成本，产出将按 0 成本入库；请先录原木领用。
              </p>
            ) : (
              <p className="text-mobile-label text-muted-foreground">
                当前待结转 {formatAmount(summary.pendingAmount)} 元，来自{' '}
                {summary.earliestPendingIssueCode}
                {summary.pendingIssueCount > 1 ? ` 等 ${summary.pendingIssueCount} 笔领用` : ' 这笔领用'}
                ；保存后全部转入方木池。
              </p>
            )
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="text-mobile-body font-semibold">产出明细</h2>
          {rows.map((row, index) => {
            const rowVolume =
              intOk(row.lengthMm) && intOk(row.widthMm) && intOk(row.heightMm) && intOk(row.pieces)
                ? calcVolumeM3(Number(row.lengthMm), Number(row.widthMm), Number(row.heightMm), Number(row.pieces))
                : '0.0000';
            return (
              <div key={row.id ?? index} className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-mobile-body font-medium">第 {index + 1} 行</span>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 px-3 text-mobile-label"
                      disabled={rows.length >= MAX_ROWS}
                      onClick={() => setRows((prev) => [...prev, { ...row, id: undefined }])}
                    >
                      <CopyIcon className="size-4" />
                      复制
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 px-3 text-mobile-label text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={rows.length === 1}
                      onClick={() => setRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                    >
                      <Trash2Icon className="size-4" />
                      删除
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(['lengthMm', 'widthMm', 'heightMm', 'pieces'] as const).map((field) => (
                    <MobileField
                      key={field}
                      label={field === 'lengthMm' ? '长度(mm)' : field === 'widthMm' ? '宽度(mm)' : field === 'heightMm' ? '高度(mm)' : '根数'}
                    >
                      <Input
                        value={row[field]}
                        onChange={(event) => updateRow(index, { [field]: event.target.value })}
                        inputMode="numeric"
                        className="h-12 text-mobile-body"
                      />
                    </MobileField>
                  ))}
                </div>
                <MobileField label="备注">
                  <Input value={row.note} onChange={(event) => updateRow(index, { note: event.target.value })} className="h-12 text-mobile-body" />
                </MobileField>
                <p className="text-mobile-label text-muted-foreground">
                  方量：<span className="text-mobile-body tabular-nums text-foreground">{rowVolume} m³</span>
                </p>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-mobile-body"
            disabled={rows.length >= MAX_ROWS}
            onClick={() => setRows((prev) => [...prev, emptyRow()])}
          >
            <PlusIcon data-icon="inline-start" />
            添加明细行
          </Button>
        </section>

        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-mobile-body text-destructive">{error}</p> : null}
      </div>
      <MobileActionBar>
        <div className="min-w-0 flex-1">
          <p className="text-mobile-label text-muted-foreground">产出总方数</p>
          <p className="text-mobile-numeric font-semibold tabular-nums">{totalVolume} m³</p>
        </div>
        <Button type="button" className="h-12 min-w-32 text-mobile-body" disabled={saving} onClick={submit}>
          {saving ? '保存中…' : '保存'}
        </Button>
      </MobileActionBar>
    </div>
  );
}
