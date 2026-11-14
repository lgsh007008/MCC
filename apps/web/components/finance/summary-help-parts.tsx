'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// 收支汇总口径说明弹窗的共用展示原子（经营收支 / 资金收付两个弹窗）：
// 弹窗外壳（固定标题与底部操作、中部滚动）+ 分组标题 + 两列信息条；沿用平台弹窗覆盖层，不单独构成新形态。

export function HelpDialogShell({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[520px]">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="scroll-area min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {children}
        </div>
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HelpSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function HelpRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <span className="w-16 shrink-0 text-right text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}
