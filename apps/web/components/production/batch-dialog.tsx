'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 生产批次弹窗表单（product/生产与库存.md R-生产-006）：
// PC 与移动共用；PC 520px 弹窗，移动端为全屏弹窗；保存后留在当前页并刷新。

export interface ProductionBatchDialogInitial {
  id: string;
  code: string;
  batchDate: string;
  note: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export function ProductionBatchDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ProductionBatchDialogInitial;
  onSaved?: (batch: ApiSchemas['ProductionBatchDetailDto']) => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [batchDate, setBatchDate] = useState(initial?.batchDate ?? localToday());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setBatchDate(initial?.batchDate ?? localToday());
    setNote(initial?.note ?? '');
    setError(null);
  }, [open, initial]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!batchDate) {
      setError('请选择批次日期');
      return;
    }
    setSaving(true);
    try {
      const body = { batchDate, note };
      const { data, response } = initial
        ? await api.PUT('/api/v1/production-batches/{id}', {
            params: { path: { id: initial.id } },
            body,
          })
        : await api.POST('/api/v1/production-batches', {
            headers: { 'Idempotency-Key': randomUuid() },
            body,
          });
      if (!response.ok || !data) {
        throw new Error('保存失败');
      }
      await queryClient.invalidateQueries({ queryKey: ['production-batches'] });
      onSaved?.(data);
      onOpenChange(false);
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{initial ? `编辑生产批次 ${initial.code}` : '新建生产批次'}</DialogTitle>
          <DialogDescription>
            批次是成本对象，领用与产出都需要选择批次；关闭后不能新增或修改领用 / 产出。
          </DialogDescription>
        </DialogHeader>
        <form id="production-batch-dialog-form" className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-1.5">
            <Label htmlFor="production-batch-date">批次日期</Label>
            <DatePicker
              id="production-batch-date"
              value={batchDate}
              onChange={setBatchDate}
              className="w-full sm:w-40"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="production-batch-note">备注</Label>
            <Textarea
              id="production-batch-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              placeholder="可选"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full sm:h-9 sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="submit"
            form="production-batch-dialog-form"
            className="h-12 w-full sm:h-9 sm:w-auto"
            disabled={saving}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
