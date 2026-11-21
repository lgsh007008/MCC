'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  tenantAdminCreateSchema,
  tenantCreateSchema,
  type ApiSchemas,
} from '@mcc/shared';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { opsApi } from '@/lib/ops/api';
import { randomUuid } from '@/lib/uuid';

// 开通租户（design/租户.md §6.1）：两步——先建租户，再建首管理员；
// 第二步失败时进入详情页补建，不阻断租户开通结果。

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={htmlFor} className="w-24 shrink-0 justify-end text-right text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export default function OpsTenantNewPage(): React.ReactElement {
  usePageCrumb([{ title: '新建' }]);
  const router = useRouter();
  const [form, setForm] = useState({ name: '', planId: '', note: '' });
  const [adminForm, setAdminForm] = useState({ username: 'admin', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
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
  const plans = (plansQuery.data?.items ?? []).filter((plan) => plan.status === 'active');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = tenantCreateSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    const parsedAdmin = tenantAdminCreateSchema.safeParse(adminForm);
    if (!parsedAdmin.success) {
      setError(parsedAdmin.error.issues[0]?.message ?? '管理员输入不合法');
      return;
    }

    setSubmitting(true);
    try {
      const created = await opsApi.POST('/api/v1/ops/tenants', {
        body: parsed.data,
        headers: { 'Idempotency-Key': randomUuid() },
      });
      if (!created.response.ok || !created.data) {
        const body = (await created.response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '开通失败，请稍后重试');
        return;
      }
      const tenantId = created.data.id;
      const admin = await opsApi.POST('/api/v1/ops/tenants/{tenantId}/admins', {
        params: { path: { tenantId } },
        body: parsedAdmin.data,
      });
      if (!admin.response.ok) {
        router.push(`/ops/tenants/${tenantId}?admin=missing`);
        return;
      }
      router.push(`/ops/tenants/${tenantId}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageFrame
      title="开通租户"
      actions={
        <div className="w-full">
          {error ? <p className="mb-2 text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" form="tenant-create-form" disabled={submitting}>
              {submitting ? '开通中…' : '开通'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push('/ops/tenants')}>
              取消
            </Button>
          </div>
        </div>
      }
    >
      <form
        id="tenant-create-form"
        className="space-y-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">租户</h2>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <Field label="租户名称" htmlFor="name">
              <Input
                id="name"
                className="w-full max-w-72"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="如 梅好木业"
              />
            </Field>
            <Field label="套餐" htmlFor="planId">
              <Select
                id="planId"
                value={form.planId}
                onChange={(value) => setForm({ ...form, planId: value })}
                options={plans.map((plan) => ({
                  value: plan.id,
                  label: `${plan.name}（额度 ${plan.maxAccounts}）`,
                }))}
                placeholder={plansQuery.isPending ? '加载中…' : '请选择启用中的套餐'}
                className="w-full max-w-72"
              />
            </Field>
            <Field label="备注" htmlFor="note">
              <Textarea
                id="note"
                className="w-full max-w-2xl"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">首管理员</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            手机号是登录标识；开通后线下告知初始密码，首次登录必须改密。如创建失败，可在租户详情补建。
          </p>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <Field label="姓名" htmlFor="adminUsername">
              <Input
                id="adminUsername"
                className="w-full max-w-72"
                value={adminForm.username}
                onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="手机号" htmlFor="adminPhone">
              <Input
                id="adminPhone"
                type="tel"
                inputMode="numeric"
                className="w-full max-w-72"
                value={adminForm.phone}
                onChange={(event) => setAdminForm({ ...adminForm, phone: event.target.value })}
                placeholder="请输入 11 位手机号"
                autoComplete="off"
              />
            </Field>
            <Field label="初始密码" htmlFor="adminPassword">
              <Input
                id="adminPassword"
                type="password"
                className="w-full max-w-72"
                value={adminForm.password}
                onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })}
                placeholder="至少 8 位"
                autoComplete="new-password"
              />
            </Field>
          </div>
        </section>
      </form>
    </PageFrame>
  );
}
