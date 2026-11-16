'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';
import { cn } from '@/lib/utils';

// 原木领用表单（product/生产与库存.md R-生产-001）：
// 单头无明细；领用日期、生产批次、领用吨数、备注；领用成本由服务端按当前原木平均成本记入本批次待结转。

export interface MaterialIssueFormInitial {
  id: string;
  code: string;
  issueDate: string;
  tons: string;
  note: string;
  batchId: string;
  batchCode: string;
  batchStatus: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const tonsOk = (value: string): boolean => /^\d+(\.\d{1,3})?$/.test(value) && Number(value) > 0;

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

export function MaterialIssueForm({
  initial,
}: {
  initial?: MaterialIssueFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? localToday());
  const [tons, setTons] = useState(initial?.tons ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [batchId, setBatchId] = useState(initial?.batchId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const batchQuery = useQuery({
    queryKey: ['production-batches', 'open'],
    queryFn: async (): Promise<ApiSchemas['ProductionBatchDto'][]> => {
      const { data, response } = await api.GET('/api/v1/production-batches', {
        params: { query: { status: 'open', page: 1, pageSize: 100 } },
      });
      if (!response.ok || !data) {
        return [];
      }
      return data.items;
    },
  });
  const batchOptions: Array<{ value: string; label: string; disabled?: boolean }> = (batchQuery.data ?? []).map((batch) => ({
    value: batch.id,
    label: `${batch.code} · ${batch.batchDate}`,
  }));
  if (initial && !batchOptions.some((option) => option.value === initial.batchId)) {
    batchOptions.push({
      value: initial.batchId,
      label: `${initial.batchCode}（已关闭）`,
      disabled: true,
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!batchId) {
      setError('请选择生产批次');
      return;
    }
    if (!issueDate) {
      setError('请选择领用日期');
      return;
    }
    if (!tonsOk(tons)) {
      setError('领用吨数须为大于 0 的数字，最多 3 位小数');
      return;
    }
    const body = { issueDate, tons, note, batchId };
    setSaving(true);
    try {
      const { data, response } = initial
        ? await api.PUT('/api/v1/material-issues/{id}', {
            params: { path: { id: initial.id } },
            body,
          })
        : await api.POST('/api/v1/material-issues', {
            headers: { 'Idempotency-Key': randomUuid() },
            body,
          });
      if (!response.ok || !data) {
        throw new Error('保存失败');
      }
      await queryClient.invalidateQueries({ queryKey: ['material-issues'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['production-batches'] });
      router.push(`/admin/production/issues/${data.id}`);
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      title={initial ? `编辑原木领用 ${initial.code}` : '新建原木领用'}
      actions={
        <>
          <Button type="submit" form="material-issue-form" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              router.push(
                initial ? `/admin/production/issues/${initial.id}` : '/admin/production/issues',
              )
            }
          >
            取消
          </Button>
        </>
      }
    >
      <form id="material-issue-form" className="space-y-4" onSubmit={submit}>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 xl:grid-cols-2">
            <Field label="领用日期">
              <DatePicker value={issueDate} onChange={setIssueDate} className="w-40" />
            </Field>
            <Field label="生产批次">
              <Select
                ariaLabel="生产批次"
                value={batchId}
                onChange={setBatchId}
                options={batchOptions}
                placeholder={batchQuery.isPending ? '加载中…' : '请选择进行中的批次'}
                className="h-8 w-64"
              />
            </Field>
            <Field label="领用吨数">
              <Input
                value={tons}
                onChange={(event) => setTons(event.target.value)}
                inputMode="decimal"
                placeholder="如 5.000"
                className="w-40"
              />
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
            领用成本按领用日当时原木平均成本先记入本批次待结转，方木产出时全额转入本批次方木池；库存不足不阻断保存，由库存页提示。
          </p>
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
