'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FINANCE_CASH_CATEGORY_LABELS,
  FINANCE_CASH_DIRECTION_LABELS,
  FINANCE_CASH_METHOD_LABELS,
  type ApiSchemas,
} from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { MobileListState } from '@/components/mobile/list';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 资金流水移动详情（product/finance.md 移动页）：只读信息条；
// 手工流水可编辑 / 删除（二次确认），源单流水只读并标注来源。
type CashEntryDetail = ApiSchemas['FinanceCashEntryDto'];

export default function MobileCashEntryDetailPage(): React.ReactElement {
  const canManage = useCan('finance:manage');
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const params = useParams<{ id: string }>();

  const entryQuery = useQuery({
    queryKey: ['finance-cash-entries', params.id],
    queryFn: async (): Promise<CashEntryDetail> => {
      const { data: res, response } = await api.GET('/api/v1/finance/cash-entries/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('流水不存在或加载失败');
      }
      return res;
    },
  });

  const entry = entryQuery.data;
  const error = entryQuery.isError && !entry ? '流水不存在或加载失败' : null;

  async function handleDelete(): Promise<void> {
    if (!entry) {
      return;
    }
    await confirm({
      title: '删除流水',
      description: `${entry.occurredDate} · ${entry.amount} 元，删除后不可恢复，账户余额随之回退。`,
      confirmText: '删除',
      tone: 'danger',
      onConfirm: async () => {
        const { response } = await api.DELETE('/api/v1/finance/cash-entries/{id}', {
          params: { path: { id: params.id } },
        });
        if (!response.ok) {
          throw new Error('删除失败');
        }
        await queryClient.invalidateQueries({ queryKey: ['finance-cash-entries'] });
        router.replace('/m/finance/cash');
      },
    });
  }

  if (error) {
    return (
      <div>
        <MobileHeader title="流水详情" backHref="/m/finance/cash" />
        <MobileListState tone="error">{error}</MobileListState>
      </div>
    );
  }
  if (!entry) {
    return (
      <div>
        <MobileHeader title="流水详情" backHref="/m/finance/cash" />
        <MobileListState>加载中…</MobileListState>
      </div>
    );
  }

  const signedAmount =
    entry.direction === 'in'
      ? `+${entry.amount}`
      : entry.direction === 'out'
        ? `-${entry.amount}`
        : entry.amount;
  const accountText =
    entry.direction === 'transfer'
      ? `${entry.accountName} → ${entry.toAccountName ?? '—'}`
      : entry.accountName;
  const editable = entry.editable && canManage;

  return (
    <div className="pb-28">
      <MobileHeader title="流水详情" backHref="/m/finance/cash" />

      <div className="space-y-4 p-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <p className="text-mobile-label text-muted-foreground">
            {FINANCE_CASH_DIRECTION_LABELS[entry.direction]} · {entry.occurredDate}
          </p>
          <p className="mt-1 text-mobile-numeric-strong font-semibold tabular-nums">
            {signedAmount} 元
          </p>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <MobileInfoRow label="账户" value={accountText} />
            <MobileInfoRow
              label="收支分类"
              value={entry.category ? FINANCE_CASH_CATEGORY_LABELS[entry.category] : '—'}
            />
            <MobileInfoRow
              label="客户"
              value={entry.category === 'sales_receipt' ? entry.customerName || '—' : '—'}
            />
            <MobileInfoRow
              label="供应商"
              value={entry.category === 'purchase_payment' ? entry.supplierName || '—' : '—'}
            />
            <MobileInfoRow label="方式" value={FINANCE_CASH_METHOD_LABELS[entry.method]} />
            <MobileInfoRow label="来源" value={entry.sourceLabel ?? '手工'} />
            <MobileInfoRow label="备注" value={entry.note || '—'} />
          </div>
        </section>

        {!editable ? (
          <p className="text-mobile-body text-muted-foreground">
            {entry.editable ? '当前角色无操作权限' : '源单派生的流水只读，请回来源单据修改'}
          </p>
        ) : null}
      </div>

      <MobileActionBar>
        {editable ? (
          <>
            <Link
              href={`/m/finance/cash/${entry.id}/edit`}
              className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
            >
              编辑
            </Link>
            <Button
              type="button"
              variant="outline"
              className="h-12 flex-1 border-destructive/40 text-mobile-body text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void handleDelete()}
            >
              删除
            </Button>
          </>
        ) : (
          <Link
            href="/m/finance/cash"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
          >
            返回列表
          </Link>
        )}
      </MobileActionBar>
    </div>
  );
}
