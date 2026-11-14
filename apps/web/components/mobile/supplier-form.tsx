'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supplierInputSchema } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';

// 供应商移动表单（product/supplier.md R-供应商-001）：单列、控件 48px；
// 编号不展示；重名只提示不阻断。

export interface MobileSupplierFormInitial {
  code: string;
  name: string;
  contact: string;
  openingPayable: string;
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
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-mobile-label text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function MobileSupplierForm({
  title,
  supplierId,
  initial,
}: {
  title: string;
  supplierId?: string;
  initial?: MobileSupplierFormInitial;
}): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [contact, setContact] = useState(initial?.contact ?? '');
  const [openingPayable, setOpeningPayable] = useState(initial?.openingPayable ?? '0.00');
  const [note, setNote] = useState(initial?.note ?? '');
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function checkDuplicate(value: string): Promise<void> {
    if (!value.trim()) {
      setDuplicate(false);
      return;
    }
    try {
      const { data, response } = await api.GET('/api/v1/suppliers/name-check', {
        params: { query: { name: value.trim(), excludeId: supplierId } },
      });
      setDuplicate(response.ok && Boolean(data?.duplicate));
    } catch {
      setDuplicate(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    const parsed = supplierInputSchema.safeParse({ name, contact, openingPayable, note });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '输入不合法');
      return;
    }
    setSubmitting(true);
    try {
      if (supplierId) {
        const { response } = await api.PUT('/api/v1/suppliers/{id}', {
          params: { path: { id: supplierId } },
          body: parsed.data,
        });
        if (!response.ok) {
          setError('保存失败，请稍后重试');
          return;
        }
        router.push(`/m/purchase/suppliers/${supplierId}`);
        return;
      }
      const { data, response } = await api.POST('/api/v1/suppliers', {
        body: parsed.data,
        headers: { 'Idempotency-Key': randomUuid() },
      });
      if (!response.ok || !data) {
        setError('保存失败，请稍后重试');
        return;
      }
      router.push(`/m/purchase/suppliers/${data.id}`);
    } catch {
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = 'h-12 text-mobile-body';

  return (
    <div>
      <MobileHeader
        title={title}
        backHref={supplierId ? `/m/purchase/suppliers/${supplierId}` : '/m/purchase/suppliers'}
      />
      <form id="mobile-supplier-form" className="space-y-4 p-4 pb-28" onSubmit={handleSubmit}>
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <Field label="供应商名称" htmlFor="mobileSupplierName">
            <Input
              id="mobileSupplierName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => void checkDuplicate(e.target.value)}
              placeholder="供应商名称"
              className={inputClass}
            />
            {duplicate ? (
              <p className="text-mobile-caption text-muted-foreground">已存在同名供应商，可继续保存</p>
            ) : null}
          </Field>
          <Field label="联系信息" htmlFor="mobileSupplierContact">
            <Textarea
              id="mobileSupplierContact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="电话等"
              className="min-h-12 text-mobile-body"
            />
          </Field>
          <Field label="期初应付" htmlFor="mobileSupplierOpeningPayable">
            <Input
              id="mobileSupplierOpeningPayable"
              value={openingPayable}
              onChange={(e) => setOpeningPayable(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={inputClass}
            />
            <p className="text-mobile-caption text-muted-foreground">
              系统上线前已发生的净应付；上线后的付款照常登记采购付款
            </p>
          </Field>
          <Field label="备注" htmlFor="mobileSupplierNote">
            <Textarea
              id="mobileSupplierNote"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-12 text-mobile-body"
            />
          </Field>
        </div>

        {error ? <p className="text-mobile-body text-destructive">{error}</p> : null}
      </form>

      <MobileActionBar>
        <Button
          type="submit"
          form="mobile-supplier-form"
          className="h-12 flex-1 text-mobile-body"
          disabled={submitting}
        >
          {submitting ? '保存中…' : '保存'}
        </Button>
      </MobileActionBar>
    </div>
  );
}
