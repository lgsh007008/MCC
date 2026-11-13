'use client';

import {
  FINANCE_ACCOUNT_CHANNEL_LABELS,
  FINANCE_ACCOUNT_KIND_LABELS,
  type FinanceAccountChannel,
  type FinanceAccountKind,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// 资金账户详情弹窗（product/finance.md R-财务-002；弹窗详情规范见 product/平台布局.md）：
// 只读展示，信息条两列排布（本页局部决定，未上升为平台通用规范）；
// 编辑 = 关闭详情后切换到账户弹窗，两者不嵌套。

export interface FinanceAccountDetail {
  id: string;
  code: string;
  name: string;
  kind: FinanceAccountKind;
  channel: FinanceAccountChannel;
  openingBalance: string;
  balance: string;
  active: boolean;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="w-20 shrink-0 text-right text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

export function FinanceAccountDetailDialog({
  open,
  account,
  onOpenChange,
  onEdit,
}: {
  open: boolean;
  account: FinanceAccountDetail;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-6 sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>账户详情 {account.code}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Row label="账户名称">{account.name}</Row>
          <Row label="状态">
            <span className={account.active ? 'text-primary' : 'text-muted-foreground'}>
              {account.active ? '启用' : '停用'}
            </span>
          </Row>
          <Row label="类型">{FINANCE_ACCOUNT_KIND_LABELS[account.kind]}</Row>
          <Row label="渠道">{FINANCE_ACCOUNT_CHANNEL_LABELS[account.channel]}</Row>
          <Row label="期初余额">
            <span className="tabular-nums">{account.openingBalance}</span>
          </Row>
          <Row label="当前余额">
            <span className="font-medium tabular-nums">{account.balance}</span>
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
