'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import {
  MobileCashEntryForm,
  type MobileCashEntryFormInitial,
} from '@/components/mobile/finance-cash-entry-form';
import { MobileListState } from '@/components/mobile/list';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';

// 移动端编辑资金流水（product/finance.md 移动页）：加载现有流水后进入共用单列表单。
export default function MobileCashEntryEditPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isError } = useQuery({
    queryKey: ['finance-cash-entries', params.id],
    queryFn: async (): Promise<ApiSchemas['FinanceCashEntryDto']> => {
      const { data: res, response } = await api.GET('/api/v1/finance/cash-entries/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !res) {
        throw new Error('流水不存在或加载失败');
      }
      return res;
    },
  });

  const initial: MobileCashEntryFormInitial | undefined =
    data && data.editable
      ? {
          id: data.id,
          direction: data.direction,
          occurredDate: data.occurredDate,
          amount: data.amount,
          accountId: data.accountId,
          toAccountId: data.toAccountId ?? null,
          customerId: data.customerId ?? null,
          customerName: data.customerName,
          supplierId: data.supplierId ?? null,
          supplierName: data.supplierName,
          category: data.category ?? null,
          note: data.note,
        }
      : undefined;

  const error = isError && !data
    ? '流水不存在或加载失败'
    : data && !data.editable
      ? '源单派生的流水只读，请回销售单修改'
      : null;

  if (error) {
    return (
      <div>
        <MobileHeader title="编辑流水" backHref="/m/finance/cash" />
        <MobileListState tone="error">{error}</MobileListState>
      </div>
    );
  }
  if (!initial) {
    return (
      <div>
        <MobileHeader title="编辑流水" backHref="/m/finance/cash" />
        <MobileListState>加载中…</MobileListState>
      </div>
    );
  }

  return (
    <div>
      <MobileHeader title="编辑流水" backHref={`/m/finance/cash/${initial.id}`} />
      <MobileCashEntryForm
        entryId={initial.id}
        initial={initial}
        onSaved={() => router.replace(`/m/finance/cash/${initial.id}`)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
