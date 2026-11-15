'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ApiSchemas } from '@mcc/shared';
import { MobileProductionOutputForm } from '@/components/mobile/production-output-form';
import { MobileHeader } from '@/components/mobile/mobile-shell';
import { api } from '@/lib/api';

type ProductionOutput = ApiSchemas['ProductionOutputDto'];

export default function MobileEditProductionOutputPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const query = useQuery({
    queryKey: ['production-outputs', params.id],
    queryFn: async (): Promise<ProductionOutput> => {
      const { data, response } = await api.GET('/api/v1/production-outputs/{id}', {
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
        <MobileHeader title="编辑方木产出" backHref={`/m/production/outputs/${params.id}`} />
        <p className="p-4 text-mobile-body text-muted-foreground">加载中…</p>
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div>
        <MobileHeader title="编辑方木产出" backHref="/m/production/outputs" />
        <p className="p-4 text-mobile-body text-destructive">方木产出单不存在或加载失败。</p>
      </div>
    );
  }
  return (
    <MobileProductionOutputForm
      initial={{
        id: query.data.id,
        code: query.data.code,
        outputDate: query.data.outputDate,
        note: query.data.note,
        outputs: query.data.outputs.map((line) => ({
          id: line.id,
          lengthMm: line.lengthMm,
          widthMm: line.widthMm,
          heightMm: line.heightMm,
          pieces: line.pieces,
          note: line.note,
        })),
      }}
    />
  );
}
