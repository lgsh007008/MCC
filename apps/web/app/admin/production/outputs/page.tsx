'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { EyeIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { OutputCostHelpDialog } from '@/components/production/output-cost-help-dialog';

// 方木产出列表（product/生产与库存.md R-生产-005；页面模式规范见 product/平台布局.md）。

type OutputList = ApiSchemas['ProductionOutputListDto'];
type OutputRow = ApiSchemas['ProductionOutputListItemDto'];

const EMPTY_LIST: OutputList = { total: 0, summary: { totalVolume: '0.0000' }, items: [] };
const PAGE_SIZE = 20;

export default function ProductionOutputsPage(): React.ReactElement {
  const canManage = useCan('production:manage');
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ['production-outputs', page, applied],
    queryFn: async (): Promise<OutputList> => {
      const { data: res, response } = await api.GET('/api/v1/production-outputs', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
          },
        },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  const data = listQuery.data ?? EMPTY_LIST;
  const rows = data.items;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const error = actionError ?? (listQuery.isError ? '加载失败，请稍后重试' : null);

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

  async function reload(): Promise<void> {
    if (rows.length <= 1 && page > 1) {
      setPage(page - 1);
    } else {
      await listQuery.refetch();
    }
  }

  async function handleDelete(row: OutputRow): Promise<void> {
    try {
      setActionError(null);
      const ok = await confirm({
        title: '删除方木产出单',
        description: `将删除方木产出单 ${row.code}。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/production-outputs/{id}', {
            params: { path: { id: row.id } },
          });
          if (!response.ok) {
            throw new Error('删除失败');
          }
        },
      });
      if (ok) {
        await reload();
      }
    } catch {
      setActionError('删除失败，请稍后重试');
    }
  }

  async function handleBatchDelete(): Promise<void> {
    if (selected.size === 0) {
      return;
    }
    try {
      setActionError(null);
      const ok = await confirm({
        title: '批量删除方木产出单',
        description: `将删除选中的 ${selected.size} 条方木产出单。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/production-outputs/batch-delete', {
            body: { ids: [...selected] },
          });
          if (!response.ok) {
            throw new Error('批量删除失败');
          }
        },
      });
      if (ok) {
        await reload();
      }
    } catch {
      setActionError('批量删除失败，请稍后重试');
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
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">产出日期</span>
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
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const empty = { dateFrom: '', dateTo: '' };
            setFilters(empty);
            setApplied(empty);
            setPage(1);
          }}
        >
          重置
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {canManage ? (
            <Link href="/admin/production/outputs/new" className={buttonVariants({ size: 'sm' })}>
              新建方木产出
            </Link>
          ) : null}
          {canManage && selected.size > 0 ? (
            <Button type="button" variant="destructive" size="sm" onClick={handleBatchDelete}>
              批量删除（{selected.size}）
            </Button>
          ) : null}
        </div>
        <Button
          type="button"
          variant="link"
          size="xs"
          className="shrink-0 px-0 text-xs"
          onClick={() => setHelpOpen(true)}
        >
          方木成本口径说明
        </Button>
      </div>

      <OutputCostHelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              {canManage ? (
                <TableHead className="w-8">
                  <Checkbox aria-label="本页全选" checked={allSelected} onCheckedChange={(checked) => togglePage(checked === true)} />
                </TableHead>
              ) : null}
              <TableHead>编号</TableHead>
              <TableHead>产出日期</TableHead>
              <TableHead className="text-right">明细行数</TableHead>
              <TableHead className="text-right">产出总方数</TableHead>
              <TableHead className="text-right">本次结转金额（元）</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-muted-foreground">加载中…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-muted-foreground">暂无方木产出单</TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {canManage ? (
                    <TableCell>
                      <Checkbox aria-label={`选择 ${row.code}`} checked={selected.has(row.id)} onCheckedChange={(checked) => toggleRow(row.id, checked === true)} />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Link href={`/admin/production/outputs/${row.id}`} className="text-primary hover:underline">
                      {row.code}
                    </Link>
                  </TableCell>
                  <TableCell>{row.outputDate}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.lineCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatQuantity(row.totalVolume)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(row.settledAmount)}</TableCell>
                  <TableCell className="max-w-48 truncate" title={row.note}>{row.note}</TableCell>
                  <TableCell>{row.createdAt.slice(0, 19).replace('T', ' ')}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/admin/production/outputs/${row.id}`} aria-label="查看" title="查看" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                        <EyeIcon className="size-4" />
                      </Link>
                      {canManage ? (
                        <>
                          <Link href={`/admin/production/outputs/${row.id}/edit`} aria-label="编辑" title="编辑" className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
                            <PencilIcon className="size-4" />
                          </Link>
                          <Button type="button" variant="ghost" size="icon-sm" aria-label="删除" title="删除" onClick={() => handleDelete(row)}>
                            <Trash2Icon className="size-4 text-destructive" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter className="sticky bottom-0 [&_td]:bg-muted">
            <TableRow>
              <TableCell colSpan={canManage ? 4 : 3} className="text-right font-medium">合计</TableCell>
              <TableCell className="text-right tabular-nums">{formatQuantity(data.summary.totalVolume)}</TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableFooter>
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
    </div>
  );
}
