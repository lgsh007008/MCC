'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { customerInputSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 客户移动表单（product/customer.md 移动页）：新建与编辑共用；单列、Label 在上、保存吸底。
// 名称失焦调 name-check，重名只提示不阻断（与 PC 同口径）。

export interface MobileCustomerFormInitial {
  id?: string;
  code?: string;
  name: string;
  contact: string;
  openingDebt: string;
  note: string;
}

function MobileField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-mobile-label text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function MobileCustomerForm({
  customerId,
  initial,
}: {
  customerId?: string;
  initial?: MobileCustomerFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [openingDebt, setOpeningDebt] = useState(initial?.openingDebt ?? '0.00');
  const [note, setNote] = useState(initial?.note ?? '');
  const [duplicateName, setDuplicateName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const parsed = customerInputSchema.safeParse({ name, contact, openingDebt, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      const { data, response } = customerId
        ? await api.PUT('/api/v1/customers/{id}', {
            params: { path: { id: customerId } },
            body: parsed.data,
          })
        : await api.POST('/api/v1/customers', {
            body: parsed.data,
            headers: { 'Idempotency-Key': randomUuid() },
          });
      if (!response.ok || !data) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? '保存失败，请稍后重试');
        return;
      }
      router.push(`/m/customers/${data.id}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <MobileHeader
        title={customerId ? '编辑客户' : '新建客户'}
        backHref={customerId ? `/m/customers/${customerId}` : '/m/customers'}
      />

      <form id="mobile-customer-form" className="pb-32" onSubmit={handleSubmit}>
        <div className="space-y-4 p-4">
          <section className="space-y-4 rounded-xl border border-border bg-card p-4">
            <MobileField label="客户名称" htmlFor="mobileCustomerName">
              <Input
                id="mobileCustomerName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => void checkDuplicate(name)}
                className="h-12 text-mobile-body"
              />
              {duplicateName ? (
                <p className="text-mobile-caption text-muted-foreground">已存在同名客户，可继续保存</p>
              ) : null}
            </MobileField>

            <MobileField label="联系信息" htmlFor="mobileCustomerContact">
              <Input
                id="mobileCustomerContact"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="电话等，可分行填写"
                className="h-12 text-mobile-body"
              />
            </MobileField>

            <MobileField label="期初欠款" htmlFor="mobileCustomerOpeningDebt">
              <Input
                id="mobileCustomerOpeningDebt"
                value={openingDebt}
                onChange={(event) => setOpeningDebt(event.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 text-mobile-body"
              />
              <p className="text-mobile-caption text-muted-foreground">
                系统上线前已发生的净欠款；上线后的回款照常登记销售回款
              </p>
            </MobileField>

            <MobileField label="备注" htmlFor="mobileCustomerNote">
              <Textarea
                id="mobileCustomerNote"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="min-h-12 text-mobile-body"
              />
            </MobileField>
          </section>
        </div>
      </form>

      {error ? (
        <div className="fixed inset-x-0 bottom-[76px] z-30 mx-auto w-full max-w-[560px] px-4">
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-background p-3 text-mobile-body text-destructive"
          >
            {error}
          </p>
        </div>
      ) : null}

      <MobileActionBar>
        <Button
          type="submit"
          form="mobile-customer-form"
          className="h-12 w-full text-mobile-body"
          disabled={submitting}
        >
          {submitting ? '保存中…' : '保存'}
        </Button>
      </MobileActionBar>
    </>
  );
}
