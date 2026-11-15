'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { ProductionOutputForm } from '@/components/production/production-output-form';
import { api } from '@/lib/api';

type ProductionOutput = ApiSchemas['ProductionOutputDto'];

export default function EditProductionOutputPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
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
  usePageCrumb(query.data ? [{ title: query.data.code }, { title: '编辑' }] : [{ title: '编辑' }]);

  if (query.isPending) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }
  if (query.isError || !query.data) {
    return <p className="text-sm text-destructive">方木产出单不存在或加载失败。</p>;
  }
  return (
    <ProductionOutputForm
      initial={{
        id: query.data.id,
        code: query.data.code,
        outputDate: query.data.outputDate,
        note: query.data.note,
        outputs: query.data.outputs.map((output) => ({
          id: output.id,
          lengthMm: output.lengthMm,
          widthMm: output.widthMm,
          heightMm: output.heightMm,
          pieces: output.pieces,
          note: output.note,
        })),
      }}
    />
  );
}
