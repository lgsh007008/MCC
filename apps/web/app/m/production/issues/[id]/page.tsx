'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon } from 'lucide-react';
import type { ApiSchemas } from '@mcc/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { useCan } from '@/components/auth/permission-context';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { MobileInfoRow } from '@/components/mobile/info-row';
import { MobileActionBar, MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';
import { cn } from '@/lib/utils';

// 移动原木领用详情（product/生产与库存.md R-生产-001）：只读 + 编辑 / 删除。

type MaterialIssue = ApiSchemas['MaterialIssueDto'];

export default function MobileMaterialIssueDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const canManage = useCan('production:manage');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
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

  async function remove(): Promise<void> {
    if (!query.data) {
      return;
    }
    setActionError(null);
    try {
      const ok = await confirm({
        title: '删除原木领用单',
        description: `将删除 ${query.data.code}。删除后不可恢复，编号不回收。`,
        confirmText: '删除',
        tone: 'danger',
        onConfirm: async () => {
          const { response } = await api.DELETE('/api/v1/material-issues/{id}', {
            params: { path: { id: query.data!.id } },
          });
          if (!response.ok) {
            throw new Error('删除失败');
          }
        },
      });
      if (ok) {
        await queryClient.invalidateQueries({ queryKey: ['material-issues'] });
        await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
        router.replace('/m/production/issues');
      }
    } catch {
      setActionError('删除失败，请稍后重试');
    }
  }

  if (query.isPending) {
    return (
      <div>
        <MobileHeader title="原木领用详情" backHref="/m/production/issues" />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <MobileHeader title="原木领用详情" backHref="/m/production/issues" />
        <p className="p-4 text-mobile-body text-destructive">原木领用单不存在或加载失败。</p>
      </div>
    );
  }
  const issue = query.data;

  return (
    <div className="pb-24">
      <MobileHeader title={issue.code} backHref="/m/production/issues" />
      <div className="space-y-4 p-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4">
          <MobileInfoRow label="领用日期" value={issue.issueDate} />
          <MobileInfoRow
            label="生产批次"
            value={
              <Link href={`/m/production/batches/${issue.batchId}`} className="text-primary">
                {issue.batchCode}
              </Link>
            }
          />
          <MobileInfoRow label="领用吨数" value={`${formatQuantity(issue.tons)} 吨`} />
          <MobileInfoRow
            label="结转状态"
            value={issue.settlementStatus === 'pending' ? '待结转' : '已结转'}
          />
          <MobileInfoRow label="已结转" value={`${formatAmount(issue.settledAmount)} 元`} />
          <MobileInfoRow label="待结转" value={`${formatAmount(issue.pendingAmount)} 元`} />
          {issue.settledByCodes.length > 0 ? (
            <MobileInfoRow label="结转来源" value={issue.settledByCodes.join('、')} />
          ) : null}
          <MobileInfoRow label="创建时间" value={issue.createdAt.slice(0, 19).replace('T', ' ')} />
          <MobileInfoRow label="备注" value={issue.note || '—'} />
        </section>

        {canManage ? (
          <section className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="h-12 w-full border-destructive/40 text-mobile-body text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void remove()}
            >
              <Trash2Icon className="size-4" />
              删除原木领用单
            </Button>
            {actionError ? (
              <p role="alert" className="text-mobile-body text-destructive">
                {actionError}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <MobileActionBar>
        {canManage ? (
          <Link
            href={`/m/production/issues/${issue.id}/edit`}
            className={cn(buttonVariants(), 'h-12 flex-1 text-mobile-body')}
          >
            编辑
          </Link>
        ) : null}
        <Link
          href="/m/production/issues"
          className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-mobile-body')}
        >
          返回列表
        </Link>
      </MobileActionBar>
    </div>
  );
}
