'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRightIcon, CopyIcon, Trash2Icon } from 'lucide-react';
import { PACKAGING_UNIT_TYPE_LABELS, type ApiSchemas, type PackagingUnitType } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { UnitThumbnail } from './unit-thumbnail';

type PackagingProjectRow = ApiSchemas['PackagingProjectListItemDto'];

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  ISSUED: '已发布',
  ARCHIVED: '已归档',
};

const STATUS_TONES: Record<string, string> = {
  DRAFT: 'border-warning-border bg-warning-bg text-warning',
  ISSUED: 'border-success-border bg-success-bg text-success',
  ARCHIVED: 'border-border bg-muted text-muted-foreground',
};

export const unitTypeLabel = (value: string): string =>
  PACKAGING_UNIT_TYPE_LABELS[value as PackagingUnitType] ?? value;

// 方案库卡片（product/包装设计.md R-包装设计-006 · 方案库 / design §9.1）：
// 缩略图 + 状态徽标 + 方案信息；整卡进入工作台，页脚常驻「进入设计」入口；
// 复制 / 删除为 hover 图标；方案编号弱化到页脚。
export function ProjectCard({
  project,
  canManage,
  onDuplicate,
  onRemove,
}: {
  project: PackagingProjectRow;
  canManage: boolean;
  onDuplicate: () => void;
  onRemove: () => void;
}): React.ReactElement {
  return (
    <article className="group relative overflow-hidden rounded-xl border border-border bg-card">
      <Link
        href={`/admin/packaging-design/${project.id}`}
        className="block"
      >
        <UnitThumbnail unit={project.firstUnit} unitType={project.unitType} />
        <span
          className={cn(
            'absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs font-medium',
            STATUS_TONES[project.status] ?? STATUS_TONES.ARCHIVED,
          )}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          {STATUS_LABELS[project.status] ?? project.status}
        </span>
        <div className="grid gap-0.5 p-2.5">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{project.name}</h3>
          <div className="truncate text-xs text-muted-foreground">
            {project.customerName || '未填客户'}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{unitTypeLabel(project.unitType)}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              {project.lengthMm} × {project.widthMm} × {project.totalHeightMm} mm
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="tabular-nums text-foreground/80">
              {Number(project.totalVolumeM3).toFixed(3)} m³ ·{' '}
              {Number(project.totalWeightKg).toFixed(1)} kg
            </span>
            <span className="shrink-0 text-muted-foreground">
              {new Date(project.updatedAt).toLocaleDateString('zh-CN')}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border/60 pt-1.5 text-xs">
            <span className="inline-flex items-center gap-0.5 font-medium text-primary">
              进入设计
              <ArrowRightIcon className="size-3" />
            </span>
            <span className="truncate font-mono text-muted-foreground">{project.code}</span>
          </div>
        </div>
      </Link>
      {canManage ? (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onDuplicate}
            aria-label="复制"
            className="bg-card/80 backdrop-blur"
          >
            <CopyIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onRemove}
            aria-label="删除"
            className="bg-card/80 backdrop-blur"
          >
            <Trash2Icon />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
