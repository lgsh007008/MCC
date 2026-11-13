'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { FinanceCashCategoryValue, FinanceCashDirection } from '@mcc/shared';
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
  const [initial, setInitial] = useState<MobileCashEntryFormInitial | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/finance/cash-entries/{id}', {
          params: { path: { id: params.id } },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('流水不存在或加载失败');
          return;
        }
        if (!data.editable) {
          setError('源单派生的流水只读，请回销售单修改');
          return;
        }
        setInitial({
          id: data.id,
          direction: data.direction as FinanceCashDirection,
          occurredDate: data.occurredDate,
          amount: data.amount,
          accountId: data.accountId,
          toAccountId: data.toAccountId ?? null,
          customerId: data.customerId ?? null,
          customerName: data.customerName,
          category: (data.category as FinanceCashCategoryValue | null) ?? null,
          note: data.note,
        });
      } catch {
        if (!cancelled) {
          setError('流水不存在或加载失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

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
