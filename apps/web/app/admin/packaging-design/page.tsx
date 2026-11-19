'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { PACKAGING_UNIT_TYPE_LABELS, type ApiSchemas, type PackagingUnitType } from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { ProjectCard } from '@/components/packaging/project-card';

type PackagingProjectRow = ApiSchemas['PackagingProjectListItemDto'];
type UnitTypeFilter = '' | PackagingUnitType;
type StatusFilter = '' | 'DRAFT' | 'ISSUED' | 'ARCHIVED';

const PAGE_SIZE = 20;

// 方案库（product/包装设计.md R-包装设计-006 / design/包装设计.md §9.1）：
// 筛选 → 新建 → 卡片画廊（缩略图 + 状态）→ 分页。只做方案管理与检索。
export default function PackagingDesignPage(): React.ReactElement {
  const canManage = useCan('packaging:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = React.useState('');
  const [unitType, setUnitType] = React.useState<UnitTypeFilter>('');
  const [status, setStatus] = React.useState<StatusFilter>('');
  const [applied, setApplied] = React.useState<{
    keyword: string;
    unitType: UnitTypeFilter;
    status: StatusFilter;
  }>({ keyword: '', unitType: '', status: '' });
  const [page, setPage] = React.useState(1);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['packaging-projects', page, applied],
    queryFn: async (): Promise<{ total: number; items: PackagingProjectRow[] }> => {
      const { data, response } = await api.GET('/api/v1/packaging/projects', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            keyword: applied.keyword || undefined,
            unitType: applied.unitType || undefined,
            status: applied.status || undefined,
          },
        },
      });
      if (!response.ok || !data) {
        throw new Error('包装方案加载失败');
      }
      return data;
    },
  });

  const total = listQuery.data?.total ?? 0;
  const items = listQuery.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = (): void => {
    setApplied({ keyword: keyword.trim(), unitType, status });
    setPage(1);
  };

  const resetFilters = (): void => {
    setKeyword('');
    setUnitType('');
    setStatus('');
    setApplied({ keyword: '', unitType: '', status: '' });
    setPage(1);
  };

  const removeProject = async (row: PackagingProjectRow): Promise<void> => {
    try {
      await confirm({
        title: '删除包装方案',
        description: `将删除 ${row.code}「${row.name}」。删除后可重新建方案，但编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/packaging/projects/{id}', {
            params: { path: { id: row.id } },
          });
          if (!response.ok) {
            throw new Error(`删除失败（${response.status}）`);
          }
          await queryClient.invalidateQueries({ queryKey: ['packaging-projects'] });
        },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除失败');
    }
  };

  const duplicateProject = async (row: PackagingProjectRow): Promise<void> => {
    setActionError(null);
    const { data, response } = await api.POST('/api/v1/packaging/projects/{id}/duplicate', {
      params: { path: { id: row.id } },
    });
    if (!response.ok || !data) {
      setActionError(`复制失败（${response.status}）`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['packaging-projects'] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">关键字</span>
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="方案名称 / 编号 / 客户名称"
            className="w-64"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">单元类型</span>
          <Select
            value={unitType}
            onChange={(value) => setUnitType(value as UnitTypeFilter)}
            options={[
              { value: '', label: '全部类型' },
              ...Object.entries(PACKAGING_UNIT_TYPE_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            className="w-40"
            ariaLabel="单元类型筛选"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">状态</span>
          <Select
            value={status}
            onChange={(value) => setStatus(value as StatusFilter)}
            options={[
              { value: '', label: '全部状态' },
              { value: 'DRAFT', label: '草稿' },
              { value: 'ISSUED', label: '已发布' },
              { value: 'ARCHIVED', label: '已归档' },
            ]}
            className="w-36"
            ariaLabel="状态筛选"
          />
        </div>
        <Button type="submit" variant="secondary">
          <SearchIcon />
          查询
        </Button>
        <Button type="button" variant="outline" onClick={resetFilters}>
          重置
        </Button>
      </form>

      <div className="flex items-center gap-2">
        {canManage ? (
          <Link href="/admin/packaging-design/new" className={buttonVariants()}>
            <PlusIcon />
            新建包装方案
          </Link>
        ) : null}
      </div>

      {actionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <div className="scroll-area min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        {listQuery.isLoading ? (
          <div className="rounded-lg border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
            正在加载…
          </div>
        ) : listQuery.isError ? (
          <div className="rounded-lg border border-border bg-card px-3 py-10 text-center text-sm text-destructive">
            加载失败，请稍后重试。
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
            还没有包装方案，点击「新建包装方案」开始。
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {items.map((row) => (
              <ProjectCard
                key={row.id}
                project={row}
                canManage={canManage}
                onDuplicate={() => void duplicateProject(row)}
                onRemove={() => void removeProject(row)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-1">
          <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </Button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <Button
            size="xs"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
