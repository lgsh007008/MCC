'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { ROLE_LABELS, type UserRole } from '@mcc/shared';
import type { ApiSchemas } from '@mcc/shared';
import { api } from '@/lib/api';

// 审计日志列表页（product/审计日志.md R-审计-001；页面模式见 product/平台布局.md）：
// 只读查询：时间范围 / 操作人 / 领域 / 动作 / 结果 + 分页；无多选、无批量、无删除。

// 表格行 = 契约审计日志，非手写 DTO
type AuditRow = ApiSchemas['AuditLogItemDto'];
type AuditLogList = ApiSchemas['AuditLogListDto'];

interface Filters {
  dateFrom: string;
  dateTo: string;
  actor: string;
  domain: string;
  action: string;
  result: '' | 'ok' | 'failed';
}

const EMPTY_LIST: AuditLogList = { total: 0, items: [] };

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
    domain: '',
    action: '',
    result: '',
  };
};

const formatTime = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
};

const roleLabel = (role?: string | null): string =>
  role && role in ROLE_LABELS ? ROLE_LABELS[role as UserRole] : role || '—';

export default function AuditLogsPage(): React.ReactElement {
  const initial = defaultFilters();
  const [filters, setFilters] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [page, setPage] = useState(1);

  const logsQuery = useQuery({
    queryKey: ['audit-logs', page, applied],
    queryFn: async (): Promise<AuditLogList> => {
      const { data: res, response } = await api.GET('/api/v1/audit-logs', {
        params: {
          query: {
            page,
            pageSize: PAGE_SIZE,
            dateFrom: applied.dateFrom || undefined,
            dateTo: applied.dateTo || undefined,
            actor: applied.actor || undefined,
            domain: applied.domain || undefined,
            action: applied.action || undefined,
            result: applied.result || undefined,
          },
        },
      });
      if (!response.ok || !res) {
        throw new Error('加载失败，请稍后重试');
      }
      return res;
    },
  });

  const data = logsQuery.data ?? EMPTY_LIST;
  const rows: AuditRow[] = data.items;
  const total = data.total;
  const loading = logsQuery.isPending;
  const error = logsQuery.isError ? '加载失败，请稍后重试' : null;

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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
            className="h-8 w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">领域</span>
          <Select
            value={filters.domain}
            onChange={(value) => setFilters({ ...filters, domain: value })}
            options={[
              { value: '', label: '全部' },
              { value: 'auth', label: '账号与权限' },
              { value: 'order', label: '订单' },
              { value: 'customer', label: '客户' },
              { value: 'finance', label: '财务' },
              { value: 'audit', label: '审计' },
            ]}
            className="w-32"
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
          <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">结果</span>
          <Select
            value={filters.result}
            onChange={(value) =>
              setFilters({ ...filters, result: value as Filters['result'] })
            }
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

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="min-h-60 flex-1 rounded-lg border border-border bg-card">
        <Table containerClassName="h-full overflow-y-auto">
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>动作</TableHead>
              <TableHead>对象</TableHead>
              <TableHead>结果</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
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
                  <TableCell>{roleLabel(row.actorRole)}</TableCell>
                  <TableCell>
                    {row.actionLabel ?? `${row.domain} / ${row.action}`}
                  </TableCell>
                  <TableCell>
                    {row.objectCode || row.objectType || '—'}
                  </TableCell>
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
          第 {page} / {totalPages} 页 · 共 {total} 条
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
