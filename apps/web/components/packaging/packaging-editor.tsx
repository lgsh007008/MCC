'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, CircleCheckIcon, Redo2Icon, SaveIcon, Undo2Icon } from 'lucide-react';
import {
  bomToCsv,
  buildUnitDrawingSheets,
  calcPalletBom,
  cuttingToCsv,
  deriveCrateParts,
  deriveDividerParts,
  deriveDunnageParts,
  deriveFrameParts,
  drawingToDxf,
  drawingToSvg,
  drawingToViewSvg,
  evaluatePackagingConclusion,
  hasPalletErrors,
  palletTemplateComponents,
  resolvePartSources,
  type ApiSchemas,
  type DrawingViewKind,
  type PackagingConclusion,
  type PalletComponentInput,
  type PalletComponentRole,
  type PalletMaterialLike,
  type PalletTemplateType,
} from '@mcc/shared';
import { useCan } from '@/components/auth/permission-context';
import { Button, buttonVariants } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { currentUsername } from '@/lib/auth/session';
import { cn } from '@/lib/utils';
import { randomUuid } from '@/lib/uuid';
import {
  createHistory,
  createNewDocument,
  crateParamsOf,
  dividerParamsOf,
  documentSignature,
  dunnageParamsOf,
  draftStorageKey,
  frameParamsOf,
  fromProjectDto,
  historyReducer,
  isProjectEditable,
  parseDraft,
  projectPayload,
  serializeDraft,
  validateUnit,
  type DocumentAction,
  type PackagingDraft,
  type ProjectState,
  type UnitDraft,
} from '@/lib/packaging/document';
import { buildGeometryForUnit } from '@/lib/packaging/geometry';
import { fitViewBox, panViewBox, zoomViewBox, type ViewBox } from '@/lib/packaging/viewport';
import { BottomLauncher, type BottomTab } from './bottom-launcher';
import { BottomPanel } from './bottom-panel';
import { CanvasToolbar, type CanvasView } from './canvas-toolbar';
import { DrawingView2D, type PalletDrawingView } from './drawing-view-2d';
import { Inspector, type InspectorTab } from './inspector';
import { RevisionDetailDialog } from './revision-detail-dialog';
import { SaveSchemeDialog } from './save-scheme-dialog';
import { SheetView } from './sheet-view';
import { StartShowcase } from './start-showcase';
import { ToolRail } from './tool-rail';
import { UnitPanel, type UnitPanelView } from './unit-panel';
import { Viewer3D, type Viewer3DHandle } from './viewer-3d';
import { WorkbenchShell } from './workbench-shell';

type PackagingProjectDto = ApiSchemas['PackagingProjectDto'];
type PackagingMaterialDto = ApiSchemas['PackagingMaterialDto'];

interface PackagingEditorProps {
  initial?: PackagingProjectDto;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  ISSUED: '已发布',
  ARCHIVED: '已归档',
};

const toMaterials = (items: PackagingMaterialDto[] | undefined): PalletMaterialLike[] =>
  (items ?? []).map((item) => ({
    code: item.code,
    name: item.name,
    densityKgM3: item.densityKgM3,
    pricePerM3: Number(item.pricePerM3),
    fumigation: item.fumigation,
    color: item.color,
  }));

const isTypingTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable),
  );
};

// 画布公共框（design/包装设计.md §9.2）：2D / 3D / 图纸 / 分屏共用同一层边框与圆角，
// 各视图只负责内部内容，不再各自套卡片；外层统一留 12px 画布内边距。
function ViewportFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="h-full min-h-[200px] p-3">
      <div
        data-testid="viewport-frame"
        className="relative h-full min-h-[200px] w-full overflow-hidden rounded-lg border border-border bg-card"
      >
        {children}
      </div>
    </div>
  );
}

export function PackagingEditor({ initial }: PackagingEditorProps): React.ReactElement {
  const canManage = useCan('packaging:manage');
  const confirm = useConfirm();
  const router = useRouter();
  const isNew = !initial;
  // 已落库（含草稿）：用于“草稿可换模板 / 发布后锁定”的提示与类型锁定。
  const saved = Boolean(initial);
  // 新建工作台先进入引导态：未选结构前禁用设计相关操作。
  const [started, setStarted] = React.useState(!isNew);

  const [history, dispatchHistory] = React.useReducer(
    historyReducer,
    undefined,
    () => createHistory(initial ? fromProjectDto(initial) : createNewDocument()),
  );
  const document = history.present;
  const [baseline, setBaseline] = React.useState(() => documentSignature(history.present));
  const dirty = documentSignature(document) !== baseline;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const [status, setStatus] = React.useState(initial?.status ?? 'DRAFT');
  const editable = isProjectEditable(canManage, status);
  // 草稿可换同类型模板；发布 / 归档后结构锁定（design/包装设计.md §9.2）。
  const structureLocked = status !== 'DRAFT';
  const [selectedPart, setSelectedPart] = React.useState(-1);
  const [view, setView] = React.useState<CanvasView>('three');
  const [last2D, setLast2D] = React.useState<PalletDrawingView>('three');
  const [viewBox, setViewBox] = React.useState<ViewBox>(fitViewBox);
  // 工作台 1:1：左栏默认进入单元目录，展示类型 → 模板；点目录项才进入参数。
  const [leftView, setLeftView] = React.useState<UnitPanelView>('list');
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);
  const [rightWidth, setRightWidth] = React.useState(320);
  const [rightTab, setRightTab] = React.useState<InspectorTab>('project');
  const [bottomOpen, setBottomOpen] = React.useState(false);
  const [bottomTab, setBottomTab] = React.useState<BottomTab>('parts');
  const [bottomHeight, setBottomHeight] = React.useState(320);
  const [saving, setSaving] = React.useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);
  const [revisionDialogNo, setRevisionDialogNo] = React.useState<number | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [messageLeaving, setMessageLeaving] = React.useState(false);
  const [reset3DToken, setReset3DToken] = React.useState(0);
  const [draftCandidate, setDraftCandidate] = React.useState<PackagingDraft | null>(null);
  const [draftReady, setDraftReady] = React.useState(false);
  const idempotencyKey = React.useRef<string | null>(null);
  const panRef = React.useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    viewBox: ViewBox;
  } | null>(null);

  const unit = document.units[0]!;
  const components = unit.parts;
  const unitTypeLabel =
    unit.unitType === 'PALLET'
      ? '托盘'
      : unit.unitType === 'SKID'
        ? '滑木箱'
        : unit.unitType === 'FRAME'
          ? '框架箱'
          : unit.unitType === 'DIVIDER'
            ? '围板'
            : unit.unitType === 'DUNNAGE'
              ? '垫木'
              : unit.unitType === 'STEEL_STRAP'
                ? '钢带箱'
                : '木箱';
  const derivedParts = React.useMemo(
    () =>
      unit.unitType === 'DUNNAGE'
        ? deriveDunnageParts(dunnageParamsOf(unit))
        : unit.unitType === 'DIVIDER'
          ? deriveDividerParts(dividerParamsOf(unit))
          : unit.unitType === 'FRAME'
            ? deriveFrameParts(frameParamsOf(unit))
            : unit.unitType !== 'PALLET'
              ? deriveCrateParts(crateParamsOf(unit))
              : palletTemplateComponents(
                  unit.templateCode as PalletTemplateType,
                  unit.lengthMm,
                  unit.widthMm,
                ),
    [unit],
  );
  const manualDeckRoles = React.useMemo(() => {
    const roles: PalletComponentRole[] = [];
    if (unit.topDeckMode === 'manual') roles.push('topDeck');
    if (unit.bottomDeckMode === 'manual') roles.push('bottomDeck');
    return roles;
  }, [unit.topDeckMode, unit.bottomDeckMode]);
  const partSources = React.useMemo(
    () => resolvePartSources(derivedParts, components, manualDeckRoles),
    [derivedParts, components, manualDeckRoles],
  );

  const [tabId] = React.useState(() => {
    if (typeof window === 'undefined') return 'server';
    const storageKey = 'mcc:packaging:new-tab-id';
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const next = randomUuid();
    window.sessionStorage.setItem(storageKey, next);
    return next;
  });
  const username = currentUsername();
  const storageKey = draftStorageKey(username, initial?.id ?? null, tabId);

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
  const materials = React.useMemo(() => toMaterials(materialsQuery.data), [materialsQuery.data]);

  const revisionsQuery = useQuery({
    queryKey: ['packaging-revisions', initial?.id],
    enabled: Boolean(initial?.id),
    queryFn: async (): Promise<ApiSchemas['PackagingRevisionDto'][]> => {
      const { data, response } = await api.GET('/api/v1/packaging/projects/{id}/revisions', {
        params: { path: { id: initial!.id } },
      });
      if (!response.ok || !data) {
        throw new Error('版本加载失败');
      }
      return data.items;
    },
  });
  const revisions = revisionsQuery.data ?? [];
  const latestRevision = revisions.length
    ? Math.max(...revisions.map((item) => item.revisionNo))
    : undefined;

  const geometry = React.useMemo(() => buildGeometryForUnit(unit), [unit]);

  const bom = React.useMemo(() => calcPalletBom(components, materials), [components, materials]);
  const issues = React.useMemo(() => validateUnit(unit), [unit]);
  const conclusion = React.useMemo<PackagingConclusion>(
    () =>
      evaluatePackagingConclusion({
        unitType: unit.unitType,
        targetLoadKg: unit.targetLoadKg,
        loadType: unit.loadType,
        lengthMm: unit.lengthMm,
        widthMm: unit.widthMm,
        innerLengthMm: unit.innerLengthMm,
        innerWidthMm: unit.innerWidthMm,
        issues,
      }),
    [unit, issues],
  );
  const blocked = React.useMemo(() => hasPalletErrors(validateUnit(unit)), [unit]);

  const drawingNo = `${initial?.code ?? 'PD-新方案'}-U01-01`;
  const sheet = React.useMemo(
    () =>
      buildUnitDrawingSheets({
        projectCode: initial?.code ?? 'PD-新方案',
        projectName: document.project.name || '包装方案',
        customerName: document.project.customerName,
        revision: status === 'ISSUED' ? (initial?.currentRevision ?? 0) : 0,
        unitName: unit.name,
        unitType: unit.unitType,
        drawingNo,
        geometry,
      })[0]!,
    [
      document.project.customerName,
      document.project.name,
      drawingNo,
      geometry,
      initial?.code,
      initial?.currentRevision,
      status,
      unit.name,
      unit.unitType,
    ],
  );

  React.useEffect(() => {
    setSelectedPart(-1);
  }, [unit.key]);

  React.useEffect(() => {
    setViewBox(fitViewBox());
  }, [unit.key, view]);

  const canvasRef = React.useRef<HTMLDivElement>(null);
  const viewer3dRef = React.useRef<Viewer3DHandle>(null);
  const [canvasCompact, setCanvasCompact] = React.useState(false);
  // 画布只保留统一 12px 内边距；各视图共用 ViewportFrame，关闭态浮卡不预留空间。
  React.useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const update = (): void => {
      setCanvasCompact(element.clientWidth < 560);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const draft = parseDraft(window.localStorage.getItem(storageKey));
    if (draft && documentSignature(draft.document) !== documentSignature(history.present)) {
      setDraftCandidate(draft);
    } else {
      setDraftReady(true);
    }
    // 只在进入页面时检查一次草稿
  }, [storageKey]);

  const clearDraft = React.useCallback((): void => {
    window.localStorage.removeItem(storageKey);
  }, [storageKey]);

  React.useEffect(() => {
    if (!started || !draftReady || !editable || status === 'ISSUED' || !dirty) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, serializeDraft(document));
      } catch {
        // 本机存储不可用时静默失败，不阻断设计
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [document, dirty, draftReady, editable, status, storageKey, started]);

  React.useEffect(() => {
    if (!started || !dirty || !editable) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, editable, started]);

  // 成功 / 信息提示：画布顶部居中 Toast，2.2s 后淡出、2.5s 后移除；错误仍为常驻横条。
  React.useEffect(() => {
    if (!message) return;
    setMessageLeaving(false);
    const fadeTimer = window.setTimeout(() => setMessageLeaving(true), 2200);
    const clearTimer = window.setTimeout(() => {
      setMessage(null);
      setMessageLeaving(false);
    }, 2500);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [message]);

  const dispatchDocument = React.useCallback(
    (action: DocumentAction, mergeKey?: string): void => {
      dispatchHistory({ type: 'apply', action, mergeKey });
    },
    [],
  );

  const openTool = React.useCallback((tab: InspectorTab): void => {
    setRightTab(tab);
    setRightOpen(true);
  }, []);

  const updateProject = (patch: Partial<ProjectState>): void => {
    dispatchDocument(
      { type: 'updateProject', patch },
      `project:${Object.keys(patch).join(',')}`,
    );
  };

  const updateUnit = (patch: Partial<UnitDraft>): void => {
    dispatchDocument(
      { type: 'updateUnit', index: 0, patch },
      `unit:${unit.key}:${Object.keys(patch).join(',')}`,
    );
  };

  const applyPalletDims = (
    patch: Partial<Pick<UnitDraft, 'lengthMm' | 'widthMm'>>,
  ): void => {
    const safe = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [key, Math.max(1, Math.round(value ?? 1))]),
    ) as typeof patch;
    dispatchDocument(
      { type: 'applyPalletDims', index: 0, patch: safe },
      `pallet-dims:${unit.key}:${Object.keys(safe).join(',')}`,
    );
  };

  const applyCrateParams = (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'innerLengthMm'
        | 'innerWidthMm'
        | 'innerHeightMm'
        | 'thicknessMm'
        | 'bottomThicknessMm'
        | 'baseHeightMm'
        | 'frameThicknessMm'
        | 'steelStrapCount'
        | 'runnerCount'
        | 'runnerWidthMm'
        | 'strapWidthMm'
        | 'strapDirection'
      >
    >,
  ): void => {
    const { strapDirection, ...numeric } = patch;
    const safe = {
      ...(Object.fromEntries(
        Object.entries(numeric).map(([key, value]) => [
          key,
          key === 'steelStrapCount' || key === 'frameThicknessMm'
            ? Math.max(0, Math.round(value ?? 0))
            : Math.max(1, Math.round(value ?? 1)),
        ]),
      ) as typeof numeric),
      ...(strapDirection ? { strapDirection } : {}),
    } as typeof patch;
    dispatchDocument(
      { type: 'applyCrateParams', index: 0, patch: safe },
      `crate:${unit.key}:${Object.keys(safe).join(',')}`,
    );
  };

  const applyFrameParams = (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'innerLengthMm'
        | 'innerWidthMm'
        | 'innerHeightMm'
        | 'frameThicknessMm'
        | 'bottomThicknessMm'
        | 'baseHeightMm'
        | 'runnerWidthMm'
        | 'panelThicknessMm'
        | 'panelCoverage'
        | 'hasLid'
        | 'steelStrapCount'
      >
    >,
  ): void => {
    const { panelCoverage, hasLid, ...numeric } = patch;
    const safe = {
      ...(Object.fromEntries(
        Object.entries(numeric).map(([key, value]) => [
          key,
          key === 'panelThicknessMm' || key === 'steelStrapCount'
            ? Math.max(0, Math.round(value ?? 0))
            : Math.max(1, Math.round(value ?? 1)),
        ]),
      ) as typeof numeric),
      ...(panelCoverage ? { panelCoverage } : {}),
      ...(hasLid !== undefined ? { hasLid } : {}),
    } as typeof patch;
    dispatchDocument(
      { type: 'applyFrameParams', index: 0, patch: safe },
      `frame:${unit.key}:${Object.keys(safe).join(',')}`,
    );
  };

  const applyDividerParams = (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'innerLengthMm'
        | 'innerWidthMm'
        | 'layerHeightMm'
        | 'layerCount'
        | 'thicknessMm'
        | 'lapWidthMm'
        | 'hingeCount'
      >
    >,
  ): void => {
    const safe = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [
        key,
        key === 'hingeCount' || key === 'lapWidthMm'
          ? Math.max(0, Math.round(value ?? 0))
          : Math.max(1, Math.round(value ?? 1)),
      ]),
    ) as typeof patch;
    dispatchDocument(
      { type: 'applyDividerParams', index: 0, patch: safe },
      `divider:${unit.key}:${Object.keys(safe).join(',')}`,
    );
  };

  const applyDunnageParams = (
    patch: Partial<
      Pick<
        UnitDraft,
        | 'dunnageLengthMm'
        | 'dunnageWidthMm'
        | 'dunnageThicknessMm'
        | 'dunnageQuantity'
        | 'dunnageArrangement'
      >
    >,
  ): void => {
    const { dunnageArrangement, ...numeric } = patch;
    const safe = {
      ...(Object.fromEntries(
        Object.entries(numeric).map(([key, value]) => [
          key,
          Math.max(1, Math.round(value ?? 1)),
        ]),
      ) as typeof numeric),
      ...(dunnageArrangement ? { dunnageArrangement } : {}),
    } as typeof patch;
    dispatchDocument(
      { type: 'applyDunnageParams', index: 0, patch: safe },
      `dunnage:${unit.key}:${Object.keys(safe).join(',')}`,
    );
  };

  const configureDeck = (
    deck: 'top' | 'bottom',
    mode: 'auto' | 'manual',
    count?: number | null,
  ): void => {
    dispatchDocument(
      { type: 'configureDeck', index: 0, deck, mode, count },
      `deck:${unit.key}:${deck}:${mode}`,
    );
  };

  const changeTemplate = async (templateCode: string): Promise<void> => {
    if (structureLocked || templateCode === unit.templateCode) return;
    if (saved) {
      const confirmed = await confirm({
        title: '更换结构模板',
        description: (
          <>
            更换模板会按新模板重新生成构件，手动修改过的构件将丢失。
            {latestRevision ? (
              <>
                <br />
                该方案已有发布版本，新版本结构将与上一版不同。
              </>
            ) : null}
          </>
        ),
        confirmText: '更换',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    dispatchDocument({ type: 'changeTemplate', index: 0, templateCode });
    setSelectedPart(-1);
  };

  const updatePart = (index: number, patch: Partial<PalletComponentInput>): void => {
    dispatchDocument(
      { type: 'updatePart', unitIndex: 0, partIndex: index, patch },
      `part:${unit.key}:${index}:${Object.keys(patch).join(',')}`,
    );
  };

  const movePart = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= components.length) return;
    dispatchDocument({ type: 'movePart', unitIndex: 0, partIndex: index, direction });
    setSelectedPart(target);
  };

  const selectCatalogItem = async (
    unitType: 'PALLET' | 'CRATE' | 'SKID' | 'FRAME' | 'DIVIDER' | 'DUNNAGE' | 'STEEL_STRAP',
    templateCode: string,
  ): Promise<void> => {
    if (!editable || structureLocked) return;
    if (saved) {
      // 已保存草稿：类型创建时固定，只允许同类型换模板
      if (unitType !== unit.unitType) return;
      await changeTemplate(templateCode);
      setLeftView('params');
      return;
    }
    // 首次选择结构：作为文档起点，不进入撤销历史
    const next = historyReducer(history, {
      type: 'apply',
      action: { type: 'selectCatalogItem', unitType, templateCode },
    });
    if (next.present === history.present) return;
    dispatchHistory({ type: 'replace', document: next.present });
    setBaseline(documentSignature(next.present));
    setSelectedPart(-1);
    setStarted(true);
    setLeftView('params');
  };

  const selectPart = (index: number): void => {
    setSelectedPart(index);
    if (index >= 0) {
      openTool('part');
    }
  };

  const download = (filename: string, content: string, type: string): void => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // 输出审计只记录已保存方案；未保存工作台没有方案编号，无法归属，导出不记录。
  const recordExport = (body: {
    format: 'svg_view' | 'svg_sheet' | 'dxf' | 'csv_bom' | 'csv_cutting' | 'obj' | 'stl';
    view?: 'top' | 'front' | 'side' | 'iso';
    revisionNo?: number | null;
  }): void => {
    if (!initial?.id) return;
    void api
      .POST('/api/v1/packaging/projects/{id}/export-events', {
        params: { path: { id: initial.id } },
        body,
      })
      .catch(() => undefined);
  };

  const exportSvg = (): void => {
    download(`${sheet.drawingNo}.svg`, drawingToSvg(sheet), 'image/svg+xml');
    recordExport({ format: 'svg_sheet' });
  };
  const exportSvgView = (kind: DrawingViewKind, label: string): void => {
    download(
      `${sheet.drawingNo}-${label}.svg`,
      drawingToViewSvg(sheet, kind),
      'image/svg+xml',
    );
    recordExport({ format: 'svg_view', view: kind });
  };
  const exportDxf = (): void => {
    download(`${sheet.drawingNo}.dxf`, drawingToDxf(sheet), 'application/dxf');
    recordExport({ format: 'dxf' });
  };
  const exportBomCsv = (): void => {
    download(
      `${sheet.drawingNo}-BOM.csv`,
      bomToCsv([
        {
          unitName: unit.name,
          unitType: unitTypeLabel,
          bom,
        },
      ]),
      'text/csv;charset=utf-8',
    );
    recordExport({ format: 'csv_bom' });
  };
  const exportCuttingCsv = (): void => {
    download(
      `${sheet.drawingNo}-开料.csv`,
      cuttingToCsv([
        {
          unitName: unit.name,
          unitType: unitTypeLabel,
          parts: unit.parts,
        },
      ]),
      'text/csv;charset=utf-8',
    );
    recordExport({ format: 'csv_cutting' });
  };

  const persistExisting = async (): Promise<void> => {
    if (!initial || !editable || blocked) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const { data, response } = await api.PUT('/api/v1/packaging/projects/{id}', {
        params: { path: { id: initial.id } },
        body: projectPayload(document),
      });
      if (!response.ok || !data) {
        throw new Error(`保存失败（${response.status}）`);
      }
      const saved = fromProjectDto(data);
      dispatchHistory({ type: 'replace', document: saved });
      setBaseline(documentSignature(saved));
      setStatus(data.status);
      setSelectedPart(-1);
      setMessage('已保存');
      clearDraft();
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const requestSave = (): void => {
    if (!started) return;
    if (!editable || saving || blocked) return;
    if (isNew) {
      idempotencyKey.current = randomUuid();
      setSaveError(null);
      setSaveDialogOpen(true);
      return;
    }
    void persistExisting();
  };

  const submitNew = async (values: { name: string; customerName: string }): Promise<void> => {
    if (!editable || blocked) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data, response } = await api.POST('/api/v1/packaging/projects', {
        body: projectPayload(document, values),
        headers: { 'Idempotency-Key': idempotencyKey.current ?? randomUuid() },
      });
      if (!response.ok || !data) {
        throw new Error(`保存失败（${response.status}）`);
      }
      clearDraft();
      setSaveDialogOpen(false);
      router.replace(`/admin/packaging-design/${data.id}`);
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : '保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const startNextRevision = async (): Promise<void> => {
    if (!initial || !canManage || status !== 'ISSUED') return;
    setError(null);
    const { data, response } = await api.POST(
      '/api/v1/packaging/projects/{id}/next-revision',
      { params: { path: { id: initial.id } } },
    );
    if (!response.ok || !data) {
      setError(`新建下一版本失败（${response.status}）`);
      return;
    }
    setStatus(data.status);
    setMessage('已新建下一版本，可继续编辑；再次发布将生成新版本号');
  };

  const issue = async (): Promise<void> => {
    if (!initial || !canManage || status !== 'DRAFT') return;
    setError(null);
    const { data, response } = await api.POST('/api/v1/packaging/projects/{id}/issue', {
      params: { path: { id: initial.id } },
    });
    if (!response.ok || !data) {
      setError(`发布失败（${response.status}）`);
      return;
    }
    setStatus('ISSUED');
    setMessage(`已发布 R${String(data.revisionNo).padStart(2, '0')}，设计数据已锁定`);
    clearDraft();
    await revisionsQuery.refetch();
  };

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        requestSave();
        return;
      }
      if (mod && event.key.toLowerCase() === 'z') {
        if (isTypingTarget(event.target)) return;
        event.preventDefault();
        dispatchHistory({ type: event.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (event.key === 'Escape') {
        setSelectedPart(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // requestSave 依赖当前文档；重新注册即可
  }, [editable, saving, blocked, isNew, document]);

  const restoreDraft = (): void => {
    if (!draftCandidate) return;
    dispatchHistory({ type: 'replace', document: draftCandidate.document });
    setStarted(true);
    setDraftCandidate(null);
    setDraftReady(true);
    setMessage('已恢复本机草稿');
  };

  const discardDraft = (): void => {
    clearDraft();
    setDraftCandidate(null);
    setDraftReady(true);
  };

  const is2D = view !== '3d' && view !== 'sheet' && view !== 'split';
  const drawingView: PalletDrawingView = is2D ? (view as PalletDrawingView) : last2D;
  const mode: '2d' | '3d' | 'sheet' | 'split' =
    view === '3d' ? '3d' : view === 'sheet' ? 'sheet' : view === 'split' ? 'split' : '2d';
  const info = `${geometry.L} × ${geometry.W} × ${geometry.H} mm · ${geometry.pieces.length} 件构件${
    unit.unitType === 'PALLET' ? ` · 叉孔净高 ${geometry.forkPocketHeight} mm` : ''
  }`;
  const saveLabel = saving ? '保存中…' : isNew || dirty ? '未保存' : '已保存';
  const projectCode = initial?.code ?? 'PD-新方案';

  const changeMode = (next: '2d' | '3d' | 'sheet' | 'split'): void => {
    if (next === '2d') {
      setView(last2D);
      return;
    }
    setView(next);
  };

  const changeDrawingView = (next: PalletDrawingView): void => {
    setLast2D(next);
    setView(next);
  };

  const handlePanStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!started || !is2D) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('button, a, input, select, textarea')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      height: rect.height,
      viewBox,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePanMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = panRef.current;
    if (!start) return;
    const dx = ((event.clientX - start.x) / Math.max(1, start.width)) * start.viewBox.width;
    const dy = ((event.clientY - start.y) / Math.max(1, start.height)) * start.viewBox.height;
    setViewBox(panViewBox(start.viewBox, -dx, -dy));
  };

  const handlePanEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const publishDisabled =
    !initial || !canManage || status !== 'DRAFT' || dirty || blocked || saving;

  // 顶部文档栏（design/包装设计.md §9.2）：左侧方案名 / 状态 / 保存状态 / 版本；
  // 右侧「撤销 / 重做」图标按钮 + 固定「发布 / 打印 / 保存 / 导出」。
  const topBar = (
    <>
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background px-3">
        <Input
          value={document.project.name}
          onChange={(event) => updateProject({ name: event.target.value })}
          disabled={!editable}
          maxLength={100}
          aria-label="方案名称"
          placeholder="未命名方案"
          title="点击修改方案名称"
          className="h-8 w-auto min-w-[5.5rem] max-w-[280px] shrink-0 border-transparent bg-transparent px-1.5 text-wb-body font-semibold shadow-none transition-colors hover:bg-muted focus-visible:border-input [field-sizing:content] 2xl:max-w-[340px]"
        />
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-wb-meta text-muted-foreground">
          {!started ? '未开始' : (STATUS_LABELS[status] ?? status)}
        </span>
        <span className="hidden shrink-0 items-center gap-1.5 text-wb-meta text-muted-foreground xl:flex">
          <span
            className={cn(
              'size-1.5 rounded-full',
              saveLabel === '已保存' ? 'bg-primary' : 'bg-destructive',
            )}
            aria-hidden
          />
          {saveLabel}
        </span>
        {latestRevision ? (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-wb-meta font-medium">
            R{String(latestRevision).padStart(2, '0')}
          </span>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="撤销重做">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="撤销"
              title="撤销（Ctrl+Z）"
              disabled={!canUndo}
              onClick={() => dispatchHistory({ type: 'undo' })}
            >
              <Undo2Icon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="重做"
              title="重做（Ctrl+Shift+Z）"
              disabled={!canRedo}
              onClick={() => dispatchHistory({ type: 'redo' })}
            >
              <Redo2Icon />
            </Button>
          </div>
          <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
          <Button
            size="sm"
            variant="outline"
            className="text-wb-body"
            onClick={() => void issue()}
            disabled={publishDisabled}
          >
            发布
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-wb-body"
            disabled={!initial}
            onClick={() => {
              if (initial) router.push(`/admin/packaging-design/${initial.id}/report`);
            }}
          >
            打印
          </Button>
          <Button
            size="sm"
            onClick={requestSave}
            disabled={!editable || !started || saving || blocked}
            className={cn('text-wb-body', dirty && editable ? 'ring-2 ring-primary/20' : undefined)}
          >
            <SaveIcon />
            {saving ? '保存中…' : '保存'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              className={buttonVariants({
                size: 'sm',
                variant: 'outline',
                className: 'text-wb-body',
              })}
              aria-label="导出"
              disabled={!started}
            >
              导出
              <ChevronDownIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[190px]">
              <DropdownMenuItem onClick={() => exportSvgView('top', '俯视图')}>
                SVG 俯视图
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSvgView('front', '主视图')}>
                SVG 主视图
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSvgView('side', '侧视图')}>
                SVG 侧视图
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportSvgView('iso', '轴测图')}>
                SVG 轴测图
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSvg}>SVG 整图</DropdownMenuItem>
              <DropdownMenuItem onClick={exportDxf}>DXF 图纸</DropdownMenuItem>
              <DropdownMenuItem onClick={exportBomCsv}>BOM CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportCuttingCsv}>开料 CSV</DropdownMenuItem>
              <DropdownMenuItem
                disabled={mode !== '3d' && mode !== 'split'}
                onClick={() => {
                  viewer3dRef.current?.exportObj();
                  recordExport({ format: 'obj' });
                }}
              >
                OBJ 模型
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={mode !== '3d' && mode !== 'split'}
                onClick={() => {
                  viewer3dRef.current?.exportStl();
                  recordExport({ format: 'stl' });
                }}
              >
                STL 模型
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      {!editable ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 text-wb-meta text-muted-foreground">
          <span>
            {status === 'ISSUED'
              ? '方案已发布，设计数据已锁定；可新建下一版本继续编辑。'
              : status === 'ARCHIVED'
                ? '方案已归档，设计数据已锁定；可导出、打印或复制方案。'
                : '当前角色为只读，可查看图纸与料单，不能保存修改。'}
          </span>
          {status === 'ISSUED' && canManage ? (
            <Button
              size="xs"
              variant="outline"
              className="ml-auto shrink-0"
              onClick={() => void startNextRevision()}
            >
              新建下一版本
            </Button>
          ) : null}
        </div>
      ) : null}
      {draftCandidate ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-warning-border bg-warning-bg px-3 py-1.5 text-wb-meta text-warning">
          <span>
            发现本机草稿（{new Date(draftCandidate.savedAt).toLocaleString('zh-CN')}）
          </span>
          <Button size="xs" variant="outline" onClick={restoreDraft}>
            恢复草稿
          </Button>
          <Button size="xs" variant="ghost" onClick={discardDraft}>
            丢弃
          </Button>
        </div>
      ) : null}
      {error ? (
        <div className="shrink-0 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-wb-meta text-destructive">
          {error}
        </div>
      ) : null}
    </>
  );

  const center = (
    <>
      <div
        inert={!started}
        className={cn('shrink-0', !started && 'pointer-events-none opacity-50')}
      >
        <CanvasToolbar
          mode={mode}
          drawingView={drawingView}
          info={started ? info : '未选择结构'}
          compact={canvasCompact}
          onModeChange={changeMode}
          onDrawingViewChange={changeDrawingView}
          onZoomIn={() =>
            mode === '3d'
              ? viewer3dRef.current?.zoom(1.2)
              : setViewBox((current) => zoomViewBox(current, 1.2))
          }
          onZoomOut={() =>
            mode === '3d'
              ? viewer3dRef.current?.zoom(0.83)
              : setViewBox((current) => zoomViewBox(current, 0.83))
          }
          onReset={() => {
            if (mode === '3d' || mode === 'split') {
              setReset3DToken((value) => value + 1);
            }
            if (mode !== '3d') {
              setViewBox(fitViewBox());
            }
          }}
        />
      </div>
      <div
        ref={canvasRef}
        data-testid="workbench-canvas"
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onWheel={(event) => {
          if (!started || mode !== '2d') return;
          setViewBox((current) => zoomViewBox(current, event.deltaY < 0 ? 1.1 : 0.9));
        }}
      >
        {!started ? (
          <ViewportFrame>
            <StartShowcase />
          </ViewportFrame>
        ) : view === '3d' ? (
          <ViewportFrame>
            <Viewer3D
              ref={viewer3dRef}
              frameless
              geometry={geometry}
              selectedIndex={selectedPart}
              onSelect={selectPart}
              onFallback={() => {
                setLast2D('iso');
                setView('iso');
              }}
              className="h-full"
              resetToken={reset3DToken}
            />
          </ViewportFrame>
        ) : view === 'sheet' ? (
          <ViewportFrame>
            <div className="scroll-area h-full overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
              <SheetView
                frameless
                showFrame={false}
                sheet={sheet}
                className="mx-auto w-full max-w-[1080px]"
              />
            </div>
          </ViewportFrame>
        ) : view === 'split' ? (
          <ViewportFrame>
            <div className="grid h-full grid-cols-1 divide-y divide-border xl:grid-cols-2 xl:divide-x xl:divide-y-0">
              <div className="h-full min-h-[200px] min-w-0 overflow-hidden p-4">
                <DrawingView2D
                  geometry={geometry}
                  view={last2D}
                  selectedIndex={selectedPart}
                  onSelect={selectPart}
                  viewBox={viewBox}
                />
              </div>
              <Viewer3D
                ref={viewer3dRef}
                frameless
                geometry={geometry}
                selectedIndex={selectedPart}
                onSelect={selectPart}
                onFallback={() => {
                  setLast2D('iso');
                  setView('iso');
                }}
                className="h-full min-h-[200px]"
                resetToken={reset3DToken}
              />
            </div>
          </ViewportFrame>
        ) : (
          <ViewportFrame>
            <div className="h-full w-full p-6">
              <DrawingView2D
                geometry={geometry}
                view={drawingView}
                selectedIndex={selectedPart}
                onSelect={selectPart}
                viewBox={viewBox}
              />
            </div>
            <p className="pointer-events-none absolute bottom-2 right-3 text-wb-meta text-muted-foreground">
              左键拖拽平移 · 滚轮缩放 · 点击构件选中
            </p>
          </ViewportFrame>
        )}
        <ToolRail active={!rightOpen} onOpen={openTool} disabled={!started} />
        <BottomLauncher
          visible={!bottomOpen}
          disabled={!started}
          onOpen={(tab) => {
            setBottomTab(tab);
            setBottomOpen(true);
          }}
        />
        {message ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              'pointer-events-none absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border border-success-border bg-success-bg px-3 py-1.5 text-wb-meta text-success shadow-sm transition-all duration-300',
              messageLeaving ? '-translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
            )}
          >
            <CircleCheckIcon className="size-3.5" />
            {message}
          </div>
        ) : null}
      </div>
      <div
        aria-hidden={!bottomOpen}
        inert={!bottomOpen}
        className="shrink-0 overflow-hidden transition-[height] duration-200 ease-linear"
        style={{ height: bottomOpen ? bottomHeight : 0 }}
      >
        <BottomPanel
          height={bottomHeight}
          tab={bottomTab}
          compact={rightOpen}
          parts={components}
          partSources={partSources}
          materials={materials}
          selectedIndex={selectedPart}
          editable={editable}
          bom={bom}
          issueCount={issues.length}
          onTabChange={setBottomTab}
          onHeightChange={setBottomHeight}
          onCollapse={() => setBottomOpen(false)}
          onOpenIssues={() => openTool('validation')}
          onPartChange={updatePart}
          onPartSelect={selectPart}
          onPartMove={movePart}
        />
      </div>
    </>
  );

  return (
    <>
      <WorkbenchShell
        topBar={topBar}
        left={
          <UnitPanel
            unit={unit}
            outerSize={{
              lengthMm: geometry.L,
              widthMm: geometry.W,
              heightMm: geometry.H,
            }}
            editable={editable}
            saved={saved}
            structureLocked={structureLocked}
            started={started}
            collapsed={leftCollapsed}
            view={leftView}
            onViewChange={setLeftView}
            onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
            onSelectCatalog={selectCatalogItem}
            onUpdateUnit={updateUnit}
            onApplyPalletDims={applyPalletDims}
            onApplyCrateParams={applyCrateParams}
            onApplyFrameParams={applyFrameParams}
            onApplyDividerParams={applyDividerParams}
            onApplyDunnageParams={applyDunnageParams}
            onConfigureDeck={configureDeck}
            onChangeTemplate={changeTemplate}
            onOpenParts={() => {
              setBottomOpen(true);
              setBottomTab('parts');
            }}
          />
        }
        center={center}
        rightOpen={rightOpen}
        rightWidth={rightWidth}
        right={
          <Inspector
            tab={rightTab}
            width={rightWidth}
            onWidthChange={setRightWidth}
            onTabChange={setRightTab}
            project={document.project}
            projectCode={projectCode}
            unit={unit}
            materials={materials}
            bom={bom}
            editable={editable}
            selectedPartIndex={selectedPart}
            issues={issues}
            conclusion={conclusion}
            revisions={revisions}
            revisionsLoading={revisionsQuery.isLoading}
            onUpdateProject={updateProject}
            onUpdatePart={updatePart}
            onSelectPart={selectPart}
            onOpenRevision={setRevisionDialogNo}
            onCollapse={() => setRightOpen(false)}
          />
        }
      />
      <SaveSchemeDialog
        open={saveDialogOpen}
        defaultName={document.project.name}
        defaultCustomerName={document.project.customerName}
        submitting={saving}
        error={saveError}
        onOpenChange={(open) => {
          setSaveDialogOpen(open);
          if (!open) setSaveError(null);
        }}
        onSubmit={(values) => void submitNew(values)}
      />
      <RevisionDetailDialog
        open={revisionDialogNo !== null}
        projectId={initial?.id ?? ''}
        revisionNo={revisionDialogNo}
        onOpenChange={(open) => {
          if (!open) setRevisionDialogNo(null);
        }}
        onPrint={(revisionNo) => {
          if (!initial) return;
          setRevisionDialogNo(null);
          router.push(`/admin/packaging-design/${initial.id}/report?revision=${revisionNo}`);
        }}
      />
    </>
  );
}
