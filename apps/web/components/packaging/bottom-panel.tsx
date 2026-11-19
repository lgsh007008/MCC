'use client';

import * as React from 'react';
import type {
  PalletBom,
  PalletComponentInput,
  PalletMaterialLike,
  PartSourceInfo,
} from '@mcc/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { BomSummary } from './bom-summary';
import { BOTTOM_TABS, type BottomTab } from './bottom-launcher';
import { PanelHandle } from './panel-handle';
import { PartTable } from './part-table';

interface BottomPanelProps {
  height: number;
  tab: BottomTab;
  compact: boolean;
  parts: PalletComponentInput[];
  partSources?: PartSourceInfo[];
  materials: PalletMaterialLike[];
  selectedIndex: number;
  editable: boolean;
  bom: PalletBom;
  issueCount: number;
  onTabChange: (tab: BottomTab) => void;
  onHeightChange: (height: number) => void;
  onCollapse: () => void;
  onOpenIssues: () => void;
  onPartChange: (index: number, patch: Partial<PalletComponentInput>) => void;
  onPartSelect: (index: number) => void;
  onPartMove: (index: number, direction: -1 | 1) => void;
}

const clamp = (value: number): number => Math.min(520, Math.max(160, value));

// 明细 tab 工具栏（design/包装设计.md §9.2）：只承载说明文字，导出统一在顶栏。
function DetailToolbar({ hint }: { hint?: string }): React.ReactElement {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2">
      {hint ? (
        <span title={hint} className="min-w-0 truncate text-wb-meta text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

// 底部打开态面板（design/包装设计.md §9.2）：固定 3 个 icon + 文案标签（构件表 / BOM / 开料），
// 无 ×；只在主内容区底部，不跨左右栏；可拖高 160–520；版本不在此处；表格为工作台紧凑表。
// tab 行是面板第一行，紧贴上沿；收起把手浮在上沿中央，拖高从把手或 tab 行空白区发起。
export function BottomPanel({
  height,
  tab,
  compact,
  parts,
  partSources,
  materials,
  selectedIndex,
  editable,
  bom,
  issueCount,
  onTabChange,
  onHeightChange,
  onCollapse,
  onOpenIssues,
  onPartChange,
  onPartSelect,
  onPartMove,
}: BottomPanelProps): React.ReactElement {
  const drag = React.useRef<{
    startY: number;
    startHeight: number;
    fromHandle: boolean;
  } | null>(null);
  const moved = React.useRef(false);
  const materialNames = React.useMemo(
    () => new Map(materials.map((material) => [material.code, material.name])),
    [materials],
  );

  return (
    <section
      role="region"
      aria-label="底部面板"
      className="flex h-full shrink-0 flex-col overflow-hidden border-t border-border bg-card"
      style={{ height }}
    >
      <div
        className="relative flex h-10 shrink-0 items-stretch gap-2 border-b border-border pr-2"
        onPointerDown={(event) => {
          const target = event.target;
          const fromHandle =
            target instanceof Element && Boolean(target.closest('[data-panel-handle]'));
          // tab / 合计 / 校验按钮内的按下不启动拖高，避免与点击冲突
          if (!fromHandle && target instanceof Element && target.closest('button')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            startY: event.clientY,
            startHeight: height,
            fromHandle,
          };
          moved.current = false;
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          if (Math.abs(event.clientY - drag.current.startY) > 4) moved.current = true;
          onHeightChange(clamp(drag.current.startHeight + drag.current.startY - event.clientY));
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          if (!current) return;
          drag.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
          if (current.fromHandle && !moved.current) onCollapse();
        }}
      >
        <PanelHandle
          side="bottom"
          label="收起底栏"
          onClick={() => undefined}
          className="cursor-row-resize"
        />
        <div
          role="tablist"
          aria-label="底部明细标签"
          className="flex min-w-0 items-stretch overflow-x-auto overflow-y-hidden"
        >
          {BOTTOM_TABS.map((item) => {
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
                  'flex w-20 shrink-0 items-center justify-center gap-1.5 border-b-2 text-wb-body transition-colors',
                  active
                    ? 'border-primary font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-[13px] shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {!compact ? (
            <span className="truncate text-wb-meta text-muted-foreground">
              当前单元合计{' '}
              <b className="font-semibold tabular-nums">{bom.grossVolumeM3.toFixed(3)}</b> m³ ·{' '}
              <b className="font-semibold tabular-nums">{bom.weightKg.toFixed(1)}</b> kg · ¥
              <b className="font-semibold tabular-nums">
                {(bom.materialCost + bom.processCost).toFixed(2)}
              </b>
            </span>
          ) : null}
          <button
            type="button"
            onClick={onOpenIssues}
            aria-label="查看校验"
            title="查看校验"
            className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-wb-meta text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                issueCount > 0 ? 'bg-destructive' : 'bg-primary',
              )}
              aria-hidden
            />
            {issueCount}
          </button>
        </div>
      </div>

      <div className="scroll-area min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
        {tab === 'parts' ? (
          <div className="grid min-w-0 gap-2">
            <DetailToolbar hint="结构构件由参数派生；改尺寸、数量与层级后图纸和料单立即更新。" />
            <PartTable
              components={parts}
              sources={partSources}
              materials={materials}
              selectedIndex={selectedIndex}
              disabled={!editable}
              containerClassName="rounded-none border border-border"
              onChange={onPartChange}
              onSelect={onPartSelect}
              onMove={onPartMove}
            />
          </div>
        ) : null}
        {tab === 'bom' ? (
          <div className="grid min-w-0 gap-2">
            <DetailToolbar hint="按构件汇总体积、重量与材料费。" />
            <BomSummary
              bom={bom}
              partSources={partSources}
              issues={[]}
              showIssues={false}
              showMetrics={false}
              dense
            />
          </div>
        ) : null}
        {tab === 'cutting' ? (
          <div className="grid min-w-0 gap-2">
            <DetailToolbar hint="按损耗计算采购数量；排版与锯缝优化在 P4。" />
            <Table density="dense" containerClassName="rounded-none border border-border">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-24">构件</TableHead>
                  <TableHead className="min-w-20">材料</TableHead>
                  <TableHead className="min-w-32">规格 mm</TableHead>
                  <TableHead className="w-16 text-right">数量</TableHead>
                  <TableHead className="w-20 text-right">损耗 %</TableHead>
                  <TableHead className="w-20 text-right">采购数量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      暂无构件
                    </TableCell>
                  </TableRow>
                ) : (
                  parts.map((part, index) => (
                    <TableRow key={`cutting-${part.role}-${index}`}>
                      <TableCell className="truncate">{part.name}</TableCell>
                      <TableCell className="truncate">
                        {materialNames.get(part.materialCode) ?? part.materialCode}
                      </TableCell>
                      <TableCell className="text-wb-body tabular-nums">
                        {part.lengthMm} × {part.widthMm} × {part.heightMm}
                      </TableCell>
                      <TableCell className="text-right text-wb-body tabular-nums">
                        {part.quantity}
                      </TableCell>
                      <TableCell className="text-right text-wb-body tabular-nums">
                        {(part.wastePct * 100).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right text-wb-body tabular-nums">
                        {Math.ceil(Math.max(0, part.quantity) * (1 + Math.max(0, part.wastePct)))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
