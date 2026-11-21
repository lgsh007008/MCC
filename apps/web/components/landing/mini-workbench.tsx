'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Maximize2, X } from 'lucide-react';
import { PALLET_DEFAULT_MATERIALS, PALLET_TEMPLATE_OPTIONS } from '@mcc/shared';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { PublicStage } from './public-stage';
import {
  DEMO_LENGTH_RANGE,
  DEMO_WIDTH_RANGE,
  formatDemoNumber,
  type DemoPallet,
  type DemoTemplate,
} from '@/lib/landing/demo';

interface MiniWorkbenchProps {
  template: DemoTemplate;
  lengthMm: number;
  widthMm: number;
  demo: DemoPallet;
  onTemplateChange: (value: DemoTemplate) => void;
  onLengthChange: (value: number) => void;
  onWidthChange: (value: number) => void;
}

function materialName(code: string): string {
  return PALLET_DEFAULT_MATERIALS.find((item) => item.code === code)?.name ?? code;
}

function DimensionSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  const id = React.useId();
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <span className="font-mono tabular-nums text-muted-foreground">{value} mm</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-11 w-full accent-primary"
      />
    </div>
  );
}

function TemplateList({
  template,
  onTemplateChange,
}: Pick<MiniWorkbenchProps, 'template' | 'onTemplateChange'>): React.ReactElement {
  return (
    <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2 lg:block lg:space-y-1 lg:overflow-visible">
      <p className="hidden px-2 pb-1 pt-0.5 text-[11px] text-muted-foreground lg:block">
        结构模板
      </p>
      {PALLET_TEMPLATE_OPTIONS.map((option) => {
        const active = option.value === template;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onTemplateChange(option.value)}
            className={`min-h-11 shrink-0 rounded-md px-3 py-2 text-left transition-colors lg:w-full ${
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <span className="block text-xs font-medium">{option.label}</span>
            <span className="mt-0.5 block font-mono text-[10px] tabular-nums opacity-70">
              {option.defaultLengthMm} × {option.defaultWidthMm} mm
            </span>
          </button>
        );
      })}
    </div>
  );
}

function BomTable({
  demo,
  testId,
}: {
  demo: DemoPallet;
  testId: string;
}): React.ReactElement {
  return (
    <div data-testid={testId} className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs">
        <span className="font-medium text-foreground">构件清单</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {demo.components.length} 种 · {demo.geometry.pieces.length} 件 ·{' '}
          {formatDemoNumber(demo.bom.netVolumeM3, 3)} m³
        </span>
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">构件</th>
              <th className="px-4 py-2 font-medium">规格 mm</th>
              <th className="px-4 py-2 font-medium">数量</th>
              <th className="px-4 py-2 font-medium">材料</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {demo.components.map((item, index) => (
              <tr key={`${item.name}-${item.role}-${index}`}>
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2 font-mono tabular-nums text-muted-foreground">
                  {item.lengthMm}×{item.widthMm}×{item.heightMm}
                </td>
                <td className="px-4 py-2 font-mono tabular-nums">{item.quantity}</td>
                <td className="px-4 py-2 text-muted-foreground">
                  {materialName(item.materialCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WorkbenchPanel({
  template,
  lengthMm,
  widthMm,
  demo,
  onTemplateChange,
  onLengthChange,
  onWidthChange,
  variant,
  autoRotate,
  suspend3d = false,
}: MiniWorkbenchProps & {
  variant: 'inline' | 'fullscreen';
  autoRotate: boolean;
  suspend3d?: boolean;
}): React.ReactElement {
  const templateLabel =
    PALLET_TEMPLATE_OPTIONS.find((item) => item.value === template)?.label ?? template;
  const fullscreen = variant === 'fullscreen';

  return (
    <div>
      <div
        className={`grid min-w-0 gap-3 ${
          fullscreen
            ? 'lg:grid-cols-[210px_minmax(0,1fr)_260px]'
            : 'lg:grid-cols-[180px_minmax(0,1fr)_230px]'
        }`}
      >
        <TemplateList template={template} onTemplateChange={onTemplateChange} />

        <PublicStage
          demo={demo}
          showViewToggle
          showStats={false}
          autoRotate={autoRotate}
          enableMobile3d={fullscreen}
          suspend3d={suspend3d}
          label={fullscreen ? '全屏体验 · 托盘' : '托盘工作台'}
          testId={fullscreen ? 'fullscreen-stage' : 'workbench-stage'}
          className="min-w-0"
          stageClassName={
            fullscreen ? 'aspect-[4/3] lg:aspect-[16/9]' : 'aspect-[4/3] lg:aspect-[16/10]'
          }
        />

        <div className="min-w-0 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-foreground">尺寸参数</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              实时
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{templateLabel}</p>

          <div className="mt-4 space-y-3">
            <DimensionSlider
              label="长度"
              value={lengthMm}
              min={DEMO_LENGTH_RANGE.min}
              max={DEMO_LENGTH_RANGE.max}
              step={DEMO_LENGTH_RANGE.step}
              onChange={onLengthChange}
            />
            <DimensionSlider
              label="宽度"
              value={widthMm}
              min={DEMO_WIDTH_RANGE.min}
              max={DEMO_WIDTH_RANGE.max}
              step={DEMO_WIDTH_RANGE.step}
              onChange={onWidthChange}
            />
          </div>

          <dl className="mt-4 space-y-2 border-t border-border pt-3 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">外形尺寸</dt>
              <dd className="font-mono tabular-nums">
                {demo.geometry.L} × {demo.geometry.W} × {demo.geometry.H} mm
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">净体积</dt>
              <dd className="font-mono tabular-nums">
                {formatDemoNumber(demo.bom.netVolumeM3, 3)} m³
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted-foreground">重量</dt>
              <dd className="font-mono tabular-nums">
                {formatDemoNumber(demo.bom.weightKg, 1)} kg
              </dd>
            </div>
          </dl>

          <Link
            href="/register"
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            免费注册，使用完整工作台
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            简化演示：不保存、不导出；注册后可出图纸与材料清单。
          </p>
        </div>
      </div>

      <div className="mt-3">
        <BomTable demo={demo} testId={fullscreen ? 'demo-bom-fullscreen' : 'demo-bom'} />
      </div>
    </div>
  );
}

// 迷你工作台（product/落地页.md R-落地页-002 / design/落地页.md §7）：
// 左模板 / 中舞台 / 右参数 / 下构件清单；全屏只放大同一份演示状态。
export function MiniWorkbench(props: MiniWorkbenchProps): React.ReactElement {
  const [fullscreen, setFullscreen] = React.useState(false);

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">
          当前结构：{props.demo.geometry.L} × {props.demo.geometry.W} × {props.demo.geometry.H} mm
        </p>
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40"
        >
          <Maximize2 className="size-3.5" aria-hidden="true" />
          全屏体验
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3 md:p-4">
        <WorkbenchPanel {...props} variant="inline" autoRotate={!fullscreen} suspend3d={fullscreen} />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent
          data-landing
          showCloseButton={false}
          className="top-0 left-0 z-[60] h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 grid-cols-1 gap-0 overflow-hidden rounded-none border-0 bg-background p-0 text-foreground sm:max-w-none"
        >
          <DialogTitle className="sr-only">在线工作台 · 托盘演示</DialogTitle>
          <DialogDescription className="sr-only">
            全屏查看托盘结构、尺寸参数、三维视图与构件清单；按 ESC 关闭。
          </DialogDescription>
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
              <div>
                <p className="text-sm font-semibold text-foreground">在线工作台 · 托盘演示</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  参数与清单实时联动；按 ESC 关闭
                </p>
              </div>
              <DialogClose className="inline-flex h-11 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/40">
                <X className="size-4" aria-hidden="true" />
                关闭
              </DialogClose>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 md:p-6">
              <WorkbenchPanel {...props} variant="fullscreen" autoRotate />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
