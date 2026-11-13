'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyIcon, Trash2Icon } from 'lucide-react';
import {
  calcLineAmount,
  calcOrderTotals,
  calcSettlementDifference,
  calcVolumeM3,
  saleOrderUpdateSchema,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import type { SaleOrderFormInitial } from '@/components/order/sale-order-form';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 销售单移动表单（product/order.md 移动页；ADR-011 适老化基线）：
// 新建与编辑共用；单列、Label 在上、控件 48px 高；明细不用表格，改为逐行卡片（两列栅格）。
// 校验与计算与 PC 同源（saleOrderUpdateSchema 与 packages/shared 纯函数），不新增后端接口。

const MAX_ROWS = 200;

interface FormRow {
  id?: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  pieces: string;
  pricingMode: 'volume' | 'piece';
  price: string;
  otherAmount: string;
  note: string;
}

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface AccountOption {
  id: string;
  name: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

// 其他金额允许留空，提交前按 0 处理（避免空字符串触发金额正则校验）
const normalizeMoney = (value: string): string => (value.trim() === '' ? '0' : value.trim());
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const decimalOk = (value: string, scale: number): boolean =>
  new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(value);
const intOk = (value: string): boolean => /^[1-9]\d*$/.test(value);

const emptyRow = (): FormRow => ({
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  pieces: '',
  pricingMode: 'volume',
  price: '',
  otherAmount: '0',
  note: '',
});

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

export function MobileSaleOrderForm({
  orderId,
  initial,
}: {
  orderId?: string;
  initial?: SaleOrderFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const [saleDate, setSaleDate] = useState(initial?.saleDate ?? localToday());
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '');
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  // 结算：与 PC 表单同口径，现结才落收款账户与实收金额
  const [settlementMode, setSettlementMode] = useState<'credit' | 'settled'>(
    initial?.settlementMode ?? 'credit',
  );
  const [settleAccountId, setSettleAccountId] = useState(initial?.settleAccountId ?? '');
  const [receivedAmount, setReceivedAmount] = useState(initial?.receivedAmount ?? '');
  const [receivedTouched, setReceivedTouched] = useState(false);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);
  const [otherAmount, setOtherAmount] = useState(initial?.otherAmount ?? '0');
  const [note, setNote] = useState(initial?.note ?? '');
  const [items, setItems] = useState<FormRow[]>(() =>
    initial
      ? initial.items.map((item) => ({
          id: item.id,
          lengthMm: String(item.lengthMm),
          widthMm: String(item.widthMm),
          heightMm: String(item.heightMm),
          pieces: String(item.pieces),
          pricingMode: item.pricingMode,
          price: item.price,
          otherAmount: item.otherAmount,
          note: item.note,
        }))
      : [emptyRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 客户下拉：只列启用客户；编辑历史单且其客户已停用 / 已删除时补入该客户，否则单据无法保存
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/customers', {
          params: { query: { page: 1, pageSize: 100, status: 'active' } },
        });
        let options: CustomerOption[] = response.ok && data ? data.items : [];
        const currentId = initial?.customerId;
        if (currentId && !options.some((option) => option.id === currentId)) {
          const detail = await api.GET('/api/v1/customers/{id}', {
            params: { path: { id: currentId } },
          });
          if (detail.response.ok && detail.data) {
            options = [detail.data, ...options];
          } else {
            options = [
              {
                id: currentId,
                code: '',
                name: initial?.customerName ?? '',
                status: 'deleted',
              },
              ...options,
            ];
          }
        }
        if (!cancelled) {
          setCustomerOptions(options);
        }
      } catch {
        if (!cancelled) {
          setCustomerOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial?.customerId]);

  // 收款账户：只列启用账户；仅一个时自动选中，多个时必选（与 PC 同口径）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/finance/accounts');
        if (cancelled || !response.ok || !data) {
          return;
        }
        const options = data.items
          .filter((item) => item.active)
          .map((item) => ({ id: item.id, name: item.name }));
        setAccountOptions(options);
        const onlyId = options[0]?.id;
        if (options.length === 1 && onlyId) {
          setSettleAccountId((current) => current || onlyId);
        }
      } catch {
        if (!cancelled) {
          setAccountOptions([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchRow = (index: number, patch: Partial<FormRow>): void => {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number): void => setItems((rows) => rows.filter((_, i) => i !== index));
  const addRow = (): void => {
    setItems((rows) => (rows.length >= MAX_ROWS ? rows : [...rows, emptyRow()]));
  };
  const copyRow = (index: number): void => {
    setItems((rows) => {
      const source = rows[index];
      if (!source || rows.length >= MAX_ROWS) {
        return rows;
      }
      const copy: FormRow = { ...source };
      delete copy.id;
      return [...rows, copy];
    });
  };

  const rowCalc = (row: FormRow): { volume?: string; line?: string } => {
    if (
      !intOk(row.lengthMm) ||
      !intOk(row.widthMm) ||
      !intOk(row.heightMm) ||
      !intOk(row.pieces) ||
      !decimalOk(row.price, 2)
    ) {
      return {};
    }
    const volume = calcVolumeM3(
      Number(row.lengthMm),
      Number(row.widthMm),
      Number(row.heightMm),
      Number(row.pieces),
    );
    return {
      volume,
      line: calcLineAmount(row.pricingMode, volume, Number(row.pieces), row.price),
    };
  };

  const totals = calcOrderTotals(
    items.map((row) => {
      const { volume, line } = rowCalc(row);
      return {
        volumeM3: volume ?? '0.0000',
        lineAmount: line ?? '0.00',
        otherAmount: decimalOk(row.otherAmount, 2) ? row.otherAmount : '0.00',
      };
    }),
    decimalOk(otherAmount, 2) ? otherAmount : '0.00',
  );

  const settled = settlementMode === 'settled';
  const effectiveReceived = settled
    ? receivedTouched
      ? receivedAmount
      : totals.totalAmount
    : '';
  const settlementDiff =
    settled && decimalOk(effectiveReceived, 2)
      ? calcSettlementDifference(totals.totalAmount, effectiveReceived)
      : '0.00';
  // 差额白话化：小于合计为抹零、大于合计为预收
  const settlementDiffText = settlementDiff.startsWith('-')
    ? `预收 ${settlementDiff.slice(1)} 元`
    : settlementDiff === '0.00'
      ? '与合计一致'
      : `抹零 ${settlementDiff} 元`;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const payload = {
      saleDate,
      customerId,
      otherAmount: normalizeMoney(otherAmount),
      note,
      settlementMode,
      settleAccountId: settled ? settleAccountId || null : null,
      receivedAmount: settled ? effectiveReceived : null,
      items: items.map((row) => ({
        id: row.id,
        lengthMm: row.lengthMm,
        widthMm: row.widthMm,
        heightMm: row.heightMm,
        pieces: row.pieces === '' ? undefined : Number(row.pieces),
        pricingMode: row.pricingMode,
        price: row.price.trim(),
        otherAmount: normalizeMoney(row.otherAmount),
        note: row.note,
      })),
    };
    const parsed = saleOrderUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { data, response } = orderId
        ? await api.PUT('/api/v1/sale-orders/{id}', {
            params: { path: { id: orderId } },
            body: parsed.data,
          })
        : await api.POST('/api/v1/sale-orders', {
            body: parsed.data,
            headers: { 'Idempotency-Key': randomUuid() },
          });
      if (!response.ok || !data) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      router.push(`/m/sale-orders/${data.id}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  const rowFull = items.length >= MAX_ROWS;

  return (
    <>
      <MobileHeader
        title={orderId ? `编辑 ${initial?.code ?? '销售单'}` : '新建销售单'}
        backHref={orderId ? `/m/sale-orders/${orderId}` : '/m/sale-orders'}
      />

      <form id="mobile-sale-order-form" className="pb-40" onSubmit={handleSubmit}>
        <div className="space-y-4 p-4">
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <MobileField label="销售日期" htmlFor="mobileSaleDate">
              <DatePicker
                id="mobileSaleDate"
                value={saleDate}
                onChange={setSaleDate}
                size="touch"
                className="w-full"
              />
            </MobileField>

            <MobileField label="客户" htmlFor="mobileCustomerId">
              <Select
                id="mobileCustomerId"
                value={customerId}
                onChange={setCustomerId}
                options={[
                  { value: '', label: '请选择客户' },
                  ...customerOptions.map((option) => ({
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

            <MobileField label="结算方式">
              <Segmented
                ariaLabel="结算方式"
                value={settlementMode}
                options={[
                  { value: 'credit', label: '赊销' },
                  { value: 'settled', label: '现结' },
                ]}
                onValueChange={(next) => {
                  setSettlementMode(next);
                  if (next === 'credit') {
                    setSettleAccountId('');
                    setReceivedAmount('');
                    setReceivedTouched(false);
                  }
                }}
              />
            </MobileField>

            {settled ? (
              <>
                <MobileField label="收款账户" htmlFor="mobileSettleAccount">
                  <Select
                    id="mobileSettleAccount"
                    value={settleAccountId}
                    onChange={setSettleAccountId}
                    options={[
                      { value: '', label: '请选择收款账户' },
                      ...accountOptions.map((account) => ({
                        value: account.id,
                        label: account.name,
                      })),
                    ]}
                    className="h-12 w-full px-3 text-mobile-body"
                  />
                </MobileField>

                <MobileField label="实收金额（元）" htmlFor="mobileReceivedAmount">
                  <Input
                    id="mobileReceivedAmount"
                    value={effectiveReceived}
                    onChange={(e) => {
                      setReceivedTouched(true);
                      setReceivedAmount(e.target.value);
                    }}
                    placeholder="0.00"
                    inputMode="decimal"
                    className="h-12 w-full text-mobile-body"
                  />
                  <p className="text-mobile-label text-muted-foreground tabular-nums">
                    {settlementDiffText}
                  </p>
                </MobileField>
              </>
            ) : null}

            <MobileField label="其他金额（元）" htmlFor="mobileOtherAmount">
              <Input
                id="mobileOtherAmount"
                inputMode="decimal"
                value={otherAmount}
                onChange={(e) => setOtherAmount(e.target.value)}
                placeholder="运费等"
                className="h-12 text-mobile-body tabular-nums"
              />
            </MobileField>

            <MobileField label="备注" htmlFor="mobileNote">
              <Textarea
                id="mobileNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-12 text-mobile-body"
              />
            </MobileField>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-mobile-body font-semibold">明细</h2>
              <span className="text-mobile-caption text-muted-foreground">
                共 {items.length} / {MAX_ROWS} 行
              </span>
            </div>

            {items.map((row, index) => {
              const { volume, line } = rowCalc(row);
              return (
                <div
                  key={index}
                  role="group"
                  aria-label={`第 ${index + 1} 行`}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-mobile-body font-medium">第 {index + 1} 行</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 px-3 text-mobile-label"
                        disabled={rowFull}
                        onClick={() => copyRow(index)}
                      >
                        <CopyIcon className="size-4" />
                        复制
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 px-3 text-mobile-label text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeRow(index)}
                      >
                        <Trash2Icon className="size-4" />
                        删除
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <MobileField label="长度(mm)">
                      <Input
                        aria-label="长度(mm)"
                        inputMode="numeric"
                        value={row.lengthMm}
                        onChange={(e) => patchRow(index, { lengthMm: e.target.value })}
                        className="h-12 text-mobile-numeric tabular-nums"
                      />
                    </MobileField>
                    <MobileField label="宽度(mm)">
                      <Input
                        aria-label="宽度(mm)"
                        inputMode="numeric"
                        value={row.widthMm}
                        onChange={(e) => patchRow(index, { widthMm: e.target.value })}
                        className="h-12 text-mobile-numeric tabular-nums"
                      />
                    </MobileField>
                    <MobileField label="高度(mm)">
                      <Input
                        aria-label="高度(mm)"
                        inputMode="numeric"
                        value={row.heightMm}
                        onChange={(e) => patchRow(index, { heightMm: e.target.value })}
                        className="h-12 text-mobile-numeric tabular-nums"
                      />
                    </MobileField>
                    <MobileField label="根数">
                      <Input
                        aria-label="根数"
                        inputMode="numeric"
                        value={row.pieces}
                        onChange={(e) => patchRow(index, { pieces: e.target.value })}
                        className="h-12 text-mobile-numeric tabular-nums"
                      />
                    </MobileField>
                  </div>

                  <div className="mt-3 space-y-3">
                    <MobileField label="计价方式">
                      <Select
                        value={row.pricingMode}
                        onChange={(value) =>
                          patchRow(index, { pricingMode: value as 'volume' | 'piece' })
                        }
                        options={[
                          { value: 'volume', label: '按方量' },
                          { value: 'piece', label: '按根数' },
                        ]}
                        className="h-12 w-full px-3 text-mobile-body"
                      />
                    </MobileField>
                    <MobileField
                      label={row.pricingMode === 'piece' ? '单价（元/根）' : '单价（元/m³）'}
                    >
                      <Input
                        aria-label="单价"
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => patchRow(index, { price: e.target.value })}
                        className="h-12 text-mobile-numeric tabular-nums"
                      />
                    </MobileField>
                    <MobileField label="其他金额（元）">
                      <Input
                        inputMode="decimal"
                        value={row.otherAmount}
                        onChange={(e) => patchRow(index, { otherAmount: e.target.value })}
                        className="h-12 text-mobile-body tabular-nums"
                      />
                    </MobileField>
                    <MobileField label="备注">
                      <Input
                        value={row.note}
                        onChange={(e) => patchRow(index, { note: e.target.value })}
                        className="h-12 text-mobile-body"
                      />
                    </MobileField>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-mobile-body">
                    <span>
                      方量 <strong className="tabular-nums">{volume ?? '—'}</strong> m³
                    </span>
                    <span>
                      行金额 <strong className="tabular-nums">{line ?? '—'}</strong> 元
                    </span>
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-mobile-body"
              disabled={rowFull}
              onClick={addRow}
            >
              添加明细行
            </Button>
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
          <p className="text-mobile-caption text-muted-foreground">合计方量</p>
          <p className="text-mobile-numeric font-semibold tabular-nums">{totals.totalVolume} m³</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-mobile-caption text-muted-foreground">合计金额</p>
          <p className="text-mobile-numeric font-semibold tabular-nums">{totals.totalAmount} 元</p>
        </div>
        <Button
          type="submit"
          form="mobile-sale-order-form"
          className="h-12 px-6 text-mobile-body"
          disabled={submitting}
        >
          {submitting ? '保存中…' : '保存'}
        </Button>
      </MobileActionBar>
    </>
  );
}
