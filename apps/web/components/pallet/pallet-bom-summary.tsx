'use client';

import * as React from 'react';
import type { PalletBom, PalletIssue } from '@mcc/shared';

interface PalletBomSummaryProps {
  bom: PalletBom;
  issues: PalletIssue[];
}

export function PalletBomSummary({ bom, issues }: PalletBomSummaryProps): React.ReactElement {
  const metrics = [
    { label: '净体积', value: `${bom.netVolumeM3.toFixed(5)} m³` },
    { label: '采购体积', value: `${bom.grossVolumeM3.toFixed(5)} m³` },
    { label: '估算重量', value: `${bom.weightKg.toFixed(1)} kg` },
    { label: '材料费', value: `¥${bom.materialCost.toFixed(2)}` },
    { label: '加工费', value: `¥${bom.processCost.toFixed(2)}` },
  ];
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{metric.label}</div>
            <div className="text-sm font-semibold tabular-nums">{metric.value}</div>
          </div>
        ))}
      </div>
      <div className="max-h-56 overflow-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">构件</th>
              <th className="px-2 py-1.5 text-left">材料</th>
              <th className="px-2 py-1.5 text-right">净体积</th>
              <th className="px-2 py-1.5 text-right">采购体积</th>
              <th className="px-2 py-1.5 text-right">重量</th>
              <th className="px-2 py-1.5 text-right">材料费</th>
            </tr>
          </thead>
          <tbody>
            {bom.items.map((item) => (
              <tr key={`${item.componentIndex}-${item.name}`} className="border-t border-border/60">
                <td className="px-2 py-1.5">{item.name}</td>
                <td className="px-2 py-1.5">{item.materialName}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.netVolumeM3.toFixed(5)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.grossVolumeM3.toFixed(5)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{item.weightKg.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">¥{item.materialCost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {issues.length ? (
        <div className="grid gap-1 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {issues.map((issue) => (
            <div key={issue.message}>
              {issue.level === 'error' ? '错误：' : '提示：'}
              {issue.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          基础结构检查通过；本页只校验几何与料单，不代表承载合格。
        </div>
      )}
    </div>
  );
}
