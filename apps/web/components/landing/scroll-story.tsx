'use client';

import * as React from 'react';
import { PALLET_DEFAULT_MATERIALS } from '@mcc/shared';
import { DrawingView2D } from '@/components/packaging/drawing-view-2d';
import { formatDemoNumber, type DemoPallet } from '@/lib/landing/demo';

const STEPS = [
  {
    no: '01',
    tag: '结构',
    title: '先选结构，再定尺寸',
    description:
      '九墩块、纵梁、开槽、滑木、胶合板五种托盘结构。换结构时，构件组成与总高一起变，不需要手工拆算。',
  },
  {
    no: '02',
    tag: '图纸',
    title: '二维与三维，看同一份几何',
    description:
      '轴测、三视图与三维视图共用同一份构件数据。尺寸改一次，三个视图同时更新，不会对不上。',
  },
  {
    no: '03',
    tag: '清单',
    title: '构件与料单，随尺寸自动汇总',
    description:
      '每种构件的规格、数量、材料与体积重量自动生成，可直接用于报价、开料和交付沟通。',
  },
] as const;

function materialName(code: string): string {
  return PALLET_DEFAULT_MATERIALS.find((item) => item.code === code)?.name ?? code;
}

function BomRows({ demo, compact = false }: { demo: DemoPallet; compact?: boolean }): React.ReactElement {
  const rows = compact ? demo.components.slice(0, 3) : demo.components.slice(0, 6);
  const hidden = demo.components.length - rows.length;
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">构件</th>
            <th className="px-3 py-2 font-medium">规格 mm</th>
            <th className="px-3 py-2 font-medium">数量</th>
            <th className="px-3 py-2 font-medium">材料</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((item, index) => (
            <tr key={`${item.name}-${item.role}-${index}`}>
              <td className="px-3 py-2">{item.name}</td>
              <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                {item.lengthMm}×{item.widthMm}×{item.heightMm}
              </td>
              <td className="px-3 py-2 font-mono tabular-nums">{item.quantity}</td>
              <td className="px-3 py-2 text-muted-foreground">{materialName(item.materialCode)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        共 {demo.components.length} 种构件 · {demo.geometry.pieces.length} 件
        {hidden > 0 ? ` · 还有 ${hidden} 种未展开` : ''}
        {' · '}
        净体积 {formatDemoNumber(demo.bom.netVolumeM3, 3)} m³
      </p>
    </div>
  );
}

function StagePanel({ active, demo }: { active: number; demo: DemoPallet }): React.ReactElement {
  const step = STEPS[active] ?? STEPS[0];
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs">
        <span className="inline-flex items-center gap-2 font-medium text-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
            STEP {step.no}
          </span>
          {step.tag}
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {demo.geometry.L} × {demo.geometry.W} × {demo.geometry.H} mm
        </span>
      </div>
      <div className="p-4">
        <div key={active} className="landing-swap">
          {active === 2 ? (
            <BomRows demo={demo} />
          ) : (
            <div className="aspect-[16/10] w-full">
              <DrawingView2D
                geometry={demo.geometry}
                view={active === 1 ? 'three' : 'iso'}
                selectedIndex={-1}
                viewBox={{ x: 0, y: 0, width: 1000, height: 560 }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 滚动三步叙事（product/落地页.md R-落地页-001 / design/落地页.md §6）：
// 桌面左侧 sticky 舞台随右侧步骤切换，手机逐条展开；不加载 three.js。
export function ScrollStory({ demo }: { demo: DemoPallet }): React.ReactElement {
  const [active, setActive] = React.useState(0);
  const stepRefs = React.useRef<Array<HTMLLIElement | null>>([]);

  React.useEffect(() => {
    const elements = stepRefs.current.filter((item): item is HTMLLIElement => item !== null);
    if (elements.length === 0) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          const index = elements.indexOf(entry.target as HTMLLIElement);
          if (index >= 0) {
            setActive(index);
          }
        }
      },
      { rootMargin: '-42% 0px -42% 0px', threshold: 0 },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <section id="flow" className="scroll-mt-20 border-y border-border bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
            Design flow
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
            一张托盘，从结构到料单只走三步。
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            向下滚动看每一步对应的工作台画面；手机上按顺序逐条展开。
          </p>
        </div>

        <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] md:gap-14">
          <div className="hidden md:block">
            <div className="sticky top-24">
              <StagePanel active={active} demo={demo} />
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                2D 图纸与 3D 共用同一份构件数据
              </p>
            </div>
          </div>

          <ol>
            {STEPS.map((step, index) => (
              <li
                key={step.no}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
                className="md:flex md:min-h-[58vh] md:flex-col md:justify-center"
              >
                <div className="rounded-lg border border-border bg-card p-5 md:border-0 md:bg-transparent md:p-0">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs tabular-nums text-primary">{step.no}</span>
                    <h3 className="text-lg font-semibold text-foreground md:text-xl">
                      {step.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">
                    {step.description}
                  </p>

                  <div className="mt-4 md:hidden">
                    {index === 2 ? (
                      <BomRows demo={demo} compact />
                    ) : (
                      <div className="aspect-[16/10] w-full rounded-md border border-border bg-card p-2">
                        <DrawingView2D
                          geometry={demo.geometry}
                          view={index === 1 ? 'three' : 'iso'}
                          selectedIndex={-1}
                          mini
                          viewBox={{ x: 0, y: 0, width: 1000, height: 560 }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
