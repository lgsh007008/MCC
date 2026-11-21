import { Boxes, ClipboardList, FileText, History, type LucideIcon } from 'lucide-react';
import { Reveal } from './reveal';

const FEATURES: Array<{
  no: string;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    no: '01',
    title: '参数化 2D / 3D',
    description: '调整尺寸即重算，轴测、三视图与三维视图使用同一份几何。',
    icon: Boxes,
  },
  {
    no: '02',
    title: '构件与料单',
    description: '构件表、BOM 与开料同源，减少手工统计与重复录入。',
    icon: ClipboardList,
  },
  {
    no: '03',
    title: '图纸与报告',
    description: '轴测、三视图与打印报告，方案完成后可直接交付。',
    icon: FileText,
  },
  {
    no: '04',
    title: '方案版本',
    description: '保存、复制、发布与版本管理，修改有迹可循。',
    icon: History,
  },
];

// 能力区（product/落地页.md R-落地页-001 / 004）：只讲当前真实能力，沿用平台浅色基线。
export function FeatureGrid(): React.ReactElement {
  return (
    <section id="features" className="scroll-mt-20 border-b border-border bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-[0.18em] text-primary uppercase">
              Capabilities
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-4xl">
              围绕木质包装的一条完整链路
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              从结构选择到图纸与材料清单，当前版本先做好包装设计这一件事。
            </p>
          </div>
        </Reveal>

        <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.no} delay={index * 70}>
                <div className="h-full rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {item.no}
                    </span>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
