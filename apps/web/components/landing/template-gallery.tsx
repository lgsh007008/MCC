'use client';

import * as React from 'react';
import { PALLET_TEMPLATE_OPTIONS } from '@mcc/shared';
import { DrawingView2D } from '@/components/packaging/drawing-view-2d';
import { buildDemoPallet, type DemoTemplate } from '@/lib/landing/demo';

// 模板画廊（product/落地页.md R-落地页-002）：
// 五种结构的默认尺寸轴测缩略图，点击后带入下方迷你工作台。
export function TemplateGallery({
  selected,
  onSelect,
}: {
  selected: DemoTemplate;
  onSelect: (value: DemoTemplate) => void;
}): React.ReactElement {
  const previews = React.useMemo(
    () =>
      PALLET_TEMPLATE_OPTIONS.map((option) => ({
        option,
        demo: buildDemoPallet(
          option.value,
          option.defaultLengthMm,
          option.defaultWidthMm,
        ),
      })),
    [],
  );

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {previews.map(({ option, demo }) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            data-testid={`gallery-${option.value}`}
            aria-pressed={active}
            onClick={() => onSelect(option.value)}
            className={`rounded-lg border p-2.5 text-left transition-colors ${
              active
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <div className="aspect-[4/3] w-full rounded-md bg-muted/50 p-1.5">
              <DrawingView2D
                geometry={demo.geometry}
                view="iso"
                selectedIndex={-1}
                mini
                viewBox={{ x: 0, y: 0, width: 1000, height: 560 }}
              />
            </div>
            <p className="mt-2 text-xs font-medium text-foreground">{option.label}</p>
            <p className="mt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
              {option.defaultLengthMm} × {option.defaultWidthMm} mm
            </p>
          </button>
        );
      })}
    </div>
  );
}
