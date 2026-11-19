'use client';

import * as React from 'react';
import { PACKAGING_UNIT_TYPE_LABELS, type PackagingUnitType } from '@mcc/shared';
import {
  createCrateDraft,
  createDividerDraft,
  createDunnageDraft,
  createFrameDraft,
  createPalletDraft,
  createSkidDraft,
  createSteelStrapDraft,
  type UnitDraft,
} from '@/lib/packaging/document';
import { buildGeometryForUnit } from '@/lib/packaging/geometry';
import { DrawingView2D } from './drawing-view-2d';

const SHOWCASE: Array<{ unitType: PackagingUnitType; create: () => UnitDraft }> = [
  { unitType: 'PALLET', create: () => createPalletDraft() },
  { unitType: 'CRATE', create: createCrateDraft },
  { unitType: 'SKID', create: createSkidDraft },
  { unitType: 'FRAME', create: createFrameDraft },
  { unitType: 'DIVIDER', create: createDividerDraft },
  { unitType: 'DUNNAGE', create: createDunnageDraft },
  { unitType: 'STEEL_STRAP', create: createSteelStrapDraft },
];

// 新建工作台的初始引导（design/包装设计.md §9.1）：只做提示与结构示例展示，
// 不在画布内提供选择；真正的类型 / 模板选择由左栏目录完成。
export function StartShowcase(): React.ReactElement {
  const items = React.useMemo(
    () =>
      SHOWCASE.map((item) => ({
        unitType: item.unitType,
        label: PACKAGING_UNIT_TYPE_LABELS[item.unitType],
        geometry: buildGeometryForUnit(item.create()),
      })),
    [],
  );

  return (
    <div className="scroll-area h-full overflow-y-auto overflow-x-hidden p-4">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2">
          <h2 className="text-base font-semibold">可用包装结构</h2>
          <p className="text-wb-meta text-muted-foreground">在左侧目录选择类型开始设计</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.unitType}
              className="pointer-events-none select-none rounded-lg border border-border bg-card p-1.5"
            >
              <div className="aspect-[4/3] overflow-hidden rounded-md bg-muted/20">
                <DrawingView2D
                  geometry={item.geometry}
                  view="iso"
                  selectedIndex={-1}
                  mini
                  viewBox={{ x: 0, y: 0, width: 1000, height: 750 }}
                />
              </div>
              <div className="truncate px-1 pt-1.5 pb-0.5 text-center text-xs text-muted-foreground">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
