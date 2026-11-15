'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calcMaterialCostAmount, fromScaled, toScaled, type ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MobileField } from '@/components/mobile/field';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { randomUuid } from '@/lib/uuid';

// 移动新建盘点（product/生产与库存.md R-生产-003）：
// 一张单只盘一类库存（?targetType）；单列卡片；实盘默认留空、只统计已填行；
// 原因选填不预选；保存前差异确认；生成 IC 调整单。

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

// useSearchParams 在静态预渲染时需要 Suspense 边界（Next.js CSR bailout 要求）
export default function MobileNewInventoryCountPage(): React.ReactElement {
  return (
    <Suspense fallback={<p className="p-6 text-mobile-body text-muted-foreground">加载中…</p>}>
      <MobileNewInventoryCountPageInner />
    </Suspense>
  );
}

function MobileNewInventoryCountPageInner(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetType: TargetType =
    searchParams.get('targetType') === 'timber' ? 'timber' : 'raw_log';
  const isTimber = targetType === 'timber';
  const listHref = isTimber
    ? '/m/production/inventory/counts?tab=timber'
    : '/m/production/inventory/counts';
  const title = isTimber ? '新建方木盘点' : '新建原木盘点';

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

  const bookOf = (row: TimberCountRow): string => {
    const match = summary?.timberLines.find(
      (line) =>
        line.lengthMm === Number(row.lengthMm) &&
        line.widthMm === Number(row.widthMm) &&
        line.heightMm === Number(row.heightMm),
    );
    return match?.quantity ?? '0.0000';
  };

  const updateRow = (index: number, patch: Partial<TimberCountRow>): void => {
    setTimberRows((prev) =>
      prev.map((item, rowIndex) => (rowIndex === index ? { ...item, ...patch } : item)),
    );
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

  async function submit(): Promise<void> {
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
        router.push(`/m/production/inventory/counts/${data.id}`);
      },
    });
    if (!ok) {
      setSaving(false);
    }
  }

  if (query.isPending) {
    return (
      <div>
        <MobileHeader title={title} backHref={listHref} />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !summary) {
    return (
      <div>
        <MobileHeader title={title} backHref={listHref} />
        <p className="p-4 text-mobile-body text-destructive">库存加载失败。</p>
      </div>
    );
  }
  if (summary.needsOpening) {
    return (
      <div>
        <MobileHeader title={title} backHref={listHref} />
        <p className="p-4 text-mobile-body text-muted-foreground">请先设置期初库存，再进行盘点。</p>
      </div>
    );
  }

  return (
    <div className="pb-28">
      <MobileHeader title={title} backHref={listHref} />
      <div className="space-y-4 p-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <MobileField label="盘点日期">
            <DatePicker value={countDate} onChange={setCountDate} size="touch" />
          </MobileField>
          <MobileField label="备注">
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="min-h-12 text-mobile-body"
            />
          </MobileField>
          <p className="text-mobile-label text-muted-foreground">
            实盘留空的行不参与本次盘点；差异为正即盘盈、为负即盘亏，由系统判断。
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-12 flex-1 text-mobile-body"
              onClick={fillBook}
            >
              按账面填充
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 text-mobile-body"
              onClick={clearActual}
            >
              清空
            </Button>
          </div>
        </section>

        {isTimber ? (
          <>
            {timberRows.length === 0 ? (
              <p className="px-1 text-mobile-body text-muted-foreground">
                暂无方木库存，无法盘点；盘盈新规格请先做方木产出
              </p>
            ) : (
              timberRows.map((row, index) => {
                const book = bookOf(row);
                const filled = row.actual.trim() !== '';
                const difference = filled ? diff(row.actual.trim(), book, 4) : '';
                return (
                  <section key={row.key} className="space-y-2 rounded-xl border border-border bg-card p-4">
                    <h2 className="text-mobile-body font-semibold">方木规格</h2>
                    <MobileInfoRow label="长度" value={`${row.lengthMm} mm`} />
                    <MobileInfoRow label="宽度" value={`${row.widthMm} mm`} />
                    <MobileInfoRow label="高度" value={`${row.heightMm} mm`} />
                    <MobileInfoRow label="账面" value={`${formatQuantity(book)} m³`} />
                    <MobileField label="实盘（m³）">
                      <Input
                        value={row.actual}
                        onChange={(event) => updateRow(index, { actual: event.target.value })}
                        inputMode="decimal"
                        placeholder="留空不盘"
                        className="h-12 text-mobile-body"
                      />
                    </MobileField>
                    <MobileInfoRow label="差异" value={filled ? `${formatQuantity(difference)} m³` : '—'} />
                    <MobileInfoRow
                      label="单位成本"
                      value={`${formatQuantity(summary.timber.unitCost)} 元/m³`}
                    />
                    <MobileInfoRow
                      label="差异金额"
                      value={
                        filled
                          ? `${formatAmount(calcMaterialCostAmount(difference, summary.timber.unitCost))} 元`
                          : '—'
                      }
                    />
                    <MobileField label="原因">
                      <Select
                        value={row.reason}
                        onChange={(value) => updateRow(index, { reason: value as Reason | '' })}
                        options={REASON_OPTIONS}
                        placeholder="选填"
                        className="h-12 w-full text-mobile-body"
                      />
                    </MobileField>
                  </section>
                );
              })
            )}
          </>
        ) : (
          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="text-mobile-body font-semibold">原木</h2>
            <MobileInfoRow label="账面" value={`${formatQuantity(summary.raw.quantity)} 吨`} />
            <MobileField label="实盘（吨）">
              <Input
                value={rawActual}
                onChange={(event) => setRawActual(event.target.value)}
                inputMode="decimal"
                placeholder="留空不盘"
                className="h-12 text-mobile-body"
              />
            </MobileField>
            <MobileInfoRow
              label="差异"
              value={
                rawActual.trim() === ''
                  ? '—'
                  : `${formatQuantity(diff(rawActual.trim(), summary.raw.quantity, 3))} 吨`
              }
            />
            <MobileInfoRow label="单位成本" value={`${formatQuantity(summary.raw.unitCost)} 元/吨`} />
            <MobileInfoRow
              label="差异金额"
              value={
                rawActual.trim() === ''
                  ? '—'
                  : `${formatAmount(
                      calcMaterialCostAmount(
                        diff(rawActual.trim(), summary.raw.quantity, 3),
                        summary.raw.unitCost,
                      ),
                    )} 元`
              }
            />
            <MobileField label="原因">
              <Select
                value={rawReason}
                onChange={(value) => setRawReason(value as Reason | '')}
                options={REASON_OPTIONS}
                placeholder="选填"
                className="h-12 w-full text-mobile-body"
              />
            </MobileField>
          </section>
        )}

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-mobile-body text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <MobileActionBar>
        <Button
          type="button"
          className="h-12 w-full text-mobile-body"
          disabled={saving}
          onClick={submit}
        >
          {saving ? '保存中…' : '保存盘点'}
        </Button>
      </MobileActionBar>
    </div>
  );
}
