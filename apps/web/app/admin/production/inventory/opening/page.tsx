'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useCan } from '@/components/auth/permission-context';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

const DATE_PAD = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${DATE_PAD(now.getMonth() + 1)}-${DATE_PAD(now.getDate())}`;
};

interface TimberRow {
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  quantity: string;
  unitCost: string;
  amount: string;
}

type OpeningDetail = ApiSchemas['InventoryOpeningDetailDto'];

const emptyTimber = (): TimberRow => ({
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  quantity: '',
  unitCost: '',
  amount: '',
});

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-start gap-2">
      <Label className="w-28 shrink-0 pt-1.5 text-right text-xs text-muted-foreground">{label}</Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function OpeningReadOnly({ opening }: { opening: OpeningDetail }): React.ReactElement {
  const router = useRouter();
  const raw = opening.items.find((item) => item.targetType === 'raw_log');
  const timber = opening.items.filter((item) => item.targetType === 'timber');
  return (
    <PageFrame
      title={`库存期初 ${opening.code}`}
      actions={
        <Button type="button" variant="outline" onClick={() => router.push('/admin/production/inventory')}>
          返回库存
        </Button>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <div><span className="text-muted-foreground">期初日期：</span>{opening.openingDate}</div>
            <div><span className="text-muted-foreground">操作人：</span>{opening.operatorName}</div>
            <div><span className="text-muted-foreground">合计金额：</span>{opening.totalAmount} 元</div>
            <div className="sm:col-span-2 xl:col-span-3"><span className="text-muted-foreground">备注：</span>{opening.note || '—'}</div>
            <div className="sm:col-span-2 xl:col-span-3"><span className="text-muted-foreground">创建时间：</span>{opening.createdAt.slice(0, 19).replace('T', ' ')}</div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">原木期初</div>
          <Table>
            <TableHeader className="[&_th]:bg-muted">
              <TableRow>
                <TableHead>数量（吨）</TableHead>
                <TableHead className="text-right">单位成本（元/吨）</TableHead>
                <TableHead className="text-right">金额（元）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {raw ? (
                <TableRow>
                  <TableCell>{raw.actualQuantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{raw.unitCost}</TableCell>
                  <TableCell className="text-right tabular-nums">{raw.amount}</TableCell>
                </TableRow>
              ) : (
                <TableRow><TableCell colSpan={3} className="text-muted-foreground">无原木期初</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">方木期初（净尺寸）</div>
          <Table>
            <TableHeader className="[&_th]:bg-muted">
              <TableRow>
                <TableHead>规格（长 × 宽 × 高 mm）</TableHead>
                <TableHead className="text-right">方数（m³）</TableHead>
                <TableHead className="text-right">单位成本（元/m³）</TableHead>
                <TableHead className="text-right">金额（元）</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timber.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-muted-foreground">无方木期初</TableCell></TableRow>
              ) : (
                timber.map((item) => (
                  <TableRow key={`${item.lengthMm}x${item.widthMm}x${item.heightMm}`}>
                    <TableCell>{item.lengthMm} × {item.widthMm} × {item.heightMm}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.actualQuantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.unitCost}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.amount}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </PageFrame>
  );
}

export default function InventoryOpeningPage(): React.ReactElement {
  const canManage = useCan('inventory:manage');
  const openingQuery = useQuery({
    queryKey: ['inventory-opening-current'],
    queryFn: async (): Promise<OpeningDetail | null> => {
      const { data, response } = await api.GET('/api/v1/inventory/openings/current');
      if (response.status === 404) {
        return null;
      }
      if (!response.ok || !data) {
        throw new Error('期初库存加载失败');
      }
      return data;
    },
  });
  usePageCrumb(openingQuery.data ? [{ title: openingQuery.data.code }] : [{ title: '库存期初设置' }]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [openingDate, setOpeningDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [rawQuantity, setRawQuantity] = useState('');
  const [rawUnitCost, setRawUnitCost] = useState('');
  const [rawAmount, setRawAmount] = useState('');
  const [timber, setTimber] = useState<TimberRow[]>([emptyTimber()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (openingQuery.isPending) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (openingQuery.isError) {
    return <p className="text-sm text-destructive">期初库存加载失败，请稍后重试。</p>;
  }
  if (openingQuery.data) {
    return <OpeningReadOnly opening={openingQuery.data} />;
  }
  if (!canManage) {
    return (
      <PageFrame title="库存期初设置" actions={<Button type="button" variant="outline" onClick={() => router.push('/admin/production/inventory')}>返回库存</Button>}>
        <p className="text-sm text-muted-foreground">尚未设置期初库存，请联系管理员或销售设置。</p>
      </PageFrame>
    );
  }

  function updateTimber(index: number, patch: Partial<TimberRow>): void {
    setTimber((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (!openingDate) {
      setError('请选择期初日期');
      return;
    }
    if (rawQuantity && !rawUnitCost && !rawAmount) {
      setError('期初原木须填写单位成本或金额');
      return;
    }
    if (rawAmount && !rawQuantity) {
      setError('填写原木金额时须同时填写期初吨数');
      return;
    }
    for (const [index, row] of timber.entries()) {
      const hasQuantity = row.quantity !== '';
      const hasCost = row.unitCost !== '' || row.amount !== '';
      if ((hasQuantity || hasCost) && (!row.lengthMm || !row.widthMm || !row.heightMm)) {
        setError(`第 ${index + 1} 行：期初方木须填写长、宽、高`);
        return;
      }
      if ((hasQuantity || hasCost) && !hasQuantity) {
        setError(`第 ${index + 1} 行：请填写期初方数`);
        return;
      }
      if (hasQuantity && !hasCost) {
        setError(`第 ${index + 1} 行：请填写单位成本或金额`);
        return;
      }
    }
    const body = {
      openingDate,
      note,
      rawLog: {
        quantity: rawQuantity || '0',
        ...(rawUnitCost ? { unitCost: rawUnitCost } : {}),
        ...(rawAmount ? { amount: rawAmount } : {}),
        ...(!rawUnitCost && !rawAmount ? { unitCost: '0' } : {}),
      },
      timber: timber
        .filter((row) => row.quantity !== '')
        .map((row) => ({
          lengthMm: Number(row.lengthMm),
          widthMm: Number(row.widthMm),
          heightMm: Number(row.heightMm),
          quantity: row.quantity,
          ...(row.unitCost ? { unitCost: row.unitCost } : {}),
          ...(row.amount ? { amount: row.amount } : {}),
        })),
    };
    if (body.rawLog.quantity === '0' && body.timber.length === 0) {
      setError('期初库存不能全为 0');
      return;
    }
    setSaving(true);
    try {
      const { response } = await api.POST('/api/v1/inventory/openings', {
        headers: { 'Idempotency-Key': randomUuid() },
        body,
      });
      if (!response.ok) {
        throw new Error('保存失败');
      }
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-opening-current'] });
      router.push('/admin/production/inventory');
    } catch {
      setError('保存失败，请检查期初金额 / 单位成本后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageFrame
      title="库存期初设置"
      actions={
        <>
          <Button type="submit" form="inventory-opening-form" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/admin/production/inventory')}>
            取消
          </Button>
        </>
      }
    >
      <form id="inventory-opening-form" className="space-y-4" onSubmit={submit}>
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 xl:grid-cols-2">
            <Field label="期初日期">
              <DatePicker value={openingDate} onChange={setOpeningDate} className="w-40" />
            </Field>
            <Field label="备注">
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="min-h-8 w-full max-w-72" />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">原木期初</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="期初吨数">
              <Input value={rawQuantity} onChange={(event) => setRawQuantity(event.target.value)} inputMode="decimal" placeholder="0.000" />
            </Field>
            <Field label="单位成本（元/吨）">
              <Input value={rawUnitCost} onChange={(event) => setRawUnitCost(event.target.value)} inputMode="decimal" placeholder="可选" />
            </Field>
            <Field label="金额（元）">
              <Input value={rawAmount} onChange={(event) => setRawAmount(event.target.value)} inputMode="decimal" placeholder="与单位成本二选一" />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">方木期初（净尺寸）</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setTimber((prev) => [...prev, emptyTimber()])}>
              <PlusIcon data-icon="inline-start" />
              添加规格
            </Button>
          </div>
          <Table containerClassName="max-h-[420px] overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
              <TableRow>
                <TableHead>长度（mm）</TableHead>
                <TableHead>宽度（mm）</TableHead>
                <TableHead>高度（mm）</TableHead>
                <TableHead>方数（m³）</TableHead>
                <TableHead>单位成本（元/m³）</TableHead>
                <TableHead>金额（元）</TableHead>
                <TableHead className="w-16">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {timber.map((row, index) => (
                <TableRow key={index}>
                  <TableCell><Input value={row.lengthMm} onChange={(event) => updateTimber(index, { lengthMm: event.target.value })} inputMode="numeric" className="w-20" /></TableCell>
                  <TableCell><Input value={row.widthMm} onChange={(event) => updateTimber(index, { widthMm: event.target.value })} inputMode="numeric" className="w-20" /></TableCell>
                  <TableCell><Input value={row.heightMm} onChange={(event) => updateTimber(index, { heightMm: event.target.value })} inputMode="numeric" className="w-20" /></TableCell>
                  <TableCell><Input value={row.quantity} onChange={(event) => updateTimber(index, { quantity: event.target.value })} inputMode="decimal" className="w-24" /></TableCell>
                  <TableCell><Input value={row.unitCost} onChange={(event) => updateTimber(index, { unitCost: event.target.value })} inputMode="decimal" className="w-28" placeholder="可选" /></TableCell>
                  <TableCell><Input value={row.amount} onChange={(event) => updateTimber(index, { amount: event.target.value })} inputMode="decimal" className="w-28" placeholder="与单位成本二选一" /></TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="删除规格" title="删除规格" onClick={() => setTimber((prev) => (prev.length === 1 ? prev : prev.filter((_, rowIndex) => rowIndex !== index)))}>
                      <Trash2Icon className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      </form>
    </PageFrame>
  );
}
