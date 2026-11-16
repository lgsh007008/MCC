'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon, SaveIcon } from 'lucide-react';
import {
  buildPalletGeometry,
  calcPalletBom,
  hasPalletErrors,
  palletTemplateComponents,
  PALLET_TEMPLATE_OPTIONS,
  validatePalletStructure,
  type ApiSchemas,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletDestination,
  type PalletEntryDirection,
  type PalletLoadType,
  type PalletMaterialLike,
  type PalletTemplateType,
} from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { PageFrame } from '@/components/admin/page-frame';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { randomUuid } from '@/lib/uuid';
import { PalletBomSummary } from './pallet-bom-summary';
import { PalletComponentTable } from './pallet-component-table';
import { PalletDrawing2D, type PalletDrawingView } from './pallet-drawing-2d';
import { PalletViewer3D } from './pallet-viewer-3d';

type PalletProjectDto = ApiSchemas['PalletProjectDto'];
type PalletMaterialDto = ApiSchemas['PalletMaterialDto'];
type EditorView = PalletDrawingView | '3d';

interface PalletEditorProps {
  initial?: PalletProjectDto;
}

interface ProjectState {
  name: string;
  customerName: string;
  templateType: PalletTemplateType;
  destination: PalletDestination;
  entryDirection: PalletEntryDirection;
  lengthMm: number;
  widthMm: number;
  targetLoadKg: number | null;
  loadType: PalletLoadType;
  note: string;
}

const defaultProject: ProjectState = {
  name: '1200×800 出口实木托盘',
  customerName: '',
  templateType: 'block',
  destination: 'export',
  entryDirection: '4',
  lengthMm: 1200,
  widthMm: 800,
  targetLoadKg: 500,
  loadType: 'uniform',
  note: '',
};

const toMaterials = (items: PalletMaterialDto[] | undefined): PalletMaterialLike[] =>
  (items ?? []).map((item) => ({
    code: item.code,
    name: item.name,
    densityKgM3: item.densityKgM3,
    pricePerM3: Number(item.pricePerM3),
    fumigation: item.fumigation,
    color: item.color,
  }));

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

const toProject = (item: PalletProjectDto): ProjectState => ({
  name: item.name,
  customerName: item.customerName,
  templateType: item.templateType as PalletTemplateType,
  destination: item.destination as PalletDestination,
  entryDirection: item.entryDirection === '2' ? '2' : '4',
  lengthMm: item.lengthMm,
  widthMm: item.widthMm,
  targetLoadKg: item.targetLoadKg,
  loadType: item.loadType as PalletLoadType,
  note: item.note,
});

export function PalletEditor({ initial }: PalletEditorProps): React.ReactElement {
  const canManage = useCan('pallet:manage');
  const router = useRouter();
  const editing = Boolean(initial);
  const [project, setProject] = React.useState<ProjectState>(() =>
    initial ? toProject(initial) : defaultProject,
  );
  const [components, setComponents] = React.useState<PalletComponentInput[]>(() =>
    initial
      ? toComponents(initial.components)
      : palletTemplateComponents('block', defaultProject.lengthMm, defaultProject.widthMm),
  );
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const [view, setView] = React.useState<EditorView>('three');
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
  const materials = React.useMemo(() => toMaterials(materialsQuery.data), [materialsQuery.data]);

  const geometry = React.useMemo(
    () =>
      buildPalletGeometry(
        { lengthMm: project.lengthMm, widthMm: project.widthMm, templateType: project.templateType },
        components,
      ),
    [project.lengthMm, project.widthMm, project.templateType, components],
  );
  const bom = React.useMemo(() => calcPalletBom(components, materials), [components, materials]);
  const issues = React.useMemo(
    () => validatePalletStructure({ widthMm: project.widthMm, templateType: project.templateType }, components),
    [project.widthMm, project.templateType, components],
  );
  const blocked = hasPalletErrors(issues);

  const updateProject = (patch: Partial<ProjectState>): void => {
    setProject((current) => ({ ...current, ...patch }));
  };

  const changeTemplate = (value: string): void => {
    const templateType = value as PalletTemplateType;
    const option = PALLET_TEMPLATE_OPTIONS.find((item) => item.value === templateType);
    if (!option) return;
    setProject((current) => ({
      ...current,
      templateType,
      lengthMm: option.defaultLengthMm,
      widthMm: option.defaultWidthMm,
      name: `${option.defaultLengthMm}×${option.defaultWidthMm} ${option.label}`,
    }));
    setComponents(palletTemplateComponents(templateType, option.defaultLengthMm, option.defaultWidthMm));
    setSelectedIndex(-1);
  };

  const updateComponent = (index: number, patch: Partial<PalletComponentInput>): void => {
    setComponents((current) =>
      current.map((component, currentIndex) =>
        currentIndex === index ? { ...component, ...patch } : component,
      ),
    );
  };

  const addComponent = (): void => {
    setComponents((current) => [
      ...current,
      {
        role: 'custom',
        name: '新构件',
        materialCode: materials[0]?.code ?? 'pine',
        orientation: 'x',
        lengthMm: Math.max(1, Math.min(project.lengthMm, 100)),
        widthMm: 50,
        heightMm: 20,
        quantity: 1,
        wastePct: 0.08,
        processCost: 0,
        priceOverride: 0,
      },
    ]);
    setSelectedIndex(components.length);
  };

  const removeComponent = (index: number): void => {
    setComponents((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setSelectedIndex((current) => (current === index ? -1 : current > index ? current - 1 : current));
  };

  const moveComponent = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= components.length) return;
    setComponents((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
    setSelectedIndex(target);
  };

  const save = async (): Promise<void> => {
    if (!canManage || blocked) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const body = {
      name: project.name,
      customerName: project.customerName,
      templateType: project.templateType,
      destination: project.destination,
      entryDirection: project.entryDirection,
      lengthMm: project.lengthMm,
      widthMm: project.widthMm,
      targetLoadKg: project.targetLoadKg,
      loadType: project.loadType,
      note: project.note,
      components,
    };
    try {
      if (initial) {
        const { data, response } = await api.PUT('/api/v1/pallet/projects/{id}', {
          params: { path: { id: initial.id } },
          body,
        });
        if (!response.ok || !data) {
          throw new Error(`保存失败（${response.status}）`);
        }
        setProject(toProject(data));
        setComponents(toComponents(data.components));
        setMessage('已保存');
      } else {
        const { data, response } = await api.POST('/api/v1/pallet/projects', {
          body,
          headers: { 'Idempotency-Key': randomUuid() },
        });
        if (!response.ok || !data) {
          throw new Error(`保存失败（${response.status}）`);
        }
        router.push(`/admin/pallet-design/${data.id}`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const templateOptions = PALLET_TEMPLATE_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  }));

  return (
    <PageFrame
      title={initial ? `${initial.code} · ${project.name || '托盘设计'}` : '新建托盘设计'}
      actions={
        <>
          <Button onClick={() => void save()} disabled={!canManage || saving || blocked}>
            <SaveIcon />
            {saving ? '保存中…' : '保存'}
          </Button>
          {initial ? (
            <Link
              href={`/admin/pallet-design/${initial.id}/report`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <PrinterIcon />
              打印报告
            </Link>
          ) : null}
          <Link href="/admin/pallet-design" className={buttonVariants({ variant: 'outline' })}>
            返回列表
          </Link>
        </>
      }
    >
      <div className="grid gap-3">
        {!canManage ? (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            当前角色为只读，可查看图纸与料单，不能保存修改。
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
            {message}
          </div>
        ) : null}

        <section className="grid gap-3 rounded-lg border border-border bg-card p-3">
          <h2 className="text-sm font-semibold">项目参数</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">项目名称</span>
              <Input
                value={project.name}
                onChange={(event) => updateProject({ name: event.target.value })}
                disabled={!canManage}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">客户名称</span>
              <Input
                value={project.customerName}
                onChange={(event) => updateProject({ customerName: event.target.value })}
                disabled={!canManage}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">结构模板</span>
              <Select
                value={project.templateType}
                onChange={changeTemplate}
                options={templateOptions}
                disabled={!canManage || editing}
                ariaLabel="结构模板"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">使用范围</span>
              <Select
                value={project.destination}
                onChange={(value) => updateProject({ destination: value as PalletDestination })}
                options={[
                  { value: 'export', label: '出口' },
                  { value: 'domestic', label: '内销' },
                ]}
                disabled={!canManage}
                ariaLabel="使用范围"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">进叉方向</span>
              <Select
                value={project.entryDirection}
                onChange={(value) => updateProject({ entryDirection: value as PalletEntryDirection })}
                options={[
                  { value: '4', label: '四向进叉' },
                  { value: '2', label: '两向进叉' },
                ]}
                disabled={!canManage}
                ariaLabel="进叉方向"
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">长度（mm）</span>
              <Input
                type="number"
                min={1}
                value={project.lengthMm}
                onChange={(event) => updateProject({ lengthMm: Number(event.target.value) || 0 })}
                disabled={!canManage}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">宽度（mm）</span>
              <Input
                type="number"
                min={1}
                value={project.widthMm}
                onChange={(event) => updateProject({ widthMm: Number(event.target.value) || 0 })}
                disabled={!canManage}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">外形高度（只读）</span>
              <Input value={`${geometry.H} mm`} readOnly disabled />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">目标载荷（kg）</span>
              <Input
                type="number"
                min={1}
                value={project.targetLoadKg ?? ''}
                onChange={(event) =>
                  updateProject({ targetLoadKg: event.target.value ? Number(event.target.value) : null })
                }
                disabled={!canManage}
              />
            </label>
            <label className="grid gap-1 text-xs">
              <span className="text-muted-foreground">载荷形式</span>
              <Select
                value={project.loadType}
                onChange={(value) => updateProject({ loadType: value as PalletLoadType })}
                options={[
                  { value: 'uniform', label: '均布' },
                  { value: 'concentrated', label: '集中' },
                ]}
                disabled={!canManage}
                ariaLabel="载荷形式"
              />
            </label>
            <label className="grid gap-1 text-xs md:col-span-2">
              <span className="text-muted-foreground">备注</span>
              <Input
                value={project.note}
                onChange={(event) => updateProject({ note: event.target.value })}
                disabled={!canManage}
              />
            </label>
          </div>
        </section>

        <section className="grid gap-2 rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">工程图</h2>
              <p className="text-xs text-muted-foreground">
                {geometry.L}×{geometry.W}×{geometry.H} mm · {geometry.pieces.length} 件构件 · 叉孔净高{' '}
                {geometry.forkPocketHeight} mm
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {([
                ['three', '三视图'],
                ['top', '俯视'],
                ['front', '主视'],
                ['side', '侧视'],
                ['iso', '轴测'],
                ['3d', '3D'],
              ] as Array<[EditorView, string]>).map(([value, label]) => (
                <Button
                  key={value}
                  size="xs"
                  variant={view === value ? 'default' : 'outline'}
                  onClick={() => setView(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {view === '3d' ? (
            <PalletViewer3D
              geometry={geometry}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              onFallback={() => setView('iso')}
            />
          ) : (
            <PalletDrawing2D
              geometry={geometry}
              view={view}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
            />
          )}
        </section>

        <section className="grid gap-2 rounded-lg border border-border bg-card p-3">
          <h2 className="text-sm font-semibold">构件与料单</h2>
          <PalletComponentTable
            components={components}
            materials={materials}
            selectedIndex={selectedIndex}
            disabled={!canManage}
            onChange={updateComponent}
            onSelect={setSelectedIndex}
            onAdd={addComponent}
            onRemove={removeComponent}
            onMove={moveComponent}
          />
          <PalletBomSummary bom={bom} issues={issues} />
        </section>
      </div>
    </PageFrame>
  );
}
