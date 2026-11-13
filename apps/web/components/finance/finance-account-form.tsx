'use client';

import { useRef, useState } from 'react';
import {
  FINANCE_ACCOUNT_CHANNEL_LABELS,
  FINANCE_ACCOUNT_CHANNELS_BY_KIND,
  FINANCE_ACCOUNT_KIND_LABELS,
  financeAccountInputSchema,
  type FinanceAccountChannel,
  type FinanceAccountKind,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';

// 资金账户弹窗（product/finance.md R-财务-002；弹窗表单规范见 product/平台布局.md）：
// 新建与编辑共用；状态由列表行内的启用 / 停用操作独占，表单不出现状态字段。

export interface FinanceAccountFormInitial {
  id: string;
  code: string;
  name: string;
  kind: FinanceAccountKind;
  channel: FinanceAccountChannel;
  openingBalance: string;
  active: boolean;
}

const KIND_OPTIONS = (
  Object.entries(FINANCE_ACCOUNT_KIND_LABELS) as Array<[FinanceAccountKind, string]>
).map(([value, label]) => ({ value, label }));

const channelOptionsOf = (kind: FinanceAccountKind) =>
  FINANCE_ACCOUNT_CHANNELS_BY_KIND[kind].map((value) => ({
    value,
    label: FINANCE_ACCOUNT_CHANNEL_LABELS[value],
  }));

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <Label className="w-24 shrink-0 justify-end text-right text-muted-foreground">{label}</Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function FinanceAccountForm({
  open,
  initial,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  initial?: FinanceAccountFormInitial;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): React.ReactElement {
  const confirm = useConfirm();
  const initialValues = useRef(
    (() => {
      const kind = (initial?.kind ?? 'corporate') as FinanceAccountKind;
      const candidates = FINANCE_ACCOUNT_CHANNELS_BY_KIND[kind];
      const channel =
        initial?.channel && candidates.includes(initial.channel)
          ? initial.channel
          : candidates[0];
      return {
        name: initial?.name ?? '',
        kind,
        channel: channel as FinanceAccountChannel,
        openingBalance: initial?.openingBalance ?? '0.00',
        active: initial?.active ?? true,
      };
    })(),
  ).current;

  const [name, setName] = useState(initialValues.name);
  const [kind, setKind] = useState<FinanceAccountKind>(initialValues.kind);
  const [channel, setChannel] = useState<FinanceAccountChannel>(initialValues.channel);
  const [openingBalance, setOpeningBalance] = useState(initialValues.openingBalance);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    name !== initialValues.name ||
    kind !== initialValues.kind ||
    channel !== initialValues.channel ||
    openingBalance !== initialValues.openingBalance;

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
      title: '放弃编辑',
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
    const parsed = financeAccountInputSchema.safeParse({
      name: name.trim(),
      kind,
      channel,
      openingBalance: openingBalance.trim(),
      active: initialValues.active,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { response } = initial
        ? await api.PUT('/api/v1/finance/accounts/{id}', {
            params: { path: { id: initial.id } },
            body: parsed.data,
          })
        : await api.POST('/api/v1/finance/accounts', { body: parsed.data });
      if (!response.ok) {
        throw new Error('保存失败');
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
      <DialogContent className="p-6 sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{initial ? `编辑账户 ${initial.code}` : '新增资金账户'}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(e) => void handleSubmit(e)}>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Field label="账户名称" className="col-span-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如「对公账户」「李四个人卡」「承兑票据」"
                className="w-full"
              />
            </Field>
            <Field label="类型">
              <Select
                value={kind}
                onChange={(value) => {
                  const nextKind = value as FinanceAccountKind;
                  setKind(nextKind);
                  const candidates = FINANCE_ACCOUNT_CHANNELS_BY_KIND[nextKind];
                  if (!candidates.includes(channel)) {
                    setChannel(candidates[0] as FinanceAccountChannel);
                  }
                }}
                options={KIND_OPTIONS}
                className="w-full"
              />
            </Field>
            <Field label="渠道">
              <Select
                value={channel}
                onChange={(value) => setChannel(value as FinanceAccountChannel)}
                options={channelOptionsOf(kind)}
                className="w-full"
              />
            </Field>
            <Field label="期初余额">
              <Input
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full"
              />
            </Field>
          </div>

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
