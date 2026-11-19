import { describe, expect, it } from 'vitest';
import type { ApiSchemas } from '@mcc/shared';
import {
  createHistory,
  createNewDocument,
  documentReducer,
  documentSignature,
  draftStorageKey,
  fromProjectDto,
  historyReducer,
  isProjectEditable,
  parseDraft,
  projectPayload,
  serializeDraft,
  type PackagingDocument,
} from './document';

const newDocument = (): PackagingDocument => createNewDocument();

describe('packaging document reducer', () => {
  it('新建文档默认一个托盘单元、方案名为未命名、默认出口', () => {    const document = newDocument();
    expect(document.units).toHaveLength(1);
    expect(document.units[0]!.unitType).toBe('PALLET');
    expect(document.units[0]!.templateCode).toBe('block');
    expect(document.units[0]!.name).toBe('1200×800 出口实木托盘');
    expect(document.units[0]!.parts.length).toBeGreaterThan(0);
    expect(document.project.name).toBe('未命名方案');
    expect(document.project.destination).toBe('export');
  });

  it('更新方案与单元不修改原对象', () => {
    const current = newDocument();
    const next = documentReducer(current, {
      type: 'updateProject',
      patch: { name: '出口方案' },
    });
    expect(next.project.name).toBe('出口方案');
    expect(current.project.name).not.toBe('出口方案');
  });

  it('目录切换单元类型与模板且始终只保留当前单元', () => {
    const one = newDocument();
    const crate = documentReducer(one, {
      type: 'selectCatalogItem',
      unitType: 'CRATE',
      templateCode: 'crate-g',
    });
    expect(crate.units).toHaveLength(1);
    expect(crate.units[0]!.unitType).toBe('CRATE');
    expect(crate.units[0]!.templateCode).toBe('crate-g');

    const pallet = documentReducer(crate, {
      type: 'selectCatalogItem',
      unitType: 'PALLET',
      templateCode: 'notched',
    });
    expect(pallet.units).toHaveLength(1);
    expect(pallet.units[0]!.unitType).toBe('PALLET');
    expect(pallet.units[0]!.templateCode).toBe('notched');
    expect(pallet.units[0]!.lengthMm).toBe(1100);
    expect(pallet.units[0]!.widthMm).toBe(1100);
  });

  it('木箱参数联动外尺寸与构件', () => {
    const current = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'CRATE',
      templateCode: 'crate-g',
    });
    const next = documentReducer(current, {
      type: 'applyCrateParams',
      index: 0,
      patch: {
        innerLengthMm: 1000,
        innerWidthMm: 700,
        thicknessMm: 20,
        bottomThicknessMm: 18,
        baseHeightMm: 100,
        frameThicknessMm: 80,
      },
    });
    expect(next.units).toHaveLength(1);
    const unit = next.units[0]!;
    expect(unit.lengthMm).toBe(1200);
    expect(unit.widthMm).toBe(900);
    expect(unit.bottomThicknessMm).toBe(18);
    expect(unit.parts.find((part) => part.name === '底板')?.heightMm).toBe(18);
    expect(unit.parts.find((part) => part.name === '侧板')?.lengthMm).toBe(1000);
    expect(unit.parts.find((part) => part.role === 'frame')?.lengthMm).toBe(80);
    expect(unit.templateCode).toBe('crate-g');
  });

  it('托盘改长宽重算构件，手动铺板数量保留', () => {
    const current = newDocument();
    const manual = documentReducer(current, {
      type: 'configureDeck',
      index: 0,
      deck: 'top',
      mode: 'manual',
      count: 6,
    });
    expect(manual.units[0]!.topDeckMode).toBe('manual');
    expect(manual.units[0]!.parts.find((part) => part.role === 'topDeck')?.quantity).toBe(6);

    const next = documentReducer(manual, {
      type: 'applyPalletDims',
      index: 0,
      patch: { lengthMm: 1400 },
    });
    expect(next.units[0]!.lengthMm).toBe(1400);
    expect(next.units[0]!.parts.find((part) => part.role === 'topDeck')?.lengthMm).toBe(1400);
    expect(next.units[0]!.parts.find((part) => part.role === 'topDeck')?.quantity).toBe(6);

    const auto = documentReducer(next, {
      type: 'configureDeck',
      index: 0,
      deck: 'top',
      mode: 'auto',
    });
    expect(auto.units[0]!.topDeckMode).toBe('auto');
    expect(auto.units[0]!.parts.find((part) => part.role === 'topDeck')?.quantity).toBe(5);
  });

  it('滑木箱：目录切换、滑木参数与保存 payload', () => {
    const skid = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'SKID',
      templateCode: 'skid-g',
    });
    expect(skid.units[0]!.unitType).toBe('SKID');
    expect(skid.units[0]!.templateCode).toBe('skid-g');
    expect(skid.units[0]!.name).toBe('滑木箱 G 型');
    const runner = skid.units[0]!.parts.find((part) => part.role === 'runner');
    expect(runner?.quantity).toBe(3);
    const payload = projectPayload(skid);
    expect(payload.units[0]!.unitType).toBe('SKID');
    expect((payload.units[0]!.params as { runnerCount?: number }).runnerCount).toBe(3);
  });

  it('钢带箱：目录切换、钢带参数与保存 payload', () => {
    const strap = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'STEEL_STRAP',
      templateCode: 'steel-strap-g',
    });
    expect(strap.units[0]!.unitType).toBe('STEEL_STRAP');
    expect(strap.units[0]!.templateCode).toBe('steel-strap-g');
    expect(strap.units[0]!.name).toBe('钢带箱 G 型');
    expect(strap.units[0]!.frameThicknessMm).toBe(0);
    expect(strap.units[0]!.steelStrapCount).toBe(4);
    expect(strap.units[0]!.lengthMm).toBe(1230);
    expect(strap.units[0]!.widthMm).toBe(830);
    expect(strap.units[0]!.parts.some((part) => part.role === 'frame')).toBe(false);

    const both = documentReducer(strap, {
      type: 'applyCrateParams',
      index: 0,
      patch: { strapDirection: 'both', strapWidthMm: 40 },
    });
    expect(both.units[0]!.strapDirection).toBe('both');
    expect(both.units[0]!.parts.find((part) => part.name === '钢带（横向）')?.quantity).toBe(2);
    expect(both.units[0]!.parts.find((part) => part.name === '钢带（纵向）')?.quantity).toBe(2);

    const payload = projectPayload(both);
    expect(payload.units[0]!.unitType).toBe('STEEL_STRAP');
    expect(payload.units[0]!.params).toMatchObject({
      frameThicknessMm: 0,
      steelStrapCount: 4,
      strapWidthMm: 40,
      strapDirection: 'both',
    });

    const dto = {
      id: 'project-steel-strap',
      code: 'PD-00003',
      name: '钢带箱方案',
      customerName: '',
      destination: 'export',
      note: '',
      status: 'DRAFT',
      units: [
        {
          id: 'unit-steel-strap',
          unitType: 'STEEL_STRAP',
          templateCode: 'steel-strap-g',
          name: '钢带箱',
          lengthMm: 1230,
          widthMm: 830,
          targetLoadKg: null,
          loadType: 'uniform',
          params: payload.units[0]!.params,
          parts: payload.units[0]!.parts.map((part, index) => ({ ...part, seq: index + 1 })),
        },
      ],
    } as unknown as ApiSchemas['PackagingProjectDto'];
    const restored = fromProjectDto(dto);
    expect(restored.units[0]!.frameThicknessMm).toBe(0);
    expect(restored.units[0]!.strapDirection).toBe('both');
    expect(restored.units[0]!.strapWidthMm).toBe(40);
  });

  it('框架箱：目录切换、面板覆盖与保存 payload', () => {
    const frame = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'FRAME',
      templateCode: 'frame-g',
    });
    expect(frame.units[0]!.unitType).toBe('FRAME');
    expect(frame.units[0]!.templateCode).toBe('frame-g');
    expect(frame.units[0]!.name).toBe('框架箱 G 型');
    expect(frame.units[0]!.lengthMm).toBe(1380);
    expect(frame.units[0]!.widthMm).toBe(980);
    expect(frame.units[0]!.parts.find((part) => part.name === '立柱')?.quantity).toBe(4);
    expect(frame.units[0]!.parts.some((part) => part.role === 'panel')).toBe(false);

    const paneled = documentReducer(frame, {
      type: 'applyFrameParams',
      index: 0,
      patch: { panelCoverage: 'sides', hasLid: false },
    });
    expect(paneled.units[0]!.lengthMm).toBe(1410);
    expect(paneled.units[0]!.widthMm).toBe(1010);
    expect(paneled.units[0]!.parts.filter((part) => part.role === 'panel')).toHaveLength(2);
    expect(paneled.units[0]!.parts.some((part) => part.role === 'topDeck')).toBe(false);

    const payload = projectPayload(paneled);
    expect(payload.units[0]!.unitType).toBe('FRAME');
    expect(payload.units[0]!.params).toMatchObject({
      frameThicknessMm: 90,
      panelCoverage: 'sides',
      hasLid: false,
    });
  });

  it('围板：目录切换、层数与保存 payload', () => {
    const divider = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'DIVIDER',
      templateCode: 'divider-g',
    });
    expect(divider.units[0]!.unitType).toBe('DIVIDER');
    expect(divider.units[0]!.templateCode).toBe('divider-g');
    expect(divider.units[0]!.name).toBe('围板 G 型');
    expect(divider.units[0]!.lengthMm).toBe(1216);
    expect(divider.units[0]!.widthMm).toBe(816);
    expect(divider.units[0]!.parts.find((part) => part.name === '长围板')?.quantity).toBe(2);

    const layered = documentReducer(divider, {
      type: 'applyDividerParams',
      index: 0,
      patch: { layerCount: 2, layerHeightMm: 250 },
    });
    expect(layered.units[0]!.layerCount).toBe(2);
    expect(layered.units[0]!.parts.find((part) => part.name === '长围板')?.quantity).toBe(4);
    expect(layered.units[0]!.parts.find((part) => part.name === '铰链')?.quantity).toBe(8);

    const payload = projectPayload(layered);
    expect(payload.units[0]!.unitType).toBe('DIVIDER');
    expect(payload.units[0]!.params).toMatchObject({
      layerCount: 2,
      layerHeightMm: 250,
      thicknessMm: 8,
      hingeCount: 4,
    });
  });

  it('垫木：目录切换、数量与排列', () => {
    const dunnage = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'DUNNAGE',
      templateCode: 'dunnage-g',
    });
    expect(dunnage.units[0]!.unitType).toBe('DUNNAGE');
    expect(dunnage.units[0]!.templateCode).toBe('dunnage-g');
    expect(dunnage.units[0]!.name).toBe('垫木 G 型');
    expect(dunnage.units[0]!.lengthMm).toBe(1200);
    expect(dunnage.units[0]!.widthMm).toBe(270);
    expect(dunnage.units[0]!.parts[0]!.quantity).toBe(3);

    const wider = documentReducer(dunnage, {
      type: 'applyDunnageParams',
      index: 0,
      patch: { dunnageQuantity: 4 },
    });
    expect(wider.units[0]!.widthMm).toBe(360);

    const cross = documentReducer(wider, {
      type: 'applyDunnageParams',
      index: 0,
      patch: { dunnageArrangement: 'cross' },
    });
    expect(cross.units[0]!.widthMm).toBe(90);
    expect(cross.units[0]!.parts).toHaveLength(2);

    const payload = projectPayload(cross);
    expect(payload.units[0]!.unitType).toBe('DUNNAGE');
    expect(payload.units[0]!.params).toMatchObject({
      quantity: 4,
      arrangement: 'cross',
      thicknessMm: 90,
    });
  });

  it('构件修改与排序', () => {
    const current = newDocument();
    const updated = documentReducer(current, {
      type: 'updatePart',
      unitIndex: 0,
      partIndex: 0,
      patch: { quantity: 6 },
    });
    expect(updated.units[0]!.parts[0]!.quantity).toBe(6);
    const moved = documentReducer(updated, {
      type: 'movePart',
      unitIndex: 0,
      partIndex: 0,
      direction: 1,
    });
    expect(moved.units[0]!.parts[1]!.quantity).toBe(6);
  });
});

describe('packaging history', () => {
  it('撤销与重做恢复文档', () => {
    const initial = newDocument();
    const applied = historyReducer(createHistory(initial), {
      type: 'apply',
      action: { type: 'updateProject', patch: { name: 'A' } },
      at: 1,
    });
    expect(applied.present.project.name).toBe('A');
    const undone = historyReducer(applied, { type: 'undo' });
    expect(undone.present.project.name).toBe(initial.project.name);
    const redone = historyReducer(undone, { type: 'redo' });
    expect(redone.present.project.name).toBe('A');
  });

  it('同一字段连续输入在窗口内合并为一步', () => {
    const initial = newDocument();
    const first = historyReducer(createHistory(initial), {
      type: 'apply',
      action: { type: 'updateProject', patch: { name: '出' } },
      mergeKey: 'project:name',
      at: 1000,
    });
    const second = historyReducer(first, {
      type: 'apply',
      action: { type: 'updateProject', patch: { name: '出口' } },
      mergeKey: 'project:name',
      at: 1200,
    });
    expect(second.past).toHaveLength(1);
    const undone = historyReducer(second, { type: 'undo' });
    expect(undone.present.project.name).toBe(initial.project.name);
  });

  it('replace 重置历史', () => {
    const initial = newDocument();
    const applied = historyReducer(createHistory(initial), {
      type: 'apply',
      action: { type: 'updateProject', patch: { name: 'A' } },
      at: 1,
    });
    const replaced = historyReducer(applied, {
      type: 'replace',
      document: documentReducer(applied.present, {
        type: 'updateProject',
        patch: { name: 'B' },
      }),
    });
    expect(replaced.past).toHaveLength(0);
    expect(replaced.future).toHaveLength(0);
    expect(replaced.present.project.name).toBe('B');
  });
});

describe('packaging document helpers', () => {
  it('签名随文档变化', () => {
    const current = newDocument();
    const next = documentReducer(current, {
      type: 'updateProject',
      patch: { customerName: '客户' },
    });
    expect(documentSignature(next)).not.toBe(documentSignature(current));
  });

  it('本地草稿可序列化并解析', () => {
    const current = newDocument();
    const parsed = parseDraft(serializeDraft(current));
    expect(parsed?.document.units).toHaveLength(1);
    expect(parseDraft('{bad json')).toBeNull();
    expect(parseDraft(null)).toBeNull();
  });

  it('草稿 key 区分用户、方案与新建标签页', () => {
    expect(draftStorageKey('admin', 'p1', 'tab')).toContain('admin:p1');
    expect(draftStorageKey('admin', null, 'tab')).toContain('new:tab');
  });

  it('保存 payload 覆盖首次保存名称与客户', () => {
    const payload = projectPayload(newDocument(), {
      name: '首次保存',
      customerName: '客户 A',
    });
    expect(payload.name).toBe('首次保存');
    expect(payload.customerName).toBe('客户 A');
    expect(payload.units).toHaveLength(1);
  });

  it('保存 payload 只提交当前单元', () => {
    const document = newDocument();
    const payload = projectPayload({
      ...document,
      units: [...document.units, document.units[0]!],
    });
    expect(payload.units).toHaveLength(1);
    expect(payload.units[0]!.templateCode).toBe('block');
  });

  it('托盘铺板配置随 params 保存并可恢复', () => {
    const document = documentReducer(newDocument(), {
      type: 'configureDeck',
      index: 0,
      deck: 'top',
      mode: 'manual',
      count: 6,
    });
    const payload = projectPayload(document);
    expect(payload.units[0]!.params).toMatchObject({
      deck: { top: { mode: 'manual', count: 6 }, bottom: { mode: 'auto', count: null } },
    });

    const dto = {
      id: 'project-deck',
      code: 'PD-00001',
      name: '配置方案',
      customerName: '',
      destination: 'export',
      note: '',
      status: 'DRAFT',
      units: [
        {
          id: 'unit-deck',
          unitType: 'PALLET',
          templateCode: 'block',
          name: '托盘',
          lengthMm: 1200,
          widthMm: 800,
          targetLoadKg: null,
          loadType: 'uniform',
          params: payload.units[0]!.params,
          parts: payload.units[0]!.parts.map((part, index) => ({ ...part, seq: index + 1 })),
        },
      ],
    } as unknown as ApiSchemas['PackagingProjectDto'];
    const restored = fromProjectDto(dto);
    expect(restored.units[0]!.topDeckMode).toBe('manual');
    expect(restored.units[0]!.topDeckCount).toBe(6);
    expect(restored.units[0]!.bottomDeckMode).toBe('auto');
  });

  it('木箱钢带数量随 params 保存并可恢复', () => {
    const crate = documentReducer(newDocument(), {
      type: 'selectCatalogItem',
      unitType: 'CRATE',
      templateCode: 'crate-g',
    });
    const noStrap = documentReducer(crate, {
      type: 'applyCrateParams',
      index: 0,
      patch: { steelStrapCount: 0 },
    });
    expect(noStrap.units[0]!.parts.some((part) => part.role === 'steelStrap')).toBe(false);
    const payload = projectPayload(noStrap);
    expect(
      (payload.units[0]!.params as { steelStrapCount?: number }).steelStrapCount,
    ).toBe(0);

    const dto = {
      id: 'project-crate',
      code: 'PD-00002',
      name: '木箱方案',
      customerName: '',
      destination: 'export',
      note: '',
      status: 'DRAFT',
      units: [
        {
          id: 'unit-crate',
          unitType: 'CRATE',
          templateCode: 'crate-g',
          name: '木箱',
          lengthMm: 1410,
          widthMm: 1010,
          targetLoadKg: null,
          loadType: 'uniform',
          params: payload.units[0]!.params,
          parts: payload.units[0]!.parts.map((part, index) => ({ ...part, seq: index + 1 })),
        },
      ],
    } as unknown as ApiSchemas['PackagingProjectDto'];
    const restored = fromProjectDto(dto);
    expect(restored.units[0]!.steelStrapCount).toBe(0);
    expect(restored.units[0]!.parts.some((part) => part.role === 'steelStrap')).toBe(false);
  });

  it('历史多单元方案只读取首个单元', () => {
    const dto = {
      id: 'project-1',
      name: '历史方案',
      customerName: '',
      destination: 'export',
      note: '',
      status: 'DRAFT',
      units: [
        {
          id: 'unit-1',
          unitType: 'PALLET',
          templateCode: 'block',
          name: '托盘单元',
          lengthMm: 1200,
          widthMm: 800,
          targetLoadKg: null,
          loadType: 'uniform',
          params: { entryDirection: '4' },
          parts: [],
        },
        {
          id: 'unit-2',
          unitType: 'CRATE',
          templateCode: 'crate-g',
          name: '木箱单元',
          lengthMm: 1200,
          widthMm: 800,
          targetLoadKg: null,
          loadType: 'uniform',
          params: {},
          parts: [],
        },
      ],
    } as unknown as ApiSchemas['PackagingProjectDto'];
    const document = fromProjectDto(dto);
    expect(document.units).toHaveLength(1);
    expect(document.units[0]!.name).toBe('托盘单元');
  });

  it('已发布与已归档都不可编辑', () => {
    expect(isProjectEditable(true, 'DRAFT')).toBe(true);
    expect(isProjectEditable(true, 'ISSUED')).toBe(false);
    expect(isProjectEditable(true, 'ARCHIVED')).toBe(false);
    expect(isProjectEditable(false, 'DRAFT')).toBe(false);
  });
});
