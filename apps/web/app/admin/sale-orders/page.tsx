'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { ArrowDownIcon, ArrowUpIcon, EyeIcon, PencilIcon, Trash2Icon } from 'lucide-react';
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

// 销售单列表页（product/order.md R-订单-001；页面模式规范见 product/平台布局.md）：
// 筛选 → 批量操作（新建 / 批量删除）→ 表格（首列多选、可排序列、图标行操作）→ 分页。

// 类型一律取自契约生成产物（ADR-006），不手写 DTO
type SaleOrderList = ApiSchemas['SaleOrderListDto'];
type OrderListItem = ApiSchemas['SaleOrderListItemDto'];
type OrderSummary = ApiSchemas['SaleOrderSummaryDto'];
type CustomerOption = ApiSchemas['CustomerDto'];

const EMPTY_SUMMARY: OrderSummary = {
  totalVolume: '0.0000',
  subtotalAmount: '0.00',
  otherAmount: '0.00',
  totalAmount: '0.00',
};

const EMPTY_LIST: SaleOrderList = { total: 0, summary: EMPTY_SUMMARY, items: [] };

type SortField = 'saleDate' | 'totalVolume' | 'totalAmount';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 20;

export default function SaleOrdersPage(): React.ReactElement {
  const canManage = useCan('order:manage');
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ customerId: '', dateFrom: '', dateTo: '' });
  const [applied, setApplied] = useState({ customerId: '', dateFrom: '', dateTo: '' });
  const [sort, setSort] = useState<{ field: SortField; order: SortOrder }>({
    field: 'saleDate',
    order: 'desc',
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['sale-orders', page, applied, sort],
    queryFn: async (): Promise<SaleOrderList> => {
      const { data: res, response } = await api.GET('/api/v1/sale-orders', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            customerId: applied.customerId || undefined,
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

  // 客户筛选下拉：含停用客户（便于查历史单），来源 customer 列表接口
  const customersQuery = useQuery({
    queryKey: ['customers', 'options'],
    queryFn: async (): Promise<CustomerOption[]> => {
      const { data: res, response } = await api.GET('/api/v1/customers', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (!response.ok || !res) {
        throw new Error('加载客户失败');
      }
      return res.items;
    },
  });

  const data = listQuery.data ?? EMPTY_LIST;
  const customerOptions = customersQuery.data ?? [];
  const loading = listQuery.isPending;
  const error = actionError ?? (listQuery.isError ? '加载失败，请稍后重试' : null);

  // 翻页 / 改筛选 / 改排序即清空选择（页面模式规范）
  useEffect(() => {
    setSelected(new Set());
  }, [page, applied, sort]);

  async function reload(): Promise<void> {
    if (data.items.length <= 1 && page > 1) {
      setPage(page - 1);
    } else {
      await listQuery.refetch();
    }
  }

  async function handleDelete(order: OrderListItem): Promise<void> {
    try {
      setActionError(null);
      const ok = await confirm({
        title: '删除销售单',
        description: `将删除销售单 ${order.code}。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/sale-orders/{id}', {
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
        title: '批量删除销售单',
        description: `将删除选中的 ${selected.size} 张销售单。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/sale-orders/batch-delete', {
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

  const pageIds = data.items.map((item) => item.id);
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

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const resetFilters = (): void => {
    const empty = { customerId: '', dateFrom: '', dateTo: '' };
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
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">客户</span>
          <Select
            value={filters.customerId}
            onChange={(value) => setFilters({ ...filters, customerId: value })}
            options={[
              { value: '', label: '全部' },
              ...customerOptions.map((option) => ({
                value: option.id,
                label: `${option.code} ${option.name}${option.status === 'active' ? '' : '（已停用）'}`,
              })),
            ]}
            className="w-44"
          />
        </div>
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
            <Link href="/admin/sale-orders/new" className={buttonVariants()}>
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
              <SortHead label="销售日期" field="saleDate" />
              <TableHead>客户</TableHead>
              <SortHead label="合计方量(m³)" field="totalVolume" right />
              <TableHead className="text-right">小计金额</TableHead>
              <TableHead className="text-right">其他金额</TableHead>
              <SortHead label="合计金额" field="totalAmount" right />
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
                <TableCell className="text-muted-foreground">暂无销售单</TableCell>
              </TableRow>
            ) : (
              data.items.map((order) => (
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
                    <Link
                      href={`/admin/sale-orders/${order.id}`}
                      className="text-primary hover:underline"
                    >
                      {order.code}
                    </Link>
                  </TableCell>
                  <TableCell>{order.saleDate}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.totalVolume}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.subtotalAmount}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.otherAmount}</TableCell>
                  <TableCell className="text-right tabular-nums">{order.totalAmount}</TableCell>
                  <TableCell className="max-w-40 truncate" title={order.note}>
                    {order.note}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/sale-orders/${order.id}`}
                        aria-label="查看"
                        title="查看"
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <EyeIcon className="size-4" />
                      </Link>
                      {canManage ? (
                        <>
                          <Link
                            href={`/admin/sale-orders/${order.id}/edit`}
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
                            onClick={() => void handleDelete(order)}
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
              <TableCell className="text-right tabular-nums">{data.summary.totalVolume}</TableCell>
              <TableCell className="text-right tabular-nums">{data.summary.subtotalAmount}</TableCell>
              <TableCell className="text-right tabular-nums">{data.summary.otherAmount}</TableCell>
              <TableCell className="text-right tabular-nums">{data.summary.totalAmount}</TableCell>
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
    </div>
  );
}