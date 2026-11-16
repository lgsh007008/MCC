'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MobileField } from '@/components/mobile/field';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 移动原木领用表单（product/生产与库存.md R-生产-001）：单列；日期、批次、吨数、备注。

const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const tonsOk = (value: string): boolean => /^\d+(\.\d{1,3})?$/.test(value) && Number(value) > 0;

export interface MobileMaterialIssueFormInitial {
  id: string;
  code: string;
  issueDate: string;
  tons: string;
  note: string;
  batchId: string;
  batchCode: string;
  batchStatus: string;
}

export function MobileMaterialIssueForm({
  initial,
}: {
  initial?: MobileMaterialIssueFormInitial;
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
      return response.ok && data ? data.items : [];
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

  async function submit(): Promise<void> {
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
      setError('领用吨数须大于 0，最多 3 位小数');
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
      router.push(`/m/production/issues/${data.id}`);
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <MobileHeader
        title={initial ? `编辑原木领用 ${initial.code}` : '新建原木领用'}
        backHref={initial ? `/m/production/issues/${initial.id}` : '/m/production/issues'}
      />
      <div className="space-y-4 p-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <MobileField label="领用日期">
            <DatePicker value={issueDate} onChange={setIssueDate} size="touch" />
          </MobileField>
          <MobileField label="生产批次">
            <Select
              ariaLabel="生产批次"
              value={batchId}
              onChange={setBatchId}
              options={batchOptions}
              placeholder={batchQuery.isPending ? '加载中…' : '请选择进行中的批次'}
              className="h-12 w-full text-mobile-body"
            />
          </MobileField>
          <MobileField label="领用吨数">
            <Input
              value={tons}
              onChange={(event) => setTons(event.target.value)}
              inputMode="decimal"
              placeholder="如 5.000"
              className="h-12 text-mobile-body"
            />
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
            领用成本按领用日当时原木平均成本先记入本批次待结转，方木产出时全额转入本批次方木池。
          </p>
        </section>

        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-mobile-body text-destructive">{error}</p> : null}
      </div>
      <MobileActionBar>
        <Button
          type="button"
          className="h-12 w-full text-mobile-body"
          disabled={saving}
          onClick={submit}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
      </MobileActionBar>
    </div>
  );
}
