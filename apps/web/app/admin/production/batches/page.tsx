'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BanIcon, EyeIcon, PencilIcon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { ProductionBatchDialog } from '@/components/production/batch-dialog';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 生产批次列表（product/生产与库存.md R-生产-006）。

type BatchList = ApiSchemas['ProductionBatchListDto'];
type BatchRow = ApiSchemas['ProductionBatchDto'];

const EMPTY_LIST: BatchList = { total: 0, items: [] };
const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  open: '进行中',
  closed: '已关闭',
};

const KIND_LABELS: Record<string, string> = {
  opening: '期初库存',
  production: '生产批次',
};

export default function ProductionBatchesPage(): React.ReactElement {
  const canManage = useCan('production:manage');
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', status: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<BatchRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['production-batches', page, applied],
    queryFn: async (): Promise<BatchList> => {
      const { data, response } = await api.GET('/api/v1/production-batches', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
            status: applied.status === 'open' || applied.status === 'closed' ? applied.status : undefined,
          },
        },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败，请稍后重试');
      }
      return data;
    },
  });

  const data = listQuery.data ?? EMPTY_LIST;
  const rows = data.items;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  useEffect(() => {
    setPage(1);
  }, [applied]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, applied]);

  function toggleRow(id: string, checked: boolean): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function togglePage(checked: boolean): void {
    setSelected(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  async function closeOne(row: BatchRow): Promise<void> {
    setActionError(null);
    const ok = await confirm({
      title: '关闭生产批次',
      description:
        row.pendingAmount !== '0.00'
          ? `批次 ${row.code} 还有待结转 ${formatAmount(row.pendingAmount)} 元，关闭时会一次性转入本批次方木池；关闭后不能新增或修改领用 / 产出。`
          : `将关闭批次 ${row.code}，关闭后不能新增或修改领用 / 产出。`,
      confirmText: '关闭批次',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      const { response } = await api.POST('/api/v1/production-batches/{id}/close', {
        params: { path: { id: row.id } },
      });
      if (!response.ok) {
        throw new Error('关闭失败');
      }
      await listQuery.refetch();
    } catch {
      setActionError('关闭失败：批次可能还有待结转但无方木库存，请先录产出或删除领用');
    }
  }

  async function closeSelected(): Promise<void> {
    if (selected.size === 0) {
      return;
    }
    setActionError(null);
    const ok = await confirm({
      title: '批量关闭生产批次',
      description: `将关闭选中的 ${selected.size} 个生产批次；已关闭的批次自动跳过。关闭后不能新增或修改领用 / 产出，剩余待结转一次性转入各批次方木池。`,
      confirmText: '批量关闭',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      const { response } = await api.POST('/api/v1/production-batches/batch-close', {
        body: { ids: [...selected] },
      });
      if (!response.ok) {
        throw new Error('批量关闭失败');
      }
      setSelected(new Set());
      await listQuery.refetch();
    } catch {
      setActionError('批量关闭失败：存在待结转但无方木库存的批次，请先录产出或删除领用');
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(filters);
          setPage(1);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">批次日期</span>
          <DatePicker
            value={filters.dateFrom}
            onChange={(value) => setFilters({ ...filters, dateFrom: value })}
            placeholder="开始日期"
            className="w-36"
          />
          <span className="text-xs text-muted-foreground">至</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(value) => setFilters({ ...filters, dateTo: value })}
            placeholder="结束日期"
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">状态</span>
          <Select
            ariaLabel="批次状态"
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
            options={[
              { value: '', label: '全部' },
              { value: 'open', label: '进行中' },
              { value: 'closed', label: '已关闭' },
            ]}
            className="h-8 w-24"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const empty = { dateFrom: '', dateTo: '', status: '' };
            setFilters(empty);
            setApplied(empty);
            setPage(1);
          }}
        >
          重置
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        {canManage ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
          >
            新建生产批次
          </Button>
        ) : null}
        {canManage && selected.size > 0 ? (
          <Button type="button" variant="destructive" size="sm" onClick={() => void closeSelected()}>
            批量关闭（{selected.size}）
          </Button>
        ) : null}
      </div>

      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
      {listQuery.isError ? <p className="text-sm text-destructive">加载失败，请稍后重试</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              {canManage ? (
                <TableHead className="w-8">
                  <Checkbox
                    aria-label="本页全选"
                    checked={allSelected}
                    onCheckedChange={(checked) => togglePage(checked === true)}
                  />
                </TableHead>
              ) : null}
              <TableHead>编号</TableHead>
              <TableHead>批次日期</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">方木方数</TableHead>
              <TableHead className="text-right">方木金额（元）</TableHead>
              <TableHead className="text-right">平均成本（元/m³）</TableHead>
              <TableHead className="text-right">待结转（元）</TableHead>
              <TableHead className="text-right">领用 / 产出</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={canManage ? 12 : 11} className="text-muted-foreground">加载中…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 12 : 11} className="text-muted-foreground">暂无生产批次</TableCell>
              </TableRow>
            ) : (
              rows.map((row: BatchRow) => (
                <TableRow key={row.id}>
                  {canManage ? (
                    <TableCell>
                      <Checkbox
                        aria-label={`选择 ${row.code}`}
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) => toggleRow(row.id, checked === true)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Link href={`/admin/production/batches/${row.id}`} className="text-primary hover:underline">
                      {row.code}
                    </Link>
                  </TableCell>
                  <TableCell>{row.batchDate}</TableCell>
                  <TableCell>{KIND_LABELS[row.kind] ?? row.kind}</TableCell>
                  <TableCell>{STATUS_LABELS[row.status] ?? row.status}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(row.timberVolume)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.timberAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(row.timberUnitCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.pendingAmount)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.issueCount} / {row.outputCount}
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={row.note}>{row.note}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/admin/production/batches/${row.id}`} aria-label="查看" title="查看" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                        <EyeIcon className="size-4" />
                      </Link>
                      {canManage && row.status === 'open' && row.kind === 'production' ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="编辑"
                            title="编辑"
                            onClick={() => {
                              setEditTarget(row);
                              setDialogOpen(true);
                            }}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="关闭批次"
                            title="关闭批次"
                            onClick={() => void closeOne(row)}
                          >
                            <BanIcon className="size-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一页
        </Button>
        <span className="text-muted-foreground">第 {page} / {totalPages} 页 · 共 {data.total} 条</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          下一页
        </Button>
      </div>

      <ProductionBatchDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditTarget(null);
          }
        }}
        initial={
          editTarget
            ? {
                id: editTarget.id,
                code: editTarget.code,
                batchDate: editTarget.batchDate,
                note: editTarget.note,
              }
            : undefined
        }
        onSaved={() => {
          setPage(1);
          void listQuery.refetch();
        }}
      />
    </div>
  );
}
