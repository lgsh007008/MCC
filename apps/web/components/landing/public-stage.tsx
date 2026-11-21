'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { Play, Rotate3d } from 'lucide-react';
import { PALLET_TEMPLATE_OPTIONS } from '@mcc/shared';
import { DrawingView2D } from '@/components/packaging/drawing-view-2d';
import { formatDemoNumber, type DemoPallet, type DemoTemplate } from '@/lib/landing/demo';

const Stage3D = dynamic(() => import('./stage-3d'), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-xs text-background/60">
      正在加载 3D…
    </div>
  ),
});

type ViewMode = '2d' | '3d';

export interface PublicStageProps {
  demo: DemoPallet;
  template?: DemoTemplate;
  onTemplateChange?: (value: DemoTemplate) => void;
  /** 顶栏下方的结构胶囊，首屏使用 */
  showTemplates?: boolean;
  /** 2D / 3D 页签，工作台使用 */
  showViewToggle?: boolean;
  showStats?: boolean;
  /** 桌面进入视口后缓慢自动旋转；手机始终先出 2D 海报 */
  autoRotate?: boolean;
  /** 手机也允许自动加载 3D（全屏体验等用户主动打开的场景） */
  enableMobile3d?: boolean;
  /** 临时暂停 3D（全屏浮层打开时，内联舞台退回海报，避免第三个 WebGL 上下文） */
  suspend3d?: boolean;
  label?: string;
  className?: string;
  /** 画布区域宽高比，默认 16:10 */
  stageClassName?: string;
  testId?: string;
}

// 公共托盘舞台（design/落地页.md §4 / §5）：
// 白卡 + 深色 3D 画布；2D 海报使用浅灰底，深色只作为 3D 视图的重点点缀。
// 桌面进入视口后懒加载 3D，手机点击「看 3D」再加载；离开视口或减少动态效果时停止旋转。
export function PublicStage({
  demo,
  template,
  onTemplateChange,
  showTemplates = false,
  showViewToggle = false,
  showStats = true,
  autoRotate = true,
  enableMobile3d = false,
  suspend3d = false,
  label = '实时演示',
  className,
  stageClassName = 'aspect-[16/10]',
  testId,
}: PublicStageProps): React.ReactElement {
  const [view, setView] = React.useState<ViewMode>('3d');
  const [load3d, setLoad3d] = React.useState(false);
  const [manual3d, setManual3d] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const [inView, setInView] = React.useState(false);
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [reducedMotion, setReducedMotion] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const desktop = window.matchMedia('(min-width: 768px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = (): void => {
      setIsDesktop(desktop.matches);
      setReducedMotion(motion.matches);
    };
    sync();
    desktop.addEventListener('change', sync);
    motion.addEventListener('change', sync);
    return () => {
      desktop.removeEventListener('change', sync);
      motion.removeEventListener('change', sync);
    };
  }, []);

  React.useEffect(() => {
    const element = rootRef.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if ((isDesktop || enableMobile3d) && inView && view === '3d' && !fallback) {
      setLoad3d(true);
    }
  }, [isDesktop, enableMobile3d, inView, view, fallback]);

  const show3d =
    !suspend3d &&
    view === '3d' &&
    load3d &&
    (isDesktop || manual3d || enableMobile3d) &&
    !fallback;
  const spinning = autoRotate && inView && !reducedMotion && show3d;

  const open3d = (): void => {
    setView('3d');
    setManual3d(true);
    setLoad3d(true);
  };

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      data-auto-rotate={spinning ? 'true' : 'false'}
      className={`overflow-hidden rounded-lg border border-border bg-card ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-4">
        <span className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          <span className="landing-pulse size-1.5 rounded-full bg-primary" />
          {label}
        </span>
        {showViewToggle ? (
          <div
            role="tablist"
            aria-label="预览视图"
            className="inline-flex rounded-full border border-border p-0.5"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === '2d'}
              onClick={() => setView('2d')}
              className={`inline-flex h-11 items-center rounded-full px-3 text-xs transition-colors md:h-8 ${
                view === '2d'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              2D 轴测
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === '3d'}
              onClick={open3d}
              className={`inline-flex h-11 items-center rounded-full px-3 text-xs transition-colors md:h-8 ${
                view === '3d'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              3D 视图
            </button>
          </div>
        ) : (
          <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:inline-flex">
            <Rotate3d className="size-3.5" aria-hidden="true" />
            自动旋转 · 可拖动
          </span>
        )}
      </div>

      {showTemplates && onTemplateChange ? (
        <div
          role="group"
          aria-label="结构模板"
          className="mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1"
        >
          {PALLET_TEMPLATE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={template === option.value}
              onClick={() => onTemplateChange(option.value)}
              className={`inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-xs transition-colors md:h-8 md:px-3 ${
                template === option.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div
        className={`relative mt-3 w-full overflow-hidden ${
          show3d ? 'bg-foreground' : 'bg-muted/40'
        } ${stageClassName}`}
      >
        {show3d ? (
          <div className="landing-stage-grid pointer-events-none absolute inset-0" aria-hidden="true" />
        ) : null}

        {show3d ? (
          <Stage3D
            geometry={demo.geometry}
            autoRotate={spinning}
            onFallback={() => {
              setFallback(true);
              setView('2d');
            }}
          />
        ) : (
          <div aria-label="托盘二维轴测图" className="h-full w-full">
            <DrawingView2D
              geometry={demo.geometry}
              view="iso"
              selectedIndex={-1}
              mini
              viewBox={{ x: 0, y: 0, width: 1000, height: 640 }}
            />
          </div>
        )}

        {show3d ? (
          <div className="pointer-events-none absolute inset-4 hidden md:block" aria-hidden="true">
            <span className="absolute left-0 top-0 border-l border-t border-background/20 pl-2 pt-1 font-mono text-[11px] tabular-nums text-background/55">
              长 {demo.geometry.L} mm
            </span>
            <span className="absolute bottom-0 left-0 border-b border-l border-background/20 pb-1 pl-2 font-mono text-[11px] tabular-nums text-background/55">
              宽 {demo.geometry.W} mm
            </span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2 border-r border-background/20 pr-2 font-mono text-[11px] tabular-nums text-background/55">
              高 {demo.geometry.H} mm
            </span>
          </div>
        ) : null}

        {!show3d && !fallback && !isDesktop ? (
          <button
            type="button"
            onClick={open3d}
            className="absolute bottom-3 left-1/2 inline-flex h-11 -translate-x-1/2 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:hidden"
          >
            <Play className="size-4" aria-hidden="true" />
            看 3D
          </button>
        ) : null}

        {fallback ? (
          <p className="absolute inset-x-3 bottom-3 rounded-md border border-border bg-background px-3 py-2 text-center text-xs text-foreground">
            当前浏览器不支持 3D，已切换为轴测图。
          </p>
        ) : null}
      </div>

      {showStats ? (
        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border text-center md:grid-cols-4">
          <div className="bg-card px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">外形尺寸</dt>
            <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
              {demo.geometry.L} × {demo.geometry.W} × {demo.geometry.H} mm
            </dd>
          </div>
          <div className="bg-card px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">净体积</dt>
            <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
              {formatDemoNumber(demo.bom.netVolumeM3, 3)} m³
            </dd>
          </div>
          <div className="bg-card px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">重量</dt>
            <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
              {formatDemoNumber(demo.bom.weightKg, 1)} kg
            </dd>
          </div>
          <div className="bg-card px-2 py-2.5">
            <dt className="text-[11px] text-muted-foreground">构件数</dt>
            <dd className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
              {demo.geometry.pieces.length} 件
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
