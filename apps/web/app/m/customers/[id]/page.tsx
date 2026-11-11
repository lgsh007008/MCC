'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Trash2Icon } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useCan } from '@/components/auth/permission-context';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileListState } from '@/components/mobile/list';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 客户移动详情（product/customer.md 移动页）：名称 + 状态 / 联系信息 / 备注 / 创建日期；
// customer:manage 可停用（需确认）/ 启用（直接）/ 删除（确认前查销售单数量）；不展示编号与累计方量。
interface CustomerDetail {
  id: string;
  name: string;
  contact: string;
  note: string;
  status: string;
  createdAt: string;
}

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right text-base">{value}</span>
    </div>
  );
}

export default function MobileCustomerDetailPage(): React.ReactElement {
  const canManage = useCan('customer:manage');
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/customers/{id}', {
          params: { path: { id: params.id } },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('客户不存在或加载失败');
          return;
        }
        setCustomer(data);
      } catch {
        if (!cancelled) {
          setError('客户不存在或加载失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function handleToggleStatus(): Promise<void> {
    if (!customer) {
      return;
    }
    setActionError(null);
    const next = customer.status === 'active' ? 'inactive' : 'active';
    const run = async (): Promise<void> => {
      setBusy(true);
      try {
        const { response } = await api.PATCH('/api/v1/customers/{id}/status', {
          params: { path: { id: params.id } },
          body: { status: next },
        });
        if (!response.ok) {
          throw new Error('操作失败，请稍后重试');
        }
        setCustomer({ ...customer, status: next });
      } finally {
        setBusy(false);
      }
    };
    try {
      if (next === 'inactive') {
        await confirm({
          title: '停用客户',
          description: `${customer.name} 停用后不可被新销售单选择，历史单据不受影响。`,
          confirmText: '停用',
          tone: 'danger',
          onConfirm: run,
        });
      } else {
        await run();
      }
    } catch {
      setActionError('操作失败，请稍后重试');
    }
  }

  async function handleDelete(): Promise<void> {
    if (!customer) {
      return;
    }
    setActionError(null);
    let orderCount: number | null = null;
    try {
      const { data, response } = await api.GET('/api/v1/sale-orders/customer-volume-summary', {
        params: { query: { customerIds: params.id } },
      });
      if (response.ok && data) {
        orderCount = data.items.find((item) => item.customerId === params.id)?.orderCount ?? 0;
      }
    } catch {
      orderCount = null;
    }
    const countText = orderCount === null ? '' : `该客户有 ${orderCount} 张销售单；`;
    try {
      await confirm({
        title: '删除客户',
        description: `${customer.name}，${countText}删除后历史单据保留名称快照，不可恢复。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          setBusy(true);
          try {
            const { response } = await api.DELETE('/api/v1/customers/{id}', {
              params: { path: { id: params.id } },
            });
            if (!response.ok) {
              throw new Error('删除失败，请稍后重试');
            }
            router.replace('/m/customers');
          } finally {
            setBusy(false);
          }
        },
      });
    } catch {
      setActionError('删除失败，请稍后重试');
    }
  }

  if (error) {
    return (
      <div>
        <MobileHeader title="客户详情" backHref="/m/customers" />
        <MobileListState tone="error">{error}</MobileListState>
      </div>
    );
  }
  if (!customer) {
    return (
      <div>
        <MobileHeader title="客户详情" backHref="/m/customers" />
        <MobileListState>加载中…</MobileListState>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <MobileHeader title="客户详情" backHref="/m/customers" />

      <div className="space-y-4 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-2xl font-semibold">{customer.name}</p>
            <span className="mt-1 shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
              {customer.status === 'active' ? '启用' : '停用'}
            </span>
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <InfoRow label="联系信息" value={customer.contact || '—'} />
            <InfoRow label="备注" value={customer.note || '—'} />
            <InfoRow label="创建日期" value={customer.createdAt.slice(0, 10)} />
          </div>
        </section>

        {canManage ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-base"
              disabled={busy}
              onClick={() => void handleToggleStatus()}
            >
              {customer.status === 'active' ? '停用客户' : '启用客户'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => void handleDelete()}
            >
              <Trash2Icon className="size-4" />
              删除客户
            </Button>
            {actionError ? (
              <p role="alert" className="text-base text-destructive">
                {actionError}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <MobileActionBar>
        {canManage ? (
          <Link
            href={`/m/customers/${customer.id}/edit`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-base')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/customers"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-base')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
