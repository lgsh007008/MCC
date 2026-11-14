'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calcPurchaseSubtotal,
  calcPurchaseTotal,
  calcSettlementDifference,
  purchaseInputSchema,
  type ApiSchemas,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 采购单移动表单（product/purchase.md 移动页；ADR-011 适老化基线）：
// 新建与编辑共用；单列、Label 在上、控件 48px 高；小计与合计由 shared 纯函数即时计算。
// 结构与交互对齐销售单移动表单（标题、Segmented、下拉高度、单账户自动选中、差额提示、错误浮层）。

export interface MobilePurchaseFormInitial {
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

interface SupplierOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

// 默认日期取本地时区（toISOString 是 UTC，早上 8 点前会差一天）
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const decimalOk = (value: string, scale: number): boolean =>
  new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(value);

// Label 在上、控件占满整行（移动页模式；与 PC 表单的左右并排不同）
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

export function MobilePurchaseForm({
  orderId,
  initial,
}: {
  orderId?: string;
  initial?: MobilePurchaseFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? '');
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchaseDate ?? localToday());
  const [deliveredTons, setDeliveredTons] = useState(initial?.deliveredTons ?? '');
  const [settledTons, setSettledTons] = useState(initial?.settledTons ?? '');
  const [unitPrice, setUnitPrice] = useState(initial?.unitPrice ?? '');
  const [otherAmount, setOtherAmount] = useState(initial?.otherAmount ?? '0.00');
  const [settlementMode, setSettlementMode] = useState<'credit' | 'settled'>(
    initial?.settlementMode ?? 'credit',
  );
  const [settleAccountId, setSettleAccountId] = useState(initial?.settleAccountId ?? '');
  const [paidAmount, setPaidAmount] = useState(initial?.paidAmount ?? '');
  const [paidTouched, setPaidTouched] = useState(false);
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 供应商下拉：只列启用供应商；编辑历史单且其供应商已停用 / 已删除时补入该供应商，否则单据无法保存
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'options', 'purchase-order', initial?.supplierId],
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers', {
        params: { query: { page: 1, pageSize: 100, status: 'active' } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      let options: SupplierOption[] = res.items.map((item) => ({
        id: item.id,
        code: item.code,
        name: item.name,
        status: item.status,
      }));
      const currentId = initial?.supplierId;
      if (currentId && !options.some((option) => option.id === currentId)) {
        const detail = await api.GET('/api/v1/suppliers/{id}', {
          params: { path: { id: currentId } },
        });
        if (detail.response.ok && detail.data) {
          options = [detail.data, ...options];
        } else {
          options = [
            {
              id: currentId,
              code: '',
              name: initial?.supplierName ?? '',
              status: 'deleted',
            },
            ...options,
          ];
        }
      }
      return options;
    },
  });
  const supplierOptions: SupplierOption[] = suppliersQuery.data ?? [];

  // 付款账户：只列启用账户；仅一个时自动选中，多个时必选（与 PC 同口径）
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
  const accountOptions = (accountsQuery.data ?? [])
    .filter((item) => item.active)
    .map((item) => ({ id: item.id, name: item.name }));
  useEffect(() => {
    const activeOptions = (accountsQuery.data ?? []).filter((item) => item.active);
    const onlyId = activeOptions[0]?.id;
    if (activeOptions.length === 1 && onlyId) {
      setSettleAccountId((current) => current || onlyId);
    }
    // 仅在账户选项变化时补默认值，不改动用户已选账户
  }, [accountsQuery.data]);

  const subtotal = useMemo(() => {
    if (!decimalOk(settledTons, 3) || !decimalOk(unitPrice, 2)) {
      return '0.00';
    }
    return calcPurchaseSubtotal(settledTons, unitPrice);
  }, [settledTons, unitPrice]);

  const total = useMemo(() => {
    if (!decimalOk(otherAmount, 2)) {
      return subtotal;
    }
    return calcPurchaseTotal(subtotal, otherAmount);
  }, [subtotal, otherAmount]);

  const settled = settlementMode === 'settled';
  const effectivePaid = settled ? (paidTouched ? paidAmount : total) : '';
  const settlementDiff =
    settled && decimalOk(effectivePaid, 2)
      ? calcSettlementDifference(total, effectivePaid)
      : '0.00';
  // 差额白话化：小于合计为抹零、大于合计为预付
  const settlementDiffText = settlementDiff.startsWith('-')
    ? `预付 ${settlementDiff.slice(1)} 元`
    : settlementDiff === '0.00'
      ? '与合计一致'
      : `抹零 ${settlementDiff} 元`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = purchaseInputSchema.safeParse({
      supplierId,
      purchaseDate,
      deliveredTons,
      settledTons,
      unitPrice,
      otherAmount,
      settlementMode,
      settleAccountId: settled ? settleAccountId || null : null,
      paidAmount: settled ? effectivePaid : null,
      note,
    });
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
        await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        router.push(`/m/purchase/orders/${orderId}`);
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
      await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      router.push(`/m/purchase/orders/${data.id}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <MobileHeader
        title={orderId ? `编辑 ${initial?.code ?? '采购单'}` : '新建采购单'}
        backHref={orderId ? `/m/purchase/orders/${orderId}` : '/m/purchase/orders'}
      />

      <form id="mobile-purchase-form" className="pb-40" onSubmit={handleSubmit}>
        <div className="space-y-4 p-4">
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <MobileField label="供应商" htmlFor="mobileSupplierId">
              <Select
                id="mobileSupplierId"
                value={supplierId}
                onChange={setSupplierId}
                options={[
                  { value: '', label: '请选择供应商' },
                  ...supplierOptions.map((option) => ({
                    value: option.id,
                    label:
                      option.status === 'deleted'
                        ? `${option.name}（已删除）`
                        : `${option.code} ${option.name}${option.status === 'active' ? '' : '（已停用）'}`,
                  })),
                ]}
                className="h-12 w-full px-3 text-mobile-body"
              />
            </MobileField>

            <MobileField label="采购日期" htmlFor="mobilePurchaseDate">
              <DatePicker
                id="mobilePurchaseDate"
                value={purchaseDate}
                onChange={setPurchaseDate}
                size="touch"
                className="w-full"
              />
            </MobileField>

            <MobileField label="送货吨数" htmlFor="mobileDeliveredTons">
              <Input
                id="mobileDeliveredTons"
                value={deliveredTons}
                onChange={(e) => setDeliveredTons(e.target.value)}
                inputMode="decimal"
                placeholder="0.000"
                className="h-12 text-mobile-body tabular-nums"
              />
            </MobileField>

            <MobileField label="结算吨数" htmlFor="mobileSettledTons">
              <Input
                id="mobileSettledTons"
                value={settledTons}
                onChange={(e) => setSettledTons(e.target.value)}
                inputMode="decimal"
                placeholder="0.000"
                className="h-12 text-mobile-body tabular-nums"
              />
            </MobileField>

            <MobileField label="单价（元/吨）" htmlFor="mobileUnitPrice">
              <Input
                id="mobileUnitPrice"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 text-mobile-body tabular-nums"
              />
            </MobileField>

            <MobileField label="小计金额">
              <p className="text-mobile-body tabular-nums">{subtotal} 元</p>
            </MobileField>

            <MobileField label="其他金额（运费等）" htmlFor="mobileOtherAmount">
              <Input
                id="mobileOtherAmount"
                value={otherAmount}
                onChange={(e) => setOtherAmount(e.target.value)}
                inputMode="decimal"
                className="h-12 text-mobile-body tabular-nums"
              />
            </MobileField>

            <MobileField label="合计金额">
              <p className="text-mobile-body font-semibold tabular-nums">{total} 元</p>
            </MobileField>

            <MobileField label="结算方式">
              <Segmented
                ariaLabel="结算方式"
                value={settlementMode}
                options={[
                  { value: 'credit', label: '赊购' },
                  { value: 'settled', label: '现结' },
                ]}
                onValueChange={(next) => {
                  setSettlementMode(next);
                  if (next === 'credit') {
                    setSettleAccountId('');
                    setPaidAmount('');
                    setPaidTouched(false);
                  }
                }}
              />
            </MobileField>

            {settled ? (
              <>
                <MobileField label="付款账户" htmlFor="mobileSettleAccount">
                  <Select
                    id="mobileSettleAccount"
                    value={settleAccountId}
                    onChange={setSettleAccountId}
                    options={[
                      { value: '', label: '请选择付款账户' },
                      ...accountOptions.map((account) => ({
                        value: account.id,
                        label: account.name,
                      })),
                    ]}
                    className="h-12 w-full px-3 text-mobile-body"
                  />
                </MobileField>

                <MobileField label="实付金额（元）" htmlFor="mobilePaidAmount">
                  <Input
                    id="mobilePaidAmount"
                    value={effectivePaid}
                    onChange={(e) => {
                      setPaidTouched(true);
                      setPaidAmount(e.target.value);
                    }}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="h-12 w-full text-mobile-body tabular-nums"
                  />
                  <p className="text-mobile-label text-muted-foreground tabular-nums">
                    {settlementDiffText}
                  </p>
                </MobileField>
              </>
            ) : null}

            <MobileField label="备注" htmlFor="mobilePurchaseNote">
              <Textarea
                id="mobilePurchaseNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-12 text-mobile-body"
              />
            </MobileField>
          </section>
        </div>
      </form>

      {error ? (
        <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto w-full max-w-[560px] px-4">
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-background p-3 text-mobile-body text-destructive"
          >
            {error}
          </p>
        </div>
      ) : null}

      <MobileActionBar>
        <div className="min-w-0 flex-1">
          <p className="text-mobile-caption text-muted-foreground">合计金额</p>
          <p className="text-mobile-numeric font-semibold tabular-nums">{total} 元</p>
        </div>
        <Button
          type="submit"
          form="mobile-purchase-form"
          className="h-12 px-6 text-mobile-body"
          disabled={submitting}
        >
          {submitting ? '保存中…' : '保存'}
        </Button>
      </MobileActionBar>
    </>
  );
}
