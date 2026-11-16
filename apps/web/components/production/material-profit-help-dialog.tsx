'use client';

import type { ApiSchemas } from '@mcc/shared';
import { HelpDialogShell, HelpRow, HelpSection } from '@/components/ui/help-dialog';

// 材料毛利口径说明弹窗（product/生产与库存.md R-生产-004）：
// 三组 = 怎么算 / 为什么是快照 / 不含什么；只读，销售单详情 PC 与移动共用；
// 传入 costLayers 时追加「本次成本来源」完整明细（毛利卡内只内联前几层）。

export type SaleCostLayer = ApiSchemas['SaleOrderProfitDto']['costLayers'][number];

export function CostLayerRow({ layer }: { layer: SaleCostLayer }): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2 text-xs">
      <div className="min-w-0">
        <p className="truncate font-medium">{layer.batchCode || '负库存'}</p>
        <p className="mt-0.5 truncate text-muted-foreground">
          {layer.lengthMm}×{layer.widthMm}×{layer.heightMm} · {layer.unitCost} 元/m³
        </p>
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <p>{layer.volumeM3} m³</p>
        <p className="mt-0.5 text-muted-foreground">{layer.amount} 元</p>
      </div>
    </div>
  );
}

export function MaterialProfitHelpDialog({
  open,
  onOpenChange,
  costLayers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costLayers?: SaleCostLayer[];
}): React.ReactElement {
  return (
    <HelpDialogShell open={open} onOpenChange={onOpenChange} title="材料毛利口径说明">
      <HelpSection title="怎么算">
        <HelpRow label="确认收入">现结取实收金额，赊销取单据合计金额</HelpRow>
        <HelpRow label="材料成本">下单时按批次先进先出扣层，各层成本合计；单据上显示加权平均单价</HelpRow>
        <HelpRow label="材料毛利">确认收入 − 材料成本</HelpRow>
        <HelpRow label="毛利率">材料毛利 ÷ 确认收入；收入为 0 时显示「—」</HelpRow>
      </HelpSection>

      <HelpSection title="为什么是快照">
        <HelpRow label="锁定">成本在下单时锁定，之后采购、领用、产出、盘点怎么变，历史单都不改</HelpRow>
        <HelpRow label="来源批次">毛利卡可展开查看本单扣到的批次与各层金额，便于追溯成本来源</HelpRow>
        <HelpRow label="成本待补">
          下单时没有有效成本，先记「成本待补」、毛利留空；重算一次后即锁定，不能反复改
        </HelpRow>
      </HelpSection>

      <HelpSection title="不含什么">
        <HelpRow label="费用">不含人工、电费、房租、折旧，也不含销售费用</HelpRow>
        <HelpRow label="不是净额">不等于收支汇总的净额，也不是整厂利润率，只用于看单张单子的料本毛利</HelpRow>
        <HelpRow label="与库存">方木成本在产出时进入对应批次；销售出库按批次先进先出扣减，但不影响这张单已经锁定的成本</HelpRow>
      </HelpSection>

      {costLayers && costLayers.length > 0 ? (
        <HelpSection title={`本次成本来源（${costLayers.length} 层）`}>
          <div className="divide-y divide-border rounded-md border border-border">
            {costLayers.map((layer, index) => (
              <CostLayerRow key={`${layer.batchCode}-${index}`} layer={layer} />
            ))}
          </div>
        </HelpSection>
      ) : null}

      <p className="text-muted-foreground">
        这一页回答「这一单的料本赚了多少」；整体经营看收支汇总。
      </p>
    </HelpDialogShell>
  );
}
