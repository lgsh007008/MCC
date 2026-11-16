'use client';

import { ArrowDownToLineIcon, ArrowUpFromLineIcon, BoxesIcon, LayersIcon, ListChecksIcon } from 'lucide-react';
import { useCan } from '@/components/auth/permission-context';
import { MobileEntryCard } from '@/components/mobile/entry-card';
import { MobileHeader } from '@/components/mobile/mobile-shell';

// 生产二级入口（product/平台布局.md 移动页 · 入口）：与采购、资金二级入口同形，整卡可点；
// 卡片按 scope 裁剪（原木领用 / 方木产出 production:view；库存 / 库存盘点 inventory:view）。
export default function MobileProductionHomePage(): React.ReactElement {
  const canProduction = useCan('production:view');
  const canInventory = useCan('inventory:view');
  return (
    <div>
      <MobileHeader title="生产" backHref="/m" />
      <div className="space-y-4 p-4">
        {canProduction ? (
          <>
            <MobileEntryCard
              href="/m/production/batches"
              icon={LayersIcon}
              title="生产批次"
              description="批次成本 / 关闭批次"
            />
            <MobileEntryCard
              href="/m/production/issues"
              icon={ArrowDownToLineIcon}
              title="原木领用"
              description="领用原木 / 查看领用单"
            />
            <MobileEntryCard
              href="/m/production/outputs"
              icon={ArrowUpFromLineIcon}
              title="方木产出"
              description="登记产出 / 查看产出单"
            />
          </>
        ) : null}
        {canInventory ? (
          <>
            <MobileEntryCard
              href="/m/production/inventory"
              icon={BoxesIcon}
              title="库存"
              description="查库存 / 估值 / 期初"
            />
            <MobileEntryCard
              href="/m/production/inventory/counts"
              icon={ListChecksIcon}
              title="库存盘点"
              description="盘点记录 / 新建盘点"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
