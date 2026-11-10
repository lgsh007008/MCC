'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyIcon, Trash2Icon } from 'lucide-react';
import {
  calcLineAmount,
  calcOrderTotals,
  calcVolumeM3,
  saleOrderUpdateSchema,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';
import { cn } from '@/lib/utils';

// 销售单表单（product/order.md R-订单-001；页面模式规范见 product/平台布局.md）：
// 新建与编辑共用。产品类型固定方木、不在表单出现；计价方式行级选择（默认按方量）。
// 尺寸为整数毫米，录入顺序为长、宽、高；方量两种计价方式下都实时计算（工资依据）。实时计算与落账同源（design/order.md §7）。

const MAX_ROWS = 200;

// 其他金额允许留空，提交前按 0 处理（避免空字符串触发金额正则校验）
const normalizeMoney = (value: string): string => (value.trim() === '' ? '0' : value.trim());

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

export interface SaleOrderFormInitial {
  code: string;
  saleDate: string;
  customerId: string;
  customerName: string;
  otherAmount: string;
  note: string;
  items: Array<{
    id: string;
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    pieces: number;
    pricingMode: 'volume' | 'piece';
    price: string;
    otherAmount: string;
    note: string;
  }>;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const decimalOk = (value: string, scale: number): boolean =>
  new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(value);
const intOk = (value: string): boolean => /^[1-9]\d*$/.test(value);

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

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
      <Label htmlFor={htmlFor} className="w-24 shrink-0 justify-end text-right text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function SaleOrderForm({
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
  const detailScrollRef = useRef<HTMLDivElement>(null);

  // 客户下拉（design/order.md §7）：只列启用客户；编辑历史单且其客户已停用时补入该客户，
  // 否则单据无法保存。
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
            // 客户档案已删除：用单据快照补选项，保证历史单仍可保存（design/order.md §7）
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

  const scrollDetailToEnd = (): void => {
    requestAnimationFrame(() => {
      const el = detailScrollRef.current;
      el?.scrollTo({ top: el.scrollHeight });
    });
  };

  const patchRow = (index: number, patch: Partial<FormRow>): void => {
    setItems((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const removeRow = (index: number): void => setItems((rows) => rows.filter((_, i) => i !== index));
  const addRow = (row: FormRow): void => {
    setItems((rows) => (rows.length >= MAX_ROWS ? rows : [...rows, row]));
    scrollDetailToEnd();
  };
  // 复制行：深拷贝当前行全部字段（去行 id），追加到明细末尾（design/order.md §7）
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
    scrollDetailToEnd();
  };

  // 方量：整数毫米、两种计价方式都计算；行金额由计价方式决定
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const payload = {
      saleDate,
      customerId,
      otherAmount: normalizeMoney(otherAmount),
      note,
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
      if (orderId) {
        const { response } = await api.PUT('/api/v1/sale-orders/{id}', {
          params: { path: { id: orderId } },
          body: parsed.data,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          setError(body?.message ?? '保存失败，请稍后重试');
          return;
        }
      } else {
        const { data, response } = await api.POST('/api/v1/sale-orders', {
          body: parsed.data,
          headers: { 'Idempotency-Key': randomUuid() },
        });
        if (!response.ok || !data) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          setError(body?.message ?? '保存失败，请稍后重试');
          return;
        }
        orderId = data.id;
      }
      router.push(`/admin/sale-orders/${orderId}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  const rowFull = items.length >= MAX_ROWS;

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">销售单</h2>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Field label="销售日期" htmlFor="saleDate">
            <DatePicker
              id="saleDate"
              value={saleDate}
              onChange={setSaleDate}
              className="w-40"
            />
          </Field>
          <Field label="客户" htmlFor="customerId">
            <Select
              id="customerId"
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
              className="w-full max-w-72"
            />
          </Field>
          <Field label="其他金额" htmlFor="otherAmount">
            <Input
              id="otherAmount"
              value={otherAmount}
              onChange={(e) => setOtherAmount(e.target.value)}
              placeholder="运费等"
              className="h-8 w-40"
            />
          </Field>
          <Field label="备注" htmlFor="note">
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-8 w-full max-w-72"
            />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">明细</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rowFull}
            onClick={() => addRow(emptyRow())}
          >
            添加明细行
          </Button>
          <span className="text-xs text-muted-foreground">
            共 {items.length} / {MAX_ROWS} 行
          </span>
        </div>

        <div className="mt-3 rounded-md border border-border/60">
          <Table containerRef={detailScrollRef} containerClassName="max-h-[420px] overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
              <TableRow>
                <TableHead>长度(mm)</TableHead>
                <TableHead>宽度(mm)</TableHead>
                <TableHead>高度(mm)</TableHead>
                <TableHead>根数</TableHead>
                <TableHead>计价方式</TableHead>
                <TableHead className="text-right">方量(m³)</TableHead>
                <TableHead>单价</TableHead>
                <TableHead className="text-right">小计金额</TableHead>
                <TableHead>其他金额</TableHead>
                <TableHead>备注</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, index) => {
                const { volume, line } = rowCalc(row);
                return (
                  <TableRow key={index}>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        value={row.lengthMm}
                        onChange={(e) => patchRow(index, { lengthMm: e.target.value })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        value={row.widthMm}
                        onChange={(e) => patchRow(index, { widthMm: e.target.value })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        value={row.heightMm}
                        onChange={(e) => patchRow(index, { heightMm: e.target.value })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="numeric"
                        value={row.pieces}
                        onChange={(e) => patchRow(index, { pieces: e.target.value })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.pricingMode}
                        onChange={(value) =>
                          patchRow(index, { pricingMode: value as 'volume' | 'piece' })
                        }
                        options={[
                          { value: 'volume', label: '按方量' },
                          { value: 'piece', label: '按根数' },
                        ]}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{volume ?? '—'}</TableCell>
                    <TableCell>
                      <Input
                        value={row.price}
                        onChange={(e) => patchRow(index, { price: e.target.value })}
                        className="h-8 w-20 text-right tabular-nums"
                        placeholder={row.pricingMode === 'piece' ? '元/根' : '元/m³'}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn('inline-block w-20 tabular-nums')}>{line ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.otherAmount}
                        onChange={(e) => patchRow(index, { otherAmount: e.target.value })}
                        className="h-8 w-20 text-right tabular-nums"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={row.note}
                        onChange={(e) => patchRow(index, { note: e.target.value })}
                        className="h-8 w-36"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="复制行"
                          title="复制行"
                          disabled={rowFull}
                          onClick={() => copyRow(index)}
                        >
                          <CopyIcon className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="删除行"
                          title="删除行"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => removeRow(index)}
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex justify-end gap-6 text-sm tabular-nums">
          <span>
            合计方量：<strong>{totals.totalVolume}</strong> m³
          </span>
          <span>
            小计金额：<strong>{totals.subtotalAmount}</strong> 元
          </span>
          <span>
            合计金额：<strong>{totals.totalAmount}</strong> 元
          </span>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '保存中…' : '保存'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(orderId ? `/admin/sale-orders/${orderId}` : '/admin/sale-orders')}
        >
          取消
        </Button>
      </div>
    </form>
  );
}
