'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQueries } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import {
  MobileListCard,
  MobileListLoadMore,
  MobileListPage,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

// 移动原木领用列表（product/生产与库存.md R-生产-001）：
// 卡片按领用日期倒序 + 加载更多 + 底部新建；不设筛选组与批量操作。

type IssueList = ApiSchemas['MaterialIssueListDto'];
type IssueRow = ApiSchemas['MaterialIssueDto'];

const PAGE_SIZE = 20;

async function fetchIssues(page: number): Promise<IssueList> {
  const { data, response } = await api.GET('/api/v1/material-issues', {
    params: { query: { page, pageSize: PAGE_SIZE } },
  });
  if (!response.ok || !data) {
    throw new Error('加载失败，请稍后重试');
  }
  return data;
}

export default function MobileMaterialIssuesPage(): React.ReactElement {
  const canManage = useCan('production:manage');
  const [page, setPage] = useState(1);
  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['material-issues', index + 1],
      queryFn: () => fetchIssues(index + 1),
    })),
  });
  const items: IssueRow[] = listQueries.flatMap((query) => query.data?.items ?? []);
  const lastQuery = listQueries[listQueries.length - 1];
  const total = lastQuery?.data?.total ?? 0;
  const loading = listQueries.some((query) => query.isFetching);
  const error = lastQuery?.isError ? '加载失败，请稍后重试' : null;
  const hasMore = items.length < total;

  return (
    <MobileListPage
      title="原木领用"
      backHref="/m/production"
      action={
        canManage ? (
          <Link
            href="/m/production/issues/new"
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            新建原木领用
          </Link>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}
      {!error && loading && items.length === 0 ? <MobileListState>加载中…</MobileListState> : null}
      {!error && !loading && items.length === 0 ? <MobileListState>暂无原木领用单</MobileListState> : null}

      {items.map((row) => (
        <MobileListCard
          key={row.id}
          href={`/m/production/issues/${row.id}`}
          topLeft={row.issueDate}
          topRight={row.settlementStatus === 'pending' ? '待结转' : '已结转'}
          title={row.code}
          amount={`${formatQuantity(row.tons)} 吨`}
          subtitle={`批次 ${row.batchCode}`}
          note={row.note || undefined}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((value) => value + 1)} />
      ) : null}
    </MobileListPage>
  );
}
