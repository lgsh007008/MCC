'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { MobileMaterialIssueForm } from '@/components/mobile/material-issue-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';

type MaterialIssue = ApiSchemas['MaterialIssueDto'];

export default function MobileEditMaterialIssuePage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['material-issues', params.id],
    queryFn: async (): Promise<MaterialIssue> => {
      const { data, response } = await api.GET('/api/v1/material-issues/{id}', {
        params: { path: { id: params.id } },
      });
      if (!response.ok || !data) {
        throw new Error('加载失败');
      }
      return data;
    },
  });

  if (query.isPending) {
    return (
      <div>
        <MobileHeader title="编辑原木领用" backHref={`/m/production/issues/${params.id}`} />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <MobileHeader title="编辑原木领用" backHref="/m/production/issues" />
        <p className="p-4 text-mobile-body text-destructive">原木领用单不存在或加载失败。</p>
      </div>
    );
  }
  return (
    <MobileMaterialIssueForm
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
