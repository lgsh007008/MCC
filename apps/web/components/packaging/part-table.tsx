'use client';

import * as React from 'react';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import {
  PALLET_ROLE_LABELS,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
  type PartOverrideField,
  type PartSourceInfo,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface PalletComponentTableProps {
  components: PalletComponentInput[];
  sources?: PartSourceInfo[];
  materials: PalletMaterialLike[];
  selectedIndex: number;
  disabled: boolean;
  containerClassName?: string;
  onChange: (index: number, patch: Partial<PalletComponentInput>) => void;
  onSelect: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

const OVERRIDE_FIELD_LABELS: Record<PartOverrideField, string> = {
  role: '类型',
  name: '名称',
  materialCode: '材料',
  orientation: '方向',
  lengthMm: '长度',
  widthMm: '宽度',
  heightMm: '厚度',
  quantity: '数量',
  wastePct: '损耗',
  processCost: '加工费',
  priceOverride: '单价',
};

const sourceLabel = (info: PartSourceInfo | undefined): string =>
  info?.source === 'manual' ? '手动' : '自动';

const sourceTitle = (info: PartSourceInfo | undefined): string => {
  if (!info || info.source === 'auto') return '由参数派生';
  if (info.reason === 'config') return '手动铺板配置';
  if (info.changedFields.length === 0) return '手动覆盖';
  return `覆盖：${info.changedFields.map((field) => OVERRIDE_FIELD_LABELS[field]).join('、')}`;
};

const roleOptions = (Object.keys(PALLET_ROLE_LABELS) as PalletComponentRole[]).map((role) => ({
  value: role,
  label: PALLET_ROLE_LABELS[role],
}));

export function PartTable({
  components,
  sources,
  materials,
  selectedIndex,
  disabled,
  containerClassName = 'max-h-[420px] rounded-lg border border-border',
  onChange,
  onSelect,
  onMove,
}: PalletComponentTableProps): React.ReactElement {
  const materialOptions = materials.map((material) => ({
    value: material.code,
    label: material.name,
  }));
  return (
    <div className="grid min-w-0 gap-2">
      <Table density="dense" containerClassName={containerClassName}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">层级</TableHead>
            <TableHead className="min-w-28">构件类型</TableHead>
            <TableHead className="min-w-32">名称</TableHead>
            <TableHead className="min-w-28">材料</TableHead>
            <TableHead className="w-20">方向</TableHead>
            <TableHead className="w-24">长 mm</TableHead>
            <TableHead className="w-24">宽 mm</TableHead>
            <TableHead className="w-24">厚 mm</TableHead>
            <TableHead className="w-20">数量</TableHead>
            <TableHead className="w-20">损耗 %</TableHead>
            <TableHead className="w-24">加工费</TableHead>
            <TableHead className="w-28">单价覆盖</TableHead>
            <TableHead className="w-16">来源</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.length === 0 ? (
            <TableRow>
              <TableCell colSpan={14} className="text-center text-muted-foreground">
                暂无构件
              </TableCell>
            </TableRow>
          ) : (
            components.map((component, index) => (
              <TableRow
                key={`${component.role}-${index}`}
                data-state={index === selectedIndex ? 'selected' : undefined}
                className="data-[state=selected]:bg-primary/8"
                onClick={() => onSelect(index)}
              >
                <TableCell className="text-center tabular-nums">{index + 1}</TableCell>
                <TableCell>
                  <Select
                    value={component.role}
                    onChange={(value) => onChange(index, { role: value as PalletComponentRole })}
                    options={roleOptions}
                    disabled={disabled}
                    ariaLabel={`第 ${index + 1} 行构件类型`}
                    className="h-7 w-full text-wb-body"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={component.name}
                    onChange={(event) => onChange(index, { name: event.target.value })}
                    disabled={disabled}
                    className="h-7"
                    aria-label={`第 ${index + 1} 行构件名称`}
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={component.materialCode}
                    onChange={(value) => onChange(index, { materialCode: value })}
                    options={materialOptions}
                    disabled={disabled}
                    ariaLabel={`第 ${index + 1} 行材料`}
                    className="h-7 w-full text-wb-body"
                  />
                </TableCell>
                <TableCell>
                  <Select
                    value={component.orientation}
                    onChange={(value) =>
                      onChange(index, {
                        orientation: value === 'y' ? 'y' : 'x',
                      })
                    }
                    options={[
                      { value: 'x', label: '沿长' },
                      { value: 'y', label: '沿宽' },
                    ]}
                    disabled={disabled}
                    ariaLabel={`第 ${index + 1} 行方向`}
                    className="h-7 w-full text-wb-body"
                  />
                </TableCell>
                {(['lengthMm', 'widthMm', 'heightMm'] as const).map((key) => (
                  <TableCell key={key}>
                    <Input
                      type="number"
                      min={1}
                      value={component[key]}
                      onChange={(event) =>
                        onChange(index, {
                          [key]: Number(event.target.value) || 0,
                        })
                      }
                      disabled={disabled}
                      className="h-7 w-20 text-right text-wb-body tabular-nums"
                      aria-label={`第 ${index + 1} 行${key === 'lengthMm' ? '长度' : key === 'widthMm' ? '宽度' : '厚度'}`}
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={component.quantity}
                    onChange={(event) =>
                      onChange(index, {
                        quantity: Number(event.target.value) || 0,
                      })
                    }
                    disabled={disabled}
                    className="h-7 w-16 text-right text-wb-body tabular-nums"
                    aria-label={`第 ${index + 1} 行数量`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={Math.round(component.wastePct * 1000) / 10}
                    onChange={(event) =>
                      onChange(index, {
                        wastePct: Math.max(0, Number(event.target.value) || 0) / 100,
                      })
                    }
                    disabled={disabled}
                    className="h-7 w-16 text-right text-wb-body tabular-nums"
                    aria-label={`第 ${index + 1} 行损耗`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={component.processCost}
                    onChange={(event) =>
                      onChange(index, {
                        processCost: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    disabled={disabled}
                    className="h-7 w-20 text-right text-wb-body tabular-nums"
                    aria-label={`第 ${index + 1} 行加工费`}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={component.priceOverride}
                    onChange={(event) =>
                      onChange(index, {
                        priceOverride: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    disabled={disabled}
                    className="h-7 w-24 text-right text-wb-body tabular-nums"
                    aria-label={`第 ${index + 1} 行单价覆盖`}
                  />
                </TableCell>
                <TableCell>
                  <span
                    title={sourceTitle(sources?.[index])}
                    className={cn(
                      'inline-flex items-center rounded px-1.5 py-0.5 text-wb-meta',
                      sources?.[index]?.source === 'manual'
                        ? 'bg-warning-bg text-warning'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {sourceLabel(sources?.[index])}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled || index === 0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(index, -1);
                      }}
                      aria-label="上移"
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={disabled || index === components.length - 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMove(index, 1);
                      }}
                      aria-label="下移"
                    >
                      <ArrowDownIcon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
