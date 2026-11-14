'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { calcPurchaseSubtotal, calcPurchaseTotal, purchaseInputSchema } from '@mcc/shared';
import { PageFrame } from '@/components/admin/page-frame';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 采购单表单（product/purchase.md R-采购-001）：新建与编辑共用。
// 单头单据；小计与合计由 shared 纯函数即时计算；现结算式才显示账户与实付。

export interface PurchaseFormInitial {
  code: string;
  supplierId: string;
  supplierName: string;
  purchaseDate: string;
  deliveredTons: string;
  settledTons: string;
  unitPrice: string;
  otherAmount: string;
  settlementMode: 'credit' | 'settled';
  settleAccountId: string | null;
  paidAmount: string | null;
  note: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

// 默认日期取本地时区（toISOString 是 UTC，早上 8 点前会差一天）
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor={htmlFor}
        className="w-24 shrink-0 justify-end text-right text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

export function PurchaseForm({
  title,
  orderId,
  initial,
}: {
  title: React.ReactNode;
  orderId?: string;
  initial?: PurchaseFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const today = localToday();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? today);
  const [deliveredTons, setDeliveredTons] = useState(initial?.deliveredTons ?? '');
  const [settledTons, setSettledTons] = useState(initial?.settledTons ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ?? '');
  const [otherAmount, setOtherAmount] = useState(initial?.otherAmount ?? '0.00');
  const [settlementMode, setSettlementMode] = useState<'credit' | 'settled'>(
    initial?.settlementMode ?? 'credit',
  );
  const [settleAccountId, setSettleAccountId] = useState(initial?.settleAccountId ?? '');
  const [paidAmount, setPaidAmount] = useState(initial?.paidAmount ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 供应商下拉：只列启用供应商；编辑历史单时若供应商已停用 / 删除，补一项快照，保证可保存
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'options', 'active'],
    queryFn: async (): Promise<Array<{ id: string; name: string }>> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers', {
        params: { query: { page: 1, pageSize: 100, status: 'active' } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items.map((item) => ({ id: item.id, name: item.name }));
    },
  });
  const suppliers = (suppliersQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));
  const initialSupplierId = initial?.supplierId;
  if (initial && initialSupplierId && !suppliers.some((item) => item.value === initialSupplierId)) {
    suppliers.unshift({ value: initialSupplierId, label: initial.supplierName });
  }

  // 现结付款账户：只列启用账户
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
  const accounts = (accountsQuery.data ?? [])
    .filter((item) => item.active)
    .map((item) => ({ value: item.id, label: item.name }));

  const subtotal = useMemo(() => {
    if (!/^\d+(\.\d{1,3})?$/.test(settledTons) || !/^\d+(\.\d{1,2})?$/.test(unitPrice)) {
      return '0.00';
    }
    return calcPurchaseSubtotal(settledTons, unitPrice);
  }, [settledTons, unitPrice]);

  const total = useMemo(() => {
    if (!/^\d+(\.\d{1,2})?$/.test(otherAmount)) {
      return subtotal;
    }
    return calcPurchaseTotal(subtotal, otherAmount);
  }, [subtotal, otherAmount]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const settled = settlementMode === 'settled';
    const payload = {
      supplierId,
      purchaseDate,
      deliveredTons,
      settledTons,
      unitPrice,
      otherAmount,
      settlementMode,
      settleAccountId: settled ? settleAccountId || null : null,
      paidAmount: settled ? paidAmount || total : null,
      note,
    };
    const parsed = purchaseInputSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      if (orderId) {
        const { response } = await api.PUT('/api/v1/purchase-orders/{id}', {
          params: { path: { id: orderId } },
          body: parsed.data,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          setError(body?.message ?? '保存失败，请稍后重试');
          return;
        }
        router.push(`/admin/purchases/${orderId}`);
        return;
      }
      const { data, response } = await api.POST('/api/v1/purchase-orders', {
        body: parsed.data,
        headers: { 'Idempotency-Key': randomUuid() },
      });
      if (!response.ok || !data) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      router.push(`/admin/purchases/${data.id}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="h-full min-h-0" onSubmit={handleSubmit}>
      <PageFrame
        title={title}
        actions={
          <div className="w-full">
            {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  router.push(orderId ? `/admin/purchases/${orderId}` : '/admin/purchases')
                }
              >
                取消
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">主单</h2>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              {/* 左列只放窄控件，右列只放宽控件，与销售单表单同一条宽度规则 */}
              <div className="space-y-3">
                <Field label="采购单编号" htmlFor="purchaseCode">
                  <Input
                    id="purchaseCode"
                    value={initial?.code ?? '系统生成'}
                    readOnly
                    disabled
                    className="h-8 w-40"
                  />
                </Field>
                <Field label="采购日期" htmlFor="purchaseDate">
                  <DatePicker
                    id="purchaseDate"
                    value={purchaseDate}
                    onChange={setPurchaseDate}
                    className="w-40"
                  />
                </Field>
                <Field label="结算方式" htmlFor="settlementMode">
                  <Select
                    id="settlementMode"
                    value={settlementMode}
                    onChange={(value) => setSettlementMode(value as 'credit' | 'settled')}
                    options={[
                      { value: 'credit', label: '赊购' },
                      { value: 'settled', label: '现结' },
                    ]}
                    className="h-8 w-40"
                  />
                </Field>
                {settlementMode === 'settled' ? (
                  <Field label="实付金额" htmlFor="paidAmount">
                    <Input
                      id="paidAmount"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder={total}
                      className="h-8 w-40"
                    />
                  </Field>
                ) : null}
              </div>
              <div className="space-y-3">
                <Field label="供应商" htmlFor="purchaseSupplier">
                  <Select
                    id="purchaseSupplier"
                    value={supplierId}
                    onChange={setSupplierId}
                    options={[{ value: '', label: '请选择供应商' }, ...suppliers]}
                    className="h-8 w-full max-w-72"
                  />
                </Field>
                {settlementMode === 'settled' ? (
                  <Field label="付款账户" htmlFor="settleAccountId">
                    <Select
                      id="settleAccountId"
                      value={settleAccountId}
                      onChange={setSettleAccountId}
                      options={[{ value: '', label: '请选择账户' }, ...accounts]}
                      className="h-8 w-full max-w-72"
                    />
                  </Field>
                ) : null}
                <Field label="备注" htmlFor="purchaseNote">
                  <Textarea
                    id="purchaseNote"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-8 w-full max-w-72"
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">吨数与金额</h2>
            <div className="mt-3 grid gap-3 xl:grid-cols-2">
              <Field label="送货吨数" htmlFor="deliveredTons">
                <Input
                  id="deliveredTons"
                  value={deliveredTons}
                  onChange={(e) => setDeliveredTons(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.000"
                  className="h-8 w-40"
                />
              </Field>
              <Field label="结算吨数" htmlFor="settledTons">
                <Input
                  id="settledTons"
                  value={settledTons}
                  onChange={(e) => setSettledTons(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.000"
                  className="h-8 w-40"
                />
              </Field>
              <Field label="单价（元/吨）" htmlFor="unitPrice">
                <Input
                  id="unitPrice"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="h-8 w-40"
                />
              </Field>
              <Field label="小计金额" htmlFor="subtotalAmount">
                <Input id="subtotalAmount" value={subtotal} readOnly disabled className="h-8 w-40" />
              </Field>
              <Field label="其他金额" htmlFor="otherAmount">
                <Input
                  id="otherAmount"
                  value={otherAmount}
                  onChange={(e) => setOtherAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="运费等"
                  className="h-8 w-40"
                />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-end gap-6 border-t border-border pt-3 text-sm">
              <span>
                合计金额：<strong>{total}</strong> 元
              </span>
            </div>
          </section>
        </div>
      </PageFrame>
    </form>
  );
}
