'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
import { opsApi } from '@/lib/ops/api';

// 平台审计列表（design/审计日志.md §9）：只读；筛选时间 / 操作人 / 动作 / 目标租户 / 结果。
type AuditRow = ApiSchemas['PlatformAuditLogItemDto'];
type AuditList = ApiSchemas['PlatformAuditLogListDto'];

interface Filters {
  dateFrom: string;
  dateTo: string;
  actor: string;
  action: string;
  targetTenant: string;
  result: '' | 'ok' | 'failed';
}

const EMPTY_LIST: AuditList = { total: 0, items: [] };
const PAGE_SIZE = 20;

const pad = (value: number): string => String(value).padStart(2, '0');
const dateInput = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const defaultFilters = (): Filters => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 29);
  return {
    dateFrom: dateInput(from),
    dateTo: dateInput(to),
    actor: '',
    action: '',
    targetTenant: '',
    result: '',
  };
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
};

export default function OpsAuditLogsPage(): React.ReactElement {
  const initial = defaultFilters();
  const [filters, setFilters] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1);

  const logsQuery = useQuery({
    queryKey: ['ops-audit-logs', page, applied],
    queryFn: async (): Promise<AuditList> => {
      const { data, response } = await opsApi.GET('/api/v1/ops/audit-logs', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
            actor: applied.actor || undefined,
            action: applied.action || undefined,
            targetTenant: applied.targetTenant || undefined,
            result: applied.result || undefined,
          },
        },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败，请稍后重试');
      }
      return data;
    },
  });

  const data = logsQuery.data ?? EMPTY_LIST;
  const rows: AuditRow[] = data.items;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setApplied({ ...filters });
    setPage(1);
  };

  const reset = (): void => {
    const next = defaultFilters();
    setFilters(next);
    setApplied(next);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <form className="flex flex-wrap items-center gap-3" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">时间</span>
          <DatePicker
            value={filters.dateFrom}
            onChange={(value) => setFilters({ ...filters, dateFrom: value })}
            className="w-36"
          />
          <span className="text-xs text-muted-foreground">至</span>
          <DatePicker
            value={filters.dateTo}
            onChange={(value) => setFilters({ ...filters, dateTo: value })}
            className="w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">操作人</span>
          <Input
            value={filters.actor}
            onChange={(event) => setFilters({ ...filters, actor: event.target.value })}
            placeholder="账号名"
            className="h-8 w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">动作</span>
          <Input
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
            placeholder="动作标识"
            className="h-8 w-32"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">目标租户</span>
          <Input
            value={filters.targetTenant}
            onChange={(event) => setFilters({ ...filters, targetTenant: event.target.value })}
            placeholder="编号或名称"
            className="h-8 w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">结果</span>
          <Select
            value={filters.result}
            onChange={(value) => setFilters({ ...filters, result: value as Filters['result'] })}
            options={[
              { value: '', label: '全部' },
              { value: 'ok', label: '成功' },
              { value: 'failed', label: '失败' },
            ]}
            className="w-24"
          />
        </div>
        <Button type="submit" variant="secondary">
          查询
        </Button>
        <Button type="button" variant="outline" onClick={reset}>
          重置
        </Button>
      </form>

      {logsQuery.isError ? <p className="text-sm text-destructive">加载失败，请稍后重试</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>目标租户</TableHead>
              <TableHead>对象</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isPending ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  暂无审计记录
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatTime(row.createdAt)}
                  </TableCell>
                  <TableCell>{row.actorUsername || '—'}</TableCell>
                  <TableCell>{row.actionLabel ?? `${row.domain} / ${row.action}`}</TableCell>
                  <TableCell>
                    {row.targetTenantCode
                      ? `${row.targetTenantCode}${row.targetTenantName ? ` · ${row.targetTenantName}` : ''}`
                      : '—'}
                  </TableCell>
                  <TableCell>{row.objectCode || row.objectType || '—'}</TableCell>
                  <TableCell className={row.result === 'failed' ? 'text-destructive' : ''}>
                    {row.result === 'ok' ? '成功' : row.result === 'failed' ? '失败' : row.result}
                    {row.errorCode ? `（${row.errorCode}）` : null}
                  </TableCell>
                  <TableCell>{row.ip || '—'}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-start gap-3">
        <span className="text-sm text-muted-foreground">
          第 {page} / {totalPages} 页 · 共 {data.total} 条
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}
