'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { ApiSchemas } from '@mcc/shared';

interface RevisionDetailDialogProps {
  open: boolean;
  projectId: string;
  revisionNo: number | null;
  onOpenChange: (open: boolean) => void;
  onPrint: (revisionNo: number) => void;
}

interface SnapshotUnit {
  name?: string;
  unitType?: string;
  totalVolumeM3?: string;
  totalWeightKg?: string;
  parts?: unknown[];
}

interface RevisionSnapshot {
  project?: {
    code?: string;
    name?: string;
    customerName?: string;
    destination?: string;
  };
  units?: SnapshotUnit[];
}

// 版本详情（product/包装设计.md R-包装设计-010 / design §9.2）：
// 只读展示不可变快照；按版本打印走报告页 ?revision=N，不读当前数据。
export function RevisionDetailDialog({
  open,
  projectId,
  revisionNo,
  onOpenChange,
  onPrint,
}: RevisionDetailDialogProps): React.ReactElement {
  const query = useQuery({
    queryKey: ['packaging-revision-detail', projectId, revisionNo],
    enabled: open && revisionNo !== null,
    queryFn: async (): Promise<ApiSchemas['PackagingRevisionDetailDto']> => {
      const { data, response } = await api.GET(
        '/api/v1/packaging/projects/{id}/revisions/{revisionNo}',
        { params: { path: { id: projectId, revisionNo: revisionNo! } } },
      );
      if (!response.ok || !data) {
        throw new Error(`版本快照加载失败（${response.status}）`);
      }
      return data;
    },
  });

  const revision = query.data;
  const snapshot = (revision?.snapshot ?? {}) as RevisionSnapshot;
  const units = snapshot.units ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            版本详情 {revisionNo === null ? '' : `R${String(revisionNo).padStart(2, '0')}`}
          </DialogTitle>
          <DialogDescription>
            不可变快照，只读查看；按版本打印不会读取当前编辑数据。
          </DialogDescription>
        </DialogHeader>

        {query.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">正在加载版本快照…</p>
        ) : query.isError ? (
          <p className="py-6 text-center text-sm text-destructive">
            {query.error instanceof Error ? query.error.message : '版本快照加载失败'}
          </p>
        ) : revision ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              {[
                ['方案编号', snapshot.project?.code ?? '—'],
                ['方案名称', snapshot.project?.name ?? '—'],
                ['客户', snapshot.project?.customerName || '—'],
                ['使用范围', snapshot.project?.destination === 'domestic' ? '内销' : '出口'],
                ['发布时间', new Date(revision.issuedAt).toLocaleString('zh-CN')],
                ['发布人', revision.issuedBy || '—'],
                ['净体积', `${revision.totalVolumeM3} m³`],
                ['估算重量', `${revision.totalWeightKg} kg`],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-border px-2 py-1.5">
                  <div className="text-wb-meta text-muted-foreground">{label}</div>
                  <div className="truncate font-medium">{value}</div>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">单元</th>
                    <th className="px-2 py-1.5">类型</th>
                    <th className="px-2 py-1.5 text-right">构件</th>
                    <th className="px-2 py-1.5 text-right">净体积</th>
                    <th className="px-2 py-1.5 text-right">重量</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map((unit, index) => (
                    <tr key={`${unit.name}-${index}`} className="border-t border-border/60">
                      <td className="px-2 py-1.5">{unit.name ?? `单元 ${index + 1}`}</td>
                      <td className="px-2 py-1.5">{unit.unitType ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {unit.parts?.length ?? 0}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {unit.totalVolumeM3 ?? '—'}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {unit.totalWeightKg ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {revision.note ? (
              <p className="text-xs text-muted-foreground">备注：{revision.note}</p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            type="button"
            disabled={!revision || revisionNo === null}
            onClick={() => {
              if (revisionNo !== null) onPrint(revisionNo);
            }}
          >
            按版本打印
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
