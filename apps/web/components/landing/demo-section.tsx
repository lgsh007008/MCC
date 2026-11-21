'use client';

import * as React from 'react';
import { PALLET_TEMPLATE_OPTIONS } from '@mcc/shared';
import { TemplateGallery } from './template-gallery';
import { MiniWorkbench } from './mini-workbench';
import { buildDemoPallet, type DemoTemplate } from '@/lib/landing/demo';

// 在线工作台区块（product/落地页.md R-落地页-002 / design/落地页.md §7）：
// 模板画廊与迷你工作台共享同一份状态，点击画廊卡片会把结构带入下方工作台。
export function DemoSection(): React.ReactElement {
  const [template, setTemplate] = React.useState<DemoTemplate>('block');
  const [lengthMm, setLengthMm] = React.useState(1200);
  const [widthMm, setWidthMm] = React.useState(800);

  const demo = React.useMemo(
    () => buildDemoPallet(template, lengthMm, widthMm),
    [template, lengthMm, widthMm],
  );

  const chooseTemplate = React.useCallback((value: DemoTemplate): void => {
    setTemplate(value);
    const option = PALLET_TEMPLATE_OPTIONS.find((item) => item.value === value);
    if (option) {
      setLengthMm(option.defaultLengthMm);
      setWidthMm(option.defaultWidthMm);
    }
  }, []);

  const chooseFromGallery = (value: DemoTemplate): void => {
    chooseTemplate(value);
    window.requestAnimationFrame(() => {
      document.getElementById('workbench-demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <section
      id="workbench"
      className="scroll-mt-20 border-b border-border bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Online workbench
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
              不只是看图，直接改参数。
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              选一个结构，再拖长宽。二维、三维、结果数字与构件清单会一起变；打开全屏，就是一块可玩的工作台。
            </p>
          </div>
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
            模板 → 尺寸 → 3D → 清单
          </p>
        </div>

        <TemplateGallery selected={template} onSelect={chooseFromGallery} />

        <div id="workbench-demo" className="scroll-mt-24">
          <MiniWorkbench
            template={template}
            lengthMm={lengthMm}
            widthMm={widthMm}
            demo={demo}
            onTemplateChange={chooseTemplate}
            onLengthChange={setLengthMm}
            onWidthChange={setWidthMm}
          />
        </div>
      </div>
    </section>
  );
}
