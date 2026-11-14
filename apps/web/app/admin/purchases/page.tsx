'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilIcon, Trash2Icon, ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
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

// 采购单列表页（product/purchase.md R-采购-001）：筛选 → 批量操作（新建 / 批量删除）→ 表格（首列多选）→ 合计 → 分页。

// 表格行 = 契约采购单，非手写 DTO
type PurchaseRow = ApiSchemas['PurchaseOrderDto'];
type PurchaseList = ApiSchemas['PurchaseOrderListDto'];
type SupplierOption = { value: string; label: string };

type SortField = 'purchaseDate' | 'totalAmount';
type SortOrder = 'asc' | 'desc';

const EMPTY_LIST: PurchaseList = { total: 0, summary: { totalAmount: '0.00' }, items: [] };

const PAGE_SIZE = 20;

export default function PurchasesPage(): React.ReactElement {
  const canManage = useCan('purchase:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    supplierId: '',
    settlementMode: '',
    dateFrom: '',
    dateTo: '',
  });
  const [applied, setApplied] = useState(filters);
  const [sort, setSort] = useState<{ field: SortField; order: SortOrder }>({
    field: 'purchaseDate',
    order: 'desc',
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['purchase-orders', page, applied, sort],
    queryFn: async (): Promise<PurchaseList> => {
      const { data: res, response } = await api.GET('/api/v1/purchase-orders', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            supplierId: applied.supplierId || undefined,
            settlementMode:
              applied.settlementMode === 'credit' || applied.settlementMode === 'settled'
                ? applied.settlementMode
                : undefined,
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
            sortBy: sort.field,
            sortOrder: sort.order,
          },
        },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  // 供应商筛选选项
  const suppliersQuery = useQuery({
    queryKey: ['suppliers', 'options'],
    queryFn: async (): Promise<SupplierOption[]> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res.items.map((item) => ({ value: item.id, label: item.name }));
    },
  });

  const data = listQuery.data ?? EMPTY_LIST;
  const rows = data.items;
  const summary = data.summary.totalAmount;
  const total = data.total;
  const suppliers = suppliersQuery.data ?? [];
  const loading = listQuery.isPending;
  const error = actionError ?? (listQuery.isError ? '加载失败，请稍后重试' : null);

  // 翻页 / 改筛选 / 改排序即清空选择（页面模式规范）
  useEffect(() => {
    setSelected(new Set());
  }, [page, applied, sort]);

  async function reload(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
  }

  async function removePurchase(order: PurchaseRow): Promise<void> {
    try {
      setActionError(null);
      const ok = await confirm({
        title: '删除采购单',
        description: `将删除采购单 ${order.code}（${order.supplierName}）。现结派生的付款流水会一并删除，账户余额回退。编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/purchase-orders/{id}', {
            params: { path: { id: order.id } },
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
        title: '批量删除采购单',
        description: `将删除选中的 ${selected.size} 张采购单。现结派生的付款流水会一并删除，账户余额回退。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/purchase-orders/batch-delete', {
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

  const pageIds = rows.map((item) => item.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = (checked: boolean): void => {
    setSelected(checked ? new Set(pageIds) : new Set());
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resetFilters = (): void => {
    const empty = { supplierId: '', settlementMode: '', dateFrom: '', dateTo: '' };
    setFilters(empty);
    setApplied(empty);
    setPage(1);
    setSelected(new Set());
  };

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
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">供应商</span>
          <Select
            value={filters.supplierId}
            onChange={(value) => setFilters({ ...filters, supplierId: value })}
            options={[{ value: '', label: '全部' }, ...suppliers]}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">结算方式</span>
          <Select
            value={filters.settlementMode}
            onChange={(value) => setFilters({ ...filters, settlementMode: value })}
            options={[
              { value: '', label: '全部' },
              { value: 'credit', label: '赊购' },
              { value: 'settled', label: '现结' },
            ]}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">采购日期</span>
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
        <Button type="button" variant="outline" onClick={resetFilters}>
          重置
        </Button>
      </form>

      <div className="flex items-center gap-2">
        {canManage ? (
          <>
            <Link href="/admin/purchases/new" className={buttonVariants()}>
              新建
            </Link>
            {selected.size > 0 ? (
              <Button variant="destructive" onClick={() => void handleBatchDelete()}>
                批量删除({selected.size})
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
              <SortHead label="采购日期" field="purchaseDate" />
              <TableHead>供应商</TableHead>
              <TableHead className="text-right">送货吨数</TableHead>
              <TableHead className="text-right">结算吨数</TableHead>
              <TableHead className="text-right">单价</TableHead>
              <SortHead label="合计金额" field="totalAmount" right />
              <TableHead>结算方式</TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canManage ? 10 : 9} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 10 : 9} className="text-muted-foreground">
                  暂无采购单
                </TableCell>
              </TableRow>
            ) : (
              rows.map((order) => (
                <TableRow key={order.id}>
                  {canManage ? (
                    <TableCell>
                      <Checkbox
                        aria-label={`选择 ${order.code}`}
                        checked={selected.has(order.id)}
                        onCheckedChange={(checked) => toggleRow(order.id, checked === true)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Link href={`/admin/purchases/${order.id}`} className="text-primary hover:underline">
                      {order.code}
                    </Link>
                  </TableCell>
                  <TableCell>{order.purchaseDate}</TableCell>
                  <TableCell>{order.supplierName}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.deliveredTons}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.settledTons}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.unitPrice}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.totalAmount}</TableCell>
                  <TableCell>{order.settlementMode === 'settled' ? '现结' : '赊购'}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/purchases/${order.id}`}
                        aria-label="查看"
                        title="查看"
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <EyeIcon className="size-4" />
                      </Link>
                      {canManage ? (
                        <>
                          <Link
                            href={`/admin/purchases/${order.id}/edit`}
                            aria-label="编辑"
                            title="编辑"
                            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                          >
                            <PencilIcon className="size-4" />
                          </Link>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="删除"
                            title="删除"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void removePurchase(order)}
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
              {canManage ? <TableCell /> : null}
              <TableCell className="font-medium">合计</TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell />
              <TableCell className="text-right tabular-nums">{summary}</TableCell>
              <TableCell />
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="flex items-center justify-start gap-3">
        <span className="text-sm text-muted-foreground">
          第 {page} / {totalPages} 页 · 共 {total} 条
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
    </div>
  );
}
