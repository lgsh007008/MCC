'use client';

import * as React from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronsRightIcon,
} from 'lucide-react';
import {
  PACKAGING_DEFAULT_TEMPLATES,
  PACKAGING_UNIT_TYPE_LABELS,
  PALLET_DECK_MAX,
  PALLET_ROLE_LABELS,
  PALLET_TEMPLATE_OPTIONS,
  palletDeckDefaults,
  type PackagingLoadType,
  type PalletComponentRole,
  type PalletDeckMode,
  type PalletEntryDirection,
  type TemplateConfigField,
  type TemplateDefinition,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { UnitDraft } from '@/lib/packaging/document';
import { PanelHandle } from './panel-handle';
import { UnitTypeIcon } from './unit-type-icon';

export type UnitPanelView = 'params' | 'list';

interface UnitPanelProps {
  unit: UnitDraft;
  outerSize: { lengthMm: number; widthMm: number; heightMm: number };
  editable: boolean;
  saved: boolean;
  structureLocked: boolean;
  started: boolean;
  collapsed: boolean;
  view: UnitPanelView;
  onViewChange: (view: UnitPanelView) => void;
  onToggleCollapsed: () => void;
  onSelectCatalog: (
    unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP',
    templateCode: string,
  ) => void;
  onUpdateUnit: (patch: Partial<UnitDraft>) => void;
  onApplyPalletDims: (patch: Partial<Pick<UnitDraft, 'lengthMm' | 'widthMm'>>) => void;
  onApplyCrateParams: (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'innerLengthMm'
        | 'innerWidthMm'
        | 'innerHeightMm'
        | 'thicknessMm'
        | 'bottomThicknessMm'
        | 'baseHeightMm'
        | 'frameThicknessMm'
        | 'steelStrapCount'
        | 'runnerCount'
        | 'runnerWidthMm'
        | 'strapWidthMm'
        | 'strapDirection'
      >
    >,
  ) => void;
  onConfigureDeck: (deck: 'top' | 'bottom', mode: PalletDeckMode, count?: number | null) => void;
  onApplyFrameParams: (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'innerLengthMm'
        | 'innerWidthMm'
        | 'innerHeightMm'
        | 'frameThicknessMm'
        | 'bottomThicknessMm'
        | 'baseHeightMm'
        | 'runnerWidthMm'
        | 'panelThicknessMm'
        | 'panelCoverage'
        | 'hasLid'
        | 'steelStrapCount'
      >
    >,
  ) => void;
  onApplyDividerParams: (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'innerLengthMm'
        | 'innerWidthMm'
        | 'layerHeightMm'
        | 'layerCount'
        | 'thicknessMm'
        | 'lapWidthMm'
        | 'hingeCount'
      >
    >,
  ) => void;
  onApplyDunnageParams: (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'dunnageLengthMm'
        | 'dunnageWidthMm'
        | 'dunnageThicknessMm'
        | 'dunnageQuantity'
        | 'dunnageArrangement'
      >
    >,
  ) => void;
  onChangeTemplate: (templateCode: string) => void;
  onOpenParts: () => void;
}

interface CatalogItem {
  templateCode: string;
  label: string;
  meta: string;
}

interface CatalogGroup {
  unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP';
  label: string;
  items: CatalogItem[];
}

const CRATE_TEMPLATE_CODE = 'crate-g';
const SKID_TEMPLATE_CODE = 'skid-g';
const STEEL_STRAP_TEMPLATE_CODE = 'steel-strap-g';
const FRAME_TEMPLATE_CODE = 'frame-g';
const DIVIDER_TEMPLATE_CODE = 'divider-g';
const DUNNAGE_TEMPLATE_CODE = 'dunnage-g';
const PANEL_WIDTH = 300;
const COLLAPSED_WIDTH = 48;

const toPalletCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter(
    (template) => template.unitType === 'PALLET' && template.code !== 'custom',
  ).map((template) => {
    const option = PALLET_TEMPLATE_OPTIONS.find((item) => item.value === template.code);
    return {
      templateCode: template.code,
      label: template.name,
      meta: option ? `${option.defaultLengthMm}×${option.defaultWidthMm}` : '',
    };
  });

const toCrateCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'CRATE').map(
    (template) => ({
      templateCode: template.code,
      label: template.name,
      meta: '内 1200×800×900',
    }),
  );

const toSkidCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'SKID').map(
    (template) => ({
      templateCode: template.code,
      label: template.name,
      meta: '内 1200×800×900',
    }),
  );

const toSteelStrapCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'STEEL_STRAP').map(
    (template) => ({
      templateCode: template.code,
      label: template.name,
      meta: '内 1200×800×900',
    }),
  );

const toFrameCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'FRAME').map(
    (template) => ({
      templateCode: template.code,
      label: template.name,
      meta: '内 1200×800×900',
    }),
  );

const toDividerCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'DIVIDER').map(
    (template) => ({
      templateCode: template.code,
      label: template.name,
      meta: '内 1200×800',
    }),
  );

const toDunnageCatalog = (): CatalogItem[] =>
  PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'DUNNAGE').map(
    (template) => ({
      templateCode: template.code,
      label: template.name,
      meta: '1200×90×90',
    }),
  );

const CATALOG: CatalogGroup[] = [
  { unitType: 'PALLET', label: '托盘', items: toPalletCatalog() },
  { unitType: 'CRATE', label: '普通木箱', items: toCrateCatalog() },
  { unitType: 'SKID', label: '滑木箱', items: toSkidCatalog() },
  { unitType: 'FRAME', label: '框架箱', items: toFrameCatalog() },
  { unitType: 'DIVIDER', label: '围板', items: toDividerCatalog() },
  { unitType: 'DUNNAGE', label: '垫木', items: toDunnageCatalog() },
  { unitType: 'STEEL_STRAP', label: '钢带箱', items: toSteelStrapCatalog() },
];

const templateLabel = (unit: UnitDraft): string =>
  unit.unitType === 'CRATE'
    ? '普通木箱 G 型'
    : unit.unitType === 'SKID'
      ? '滑木箱 G 型'
      : unit.unitType === 'FRAME'
        ? '框架箱 G 型'
        : unit.unitType === 'DIVIDER'
          ? '围板 G 型'
          : unit.unitType === 'DUNNAGE'
            ? '垫木 G 型'
            : unit.unitType === 'STEEL_STRAP'
              ? '钢带箱 G 型'
              : (PALLET_TEMPLATE_OPTIONS.find((option) => option.value === unit.templateCode)?.label ??
                unit.templateCode);

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

// 参数输入 150ms 防抖（product/包装设计.md R-包装设计-016）：
// 连续键入只在停顿后触发一次派生，避免每敲一位就重建构件与历史。
const INPUT_DEBOUNCE_MS = 150;

function NumberField({
  label,
  value,
  disabled,
  min = 1,
  max,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  disabled: boolean;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  hint?: string;
}): React.ReactElement {
  const [text, setText] = React.useState(String(value));
  const focused = React.useRef(false);
  const latest = React.useRef({ value, onChange });
  latest.current = { value, onChange };

  React.useEffect(() => {
    if (!focused.current) setText(String(value));
  }, [value]);

  React.useEffect(() => {
    if (!focused.current) return;
    const timer = window.setTimeout(() => {
      const parsed = Number(text);
      if (text.trim() === '' || !Number.isFinite(parsed)) return;
      if (parsed !== latest.current.value) latest.current.onChange(parsed);
    }, INPUT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  const commit = (): void => {
    focused.current = false;
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    setText(String(parsed));
    if (parsed !== value) onChange(parsed);
  };

  return (
    <Field label={label}>
      <Input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={commit}
        disabled={disabled}
        className="h-8 text-wb-body"
      />
      {hint ? <span className="text-wb-meta text-muted-foreground">{hint}</span> : null}
    </Field>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-2 text-wb-meta">
      <span className="text-foreground/70">{label}</span>
      <span className="truncate text-wb-body tabular-nums text-foreground">{value}</span>
    </div>
  );
}

// 左栏（product/包装设计.md R-包装设计-006 · 单元目录 / design/包装设计.md §9.2）：
// 单元目录树（父级 = 单元类型，子级 = 模板 / 单元）↔ 单元参数；选中子级即当前方案单元；
// 不提供增删 / 复制 / 排序；平面小节（标题 + 1px 分隔线），不使用卡片；
// 折叠用平台同款面板图标 + 180–220ms 宽度动画；目录↔参数 160–180ms 淡入 + 横移。
export function UnitPanel({
  unit,
  outerSize,
  editable,
  saved,
  structureLocked,
  started,
  collapsed,
  view,
  onViewChange,
  onToggleCollapsed,
  onSelectCatalog,
  onUpdateUnit,
  onApplyPalletDims,
  onApplyCrateParams,
  onConfigureDeck,
  onApplyFrameParams,
  onApplyDividerParams,
  onApplyDunnageParams,
  onChangeTemplate,
  onOpenParts,
}: UnitPanelProps): React.ReactElement {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<CatalogGroup['unitType']>>(
    () => new Set(CATALOG.map((group) => group.unitType)),
  );
  const toggleGroup = (unitType: CatalogGroup['unitType']): void => {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(unitType)) next.delete(unitType);
      else next.add(unitType);
      return next;
    });
  };

  const templateOptions =
    unit.unitType === 'CRATE'
      ? [{ value: CRATE_TEMPLATE_CODE, label: '普通木箱 G 型' }]
      : unit.unitType === 'SKID'
        ? [{ value: SKID_TEMPLATE_CODE, label: '滑木箱 G 型' }]
        : unit.unitType === 'FRAME'
          ? [{ value: FRAME_TEMPLATE_CODE, label: '框架箱 G 型' }]
          : unit.unitType === 'DIVIDER'
            ? [{ value: DIVIDER_TEMPLATE_CODE, label: '围板 G 型' }]
            : unit.unitType === 'DUNNAGE'
              ? [{ value: DUNNAGE_TEMPLATE_CODE, label: '垫木 G 型' }]
              : unit.unitType === 'STEEL_STRAP'
                ? [{ value: STEEL_STRAP_TEMPLATE_CODE, label: '钢带箱 G 型' }]
                : PALLET_TEMPLATE_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

  const deckDefaults = React.useMemo(
    () =>
      palletDeckDefaults(
        unit.templateCode as Parameters<typeof palletDeckDefaults>[0],
        unit.lengthMm,
        unit.widthMm,
      ),
    [unit.templateCode, unit.lengthMm, unit.widthMm],
  );
  const hasTopDeck = unit.parts.some((part) => part.role === 'topDeck');
  const hasBottomDeck = unit.parts.some((part) => part.role === 'bottomDeck');

  const roleTotals = React.useMemo(() => {
    const totals = new Map<PalletComponentRole, number>();
    for (const part of unit.parts) {
      totals.set(part.role, (totals.get(part.role) ?? 0) + part.quantity);
    }
    return Array.from(totals.entries());
  }, [unit.parts]);

  const templateDefinition = React.useMemo(() => {
    const code =
      unit.unitType === 'CRATE'
        ? CRATE_TEMPLATE_CODE
        : unit.unitType === 'SKID'
          ? SKID_TEMPLATE_CODE
          : unit.unitType === 'FRAME'
            ? FRAME_TEMPLATE_CODE
            : unit.unitType === 'DIVIDER'
              ? DIVIDER_TEMPLATE_CODE
              : unit.unitType === 'DUNNAGE'
                ? DUNNAGE_TEMPLATE_CODE
                : unit.unitType === 'STEEL_STRAP'
                  ? STEEL_STRAP_TEMPLATE_CODE
                  : unit.templateCode;
    const seed = PACKAGING_DEFAULT_TEMPLATES.find((template) => template.code === code);
    return (seed?.definition ?? {}) as unknown as TemplateDefinition;
  }, [unit.unitType, unit.templateCode]);

  const configGroups = React.useMemo(() => {
    const groups = new Map<string, TemplateConfigField[]>();
    for (const field of templateDefinition.config ?? []) {
      if (field.key === 'topDeck' && !hasTopDeck) continue;
      if (field.key === 'bottomDeck' && !hasBottomDeck) continue;
      const list = groups.get(field.group) ?? [];
      list.push(field);
      groups.set(field.group, list);
    }
    return Array.from(groups.entries()).map(([title, fields]) => ({ title, fields }));
  }, [templateDefinition, hasTopDeck, hasBottomDeck]);

  const crateNumericKeys = [
    'innerLengthMm',
    'innerWidthMm',
    'innerHeightMm',
    'thicknessMm',
    'bottomThicknessMm',
    'baseHeightMm',
    'frameThicknessMm',
    'steelStrapCount',
    'runnerCount',
    'runnerWidthMm',
    'strapWidthMm',
  ] as const;
  type CrateNumericKey = (typeof crateNumericKeys)[number];

  const frameNumericKeys = [
    'innerLengthMm',
    'innerWidthMm',
    'innerHeightMm',
    'frameThicknessMm',
    'bottomThicknessMm',
    'baseHeightMm',
    'runnerWidthMm',
    'panelThicknessMm',
    'steelStrapCount',
  ] as const;
  type FrameNumericKey = (typeof frameNumericKeys)[number];

  const dividerNumericKeys = [
    'innerLengthMm',
    'innerWidthMm',
    'layerHeightMm',
    'layerCount',
    'thicknessMm',
    'lapWidthMm',
    'hingeCount',
  ] as const;
  type DividerNumericKey = (typeof dividerNumericKeys)[number];

  const renderDeck = (
    field: TemplateConfigField,
    deck: 'top' | 'bottom',
  ): React.ReactElement => {
    const mode = deck === 'top' ? unit.topDeckMode : unit.bottomDeckMode;
    const count = deck === 'top' ? unit.topDeckCount : unit.bottomDeckCount;
    const defaultCount = deck === 'top' ? deckDefaults.top : deckDefaults.bottom;
    const label = deck === 'top' ? '上铺板' : '下铺板';
    return (
      <React.Fragment key={field.key}>
        <Field label={field.label}>
          <Select
            value={mode}
            onChange={(value) =>
              onConfigureDeck(deck, value as PalletDeckMode, count ?? defaultCount)
            }
            options={[
              { value: 'auto', label: `自动 · 模板默认 ${defaultCount ?? 1} 块` },
              { value: 'manual', label: '手动' },
            ]}
            disabled={!editable}
            ariaLabel={`${label}模式`}
            className="h-8 text-wb-body"
          />
        </Field>
        {mode === 'manual' ? (
          <NumberField
            label={`${label}数量`}
            value={count ?? defaultCount ?? 1}
            max={PALLET_DECK_MAX}
            disabled={!editable}
            onChange={(value) => onConfigureDeck(deck, 'manual', value)}
            hint={`手动上限 ${PALLET_DECK_MAX} 块；超出按 ${PALLET_DECK_MAX} 块计算。`}
          />
        ) : null}
      </React.Fragment>
    );
  };

  const renderConfigField = (field: TemplateConfigField): React.ReactElement | null => {
    if (unit.unitType === 'DUNNAGE') {
      const dunnageKey =
        field.key === 'lengthMm'
          ? 'dunnageLengthMm'
          : field.key === 'widthMm'
            ? 'dunnageWidthMm'
            : field.key === 'thicknessMm'
              ? 'dunnageThicknessMm'
              : field.key === 'quantity'
                ? 'dunnageQuantity'
                : null;
      if (dunnageKey) {
        return (
          <NumberField
            key={field.key}
            label={field.label}
            value={unit[dunnageKey]}
            min={field.min}
            max={field.max}
            disabled={!editable}
            onChange={(value) => onApplyDunnageParams({ [dunnageKey]: value })}
            hint={field.help}
          />
        );
      }
      if (field.key === 'arrangement') {
        return (
          <Field key={field.key} label={field.label}>
            <Select
              value={unit.dunnageArrangement}
              onChange={(value) =>
                onApplyDunnageParams({
                  dunnageArrangement: value === 'cross' ? 'cross' : 'parallel',
                })
              }
              options={
                field.options ?? [
                  { value: 'parallel', label: '平行' },
                  { value: 'cross', label: '交叉' },
                ]
              }
              disabled={!editable}
              ariaLabel={field.label}
              className="h-8 text-wb-body"
            />
          </Field>
        );
      }
    }
    if (field.key === 'lengthMm' || field.key === 'widthMm') {
      return (
        <NumberField
          key={field.key}
          label={field.label}
          value={field.key === 'lengthMm' ? unit.lengthMm : unit.widthMm}
          min={field.min}
          max={field.max}
          disabled={!editable}
          onChange={(value) => onApplyPalletDims({ [field.key]: value })}
        />
      );
    }
    if (field.key === 'entryDirection') {
      return (
        <Field key={field.key} label={field.label}>
          <Select
            value={unit.entryDirection}
            onChange={(value) =>
              onUpdateUnit({ entryDirection: value as PalletEntryDirection })
            }
            options={
              field.options ?? [
                { value: '4', label: '四向进叉' },
                { value: '2', label: '两向进叉' },
              ]
            }
            disabled={!editable}
            ariaLabel={field.label}
            className="h-8 text-wb-body"
          />
        </Field>
      );
    }
    if (field.key === 'strapDirection') {
      return (
        <Field key={field.key} label={field.label}>
          <Select
            value={unit.strapDirection}
            onChange={(value) =>
              onApplyCrateParams({ strapDirection: value === 'both' ? 'both' : 'horizontal' })
            }
            options={
              field.options ?? [
                { value: 'horizontal', label: '横向' },
                { value: 'both', label: '纵横' },
              ]
            }
            disabled={!editable}
            ariaLabel={field.label}
            className="h-8 text-wb-body"
          />
        </Field>
      );
    }
    if (field.key === 'panelCoverage') {
      return (
        <Field key={field.key} label={field.label}>
          <Select
            value={unit.panelCoverage}
            onChange={(value) =>
              onApplyFrameParams({
                panelCoverage:
                  value === 'sides' || value === 'full' ? value : 'none',
              })
            }
            options={
              field.options ?? [
                { value: 'none', label: '无' },
                { value: 'sides', label: '侧端' },
                { value: 'full', label: '全包' },
              ]
            }
            disabled={!editable}
            ariaLabel={field.label}
            className="h-8 text-wb-body"
          />
        </Field>
      );
    }
    if (field.key === 'hasLid') {
      return (
        <Field key={field.key} label={field.label}>
          <Select
            value={unit.hasLid ? '1' : '0'}
            onChange={(value) => onApplyFrameParams({ hasLid: value !== '0' })}
            options={
              field.options ?? [
                { value: '1', label: '有' },
                { value: '0', label: '无' },
              ]
            }
            disabled={!editable}
            ariaLabel={field.label}
            className="h-8 text-wb-body"
          />
        </Field>
      );
    }
    if (field.key === 'topDeck' || field.key === 'bottomDeck') {
      return renderDeck(field, field.key === 'topDeck' ? 'top' : 'bottom');
    }
    if (unit.unitType === 'DIVIDER' && dividerNumericKeys.includes(field.key as DividerNumericKey)) {
      const key = field.key as DividerNumericKey;
      return (
        <NumberField
          key={field.key}
          label={field.label}
          value={unit[key]}
          min={field.min}
          max={field.max}
          disabled={!editable}
          onChange={(value) => onApplyDividerParams({ [key]: value })}
          hint={field.help}
        />
      );
    }
    if (unit.unitType === 'FRAME' && frameNumericKeys.includes(field.key as FrameNumericKey)) {
      const key = field.key as FrameNumericKey;
      return (
        <NumberField
          key={field.key}
          label={field.label}
          value={unit[key]}
          min={field.min}
          max={field.max}
          disabled={!editable}
          onChange={(value) => onApplyFrameParams({ [key]: value })}
          hint={field.help}
        />
      );
    }
    if (crateNumericKeys.includes(field.key as CrateNumericKey)) {
      const key = field.key as CrateNumericKey;
      return (
        <NumberField
          key={field.key}
          label={field.label}
          value={unit[key]}
          min={field.min}
          max={field.max}
          disabled={!editable}
          onChange={(value) => onApplyCrateParams({ [key]: value })}
          hint={field.help}
        />
      );
    }
    return null;
  };

  const selectItem = (group: CatalogGroup, item: CatalogItem): void => {
    setExpandedGroups((previous) => new Set(previous).add(group.unitType));
    if (!started) {
      onSelectCatalog(group.unitType, item.templateCode);
      return;
    }
    const current = unit.unitType === group.unitType && unit.templateCode === item.templateCode;
    if (current) {
      onViewChange('params');
      return;
    }
    if (!editable || structureLocked) return;
    // 单元类型创建时固定：已保存草稿只允许同类型换模板
    if (saved && group.unitType !== unit.unitType) return;
    onSelectCatalog(group.unitType, item.templateCode);
  };

  return (
    <aside
      aria-label="单元面板"
      className="relative flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background transition-[width] duration-200 ease-linear"
      style={{ width: collapsed ? COLLAPSED_WIDTH : PANEL_WIDTH }}
    >
      {collapsed ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label="展开左栏"
          aria-expanded={false}
          title="展开左栏"
          className="flex h-full w-full flex-col items-center gap-3 pt-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronsRightIcon className="size-3.5" />
          <span className="[writing-mode:vertical-rl] text-wb-meta tracking-[0.2em]">单元参数</span>
        </button>
      ) : (
        <>
        <div className="flex h-full min-h-0 flex-col animate-in fade-in duration-200">
          <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-2">
            {view === 'list' ? (
              <span className="text-wb-body font-semibold">目录</span>
            ) : (
              <>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => onViewChange('list')}
                  aria-label="返回单元目录"
                  title="返回单元目录"
                >
                  <ArrowLeftIcon />
                </Button>
                <UnitTypeIcon
                  unitType={unit.unitType}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate text-wb-body font-semibold">
                  {templateLabel(unit)}
                </span>
              </>
            )}
          </div>

          <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {view === 'list' ? (
              <div key="catalog" className="animate-in fade-in slide-in-from-left-1 duration-[170ms]">
                {CATALOG.map((group) => {
                  const expanded = expandedGroups.has(group.unitType);
                  return (
                    <div key={group.unitType} className="mb-0.5 last:mb-0">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={group.label}
                        onClick={() => toggleGroup(group.unitType)}
                        className="group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-wb-body font-medium transition-colors hover:bg-muted/60"
                      >
                        <UnitTypeIcon
                          unitType={group.unitType}
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">{group.label}</span>
                        <ChevronDownIcon
                          className={cn(
                            'size-3.5 shrink-0 text-muted-foreground opacity-0 transition-[transform,opacity] duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
                            expanded ? '' : '-rotate-90',
                          )}
                        />
                      </button>
                      {expanded ? (
                        <div className="mt-0.5 grid gap-0.5 pl-8">
                          {group.items.map((item) => {
                            const current =
                              started &&
                              unit.unitType === group.unitType &&
                              unit.templateCode === item.templateCode;
                            const locked =
                              !editable ||
                              structureLocked ||
                              (started && saved && group.unitType !== unit.unitType);
                            return (
                              <button
                                key={item.templateCode}
                                type="button"
                                aria-label={`${group.label} · ${item.label}`}
                                aria-pressed={current}
                                disabled={locked}
                                onClick={() => selectItem(group, item)}
                                className={cn(
                                  'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-wb-body transition-colors',
                                  current
                                    ? 'bg-muted font-medium text-foreground'
                                    : 'text-foreground/75 hover:bg-muted/60 hover:text-foreground',
                                  locked ? 'cursor-not-allowed opacity-50 hover:bg-transparent' : '',
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                <span className="flex w-9 shrink-0 items-center justify-end">
                                  {current ? (
                                    <span className="whitespace-nowrap rounded bg-primary/10 px-1 py-0.5 text-wb-meta font-medium text-primary">
                                      当前
                                    </span>
                                  ) : (
                                    <ArrowRightIcon className="size-3.5 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100" />
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                key={`params-${unit.key}`}
                className="animate-in fade-in slide-in-from-right-1 duration-[170ms]"
              >
                <Section title="基本参数">
                  <ReadonlyRow
                    label="单元类型"
                    value={PACKAGING_UNIT_TYPE_LABELS[unit.unitType]}
                  />
                  <Field label="结构模板">
                    <Select
                      value={unit.templateCode}
                      onChange={onChangeTemplate}
                      options={templateOptions}
                      disabled={!editable || structureLocked}
                      ariaLabel="结构模板"
                      className="h-8 text-wb-body"
                    />
                  </Field>
                  {structureLocked ? (
                    <p className="text-wb-meta text-muted-foreground">
                      已发布 / 已归档，结构模板锁定。
                    </p>
                  ) : saved ? (
                    <p className="text-wb-meta text-muted-foreground">
                      草稿可更换结构模板；发布后锁定。
                    </p>
                  ) : null}
                </Section>

                {configGroups.map((group) => (
                  <Section key={group.title} title={group.title}>
                    {group.fields.map((field) => renderConfigField(field))}
                  </Section>
                ))}

                <Section title="派生结果">
                  <ReadonlyRow
                    label={unit.unitType === 'PALLET' ? '外形尺寸（只读）' : '外尺寸（只读）'}
                    value={`${outerSize.lengthMm} × ${outerSize.widthMm} × ${outerSize.heightMm} mm`}
                  />
                  {unit.unitType === 'PALLET' ? (
                    <ReadonlyRow
                      label="外形高度（只读）"
                      value={`${outerSize.heightMm} mm`}
                    />
                  ) : unit.unitType === 'FRAME' ? (
                    <p className="text-wb-meta text-muted-foreground">
                      外长 / 外宽 = 内尺寸 + 2 × 框架厚度 +（有面板时 2 × 面板厚）；外高 =
                      滑木高度 + 底板厚 + 内高 + 框架厚度 +（有盖板时 面板厚）。
                    </p>
                  ) : unit.unitType === 'DIVIDER' ? (
                    <p className="text-wb-meta text-muted-foreground">
                      外长 / 外宽 = 内尺寸 + 2 × 板厚；外高 = 单层高度 × 层数。
                    </p>
                  ) : unit.unitType === 'DUNNAGE' ? (
                    <p className="text-wb-meta text-muted-foreground">
                      平行：外形 = 长度 ×（数量 × 宽度）× 厚度；交叉：外形 = 长度 × 宽度 ×（2 ×
                      厚度）。
                    </p>
                  ) : (
                    <p className="text-wb-meta text-muted-foreground">
                      外长 / 外宽 = 内尺寸 + 2 ×（面板厚 + 框架厚度）；外高 = 内高 + 底板 + 盖板 +
                      底部支承。
                    </p>
                  )}
                </Section>

                <Section title="载荷">
                  <NumberField
                    label="目标载荷（kg）"
                    value={unit.targetLoadKg ?? 0}
                    min={0}
                    disabled={!editable}
                    onChange={(value) => onUpdateUnit({ targetLoadKg: value > 0 ? value : null })}
                  />
                  <Field label="载荷形式">
                    <Select
                      value={unit.loadType}
                      onChange={(value) => onUpdateUnit({ loadType: value as PackagingLoadType })}
                      options={[
                        { value: 'uniform', label: '均布' },
                        { value: 'concentrated', label: '集中' },
                      ]}
                      disabled={!editable}
                      ariaLabel="载荷形式"
                      className="h-8 text-wb-body"
                    />
                  </Field>
                  <p className="text-wb-meta text-muted-foreground">
                    载重参与筛查级构件推导，不做强度校核。
                  </p>
                </Section>

                <Section title="构件概览">
                  <div>
                    {roleTotals.length === 0 ? (
                      <p className="py-1 text-wb-meta text-muted-foreground">暂无构件</p>
                    ) : (
                      roleTotals.map(([role, count]) => (
                        <div
                          key={role}
                          className="flex items-center justify-between gap-2 border-b border-border/60 py-1.5 text-wb-meta last:border-b-0"
                        >
                          <span className="truncate">{PALLET_ROLE_LABELS[role] ?? role}</span>
                          <span className="text-wb-meta text-muted-foreground">
                            ×{count}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onOpenParts}
                    className="justify-self-start text-wb-meta font-medium text-primary hover:underline"
                  >
                    在底部构件表中编辑 →
                  </button>
                </Section>
              </div>
            )}
          </div>
        </div>
          <PanelHandle side="left" label="收起左栏" onClick={onToggleCollapsed} />
        </>
      )}
    </aside>
  );
}
