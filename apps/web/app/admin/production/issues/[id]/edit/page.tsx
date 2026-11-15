'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { MaterialIssueForm } from '@/components/production/material-issue-form';
import { api } from '@/lib/api';

type MaterialIssue = ApiSchemas['MaterialIssueDto'];

export default function EditMaterialIssuePage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const query = useQuery({
    queryKey: ['material-issues', id],
    queryFn: async (): Promise<MaterialIssue> => {
      const { data, response } = await api.GET('/api/v1/material-issues/{id}', {
        params: { path: { id } },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败');
      }
      return data;
    },
  });
  usePageCrumb(query.data ? [{ title: query.data.code }, { title: '编辑' }] : [{ title: '编辑' }]);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">原木领用单不存在或加载失败。</p>;
  }
  return (
    <MaterialIssueForm
      initial={{
        id: query.data.id,
        code: query.data.code,
        issueDate: query.data.issueDate,
        tons: query.data.tons,
        note: query.data.note,
      }}
    />
  );
}
