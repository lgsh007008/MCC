'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PALLET_TEMPLATE_OPTIONS } from '@mcc/shared';
import { DrawingView2D } from '@/components/packaging/drawing-view-2d';
import { PublicStage } from '@/components/landing/public-stage';
import { buildDemoPallet, type DemoTemplate } from '@/lib/landing/demo';

export interface AuthShellProps {
  title: string;
  subtitle: string;
  /** 右侧舞台标题与说明 */
  asideTitle: string;
  asideDescription: string;
  stageLabel: string;
  stageTestId: string;
  /** 表单与表单下方链接 */
  children: React.ReactNode;
  footer: React.ReactNode;
  /** 表单下方的轻量能力说明 */
  features?: readonly string[];
}

// 登录 / 注册共用外壳（design/账号与权限.md §7、design/落地页.md §8）：
// 全浅色；桌面左表单、右浅灰面板 + 深色 3D 画布，手机表单优先、不加载 3D。
export function AuthShell({
  title,
  subtitle,
  asideTitle,
  asideDescription,
  stageLabel,
  stageTestId,
  children,
  footer,
  features = [],
}: AuthShellProps): React.ReactElement {
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
    <main
      data-landing
      className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]"
    >
      <section className="flex min-h-screen flex-col px-5 py-6 md:px-10 lg:px-12 lg:py-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              梅
            </span>
            梅好木业
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            返回首页
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-muted/40 p-3 lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
              木质包装 · 参数化设计
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              从尺寸直接做到图纸和料单
            </p>
          </div>
          <div className="h-16 w-24 shrink-0 rounded-md bg-muted/60">
            <DrawingView2D
              geometry={demo.geometry}
              view="iso"
              selectedIndex={-1}
              mini
              viewBox={{ x: 0, y: 0, width: 1000, height: 560 }}
            />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-col pb-8 pt-6 lg:my-auto lg:py-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

          <div className="mt-7">{children}</div>

          <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>

          {features.length > 0 ? (
            <ul className="mt-8 space-y-2.5 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
              {features.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="hidden text-[11px] text-muted-foreground lg:block">
          © 2026 梅好木业 · 木质包装参数化设计
        </p>
      </section>

      <aside className="hidden border-l border-border bg-muted/30 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-center lg:px-10 lg:py-12 xl:px-16">
        <div className="mx-auto w-full max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
            <span className="landing-pulse size-1.5 rounded-full bg-primary" aria-hidden="true" />
            Live demo
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground xl:text-3xl">
            {asideTitle}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-7 text-muted-foreground">
            {asideDescription}
          </p>

          <PublicStage
            demo={demo}
            template={template}
            onTemplateChange={setTemplate}
            showTemplates
            autoRotate
            label={stageLabel}
            testId={stageTestId}
            className="mt-6"
            stageClassName="aspect-[16/11]"
          />
          <p className="mt-3 text-[11px] text-muted-foreground">
            演示只读、不产生方案；登录后按视口进入包装设计工作台或移动端。
          </p>
        </div>
      </aside>
    </main>
  );
}
