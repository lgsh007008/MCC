'use client';

import { HelpDialogShell, HelpRow, HelpSection } from '@/components/ui/help-dialog';

// 库存口径说明弹窗（product/生产与库存.md R-生产-002）：
// 三组 = 怎么算 / 成本怎么走 / 为什么这样且与收支什么关系；只读，PC 与移动共用。

export function InventoryHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <HelpDialogShell open={open} onOpenChange={onOpenChange} title="库存口径说明">
      <HelpSection title="怎么算">
        <HelpRow label="原木库存">期初吨数 + 采购送货吨数 − 原木领用吨数 ± 盘点调整</HelpRow>
        <HelpRow label="方木库存">期初方数 + 方木产出方数 − 销售出库方数 ± 盘点调整</HelpRow>
        <HelpRow label="库存总值">原木库存值 + 方木库存值（不含待结转成本）</HelpRow>
        <HelpRow label="待结转">原木领用成本 − 方木产出结转成本；不计入库存总值</HelpRow>
      </HelpSection>

      <HelpSection title="成本怎么走">
        <HelpRow label="采购进货">原木池加吨数、加金额；金额取采购单合计，含运费与折价</HelpRow>
        <HelpRow label="原木领用">
          原木池减吨数、减成本；成本记入所选生产批次的「待结转」，不计入库存总值。成本 = 领用吨数 × 当时原木平均成本
        </HelpRow>
        <HelpRow label="方木产出">本批次方木加方数，并把本批次待结转成本全额转入</HelpRow>
        <HelpRow label="销售出库">按批次日期先进先出扣方数，同时扣各批次对应的材料成本</HelpRow>
        <HelpRow label="盘点">差异按当前成本计价，并按批次日期先进先出分摊到各批次；待结转不参与盘点</HelpRow>
        <HelpRow label="平均成本">批次金额 ÷ 批次方数；每个批次一个平均成本，批次之间不混摊</HelpRow>
      </HelpSection>

      <HelpSection title="为什么这样、和收支什么关系">
        <HelpRow label="只算材料">不含人工、电费、房租；运费与折价已在采购金额里摊进吨成本</HelpRow>
        <HelpRow label="估算情形">负库存或没有有效成本时，沿用最近一次有效成本估算，并标「估算 / 成本待补」</HelpRow>
        <HelpRow label="不进收支">
          采购支出已在「收支汇总 · 经营收支」按采购单计入一次；领用、产出、盘点不再进入收支，避免重复计算
        </HelpRow>
      </HelpSection>

      <p className="text-muted-foreground">
        领用后、产出前，本批次待结转成本不计入库存总值，所以总值会短暂减少，产出后恢复；批次关闭时剩余待结转一次性结清。这一页回答「仓里还有多少、值多少钱」，赚没赚看收支汇总。
      </p>
    </HelpDialogShell>
  );
}
