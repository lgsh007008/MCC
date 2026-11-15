'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EyeIcon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { CountHelpDialog } from '@/components/production/count-help-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAmount } from '@/lib/format';

// 库存盘点记录列表（product/生产与库存.md R-生产-003）：
// 原木 / 方木两个页内 Tab（?tab=timber）；主按钮新建盘点；行查看详情；不提供编辑 / 删除。

type CountList = ApiSchemas['InventoryCountListDto'];
type CountRow = ApiSchemas['InventoryCountListItemDto'];
type TargetType = 'raw_log' | 'timber';

const EMPTY: CountList = { total: 0, items: [] };
const PAGE_SIZE = 20;

function formatDateTime(value: string): string {
  return value.slice(0, 19).replace('T', ' ');
}

export default function InventoryCountsPage(): React.ReactElement {
  usePageCrumb([{ title: '库存盘点' }]);
  const canManage = useCan('inventory:manage');
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetType: TargetType = searchParams.get('tab') === 'timber' ? 'timber' : 'raw_log';
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);
  const query = useQuery({
    queryKey: ['inventory-counts', targetType, page, applied],
    queryFn: async (): Promise<CountList> => {
      const { data, response } = await api.GET('/api/v1/inventory/counts', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            targetType,
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
          },
        },
      });
      if (!response.ok || !data) {
        throw new Error('盘点记录加载失败');
      }
      return data;
    },
  });
  const data = query.data ?? EMPTY;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  function changeTab(next: string): void {
    setPage(1);
    router.replace(
      next === 'timber' ? '/admin/production/inventory/counts?tab=timber' : '/admin/production/inventory/counts',
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Tabs
        value={targetType === 'timber' ? 'timber' : 'raw'}
        onValueChange={changeTab}
        items={[
          { value: 'raw', label: '原木盘点' },
          { value: 'timber', label: '方木盘点' },
        ]}
      />

      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
          setPage(1);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">盘点日期</span>
          <DatePicker
            value={filters.dateFrom}
            onChange={(value) => setFilters((prev) => ({ ...prev, dateFrom: value }))}
            placeholder="开始日期"
            className="w-36"
          />
          <span className="text-xs text-muted-foreground">至</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(value) => setFilters((prev) => ({ ...prev, dateTo: value }))}
            placeholder="结束日期"
            className="w-36"
          />
        </div>
        <Button type="submit" variant="secondary">查询</Button>
        <Button type="button" variant="outline" onClick={() => { const empty = { dateFrom: '', dateTo: '' }; setFilters(empty); setApplied(empty); setPage(1); }}>重置</Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {canManage ? (
            <Link
              href={`/admin/production/inventory/counts/new?targetType=${targetType}`}
              className={buttonVariants({ size: 'sm' })}
            >
              新建盘点
            </Link>
          ) : null}
        </div>
        <Button
          type="button"
          variant="link"
          size="xs"
          className="shrink-0 px-0 text-xs"
          onClick={() => setHelpOpen(true)}
        >
          盘点口径说明
        </Button>
      </div>

      <CountHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {query.isError ? <p className="text-sm text-destructive">盘点记录加载失败，请稍后重试。</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>IC 编号</TableHead>
              <TableHead>盘点日期</TableHead>
              <TableHead>盘点类型</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead className="text-right">盘盈项数</TableHead>
              <TableHead className="text-right">盘亏项数</TableHead>
              <TableHead className="text-right">差异金额（元）</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-20 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isPending ? (
              <TableRow><TableCell colSpan={10} className="text-muted-foreground">加载中…</TableCell></TableRow>
            ) : data.items.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-muted-foreground">暂无盘点记录</TableCell></TableRow>
            ) : (
              data.items.map((row: CountRow) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link href={`/admin/production/inventory/counts/${row.id}`} className="text-primary hover:underline">
                      {row.code}
                    </Link>
                  </TableCell>
                  <TableCell>{row.adjustmentDate}</TableCell>
                  <TableCell>{row.targetType === 'timber' ? '方木盘点' : '原木盘点'}</TableCell>
                  <TableCell>{row.operatorName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.gainCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.lossCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.differenceAmount)}</TableCell>
                  <TableCell className="max-w-48 truncate" title={row.note}>{row.note || '—'}</TableCell>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Link href={`/admin/production/inventory/counts/${row.id}`} aria-label="查看" title="查看" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                        <EyeIcon className="size-4" />
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
        <span className="text-muted-foreground">第 {page} / {totalPages} 页 · 共 {data.total} 条</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
      </div>
    </div>
  );
}
