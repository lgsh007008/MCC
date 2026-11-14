'use client';

import {
  FINANCE_CASH_CATEGORY_LABELS,
  FINANCE_CASH_DIRECTION_LABELS,
  FINANCE_CASH_METHOD_LABELS,
} from '@mcc/shared';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// 资金流水详情弹窗（product/finance.md R-财务-002；弹窗详情规范见 product/平台布局.md）：
// 只读展示，信息条两列排布，备注为长文本独占整行并强制换行（本页局部决定）；
// 编辑 = 关闭详情后切换到流水弹窗，源单流水不提供编辑。

export type FinanceCashEntryDetail = ApiSchemas['FinanceCashEntryDto'];

function Row({
  label,
  children,
  full = false,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}): React.ReactElement {
  return (
    <div className={`flex min-w-0 items-start gap-2${full ? ' col-span-2' : ''}`}>
      <span className="w-20 shrink-0 text-right text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

export function FinanceCashEntryDetailDialog({
  open,
  entry,
  onOpenChange,
  onEdit,
}: {
  open: boolean;
  entry: FinanceCashEntryDetail;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}): React.ReactElement {
  const amountClass =
    entry.direction === 'in'
      ? 'font-medium tabular-nums text-primary'
      : entry.direction === 'out'
        ? 'font-medium tabular-nums text-destructive'
        : 'font-medium tabular-nums';
  const amountText =
    entry.direction === 'in'
      ? `+${entry.amount}`
      : entry.direction === 'out'
        ? `-${entry.amount}`
        : entry.amount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>流水详情 {entry.code}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Row label="发生日期">{entry.occurredDate}</Row>
          <Row label="方向">{FINANCE_CASH_DIRECTION_LABELS[entry.direction]}</Row>
          <Row label="金额">
            <span className={amountClass}>{amountText}</span>
          </Row>
          <Row label="收支分类">
            {entry.category ? FINANCE_CASH_CATEGORY_LABELS[entry.category] : '—'}
          </Row>
          {entry.direction === 'transfer' ? (
            <>
              <Row label="转出账户">{entry.accountName}</Row>
              <Row label="转入账户">{entry.toAccountName ?? '—'}</Row>
            </>
          ) : (
            <>
              <Row label="资金账户">{entry.accountName}</Row>
              <Row label="客户">
                {entry.category === 'sales_receipt' ? entry.customerName || '—' : '—'}
              </Row>
              <Row label="供应商">
                {entry.category === 'purchase_payment' ? entry.supplierName || '—' : '—'}
              </Row>
            </>
          )}
          <Row label="方式">{FINANCE_CASH_METHOD_LABELS[entry.method]}</Row>
          <Row label="来源">
            {entry.sourceType ? (
              <span title={entry.sourceCode ?? undefined}>
                {entry.sourceLabel}
                {entry.sourceCode ? ` ${entry.sourceCode}` : ''}
              </span>
            ) : (
              '手工'
            )}
          </Row>
          <Row label="备注" full>
            <span className="whitespace-pre-wrap break-words">{entry.note || '—'}</span>
          </Row>
        </div>
        <div className="flex items-center gap-2">
          {onEdit ? (
            <Button type="button" onClick={onEdit}>
              编辑
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
