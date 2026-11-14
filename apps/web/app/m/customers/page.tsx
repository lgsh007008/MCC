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
  MobileListSearch,
  MobileListState,
} from '@/components/mobile/list';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// 客户移动列表（product/customer.md 移动页）：名称搜索 + 卡片 + 加载更多；
// 页面骨架与销售单共用 MobileListPage，主操作「新建客户」固定在底部（customer:manage 才显示）。
type CustomerListItem = ApiSchemas['CustomerDto'];
type CustomerListPage = ApiSchemas['CustomerListDto'];

const PAGE_SIZE = 20;

async function fetchCustomers(page: number, name: string): Promise<CustomerListPage> {
  const { data: res, response } = await api.GET('/api/v1/customers', {
    params: {
      query: {
        page,
        pageSize: PAGE_SIZE,
        name: name || undefined,
        sortOrder: 'desc',
      },
    },
  });
  if (!response.ok || !res) {
    throw new Error('加载失败，请稍后重试');
  }
  return res;
}

export default function MobileCustomersPage(): React.ReactElement {
  const canManage = useCan('customer:manage');
  const [keyword, setKeyword] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);

  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['customers', index + 1, applied],
      queryFn: () => fetchCustomers(index + 1, applied),
    })),
  });
  const items: CustomerListItem[] = listQueries.flatMap((query) => query.data?.items ?? []);
  const lastQuery = listQueries[listQueries.length - 1];
  const total = listQueries.reduce((acc, query) => query.data?.total ?? acc, 0);
  const loading = listQueries.some((query) => query.isFetching);
  const error = lastQuery?.isError ? '加载失败，请稍后重试' : null;

  const handleSearch = (value?: string): void => {
    setApplied((value ?? keyword).trim());
    setPage(1);
  };

  const hasMore = items.length < total;

  return (
    <MobileListPage
      title="客户档案"
      backHref="/m"
      search={
        <MobileListSearch
          value={keyword}
          onChange={setKeyword}
          onSearch={handleSearch}
          placeholder="搜索客户名称"
        />
      }
      action={
        canManage ? (
          <Link
            href="/m/customers/new"
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            新建客户
          </Link>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}

      {!error && loading && items.length === 0 ? (
        <MobileListState>加载中…</MobileListState>
      ) : null}

      {!error && !loading && items.length === 0 ? (
        <MobileListState>暂无客户</MobileListState>
      ) : null}

      {items.map((customer) => (
        <MobileListCard
          key={customer.id}
          href={`/m/customers/${customer.id}`}
          topRight={customer.status === 'active' ? '启用' : '停用'}
          title={customer.name}
          subtitle={customer.contact || '未填写联系信息'}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((prev) => prev + 1)} />
      ) : null}
    </MobileListPage>
  );
}
