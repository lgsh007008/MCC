'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { InventoryHelpDialog } from '@/components/production/inventory-help-dialog';
import { useCan } from '@/components/auth/permission-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 库存页（product/生产与库存.md R-生产-002）：
// 原木 / 方木两个页内 Tab，URL ?tab=timber；期初入口始终显示；盘点入口只走「库存盘点」菜单。

type InventorySummary = ApiSchemas['InventorySummaryDto'];

const EMPTY: InventorySummary = {
  needsOpening: true,
  openingDate: null,
  raw: { quantity: '0.000', unitCost: '0.000000', amount: '0.00', negative: false },
  timber: { quantity: '0.0000', unitCost: '0.000000', amount: '0.00', negative: false },
  timberLines: [],
  totalAmount: '0.00',
  pendingAmount: '0.00',
  pendingIssueCount: 0,
  earliestPendingIssueCode: null,
  earliestPendingIssueDate: null,
  negativeLineCount: 0,
};

export default function InventoryPage(): React.ReactElement {
  const canManage = useCan('inventory:manage');
  const [helpOpen, setHelpOpen] = useState(false);
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
  const data = query.data ?? EMPTY;

  function changeTab(next: string): void {
    router.replace(next === 'timber' ? '?tab=timber' : '/admin/production/inventory');
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          库存按当前采购、生产、销售与盘点实时计算；库存估值为材料成本口径，不含人工与费用。
          {!data.needsOpening ? (
            <>
              {' '}库存总值 <span className="font-medium text-foreground tabular-nums">{formatAmount(data.totalAmount)}</span> 元
            </>
          ) : null}
          {!data.needsOpening && data.pendingAmount !== '0.00' ? (
            <>
              {' '}待结转 <span className="font-medium text-foreground tabular-nums">{formatAmount(data.pendingAmount)}</span> 元（不计入库存总值）
            </>
          ) : null}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="link"
            size="xs"
            className="shrink-0 px-0 text-xs"
            onClick={() => setHelpOpen(true)}
          >
            库存口径说明
          </Button>
          <Link
            href="/admin/production/inventory/opening"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            期初库存
          </Link>
        </div>
      </div>

      <InventoryHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {query.isError ? <p className="text-sm text-destructive">库存加载失败，请稍后重试。</p> : null}

      {data.needsOpening ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">尚未设置期初库存</p>
          <p className="mt-1 text-sm text-muted-foreground">
            请先录入上线日的原木吨数与方木各规格方数，库存与材料成本才可计算。
          </p>
          {canManage ? (
            <Link href="/admin/production/inventory/opening" className={buttonVariants({ className: 'mt-4' })}>
              设置期初库存
            </Link>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">请联系管理员或销售设置期初库存。</p>
          )}
        </div>
      ) : (
        <>
          {data.negativeLineCount > 0 ? (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              有 {data.negativeLineCount} 项负库存，请及时补方木产出或盘点；负库存期间的成本为估算值。
            </p>
          ) : null}

          <Tabs
            value={tab}
            onValueChange={changeTab}
            items={[
              { value: 'raw', label: '原木库存' },
              { value: 'timber', label: '方木库存' },
            ]}
          />

          {tab === 'raw' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">原木库存（吨）</p>
                  <p className={`mt-1 text-2xl tabular-nums ${data.raw.negative ? 'text-destructive' : ''}`}>
                    {formatQuantity(data.raw.quantity)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">原木库存值（元）</p>
                  <p className="mt-1 text-2xl tabular-nums">{formatAmount(data.raw.amount)}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card">
                <Table containerClassName="overflow-x-auto">
                  <TableHeader className="[&_th]:bg-muted">
                    <TableRow>
                      <TableHead>库存对象</TableHead>
                      <TableHead className="text-right">数量（吨）</TableHead>
                      <TableHead className="text-right">平均成本（元/吨）</TableHead>
                      <TableHead className="text-right">库存值（元）</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>原木</TableCell>
                      <TableCell className={`text-right tabular-nums ${data.raw.negative ? 'text-destructive' : ''}`}>{formatQuantity(data.raw.quantity)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatQuantity(data.raw.unitCost)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(data.raw.amount)}</TableCell>
                      <TableCell>{data.raw.negative ? '负库存' : '正常'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">方木库存（m³）</p>
                  <p className={`mt-1 text-2xl tabular-nums ${data.timber.negative ? 'text-destructive' : ''}`}>
                    {formatQuantity(data.timber.quantity)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">方木库存值（元）</p>
                  <p className="mt-1 text-2xl tabular-nums">{formatAmount(data.timber.amount)}</p>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card">
                <Table containerClassName="max-h-[520px] overflow-y-auto">
                  <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
                    <TableRow>
                      <TableHead>产品类型</TableHead>
                      <TableHead>长度（mm）</TableHead>
                      <TableHead>宽度（mm）</TableHead>
                      <TableHead>高度（mm）</TableHead>
                      <TableHead className="text-right">库存方数（m³）</TableHead>
                      <TableHead className="text-right">平均成本（元/m³）</TableHead>
                      <TableHead className="text-right">库存值（元）</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.timberLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-muted-foreground">暂无方木库存</TableCell>
                      </TableRow>
                    ) : (
                      data.timberLines.map((line) => (
                        <TableRow key={`${line.lengthMm}x${line.widthMm}x${line.heightMm}`}>
                          <TableCell>方木</TableCell>
                          <TableCell className="tabular-nums">{line.lengthMm}</TableCell>
                          <TableCell className="tabular-nums">{line.widthMm}</TableCell>
                          <TableCell className="tabular-nums">{line.heightMm}</TableCell>
                          <TableCell className={`text-right tabular-nums ${line.negative ? 'text-destructive' : ''}`}>{formatQuantity(line.quantity)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatQuantity(line.unitCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatAmount(line.amount)}</TableCell>
                          <TableCell>{line.negative ? '负库存' : '正常'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
