'use client';

import { HelpRow, HelpSection } from '@/components/finance/summary-help-parts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// 经营收支口径说明弹窗（product/finance.md R-财务-001）：
// 只读说明，沿用平台弹窗覆盖层与信息条形态（520px，未新增平台形态）；
// 三组 = 怎么算 / 五个分类各是什么 / 为什么不含其余分类。

export function BusinessSummaryHelpDialog({
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
          <DialogTitle>经营收支口径说明</DialogTitle>
        </DialogHeader>

        <HelpSection title="怎么算">
          <HelpRow label="总收入">销售收入 + 其他收入</HelpRow>
          <HelpRow label="总支出">采购付款 + 工资 + 费用</HelpRow>
          <HelpRow label="净额">总收入 − 总支出</HelpRow>
          <p className="text-muted-foreground">
            销售收入取自销售单（现结取实收、赊销取合计），其余取自资金流水。
          </p>
        </HelpSection>

        <HelpSection title="这五个分类是什么">
          <HelpRow label="销售收入">主营收入，来自销售单</HelpRow>
          <HelpRow label="其他收入">主营之外的经营收入，如卖废料、零星加工费</HelpRow>
          <HelpRow label="采购付款">材料采购支出</HelpRow>
          <HelpRow label="工资">人工支出</HelpRow>
          <HelpRow label="费用">其余全部经营开支，如电费、运费、维修、房租</HelpRow>
        </HelpSection>

        <HelpSection title="为什么不含其余分类">
          <HelpRow label="销售回款">对应的收入已由销售单计入，再算一次就重复</HelpRow>
          <HelpRow label="借款还款">只是负债增减，不是赚或花</HelpRow>
          <HelpRow label="资产购置">买设备是资产转换，不是经营消耗</HelpRow>
          <HelpRow label="内部转账">只是钱在账户之间搬动</HelpRow>
        </HelpSection>

        <p className="text-muted-foreground">
          所以这里的净额回答「赚了多少」，不等于「进来多少现金」；现金看「资金收付」Tab。
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
