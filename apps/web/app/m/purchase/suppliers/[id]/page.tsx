'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import { absMoney, type ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileListState } from '@/components/mobile/list';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 供应商移动详情（product/supplier.md 移动页）：与客户详情同构——
// 名称 + 状态标签 / 应付累计 / 联系信息 / 备注 / 创建日期；
// supplier:manage 可停用（需确认）/ 启用（直接）/ 删除（确认前查采购单数量）；不展示编号。
type SupplierDetail = ApiSchemas['SupplierDto'];

export default function MobileSupplierDetailPage(): React.ReactElement {
  const canManage = useCan('supplier:manage');
  const confirm = useConfirm();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const supplierQuery = useQuery({
    queryKey: ['suppliers', params.id],
    queryFn: async (): Promise<SupplierDetail> => {
      const { data: res, response } = await api.GET('/api/v1/suppliers/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('供应商不存在或加载失败');
      }
      return res;
    },
  });

  const payableQuery = useQuery({
    queryKey: ['finance-payables', params.id],
    queryFn: async (): Promise<ApiSchemas['FinancePayableListDto']> => {
      const { data: res, response } = await api.GET('/api/v1/finance/payables', {
        params: { query: { supplierIds: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  const supplier = supplierQuery.data;
  const payableItem = payableQuery.data?.items[0];
  const payable = {
    purchases: payableItem?.purchases ?? '0.00',
    payments: payableItem?.payments ?? '0.00',
    outstanding: payableItem?.outstanding ?? '0.00',
  };
  const error = supplierQuery.isError && !supplier ? '供应商不存在或加载失败' : null;

  async function handleToggleStatus(): Promise<void> {
    if (!supplier) {
      return;
    }
    setActionError(null);
    const next = supplier.status === 'active' ? 'inactive' : 'active';
    const run = async (): Promise<void> => {
      setBusy(true);
      try {
        const { response } = await api.PATCH('/api/v1/suppliers/{id}/status', {
          params: { path: { id: params.id } },
          body: { status: next },
        });
        if (!response.ok) {
          throw new Error('操作失败，请稍后重试');
        }
        await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      } finally {
        setBusy(false);
      }
    };
    try {
      if (next === 'inactive') {
        await confirm({
          title: '停用供应商',
          description: `${supplier.name} 停用后不可被新采购单选择，历史单据不受影响。`,
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
    if (!supplier) {
      return;
    }
    setActionError(null);
    let orderCount: number | null = null;
    try {
      const { data, response } = await api.GET('/api/v1/purchase-orders/supplier-summary', {
        params: { query: { supplierIds: params.id } },
      });
      if (response.ok && data) {
        orderCount = data.items.find((item) => item.supplierId === params.id)?.purchaseCount ?? 0;
      }
    } catch {
      orderCount = null;
    }
    const countText = orderCount === null ? '' : `该供应商有 ${orderCount} 张采购单；`;
    try {
      await confirm({
        title: '删除供应商',
        description: `${supplier.name}，${countText}删除后历史单据保留名称快照，不可恢复。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          setBusy(true);
          try {
            const { response } = await api.DELETE('/api/v1/suppliers/{id}', {
              params: { path: { id: params.id } },
            });
            if (!response.ok) {
              throw new Error('删除失败，请稍后重试');
            }
            await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
            router.replace('/m/purchase/suppliers');
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
        <MobileHeader title="供应商详情" backHref="/m/purchase/suppliers" />
        <MobileListState tone="error">{error}</MobileListState>
      </div>
    );
  }
  if (!supplier) {
    return (
      <div>
        <MobileHeader title="供应商详情" backHref="/m/purchase/suppliers" />
        <MobileListState>加载中…</MobileListState>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <MobileHeader title="供应商详情" backHref="/m/purchase/suppliers" />

      <div className="space-y-4 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-mobile-title font-semibold">{supplier.name}</p>
            <span className="mt-1 shrink-0 rounded border border-border px-2 py-0.5 text-mobile-caption text-muted-foreground">
              {supplier.status === 'active' ? '启用' : '停用'}
            </span>
          </div>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {supplier.openingPayable !== '0.00' ? (
              <MobileInfoRow label="期初应付" value={`${supplier.openingPayable} 元`} />
            ) : null}
            <MobileInfoRow label="累计采购" value={`${payable.purchases} 元`} />
            <MobileInfoRow label="累计付款" value={`${payable.payments} 元`} />
            <MobileInfoRow
              label="应付"
              value={
                payable.outstanding.startsWith('-') ? (
                  `${absMoney(payable.outstanding)} 元（预付）`
                ) : payable.outstanding === '0.00' ? (
                  '0.00 元'
                ) : (
                  <span className="font-semibold text-destructive">
                    {`${payable.outstanding} 元`}
                  </span>
                )
              }
            />
            <div className="border-t border-border pt-2" />
            <MobileInfoRow label="联系信息" value={supplier.contact || '—'} />
            <MobileInfoRow label="备注" value={supplier.note || '—'} />
            <MobileInfoRow label="创建日期" value={supplier.createdAt.slice(0, 10)} />
          </div>
        </section>

        {canManage ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full text-mobile-body"
              disabled={busy}
              onClick={() => void handleToggleStatus()}
            >
              {supplier.status === 'active' ? '停用供应商' : '启用供应商'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-mobile-body text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => void handleDelete()}
            >
              <Trash2Icon className="size-4" />
              删除供应商
            </Button>
            {actionError ? (
              <p role="alert" className="text-mobile-body text-destructive">
                {actionError}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <MobileActionBar>
        {canManage ? (
          <Link
            href={`/m/purchase/suppliers/${supplier.id}/edit`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/purchase/suppliers"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
