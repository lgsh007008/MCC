'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CopyIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react';
import { PALLET_TEMPLATE_OPTIONS, type ApiSchemas } from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';

type PalletProjectRow = ApiSchemas['PalletProjectListItemDto'];
type TemplateFilter = '' | (typeof PALLET_TEMPLATE_OPTIONS)[number]['value'] | 'custom';

const PAGE_SIZE = 20;

const templateLabel = (value: string): string =>
  PALLET_TEMPLATE_OPTIONS.find((option) => option.value === value)?.label ?? '自定义';

export default function PalletDesignPage(): React.ReactElement {
  const canManage = useCan('pallet:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = React.useState('');
  const [template, setTemplate] = React.useState<TemplateFilter>('');
  const [applied, setApplied] = React.useState<{ keyword: string; template: TemplateFilter }>({
    keyword: '',
    template: '',
  });
  const [page, setPage] = React.useState(1);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['pallet-projects', page, applied],
    queryFn: async (): Promise<{ total: number; items: PalletProjectRow[] }> => {
      const { data, response } = await api.GET('/api/v1/pallet/projects', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            keyword: applied.keyword || undefined,
            templateType: (applied.template || undefined) as
              | 'block'
              | 'stringer'
              | 'notched'
              | 'skid'
              | 'plywood'
              | 'custom'
              | undefined,
          },
        },
      });
      if (!response.ok || !data) {
        throw new Error('托盘项目加载失败');
      }
      return data;
    },
  });

  const total = listQuery.data?.total ?? 0;
  const items = listQuery.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = (): void => {
    setApplied({ keyword: keyword.trim(), template });
    setPage(1);
  };

  const resetFilters = (): void => {
    setKeyword('');
    setTemplate('');
    setApplied({ keyword: '', template: '' });
    setPage(1);
  };

  const removeProject = async (row: PalletProjectRow): Promise<void> => {
    try {
      await confirm({
        title: '删除托盘项目',
        description: `将删除 ${row.code}「${row.name}」。删除后可重新建项目，但编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/pallet/projects/{id}', {
            params: { path: { id: row.id } },
          });
          if (!response.ok) {
            throw new Error(`删除失败（${response.status}）`);
          }
          await queryClient.invalidateQueries({ queryKey: ['pallet-projects'] });
        },
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除失败');
    }
  };

  const duplicateProject = async (row: PalletProjectRow): Promise<void> => {
    setActionError(null);
    const { data, response } = await api.POST('/api/v1/pallet/projects/{id}/duplicate', {
      params: { path: { id: row.id } },
    });
    if (!response.ok || !data) {
      setActionError(`复制失败（${response.status}）`);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['pallet-projects'] });
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold">托盘设计</h1>
          <p className="text-xs text-muted-foreground">结构模板、构件、2D / 3D 工程图与木材料单。</p>
        </div>
        {canManage ? (
          <Link href="/admin/pallet-design/new" className={buttonVariants()}>
            <PlusIcon />
            新建托盘项目
          </Link>
        ) : null}
      </div>

      {actionError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3">
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">关键字</span>
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyFilters();
            }}
            placeholder="项目名称 / 编号 / 客户名称"
            className="w-64"
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="text-muted-foreground">结构模板</span>
          <Select
            value={template}
            onChange={(value) => setTemplate(value as TemplateFilter)}
            options={[
              { value: '', label: '全部模板' },
              ...PALLET_TEMPLATE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
              { value: 'custom', label: '自定义' },
            ]}
            className="w-52"
            ariaLabel="结构模板筛选"
          />
        </label>
        <Button onClick={applyFilters}>
          <SearchIcon />
          查询
        </Button>
        <Button variant="outline" onClick={resetFilters}>
          重置
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
        <Table containerClassName="max-h-full">
          <TableHeader>
            <TableRow>
              <TableHead>项目编号</TableHead>
              <TableHead className="min-w-44">项目名称</TableHead>
              <TableHead className="min-w-32">客户</TableHead>
              <TableHead>结构模板</TableHead>
              <TableHead>外形尺寸</TableHead>
              <TableHead className="text-right">体积 / 重量</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  正在加载…
                </TableCell>
              </TableRow>
            ) : listQuery.isError ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-destructive">
                  加载失败，请稍后重试。
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                  还没有托盘项目，点击右上角「新建托盘项目」开始。
                </TableCell>
              </TableRow>
            ) : (
              items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium tabular-nums">{row.code}</TableCell>
                  <TableCell>
                    <Link href={`/admin/pallet-design/${row.id}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>{row.customerName || '—'}</TableCell>
                  <TableCell>{templateLabel(row.templateType)}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.lengthMm}×{row.widthMm}×{row.totalHeightMm} mm
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(row.totalVolumeM3).toFixed(5)} m³ / {Number(row.totalWeightKg).toFixed(1)} kg
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(row.updatedAt).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/pallet-design/${row.id}`}
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
                        aria-label="编辑"
                      >
                        <PencilIcon />
                      </Link>
                      {canManage ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void duplicateProject(row)}
                            aria-label="复制"
                          >
                            <CopyIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => void removeProject(row)}
                            aria-label="删除"
                          >
                            <Trash2Icon />
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
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
