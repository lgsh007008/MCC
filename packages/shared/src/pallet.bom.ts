import type { PalletComponentInput, PalletMaterialLike } from './pallet.schemas';

// 托盘木材料单（design/托盘设计.md §3.4）：只算材料与加工，不含报价、税与毛利。

export interface PalletBomItem {
  componentIndex: number;
  name: string;
  materialCode: string;
  materialName: string;
  spec: string;
  quantity: number;
  netVolumeM3: number;
  grossVolumeM3: number;
  weightKg: number;
  pricePerM3: number;
  materialCost: number;
  processCost: number;
}

export interface PalletBom {
  items: PalletBomItem[];
  netVolumeM3: number;
  grossVolumeM3: number;
  weightKg: number;
  materialCost: number;
  processCost: number;
}

const round = (value: number, digits: number): number => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

export function calcPalletBom(
  components: PalletComponentInput[],
  materials: PalletMaterialLike[],
): PalletBom {
  const fallback: PalletMaterialLike = {
    code: 'unknown',
    name: '未知材料',
    densityKgM3: 0,
    pricePerM3: 0,
    fumigation: false,
    color: '#9eaa9f',
  };

  const items = components.map((component, componentIndex) => {
    const material = materials.find((item) => item.code === component.materialCode) ?? fallback;
    const quantity = Math.max(1, Math.round(component.quantity));
    const netVolumeM3 = (component.lengthMm * component.widthMm * component.heightMm * quantity) / 1e9;
    const grossVolumeM3 = netVolumeM3 * (1 + Math.max(0, component.wastePct));
    const pricePerM3 = component.priceOverride > 0 ? component.priceOverride : material.pricePerM3;
    return {
      componentIndex,
      name: component.name,
      materialCode: component.materialCode,
      materialName: material.name,
      spec: `${component.lengthMm}×${component.widthMm}×${component.heightMm} mm`,
      quantity,
      netVolumeM3: round(netVolumeM3, 5),
      grossVolumeM3: round(grossVolumeM3, 5),
      weightKg: round(grossVolumeM3 * material.densityKgM3, 1),
      pricePerM3: round(pricePerM3, 2),
      materialCost: round(grossVolumeM3 * pricePerM3, 2),
      processCost: round(quantity * Math.max(0, component.processCost), 2),
    };
  });

  return {
    items,
    netVolumeM3: round(items.reduce((sum, item) => sum + item.netVolumeM3, 0), 5),
    grossVolumeM3: round(items.reduce((sum, item) => sum + item.grossVolumeM3, 0), 5),
    weightKg: round(items.reduce((sum, item) => sum + item.weightKg, 0), 1),
    materialCost: round(items.reduce((sum, item) => sum + item.materialCost, 0), 2),
    processCost: round(items.reduce((sum, item) => sum + item.processCost, 0), 2),
  };
}
