'use client';

import { FINANCE_CASH_CATEGORY_LABELS, FINANCE_CASH_DIRECTION_LABELS, type ApiSchemas } from '@mcc/shared';
import { MobileListCard } from '@/components/mobile/list';

// 资金流水卡片（product/finance.md 移动页）：用统一列表卡片结构——
// 顶行日期 + 方向标签、主行分类、次行账户、金额、备注；字号由平台角色控制。

export type MobileCashEntry = ApiSchemas['FinanceCashEntryDto'];

export function FinanceCashCard({ entry }: { entry: MobileCashEntry }): React.ReactElement {
  const amountText =
    entry.direction === 'in'
      ? `+${entry.amount}`
      : entry.direction === 'out'
        ? `-${entry.amount}`
        : entry.amount;
  const amountClass =
    entry.direction === 'in'
      ? 'text-primary'
      : entry.direction === 'out'
        ? 'text-destructive'
        : 'text-foreground';
  const accountText =
    entry.direction === 'transfer'
      ? `${entry.accountName} → ${entry.toAccountName ?? '—'}`
      : entry.accountName;

  return (
    <MobileListCard
      href={`/m/finance/cash/${entry.id}`}
      topLeft={entry.occurredDate}
      topRight={FINANCE_CASH_DIRECTION_LABELS[entry.direction]}
      title={entry.category ? FINANCE_CASH_CATEGORY_LABELS[entry.category] : '无分类'}
      subtitle={accountText}
      footer={
        entry.category === 'purchase_payment' && entry.supplierName
          ? `${entry.supplierName}${entry.note ? ` · ${entry.note}` : ''}`
          : entry.category === 'sales_receipt' && entry.customerName
            ? `${entry.customerName}${entry.note ? ` · ${entry.note}` : ''}`
            : entry.note || undefined
      }
      amount={amountText}
      amountClassName={amountClass}
    />
  );
}
