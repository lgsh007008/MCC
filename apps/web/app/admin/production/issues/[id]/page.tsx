'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useCan } from '@/components/auth/permission-context';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 原木领用详情（product/生产与库存.md R-生产-001）：只读；删除只在列表行操作。

type MaterialIssue = ApiSchemas['MaterialIssueDto'];

export default function MaterialIssueDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const canManage = useCan('production:manage');
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
  usePageCrumb(query.data ? [{ title: query.data.code }] : []);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">原木领用单不存在或加载失败。</p>;
  }
  const issue = query.data;

  return (
    <PageFrame
      title={issue.code}
      actions={
        <>
          {canManage ? (
            <Link href={`/admin/production/issues/${issue.id}/edit`} className={buttonVariants()}>
              编辑
            </Link>
          ) : null}
          <Link href="/admin/production/issues" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
          <div><span className="text-muted-foreground">领用日期：</span>{issue.issueDate}</div>
          <div>
            <span className="text-muted-foreground">生产批次：</span>
            <Link href={`/admin/production/batches/${issue.batchId}`} className="text-primary hover:underline">
              {issue.batchCode}
            </Link>
          </div>
          <div><span className="text-muted-foreground">领用吨数：</span>{formatQuantity(issue.tons)}</div>
          <div>
            <span className="text-muted-foreground">结转状态：</span>
            {issue.settlementStatus === 'pending' ? '待结转' : '已结转'}
          </div>
          <div><span className="text-muted-foreground">已结转金额：</span>{formatAmount(issue.settledAmount)} 元</div>
          <div><span className="text-muted-foreground">待结转金额：</span>{formatAmount(issue.pendingAmount)} 元</div>
          <div><span className="text-muted-foreground">创建时间：</span>{issue.createdAt.slice(0, 19).replace('T', ' ')}</div>
          {issue.settledByCodes.length > 0 ? (
            <div className="sm:col-span-2 xl:col-span-3">
              <span className="text-muted-foreground">结转来源：</span>
              {issue.settledByCodes.join('、')}
            </div>
          ) : null}
          <div className="sm:col-span-2 xl:col-span-3">
            <span className="text-muted-foreground">备注：</span>
            {issue.note || '—'}
          </div>
        </div>
      </section>
    </PageFrame>
  );
}
