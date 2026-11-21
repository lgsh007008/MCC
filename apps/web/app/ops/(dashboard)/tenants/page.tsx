'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantUpdateSchema, type ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { opsApi } from '@/lib/ops/api';

// 租户列表（design/租户.md §7）：筛选 + 分页；账号数经 auth 批量接口客户端组合。
type TenantRow = ApiSchemas['TenantListItemDto'];
type TenantList = ApiSchemas['TenantListDto'];
type AccountCounts = ApiSchemas['TenantAccountCountsDto'];

const PAGE_SIZE = 20;
const EMPTY_LIST: TenantList = { total: 0, items: [] };
const SOURCE_LABELS: Record<string, string> = {
  ops: '运营开通',
  self_register: '自助注册',
};

export default function OpsTenantsPage(): React.ReactElement {
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ code: '', name: '', status: '', planId: '', source: '' });
  const [applied, setApplied] = useState(filters);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editTarget, setEditTarget] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState({ name: '', note: '' });
  const [submitting, setSubmitting] = useState(false);

  const plansQuery = useQuery({
    queryKey: ['ops-plans'],
    queryFn: async (): Promise<ApiSchemas['PlanListDto']> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/plans');
      if (!response.ok || !data) {
        throw new Error('套餐加载失败');
      }
      return data;
    },
  });

  const listQuery = useQuery({
    queryKey: ['ops-tenants', page, applied],
    queryFn: async (): Promise<TenantList> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/tenants', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            code: applied.code.trim() || undefined,
            name: applied.name.trim() || undefined,
            status: applied.status === 'active' || applied.status === 'suspended' ? applied.status : undefined,
            planId: applied.planId || undefined,
            source:
              applied.source === 'ops' || applied.source === 'self_register'
                ? applied.source
                : undefined,
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
  const tenantIds = data.items.map((item) => item.id);

  const countsQuery = useQuery({
    queryKey: ['ops-tenant-account-counts', tenantIds],
    enabled: tenantIds.length > 0,
    queryFn: async (): Promise<AccountCounts> => {
      const { data: counts, response } = await opsApi.GET('/api/v1/ops/tenant-account-counts', {
        params: { query: { tenantIds: tenantIds.join(',') } },
      });
      if (!response.ok || !counts) {
        throw new Error('账号数加载失败');
      }
      return counts;
    },
  });
  const counts = new Map(
    (countsQuery.data?.items ?? []).map((item) => [item.tenantId, item.accountCount]),
  );

  const plans = plansQuery.data?.items ?? [];
  const planOptions = [
    { value: '', label: '全部套餐' },
    ...plans.map((plan) => ({ value: plan.id, label: plan.name })),
  ];

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setApplied({ ...filters });
    setPage(1);
  };

  const reset = (): void => {
    const next = { code: '', name: '', status: '', planId: '', source: '' };
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  async function handleEdit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editTarget) {
      return;
    }
    setError(null);
    setNotice(null);
    const parsed = tenantUpdateSchema.safeParse(editForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.PUT('/api/v1/ops/tenants/{id}', {
        params: { path: { id: editTarget.id } },
        body: parsed.data,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      setEditTarget(null);
      setNotice('租户信息已更新');
      await queryClient.invalidateQueries({ queryKey: ['ops-tenants'] });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(row: TenantRow): Promise<void> {
    setError(null);
    setNotice(null);
    const nextStatus = row.status === 'active' ? 'suspended' : 'active';
    if (nextStatus === 'suspended') {
      const ok = await confirm({
        title: '停用租户',
        description: `停用「${row.name}」后，该租户全部账号立即退出登录且无法登录，需重新启用后才能恢复。`,
        confirmText: '停用',
        tone: 'danger',
      });
      if (!ok) {
        return;
      }
    }
    const { response } = await opsApi.PATCH('/api/v1/ops/tenants/{id}/status', {
      params: { path: { id: row.id } },
      body: { status: nextStatus },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? '操作失败，请稍后重试');
      return;
    }
    setNotice(nextStatus === 'active' ? '租户已启用' : '租户已停用');
    await queryClient.invalidateQueries({ queryKey: ['ops-tenants'] });
  }

  const total = data.total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <form className="flex flex-wrap items-center gap-3" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">编号</span>
          <Input
            value={filters.code}
            onChange={(event) => setFilters({ ...filters, code: event.target.value })}
            placeholder="TN-00001"
            className="h-8 w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">名称</span>
          <Input
            value={filters.name}
            onChange={(event) => setFilters({ ...filters, name: event.target.value })}
            placeholder="租户名称"
            className="h-8 w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">套餐</span>
          <Select
            value={filters.planId}
            onChange={(value) => setFilters({ ...filters, planId: value })}
            options={planOptions}
            className="w-36"
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
              { value: 'suspended', label: '停用' },
            ]}
            className="w-24"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">来源</span>
          <Select
            value={filters.source}
            onChange={(value) => setFilters({ ...filters, source: value })}
            options={[
              { value: '', label: '全部' },
              { value: 'ops', label: '运营开通' },
              { value: 'self_register', label: '自助注册' },
            ]}
            className="w-28"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          重置
        </Button>
      </form>

      <div className="flex items-center justify-start">
        <Button onClick={() => router.push('/ops/tenants/new')}>开通租户</Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>名称</TableHead>
              <TableHead>套餐</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>账号数 / 额度</TableHead>
              <TableHead>创建日期</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground">
                  暂无租户
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="tabular-nums">{row.code}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.planName}</TableCell>
                  <TableCell>{row.status === 'active' ? '启用' : '停用'}</TableCell>
                  <TableCell>{SOURCE_LABELS[row.source] ?? row.source}</TableCell>
                  <TableCell className="tabular-nums">
                    {countsQuery.isError ? '--' : `${counts.get(row.id) ?? 0} / ${row.maxAccounts}`}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/ops/tenants/${row.id}`)}
                      >
                        查看
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditTarget(row);
                          setEditForm({ name: row.name, note: row.note });
                        }}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant={row.status === 'active' ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={() => void handleToggleStatus(row)}
                      >
                        {row.status === 'active' ? '停用' : '启用'}
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
          第 {page} / {pages} 页 · 共 {total} 条
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || listQuery.isPending}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pages || listQuery.isPending}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>

      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>编辑租户</DialogTitle>
            <DialogDescription>{editTarget?.code}</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleEdit}>
            <div className="space-y-2">
              <Label htmlFor="tenantName">租户名称</Label>
              <Input
                id="tenantName"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenantNote">备注</Label>
              <Textarea
                id="tenantNote"
                value={editForm.note}
                onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
