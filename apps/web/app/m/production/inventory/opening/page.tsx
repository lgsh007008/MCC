'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { MobileField } from '@/components/mobile/field';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

const pad = (value: number): string => String(value).padStart(2, '0');
const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

interface TimberRow {
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  quantity: string;
  unitCost: string;
  amount: string;
}
const emptyTimber = (): TimberRow => ({ lengthMm: '', widthMm: '', heightMm: '', quantity: '', unitCost: '', amount: '' });

type OpeningDetail = ApiSchemas['InventoryOpeningDetailDto'];

function OpeningReadOnly({ opening }: { opening: OpeningDetail }): React.ReactElement {
  const raw = opening.items.find((item) => item.targetType === 'raw_log');
  const timber = opening.items.filter((item) => item.targetType === 'timber');
  return (
    <div>
      <MobileHeader title="期初库存" backHref="/m/production/inventory" />
      <div className="space-y-3 p-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <MobileInfoRow label="IC 编号" value={opening.code} />
          <MobileInfoRow label="期初日期" value={opening.openingDate} />
          <MobileInfoRow label="操作人" value={opening.operatorName} />
          <MobileInfoRow label="合计金额" value={`${opening.totalAmount} 元`} />
          <MobileInfoRow label="备注" value={opening.note || '—'} />
          <MobileInfoRow label="创建时间" value={opening.createdAt.slice(0, 19).replace('T', ' ')} />
        </section>

        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <h2 className="text-mobile-body font-semibold">原木期初</h2>
          {raw ? (
            <>
              <MobileInfoRow label="数量" value={`${raw.actualQuantity} 吨`} />
              <MobileInfoRow label="单位成本" value={`${raw.unitCost} 元/吨`} />
              <MobileInfoRow label="金额" value={`${raw.amount} 元`} />
            </>
          ) : (
            <p className="text-mobile-body text-muted-foreground">无原木期初</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="px-1 text-mobile-body font-semibold">方木期初（净尺寸）</h2>
          {timber.length === 0 ? (
            <p className="px-1 text-mobile-body text-muted-foreground">无方木期初</p>
          ) : (
            timber.map((item) => (
              <div key={`${item.lengthMm}x${item.widthMm}x${item.heightMm}`} className="space-y-2 rounded-xl border border-border bg-card p-4">
                <p className="text-mobile-body font-medium">{item.lengthMm} × {item.widthMm} × {item.heightMm} mm</p>
                <MobileInfoRow label="方数" value={`${item.actualQuantity} m³`} />
                <MobileInfoRow label="单位成本" value={`${item.unitCost} 元/m³`} />
                <MobileInfoRow label="金额" value={`${item.amount} 元`} />
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

export default function MobileInventoryOpeningPage(): React.ReactElement {
  const canManage = useCan('inventory:manage');
  const router = useRouter();
  const queryClient = useQueryClient();
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
  const [openingDate, setOpeningDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [rawQuantity, setRawQuantity] = useState('');
  const [rawUnitCost, setRawUnitCost] = useState('');
  const [rawAmount, setRawAmount] = useState('');
  const [timber, setTimber] = useState<TimberRow[]>([emptyTimber()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (openingQuery.isPending) {
    return (
      <div>
        <MobileHeader title="库存期初设置" backHref="/m/production/inventory" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (openingQuery.isError) {
    return (
      <div>
        <MobileHeader title="库存期初设置" backHref="/m/production/inventory" />
        <p className="p-4 text-mobile-body text-destructive">期初库存加载失败，请稍后重试。</p>
      </div>
    );
  }
  if (openingQuery.data) {
    return <OpeningReadOnly opening={openingQuery.data} />;
  }
  if (!canManage) {
    return (
      <div>
        <MobileHeader title="库存期初设置" backHref="/m/production/inventory" />
        <p className="p-4 text-mobile-body text-muted-foreground">尚未设置期初库存，请联系管理员或销售设置。</p>
      </div>
    );
  }

  function update(index: number, patch: Partial<TimberRow>): void {
    setTimber((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  async function submit(): Promise<void> {
    setError(null);
    if (rawQuantity && !rawAmount && !rawUnitCost) {
      setError('请填写原木期初单位成本或金额');
      return;
    }
    if (rawAmount && !rawQuantity) {
      setError('填写原木金额时须同时填写期初吨数');
      return;
    }
    for (const [index, row] of timber.entries()) {
      if (row.quantity && !row.amount && !row.unitCost) {
        setError(`第 ${index + 1} 行：请填写期初单位成本或金额`);
        return;
      }
      if (row.quantity && (!row.lengthMm || !row.widthMm || !row.heightMm)) {
        setError(`第 ${index + 1} 行：请填写长宽高`);
        return;
      }
    }
    const timberItems = timber
      .filter((row) => row.quantity)
      .map((row) => ({
        lengthMm: Number(row.lengthMm),
        widthMm: Number(row.widthMm),
        heightMm: Number(row.heightMm),
        quantity: row.quantity,
        ...(row.unitCost ? { unitCost: row.unitCost } : {}),
        ...(row.amount ? { amount: row.amount } : {}),
      }));
    if (!rawQuantity && timberItems.length === 0) {
      setError('期初库存不能全为 0');
      return;
    }
    setSaving(true);
    try {
      const { response } = await api.POST('/api/v1/inventory/openings', {
        headers: { 'Idempotency-Key': randomUuid() },
        body: {
          openingDate,
          note,
          rawLog: {
            quantity: rawQuantity || '0',
            ...(rawUnitCost ? { unitCost: rawUnitCost } : {}),
            ...(rawAmount ? { amount: rawAmount } : {}),
            ...(!rawUnitCost && !rawAmount ? { unitCost: '0' } : {}),
          },
          timber: timberItems,
        },
      });
      if (!response.ok) {
        throw new Error('保存失败');
      }
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-opening-current'] });
      router.push('/m/production/inventory');
    } catch {
      setError('保存失败，请检查数量与金额后重试');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-28">
      <MobileHeader title="库存期初设置" backHref="/m/production/inventory" />
      <div className="space-y-4 p-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <MobileField label="期初日期">
            <DatePicker value={openingDate} onChange={setOpeningDate} size="touch" />
          </MobileField>
          <MobileField label="备注">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="min-h-12 text-mobile-body" />
          </MobileField>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-mobile-body font-semibold">原木期初</h2>
          <MobileField label="期初吨数">
            <Input value={rawQuantity} onChange={(event) => setRawQuantity(event.target.value)} inputMode="decimal" className="h-12 text-mobile-body" placeholder="0.000" />
          </MobileField>
          <MobileField label="单位成本（元/吨，可选）">
            <Input value={rawUnitCost} onChange={(event) => setRawUnitCost(event.target.value)} inputMode="decimal" className="h-12 text-mobile-body" placeholder="与金额二选一" />
          </MobileField>
          <MobileField label="期初金额（元）">
            <Input value={rawAmount} onChange={(event) => setRawAmount(event.target.value)} inputMode="decimal" className="h-12 text-mobile-body" placeholder="与单位成本二选一" />
          </MobileField>
        </section>

        <section className="space-y-3">
          <h2 className="text-mobile-body font-semibold">方木期初（净尺寸）</h2>
          {timber.map((row, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-mobile-body font-medium">规格 {index + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 px-3 text-mobile-label text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={timber.length === 1}
                  onClick={() => setTimber((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                >
                  <Trash2Icon className="size-4" />
                  删除
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MobileField label="长(mm)">
                  <Input value={row.lengthMm} onChange={(event) => update(index, { lengthMm: event.target.value })} inputMode="numeric" className="h-12 text-mobile-body" />
                </MobileField>
                <MobileField label="宽(mm)">
                  <Input value={row.widthMm} onChange={(event) => update(index, { widthMm: event.target.value })} inputMode="numeric" className="h-12 text-mobile-body" />
                </MobileField>
                <MobileField label="高(mm)">
                  <Input value={row.heightMm} onChange={(event) => update(index, { heightMm: event.target.value })} inputMode="numeric" className="h-12 text-mobile-body" />
                </MobileField>
                <MobileField label="方数(m³)">
                  <Input value={row.quantity} onChange={(event) => update(index, { quantity: event.target.value })} inputMode="decimal" className="h-12 text-mobile-body" />
                </MobileField>
                <MobileField label="单位成本">
                  <Input value={row.unitCost} onChange={(event) => update(index, { unitCost: event.target.value })} inputMode="decimal" className="h-12 text-mobile-body" placeholder="可选" />
                </MobileField>
                <MobileField label="金额(元)">
                  <Input value={row.amount} onChange={(event) => update(index, { amount: event.target.value })} inputMode="decimal" className="h-12 text-mobile-body" placeholder="可选" />
                </MobileField>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full text-mobile-body"
            onClick={() => setTimber((prev) => [...prev, emptyTimber()])}
          >
            <PlusIcon data-icon="inline-start" />
            添加规格
          </Button>
        </section>

        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-mobile-body text-destructive">{error}</p> : null}
      </div>
      <MobileActionBar>
        <Button type="button" className="h-12 w-full text-mobile-body" disabled={saving} onClick={submit}>
          {saving ? '保存中…' : '保存期初库存'}
        </Button>
      </MobileActionBar>
    </div>
  );
}
