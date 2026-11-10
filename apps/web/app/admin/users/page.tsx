'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  USER_ROLES,
  userCreateSchema,
  userResetPasswordSchema,
  type UserRoleValue,
} from '@mcc/shared';
import { RolePermissionsDialog } from '@/components/auth/role-permissions-dialog';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
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
import { api } from '@/lib/api';

// 账号管理页（product/账号与权限.md R-账号与权限-002）：
// 列表 + 新建 / 重置密码 / 改角色 / 启停用弹窗；仅 account:manage 可见（菜单在顶栏头像下拉）。

interface UserRow {
  id: string;
  username: string;
  role: UserRoleValue;
  roleLabel: string;
  status: 'active' | 'inactive';
  createdAt: string;
}

const PAGE_SIZE = 20;

const roleOptions = USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export default function UsersPage(): React.ReactElement {
  const confirm = useConfirm();
  usePageCrumb([{ title: '账号管理' }]);

  const [items, setItems] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'SALES' as UserRoleValue });

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);
  const [roleValue, setRoleValue] = useState<UserRoleValue>('SALES');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (nextPage: number, search: string): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const { data, response } = await api.GET('/api/v1/users', {
        params: {
          query: {
            page: nextPage,
            pageSize: PAGE_SIZE,
            keyword: search.trim() || undefined,
          },
        },
      });
      if (!response.ok || !data) {
        setError('加载失败，请稍后重试');
        return;
      }
      setItems(data.items as UserRow[]);
      setTotal(data.total);
      setPage(nextPage);
    } catch {
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1, '');
  }, [load]);

  const reload = (): Promise<void> => load(page, appliedKeyword);

  const handleQuery = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setAppliedKeyword(keyword);
    void load(1, keyword);
  };

  async function handleCreate(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);
    setError(null);
    const parsed = userCreateSchema.safeParse(createForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await api.POST('/api/v1/users', { body: parsed.data });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '新建失败，请稍后重试');
        return;
      }
      setCreateOpen(false);
      setCreateForm({ username: '', password: '', role: 'SALES' });
      setNotice('账号已创建');
      await load(1, appliedKeyword);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resetTarget) {
      return;
    }
    setNotice(null);
    setError(null);
    const parsed = userResetPasswordSchema.safeParse({ password: resetPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await api.POST('/api/v1/users/{id}/reset-password', {
        params: { path: { id: resetTarget.id } },
        body: parsed.data,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '重置失败，请稍后重试');
        return;
      }
      setResetTarget(null);
      setResetPassword('');
      setNotice('密码已重置，该账号需重新登录');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRoleChange(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!roleTarget) {
      return;
    }
    setNotice(null);
    setError(null);
    setSubmitting(true);
    try {
      const { response } = await api.PATCH('/api/v1/users/{id}/role', {
        params: { path: { id: roleTarget.id } },
        body: { role: roleValue },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '修改失败，请稍后重试');
        return;
      }
      setRoleTarget(null);
      setNotice('角色已修改');
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(user: UserRow): Promise<void> {
    setNotice(null);
    setError(null);
    const nextStatus = user.status === 'active' ? 'inactive' : 'active';
    if (nextStatus === 'inactive') {
      const ok = await confirm({
        title: '停用账号',
        description: `停用账号 ${user.username} 后，该账号将立即无法登录，并需要管理员重新启用。`,
        confirmText: '停用',
        tone: 'danger',
      });
      if (!ok) {
        return;
      }
    }
    const { response } = await api.PATCH('/api/v1/users/{id}/status', {
      params: { path: { id: user.id } },
      body: { status: nextStatus },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? '操作失败，请稍后重试');
      return;
    }
    setNotice(nextStatus === 'active' ? '账号已启用' : '账号已停用');
    await reload();
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <form className="flex flex-wrap items-center gap-4" onSubmit={handleQuery}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">账号</span>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="账号名模糊"
            className="h-8 w-48"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2">
        <Button onClick={() => setCreateOpen(true)}>新建账号</Button>
        <Button variant="outline" onClick={() => setPermissionsOpen(true)}>
          角色权限说明
        </Button>
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
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  暂无账号
                </TableCell>
              </TableRow>
            ) : (
              items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="tabular-nums">{user.username}</TableCell>
                  <TableCell>{user.roleLabel}</TableCell>
                  <TableCell>{user.status === 'active' ? '启用' : '停用'}</TableCell>
                  <TableCell className="tabular-nums">{user.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetTarget(user);
                          setResetPassword('');
                        }}
                      >
                        重置密码
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRoleTarget(user);
                          setRoleValue(user.role);
                        }}
                      >
                        改角色
                      </Button>
                      <Button
                        type="button"
                        variant={user.status === 'active' ? 'outline' : 'secondary'}
                        size="sm"
                        onClick={() => void handleToggleStatus(user)}
                      >
                        {user.status === 'active' ? '停用' : '启用'}
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
          disabled={page <= 1 || loading}
          onClick={() => void load(page - 1, appliedKeyword)}
        >
          上一页
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pages || loading}
          onClick={() => void load(page + 1, appliedKeyword)}
        >
          下一页
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>新建账号</DialogTitle>
            <DialogDescription>账号按使用人一人一号；创建后请告知本人并及时修改初始密码。</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleCreate}>
            <div className="space-y-2">
              <Label htmlFor="newUsername">账号</Label>
              <Input
                id="newUsername"
                value={createForm.username}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">初始密码（至少 8 位）</Label>
              <Input
                id="newPassword"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newRole">角色</Label>
              <Select
                id="newRole"
                value={createForm.role}
                onChange={(value) =>
                  setCreateForm((prev) => ({ ...prev, role: value as UserRoleValue }))
                }
                options={roleOptions}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {ROLE_DESCRIPTIONS[createForm.role]}
              </p>
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
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>
              为账号 {resetTarget?.username} 设置新密码；保存后该账号全部会话失效，需要重新登录。
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleResetPassword}>
            <div className="space-y-2">
              <Label htmlFor="resetPassword">新密码（至少 8 位）</Label>
              <Input
                id="resetPassword"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
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

      <Dialog open={roleTarget !== null} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>修改角色</DialogTitle>
            <DialogDescription>
              账号 {roleTarget?.username} 的角色；修改后该账号需重新登录，访问范围按新角色生效。
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={handleRoleChange}>
            <div className="space-y-2">
              <Label htmlFor="roleValue">角色</Label>
              <Select
                id="roleValue"
                value={roleValue}
                onChange={(value) => setRoleValue(value as UserRoleValue)}
                options={roleOptions}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[roleValue]}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRoleTarget(null)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RolePermissionsDialog open={permissionsOpen} onOpenChange={setPermissionsOpen} />
    </div>
  );
}
