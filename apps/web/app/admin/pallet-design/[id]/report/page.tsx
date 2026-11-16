'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import {
  buildPalletGeometry,
  calcPalletBom,
  PALLET_TEMPLATE_OPTIONS,
  validatePalletStructure,
  type ApiSchemas,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
  type PalletTemplateType,
} from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { Button, buttonVariants } from '@/components/ui/button';
import { PalletDrawing2D } from '@/components/pallet/pallet-drawing-2d';
import { api } from '@/lib/api';

type PalletProjectDto = ApiSchemas['PalletProjectDto'];
type PalletMaterialDto = ApiSchemas['PalletMaterialDto'];

const templateLabel = (value: string): string =>
  PALLET_TEMPLATE_OPTIONS.find((option) => option.value === value)?.label ?? '自定义';

const toComponents = (items: PalletProjectDto['components']): PalletComponentInput[] =>
  items.map((item) => ({
    role: item.role as PalletComponentRole,
    name: item.name,
    materialCode: item.materialCode,
    orientation: item.orientation === 'y' ? 'y' : 'x',
    lengthMm: item.lengthMm,
    widthMm: item.widthMm,
    heightMm: item.heightMm,
    quantity: item.quantity,
    wastePct: item.wastePct,
    processCost: item.processCost,
    priceOverride: item.priceOverride,
  }));

const toMaterials = (items: PalletMaterialDto[] | undefined): PalletMaterialLike[] =>
  (items ?? []).map((item) => ({
    code: item.code,
    name: item.name,
    densityKgM3: item.densityKgM3,
    pricePerM3: Number(item.pricePerM3),
    fumigation: item.fumigation,
    color: item.color,
  }));

export default function PalletReportPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const projectQuery = useQuery({
    queryKey: ['pallet-project', id],
    queryFn: async (): Promise<PalletProjectDto> => {
      const { data, response } = await api.GET('/api/v1/pallet/projects/{id}', {
        params: { path: { id } },
      });
      if (!response.ok || !data) {
        throw new Error('托盘项目加载失败');
      }
      return data;
    },
  });
  const materialsQuery = useQuery({
    queryKey: ['pallet-materials'],
    queryFn: async (): Promise<PalletMaterialDto[]> => {
      const { data, response } = await api.GET('/api/v1/pallet/materials');
      if (!response.ok || !data) {
        throw new Error('材料目录加载失败');
      }
      return data;
    },
  });

  usePageCrumb([{ title: '打印报告' }]);

  const report = React.useMemo(() => {
    const project = projectQuery.data;
    if (!project) return null;
    const components = toComponents(project.components);
    const materials = toMaterials(materialsQuery.data);
    const geometry = buildPalletGeometry(
      {
        lengthMm: project.lengthMm,
        widthMm: project.widthMm,
        templateType: project.templateType as PalletTemplateType,
      },
      components,
    );
    const bom = calcPalletBom(components, materials);
    const issues = validatePalletStructure(
      { widthMm: project.widthMm, templateType: project.templateType as PalletTemplateType },
      components,
    );
    return { project, components, geometry, bom, issues };
  }, [projectQuery.data, materialsQuery.data]);

  if (projectQuery.isLoading || materialsQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">正在生成报告…</div>;
  }
  if (!report) {
    return <div className="p-6 text-sm text-destructive">报告数据加载失败。</div>;
  }
  const { project, geometry, bom, issues } = report;

  return (
    <div className="min-h-full bg-muted/30 print:bg-white">
      <div className="mx-auto flex w-full max-w-[1020px] flex-col gap-3 p-4 print:max-w-none print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/admin/pallet-design/${project.id}`} className={buttonVariants({ variant: 'outline' })}>
            返回编辑器
          </Link>
          <Button onClick={() => window.print()}>
            <PrinterIcon />
            打印 / 另存 PDF
          </Button>
        </div>

        <article className="break-inside-avoid bg-white p-8 text-black shadow-sm print:shadow-none">
          <header className="border-b border-neutral-300 pb-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs tracking-[0.3em] text-neutral-500">MEIHAO WOOD</div>
                <h1 className="mt-1 text-2xl font-semibold">托盘结构图与木材料单</h1>
              </div>
              <div className="text-right text-xs text-neutral-500">
                <div>项目编号：{project.code}</div>
                <div>打印日期：{new Date().toLocaleDateString('zh-CN')}</div>
              </div>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
            {[
              ['项目名称', project.name],
              ['客户名称', project.customerName || '—'],
              ['结构模板', templateLabel(project.templateType)],
              ['外形尺寸', `${project.lengthMm}×${project.widthMm}×${project.totalHeightMm} mm`],
              ['使用范围', project.destination === 'export' ? '出口' : '内销'],
              ['进叉方向', project.entryDirection === '4' ? '四向进叉' : '两向进叉'],
              ['目标载荷', project.targetLoadKg ? `${project.targetLoadKg} kg` : '—'],
              ['构件件数', `${geometry.pieces.length} 件`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="font-medium">{value}</div>
              </div>
            ))}
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">结构视图</h2>
            <div className="rounded border border-neutral-300 p-2">
              <PalletDrawing2D geometry={geometry} view="three" selectedIndex={-1} />
            </div>
          </section>

          <section className="mt-6 break-inside-avoid">
            <div className="mb-2 flex items-end justify-between">
              <h2 className="text-sm font-semibold">木材料单</h2>
              <div className="text-xs text-neutral-500">
                净体积 {bom.netVolumeM3.toFixed(5)} m³ · 估算重量 {bom.weightKg.toFixed(1)} kg
              </div>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-100 text-left">
                  <th className="border border-neutral-300 px-2 py-1.5">构件</th>
                  <th className="border border-neutral-300 px-2 py-1.5">材料</th>
                  <th className="border border-neutral-300 px-2 py-1.5">规格</th>
                  <th className="border border-neutral-300 px-2 py-1.5 text-right">数量</th>
                  <th className="border border-neutral-300 px-2 py-1.5 text-right">净体积 m³</th>
                  <th className="border border-neutral-300 px-2 py-1.5 text-right">采购体积 m³</th>
                  <th className="border border-neutral-300 px-2 py-1.5 text-right">重量 kg</th>
                  <th className="border border-neutral-300 px-2 py-1.5 text-right">材料费</th>
                </tr>
              </thead>
              <tbody>
                {bom.items.map((item) => (
                  <tr key={`${item.componentIndex}-${item.name}`}>
                    <td className="border border-neutral-300 px-2 py-1.5">{item.name}</td>
                    <td className="border border-neutral-300 px-2 py-1.5">{item.materialName}</td>
                    <td className="border border-neutral-300 px-2 py-1.5">{item.spec}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.quantity}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.netVolumeM3.toFixed(5)}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.grossVolumeM3.toFixed(5)}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.weightKg.toFixed(1)}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">¥{item.materialCost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 font-semibold">
                  <td className="border border-neutral-300 px-2 py-1.5" colSpan={4}>
                    合计
                  </td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">{bom.netVolumeM3.toFixed(5)}</td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">{bom.grossVolumeM3.toFixed(5)}</td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">{bom.weightKg.toFixed(1)}</td>
                  <td className="border border-neutral-300 px-2 py-1.5 text-right">¥{bom.materialCost.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-2 flex justify-end gap-6 text-xs text-neutral-600">
              <span>加工费合计：¥{bom.processCost.toFixed(2)}</span>
              <span>材料 + 加工：¥{(bom.materialCost + bom.processCost).toFixed(2)}</span>
            </div>
          </section>

          <section className="mt-6 break-inside-avoid text-xs text-neutral-600">
            <h2 className="mb-1 text-sm font-semibold text-black">基础校验</h2>
            {issues.length ? (
              <ul className="list-disc pl-5">
                {issues.map((issue) => (
                  <li key={issue.message} className={issue.level === 'error' ? 'text-red-700' : 'text-amber-700'}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>基础结构检查通过。</p>
            )}
            <p className="mt-3 border-t border-neutral-200 pt-2 leading-relaxed">
              本报告用于方案沟通与备料参考，不构成承载认证。承载等级须按适用标准进行实物试验或工程复核；正式生产前请结合材料等级、含水率与真实工况确认。
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}
