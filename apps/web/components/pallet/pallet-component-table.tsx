'use client';

import * as React from 'react';
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  PALLET_ROLE_LABELS,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
} from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface PalletComponentTableProps {
  components: PalletComponentInput[];
  materials: PalletMaterialLike[];
  selectedIndex: number;
  disabled: boolean;
  onChange: (index: number, patch: Partial<PalletComponentInput>) => void;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
}

const roleOptions = (Object.keys(PALLET_ROLE_LABELS) as PalletComponentRole[]).map((role) => ({
  value: role,
  label: PALLET_ROLE_LABELS[role],
}));

export function PalletComponentTable({
  components,
  materials,
  selectedIndex,
  disabled,
  onChange,
  onSelect,
  onAdd,
  onRemove,
  onMove,
}: PalletComponentTableProps): React.ReactElement {
  const materialOptions = materials.map((material) => ({ value: material.code, label: material.name }));
  return (
    <div className="grid gap-2">
      <Table containerClassName="max-h-[420px] rounded-lg border border-border">
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
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {components.map((component, index) => (
            <TableRow
              key={`${component.role}-${index}`}
              data-state={index === selectedIndex ? 'selected' : undefined}
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
                  className="w-full"
                />
              </TableCell>
              <TableCell>
                <Input
                  value={component.name}
                  onChange={(event) => onChange(index, { name: event.target.value })}
                  disabled={disabled}
                  className="h-8"
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
                  className="w-full"
                />
              </TableCell>
              <TableCell>
                <Select
                  value={component.orientation}
                  onChange={(value) => onChange(index, { orientation: value === 'y' ? 'y' : 'x' })}
                  options={[
                    { value: 'x', label: '沿长' },
                    { value: 'y', label: '沿宽' },
                  ]}
                  disabled={disabled}
                  ariaLabel={`第 ${index + 1} 行方向`}
                  className="w-full"
                />
              </TableCell>
              {(['lengthMm', 'widthMm', 'heightMm'] as const).map((key) => (
                <TableCell key={key}>
                  <Input
                    type="number"
                    min={1}
                    value={component[key]}
                    onChange={(event) => onChange(index, { [key]: Number(event.target.value) || 0 })}
                    disabled={disabled}
                    className="h-8 w-20 text-right tabular-nums"
                    aria-label={`第 ${index + 1} 行${key === 'lengthMm' ? '长度' : key === 'widthMm' ? '宽度' : '厚度'}`}
                  />
                </TableCell>
              ))}
              <TableCell>
                <Input
                  type="number"
                  min={1}
                  value={component.quantity}
                  onChange={(event) => onChange(index, { quantity: Number(event.target.value) || 0 })}
                  disabled={disabled}
                  className="h-8 w-16 text-right tabular-nums"
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
                    onChange(index, { wastePct: Math.max(0, Number(event.target.value) || 0) / 100 })
                  }
                  disabled={disabled}
                  className="h-8 w-16 text-right tabular-nums"
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
                    onChange(index, { processCost: Math.max(0, Number(event.target.value) || 0) })
                  }
                  disabled={disabled}
                  className="h-8 w-20 text-right tabular-nums"
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
                    onChange(index, { priceOverride: Math.max(0, Number(event.target.value) || 0) })
                  }
                  disabled={disabled}
                  className="h-8 w-24 text-right tabular-nums"
                  aria-label={`第 ${index + 1} 行单价覆盖`}
                />
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
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(index);
                    }}
                    aria-label="删除"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={onAdd} disabled={disabled}>
          <PlusIcon />
          添加构件
        </Button>
        <span className="text-xs text-muted-foreground">
          层级从上到下即物理层级；改尺寸、数量与层级后图纸和料单立即更新。
        </span>
      </div>
    </div>
  );
}
