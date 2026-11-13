'use client';

import { HelpRow, HelpSection } from '@/components/finance/summary-help-parts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// 资金收付口径说明弹窗（product/finance.md R-财务-001 / R-财务-002）：
// 与经营收支弹窗同构（520px、三组信息条 + 收尾句、底部只有关闭）；
// 三组 = 怎么算 / 净流入为什么不等于资金总额 / 哪些钱进哪些不进。

export function CashSummaryHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto p-6 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>资金收付口径说明</DialogTitle>
        </DialogHeader>

        <HelpSection title="怎么算">
          <HelpRow label="期间收款">区间内收款流水合计</HelpRow>
          <HelpRow label="期间付款">区间内付款流水合计</HelpRow>
          <HelpRow label="净流入">期间收款 − 期间付款</HelpRow>
          <HelpRow label="资金总额">各账户此刻余额合计</HelpRow>
          <p className="text-muted-foreground">流水金额恒为正数，增减由方向决定。</p>
        </HelpSection>

        <HelpSection title="净流入为什么不等于资金总额">
          <HelpRow label="净流入">这一段时间的增量，只算区间内的收付款</HelpRow>
          <HelpRow label="资金总额">累计存量 = 各账户期初余额 + 全部历史净流入</HelpRow>
          <p className="text-muted-foreground">
            两者相差期初余额与区间之外的净流入；只有期初全为 0、且区间覆盖全部历史时，两个数才会相等。
          </p>
        </HelpSection>

        <HelpSection title="哪些钱进、哪些不进">
          <HelpRow label="收款侧">销售回款、其他收入、借款</HelpRow>
          <HelpRow label="付款侧">采购付款、工资、费用、资产购置、还款</HelpRow>
          <HelpRow label="内部转账">不计入，只是钱在账户之间搬动</HelpRow>
          <HelpRow label="账户余额">期初 + 收 − 付 + 转入 − 转出；停用账户仍计入总额，已删除账户不计入</HelpRow>
        </HelpSection>

        <p className="text-muted-foreground">
          这一页回答「钱怎么动、现在手里有多少」；生意赚没赚，看「经营收支」Tab。
        </p>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
