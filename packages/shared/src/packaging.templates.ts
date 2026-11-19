import type { PackagingUnitType } from './packaging.schemas';
import { PALLET_TEMPLATE_OPTIONS } from './pallet.templates';

// 包装设计模板与单元类型预置（product/包装设计.md R-包装设计-009）：
// v1 由服务端首次读取时落库；托盘沿用既有代码构建器，木箱 G 型使用 definition 数据。

export const PACKAGING_UNIT_TYPE_LABELS: Record<PackagingUnitType, string> = {
  PALLET: '托盘',
  CRATE: '普通木箱',
  SKID: '滑木箱',
  FRAME: '框架箱',
  DIVIDER: '围板',
  DUNNAGE: '垫木',
  STEEL_STRAP: '钢带箱',
};

export interface PackagingTemplateSeed {
  code: string;
  unitType: PackagingUnitType;
  name: string;
  definition: Record<string, unknown>;
}

const PALLET_ENTRY_OPTIONS = [
  { value: '4', label: '四向进叉' },
  { value: '2', label: '两向进叉' },
];

const palletTemplate = (code: string, name: string): PackagingTemplateSeed => {
  const option = PALLET_TEMPLATE_OPTIONS.find((item) => item.value === code);
  const lengthMm = option?.defaultLengthMm ?? 1200;
  const widthMm = option?.defaultWidthMm ?? 800;
  return {
    code,
    unitType: 'PALLET',
    name,
    definition: {
      schemaVersion: 1,
      builder: 'pallet',
      config: [
        {
          key: 'entryDirection',
          label: '进叉方向',
          group: '外形尺寸',
          type: 'select',
          options: PALLET_ENTRY_OPTIONS,
          default: '4',
        },
        { key: 'lengthMm', label: '长度（mm）', group: '外形尺寸', type: 'int', min: 1, default: lengthMm },
        { key: 'widthMm', label: '宽度（mm）', group: '外形尺寸', type: 'int', min: 1, default: widthMm },
        { key: 'topDeck', label: '上铺板（面板）', group: '铺板配置', type: 'deck', default: 'auto' },
        { key: 'bottomDeck', label: '下铺板（底板）', group: '铺板配置', type: 'deck', default: 'auto' },
      ],
      params: [
        { key: 'lengthMm', label: '长度', type: 'int', min: 1, default: lengthMm },
        { key: 'widthMm', label: '宽度', type: 'int', min: 1, default: widthMm },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO'],
    },
  };
};

export const PACKAGING_DEFAULT_TEMPLATES: PackagingTemplateSeed[] = [
  palletTemplate('block', '九墩块四向进叉'),
  palletTemplate('stringer', '三纵梁两向进叉'),
  palletTemplate('notched', '开槽纵梁四向进叉'),
  palletTemplate('skid', '滑木'),
  palletTemplate('plywood', '胶合板'),
  palletTemplate('custom', '自定义托盘'),
  {
    code: 'crate-g',
    unitType: 'CRATE',
    name: '普通木箱 G 型',
    definition: {
      schemaVersion: 1,
      builder: 'crate',
      structure: {
        builder: 'crate',
        roles: ['runner', 'bottomDeck', 'panel', 'frame', 'topDeck', 'steelStrap'],
      },
      config: [
        { key: 'innerLengthMm', label: '内长（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 900 },
        { key: 'thicknessMm', label: '面板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'bottomThicknessMm', label: '底板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '底部支承（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 90 },
        { key: 'frameThicknessMm', label: '框架厚度（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 90 },
        {
          key: 'entryDirection',
          label: '进叉方向',
          group: '加固',
          type: 'select',
          options: PALLET_ENTRY_OPTIONS,
          default: '4',
        },
        {
          key: 'steelStrapCount',
          label: '钢带数量（道）',
          group: '加固',
          type: 'int',
          min: 0,
          max: 4,
          default: 2,
          help: '0 表示不配钢带',
        },
      ],
      // 木箱 G 型的构件由共享构建器派生（design/crate.ts），模板不再重复构件行。
      derived: {
        outer: {
          length: 'innerLengthMm + 2 * (thicknessMm + frameThicknessMm)',
          width: 'innerWidthMm + 2 * (thicknessMm + frameThicknessMm)',
          height: 'baseHeightMm + bottomThicknessMm + innerHeightMm + thicknessMm',
        },
        parts: 'deriveCrateParts',
      },
      params: [
        { key: 'innerLengthMm', label: '内长', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高', type: 'int', min: 1, default: 900 },
        { key: 'thicknessMm', label: '面板厚', type: 'int', min: 1, default: 15 },
        { key: 'bottomThicknessMm', label: '底板厚', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '底部支承', type: 'int', min: 1, default: 90 },
        { key: 'frameThicknessMm', label: '框架厚度', type: 'int', min: 1, default: 90 },
        { key: 'steelStrapCount', label: '钢带数量', type: 'int', min: 0, max: 4, default: 2 },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO', 'EXPANDED'],
    },
  },
  {
    code: 'skid-g',
    unitType: 'SKID',
    name: '滑木箱 G 型',
    definition: {
      schemaVersion: 1,
      builder: 'crate',
      structure: {
        builder: 'crate',
        roles: ['runner', 'bottomDeck', 'panel', 'frame', 'topDeck', 'steelStrap'],
      },
      config: [
        { key: 'innerLengthMm', label: '内长（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 900 },
        { key: 'thicknessMm', label: '面板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'bottomThicknessMm', label: '底板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'frameThicknessMm', label: '框架厚度（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 90 },
        { key: 'runnerCount', label: '滑木数量', group: '滑木', type: 'int', min: 2, max: 4, default: 3 },
        { key: 'runnerWidthMm', label: '滑木宽度（mm）', group: '滑木', type: 'int', min: 1, default: 90 },
        {
          key: 'entryDirection',
          label: '进叉方向',
          group: '加固',
          type: 'select',
          options: PALLET_ENTRY_OPTIONS,
          default: '4',
        },
        {
          key: 'steelStrapCount',
          label: '钢带数量（道）',
          group: '加固',
          type: 'int',
          min: 0,
          max: 4,
          default: 2,
          help: '0 表示不配钢带',
        },
      ],
      derived: {
        outer: {
          length: 'innerLengthMm + 2 * (thicknessMm + frameThicknessMm)',
          width: 'innerWidthMm + 2 * (thicknessMm + frameThicknessMm)',
          height: 'baseHeightMm + bottomThicknessMm + innerHeightMm + thicknessMm',
        },
        parts: 'deriveCrateParts',
      },
      params: [
        { key: 'innerLengthMm', label: '内长', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高', type: 'int', min: 1, default: 900 },
        { key: 'thicknessMm', label: '面板厚', type: 'int', min: 1, default: 15 },
        { key: 'bottomThicknessMm', label: '底板厚', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '底部支承', type: 'int', min: 1, default: 90 },
        { key: 'frameThicknessMm', label: '框架厚度', type: 'int', min: 1, default: 90 },
        { key: 'runnerCount', label: '滑木数量', type: 'int', min: 2, max: 4, default: 3 },
        { key: 'runnerWidthMm', label: '滑木宽度', type: 'int', min: 1, default: 90 },
        { key: 'steelStrapCount', label: '钢带数量', type: 'int', min: 0, max: 4, default: 2 },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO', 'EXPANDED'],
    },
  },
  {
    code: 'steel-strap-g',
    unitType: 'STEEL_STRAP',
    name: '钢带箱 G 型',
    definition: {
      schemaVersion: 1,
      builder: 'crate',
      structure: {
        builder: 'crate',
        roles: ['runner', 'bottomDeck', 'panel', 'frame', 'topDeck', 'steelStrap'],
      },
      config: [
        { key: 'innerLengthMm', label: '内长（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 900 },
        { key: 'thicknessMm', label: '面板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'bottomThicknessMm', label: '底板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '底部支承（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 90 },
        {
          key: 'frameThicknessMm',
          label: '框架厚度（mm）',
          group: '箱体尺寸',
          type: 'int',
          min: 0,
          default: 0,
          help: '0 表示无木框架',
        },
        {
          key: 'steelStrapCount',
          label: '钢带数量（道）',
          group: '钢带',
          type: 'int',
          min: 2,
          max: 6,
          default: 4,
        },
        {
          key: 'strapWidthMm',
          label: '钢带宽度（mm）',
          group: '钢带',
          type: 'int',
          min: 20,
          max: 40,
          default: 30,
        },
        {
          key: 'strapDirection',
          label: '钢带方向',
          group: '钢带',
          type: 'select',
          options: [
            { value: 'horizontal', label: '横向' },
            { value: 'both', label: '纵横' },
          ],
          default: 'horizontal',
        },
        {
          key: 'entryDirection',
          label: '进叉方向',
          group: '加固',
          type: 'select',
          options: PALLET_ENTRY_OPTIONS,
          default: '4',
        },
      ],
      derived: {
        outer: {
          length: 'innerLengthMm + 2 * (thicknessMm + frameThicknessMm)',
          width: 'innerWidthMm + 2 * (thicknessMm + frameThicknessMm)',
          height: 'baseHeightMm + bottomThicknessMm + innerHeightMm + thicknessMm',
        },
        parts: 'deriveCrateParts',
      },
      params: [
        { key: 'innerLengthMm', label: '内长', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高', type: 'int', min: 1, default: 900 },
        { key: 'thicknessMm', label: '面板厚', type: 'int', min: 1, default: 15 },
        { key: 'bottomThicknessMm', label: '底板厚', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '底部支承', type: 'int', min: 1, default: 90 },
        { key: 'frameThicknessMm', label: '框架厚度', type: 'int', min: 0, default: 0 },
        { key: 'steelStrapCount', label: '钢带数量', type: 'int', min: 2, max: 6, default: 4 },
        { key: 'strapWidthMm', label: '钢带宽度', type: 'int', min: 20, max: 40, default: 30 },
        { key: 'strapDirection', label: '钢带方向', type: 'select', default: 'horizontal' },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO', 'EXPANDED'],
    },
  },
  {
    code: 'frame-g',
    unitType: 'FRAME',
    name: '框架箱 G 型',
    definition: {
      schemaVersion: 1,
      builder: 'frame',
      structure: {
        builder: 'frame',
        roles: ['runner', 'bottomDeck', 'frame', 'panel', 'topDeck', 'steelStrap'],
      },
      config: [
        { key: 'innerLengthMm', label: '内长（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 900 },
        { key: 'bottomThicknessMm', label: '底板厚（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '滑木高度（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 90 },
        {
          key: 'frameThicknessMm',
          label: '框架厚度（mm）',
          group: '框架尺寸',
          type: 'int',
          min: 1,
          default: 90,
          help: '立柱与框梁截面',
        },
        { key: 'runnerWidthMm', label: '滑木宽度（mm）', group: '框架尺寸', type: 'int', min: 1, default: 90 },
        {
          key: 'panelThicknessMm',
          label: '面板厚（mm）',
          group: '面板与盖板',
          type: 'int',
          min: 0,
          default: 15,
          help: '0 表示无面板',
        },
        {
          key: 'panelCoverage',
          label: '面板覆盖',
          group: '面板与盖板',
          type: 'select',
          options: [
            { value: 'none', label: '无' },
            { value: 'sides', label: '侧端' },
            { value: 'full', label: '全包' },
          ],
          default: 'none',
        },
        {
          key: 'hasLid',
          label: '盖板',
          group: '面板与盖板',
          type: 'select',
          options: [
            { value: '1', label: '有' },
            { value: '0', label: '无' },
          ],
          default: '1',
        },
        {
          key: 'steelStrapCount',
          label: '钢带数量（道）',
          group: '加固',
          type: 'int',
          min: 0,
          max: 4,
          default: 0,
          help: '0 表示不配钢带',
        },
        {
          key: 'entryDirection',
          label: '进叉方向',
          group: '加固',
          type: 'select',
          options: PALLET_ENTRY_OPTIONS,
          default: '4',
        },
      ],
      derived: {
        outer: {
          length: '内长 + 2 × 框架厚度 +（有面板时 2 × 面板厚）',
          width: '内宽 + 2 × 框架厚度 +（有面板时 2 × 面板厚）',
          height: '滑木高度 + 底板厚 + 内高 + 框架厚度 +（有盖板时 面板厚）',
        },
        parts: 'deriveFrameParts',
      },
      params: [
        { key: 'innerLengthMm', label: '内长', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽', type: 'int', min: 1, default: 800 },
        { key: 'innerHeightMm', label: '内高', type: 'int', min: 1, default: 900 },
        { key: 'frameThicknessMm', label: '框架厚度', type: 'int', min: 1, default: 90 },
        { key: 'bottomThicknessMm', label: '底板厚', type: 'int', min: 1, default: 15 },
        { key: 'baseHeightMm', label: '滑木高度', type: 'int', min: 1, default: 90 },
        { key: 'runnerWidthMm', label: '滑木宽度', type: 'int', min: 1, default: 90 },
        { key: 'panelThicknessMm', label: '面板厚', type: 'int', min: 0, default: 15 },
        { key: 'panelCoverage', label: '面板覆盖', type: 'select', default: 'none' },
        { key: 'hasLid', label: '盖板', type: 'select', default: '1' },
        { key: 'steelStrapCount', label: '钢带数量', type: 'int', min: 0, max: 4, default: 0 },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO', 'EXPANDED'],
    },
  },
  {
    code: 'divider-g',
    unitType: 'DIVIDER',
    name: '围板 G 型',
    definition: {
      schemaVersion: 1,
      builder: 'divider',
      structure: {
        builder: 'divider',
        roles: ['panel', 'custom'],
      },
      config: [
        { key: 'innerLengthMm', label: '内长（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽（mm）', group: '箱体尺寸', type: 'int', min: 1, default: 800 },
        { key: 'layerHeightMm', label: '单层高度（mm）', group: '围板尺寸', type: 'int', min: 1, default: 200 },
        {
          key: 'layerCount',
          label: '层数',
          group: '围板尺寸',
          type: 'int',
          min: 1,
          max: 3,
          default: 1,
        },
        { key: 'thicknessMm', label: '板厚（mm）', group: '围板尺寸', type: 'int', min: 1, default: 8 },
        { key: 'lapWidthMm', label: '搭接宽度（mm）', group: '围板尺寸', type: 'int', min: 0, default: 30 },
        {
          key: 'hingeCount',
          label: '铰链数量 / 层',
          group: '连接件',
          type: 'int',
          min: 0,
          max: 4,
          default: 4,
          help: '0 表示不配铰链',
        },
      ],
      derived: {
        outer: {
          length: '内长 + 2 × 板厚',
          width: '内宽 + 2 × 板厚',
          height: '单层高度 × 层数',
        },
        parts: 'deriveDividerParts',
      },
      params: [
        { key: 'innerLengthMm', label: '内长', type: 'int', min: 1, default: 1200 },
        { key: 'innerWidthMm', label: '内宽', type: 'int', min: 1, default: 800 },
        { key: 'layerHeightMm', label: '单层高度', type: 'int', min: 1, default: 200 },
        { key: 'layerCount', label: '层数', type: 'int', min: 1, max: 3, default: 1 },
        { key: 'thicknessMm', label: '板厚', type: 'int', min: 1, default: 8 },
        { key: 'lapWidthMm', label: '搭接宽度', type: 'int', min: 0, default: 30 },
        { key: 'hingeCount', label: '铰链数量 / 层', type: 'int', min: 0, max: 4, default: 4 },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO'],
    },
  },
  {
    code: 'dunnage-g',
    unitType: 'DUNNAGE',
    name: '垫木 G 型',
    definition: {
      schemaVersion: 1,
      builder: 'dunnage',
      structure: {
        builder: 'dunnage',
        roles: ['dunnage'],
      },
      config: [
        { key: 'lengthMm', label: '长度（mm）', group: '尺寸与排列', type: 'int', min: 1, default: 1200 },
        { key: 'widthMm', label: '宽度（mm）', group: '尺寸与排列', type: 'int', min: 1, default: 90 },
        { key: 'thicknessMm', label: '厚度（mm）', group: '尺寸与排列', type: 'int', min: 1, default: 90 },
        {
          key: 'quantity',
          label: '数量',
          group: '尺寸与排列',
          type: 'int',
          min: 1,
          max: 20,
          default: 3,
        },
        {
          key: 'arrangement',
          label: '排列',
          group: '尺寸与排列',
          type: 'select',
          options: [
            { value: 'parallel', label: '平行' },
            { value: 'cross', label: '交叉' },
          ],
          default: 'parallel',
        },
      ],
      derived: {
        outer: {
          length: '单根长度',
          width: '平行：数量 × 单根宽度；交叉：单根宽度',
          height: '平行：单根厚度；交叉：2 × 单根厚度',
        },
        parts: 'deriveDunnageParts',
      },
      params: [
        { key: 'lengthMm', label: '长度', type: 'int', min: 1, default: 1200 },
        { key: 'widthMm', label: '宽度', type: 'int', min: 1, default: 90 },
        { key: 'thicknessMm', label: '厚度', type: 'int', min: 1, default: 90 },
        { key: 'quantity', label: '数量', type: 'int', min: 1, max: 20, default: 3 },
        { key: 'arrangement', label: '排列', type: 'select', default: 'parallel' },
      ],
      views: ['TOP', 'FRONT', 'SIDE', 'ISO'],
    },
  },
];
