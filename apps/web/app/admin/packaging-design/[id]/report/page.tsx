'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import {
  buildCrateGeometry,
  buildDividerGeometry,
  buildDunnageGeometry,
  buildFrameGeometry,
  buildPalletGeometry,
  buildUnitDrawingSheets,
  calcPalletBom,
  evaluatePackagingConclusion,
  PACKAGING_CONCLUSION_LABELS,
  PACKAGING_UNIT_TYPE_LABELS,
  validateCrateStructure,
  validateDividerStructure,
  validateDunnageStructure,
  validateFrameStructure,
  validatePalletStructure,
  type ApiSchemas,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
  type PalletTemplateType,
  type PackagingUnitType,
} from '@mcc/shared';
import { usePageCrumb } from '@/components/admin/page-breadcrumb';
import { Button, buttonVariants } from '@/components/ui/button';
import { SheetView } from '@/components/packaging/sheet-view';
import { api } from '@/lib/api';

type PackagingProjectDto = ApiSchemas['PackagingProjectDto'];
type PackagingMaterialDto = ApiSchemas['PackagingMaterialDto'];

interface RevisionSnapshot {
  project?: {
    code?: string;
    name?: string;
    customerName?: string;
    destination?: string;
    note?: string;
  };
  units?: PackagingProjectDto['units'];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  ISSUED: '已发布',
  ARCHIVED: '已归档',
};

const toComponents = (
  items: PackagingProjectDto['units'][number]['parts'],
): PalletComponentInput[] =>
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

const toMaterials = (items: PackagingMaterialDto[] | undefined): PalletMaterialLike[] =>
  (items ?? []).map((item) => ({
    code: item.code,
    name: item.name,
    densityKgM3: item.densityKgM3,
    pricePerM3: Number(item.pricePerM3),
    fumigation: item.fumigation,
    color: item.color,
  }));

const numberParam = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

const numberParamZero = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

const toDrawingUnitType = (
  value: string,
): 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP' =>
  value === 'PALLET'
    ? 'PALLET'
    : value === 'SKID'
      ? 'SKID'
      : value === 'FRAME'
        ? 'FRAME'
        : value === 'DIVIDER'
          ? 'DIVIDER'
          : value === 'DUNNAGE'
            ? 'DUNNAGE'
            : value === 'STEEL_STRAP'
              ? 'STEEL_STRAP'
              : 'CRATE';

const unitTypeLabel = (value: string): string =>
  PACKAGING_UNIT_TYPE_LABELS[value as PackagingUnitType] ?? value;

export default function PackagingReportPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  const revisionParam = Number(searchParams.get('revision') ?? '');
  const revisionNo =
    Number.isInteger(revisionParam) && revisionParam > 0 ? revisionParam : null;
  const projectQuery = useQuery({
    queryKey: ['packaging-project', id],
    enabled: revisionNo === null,
    queryFn: async (): Promise<PackagingProjectDto> => {
      const { data, response } = await api.GET('/api/v1/packaging/projects/{id}', {
        params: { path: { id } },
      });
      if (!response.ok || !data) {
        throw new Error('包装方案加载失败');
      }
      return data;
    },
  });
  const revisionQuery = useQuery({
    queryKey: ['packaging-revision-report', id, revisionNo],
    enabled: revisionNo !== null,
    queryFn: async (): Promise<ApiSchemas['PackagingRevisionDetailDto']> => {
      const { data, response } = await api.GET(
        '/api/v1/packaging/projects/{id}/revisions/{revisionNo}',
        { params: { path: { id, revisionNo: revisionNo! } } },
      );
      if (!response.ok || !data) {
        throw new Error('版本快照加载失败');
      }
      return data;
    },
  });
  const materialsQuery = useQuery({
    queryKey: ['packaging-materials'],
    queryFn: async (): Promise<PackagingMaterialDto[]> => {
      const { data, response } = await api.GET('/api/v1/packaging/materials');
      if (!response.ok || !data) {
        throw new Error('材料目录加载失败');
      }
      return data;
    },
  });

  usePageCrumb([{ title: '打印报告' }]);

  const report = React.useMemo(() => {
    const revision = revisionQuery.data;
    const snapshot = (revision?.snapshot ?? {}) as RevisionSnapshot;
    const project =
      revisionNo !== null && revision
        ? ({
            id,
            code: snapshot.project?.code ?? 'PD-历史版本',
            name: snapshot.project?.name ?? '历史版本',
            customerName: snapshot.project?.customerName ?? '',
            destination: snapshot.project?.destination ?? 'export',
            note: snapshot.project?.note ?? '',
            status: 'ISSUED',
            currentRevision: revisionNo,
            totalVolumeM3: revision.totalVolumeM3,
            totalWeightKg: revision.totalWeightKg,
            materialCost: revision.materialCost,
            processingCost: revision.processingCost,
            createdAt: '',
            updatedAt: '',
            units: snapshot.units ?? [],
          } satisfies PackagingProjectDto)
        : projectQuery.data;
    if (!project) return null;
    const materials = toMaterials(materialsQuery.data);
    const units = project.units.map((unit, index) => {
      const components = toComponents(unit.parts);
      const innerHeightMm = numberParam(unit.params?.innerHeightMm, 900);
      const bottomThicknessMm = numberParam(unit.params?.bottomThicknessMm, 15);
      const baseHeightMm = numberParam(unit.params?.baseHeightMm, 90);
      const panelThicknessMm = numberParamZero(unit.params?.panelThicknessMm, 15);
      const panelCoverage =
        unit.params?.panelCoverage === 'sides' || unit.params?.panelCoverage === 'full'
          ? unit.params.panelCoverage
          : 'none';
      const hasLid = unit.params?.hasLid !== false || panelCoverage === 'full';
      const frameThicknessMm = numberParam(unit.params?.frameThicknessMm, 90);
      const geometry =
        unit.unitType === 'DUNNAGE'
          ? buildDunnageGeometry(
              {
                outerLengthMm: unit.lengthMm,
                outerWidthMm: unit.widthMm,
                outerHeightMm:
                  unit.params?.arrangement === 'cross'
                    ? 2 * numberParam(unit.params?.thicknessMm, 90)
                    : numberParam(unit.params?.thicknessMm, 90),
                arrangement: unit.params?.arrangement === 'cross' ? 'cross' : 'parallel',
              },
              components,
            )
          : unit.unitType === 'DIVIDER'
          ? buildDividerGeometry(
              {
                outerLengthMm: unit.lengthMm,
                outerWidthMm: unit.widthMm,
                layerHeightMm: numberParam(unit.params?.layerHeightMm, 200),
                layerCount: numberParam(unit.params?.layerCount, 1),
                thicknessMm: numberParam(unit.params?.thicknessMm, 8),
              },
              components,
            )
          : unit.unitType === 'FRAME'
          ? buildFrameGeometry(
              {
                outerLengthMm: unit.lengthMm,
                outerWidthMm: unit.widthMm,
                innerHeightMm,
                frameThicknessMm,
                bottomThicknessMm,
                baseHeightMm,
                outerHeightMm:
                  baseHeightMm +
                  bottomThicknessMm +
                  innerHeightMm +
                  frameThicknessMm +
                  (hasLid ? panelThicknessMm : 0),
              },
              components,
            )
          : unit.unitType !== 'PALLET'
            ? buildCrateGeometry(
                {
                  outerLengthMm: unit.lengthMm,
                  outerWidthMm: unit.widthMm,
                  innerHeightMm,
                  thicknessMm: numberParam(unit.params?.thicknessMm, 15),
                  bottomThicknessMm,
                  baseHeightMm,
                  frameThicknessMm: numberParamZero(unit.params?.frameThicknessMm, 90),
                },
                components,
              )
            : buildPalletGeometry(
                {
                  lengthMm: unit.lengthMm,
                  widthMm: unit.widthMm,
                  templateType: unit.templateCode as PalletTemplateType,
                },
                components,
              );
      const bom = calcPalletBom(components, materials);
      const issues =
        unit.unitType === 'DUNNAGE'
          ? validateDunnageStructure(components, {
              quantity: numberParam(unit.params?.quantity, 3),
              arrangement: unit.params?.arrangement === 'cross' ? 'cross' : 'parallel',
            })
          : unit.unitType === 'DIVIDER'
          ? validateDividerStructure(components, {
              layerCount: numberParam(unit.params?.layerCount, 1),
              lapWidthMm: numberParamZero(unit.params?.lapWidthMm, 30),
              innerLengthMm: numberParam(unit.params?.innerLengthMm, unit.lengthMm),
              innerWidthMm: numberParam(unit.params?.innerWidthMm, unit.widthMm),
            })
          : unit.unitType === 'FRAME'
          ? validateFrameStructure(components, { panelCoverage, hasLid })
          : unit.unitType !== 'PALLET'
            ? validateCrateStructure(components)
            : validatePalletStructure(
                { widthMm: unit.widthMm, templateType: unit.templateCode as PalletTemplateType },
                components,
              );
      const sheet = buildUnitDrawingSheets({
        projectCode: project.code,
        projectName: project.name,
        customerName: project.customerName,
        revision: project.currentRevision,
        unitName: unit.name,
        unitType: toDrawingUnitType(unit.unitType),
        drawingNo: `${project.code}-U${String(index + 1).padStart(2, '0')}-01`,
        geometry,
      })[0]!;
      const conclusion = evaluatePackagingConclusion({
        unitType: toDrawingUnitType(unit.unitType),
        targetLoadKg: unit.targetLoadKg,
        loadType: unit.loadType === 'concentrated' ? 'concentrated' : 'uniform',
        lengthMm: unit.lengthMm,
        widthMm: unit.widthMm,
        innerLengthMm: numberParam(unit.params?.innerLengthMm, unit.lengthMm),
        innerWidthMm: numberParam(unit.params?.innerWidthMm, unit.widthMm),
        issues,
      });
      return { unit, components, geometry, bom, issues, conclusion, sheet, index };
    });
    return { project, units, materials };
  }, [projectQuery.data, revisionQuery.data, revisionNo, id, materialsQuery.data]);

  if (projectQuery.isLoading || revisionQuery.isLoading || materialsQuery.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">正在生成报告…</div>;
  }
  if (!report) {
    return <div className="p-6 text-sm text-destructive">报告数据加载失败。</div>;
  }
  const { project, units } = report;

  // 打印 / 另存 PDF 为浏览器行为，先记录“用户触发打印”再调用 window.print；失败不阻塞打印。
  const recordPrint = (): void => {
    void api
      .POST('/api/v1/packaging/projects/{id}/print-events', {
        params: { path: { id: project.id } },
        body: { revisionNo },
      })
      .catch(() => undefined);
  };

  return (
    <div className="min-h-full bg-muted/30 print:bg-white">
      <style>{`@page { size: A4 portrait; margin: 10mm; }`}</style>
      <div className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 p-3 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href={`/admin/packaging-design/${project.id}`} className={buttonVariants({ variant: 'outline' })}>
            返回编辑器
          </Link>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                recordPrint();
                window.print();
              }}
            >
              <PrinterIcon />
              打印 / 另存 PDF
            </Button>
          </div>
        </div>

        {revisionNo !== null ? (
          <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 print:hidden">
            正在查看历史快照 R{String(revisionNo).padStart(2, '0')}，只读；不读取当前编辑数据。
            <Link
              href={`/admin/packaging-design/${id}/report`}
              className="ml-2 font-medium underline underline-offset-2"
            >
              返回当前版本
            </Link>
          </div>
        ) : null}

        <article className="break-inside-avoid bg-white p-6 text-black shadow-sm print:break-after-page print:p-0 print:shadow-none">
          <header className="border-b border-neutral-300 pb-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs tracking-[0.3em] text-neutral-500">MEIHAO WOOD</div>
                <h1 className="mt-1 text-2xl font-semibold">包装方案结构图与木材料单</h1>
              </div>
              <div className="text-right text-xs text-neutral-500">
                <div>方案编号：{project.code}</div>
                <div>打印日期：{new Date().toLocaleDateString('zh-CN')}</div>
              </div>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-2 gap-x-8 gap-y-2 text-sm md:grid-cols-4">
            {[
              ['方案名称', project.name],
              ['客户名称', project.customerName || '—'],
              ['使用范围', project.destination === 'export' ? '出口' : '内销'],
              ['状态', STATUS_LABELS[project.status] ?? project.status],
              ['版本', project.currentRevision > 0 ? `R${String(project.currentRevision).padStart(2, '0')}` : '未发布'],
              ['单元数', `${units.length} 个`],
              ['净体积', `${project.totalVolumeM3} m³`],
              ['估算重量', `${project.totalWeightKg} kg`],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="font-medium">{value}</div>
              </div>
            ))}
          </section>

          <section className="mt-5 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            {[
              ['材料费', `¥${project.materialCost}`],
              ['加工费', `¥${project.processingCost}`],
              ['材料 + 加工', `¥${(Number(project.materialCost) + Number(project.processingCost)).toFixed(2)}`],
              ['构件总数', `${units.reduce((sum, item) => sum + item.components.length, 0)} 项`],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-neutral-300 px-3 py-2">
                <div className="text-xs text-neutral-500">{label}</div>
                <div className="font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </section>
        </article>

        {units.map((item) => (
          <article
            key={item.unit.id}
            className={`break-inside-avoid bg-white p-6 text-black shadow-sm print:p-0 print:shadow-none ${
              item.index > 0 ? 'print:break-before-page' : ''
            }`}
          >
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-neutral-300 pb-3">
              <div>
                <div className="text-xs text-neutral-500">
                  单元 {String(item.index + 1).padStart(2, '0')} · {unitTypeLabel(item.unit.unitType)}
                </div>
                <h2 className="mt-1 text-xl font-semibold">{item.unit.name}</h2>
              </div>
              <div className="text-right text-xs text-neutral-600">
                <div>
                  外形 {item.geometry.L}×{item.geometry.W}×{item.geometry.H} mm
                </div>
                <div>图号 {item.sheet.drawingNo}</div>
              </div>
            </header>

            <section
              className={`mt-4 break-inside-avoid rounded border px-4 py-3 ${
                item.conclusion.level === 'excellent'
                  ? 'border-emerald-300 bg-emerald-50'
                  : item.conclusion.level === 'available'
                    ? 'border-amber-300 bg-amber-50'
                    : 'border-red-300 bg-red-50'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <b className="text-sm">
                  结论：{PACKAGING_CONCLUSION_LABELS[item.conclusion.level]}
                </b>
                <span className="font-mono text-xs tabular-nums">
                  {item.conclusion.areaLoadKgM2 === null
                    ? '单位面积载荷 未评估'
                    : `单位面积载荷 ${item.conclusion.areaLoadKgM2.toFixed(1)} kg/m²`}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-600">
                目标载荷 {item.unit.targetLoadKg ?? '—'} kg · 底面积{' '}
                {item.conclusion.areaM2.toFixed(2)} m²
              </div>
              {item.conclusion.reasons.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-xs leading-relaxed">
                  {item.conclusion.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-1 text-[11px] text-neutral-500">
                {item.conclusion.disclaimer}
              </p>
            </section>

            <section className="mt-4">
              <SheetView sheet={item.sheet} />
            </section>

            <section className="mt-5 break-inside-avoid">
              <div className="mb-2 flex items-end justify-between">
                <h3 className="text-sm font-semibold">木材料单</h3>
                <div className="text-xs text-neutral-500">
                  净体积 {item.bom.netVolumeM3.toFixed(5)} m³ · 估算重量 {item.bom.weightKg.toFixed(1)} kg
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
                  {item.bom.items.map((line) => (
                    <tr key={`${line.componentIndex}-${line.name}`}>
                      <td className="border border-neutral-300 px-2 py-1.5">{line.name}</td>
                      <td className="border border-neutral-300 px-2 py-1.5">{line.materialName}</td>
                      <td className="border border-neutral-300 px-2 py-1.5">{line.spec}</td>
                      <td className="border border-neutral-300 px-2 py-1.5 text-right">{line.quantity}</td>
                      <td className="border border-neutral-300 px-2 py-1.5 text-right">{line.netVolumeM3.toFixed(5)}</td>
                      <td className="border border-neutral-300 px-2 py-1.5 text-right">{line.grossVolumeM3.toFixed(5)}</td>
                      <td className="border border-neutral-300 px-2 py-1.5 text-right">{line.weightKg.toFixed(1)}</td>
                      <td className="border border-neutral-300 px-2 py-1.5 text-right">¥{line.materialCost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-neutral-50 font-semibold">
                    <td className="border border-neutral-300 px-2 py-1.5" colSpan={4}>
                      合计
                    </td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.bom.netVolumeM3.toFixed(5)}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.bom.grossVolumeM3.toFixed(5)}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">{item.bom.weightKg.toFixed(1)}</td>
                    <td className="border border-neutral-300 px-2 py-1.5 text-right">¥{item.bom.materialCost.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="mt-2 flex justify-end gap-6 text-xs text-neutral-600">
                <span>加工费合计：¥{item.bom.processCost.toFixed(2)}</span>
                <span>材料 + 加工：¥{(item.bom.materialCost + item.bom.processCost).toFixed(2)}</span>
              </div>
            </section>

            <section className="mt-4 break-inside-avoid text-xs text-neutral-600">
              <h3 className="mb-1 text-sm font-semibold text-black">基础校验</h3>
              {item.issues.length ? (
                <ul className="list-disc pl-5">
                  {item.issues.map((issue) => (
                    <li key={issue.message} className={issue.level === 'error' ? 'text-red-700' : 'text-amber-700'}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>基础结构检查通过。</p>
              )}
            </section>
          </article>
        ))}

        <article className="break-inside-avoid bg-white p-6 text-xs text-neutral-600 shadow-sm print:p-0 print:shadow-none">
          本报告为筛查级结论，不构成承载认证。正式生产前请结合材料等级、含水率与真实工况确认。
        </article>
      </div>
    </div>
  );
}
