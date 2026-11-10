'use client';

import { useRef, useState } from 'react';
import { financeEventInputSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

// 手工记账弹窗表单（product/finance.md R-财务-001 页面设计；弹窗表单规范见 product/平台布局.md）：
// 新建与编辑共用，Dialog 受控于列表页 / 详情页；分类仅「其他收入 / 其他支出」，金额按正数录入，
// 符号由服务端按分类规范化。保存成功后关闭弹窗并通知调用方就地刷新，不跳转详情。

export interface FinanceEventFormInitial {
  id: string;
  code: string;
  category: 'other_revenue' | 'other_expense';
  occurredDate: string;
  amount: string;
  note: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-24 shrink-0 justify-end text-right text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function FinanceEventForm({
  open,
  initial,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial?: FinanceEventFormInitial;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): React.ReactElement {
  const confirm = useConfirm();
  // 初始值只在首帧取一次（弹窗重开时由父组件用 key 重新挂载）
  const initialValues = useRef({
    category: (initial?.category ?? 'other_expense') as 'other_revenue' | 'other_expense',
    occurredDate: initial?.occurredDate ?? localToday(),
    amount: initial?.amount ?? '',
    note: initial?.note ?? '',
  }).current;

  const [category, setCategory] = useState<'other_revenue' | 'other_expense'>(
    initialValues.category,
  );
  const [occurredDate, setOccurredDate] = useState(initialValues.occurredDate);
  const [amount, setAmount] = useState(initialValues.amount);
  const [note, setNote] = useState(initialValues.note);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    category !== initialValues.category ||
    occurredDate !== initialValues.occurredDate ||
    amount.trim() !== initialValues.amount ||
    note !== initialValues.note;

  // 关闭拦截：有未保存改动时弹二次确认（确认框叠在弹窗之上，弹窗表单规范）
  const handleOpenChange = (next: boolean): void => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (!dirty) {
      onOpenChange(false);
      return;
    }
    void confirm({
      title: '放弃录入',
      description: '当前输入尚未保存，关闭后将丢失。',
      confirmText: '放弃',
      tone: 'danger',
    }).then((ok) => {
      if (ok) {
        onOpenChange(false);
      }
    });
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = financeEventInputSchema.safeParse({
      category,
      occurredDate,
      amount: amount.trim(),
      note,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        const { response } = await api.PUT('/api/v1/finance/events/{id}', {
          params: { path: { id: initial.id } },
          body: parsed.data,
        });
        if (!response.ok) {
          throw new Error('保存失败');
        }
      } else {
        const { response } = await api.POST('/api/v1/finance/events', {
          body: parsed.data,
        });
        if (!response.ok) {
          throw new Error('保存失败');
        }
      }
      onSaved();
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑财务事件' : '新建财务事件'}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)}>
          <Field label="分类">
            <Select
              value={category}
              onChange={(value) => setCategory(value as 'other_revenue' | 'other_expense')}
              options={[
                { value: 'other_expense', label: '其他支出' },
                { value: 'other_revenue', label: '其他收入' },
              ]}
              className="w-40"
            />
          </Field>
          <Field label="发生日期">
            <DatePicker value={occurredDate} onChange={setOccurredDate} className="w-40" />
          </Field>
          <Field label="金额">
            <div className="flex items-center gap-2">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-40"
              />
              <span className="text-xs text-muted-foreground">
                {category === 'other_revenue' ? '按正数录入，记为收入' : '按正数录入，记为支出'}
              </span>
            </div>
          </Field>
          <Field label="备注">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="具体事由（如「维修裁板锯」「锯末 3 吨」）"
              className="min-h-16 w-80"
            />
          </Field>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
