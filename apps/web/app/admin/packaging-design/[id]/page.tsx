'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { Button } from '@/components/ui/button';
import { PackagingEditor } from '@/components/packaging/packaging-editor';
import { api } from '@/lib/api';

export default function PackagingDesignDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const query = useQuery({
    queryKey: ['packaging-project', id],
    queryFn: async (): Promise<ApiSchemas['PackagingProjectDto']> => {
      const { data, response } = await api.GET('/api/v1/packaging/projects/{id}', {
        params: { path: { id } },
      });
      if (!response.ok || !data) {
        throw new Error(response.status === 404 ? '包装方案不存在或已删除' : '加载失败');
      }
      return data;
    },
  });

  usePageCrumb([{ title: query.data?.code ?? '包装设计' }]);

  if (query.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">正在加载包装方案…</div>;
  }
  if (query.isError || !query.data) {
    return (
      <div className="grid gap-3 p-6">
        <p className="text-sm text-destructive">
          {query.error instanceof Error ? query.error.message : '加载失败'}
        </p>
        <Button variant="outline" onClick={() => router.push('/admin/packaging-design')}>
          返回列表
        </Button>
      </div>
    );
  }
  return <PackagingEditor key={query.data.id} initial={query.data} />;
}
