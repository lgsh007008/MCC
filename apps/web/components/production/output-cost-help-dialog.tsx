'use client';

import { HelpDialogShell, HelpRow, HelpSection } from '@/components/ui/help-dialog';

// 方木成本口径说明弹窗（product/生产与库存.md R-生产-002 / R-生产-005）：
// 三组 = 方木池的钱从哪来 / 为什么全厂同一个平均成本 / 两个时间点的影响；
// 入口在方木产出列表，PC 与移动共用。

export function OutputCostHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactElement {
  return (
    <HelpDialogShell open={open} onOpenChange={onOpenChange} title="方木成本口径说明">
      <HelpSection title="方木池的钱从哪来">
        <HelpRow label="期初方木">上线时录入的方木金额，直接进池</HelpRow>
        <HelpRow label="原木领用">
          按「领用吨数 × 当时原木平均成本」先从原木池转出，记「待结转」；产出时全额转入方木池
        </HelpRow>
        <HelpRow label="盘点调整">盘盈盘亏按当前平均成本计入或扣减</HelpRow>
        <HelpRow label="其他单据">采购只进原木池；销售出库减方数和这些方数的材料成本</HelpRow>
      </HelpSection>

      <HelpSection title="为什么全厂同一个平均成本">
        <HelpRow label="怎么算">平均成本 = 方木池金额 ÷ 方木总方数</HelpRow>
        <HelpRow label="怎么用">所有规格共用同一个元/m³，不按规格、不按批次分别算</HelpRow>
        <HelpRow label="为什么">
          产出单只记净尺寸与方数，领用单只记吨数，两单不关联，系统无法知道哪根方木用了哪批原木
        </HelpRow>
        <p className="text-muted-foreground">
          例：采购 10 吨 5000 元 → 领用 4 吨记待结转 2000 元、库存总值暂为 3000 元 → 产出 2 m³ 后待结转转入方木池、总值恢复 5000 元，方木成本 1000 元/m³。
        </p>
      </HelpSection>

      <HelpSection title="两个时间点的影响">
        <HelpRow label="加工期间">
          方木平均成本保持不变，卖老库存按原成本；待结转成本不计入库存总值，总值短暂减少，产出后恢复
        </HelpRow>
        <HelpRow label="同一批">
          约定一批领用对应一张产出单（可多行规格）；分多张时第一张拿走全部待结转成本，后续产出成本为 0
        </HelpRow>
        <HelpRow label="结转粒度">
          每次产出都把当时整个待结转池一次性全额转入方木池，不做部分结转；每笔领用只有待结转 / 已结转两种状态
        </HelpRow>
        <HelpRow label="日期顺序">产出日期不得早于对应领用日期，否则成本不会结转到本单</HelpRow>
      </HelpSection>

      <p className="text-muted-foreground">
        本页回答「方木入库的方数与成本怎么来」；库存总值看库存页，整体经营看收支汇总。
      </p>
    </HelpDialogShell>
  );
}
