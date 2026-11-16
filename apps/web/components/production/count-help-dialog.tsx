'use client';

import { HelpDialogShell, HelpRow, HelpSection } from '@/components/ui/help-dialog';

// 盘点口径说明弹窗（product/生产与库存.md R-生产-003）：
// 三组 = 怎么算 / 规则 / 差异去哪；只读，PC 与移动共用。

export function CountHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <HelpDialogShell open={open} onOpenChange={onOpenChange} title="盘点口径说明">
      <HelpSection title="怎么算">
        <HelpRow label="账面数量">保存时点的当前系统库存，不是历史某一天的</HelpRow>
        <HelpRow label="差异">实盘 − 账面</HelpRow>
        <HelpRow label="差异金额">差异 × 当前成本；方木差异按批次日期先进先出分摊到各批次</HelpRow>
        <p className="text-muted-foreground">差异为正即盘盈、为负即盘亏，由系统判断，不用自己选。</p>
      </HelpSection>

      <HelpSection title="规则">
        <HelpRow label="范围">一张单只盘一类：原木或方木</HelpRow>
        <HelpRow label="规格">只盘当前库存已有的规格，不能在这里新增规格</HelpRow>
        <HelpRow label="留空">实盘留空即本行不盘；差异为 0 不生成调整</HelpRow>
        <HelpRow label="日期">不早于期初日期，不晚于今天</HelpRow>
      </HelpSection>

      <HelpSection title="差异去哪了">
        <HelpRow label="库存">只改库存数量与库存值，保存后立即生效；方木按批次先进先出调整</HelpRow>
        <HelpRow label="毛利">不摊到任何一张销售单的材料毛利</HelpRow>
        <HelpRow label="收支">不进入收支汇总，属库存内部调整</HelpRow>
        <HelpRow label="修正">盘点单不能改、不能删；要修正就再盘一次</HelpRow>
      </HelpSection>

      <p className="text-muted-foreground">
        这一页回答「账实差多少、值多少钱」；差异是盘点损益，不进收支。
      </p>
    </HelpDialogShell>
  );
}
