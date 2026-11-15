'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { buttonVariants } from '@/components/ui/button';
import { PageFrame } from '@/components/admin/page-frame';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { useCan } from '@/components/auth/permission-context';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatAmount, formatQuantity } from '@/lib/format';

// 方木产出详情（product/生产与库存.md R-生产-005）：只读；删除只在列表行操作。

type ProductionOutput = ApiSchemas['ProductionOutputDto'];

export default function ProductionOutputDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const canManage = useCan('production:manage');
  const id = params.id;
  const query = useQuery({
    queryKey: ['production-outputs', id],
    queryFn: async (): Promise<ProductionOutput> => {
      const { data, response } = await api.GET('/api/v1/production-outputs/{id}', {
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
    return <p className="text-sm text-destructive">方木产出单不存在或加载失败。</p>;
  }
  const output = query.data;

  return (
    <PageFrame
      title={output.code}
      actions={
        <>
          {canManage ? (
            <Link href={`/admin/production/outputs/${output.id}/edit`} className={buttonVariants()}>
              编辑
            </Link>
          ) : null}
          <Link href="/admin/production/outputs" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <div><span className="text-muted-foreground">产出日期：</span>{output.outputDate}</div>
            <div><span className="text-muted-foreground">产出总方数：</span>{formatQuantity(output.totalVolume)}</div>
            <div><span className="text-muted-foreground">本次结转金额：</span>{formatAmount(output.settledAmount)} 元</div>
            <div><span className="text-muted-foreground">创建时间：</span>{output.createdAt.slice(0, 19).replace('T', ' ')}</div>
            {output.sourceIssueCodes.length > 0 ? (
              <div className="sm:col-span-2 xl:col-span-3">
                <span className="text-muted-foreground">来源领用单：</span>
                {output.sourceIssueCodes.join('、')}
              </div>
            ) : null}
            <div className="sm:col-span-2 xl:col-span-3">
              <span className="text-muted-foreground">备注：</span>
              {output.note || '—'}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-medium">产出明细</div>
          <Table containerClassName="max-h-[420px] overflow-y-auto">
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
              <TableRow>
                <TableHead>行序</TableHead>
                <TableHead>长度（mm）</TableHead>
                <TableHead>宽度（mm）</TableHead>
                <TableHead>高度（mm）</TableHead>
                <TableHead>根数</TableHead>
                <TableHead>方量（m³）</TableHead>
                <TableHead>备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {output.outputs.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.seq}</TableCell>
                  <TableCell>{line.lengthMm}</TableCell>
                  <TableCell>{line.widthMm}</TableCell>
                  <TableCell>{line.heightMm}</TableCell>
                  <TableCell>{line.pieces}</TableCell>
                  <TableCell className="tabular-nums">{formatQuantity(line.volumeM3)}</TableCell>
                  <TableCell>{line.note || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </div>
    </PageFrame>
  );
}
