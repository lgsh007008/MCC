'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  platformUserCreateSchema,
  platformUserResetPasswordSchema,
  type ApiSchemas,
} from '@mcc/shared';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { opsApi } from '@/lib/ops/api';

// 平台账号管理（design/账号与权限.md §7）：列表 + 新建 / 重置密码 / 启停；仅 platform:account:manage 可见。
type PlatformUserRow = ApiSchemas['PlatformUserDto'];
type PlatformUserList = ApiSchemas['PlatformUserListDto'];

const PAGE_SIZE = 20;
const EMPTY_LIST: PlatformUserList = { total: 0, items: [] };

export default function OpsAccountsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '' });
  const [resetTarget, setResetTarget] = useState<PlatformUserRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const listQuery = useQuery({
    queryKey: ['ops-accounts', page, appliedKeyword],
    queryFn: async (): Promise<PlatformUserList> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/accounts', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            keyword: appliedKeyword.trim() || undefined,
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

  const reload = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['ops-accounts'] });

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const parsed = platformUserCreateSchema.safeParse(createForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.POST('/api/v1/ops/accounts', { body: parsed.data });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '新建失败，请稍后重试');
        return;
      }
      setCreateOpen(false);
      setCreateForm({ username: '', password: '' });
      setNotice('平台账号已创建');
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReset(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resetTarget) {
      return;
    }
    setError(null);
    setNotice(null);
    const parsed = platformUserResetPasswordSchema.safeParse({ password: resetPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.POST('/api/v1/ops/accounts/{id}/reset-password', {
        params: { path: { id: resetTarget.id } },
        body: parsed.data,
      });
      if (!response.ok) {
        setError('重置失败，请稍后重试');
        return;
      }
      setResetTarget(null);
      setResetPassword('');
      setNotice('密码已重置，该账号需重新登录');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(row: PlatformUserRow): Promise<void> {
    setError(null);
    setNotice(null);
    const nextStatus = row.status === 'active' ? 'inactive' : 'active';
    if (nextStatus === 'inactive') {
      const ok = await confirm({
        title: '停用平台账号',
        description: `停用 ${row.username} 后，该账号立即失去 /ops 访问能力。`,
        confirmText: '停用',
        tone: 'danger',
      });
      if (!ok) {
        return;
      }
    }
    const { response } = await opsApi.PATCH('/api/v1/ops/accounts/{id}/status', {
      params: { path: { id: row.id } },
      body: { status: nextStatus },
    });
    if (!response.ok) {
      setError('操作失败，请稍后重试');
      return;
    }
    setNotice(nextStatus === 'active' ? '账号已启用' : '账号已停用');
    await reload();
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedKeyword(keyword);
          setPage(1);
          void queryClient.invalidateQueries({ queryKey: ['ops-accounts'] });
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">账号</span>
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="账号名模糊"
            className="h-8 w-48"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setKeyword('');
            setAppliedKeyword('');
            setPage(1);
            void queryClient.invalidateQueries({ queryKey: ['ops-accounts'] });
          }}
        >
          重置
        </Button>
      </form>

      <div className="flex items-center justify-start">
        <Button onClick={() => setCreateOpen(true)}>新建平台账号</Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>账号</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建日期</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  暂无平台账号
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.username}</TableCell>
                  <TableCell>{row.roleLabel}</TableCell>
                  <TableCell>{row.status === 'active' ? '启用' : '停用'}</TableCell>
                  <TableCell className="tabular-nums">{row.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetTarget(row);
                          setResetPassword('');
                        }}
                      >
                        重置密码
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
          第 {page} / {pages} 页 · 共 {data.total} 条
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>新建平台账号</DialogTitle>
            <DialogDescription>平台账号全局唯一，不占租户账号额度。</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleCreate(event)}>
            <div className="space-y-2">
              <Label htmlFor="opsAccountName">账号</Label>
              <Input
                id="opsAccountName"
                value={createForm.username}
                onChange={(event) =>
                  setCreateForm({ ...createForm, username: event.target.value })
                }
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="opsAccountPassword">初始密码（至少 8 位）</Label>
              <Input
                id="opsAccountPassword"
                type="password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm({ ...createForm, password: event.target.value })
                }
                autoComplete="new-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={resetTarget !== null} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>重置平台账号密码</DialogTitle>
            <DialogDescription>
              为账号 {resetTarget?.username} 设置新密码；保存后其平台会话失效。
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleReset(event)}>
            <div className="space-y-2">
              <Label htmlFor="opsResetPassword">新密码（至少 8 位）</Label>
              <Input
                id="opsResetPassword"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                autoComplete="new-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
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
