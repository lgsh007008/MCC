'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CopyIcon, Trash2Icon } from 'lucide-react';
import {
  calcBoardLineAmount,
  calcOrderTotals,
  calcVolumeM3,
  saleOrderUpdateSchema,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

// 销售单表单（product/order.md R-订单-001；页面模式规范见 product/平台布局.md）：
// 新建与编辑共用。Label 与控件左右并排；明细按钮组在标题下方左侧；明细限制行数与高度、
// 超出在明细区内滚动（页面级禁止横向滚动）。实时计算与落账同源（design/order.md §7）。

const MAX_ROWS = 200;

interface FormRow {
  id?: string;
  productType: 'board' | 'other';
  thicknessCm: string;
  widthCm: string;
  lengthCm: string;
  pieces: string;
  price: string;
  lineAmount: string;
  otherAmount: string;
  note: string;
}

export interface SaleOrderFormInitial {
  code: string;
  saleDate: string;
  customerName: string;
  otherAmount: string;
  note: string;
  items: Array<{
    id: string;
    productType: string;
    thicknessCm?: string | null;
    widthCm?: string | null;
    lengthCm?: string | null;
    pieces?: number | null;
    price?: string | null;
    lineAmount: string;
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

const emptyBoardRow = (): FormRow => ({
  productType: 'board',
  thicknessCm: '',
  widthCm: '',
  lengthCm: '',
  pieces: '',
  price: '',
  lineAmount: '',
  otherAmount: '0',
  note: '',
});
const emptyOtherRow = (): FormRow => ({ ...emptyBoardRow(), productType: 'other' });

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
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '');
  const [otherAmount, setOtherAmount] = useState(initial?.otherAmount ?? '0');
  const [note, setNote] = useState(initial?.note ?? '');
  const [items, setItems] = useState<FormRow[]>(() =>
    initial
      ? initial.items.map((item) => ({
          id: item.id,
          productType: item.productType === 'other' ? 'other' : 'board',
          thicknessCm: item.thicknessCm ?? '',
          widthCm: item.widthCm ?? '',
          lengthCm: item.lengthCm ?? '',
          pieces: item.pieces === null || item.pieces === undefined ? '' : String(item.pieces),
          price: item.price ?? '',
          lineAmount: item.lineAmount,
          otherAmount: item.otherAmount,
          note: item.note,
        }))
      : [emptyBoardRow()],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const detailScrollRef = useRef<HTMLDivElement>(null);

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

  const boardCalc = (row: FormRow): { volume?: string; line?: string } => {
    if (
      row.productType !== 'board' ||
      !decimalOk(row.thicknessCm, 3) ||
      !decimalOk(row.widthCm, 3) ||
      !decimalOk(row.lengthCm, 3) ||
      !/^[1-9]\d*$/.test(row.pieces) ||
      !decimalOk(row.price, 2)
    ) {
      return {};
    }
    const volume = calcVolumeM3(row.thicknessCm, row.widthCm, row.lengthCm, Number(row.pieces));
    return { volume, line: calcBoardLineAmount(volume, row.price) };
  };

  const totals = calcOrderTotals(
    items.map((row) => {
      const { volume, line } = boardCalc(row);
      return {
        volumeM3: row.productType === 'board' ? (volume ?? null) : null,
        lineAmount:
          row.productType === 'board'
            ? (line ?? '0.00')
            : decimalOk(row.lineAmount, 2)
              ? row.lineAmount
              : '0.00',
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
      customerName,
      otherAmount,
      note,
      items: items.map((row) => {
        const base = {
          id: row.id,
          productType: row.productType,
          otherAmount: row.otherAmount,
          note: row.note,
        };
        if (row.productType === 'board') {
          return {
            ...base,
            thicknessCm: row.thicknessCm,
            widthCm: row.widthCm,
            lengthCm: row.lengthCm,
            pieces: row.pieces === '' ? undefined : Number(row.pieces),
            price: row.price,
          };
        }
        return { ...base, lineAmount: row.lineAmount };
      }),
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
          headers: { 'Idempotency-Key': crypto.randomUUID() },
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
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">销售单</h2>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Field label="销售日期" htmlFor="saleDate">
            <Input
              id="saleDate"
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              className="h-8 w-40"
            />
          </Field>
          <Field label="客户名称" htmlFor="customerName">
            <Input
              id="customerName"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="客户名称"
              className="h-8 w-full max-w-72"
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

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">明细</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rowFull}
            onClick={() => addRow(emptyBoardRow())}
          >
            添加板材行
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rowFull}
            onClick={() => addRow(emptyOtherRow())}
          >
            添加其他行
          </Button>
          <span className="text-xs text-muted-foreground">
            共 {items.length} / {MAX_ROWS} 行
          </span>
        </div>

        <div className="mt-3 rounded-md border border-border/60">
          <Table containerRef={detailScrollRef} containerClassName="max-h-[420px] overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-card">
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>厚度(cm)</TableHead>
                <TableHead>宽度(cm)</TableHead>
                <TableHead>长度(cm)</TableHead>
                <TableHead>根数</TableHead>
                <TableHead className="text-right">方量(m³)</TableHead>
                <TableHead>单价(元/m³)</TableHead>
                <TableHead className="text-right">小计金额</TableHead>
                <TableHead>其他金额</TableHead>
                <TableHead>备注</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, index) => {
                const { volume, line } = boardCalc(row);
                const disableSpec = row.productType !== 'board';
                return (
                  <TableRow key={index}>
                    <TableCell>
                      <Select
                        value={row.productType}
                        onChange={(e) =>
                          patchRow(index, { productType: e.target.value as 'board' | 'other' })
                        }
                        className="w-24"
                      >
                        <option value="board">板材</option>
                        <option value="other">其他</option>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input
                        disabled={disableSpec}
                        value={row.thicknessCm}
                        onChange={(e) => patchRow(index, { thicknessCm: e.target.value })}
                        className={cn('h-8 w-20 text-right tabular-nums', disableSpec && 'opacity-50')}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        disabled={disableSpec}
                        value={row.widthCm}
                        onChange={(e) => patchRow(index, { widthCm: e.target.value })}
                        className={cn('h-8 w-20 text-right tabular-nums', disableSpec && 'opacity-50')}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        disabled={disableSpec}
                        value={row.lengthCm}
                        onChange={(e) => patchRow(index, { lengthCm: e.target.value })}
                        className={cn('h-8 w-20 text-right tabular-nums', disableSpec && 'opacity-50')}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        disabled={disableSpec}
                        inputMode="numeric"
                        value={row.pieces}
                        onChange={(e) => patchRow(index, { pieces: e.target.value })}
                        className={cn('h-8 w-20 text-right tabular-nums', disableSpec && 'opacity-50')}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {disableSpec ? '—' : (volume ?? '—')}
                    </TableCell>
                    <TableCell>
                      <Input
                        disabled={disableSpec}
                        value={row.price}
                        onChange={(e) => patchRow(index, { price: e.target.value })}
                        className={cn('h-8 w-20 text-right tabular-nums', disableSpec && 'opacity-50')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {disableSpec ? (
                        <Input
                          value={row.lineAmount}
                          onChange={(e) => patchRow(index, { lineAmount: e.target.value })}
                          className="h-8 w-20 text-right tabular-nums"
                        />
                      ) : (
                        <span className="inline-block w-20 tabular-nums">{line ?? '—'}</span>
                      )}
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
                        className="h-8 w-32"
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