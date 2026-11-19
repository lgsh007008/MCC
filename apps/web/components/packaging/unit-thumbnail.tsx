'use client';

import * as React from 'react';
import type { ApiSchemas } from '@mcc/shared';
import { toUnitDraft } from '@/lib/packaging/document';
import { buildGeometryForUnit } from '@/lib/packaging/geometry';
import { DrawingView2D } from './drawing-view-2d';
import { UnitTypeIcon, type UnitTypeKey } from './unit-type-icon';

// 方案库卡片缩略图（design/包装设计.md §9.1）：用首单元数据走共享几何派生，
// 渲染不可交互的轴测图；数据缺失时回退为单元类型图标。
export function UnitThumbnail({
  unit,
  unitType,
}: {
  unit: ApiSchemas['PackagingUnitDto'] | null;
  unitType: string;
}): React.ReactElement {
  const geometry = React.useMemo(() => {
    if (!unit) return null;
    try {
      return buildGeometryForUnit(toUnitDraft(unit, 0));
    } catch {
      return null;
    }
  }, [unit]);

  return (
    <div className="relative aspect-video overflow-hidden bg-muted/30">
      {geometry && geometry.pieces.length > 0 ? (
        <DrawingView2D
          geometry={geometry}
          view="iso"
          selectedIndex={-1}
          mini
          viewBox={{ x: 0, y: 0, width: 1000, height: 560 }}
        />
      ) : (
        <div className="grid h-full place-items-center">
          <UnitTypeIcon
            unitType={unitType as UnitTypeKey}
            className="size-10 text-muted-foreground/50"
          />
        </div>
      )}
    </div>
  );
}
