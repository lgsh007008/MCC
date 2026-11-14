'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FINANCE_CASH_CATEGORIES_BY_DIRECTION,
  FINANCE_CASH_CATEGORY_LABELS,
  financeCashEntryInputSchema,
  type ApiSchemas,
  type FinanceCashCategoryValue,
  type FinanceCashDirection,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MobileActionBar } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 移动端登记 / 编辑资金流水（product/finance.md 移动页；适老化基线）：
// 单列、Label 在上、控件 48px；方向用分段按钮；分类随方向级联，内部转账无分类且禁用；
// 客户仅在「销售回款」出现；校验与提交口径与 PC 弹窗同源（financeCashEntryInputSchema）。

export interface MobileCashEntryFormInitial {
  id: string;
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

interface AccountOption {
  id: string;
  name: string;
  active: boolean;
}

interface PartyOption {
  id: string;
  name: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

function MobileField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-mobile-label text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function MobileCashEntryForm({
  entryId,
  initial,
  onSaved,
  onCancel,
}: {
  entryId?: string;
  initial?: MobileCashEntryFormInitial;
  onSaved: () => void;
  onCancel: () => void;
}): React.ReactElement {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<FinanceCashDirection>(initial?.direction ?? 'in');
  const [occurredDate, setOccurredDate] = useState(initial?.occurredDate ?? localToday());
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [toAccountId, setToAccountId] = useState(initial?.toAccountId ?? '');
  const [category, setCategory] = useState<FinanceCashCategoryValue | ''>(initial?.category ?? '');
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 账户：启用项；编辑历史流水时补入被停用的当前账户，保证可保存
  const accountsQuery = useQuery({
    queryKey: ['finance-accounts', 'options'],
    queryFn: async (): Promise<ApiSchemas['FinanceAccountDto'][]> => {
      const { data: res, response } = await api.GET('/api/v1/finance/accounts');
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items;
    },
  });
  const accountOptions: AccountOption[] = (() => {
    const items = accountsQuery.data ?? [];
    const enabled: AccountOption[] = items
      .filter((item) => item.active)
      .map((item) => ({ id: item.id, name: item.name, active: true }));
    const current = items.find((item) => item.id === initial?.accountId);
    if (current && !enabled.some((item) => item.id === current.id)) {
      enabled.unshift({ id: current.id, name: `${current.name}（已停用）`, active: false });
    }
    return enabled;
  })();
  useEffect(() => {
    if (initial) {
      return;
    }
    const enabled = (accountsQuery.data ?? []).filter((item) => item.active);
    const onlyId = enabled[0]?.id;
    if (enabled.length === 1 && onlyId) {
      setAccountId((prev) => prev || onlyId);
    }
  }, [accountsQuery.data, initial]);

  // 客户：只列启用；编辑历史流水时补入快照客户
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
  const customerOptions: PartyOption[] = [...(customersQuery.data ?? [])];
  if (initial?.customerId && !customerOptions.some((item) => item.id === initial.customerId)) {
    customerOptions.unshift({ id: initial.customerId, name: initial.customerName });
  }

  // 供应商：只列启用；编辑历史流水时补入快照供应商
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
  const supplierOptions: PartyOption[] = [...(suppliersQuery.data ?? [])];
  if (initial?.supplierId && !supplierOptions.some((item) => item.id === initial.supplierId)) {
    supplierOptions.unshift({ id: initial.supplierId, name: initial.supplierName });
  }
  const categoryOptions: Array<{ value: string; label: string }> =
    direction === 'transfer'
      ? []
      : FINANCE_CASH_CATEGORIES_BY_DIRECTION[direction].map((value) => ({
          value,
          label: FINANCE_CASH_CATEGORY_LABELS[value],
        }));
  const showCustomer = direction === 'in' && category === 'sales_receipt';
  const showSupplier = direction === 'out' && category === 'purchase_payment';

  function handleDirectionChange(next: FinanceCashDirection): void {
    setDirection(next);
    if (next === 'transfer') {
      setCategory('');
      setCustomerId('');
      setSupplierId('');
      return;
    }
    const allowed = FINANCE_CASH_CATEGORIES_BY_DIRECTION[next];
    if (category && !allowed.includes(category)) {
      setCategory('');
      setCustomerId('');
      setSupplierId('');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = financeCashEntryInputSchema.safeParse({
      direction,
      occurredDate,
      amount: amount.trim(),
      accountId,
      toAccountId: direction === 'transfer' ? toAccountId || null : null,
      category: direction === 'transfer' ? null : category || null,
      customerId: showCustomer ? customerId || null : null,
      supplierId: showSupplier ? supplierId || null : null,
      note,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '请检查输入');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { response } = entryId
        ? await api.PUT('/api/v1/finance/cash-entries/{id}', {
            params: { path: { id: entryId } },
            body: parsed.data,
          })
        : await api.POST('/api/v1/finance/cash-entries', {
            body: parsed.data,
            headers: { 'Idempotency-Key': randomUuid() },
          });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['finance-cash-entries'] });
      onSaved();
    } catch {
      setError('保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form id="mobile-cash-entry-form" className="space-y-4 p-4 pb-32" onSubmit={handleSubmit}>
        <MobileField label="方向">
          <Segmented
            ariaLabel="方向"
            value={direction}
            options={[
              { value: 'in', label: '收款' },
              { value: 'out', label: '付款' },
              { value: 'transfer', label: '内部转账' },
            ]}
            onValueChange={handleDirectionChange}
          />
        </MobileField>

        <MobileField label="发生日期" htmlFor="mobileCashDate">
          <DatePicker
            id="mobileCashDate"
            value={occurredDate}
            onChange={setOccurredDate}
            size="touch"
            className="w-full"
          />
        </MobileField>

        <MobileField label="金额（元）" htmlFor="mobileCashAmount">
          <Input
            id="mobileCashAmount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="h-12 w-full text-mobile-body"
          />
        </MobileField>

        <MobileField
          label={direction === 'transfer' ? '转出账户' : '资金账户'}
          htmlFor="mobileCashAccount"
        >
          <Select
            id="mobileCashAccount"
            value={accountId}
            onChange={setAccountId}
            options={[
              { value: '', label: '请选择账户' },
              ...accountOptions.map((account) => ({ value: account.id, label: account.name })),
            ]}
            className="h-12 w-full px-3 text-mobile-body"
          />
        </MobileField>

        {direction === 'transfer' ? (
          <MobileField label="转入账户" htmlFor="mobileCashToAccount">
            <Select
              id="mobileCashToAccount"
              value={toAccountId}
              onChange={setToAccountId}
              options={[
                { value: '', label: '请选择转入账户' },
                ...accountOptions
                  .filter((account) => account.id !== accountId)
                  .map((account) => ({ value: account.id, label: account.name })),
              ]}
              className="h-12 w-full px-3 text-mobile-body"
            />
          </MobileField>
        ) : (
          <MobileField label="收支分类" htmlFor="mobileCashCategory">
            <Select
              id="mobileCashCategory"
              value={category}
              onChange={(value) => {
                setCategory(value as FinanceCashCategoryValue | '');
                if (value !== 'sales_receipt') {
                  setCustomerId('');
                }
              }}
              options={[{ value: '', label: '请选择分类' }, ...categoryOptions]}
              className="h-12 w-full px-3 text-mobile-body"
            />
          </MobileField>
        )}

        {showCustomer ? (
          <MobileField label="客户" htmlFor="mobileCashCustomer">
            <Select
              id="mobileCashCustomer"
              value={customerId}
              onChange={setCustomerId}
              options={[
                { value: '', label: '请选择客户' },
                ...customerOptions.map((customer) => ({
                  value: customer.id,
                  label: customer.name,
                })),
              ]}
              className="h-12 w-full px-3 text-mobile-body"
            />
          </MobileField>
        ) : null}

        {showSupplier ? (
          <MobileField label="供应商" htmlFor="mobileCashSupplier">
            <Select
              id="mobileCashSupplier"
              value={supplierId}
              onChange={setSupplierId}
              options={[
                { value: '', label: '请选择供应商' },
                ...supplierOptions.map((supplier) => ({
                  value: supplier.id,
                  label: supplier.name,
                })),
              ]}
              className="h-12 w-full px-3 text-mobile-body"
            />
          </MobileField>
        ) : null}

        <MobileField label="备注" htmlFor="mobileCashNote">
          <Textarea
            id="mobileCashNote"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="付款写付给谁、付什么；承兑写票号与到期日"
            className="min-h-24 w-full text-mobile-body"
          />
        </MobileField>

        {error ? (
          <p role="alert" className="text-mobile-body text-destructive">
            {error}
          </p>
        ) : null}
      </form>

      <MobileActionBar>
        <Button
          type="submit"
          form="mobile-cash-entry-form"
          className="h-12 flex-1 text-mobile-body"
          disabled={saving}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12 flex-1 text-mobile-body"
          disabled={saving}
          onClick={onCancel}
        >
          取消
        </Button>
      </MobileActionBar>
    </>
  );
}
