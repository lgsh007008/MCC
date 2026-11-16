'use client';

import { HelpDialogShell, HelpRow, HelpSection } from '@/components/ui/help-dialog';

// 方木成本口径说明弹窗（product/生产与库存.md R-生产-002 / R-生产-006）：
// 三组 = 方木池的钱从哪来 / 为什么按批次 / 两个时间点的影响；入口在方木产出列表，PC 与移动共用。

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
        <HelpRow label="期初方木">上线时录入的方木金额，进入「期初库存批次」</HelpRow>
        <HelpRow label="原木领用">
          按「领用吨数 × 当时原木平均成本」先从原木池转出，记入本批次待结转；产出时全额转入本批次方木池
        </HelpRow>
        <HelpRow label="盘点调整">盘盈盘亏按当前成本计价，并按批次先进先出分摊到各批次</HelpRow>
        <HelpRow label="销售出库">按批次先进先出扣方数与对应材料成本；售价与收入不进库存池</HelpRow>
      </HelpSection>

      <HelpSection title="为什么按批次算">
        <HelpRow label="成本对象">一个生产批次 = 一个成本对象，领用与产出都挂在批次上，批次之间不混摊</HelpRow>
        <HelpRow label="批次成本">批次平均成本 = 本批次方木金额 ÷ 本批次方木方数；不同批次可以不同</HelpRow>
        <HelpRow label="销售扣层">
          销售按批次日期先进先出：先卖老批次，卖完再卖新批次；每层按该批次自己的平均成本计价
        </HelpRow>
        <HelpRow label="为什么">
          如果不分批次，全厂共用一个平均成本，新批次成本高时会把老库存的成本一起拉高；分批次后各批成本互不影响
        </HelpRow>
      </HelpSection>

      <HelpSection title="两个时间点的影响">
        <HelpRow label="加工期间">
          领用后、产出前，成本记在本批次待结转、不计入库存总值；原木池减少，总值短暂下降，产出后恢复
        </HelpRow>
        <HelpRow label="产出时">
          产出把本批次待结转一次性全额转入本批次方木池；同一批次分多张产出单时第一张拿走全部待结转
        </HelpRow>
        <HelpRow label="批次关闭">
          关闭后不能再新增或修改领用 / 产出；剩余待结转一次性转入本批次方木池
        </HelpRow>
        <HelpRow label="日期顺序">产出日期不得早于本批次领用日期，否则成本不会结转到本单</HelpRow>
      </HelpSection>

      <p className="text-muted-foreground">
        本页回答「方木入库的方数与成本怎么来」；批次余额看「生产批次」，库存总值看库存页，整体经营看收支汇总。
      </p>
    </HelpDialogShell>
  );
}
