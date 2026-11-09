'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowDownIcon, ArrowUpIcon, BanIcon, CircleCheckIcon, EyeIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
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

// 客户列表页（product/customer.md R-客户-001；页面模式规范见 product/平台布局.md）：
// 筛选 → 新建/批量启停用 → 表格（多选、方量排序、图标行操作）→ 分页。
// 累计下单方量是 order 域的派生值：≤500 客户时前端全量组合 + 客户端排序分页
//（受控例外，技术方案 §6.3；策略与退出方案见 design/customer.md §6）；
// 超过阈值回退服务端分页并禁用该列排序。

interface CustomerRow {
  id: string;
  code: string;
  name: string;
  contact: string;
  status: string;
  note: string;
  createdAt: string;
  totalVolume: string;
  orderCount: number;
}

type SortField = 'createdAt' | 'totalVolume';
type SortOrder = 'asc' | 'desc';

const PAGE_SIZE = 20;
const FULL_FETCH_PAGE_SIZE = 100;
const MAX_FULL_FETCH = 500;
const VOLUME_BATCH_SIZE = 200;

// 方量（4 位小数）放大为整数后比较，排序不用浮点
const volumeKey = (value: string): bigint => {
  const [intPart, frac = ''] = value.split('.');
  return BigInt(`${intPart}${(frac + '0000').slice(0, 4)}`);
};

async function fetchCustomerStats(
  ids: string[],
): Promise<Record<string, { totalVolume: string; orderCount: number }>> {
  const map: Record<string, { totalVolume: string; orderCount: number }> = {};
  for (let index = 0; index < ids.length; index += VOLUME_BATCH_SIZE) {
    const batch = ids.slice(index, index + VOLUME_BATCH_SIZE);
    const { data, response } = await api.GET('/api/v1/sale-orders/customer-volume-summary', {
      params: { query: { customerIds: batch.join(',') } },
    });
    if (response.ok && data) {
      for (const item of data.items) {
        map[item.customerId] = { totalVolume: item.totalVolume, orderCount: item.orderCount };
      }
    }
  }
  return map;
}

export default function CustomersPage(): React.ReactElement {
  const confirm = useConfirm();
  const [filters, setFilters] = useState({ name: '', status: '' });
  const [applied, setApplied] = useState({ name: '', status: '' });
  const [sort, setSort] = useState<{ field: SortField; order: SortOrder }>({
    field: 'createdAt',
    order: 'desc',
  });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [volumeSortable, setVolumeSortable] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const cacheRef = useRef<{ key: string; rows: CustomerRow[]; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const key = JSON.stringify({ applied, sort, reloadToken });
    // 翻页 / 改筛选 / 改排序即清空选择（页面模式规范）
    setSelected(new Set());

    // 全量模式且缓存命中：翻页只切片，不再请求
    const cached = cacheRef.current;
    if (cached && cached.key === key) {
      setRows(cached.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      setTotal(cached.total);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const baseQuery: { name?: string; status?: 'active' | 'inactive' } = {
          name: applied.name || undefined,
          status:
            applied.status === 'active' || applied.status === 'inactive' ? applied.status : undefined,
        };
        // 先探总数，决定全量组合还是回退服务端分页
        const probe = await api.GET('/api/v1/customers', {
          params: { query: { page: 1, pageSize: 1, ...baseQuery } },
        });
        if (!probe.response.ok || !probe.data) {
          if (!cancelled) {
            setError('加载失败，请稍后重试');
          }
          return;
        }
        const totalCount = probe.data.total;
        const canSortVolume = totalCount <= MAX_FULL_FETCH;

        if (canSortVolume) {
          const pageCount = Math.max(1, Math.ceil(totalCount / FULL_FETCH_PAGE_SIZE));
          const pageResults = await Promise.all(
            Array.from({ length: pageCount }, (_, index) =>
              api.GET('/api/v1/customers', {
                params: {
                  query: { page: index + 1, pageSize: FULL_FETCH_PAGE_SIZE, ...baseQuery },
                },
              }),
            ),
          );
          const items = pageResults.flatMap((result) => result.data?.items ?? []);
          const stats = await fetchCustomerStats(items.map((item) => item.id));
          const merged: CustomerRow[] = items.map((item) => ({
            ...item,
            totalVolume: stats[item.id]?.totalVolume ?? '0.0000',
            orderCount: stats[item.id]?.orderCount ?? 0,
          }));
          const direction = sort.order === 'asc' ? 1 : -1;
          merged.sort((a, b) => {
            const primary =
              sort.field === 'totalVolume'
                ? volumeKey(a.totalVolume) === volumeKey(b.totalVolume)
                  ? 0
                  : volumeKey(a.totalVolume) > volumeKey(b.totalVolume)
                    ? 1
                    : -1
                : a.createdAt.localeCompare(b.createdAt);
            if (primary !== 0) {
              return primary * direction;
            }
            // 并列时按创建日期倒序、编号升序兜底，保证翻页顺序稳定
            const dateCmp = b.createdAt.localeCompare(a.createdAt);
            return dateCmp !== 0 ? dateCmp : a.code.localeCompare(b.code);
          });
          if (cancelled) {
            return;
          }
          cacheRef.current = { key, rows: merged, total: totalCount };
          setVolumeSortable(true);
          setRows(merged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
          setTotal(totalCount);
          setError(null);
        } else {
          // 超过阈值：回退服务端分页，方量列不可排序
          cacheRef.current = null;
          setVolumeSortable(false);
          const result = await api.GET('/api/v1/customers', {
            params: { query: { page, pageSize: PAGE_SIZE, sortOrder: 'desc', ...baseQuery } },
          });
          if (cancelled) {
            return;
          }
          if (!result.response.ok || !result.data) {
            setError('加载失败，请稍后重试');
            return;
          }
          const items = result.data.items;
          const stats = await fetchCustomerStats(items.map((item) => item.id));
          if (cancelled) {
            return;
          }
          setRows(
            items.map((item) => ({
              ...item,
              totalVolume: stats[item.id]?.totalVolume ?? '0.0000',
              orderCount: stats[item.id]?.orderCount ?? 0,
            })),
          );
          setTotal(result.data.total);
          setError(null);
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
  }, [page, applied, sort, reloadToken]);

  async function reload(): Promise<void> {
    setReloadToken((token) => token + 1);
  }

  async function patchStatus(id: string, status: 'active' | 'inactive'): Promise<void> {
    const { response } = await api.PATCH('/api/v1/customers/{id}/status', {
      params: { path: { id } },
      body: { status },
    });
    if (!response.ok) {
      throw new Error('状态切换失败');
    }
  }

  async function toggleStatus(customer: CustomerRow): Promise<void> {
    try {
      if (customer.status === 'active') {
        const ok = await confirm({
          title: '停用客户',
          description: `将停用客户 ${customer.name}，停用后不可被新销售单选择。`,
          confirmText: '停用',
          tone: 'danger',
          onConfirm: () => patchStatus(customer.id, 'inactive'),
        });
        if (ok) {
          await reload();
        }
        return;
      }
      // 单条启用为恢复性动作，不确认（product/平台布局.md 二次确认规范）
      await patchStatus(customer.id, 'active');
      await reload();
    } catch {
      setError('状态切换失败，请稍后重试');
    }
  }

  // 批量启用 / 停用：混合选择按目标状态幂等处理，确认文案给出将变更与跳过条数
  async function batchSetStatus(status: 'active' | 'inactive'): Promise<void> {
    if (selectedCustomers.length === 0) {
      return;
    }
    const changing = status === 'inactive' ? activeSelectedCount : inactiveSelectedCount;
    const skipped = selectedCustomers.length - changing;
    if (changing === 0) {
      return;
    }
    const actionName = status === 'inactive' ? '停用' : '启用';
    try {
      const ok = await confirm({
        title: status === 'inactive' ? '批量停用客户' : '批量启用客户',
        description: `选中的 ${selectedCustomers.length} 个客户中，${changing} 个将${actionName}${
          skipped > 0 ? `，${skipped} 个已${actionName}将跳过` : ''
        }。${status === 'inactive' ? '停用后不可被新销售单选择。' : ''}`,
        confirmText: actionName,
        tone: status === 'inactive' ? 'danger' : 'default',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/customers/batch-status', {
            body: { ids: selectedCustomers.map((item) => item.id), status },
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
      setError('批量状态切换失败，请稍后重试');
    }
  }

  async function removeCustomer(customer: CustomerRow): Promise<void> {
    try {
      const ok = await confirm({
        title: '删除客户',
        description: `将删除客户 ${customer.name}（${customer.code}）。该客户有 ${customer.orderCount} 张销售单，删除后档案不再显示、不能再开单，历史销售单保留并显示当时的客户名称。编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/customers/{id}', {
            params: { path: { id: customer.id } },
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

  async function batchRemove(): Promise<void> {
    if (selectedCustomers.length === 0) {
      return;
    }
    const orderCount = selectedCustomers.reduce((sum, customer) => sum + customer.orderCount, 0);
    try {
      const ok = await confirm({
        title: '批量删除客户',
        description: `将删除选中的 ${selectedCustomers.length} 个客户，共 ${orderCount} 张销售单。删除后档案不再显示、不能再开单，历史销售单保留并显示当时的客户名称。编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.POST('/api/v1/customers/batch-delete', {
            body: { ids: selectedCustomers.map((customer) => customer.id) },
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
      setError('批量删除失败，请稍后重试');
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
  const selectedCustomers = rows.filter((item) => selected.has(item.id));
  const activeSelectedCount = selectedCustomers.filter((item) => item.status === 'active').length;
  const inactiveSelectedCount = selectedCustomers.length - activeSelectedCount;

  // 超过阈值回退服务端分页时，实际排序按创建日期倒序（方量列禁用）
  const effectiveSortField: SortField = volumeSortable ? sort.field : 'createdAt';
  const effectiveSortOrder: SortOrder = volumeSortable ? sort.order : 'desc';

  const toggleSort = (field: SortField): void => {
    if (field === 'totalVolume' && !volumeSortable) {
      return;
    }
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
    disabled,
    disabledHint,
  }: {
    label: string;
    field: SortField;
    right?: boolean;
    disabled?: boolean;
    disabledHint?: string;
  }): React.ReactElement => (
    <TableHead className={right ? 'text-right' : undefined}>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? disabledHint : undefined}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => toggleSort(field)}
      >
        {label}
        {effectiveSortField === field ? (
          effectiveSortOrder === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )
        ) : null}
      </button>
    </TableHead>
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ ...filters });
          setPage(1);
          setReloadToken((token) => token + 1);
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">客户名称</span>
          <Input
            value={filters.name}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            placeholder="客户名称"
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
      </form>

      <div className="flex items-center gap-2">
        <Link href="/admin/customers/new" className={buttonVariants()}>
          新建
        </Link>
        {selectedCustomers.length > 0 ? (
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
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="min-h-60 flex-1 rounded-xl border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-card">
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  aria-label="本页全选"
                  checked={allSelected}
                  onCheckedChange={(checked) => togglePage(checked === true)}
                />
              </TableHead>
              <TableHead>编号</TableHead>
              <TableHead>客户名称</TableHead>
              <TableHead>联系信息</TableHead>
              <TableHead>状态</TableHead>
              <SortHead
                label="累计下单方量(m³)"
                field="totalVolume"
                right
                disabled={!volumeSortable}
                disabledHint="客户数超过 500，暂不支持全量排序"
              />
              <TableHead>备注</TableHead>
              <SortHead label="创建日期" field="createdAt" />
              <TableHead className="w-28 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-muted-foreground">
                  暂无客户
                </TableCell>
              </TableRow>
            ) : (
              rows.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Checkbox
                      aria-label={`选择 ${customer.name}`}
                      checked={selected.has(customer.id)}
                      onCheckedChange={(checked) => toggleRow(customer.id, checked === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/customers/${customer.id}`} className="text-primary hover:underline">
                      {customer.code}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell className="max-w-48 truncate" title={customer.contact}>
                    {customer.contact || '—'}
                  </TableCell>
                  <TableCell>
                    <span className={customer.status === 'active' ? undefined : 'text-muted-foreground'}>
                      {customer.status === 'active' ? '启用' : '停用'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{customer.totalVolume}</TableCell>
                  <TableCell className="max-w-40 truncate" title={customer.note}>
                    {customer.note}
                  </TableCell>
                  <TableCell>{customer.createdAt}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/customers/${customer.id}`}
                        aria-label="查看"
                        title="查看"
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <EyeIcon className="size-4" />
                      </Link>
                      <Link
                        href={`/admin/customers/${customer.id}/edit`}
                        aria-label="编辑"
                        title="编辑"
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                      >
                        <PencilIcon className="size-4" />
                      </Link>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={customer.status === 'active' ? '停用' : '启用'}
                        title={customer.status === 'active' ? '停用' : '启用'}
                        onClick={() => void toggleStatus(customer)}
                      >
                        {customer.status === 'active' ? (
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
                        onClick={() => void removeCustomer(customer)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
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
