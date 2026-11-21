'use client';

import { use, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FEATURE_LABELS,
  SELLABLE_FEATURES,
  tenantAdminCreateSchema,
  tenantAdminPhoneInputSchema,
  tenantAdminResetPasswordSchema,
  tenantUpdateSchema,
  type ApiSchemas,
  type SellableFeatureCode,
} from '@mcc/shared';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

// 租户详情（design/租户.md §7）：信息条 + 功能区 + 管理员区 + 操作区。
type TenantDetail = ApiSchemas['TenantDetailDto'];
type TenantAdminList = ApiSchemas['TenantAdminListDto'];
type PlanList = ApiSchemas['PlanListDto'];

const FEATURE_OPTIONS = SELLABLE_FEATURES.map((code) => ({
  code,
  label: FEATURE_LABELS[code],
}));

const maskPhone = (phone: string | null): string =>
  phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '—';

const SOURCE_LABELS: Record<string, string> = {
  ops: '运营开通',
  self_register: '自助注册',
};

export default function OpsTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { id } = use(params);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get('admin') === 'missing' ? '租户已开通，但首管理员未创建，请补建管理员。' : null,
  );
  const [submitting, setSubmitting] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', note: '' });
  const [planOpen, setPlanOpen] = useState(false);
  const [planId, setPlanId] = useState('');
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', phone: '', password: '' });
  const [resetTarget, setResetTarget] = useState<{ id: string; username: string } | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [phoneTarget, setPhoneTarget] = useState<{ id: string; username: string } | null>(null);
  const [phoneValue, setPhoneValue] = useState('');

  // Next 15 的 params 为 Promise，客户端组件用 use() 解包
  const resolvedId = useMemo(() => id, [id]);

  const detailQuery = useQuery({
    queryKey: ['ops-tenant', resolvedId],
    enabled: resolvedId !== '',
    queryFn: async (): Promise<TenantDetail> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/tenants/{id}', {
        params: { path: { id: resolvedId } },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败，请稍后重试');
      }
      return data;
    },
  });
  const detail = detailQuery.data;
  usePageCrumb(detail ? [{ title: detail.code }] : []);

  const plansQuery = useQuery({
    queryKey: ['ops-plans'],
    queryFn: async (): Promise<PlanList> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/plans');
      if (!response.ok || !data) {
        throw new Error('套餐加载失败');
      }
      return data;
    },
  });
  const plans = plansQuery.data?.items ?? [];

  const adminsQuery = useQuery({
    queryKey: ['ops-tenant-admins', resolvedId],
    enabled: resolvedId !== '',
    queryFn: async (): Promise<TenantAdminList> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/tenants/{tenantId}/admins', {
        params: { path: { tenantId: resolvedId } },
      });
      if (!response.ok || !data) {
        throw new Error('管理员加载失败');
      }
      return data;
    },
  });
  const admins = adminsQuery.data?.items ?? [];

  const countsQuery = useQuery({
    queryKey: ['ops-tenant-account-counts', resolvedId],
    enabled: resolvedId !== '',
    queryFn: async (): Promise<number> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/tenant-account-counts', {
        params: { query: { tenantIds: resolvedId } },
      });
      if (!response.ok || !data) {
        return 0;
      }
      return data.items[0]?.accountCount ?? 0;
    },
  });

  const invalidate = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ops-tenant', resolvedId] }),
      queryClient.invalidateQueries({ queryKey: ['ops-tenant-admins', resolvedId] }),
      queryClient.invalidateQueries({ queryKey: ['ops-tenant-account-counts', resolvedId] }),
      queryClient.invalidateQueries({ queryKey: ['ops-tenants'] }),
    ]);
  };

  async function handleEdit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = tenantUpdateSchema.safeParse(editForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.PUT('/api/v1/ops/tenants/{id}', {
        params: { path: { id: resolvedId } },
        body: parsed.data,
      });
      if (!response.ok) {
        setError('保存失败，请稍后重试');
        return;
      }
      setEditOpen(false);
      setNotice('租户信息已更新');
      await invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePlan(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { data, response } = await opsApi.PUT('/api/v1/ops/tenants/{id}/plan', {
        params: { path: { id: resolvedId } },
        body: { planId },
      });
      if (!response.ok || !data) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '改套餐失败，请稍后重试');
        return;
      }
      setPlanOpen(false);
      setNotice(
        `套餐已切换；新增功能 ${data.added.length} 项，关闭功能 ${data.removed.length} 项。`,
      );
      await invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveFeatures(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const overrides = SELLABLE_FEATURES.map((code) => ({
        featureCode: code as SellableFeatureCode,
        enabled: checked.has(code),
      }));
      const { response } = await opsApi.PUT('/api/v1/ops/tenants/{id}/features', {
        params: { path: { id: resolvedId } },
        body: { overrides },
      });
      if (!response.ok) {
        setError('保存功能配置失败，请稍后重试');
        return;
      }
      setFeaturesOpen(false);
      setNotice('功能配置已保存');
      await invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(): Promise<void> {
    if (!detail) {
      return;
    }
    setError(null);
    const nextStatus = detail.status === 'active' ? 'suspended' : 'active';
    if (nextStatus === 'suspended') {
      const ok = await confirm({
        title: '停用租户',
        description: `停用「${detail.name}」后，该租户全部账号立即退出登录且无法登录。`,
        confirmText: '停用',
        tone: 'danger',
      });
      if (!ok) {
        return;
      }
    }
    const { response } = await opsApi.PATCH('/api/v1/ops/tenants/{id}/status', {
      params: { path: { id: resolvedId } },
      body: { status: nextStatus },
    });
    if (!response.ok) {
      setError('操作失败，请稍后重试');
      return;
    }
    setNotice(nextStatus === 'active' ? '租户已启用' : '租户已停用');
    await invalidate();
  }

  async function handleCreateAdmin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = tenantAdminCreateSchema.safeParse(adminForm);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.POST('/api/v1/ops/tenants/{tenantId}/admins', {
        params: { path: { tenantId: resolvedId } },
        body: parsed.data,
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '补建失败，请稍后重试');
        return;
      }
      setAdminOpen(false);
      setAdminForm({ username: '', phone: '', password: '' });
      setNotice('管理员已创建，首次登录需修改初始密码');
      await invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetAdmin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!resetTarget) {
      return;
    }
    setError(null);
    const parsed = tenantAdminResetPasswordSchema.safeParse({ password: resetPassword });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.POST(
        '/api/v1/ops/tenants/{tenantId}/admins/{userId}/reset-password',
        {
          params: { path: { tenantId: resolvedId, userId: resetTarget.id } },
          body: parsed.data,
        },
      );
      if (!response.ok) {
        setError('重置失败，请稍后重试');
        return;
      }
      setResetTarget(null);
      setResetPassword('');
      setNotice('管理员密码已重置，该账号需重新登录并修改密码');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateAdminPhone(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!phoneTarget) {
      return;
    }
    setError(null);
    const parsed = tenantAdminPhoneInputSchema.safeParse({ phone: phoneValue });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { response } = await opsApi.PATCH(
        '/api/v1/ops/tenants/{tenantId}/admins/{userId}/phone',
        {
          params: { path: { tenantId: resolvedId, userId: phoneTarget.id } },
          body: parsed.data,
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '修改失败，请稍后重试');
        return;
      }
      setPhoneTarget(null);
      setPhoneValue('');
      setNotice('管理员手机号已修改，该账号需用新手机号重新登录');
      await invalidate();
    } finally {
      setSubmitting(false);
    }
  }

  if (detailQuery.isError) {
    return <p className="text-sm text-destructive">加载失败，请稍后重试</p>;
  }
  if (!detail) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  return (
    <PageFrame
      title={`${detail.code}（${detail.name}）`}
      actions={
        <>
          <Button
            type="button"
            onClick={() => {
              setEditForm({ name: detail.name, note: detail.note });
              setEditOpen(true);
            }}
          >
            编辑
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setPlanId(detail.planId);
              setPlanOpen(true);
            }}
          >
            改套餐
          </Button>
          <Button
            type="button"
            variant={detail.status === 'active' ? 'destructive' : 'outline'}
            className="ml-2"
            onClick={() => void handleToggleStatus()}
          >
            {detail.status === 'active' ? '停用' : '启用'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/ops/tenants')}>
            返回列表
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <section className="rounded-lg border border-border bg-card p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">租户编号</dt>
              <dd className="tabular-nums">{detail.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">套餐</dt>
              <dd>{detail.planName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">状态</dt>
              <dd>{detail.status === 'active' ? '启用' : '停用'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">来源</dt>
              <dd>{SOURCE_LABELS[detail.source] ?? detail.source}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">账号数 / 额度</dt>
              <dd className="tabular-nums">
                {countsQuery.data ?? 0} / {detail.maxAccounts}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">创建日期</dt>
              <dd className="tabular-nums">{detail.createdAt.slice(0, 10)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">备注</dt>
              <dd>{detail.note || '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">有效功能</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setChecked(new Set(detail.effectiveFeatures));
                setFeaturesOpen(true);
              }}
            >
              功能开关
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {detail.effectiveFeatures
              .map((code) => FEATURE_LABELS[code as SellableFeatureCode] ?? code)
              .join('、')}
          </p>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">管理员账号</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAdminForm({ username: '', phone: '', password: '' });
                setAdminOpen(true);
              }}
            >
              补建管理员
            </Button>
          </div>
          <div className="mt-3 max-h-[320px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建日期</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      暂无管理员
                    </TableCell>
                  </TableRow>
                ) : (
                  admins.map((admin) => (
                    <TableRow key={admin.id}>
                      <TableCell>{admin.username}</TableCell>
                      <TableCell className="tabular-nums">{maskPhone(admin.phone)}</TableCell>
                      <TableCell>{admin.status === 'active' ? '启用' : '停用'}</TableCell>
                      <TableCell className="tabular-nums">{admin.createdAt.slice(0, 10)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setResetTarget({ id: admin.id, username: admin.username });
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
                              setPhoneTarget({ id: admin.id, username: admin.username });
                              setPhoneValue(admin.phone ?? '');
                            }}
                          >
                            修改手机号
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>编辑租户</DialogTitle>
            <DialogDescription>{detail.code}</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleEdit(event)}>
            <div className="space-y-2">
              <Label htmlFor="editName">租户名称</Label>
              <Input
                id="editName"
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editNote">备注</Label>
              <Textarea
                id="editNote"
                value={editForm.note}
                onChange={(event) => setEditForm({ ...editForm, note: event.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>修改套餐</DialogTitle>
            <DialogDescription>仅可切换到启用中的套餐；存量账号不强制停用。</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleChangePlan(event)}>
            <div className="space-y-2">
              <Label htmlFor="planSelect">套餐</Label>
              <Select
                id="planSelect"
                value={planId}
                onChange={setPlanId}
                options={plans
                  .filter((plan) => plan.status === 'active')
                  .map((plan) => ({
                    value: plan.id,
                    label: `${plan.name}（额度 ${plan.maxAccounts}）`,
                  }))}
                className="w-full"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPlanOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={featuresOpen} onOpenChange={setFeaturesOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>功能开关</DialogTitle>
            <DialogDescription>基础功能始终启用；此处只调整可售功能。</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleSaveFeatures(event)}>
            <div className="grid gap-2 sm:grid-cols-2">
              {FEATURE_OPTIONS.map((option) => (
                <label key={option.code} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked.has(option.code)}
                    onCheckedChange={(value) => {
                      setChecked((prev) => {
                        const next = new Set(prev);
                        if (value === true) {
                          next.add(option.code);
                        } else {
                          next.delete(option.code);
                        }
                        return next;
                      });
                    }}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFeaturesOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={adminOpen} onOpenChange={setAdminOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>补建管理员</DialogTitle>
            <DialogDescription>新账号角色固定为 ADMIN；手机号是登录标识，创建后首次登录需改密。</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleCreateAdmin(event)}>
            <div className="space-y-2">
              <Label htmlFor="adminName">姓名</Label>
              <Input
                id="adminName"
                value={adminForm.username}
                onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPhone">手机号</Label>
              <Input
                id="adminPhone"
                type="tel"
                inputMode="numeric"
                value={adminForm.phone}
                onChange={(event) => setAdminForm({ ...adminForm, phone: event.target.value })}
                placeholder="请输入 11 位手机号"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">初始密码（至少 8 位）</Label>
              <Input
                id="adminPassword"
                type="password"
                value={adminForm.password}
                onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })}
                autoComplete="new-password"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdminOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? '保存中…' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={phoneTarget !== null} onOpenChange={(open) => !open && setPhoneTarget(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>修改管理员手机号</DialogTitle>
            <DialogDescription>
              修改 {phoneTarget?.username} 的登录手机号；保存后该账号需用新手机号重新登录。
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleUpdateAdminPhone(event)}>
            <div className="space-y-2">
              <Label htmlFor="adminPhoneValue">新手机号</Label>
              <Input
                id="adminPhoneValue"
                type="tel"
                inputMode="numeric"
                value={phoneValue}
                onChange={(event) => setPhoneValue(event.target.value)}
                placeholder="请输入 11 位手机号"
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPhoneTarget(null)}>
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
            <DialogTitle>重置管理员密码</DialogTitle>
            <DialogDescription>
              为账号 {resetTarget?.username} 设置新密码；保存后该账号全部会话失效。
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => void handleResetAdmin(event)}>
            <div className="space-y-2">
              <Label htmlFor="resetAdminPassword">新密码（至少 8 位）</Label>
              <Input
                id="resetAdminPassword"
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
    </PageFrame>
  );
}
