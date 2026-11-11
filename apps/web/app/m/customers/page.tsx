'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';
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
interface CustomerListItem {
  id: string;
  name: string;
  contact: string;
  status: string;
}

const PAGE_SIZE = 20;

export default function MobileCustomersPage(): React.ReactElement {
  const canManage = useCan('customer:manage');
  const [keyword, setKeyword] = useState('');
  const [query, setQuery] = useState({ keyword: '', page: 1 });
  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { data, response } = await api.GET('/api/v1/customers', {
          params: {
            query: {
              page: query.page,
              pageSize: PAGE_SIZE,
              name: query.keyword || undefined,
              sortOrder: 'desc',
            },
          },
        });
        if (cancelled) {
          return;
        }
        if (!response.ok || !data) {
          setError('加载失败，请稍后重试');
          return;
        }
        setItems((prev) => (query.page === 1 ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setError(null);
      } catch {
        if (!cancelled) {
          setError('加载失败，请稍后重试');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleSearch = (value?: string): void => {
    const next = (value ?? keyword).trim();
    setItems([]);
    setTotal(0);
    setQuery({ keyword: next, page: 1 });
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
            className={cn(buttonVariants(), 'h-12 flex-1 text-base')}
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
        <MobileListCard key={customer.id} href={`/m/customers/${customer.id}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-medium">{customer.name}</p>
              <p className="mt-1 truncate text-base text-muted-foreground">
                {customer.contact || '未填写联系信息'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {customer.status === 'active' ? '启用' : '停用'}
              </span>
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            </div>
          </div>
        </MobileListCard>
      ))}

      {hasMore ? (
        <MobileListLoadMore
          loading={loading}
          onClick={() => setQuery((prev) => ({ ...prev, page: prev.page + 1 }))}
        />
      ) : null}
    </MobileListPage>
  );
}
