'use client';

import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FINANCE_CASH_CATEGORIES_BY_DIRECTION,
  FINANCE_CASH_CATEGORY_LABELS,
  financeCashEntryInputSchema,
  type ApiSchemas,
  type FinanceCashCategoryValue,
  type FinanceCashDirection,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 资金流水弹窗（product/finance.md R-财务-002）：
// 收款挂客户、付款对象自由填写、内部转账只搬钱（不计入收支统计）。
// 承兑汇票按「票据账户 + 承兑方式 + 备注票号」处理，不做逐张票据台账。

export interface FinanceAccountOption {
  id: string;
  name: string;
  active: boolean;
}

export interface FinanceCashEntryFormInitial {
  id: string;
  code: string;
  direction: FinanceCashDirection;
  occurredDate: string;
  amount: string;
  accountId: string;
  toAccountId: string | null;
  customerId: string | null;
  customerName: string;
  supplierId: string | null;
  supplierName: string;
  category: FinanceCashCategoryValue | null;
  note: string;
}

interface PartyOption {
  id: string;
  name: string;
}

const DIRECTION_OPTIONS = [
  { value: 'in', label: '收款' },
  { value: 'out', label: '付款' },
  { value: 'transfer', label: '内部转账' },
];

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

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

export function FinanceCashEntryForm({
  open,
  accounts,
  defaultAccountId,
  initial,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  accounts: FinanceAccountOption[];
  defaultAccountId?: string;
  initial?: FinanceCashEntryFormInitial;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}): React.ReactElement {
  const confirm = useConfirm();
  const initialValues = useRef({
    direction: (initial?.direction ?? 'in') as FinanceCashDirection,
    occurredDate: initial?.occurredDate ?? localToday(),
    amount: initial?.amount ?? '',
    // 新建时优先用左栏选中的账户，其次第一个启用账户（初始化即定值，避免挂载后自动填充被误判为「有改动」）
    accountId:
      initial?.accountId ??
      (defaultAccountId && accounts.some((account) => account.id === defaultAccountId)
        ? defaultAccountId
        : accounts.find((account) => account.active)?.id ?? ''),
    toAccountId: initial?.toAccountId ?? '',
    customerId: initial?.customerId ?? '',
    supplierId: initial?.supplierId ?? '',
    category: (initial?.category ?? 'sales_receipt') as FinanceCashCategoryValue | null,
    note: initial?.note ?? '',
  }).current;

  const [direction, setDirection] = useState<FinanceCashDirection>(initialValues.direction);
  const [occurredDate, setOccurredDate] = useState(initialValues.occurredDate);
  const [amount, setAmount] = useState(initialValues.amount);
  const [accountId, setAccountId] = useState(initialValues.accountId);
  const [toAccountId, setToAccountId] = useState(initialValues.toAccountId);
  const [customerId, setCustomerId] = useState(initialValues.customerId);
  const [supplierId, setSupplierId] = useState(initialValues.supplierId);
  const [category, setCategory] = useState<FinanceCashCategoryValue | null>(initialValues.category);
  const [note, setNote] = useState(initialValues.note);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty =
    direction !== initialValues.direction ||
    occurredDate !== initialValues.occurredDate ||
    amount !== initialValues.amount ||
    accountId !== initialValues.accountId ||
    toAccountId !== initialValues.toAccountId ||
    customerId !== initialValues.customerId ||
    supplierId !== initialValues.supplierId ||
    category !== initialValues.category ||
    note !== initialValues.note;

  // 客户下拉：只列启用客户；编辑历史流水且其客户已停用 / 删除时补入快照，保证可保存
  const currentCustomerId = initial?.customerId ?? '';
  const customersQuery = useQuery({
    queryKey: ['customers', 'options', 'active'],
    queryFn: async (): Promise<PartyOption[]> => {
      const { data: res, response } = await api.GET('/api/v1/customers', {
        params: { query: { page: 1, pageSize: 100, status: 'active' } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items.map((item) => ({ id: item.id, name: item.name }));
    },
  });
  const activeCustomers = customersQuery.data ?? [];
  const currentCustomerMissing =
    Boolean(currentCustomerId) &&
    customersQuery.isSuccess &&
    !activeCustomers.some((option) => option.id === currentCustomerId);
  const currentCustomerQuery = useQuery({
    queryKey: ['customers', currentCustomerId],
    enabled: currentCustomerMissing,
    queryFn: async (): Promise<ApiSchemas['CustomerDto']> => {
      const { data: res, response } = await api.GET('/api/v1/customers/{id}', {
        params: { path: { id: currentCustomerId } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });
  const customerOptions: PartyOption[] =
    customersQuery.isPending || (currentCustomerMissing && currentCustomerQuery.isPending)
      ? []
      : currentCustomerMissing
        ? [
            {
              id: currentCustomerId,
              name: currentCustomerQuery.data?.name ?? initial?.customerName ?? '',
            },
            ...activeCustomers,
          ]
        : activeCustomers;

  // 供应商下拉：只列启用供应商；编辑历史流水且其供应商已停用 / 删除时补入快照
  const currentSupplierId = initial?.supplierId ?? '';
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'options', 'active'],
    queryFn: async (): Promise<PartyOption[]> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers', {
        params: { query: { page: 1, pageSize: 100, status: 'active' } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items.map((item) => ({ id: item.id, name: item.name }));
    },
  });
  const activeSuppliers = suppliersQuery.data ?? [];
  const currentSupplierMissing =
    Boolean(currentSupplierId) &&
    suppliersQuery.isSuccess &&
    !activeSuppliers.some((option) => option.id === currentSupplierId);
  const currentSupplierQuery = useQuery({
    queryKey: ['suppliers', currentSupplierId],
    enabled: currentSupplierMissing,
    queryFn: async (): Promise<ApiSchemas['SupplierDto']> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers/{id}', {
        params: { path: { id: currentSupplierId } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });
  const supplierOptions: PartyOption[] =
    suppliersQuery.isPending || (currentSupplierMissing && currentSupplierQuery.isPending)
      ? []
      : currentSupplierMissing
        ? [
            {
              id: currentSupplierId,
              name: currentSupplierQuery.data?.name ?? initial?.supplierName ?? '',
            },
            ...activeSuppliers,
          ]
        : activeSuppliers;

  // 新建只列启用账户；编辑保留原账户（可能已停用）
  const accountOptions = accounts
    .filter((account) => account.active || account.id === initial?.accountId)
    .map((account) => ({
      value: account.id,
      label: `${account.name}${account.active ? '' : '（停用）'}`,
    }));
  const toAccountOptions = accounts
    .filter(
      (account) =>
        account.id !== accountId &&
        (account.active || account.id === initial?.toAccountId),
    )
    .map((account) => ({
      value: account.id,
      label: `${account.name}${account.active ? '' : '（停用）'}`,
    }));

  const categoryOptions =
    direction === 'transfer'
      ? []
      : FINANCE_CASH_CATEGORIES_BY_DIRECTION[direction].map((value) => ({
          value,
          label: FINANCE_CASH_CATEGORY_LABELS[value],
        }));

  const changeDirection = (next: FinanceCashDirection): void => {
    setDirection(next);
    if (next === 'transfer') {
      setCategory(null);
      setCustomerId('');
      setSupplierId('');
      return;
    }
    const allowed = FINANCE_CASH_CATEGORIES_BY_DIRECTION[next];
    setCategory((current: FinanceCashCategoryValue | null) =>
      current && allowed.includes(current) ? current : allowed[0] ?? null,
    );
    if (next === 'out') {
      setCustomerId('');
    } else {
      setSupplierId('');
    }
  };

  const changeCategory = (next: string): void => {
    const value = next as FinanceCashCategoryValue;
    setCategory(value);
    if (value !== 'sales_receipt') {
      setCustomerId('');
    }
    if (value !== 'purchase_payment') {
      setSupplierId('');
    }
  };

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
    const parsed = financeCashEntryInputSchema.safeParse({
      direction,
      occurredDate,
      amount: amount.trim(),
      accountId,
      toAccountId: direction === 'transfer' ? toAccountId || null : null,
      category: direction === 'transfer' ? null : category,
      customerId:
        direction === 'in' && category === 'sales_receipt' ? customerId || null : null,
      supplierId:
        direction === 'out' && category === 'purchase_payment' ? supplierId || null : null,
      note,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { response } = initial
        ? await api.PUT('/api/v1/finance/cash-entries/{id}', {
            params: { path: { id: initial.id } },
            body: parsed.data,
          })
        : await api.POST('/api/v1/finance/cash-entries', {
            body: parsed.data,
            headers: { 'Idempotency-Key': randomUuid() },
          });
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
          <DialogTitle>{initial ? `编辑资金流水 ${initial.code}` : '登记资金流水'}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-5" onSubmit={(e) => void handleSubmit(e)}>
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            {DIRECTION_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={direction === option.value ? 'secondary' : 'ghost'}
                className="flex-1"
                onClick={() => changeDirection(option.value as FinanceCashDirection)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Field label="金额">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full"
              />
            </Field>
            <Field label="发生日期">
              <DatePicker value={occurredDate} onChange={setOccurredDate} className="w-full" />
            </Field>
            <Field label={direction === 'transfer' ? '转出账户' : '资金账户'}>
              <Select
                value={accountId}
                onChange={setAccountId}
                options={accountOptions}
                className="w-full"
              />
            </Field>
            {direction !== 'transfer' ? (
              <Field label="收支分类">
                <Select
                  value={category ?? ''}
                  onChange={changeCategory}
                  options={categoryOptions}
                  placeholder="请选择收支分类"
                  className="w-full"
                />
              </Field>
            ) : (
              <Field label="转入账户">
                <Select
                  value={toAccountId}
                  onChange={setToAccountId}
                  options={toAccountOptions}
                  placeholder="请选择转入账户"
                  className="w-full"
                />
              </Field>
            )}
            {direction === 'in' && category === 'sales_receipt' ? (
              <Field label="客户" className="col-span-2">
                <Select
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerOptions.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                  placeholder="请选择客户"
                  className="w-full"
                />
              </Field>
            ) : null}
            {direction === 'out' && category === 'purchase_payment' ? (
              <Field label="供应商" className="col-span-2">
                <Select
                  value={supplierId}
                  onChange={setSupplierId}
                  options={supplierOptions.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                  placeholder="请选择供应商"
                  className="w-full"
                />
              </Field>
            ) : null}
            <Field label="备注" className="col-span-2">
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  direction === 'in'
                    ? '如「收 9 月货款」「承兑票号 / 到期日」'
                    : direction === 'transfer'
                      ? '如「对公转个人卡」'
                      : '如「电费」「配件供应商」；承兑写票号 / 到期日'
                }
                className="min-h-20 w-full"
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
