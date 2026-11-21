import { describe, expect, it } from 'vitest';
import { calcPalletBom } from './bom';
import type { PalletComponentInput } from './schemas';
import { PALLET_DEFAULT_MATERIALS } from './templates';

const component: PalletComponentInput = {
  role: 'topDeck',
  name: '面板',
  materialCode: 'pine',
  orientation: 'x',
  lengthMm: 1200,
  widthMm: 90,
  heightMm: 20,
  quantity: 5,
  wastePct: 0.08,
  processCost: 1.5,
  priceOverride: 0,
};

describe('calcPalletBom', () => {
  it('按净体积、损耗、密度与单价逐项计算', () => {
    const bom = calcPalletBom([component], PALLET_DEFAULT_MATERIALS);
    expect(bom.items).toHaveLength(1);
    expect(bom.items[0]!.netVolumeM3).toBe(0.0108);
    expect(bom.items[0]!.grossVolumeM3).toBe(0.01166);
    expect(bom.items[0]!.weightKg).toBe(5.8);
    expect(bom.items[0]!.materialCost).toBe(21.58);
    expect(bom.items[0]!.processCost).toBe(7.5);
    expect(bom.netVolumeM3).toBe(0.0108);
    expect(bom.grossVolumeM3).toBe(0.01166);
    expect(bom.materialCost).toBe(21.58);
    expect(bom.processCost).toBe(7.5);
  });

  it('单价覆盖只影响本行', () => {
    const bom = calcPalletBom(
      [{ ...component, priceOverride: 3000 }],
      PALLET_DEFAULT_MATERIALS,
    );
    expect(bom.items[0]!.pricePerM3).toBe(3000);
    expect(bom.items[0]!.materialCost).toBe(34.99);
  });

  it('未知材料按零成本兜底，不抛错', () => {
    const bom = calcPalletBom(
      [{ ...component, materialCode: 'unknown' }],
      PALLET_DEFAULT_MATERIALS,
    );
    expect(bom.items[0]!.materialName).toBe('未知材料');
    expect(bom.materialCost).toBe(0);
  });
});
