import {
  buildPalletGeometry,
  calcPalletBom,
  PALLET_DEFAULT_MATERIALS,
  palletTemplateComponents,
  type PalletBom,
  type PalletComponentInput,
  type PalletGeometry,
  type PalletTemplateType,
} from '@mcc/shared';

// 公开落地页的托盘演示模型（design/落地页.md §3）：
// 与工作台共用共享几何 / BOM 纯函数，不调接口、不落库、不生成方案编号。

export type DemoTemplate = Exclude<PalletTemplateType, 'custom'>;

export const DEMO_LENGTH_RANGE = { min: 600, max: 2400, step: 50 };
export const DEMO_WIDTH_RANGE = { min: 600, max: 2400, step: 50 };

export interface DemoPallet {
  geometry: PalletGeometry;
  bom: PalletBom;
  /** 构件输入（含名称 / 材料 / 尺寸 / 数量），迷你工作台的构件清单直接引用 */
  components: PalletComponentInput[];
}

export function buildDemoPallet(
  template: DemoTemplate,
  lengthMm: number,
  widthMm: number,
): DemoPallet {
  const components = palletTemplateComponents(template, lengthMm, widthMm);
  return {
    components,
    geometry: buildPalletGeometry({ lengthMm, widthMm, templateType: template }, components),
    bom: calcPalletBom(components, PALLET_DEFAULT_MATERIALS),
  };
}

/** 演示数字统一按中文千分位展示，固定小数位避免数字跳动 */
export function formatDemoNumber(value: number, digits: number): string {
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
