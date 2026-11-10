'use client';

import Link from 'next/link';
import { FINANCE_CATEGORY_LABELS, type FinanceCategoryValue } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// 财务事件详情弹窗（product/finance.md R-财务-001 页面设计；弹窗详情规范见 product/平台布局.md）：
// 字段少的流水记录不占独立页面；数据取自列表项（无需再请求详情接口）。
// 详情 → 编辑为状态切换（由调用方切换状态机），不叠加嵌套。

export interface FinanceEventDialogItem {
  id: string;
  code: string;
  occurredDate: string;
  category: FinanceCategoryValue;
  amount: string;
  note: string;
  source: 'auto' | 'manual';
  sourceType?: string | null;
  sourceId?: string | null;
  sourceCode?: string | null;
}

export function FinanceEventDetailDialog({
  event,
  onOpenChange,
  onEdit,
}: {
  event: FinanceEventDialogItem | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (event: FinanceEventDialogItem) => void;
}): React.ReactElement {
  const rows: Array<{ label: string; value: React.ReactNode }> = event
    ? [
        { label: '发生日期', value: event.occurredDate },
        { label: '分类', value: FINANCE_CATEGORY_LABELS[event.category] },
        { label: '金额', value: <span className="tabular-nums">{event.amount}</span> },
        { label: '来源', value: event.source === 'auto' ? '自动' : '手工' },
        {
          label: '源单',
          value:
            event.sourceType === 'sale_order' && event.sourceId ? (
              <Link
                href={`/admin/sale-orders/${event.sourceId}`}
                className="text-primary hover:underline"
              >
                {event.sourceCode}
              </Link>
            ) : (
              '—'
            ),
        },
        { label: '备注', value: event.note || '—' },
      ]
    : [];

  return (
    <Dialog
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {event ? `${event.code}（${FINANCE_CATEGORY_LABELS[event.category]}）` : ''}
          </DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="w-20 shrink-0 text-muted-foreground">{row.label}</dt>
              <dd className="min-w-0 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2">
          {event?.source === 'manual' ? (
            <Button onClick={() => onEdit(event)}>编辑</Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
