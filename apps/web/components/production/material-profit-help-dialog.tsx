'use client';

import { HelpDialogShell, HelpRow, HelpSection } from '@/components/ui/help-dialog';

// 材料毛利口径说明弹窗（product/生产与库存.md R-生产-004）：
// 三组 = 怎么算 / 为什么是快照 / 不含什么；只读，销售单详情 PC 与移动共用。

export function MaterialProfitHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <HelpDialogShell open={open} onOpenChange={onOpenChange} title="材料毛利口径说明">
      <HelpSection title="怎么算">
        <HelpRow label="确认收入">现结取实收金额，赊销取单据合计金额</HelpRow>
        <HelpRow label="材料成本">单据总方量 × 下单时的方木平均成本</HelpRow>
        <HelpRow label="材料毛利">确认收入 − 材料成本</HelpRow>
        <HelpRow label="毛利率">材料毛利 ÷ 确认收入；收入为 0 时显示「—」</HelpRow>
      </HelpSection>

      <HelpSection title="为什么是快照">
        <HelpRow label="锁定">成本在下单时锁定，之后采购、领用、产出、盘点怎么变，历史单都不改</HelpRow>
        <HelpRow label="成本待补">
          下单时没有有效成本，先记「成本待补」、毛利留空；重算一次后即锁定，不能反复改
        </HelpRow>
      </HelpSection>

      <HelpSection title="不含什么">
        <HelpRow label="费用">不含人工、电费、房租、折旧，也不含销售费用</HelpRow>
        <HelpRow label="不是净额">不等于收支汇总的净额，也不是整厂利润率，只用于看单张单子的料本毛利</HelpRow>
        <HelpRow label="与库存">方木成本在方木产出时更新；销售出库会减少库存值，但不影响这张单已经锁定的成本</HelpRow>
      </HelpSection>

      <p className="text-muted-foreground">
        这一页回答「这一单的料本赚了多少」；整体经营看收支汇总。
      </p>
    </HelpDialogShell>
  );
}
