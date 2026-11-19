'use client';

import * as React from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  BoxesIcon,
  FileTextIcon,
  HistoryIcon,
  PackageIcon,
  ShieldCheckIcon,
  XIcon,
} from 'lucide-react';
import {
  PACKAGING_CONCLUSION_LABELS,
  PALLET_ROLE_LABELS,
  type ApiSchemas,
  type PackagingConclusion,
  type PalletBom,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { ProjectState, UnitDraft, UnitIssues } from '@/lib/packaging/document';
import { PanelHandle } from './panel-handle';

export type InspectorTab = 'project' | 'part' | 'validation' | 'revisions';

interface InspectorProps {
  tab: InspectorTab;
  width: number;
  onWidthChange: (width: number) => void;
  onTabChange: (tab: InspectorTab) => void;
  project: ProjectState;
  projectCode: string;
  unit: UnitDraft;
  materials: PalletMaterialLike[];
  bom: PalletBom;
  editable: boolean;
  selectedPartIndex: number;
  issues: UnitIssues;
  conclusion: PackagingConclusion;
  revisions: ApiSchemas['PackagingRevisionDto'][];
  revisionsLoading: boolean;
  onUpdateProject: (patch: Partial<ProjectState>) => void;
  onUpdatePart: (index: number, patch: Partial<PalletComponentInput>) => void;
  onSelectPart: (index: number) => void;
  onOpenRevision: (revisionNo: number) => void;
  onCollapse: () => void;
}

const TABS: Array<{ value: InspectorTab; label: string; icon: typeof FileTextIcon }> = [
  { value: 'project', label: '方案', icon: FileTextIcon },
  { value: 'part', label: '构件', icon: BoxesIcon },
  { value: 'validation', label: '校验', icon: ShieldCheckIcon },
  { value: 'revisions', label: '版本', icon: HistoryIcon },
];

// 右栏宽度（design/包装设计.md §9.2）：默认 320，可拖宽 280–520。
const clampWidth = (value: number): number => Math.min(520, Math.max(280, value));

const roleOptions = (Object.keys(PALLET_ROLE_LABELS) as PalletComponentRole[]).map((role) => ({
  value: role,
  label: PALLET_ROLE_LABELS[role],
}));

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mb-4 last:mb-0">
      <div className="mb-2 flex items-center gap-2 text-wb-body font-semibold text-foreground">
        <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-primary" />
        {title}
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-2">
      <span className="text-wb-meta text-foreground/70">{label}</span>
      {children}
    </label>
  );
}

function NumberField({
  label,
  value,
  disabled,
  min = 0,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  min?: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        disabled={disabled}
        className="h-8 text-wb-body"
      />
    </Field>
  );
}

function TotalsList({ bom }: { bom: PalletBom }): React.ReactElement {
  const rows = [
    { label: '采购体积', value: `${bom.grossVolumeM3.toFixed(3)} m³` },
    { label: '估算重量', value: `${bom.weightKg.toFixed(1)} kg` },
    { label: '材料费', value: `¥${bom.materialCost.toFixed(2)}` },
    { label: '加工费', value: `¥${bom.processCost.toFixed(2)}` },
  ];
  return (
    <div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 text-wb-meta text-muted-foreground last:border-b-0"
        >
          <span>{row.label}</span>
          <b className="text-wb-body font-semibold tabular-nums text-foreground">{row.value}</b>
        </div>
      ))}
    </div>
  );
}

// 右侧工具面板（product/包装设计.md R-包装设计-006 · 右侧工具面板 / design §9.2）：
// 固定 4 个标签（方案 / 构件 / 校验 / 版本），无 ×；左边缘 / 把手可拖宽，点击把手收起。
export function Inspector({
  tab,
  width,
  onWidthChange,
  onTabChange,
  project,
  projectCode,
  unit,
  materials,
  bom,
  editable,
  selectedPartIndex,
  issues,
  conclusion,
  revisions,
  revisionsLoading,
  onUpdateProject,
  onUpdatePart,
  onSelectPart,
  onOpenRevision,
  onCollapse,
}: InspectorProps): React.ReactElement {
  const drag = React.useRef<{ startX: number; startWidth: number; fromHandle: boolean } | null>(
    null,
  );
  const moved = React.useRef(false);
  const part = selectedPartIndex >= 0 ? unit.parts[selectedPartIndex] : undefined;
  const materialOptions = materials.map((material) => ({
    value: material.code,
    label: material.name,
  }));
  const totalQty = unit.parts.reduce((sum, item) => sum + item.quantity, 0);
  const conclusionTone =
    conclusion.level === 'excellent'
      ? {
          border: 'border-success-border',
          bg: 'bg-success-bg',
          text: 'text-success',
        }
      : conclusion.level === 'available'
        ? {
            border: 'border-warning-border',
            bg: 'bg-warning-bg',
            text: 'text-warning',
          }
        : {
            border: 'border-destructive/40',
            bg: 'bg-destructive/10',
            text: 'text-destructive',
          };
  const ConclusionIcon =
    conclusion.level === 'excellent'
      ? CheckCircle2Icon
      : conclusion.level === 'available'
        ? AlertTriangleIcon
        : XIcon;

  return (
    <aside
      aria-label="工具面板"
      className="relative flex h-full w-full min-w-0 flex-col overflow-hidden border-l border-border bg-card"
      onPointerDown={(event) => {
        const target = event.target;
        const fromHandle =
          target instanceof Element && Boolean(target.closest('[data-panel-handle]'));
        const rect = event.currentTarget.getBoundingClientRect();
        // 左边缘 6px（tab 栏以下）或把手按下进入拖宽；其余区域不拦截
        const nearEdge = event.clientX - rect.left <= 6 && event.clientY - rect.top > 40;
        if (!fromHandle && !nearEdge) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width, fromHandle };
        moved.current = false;
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        if (Math.abs(event.clientX - drag.current.startX) > 4) moved.current = true;
        onWidthChange(clampWidth(drag.current.startWidth + drag.current.startX - event.clientX));
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current) return;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (current.fromHandle && !moved.current) onCollapse();
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 top-10 z-10 w-1.5 cursor-col-resize"
      />
      <div className="flex h-10 shrink-0 items-stretch border-b border-border">
        {TABS.map((item) => {
          const active = item.value === tab;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(item.value)}
              className={cn(
                'flex min-w-0 flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-wb-body transition-colors',
                active
                  ? 'border-primary font-semibold text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-[13px] shrink-0" />
              <span className="truncate">{item.label}</span>
              {item.value === 'validation' && (issues.length > 0 || conclusion.level === 'adjust') ? (
                <span className="size-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {tab === 'project' ? (
          <>
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <b className="text-wb-body font-semibold">方案信息</b>
              <span className="font-mono text-wb-meta text-muted-foreground">{projectCode}</span>
            </div>
            <Section title="基本信息">
              <Field label="客户名称">
                <Input
                  value={project.customerName}
                  onChange={(event) => onUpdateProject({ customerName: event.target.value })}
                  disabled={!editable}
                  maxLength={100}
                  className="h-8 text-wb-body"
                />
              </Field>
              <Field label="使用范围">
                <Select
                  value={project.destination}
                  onChange={(value) =>
                    onUpdateProject({ destination: value as ProjectState['destination'] })
                  }
                  options={[
                    { value: 'export', label: '出口' },
                    { value: 'domestic', label: '内销' },
                  ]}
                  disabled={!editable}
                  ariaLabel="使用范围"
                  className="h-8 text-wb-body"
                />
              </Field>
              <Field label="备注">
                <Textarea
                  value={project.note}
                  onChange={(event) => onUpdateProject({ note: event.target.value })}
                  disabled={!editable}
                  maxLength={500}
                  rows={3}
                  className="text-wb-body"
                />
              </Field>
            </Section>
            <Section title="当前单元合计">
              <TotalsList bom={bom} />
            </Section>
          </>
        ) : null}

        {tab === 'part' ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <b className="text-wb-body font-semibold">构件</b>
              <span className="text-wb-meta text-muted-foreground">
                {unit.parts.length} 类 · {totalQty} 件
              </span>
            </div>
            <div className="mb-3 flex items-center gap-0.5 overflow-x-auto border-b border-border">
              {unit.parts.map((item, index) => {
                const active = index === selectedPartIndex;
                return (
                  <button
                    key={`picker-${item.role}-${index}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectPart(index)}
                    className={cn(
                      'flex shrink-0 items-center gap-1 border-b-2 px-2 py-1.5 text-wb-meta transition-colors',
                      active
                        ? 'border-primary font-semibold text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {PALLET_ROLE_LABELS[item.role] ?? item.name}
                    <em className="font-mono text-wb-meta not-italic text-muted-foreground">
                      {item.quantity}
                    </em>
                  </button>
                );
              })}
            </div>
            {part ? (
              <>
                <Section title="基本">
                  <Field label="构件类型">
                    <Select
                      value={part.role}
                      onChange={(value) =>
                        onUpdatePart(selectedPartIndex, { role: value as PalletComponentRole })
                      }
                      options={roleOptions}
                      disabled={!editable}
                      ariaLabel="构件类型"
                      className="h-8 text-wb-body"
                    />
                  </Field>
                  <Field label="名称">
                    <Input
                      value={part.name}
                      onChange={(event) =>
                        onUpdatePart(selectedPartIndex, { name: event.target.value })
                      }
                      disabled={!editable}
                      maxLength={50}
                      className="h-8 text-wb-body"
                    />
                  </Field>
                  <Field label="材料">
                    <Select
                      value={part.materialCode}
                      onChange={(value) => onUpdatePart(selectedPartIndex, { materialCode: value })}
                      options={materialOptions}
                      disabled={!editable}
                      ariaLabel="材料"
                      className="h-8 text-wb-body"
                    />
                  </Field>
                  <Field label="方向">
                    <Select
                      value={part.orientation}
                      onChange={(value) =>
                        onUpdatePart(selectedPartIndex, {
                          orientation: value === 'y' ? 'y' : 'x',
                        })
                      }
                      options={[
                        { value: 'x', label: '沿长度（x）' },
                        { value: 'y', label: '沿宽度（y）' },
                      ]}
                      disabled={!editable}
                      ariaLabel="方向"
                      className="h-8 text-wb-body"
                    />
                  </Field>
                </Section>
                <Section title="尺寸与用量">
                  <div className="grid grid-cols-3 gap-2">
                    <NumberField
                      label="长 mm"
                      value={part.lengthMm}
                      min={1}
                      disabled={!editable}
                      onChange={(value) => onUpdatePart(selectedPartIndex, { lengthMm: value })}
                    />
                    <NumberField
                      label="宽 mm"
                      value={part.widthMm}
                      min={1}
                      disabled={!editable}
                      onChange={(value) => onUpdatePart(selectedPartIndex, { widthMm: value })}
                    />
                    <NumberField
                      label="厚 mm"
                      value={part.heightMm}
                      min={1}
                      disabled={!editable}
                      onChange={(value) => onUpdatePart(selectedPartIndex, { heightMm: value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <NumberField
                      label="数量"
                      value={part.quantity}
                      min={1}
                      disabled={!editable}
                      onChange={(value) => onUpdatePart(selectedPartIndex, { quantity: value })}
                    />
                    <NumberField
                      label="损耗 %"
                      value={Math.round(part.wastePct * 100)}
                      disabled={!editable}
                      onChange={(value) =>
                        onUpdatePart(selectedPartIndex, { wastePct: value / 100 })
                      }
                    />
                  </div>
                </Section>
                <Section title="费用">
                  <NumberField
                    label="加工费（元/件）"
                    value={part.processCost}
                    disabled={!editable}
                    onChange={(value) => onUpdatePart(selectedPartIndex, { processCost: value })}
                  />
                  <NumberField
                    label="单价覆盖（元/m³）"
                    value={part.priceOverride}
                    disabled={!editable}
                    onChange={(value) => onUpdatePart(selectedPartIndex, { priceOverride: value })}
                  />
                </Section>
              </>
            ) : (
              <div className="grid place-items-center gap-2 px-4 py-10 text-center text-wb-meta text-muted-foreground">
                <PackageIcon className="size-6 text-muted-foreground/60" />
                <div>尚未选择构件</div>
                <div>在画布中点击构件，或在底部构件表中选择</div>
              </div>
            )}
          </>
        ) : null}

        {tab === 'validation' ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <b className="text-wb-body font-semibold">校验</b>
              <span className="text-wb-meta text-muted-foreground">{issues.length} 项提示</span>
            </div>
            <div
              className={cn(
                'mb-3 rounded-lg border px-3 py-2.5',
                conclusionTone.border,
                conclusionTone.bg,
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 text-wb-body font-semibold',
                    conclusionTone.text,
                  )}
                >
                  <ConclusionIcon className="size-4" />
                  {PACKAGING_CONCLUSION_LABELS[conclusion.level]}
                </span>
                <span
                  className={cn(
                    'text-wb-meta tabular-nums',
                    conclusionTone.text,
                  )}
                >
                  {conclusion.areaLoadKgM2 === null
                    ? '未评估'
                    : `${conclusion.areaLoadKgM2.toFixed(1)} kg/m²`}
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-1 text-wb-meta text-muted-foreground">
                <span>目标载荷 {unit.targetLoadKg ?? '—'} kg</span>
                <span>底面积 {conclusion.areaM2.toFixed(2)} m²</span>
              </div>
              {conclusion.reasons.length > 0 ? (
                <ul
                  className={cn(
                    'mt-1.5 grid list-disc gap-0.5 pl-4 text-wb-meta leading-relaxed',
                    conclusionTone.text,
                  )}
                >
                  {conclusion.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1.5 text-wb-meta text-muted-foreground">
                {conclusion.disclaimer}
              </p>
            </div>
            {issues.length === 0 ? (
              <div className="flex items-start gap-2 border-t border-border py-3 text-wb-meta text-muted-foreground">
                <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>基础结构检查通过；只校验几何与料单，不代表承载合格。</span>
              </div>
            ) : (
              <div className="border-t border-border">
                {issues.map((issue) => (
                  <div
                    key={`${issue.level}-${issue.message}`}
                    className="flex items-start gap-2 border-b border-border/60 py-2.5 text-wb-meta"
                  >
                    <span
                      className={cn(
                        'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full',
                        issue.level === 'error'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-warning-bg text-warning',
                      )}
                    >
                      {issue.level === 'error' ? (
                        <XIcon className="size-3" />
                      ) : (
                        <AlertTriangleIcon className="size-3" />
                      )}
                    </span>
                    <div>
                      <b className="block text-wb-meta">
                        {issue.level === 'error' ? '错误' : '提示'}
                      </b>
                      <p className="text-wb-meta leading-relaxed text-muted-foreground">
                        {issue.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        {tab === 'revisions' ? (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <b className="text-wb-body font-semibold">版本</b>
              <span className="text-wb-meta text-muted-foreground">
                {revisions.length} 个版本
              </span>
            </div>
            {revisionsLoading ? (
              <p className="py-3 text-wb-meta text-muted-foreground">正在加载版本…</p>
            ) : revisions.length === 0 ? (
              <div className="grid place-items-center gap-2 px-4 py-10 text-center text-wb-meta text-muted-foreground">
                <HistoryIcon className="size-6 text-muted-foreground/60" />
                <div>尚未发布版本</div>
                <div>发布后生成不可变快照</div>
              </div>
            ) : (
              <div className="border-t border-border">
                {revisions.map((revision) => (
                  <div
                    key={revision.revisionNo}
                    className="flex items-center gap-2 border-b border-border/60 py-2.5 text-wb-meta"
                  >
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-wb-meta text-primary">
                      R{String(revision.revisionNo).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-muted-foreground">
                        {new Date(revision.issuedAt).toLocaleString('zh-CN')}
                      </div>
                      <div className="mt-0.5 text-wb-meta tabular-nums">
                        材料 ¥{revision.materialCost} · {revision.totalWeightKg} kg
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => onOpenRevision(revision.revisionNo)}
                    >
                      查看
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-wb-meta text-muted-foreground">
              发布入口在顶栏中；未保存时不可发布。
            </p>
          </>
        ) : null}
      </div>
      <PanelHandle
        side="right"
        label="收起右栏"
        onClick={() => undefined}
        className="cursor-col-resize"
      />
    </aside>
  );
}
