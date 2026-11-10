'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import {
  FINANCE_CATEGORY_LABELS,
  absMoney,
  type FinanceCategoryValue,
} from '@mcc/shared';
import { FinanceEventDetailDialog } from '@/components/finance/finance-event-detail-dialog';
import { FinanceEventForm } from '@/components/finance/finance-event-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
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

// 财务台账列表页（product/finance.md R-财务-001 页面设计；页面模式规范见 product/平台布局.md）：
// 筛选 → 批量操作（新建 / 批量删除，仅手工事件）→ 表格 → 分页。
// 自动事件只读：不可选、不可编辑 / 删除（以来源单据为准）。

interface FinanceEventListItem {
  id: string;
  code: string;
  occurredDate: string;
  category: FinanceCategoryValue;
  amount: string;
  note: string;
  source: 'auto' | 'manual';
  sourceType?: string | null;
  sourceId?: string | null;
  sourceCode?: string | null;
}

type SortField = 'occurredDate' | 'amount';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 20;

const CATEGORY_OPTIONS = (
  Object.entries(FINANCE_CATEGORY_LABELS) as Array<[FinanceCategoryValue, string]>
).map(([value, label]) => ({ value, label }));

export default function FinanceEventsPage(): React.ReactElement {
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', category: '', source: '' });
  const [applied, setApplied] = useState({ dateFrom: '', dateTo: '', category: '', source: '' });
  const [sort, setSort] = useState<{ field: SortField; order: SortOrder }>({
    field: 'occurredDate',
    order: 'desc',
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    total: number;
    summary: { amount: string };
    items: FinanceEventListItem[];
  }>({ total: 0, summary: { amount: '0.00' }, items: [] });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 弹窗状态机：详情 / 编辑 / 新建（详情 → 编辑为状态切换，不嵌套；弹窗规范见 product/平台布局.md）
  const [dialog, setDialog] = useState<
    | { mode: 'view'; event: FinanceEventListItem }
    | { mode: 'edit'; event: FinanceEventListItem }
    | { mode: 'create' }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 翻页 / 改筛选 / 改排序即清空选择（页面模式规范）
    setSelected(new Set());
    void (async () => {
      try {
        const { data: res, response } = await api.GET('/api/v1/finance/events', {
          params: {
            query: {
              page,
              pageSize: PAGE_SIZE,
              dateFrom: applied.dateFrom || undefined,
              dateTo: applied.dateTo || undefined,
              category: (applied.category || undefined) as FinanceCategoryValue | undefined,
              source: (applied.source || undefined) as 'auto' | 'manual' | undefined,
              sortBy: sort.field,
              sortOrder: sort.order,
            },
          },
        });
        if (!cancelled) {
          if (response.ok && res) {
            setData(res);
            setError(null);
          } else {
            setError('加载失败，请稍后重试');
          }
        }
      } catch {
        if (!cancelled) {
          setError('加载失败，请稍后重试');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, applied, sort]);

  async function reload(): Promise<void> {
    if (data.items.length <= 1 && page > 1) {
      setPage(page - 1);
    } else {
      setApplied({ ...applied });
    }
  }

  async function handleDelete(event: FinanceEventListItem): Promise<void> {
    try {
      const ok = await confirm({
        title: '删除财务事件',
        description: `将删除事件 ${event.code}。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/finance/events/{id}', {
            params: { path: { id: event.id } },
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
      setError('删除失败，请稍后重试');
    }
  }

  async function handleBatchDelete(): Promise<void> {
    if (selected.size === 0) {
      return;
    }
    try {
      const ok = await confirm({
        title: '批量删除财务事件',
        description: `将删除选中的 ${selected.size} 条事件。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/finance/events/batch-delete', {
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
      setError('批量删除失败，请稍后重试');
    }
  }

  const toggleRow = (id: string, checked: boolean): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  // 多选仅对手工事件生效（自动事件以来源单据为准，不可在财务侧删除）
  const manualPageIds = data.items.filter((item) => item.source === 'manual').map((item) => item.id);
  const allSelected = manualPageIds.length > 0 && manualPageIds.every((id) => selected.has(id));
  const togglePage = (checked: boolean): void => {
    setSelected(checked ? new Set(manualPageIds) : new Set());
  };

  const toggleSort = (field: SortField): void => {
    setSort((prev) =>
      prev.field === field
        ? { field, order: prev.order === 'asc' ? 'desc' : 'asc' }
        : { field, order: 'desc' },
    );
    setPage(1);
  };

  const SortHead = ({
    label,
    field,
    right,
  }: {
    label: string;
    field: SortField;
    right?: boolean;
  }): React.ReactElement => (
    <TableHead className={right ? 'text-right' : undefined}>
      <button
        type="button"
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        onClick={() => toggleSort(field)}
      >
        {label}
        {sort.field === field ? (
          sort.order === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )
        ) : null}
      </button>
    </TableHead>
  );

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...filters });
          setPage(1);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">日期从</span>
          <DatePicker
            value={filters.dateFrom}
            onChange={(value) => setFilters({ ...filters, dateFrom: value })}
            placeholder="开始日期"
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">日期至</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(value) => setFilters({ ...filters, dateTo: value })}
            placeholder="结束日期"
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">分类</span>
          <Select
            value={filters.category}
            onChange={(value) => setFilters({ ...filters, category: value })}
            options={[{ value: '', label: '全部' }, ...CATEGORY_OPTIONS]}
            className="w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">来源</span>
          <Select
            value={filters.source}
            onChange={(value) => setFilters({ ...filters, source: value })}
            options={[
              { value: '', label: '全部' },
              { value: 'auto', label: '自动' },
              { value: 'manual', label: '手工' },
            ]}
            className="w-24"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <Button onClick={() => setDialog({ mode: 'create' })}>新建</Button>
        {selected.size > 0 ? (
          <Button variant="destructive" onClick={() => void handleBatchDelete()}>
            批量删除({selected.size})
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="本页全选"
                  checked={allSelected}
                  onCheckedChange={(checked) => togglePage(checked === true)}
                />
              </TableHead>
              <TableHead>编号</TableHead>
              <SortHead label="发生日期" field="occurredDate" />
              <TableHead>分类</TableHead>
              <SortHead label="金额" field="amount" right />
              <TableHead>来源</TableHead>
              <TableHead>源单</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell className="text-muted-foreground">加载中…</TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground">暂无财务事件</TableCell>
              </TableRow>
            ) : (
              data.items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`选择 ${event.code}`}
                      checked={selected.has(event.id)}
                      disabled={event.source !== 'manual'}
                      onCheckedChange={(checked) => toggleRow(event.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-primary hover:bg-transparent hover:underline"
                      onClick={() => setDialog({ mode: 'view', event })}
                    >
                      {event.code}
                    </Button>
                  </TableCell>
                  <TableCell>{event.occurredDate}</TableCell>
                  <TableCell>{FINANCE_CATEGORY_LABELS[event.category]}</TableCell>
                  <TableCell className="text-right tabular-nums">{event.amount}</TableCell>
                  <TableCell>{event.source === 'auto' ? '自动' : '手工'}</TableCell>
                  <TableCell>
                    {event.sourceType === 'sale_order' && event.sourceId ? (
                      <Link
                        href={`/admin/sale-orders/${event.sourceId}`}
                        className="text-primary hover:underline"
                      >
                        {event.sourceCode}
                      </Link>
                    ) : (
                      (event.sourceCode ?? '—')
                    )}
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={event.note}>
                    {event.note}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label="查看"
                        title="查看"
                        onClick={() => setDialog({ mode: 'view', event })}
                      >
                        <EyeIcon className="size-4" />
                      </Button>
                      {event.source === 'manual' ? (
                        <>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="编辑"
                            title="编辑"
                            onClick={() => setDialog({ mode: 'edit', event })}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="删除"
                            title="删除"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleDelete(event)}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          <TableFooter className="sticky bottom-0 z-10 bg-muted [&_td]:bg-muted">
            <TableRow>
              <TableCell />
              <TableCell className="font-medium">合计</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right tabular-nums">{data.summary.amount}</TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="flex items-center justify-start gap-3">
        <span className="text-sm text-muted-foreground">
          第 {page} / {totalPages} 页 · 共 {data.total} 条
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>

      <FinanceEventDetailDialog
        event={dialog?.mode === 'view' ? dialog.event : null}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        onEdit={(event) => setDialog({ mode: 'edit', event })}
      />

      <FinanceEventForm
        key={dialog?.mode === 'edit' ? dialog.event.id : 'create'}
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        initial={
          dialog?.mode === 'edit'
            ? {
                id: dialog.event.id,
                code: dialog.event.code,
                category:
                  dialog.event.category === 'other_revenue' ? 'other_revenue' : 'other_expense',
                occurredDate: dialog.event.occurredDate,
                amount: absMoney(dialog.event.amount),
                note: dialog.event.note,
              }
            : undefined
        }
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
          }
        }}
        onSaved={() => {
          setDialog(null);
          void reload();
        }}
      />
    </div>
  );
}
