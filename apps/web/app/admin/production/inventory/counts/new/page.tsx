'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calcMaterialCostAmount, fromScaled, toScaled, type ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { randomUuid } from '@/lib/uuid';

// 新建库存盘点（product/生产与库存.md R-生产-003）：
// 一张单只盘一类库存，类型由 ?targetType 带入；账面只读、实盘默认留空，
// 只有已填行参与盘点；差异正负即盘盈 / 盘亏，原因选填不预选；保存后生成 IC 调整单。

type InventorySummary = ApiSchemas['InventorySummaryDto'];
type TargetType = 'raw_log' | 'timber';
type Reason = 'measurement' | 'missing' | 'damage' | 'other';

const REASON_OPTIONS: Array<{ value: Reason; label: string }> = [
  { value: 'measurement', label: '计量误差' },
  { value: 'missing', label: '漏记' },
  { value: 'damage', label: '损耗' },
  { value: 'other', label: '其他' },
];

const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const diff = (actual: string, book: string, scale: 3 | 4): string =>
  fromScaled(toScaled(actual, scale) - toScaled(book, scale), scale);

interface TimberCountRow {
  key: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  actual: string;
  reason: Reason | '';
}

export default function NewInventoryCountPage(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetType: TargetType =
    searchParams.get('targetType') === 'timber' ? 'timber' : 'raw_log';
  const isTimber = targetType === 'timber';
  const listHref = isTimber
    ? '/admin/production/inventory/counts?tab=timber'
    : '/admin/production/inventory/counts';
  const title = isTimber ? '新建方木盘点' : '新建原木盘点';

  usePageCrumb([{ title: '新建盘点' }]);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [countDate, setCountDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [rawActual, setRawActual] = useState('');
  const [rawReason, setRawReason] = useState<Reason | ''>('');
  const [timberRows, setTimberRows] = useState<TimberCountRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: async (): Promise<InventorySummary> => {
      const { data, response } = await api.GET('/api/v1/inventory/summary');
      if (!response.ok || !data) {
        throw new Error('库存加载失败');
      }
      return data;
    },
  });
  const summary = query.data;

  useEffect(() => {
    if (!summary || summary.needsOpening || !isTimber) {
      return;
    }
    setTimberRows((prev) =>
      prev.length > 0
        ? prev
        : summary.timberLines.map((line) => ({
            key: `${line.lengthMm}x${line.widthMm}x${line.heightMm}`,
            lengthMm: String(line.lengthMm),
            widthMm: String(line.widthMm),
            heightMm: String(line.heightMm),
            actual: '',
            reason: '',
          })),
    );
  }, [summary, isTimber]);

  // 账面数量取当前库存；新增规格行若与现有规格相同，也按现有账面展示（服务端同口径）
  const bookOf = (row: TimberCountRow): string => {
    const match = summary?.timberLines.find(
      (line) =>
        line.lengthMm === Number(row.lengthMm) &&
        line.widthMm === Number(row.widthMm) &&
        line.heightMm === Number(row.heightMm),
    );
    return match?.quantity ?? '0.0000';
  };

  const fillBook = (): void => {
    if (!summary) {
      return;
    }
    if (isTimber) {
      setTimberRows((prev) => prev.map((row) => ({ ...row, actual: bookOf(row) })));
      return;
    }
    setRawActual(summary.raw.quantity);
  };

  const clearActual = (): void => {
    if (isTimber) {
      setTimberRows((prev) => prev.map((row) => ({ ...row, actual: '' })));
      return;
    }
    setRawActual('');
  };

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!summary || summary.needsOpening) {
      setError('请先设置期初库存');
      return;
    }
    if (countDate > localToday()) {
      setError('盘点日期不能晚于今天');
      return;
    }
    if (summary.openingDate && countDate < summary.openingDate) {
      setError(`盘点日期不能早于期初日期（${summary.openingDate}）`);
      return;
    }

    const changed: Array<{ difference: string; amount: string; scale: 3 | 4 }> = [];
    const rawBody = isTimber
      ? undefined
      : rawActual.trim() === ''
        ? undefined
        : {
            actualQuantity: rawActual.trim(),
            reason: rawReason === '' ? undefined : rawReason,
          };
    const timberBody = isTimber
      ? timberRows
          .filter((row) => row.actual.trim() !== '')
          .map((row) => ({
            lengthMm: Number(row.lengthMm),
            widthMm: Number(row.widthMm),
            heightMm: Number(row.heightMm),
            actualQuantity: row.actual.trim(),
            reason: row.reason === '' ? undefined : row.reason,
          }))
      : undefined;

    if (isTimber) {
      for (const row of timberRows) {
        if (row.actual.trim() === '') {
          continue;
        }
        const difference = diff(row.actual.trim(), bookOf(row), 4);
        changed.push({
          difference,
          amount: calcMaterialCostAmount(difference, summary.timber.unitCost),
          scale: 4,
        });
      }
      if (!timberBody || timberBody.length === 0) {
        setError('请至少填写一行实盘方数');
        return;
      }
    } else {
      if (!rawBody) {
        setError('请填写原木实盘吨数');
        return;
      }
      const difference = diff(rawBody.actualQuantity, summary.raw.quantity, 3);
      changed.push({
        difference,
        amount: calcMaterialCostAmount(difference, summary.raw.unitCost),
        scale: 3,
      });
    }

    const effective = changed.filter((item) => toScaled(item.difference, item.scale) !== 0n);
    if (effective.length === 0) {
      setError('实盘与账面一致，没有差异，无需生成调整单');
      return;
    }
    const gainCount = effective.filter((item) => !item.difference.startsWith('-')).length;
    const lossCount = effective.filter((item) => item.difference.startsWith('-')).length;
    const totalAmount = fromScaled(
      effective.reduce((sum, item) => sum + toScaled(item.amount, 2), 0n),
      2,
    );

    setSaving(true);
    const ok = await confirm({
      title: '确认库存盘点',
      description: `本次将生成一张 IC 调整单：盘盈 ${gainCount} 项，盘亏 ${lossCount} 项，差异金额 ${formatAmount(totalAmount)} 元。确认后库存立即按调整单更新。`,
      confirmText: '生成调整单',
      onConfirm: async () => {
        const body = {
          targetType,
          countDate,
          note,
          ...(rawBody ? { rawLog: rawBody } : {}),
          ...(timberBody ? { timber: timberBody } : {}),
        };
        const { data, response } = await api.POST('/api/v1/inventory/counts', {
          headers: { 'Idempotency-Key': randomUuid() },
          body,
        });
        if (!response.ok || !data) {
          throw new Error('盘点保存失败');
        }
        await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
        await queryClient.invalidateQueries({ queryKey: ['inventory-counts'] });
        router.push(`/admin/production/inventory/counts/${data.id}`);
      },
    });
    if (!ok) {
      setSaving(false);
    }
  }

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError || !summary) {
    return <p className="text-sm text-destructive">库存加载失败。</p>;
  }
  if (summary.needsOpening) {
    return (
      <PageFrame
        title={title}
        actions={
          <Link href="/admin/production/inventory" className={buttonVariants({ variant: 'outline' })}>
            返回库存
          </Link>
        }
      >
        <p className="text-sm text-muted-foreground">请先设置期初库存，再进行盘点。</p>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      title={title}
      actions={
        <>
          <Button type="submit" form="inventory-count-form" disabled={saving}>
            {saving ? '保存中…' : '保存盘点'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push(listHref)}>
            取消
          </Button>
        </>
      }
    >
      <form id="inventory-count-form" className="space-y-4" onSubmit={submit}>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="flex items-start gap-2">
              <Label className="w-24 shrink-0 pt-1.5 text-right text-xs text-muted-foreground">盘点日期</Label>
              <DatePicker value={countDate} onChange={setCountDate} className="w-40" />
            </div>
            <div className="flex items-start gap-2">
              <Label className="w-24 shrink-0 pt-1.5 text-right text-xs text-muted-foreground">备注</Label>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="min-h-8 w-full max-w-72"
              />
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            实盘留空的行不参与本次盘点；差异为正即盘盈、为负即盘亏，由系统判断。保存后生成 IC 调整单，不修改历史单据。
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">
            {isTimber ? '方木盘点明细' : '原木盘点明细'}
          </span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={fillBook}>
              按账面填充
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={clearActual}>
              清空
            </Button>
          </div>
        </div>

        {isTimber ? (
          <section className="rounded-lg border border-border bg-card">
            <Table containerClassName="max-h-[480px] overflow-y-auto">
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
                <TableRow>
                  <TableHead>长度（mm）</TableHead>
                  <TableHead>宽度（mm）</TableHead>
                  <TableHead>高度（mm）</TableHead>
                  <TableHead className="text-right">账面（m³）</TableHead>
                  <TableHead className="text-right">实盘（m³）</TableHead>
                  <TableHead className="text-right">差异（m³）</TableHead>
                  <TableHead className="text-right">单位成本（元/m³）</TableHead>
                  <TableHead className="text-right">差异金额（元）</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timberRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-muted-foreground">
                      暂无方木库存，无法盘点；盘盈新规格请先做方木产出
                    </TableCell>
                  </TableRow>
                ) : (
                  timberRows.map((row, index) => {
                    const book = bookOf(row);
                    const filled = row.actual.trim() !== '';
                    const difference = filled ? diff(row.actual.trim(), book, 4) : '';
                    const amount = filled
                      ? calcMaterialCostAmount(difference, summary.timber.unitCost)
                      : '';
                    return (
                      <TableRow key={row.key}>
                        <TableCell className="tabular-nums">{row.lengthMm}</TableCell>
                        <TableCell className="tabular-nums">{row.widthMm}</TableCell>
                        <TableCell className="tabular-nums">{row.heightMm}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQuantity(book)}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            value={row.actual}
                            onChange={(event) =>
                              setTimberRows((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, actual: event.target.value } : item,
                                ),
                              )
                            }
                            inputMode="decimal"
                            placeholder="留空不盘"
                            className="ml-auto w-28"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {filled ? formatQuantity(difference) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(summary.timber.unitCost)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {filled ? formatAmount(amount) : '—'}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.reason}
                            onChange={(value) =>
                              setTimberRows((prev) =>
                                prev.map((item, rowIndex) =>
                                  rowIndex === index ? { ...item, reason: value as Reason | '' } : item,
                                ),
                              )
                            }
                            options={REASON_OPTIONS}
                            placeholder="选填"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </section>
        ) : (
          <section className="rounded-lg border border-border bg-card">
            <Table containerClassName="overflow-x-auto">
              <TableHeader className="[&_th]:bg-muted">
                <TableRow>
                  <TableHead>库存对象</TableHead>
                  <TableHead className="text-right">账面（吨）</TableHead>
                  <TableHead className="text-right">实盘（吨）</TableHead>
                  <TableHead className="text-right">差异（吨）</TableHead>
                  <TableHead className="text-right">单位成本（元/吨）</TableHead>
                  <TableHead className="text-right">差异金额（元）</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>原木</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(summary.raw.quantity)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      value={rawActual}
                      onChange={(event) => setRawActual(event.target.value)}
                      inputMode="decimal"
                      placeholder="留空不盘"
                      className="ml-auto w-32"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rawActual.trim() === ''
                      ? '—'
                      : formatQuantity(diff(rawActual.trim(), summary.raw.quantity, 3))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQuantity(summary.raw.unitCost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rawActual.trim() === ''
                      ? '—'
                      : formatAmount(
                          calcMaterialCostAmount(
                            diff(rawActual.trim(), summary.raw.quantity, 3),
                            summary.raw.unitCost,
                          ),
                        )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={rawReason}
                      onChange={(value) => setRawReason(value as Reason | '')}
                      options={REASON_OPTIONS}
                      placeholder="选填"
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </section>
        )}

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </PageFrame>
  );
}
