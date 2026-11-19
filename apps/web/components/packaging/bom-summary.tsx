'use client';

import * as React from 'react';
import type { PalletBom, PalletIssue, PartSourceInfo } from '@mcc/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface PalletBomSummaryProps {
  bom: PalletBom;
  partSources?: PartSourceInfo[];
  issues: PalletIssue[];
  showIssues?: boolean;
  showMetrics?: boolean;
  dense?: boolean;
}

// BOM 汇总（design/包装设计.md §9.2）：底栏与其他明细 tab 共用工作台紧凑表
// （表头 12 / 34，单元格 13，行高 36）；报告页等非 dense 场景保持默认表。
export function BomSummary({
  bom,
  partSources,
  issues,
  showIssues = true,
  showMetrics = true,
  dense = false,
}: PalletBomSummaryProps): React.ReactElement {
  const metrics = [
    { label: '净体积', value: `${bom.netVolumeM3.toFixed(5)} m³` },
    { label: '采购体积', value: `${bom.grossVolumeM3.toFixed(5)} m³` },
    { label: '估算重量', value: `${bom.weightKg.toFixed(1)} kg` },
    { label: '材料费', value: `¥${bom.materialCost.toFixed(2)}` },
    { label: '加工费', value: `¥${bom.processCost.toFixed(2)}` },
  ];
  return (
    <div className="grid gap-2">
      {showMetrics ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-lg border border-border bg-muted/20 px-3 py-2"
            >
              <div className="text-wb-meta text-muted-foreground">{metric.label}</div>
              <div className="text-wb-body font-semibold tabular-nums">{metric.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      <Table
        density={dense ? 'dense' : 'default'}
        containerClassName={
          dense ? 'rounded-none border border-border' : 'rounded-lg border border-border'
        }
      >
        <TableHeader>
          <TableRow>
            <TableHead>构件</TableHead>
            <TableHead>材料</TableHead>
            <TableHead className="text-right">净体积</TableHead>
            <TableHead className="text-right">采购体积</TableHead>
            <TableHead className="text-right">重量</TableHead>
            <TableHead className="text-right">材料费</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bom.items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                暂无构件
              </TableCell>
            </TableRow>
          ) : (
            bom.items.map((item) => (
              <TableRow key={`${item.componentIndex}-${item.name}`}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    {item.name}
                    {partSources?.[item.componentIndex]?.source === 'manual' ? (
                      <span className="rounded bg-warning-bg px-1.5 py-0.5 text-wb-meta text-warning">
                        手动
                      </span>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>{item.materialName}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.netVolumeM3.toFixed(5)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.grossVolumeM3.toFixed(5)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {item.weightKg.toFixed(1)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ¥{item.materialCost.toFixed(2)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {showIssues ? (
        issues.length ? (
          <div className="grid gap-1 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            {issues.map((issue) => (
              <div key={issue.message}>
                {issue.level === 'error' ? '错误：' : '提示：'}
                {issue.message}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-success-border bg-success-bg px-3 py-2 text-xs text-success">
            基础结构检查通过；本页只校验几何与料单，不代表承载合格。
          </div>
        )
      ) : null}
    </div>
  );
}
