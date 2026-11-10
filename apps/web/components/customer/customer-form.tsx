'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { customerInputSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

// 客户表单（product/customer.md R-客户-001；页面模式规范见 product/平台布局.md）：
// 新建与编辑共用。Label 与控件左右并排；编号不可编辑；重名只提示不阻断保存。

export interface CustomerFormInitial {
  code: string;
  name: string;
  contact: string;
  note: string;
}

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

export function CustomerForm({
  customerId,
  initial,
}: {
  customerId?: string;
  initial?: CustomerFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [duplicateName, setDuplicateName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 重名检查（product/customer.md 重名规则）：仅提示，不阻断提交。
  async function checkDuplicate(value: string): Promise<void> {
    if (!value.trim()) {
      setDuplicateName(false);
      return;
    }
    try {
      const { data, response } = await api.GET('/api/v1/customers/name-check', {
        params: { query: { name: value.trim(), excludeId: customerId } },
      });
      setDuplicateName(response.ok && Boolean(data?.duplicate));
    } catch {
      setDuplicateName(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = customerInputSchema.safeParse({ name, contact, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      if (customerId) {
        const { response } = await api.PUT('/api/v1/customers/{id}', {
          params: { path: { id: customerId } },
          body: parsed.data,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { message?: string } | null;
          setError(body?.message ?? '保存失败，请稍后重试');
          return;
        }
        router.push(`/admin/customers/${customerId}`);
        return;
      }
      const { data, response } = await api.POST('/api/v1/customers', { body: parsed.data });
      if (!response.ok || !data) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      router.push(`/admin/customers/${data.id}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">客户</h2>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <Field label="客户编号" htmlFor="customerCode">
            <Input
              id="customerCode"
              value={initial?.code ?? ''}
              placeholder="系统生成"
              readOnly
              disabled
              className="h-8 w-40"
            />
          </Field>
          <Field label="客户名称" htmlFor="customerName">
            <div className="w-full max-w-72">
              <Input
                id="customerName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={(e) => void checkDuplicate(e.target.value)}
                placeholder="客户名称"
                className="h-8 w-full"
              />
              {duplicateName ? (
                <p className="mt-1 text-xs text-muted-foreground">已存在同名客户，可继续保存</p>
              ) : null}
            </div>
          </Field>
          <Field label="联系信息" htmlFor="customerContact">
            <Textarea
              id="customerContact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="电话等"
              className="min-h-8 w-full max-w-72"
            />
          </Field>
          <Field label="备注" htmlFor="customerNote">
            <Textarea
              id="customerNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-8 w-full max-w-72"
            />
          </Field>
        </div>
      </section>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? '保存中…' : '保存'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            router.push(customerId ? `/admin/customers/${customerId}` : '/admin/customers')
          }
        >
          取消
        </Button>
      </div>
    </form>
  );
}
