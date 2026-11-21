'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, MousePointerClick } from 'lucide-react';
import { PALLET_TEMPLATE_OPTIONS } from '@mcc/shared';
import { PublicStage } from './public-stage';
import { buildDemoPallet, type DemoTemplate } from '@/lib/landing/demo';

// 首屏（product/落地页.md R-落地页-001 / 004）：
// 全浅色；右侧白卡中的 3D 画布是页面唯一的深色重点，品牌绿只用于主按钮与强调。
export function LandingHero(): React.ReactElement {
  const [template, setTemplate] = React.useState<DemoTemplate>('block');
  const demo = React.useMemo(() => {
    const option = PALLET_TEMPLATE_OPTIONS.find((item) => item.value === template);
    return buildDemoPallet(
      template,
      option?.defaultLengthMm ?? 1200,
      option?.defaultWidthMm ?? 800,
    );
  }, [template]);

  return (
    <section className="relative bg-background">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-12 md:grid-cols-[1.02fr_0.98fr] md:items-center md:gap-12 md:px-8 md:pb-24 md:pt-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
            木质包装 · 参数化设计
          </p>

          <h1 className="mt-6 text-3xl font-semibold leading-[1.15] tracking-tight text-foreground md:text-[3.4rem]">
            把包装方案，
            <br className="hidden md:block" />
            从尺寸直接做到图纸和料单。
          </h1>

          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground md:text-base md:leading-8">
            选择托盘结构、调整长宽，二维 / 三维视图、构件与木材料单同步重算。不是演示视频，是现在就能拖动的设计过程。
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              免费注册
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="#workbench"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-6 text-base text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              进入在线工作台
            </Link>
          </div>

          <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-5">
            <div>
              <dt className="text-[11px] text-muted-foreground">托盘结构</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">5 种</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">2D / 3D</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">同源重算</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">构件与料单</dt>
              <dd className="mt-1 text-lg font-semibold text-foreground">自动汇总</dd>
            </div>
          </dl>
        </div>

        <div className="relative">
          <div className="landing-float absolute -right-2 -top-3 z-20 hidden items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground md:inline-flex">
            <MousePointerClick className="size-3.5 text-primary" aria-hidden="true" />
            点胶囊换结构
          </div>
          <PublicStage
            demo={demo}
            template={template}
            onTemplateChange={setTemplate}
            showTemplates
            autoRotate
            label="在线演示 · 托盘"
            testId="hero-stage"
            stageClassName="aspect-[4/3] md:aspect-[16/11]"
          />
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            简化演示，只含托盘结构与尺寸；注册后使用完整工作台。
          </p>
        </div>
      </div>
    </section>
  );
}
