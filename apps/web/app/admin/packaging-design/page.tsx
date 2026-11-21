'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, PlusIcon, SearchIcon } from 'lucide-react';
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
  // 区分「真正没有方案」与「筛选无结果」：前者给新建引导，后者给清空筛选
  const filtersApplied = Boolean(applied.keyword || applied.unitType || applied.status);

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
          <Link
            href="/admin/packaging-design/new"
            aria-label="新建包装方案"
            className={buttonVariants()}
          >
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
          filtersApplied ? (
            <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-12 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <SearchIcon className="size-5" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">没有符合条件的方案</p>
                <p className="text-xs text-muted-foreground">
                  调整筛选条件，或清空筛选后查看全部方案。
                </p>
              </div>
              <Button type="button" variant="outline" onClick={resetFilters}>
                清空筛选
              </Button>
            </div>
          ) : (
            <EmptyProjects canManage={canManage} />
          )
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
            {canManage ? (
              <Link
                href="/admin/packaging-design/new"
                aria-label="新建包装方案（列表末尾）"
                className="group flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] p-6 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-105">
                  <PlusIcon className="size-5" />
                </span>
                <span className="text-sm font-medium text-foreground">新建包装方案</span>
                <span className="text-xs text-muted-foreground">从空白方案开始</span>
              </Link>
            ) : null}
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

// 方案库无数据空态（product/包装设计.md R-006）：
// 有新建权限时整块为链接，避免与顶部主色按钮重复；无权限时只展示中性说明。
function EmptyProjects({ canManage }: { canManage: boolean }): React.ReactElement {
  const content = (
    <>
      <span
        className={
          canManage
            ? 'flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary'
            : 'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground'
        }
      >
        <PlusIcon className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">还没有包装方案</p>
        <p className="text-xs text-muted-foreground">
          {canManage
            ? '从空白方案开始，选择结构后即可进入设计工作台。'
            : '当前账号没有新建权限，请联系管理员。'}
        </p>
      </div>
      {canManage ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          开始新建
          <ArrowRightIcon className="size-3.5" />
        </span>
      ) : null}
    </>
  );

  if (!canManage) {
    return (
      <div className="flex h-full min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        {content}
      </div>
    );
  }

  return (
    <Link
      href="/admin/packaging-design/new"
      aria-label="新建包装方案（空态引导）"
      className="flex h-full min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.04] px-6 py-12 text-center transition-colors hover:border-primary/60 hover:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </Link>
  );
}
