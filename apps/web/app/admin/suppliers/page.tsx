'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, CircleCheckIcon, EyeIcon, PencilIcon, Trash2Icon, ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { absMoney } from '@mcc/shared';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { Checkbox } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
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

// 供应商列表页（product/supplier.md R-供应商-001；页面模式规范见 product/平台布局.md）：
// 列表只展示应付，累计采购与累计付款进详情；删除确认含采购单数。

// 表格行 = 契约供应商 + finance 应付 / purchase 采购单数派生列，非手写 DTO
type SupplierRow = ApiSchemas['SupplierDto'] & {
  outstanding: string;
  purchaseCount: number;
};

type SupplierPageData = Omit<ApiSchemas['SupplierListDto'], 'items'> & {
  items: SupplierRow[];
};

const EMPTY_DATA: SupplierPageData = { total: 0, items: [] };

const PAGE_SIZE = 20;

async function fetchPayables(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) {
    return {};
  }
  const { data, response } = await api.GET('/api/v1/finance/payables', {
    params: { query: { supplierIds: ids.join(',') } },
  });
  if (!response.ok || !data) {
    return {};
  }
  return Object.fromEntries(data.items.map((item) => [item.supplierId, item.outstanding]));
}

async function fetchPurchaseCounts(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) {
    return {};
  }
  const { data, response } = await api.GET('/api/v1/purchase-orders/supplier-summary', {
    params: { query: { supplierIds: ids.join(',') } },
  });
  if (!response.ok || !data) {
    return {};
  }
  return Object.fromEntries(data.items.map((item) => [item.supplierId, item.purchaseCount]));
}

export default function SuppliersPage(): React.ReactElement {
  const canManage = useCan('supplier:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({ name: '', status: '' });
  const [applied, setApplied] = useState({ name: '', status: '' });
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['suppliers', page, applied, sortOrder],
    queryFn: async (): Promise<SupplierPageData> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            name: applied.name || undefined,
            status:
              applied.status === 'active' || applied.status === 'inactive'
                ? applied.status
                : undefined,
            sortBy: 'createdAt',
            sortOrder,
          },
        },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      const ids = res.items.map((item) => item.id);
      const [payables, purchaseCounts] = await Promise.all([
        fetchPayables(ids),
        fetchPurchaseCounts(ids),
      ]);
      return {
        total: res.total,
        items: res.items.map((item) => ({
          ...item,
          outstanding: payables[item.id] ?? '0.00',
          purchaseCount: purchaseCounts[item.id] ?? 0,
        })),
      };
    },
  });

  const data = listQuery.data ?? EMPTY_DATA;
  const rows = data.items;
  const total = data.total;
  const loading = listQuery.isPending;
  const error = actionError ?? (listQuery.isError ? '加载失败，请稍后重试' : null);

  // 翻页 / 改筛选 / 改排序即清空选择（页面模式规范）
  useEffect(() => {
    setSelected(new Set());
  }, [page, applied, sortOrder]);

  async function reload(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  }

  async function patchStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
    const { response } = await api.PATCH('/api/v1/suppliers/{id}/status', {
      params: { path: { id } },
      body: { status },
    });
    if (!response.ok) {
      throw new Error('状态切换失败');
    }
  }

  async function toggleStatus(supplier: SupplierRow): Promise<void> {
    try {
      setActionError(null);
      if (supplier.status === 'active') {
        const ok = await confirm({
          title: '停用供应商',
          description: `将停用供应商 ${supplier.name}，停用后不可被新采购单选择。`,
          confirmText: '停用',
          tone: 'danger',
          onConfirm: () => patchStatus(supplier.id, 'inactive'),
        });
        if (ok) {
          await reload();
        }
        return;
      }
      await patchStatus(supplier.id, 'active');
      await reload();
    } catch {
      setActionError('状态切换失败，请稍后重试');
    }
  }

  async function batchSetStatus(status: 'active' | 'inactive'): Promise<void> {
    if (selectedSuppliers.length === 0) {
      return;
    }
    const changing = status === 'inactive' ? activeSelectedCount : inactiveSelectedCount;
    const skipped = selectedSuppliers.length - changing;
    if (changing === 0) {
      return;
    }
    const actionName = status === 'inactive' ? '停用' : '启用';
    try {
      setActionError(null);
      const ok = await confirm({
        title: status === 'inactive' ? '批量停用供应商' : '批量启用供应商',
        description: `选中的 ${selectedSuppliers.length} 个供应商中，${changing} 个将${actionName}${
          skipped > 0 ? `，${skipped} 个已${actionName}将跳过` : ''
        }。${status === 'inactive' ? '停用后不可被新采购单选择。' : ''}`,
        confirmText: actionName,
        tone: status === 'inactive' ? 'danger' : 'default',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/suppliers/batch-status', {
            body: { ids: selectedSuppliers.map((item) => item.id), status },
          });
          if (!response.ok) {
            throw new Error('批量状态切换失败');
          }
        },
      });
      if (ok) {
        setSelected(new Set());
        await reload();
      }
    } catch {
      setActionError('批量状态切换失败，请稍后重试');
    }
  }

  async function removeSupplier(supplier: SupplierRow): Promise<void> {
    try {
      setActionError(null);
      const ok = await confirm({
        title: '删除供应商',
        description: `将删除供应商 ${supplier.name}（${supplier.code}）。该供应商有 ${supplier.purchaseCount} 张采购单，删除后档案不再显示、不能再开单，历史采购单保留并显示当时的供应商名称。编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/suppliers/{id}', {
            params: { path: { id: supplier.id } },
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

  async function batchRemove(): Promise<void> {
    if (selectedSuppliers.length === 0) {
      return;
    }
    const purchaseCount = selectedSuppliers.reduce((sum, item) => sum + item.purchaseCount, 0);
    try {
      setActionError(null);
      const ok = await confirm({
        title: '批量删除供应商',
        description: `将删除选中的 ${selectedSuppliers.length} 个供应商，共 ${purchaseCount} 张采购单。删除后档案不再显示、不能再开单，历史采购单保留并显示当时的供应商名称。编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/suppliers/batch-delete', {
            body: { ids: selectedSuppliers.map((item) => item.id) },
          });
          if (!response.ok) {
            throw new Error('批量删除失败');
          }
        },
      });
      if (ok) {
        setSelected(new Set());
        await reload();
      }
    } catch {
      setActionError('批量删除失败，请稍后重试');
    }
  }

  const pageIds = rows.map((item) => item.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const togglePage = (checked: boolean): void => {
    setSelected(checked ? new Set(pageIds) : new Set());
  };
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
  const selectedSuppliers = rows.filter((item) => selected.has(item.id));
  const activeSelectedCount = selectedSuppliers.filter((item) => item.status === 'active').length;
  const inactiveSelectedCount = selectedSuppliers.length - activeSelectedCount;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetFilters = (): void => {
    const empty = { name: '', status: '' };
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
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">供应商名称</span>
          <Input
            value={filters.name}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            placeholder="供应商名称"
            className="h-8 w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">状态</span>
          <Select
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
            options={[
              { value: '', label: '全部' },
              { value: 'active', label: '启用' },
              { value: 'inactive', label: '停用' },
            ]}
            className="w-28"
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
            <Link href="/admin/suppliers/new" className={buttonVariants()}>
              新建
            </Link>
            {selectedSuppliers.length > 0 ? (
              <>
                <Button
                  variant="outline"
                  disabled={inactiveSelectedCount === 0}
                  onClick={() => void batchSetStatus('active')}
                >
                  批量启用
                </Button>
                <Button
                  variant="destructive"
                  disabled={activeSelectedCount === 0}
                  onClick={() => void batchSetStatus('inactive')}
                >
                  批量停用
                </Button>
                <Button variant="destructive" onClick={() => void batchRemove()}>
                  批量删除
                </Button>
              </>
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
              <TableHead>供应商名称</TableHead>
              <TableHead>联系信息</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">应付</TableHead>
              <TableHead>备注</TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                  onClick={() => {
                    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    setPage(1);
                  }}
                >
                  创建日期
                  {sortOrder === 'asc' ? (
                    <ArrowUpIcon className="size-3.5" />
                  ) : (
                    <ArrowDownIcon className="size-3.5" />
                  )}
                </button>
              </TableHead>
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 9 : 8} className="text-muted-foreground">
                  暂无供应商
                </TableCell>
              </TableRow>
            ) : (
              rows.map((supplier) => (
                <TableRow key={supplier.id}>
                  {canManage ? (
                    <TableCell>
                      <Checkbox
                        aria-label={`选择 ${supplier.name}`}
                        checked={selected.has(supplier.id)}
                        onCheckedChange={(checked) => toggleRow(supplier.id, checked === true)}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell>
                    <Link href={`/admin/suppliers/${supplier.id}`} className="text-primary hover:underline">
                      {supplier.code}
                    </Link>
                  </TableCell>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell className="max-w-48 truncate" title={supplier.contact}>
                    {supplier.contact || '—'}
                  </TableCell>
                  <TableCell>
                    <span className={supplier.status === 'active' ? undefined : 'text-muted-foreground'}>
                      {supplier.status === 'active' ? '启用' : '停用'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {supplier.outstanding.startsWith('-')
                      ? `${absMoney(supplier.outstanding)}（预付）`
                      : supplier.outstanding}
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={supplier.note}>
                    {supplier.note}
                  </TableCell>
                  <TableCell>{supplier.createdAt}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/suppliers/${supplier.id}`}
                        aria-label="查看"
                        title="查看"
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <EyeIcon className="size-4" />
                      </Link>
                      {canManage ? (
                        <>
                          <Link
                            href={`/admin/suppliers/${supplier.id}/edit`}
                            aria-label="编辑"
                            title="编辑"
                            className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                          >
                            <PencilIcon className="size-4" />
                          </Link>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={supplier.status === 'active' ? '停用' : '启用'}
                            title={supplier.status === 'active' ? '停用' : '启用'}
                            onClick={() => void toggleStatus(supplier)}
                          >
                            {supplier.status === 'active' ? (
                              <BanIcon className="size-4 text-destructive" />
                            ) : (
                              <CircleCheckIcon className="size-4" />
                            )}
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label="删除"
                            title="删除"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void removeSupplier(supplier)}
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
