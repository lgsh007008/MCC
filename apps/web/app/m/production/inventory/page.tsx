'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { InventoryHelpDialog } from '@/components/production/inventory-help-dialog';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileStatCard } from '@/components/mobile/stat-card';
import { Segmented } from '@/components/ui/segmented';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

type InventorySummary = ApiSchemas['InventorySummaryDto'];

// useSearchParams 在静态预渲染时需要 Suspense 边界（Next.js CSR bailout 要求）
export default function MobileInventoryPage(): React.ReactElement {
  return (
    <Suspense fallback={<p className="p-6 text-mobile-body text-muted-foreground">加载中…</p>}>
      <MobileInventoryPageInner />
    </Suspense>
  );
}

function MobileInventoryPageInner(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'timber' ? 'timber' : 'raw';
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
  const data = query.data;
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="pb-28">
      <MobileHeader title="库存" backHref="/m/production" />
      <div className="space-y-4 p-4">
        {query.isPending ? <p className="text-mobile-body text-muted-foreground">加载中…</p> : null}
        {query.isError ? <p className="text-mobile-body text-destructive">库存加载失败。</p> : null}
        {data?.needsOpening ? (
          <section className="rounded-xl border border-dashed border-border bg-card p-5 text-center">
            <p className="text-mobile-body font-medium">尚未设置期初库存</p>
            <p className="mt-1 text-mobile-label text-muted-foreground">
              请先录入上线日的原木吨数与方木各规格方数。
            </p>
          </section>
        ) : null}
        {data && !data.needsOpening ? (
          <>
            <MobileStatCard
              label="库存总值"
              value={`${formatAmount(data.totalAmount)} 元`}
              note={data.pendingAmount !== '0.00' ? `待结转 ${formatAmount(data.pendingAmount)} 元（不计入库存总值）` : undefined}
              action={
                <Button
                  type="button"
                  variant="link"
                  className="h-auto px-0 text-mobile-label"
                  onClick={() => setHelpOpen(true)}
                >
                  口径说明
                </Button>
              }
            />
            {data.negativeLineCount > 0 ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-mobile-label text-destructive">
                有 {data.negativeLineCount} 项负库存，请及时补方木产出或盘点；负库存期间成本为估算值。
              </p>
            ) : null}
            <Segmented
              value={tab}
              ariaLabel="库存类型"
              options={[
                { value: 'raw', label: '原木库存' },
                { value: 'timber', label: '方木库存' },
              ]}
              onValueChange={(next) =>
                router.replace(next === 'timber' ? '?tab=timber' : '/m/production/inventory')
              }
            />
            {tab === 'raw' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <MobileStatCard
                    label="原木库存"
                    value={`${formatQuantity(data.raw.quantity)} 吨`}
                    note={data.raw.negative ? '负库存' : undefined}
                    valueClassName={data.raw.negative ? 'text-destructive' : undefined}
                  />
                  <MobileStatCard label="原木库存值" value={`${formatAmount(data.raw.amount)} 元`} />
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-mobile-body font-medium">原木</span>
                    <span className="text-mobile-label text-muted-foreground">平均成本 {formatQuantity(data.raw.unitCost)} 元/吨</span>
                  </div>
                  <p className="mt-2 text-mobile-numeric font-semibold tabular-nums">{formatQuantity(data.raw.quantity)} 吨</p>
                  <p className="mt-1 text-mobile-label text-muted-foreground">库存值 {formatAmount(data.raw.amount)} 元 · {data.raw.negative ? '负库存' : '正常'}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <MobileStatCard
                    label="方木库存"
                    value={`${formatQuantity(data.timber.quantity)} m³`}
                    note={data.timber.negative ? '负库存' : undefined}
                    valueClassName={data.timber.negative ? 'text-destructive' : undefined}
                  />
                  <MobileStatCard label="方木库存值" value={`${formatAmount(data.timber.amount)} 元`} />
                </div>
                {data.timberLines.length === 0 ? (
                  <p className="px-1 text-mobile-body text-muted-foreground">暂无方木库存</p>
                ) : (
                  data.timberLines.map((line) => (
                    <div key={`${line.lengthMm}x${line.widthMm}x${line.heightMm}`} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-mobile-body font-medium">方木</span>
                        <span className={`text-mobile-numeric font-semibold tabular-nums ${line.negative ? 'text-destructive' : ''}`}>{formatQuantity(line.quantity)} m³</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-mobile-label text-muted-foreground">长度 {line.lengthMm} mm</p>
                        <p className="text-mobile-label text-muted-foreground">宽度 {line.widthMm} mm</p>
                        <p className="text-mobile-label text-muted-foreground">高度 {line.heightMm} mm</p>
                      </div>
                      <p className="mt-2 text-mobile-label text-muted-foreground">
                        平均成本 {formatQuantity(line.unitCost)} 元/m³ · 库存值 {formatAmount(line.amount)} 元
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        ) : null}
      </div>
      <MobileActionBar>
        <Link href="/m/production/inventory/opening" className={buttonVariants({ variant: 'outline', className: 'h-12 flex-1 text-mobile-body' })}>
          期初库存
        </Link>
      </MobileActionBar>
      <InventoryHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}
