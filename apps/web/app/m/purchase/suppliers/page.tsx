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

// 供应商移动列表（product/supplier.md 移动页）：名称搜索 + 卡片（名称 / 应付 / 状态）+ 加载更多。

// 类型取自契约生成产物（ADR-006），应付为跨域派生列
type SupplierListItem = ApiSchemas['SupplierDto'] & { outstanding: string };

interface SupplierListPage {
  total: number;
  items: SupplierListItem[];
}

const PAGE_SIZE = 20;

async function fetchSuppliers(page: number, name: string): Promise<SupplierListPage> {
  const { data, response } = await api.GET('/api/v1/suppliers', {
    params: {
      query: {
        page,
        pageSize: PAGE_SIZE,
        name: name || undefined,
      },
    },
  });
  if (!response.ok || !data) {
    throw new Error('加载失败，请稍后重试');
  }
  const ids = data.items.map((item) => item.id);
  let payables: Record<string, string> = {};
  if (ids.length > 0) {
    const payableRes = await api.GET('/api/v1/finance/payables', {
      params: { query: { supplierIds: ids.join(',') } },
    });
    if (payableRes.response.ok && payableRes.data) {
      payables = Object.fromEntries(
        payableRes.data.items.map((item) => [item.supplierId, item.outstanding]),
      );
    }
  }
  const rows: SupplierListItem[] = data.items.map((item) => ({
    ...item,
    outstanding: payables[item.id] ?? '0.00',
  }));
  return { total: data.total, items: rows };
}

export default function MobileSuppliersPage(): React.ReactElement {
  const canManage = useCan('supplier:manage');
  const [keyword, setKeyword] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);

  const listQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => ({
      queryKey: ['suppliers', index + 1, applied],
      queryFn: () => fetchSuppliers(index + 1, applied),
    })),
  });
  const items: SupplierListItem[] = listQueries.flatMap((query) => query.data?.items ?? []);
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
      title="供应商"
      backHref="/m/purchase"
      search={
        <MobileListSearch
          value={keyword}
          onChange={setKeyword}
          onSearch={handleSearch}
          placeholder="搜索供应商名称"
        />
      }
      action={
        canManage ? (
          <Link
            href="/m/purchase/suppliers/new"
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            新建供应商
          </Link>
        ) : null
      }
    >
      {error ? <MobileListState tone="error">{error}</MobileListState> : null}
      {!error && loading && items.length === 0 ? (
        <MobileListState>加载中…</MobileListState>
      ) : null}
      {!error && !loading && items.length === 0 ? (
        <MobileListState>暂无供应商</MobileListState>
      ) : null}

      {items.map((supplier) => (
        <MobileListCard
          key={supplier.id}
          href={`/m/purchase/suppliers/${supplier.id}`}
          topRight={supplier.status === 'active' ? '启用' : '停用'}
          title={supplier.name}
          subtitle={`应付 ${supplier.outstanding}${supplier.contact ? ` · ${supplier.contact}` : ''}`}
        />
      ))}

      {hasMore ? (
        <MobileListLoadMore loading={loading} onClick={() => setPage((prev) => prev + 1)} />
      ) : null}
    </MobileListPage>
  );
}
