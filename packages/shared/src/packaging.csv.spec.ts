import { describe, expect, it } from 'vitest';
import { bomToCsv, cuttingToCsv } from './design/csv';
import { calcPalletBom } from './design/pallet/bom';
import { PALLET_DEFAULT_MATERIALS, palletTemplateComponents } from './design/pallet/templates';

const parts = palletTemplateComponents('block', 1200, 800);
const bom = calcPalletBom(parts, PALLET_DEFAULT_MATERIALS);

describe('CSV 导出', () => {
  it('BOM CSV 带 BOM 头、合计与转义', () => {
    const csv = bomToCsv([{ unitName: '托盘, A', unitType: '托盘', bom }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('单元类型');
    expect(csv).toContain('"托盘, A"');
    expect(csv).toContain('本单元合计');
    expect(csv).toContain('全部单元合计');
    expect(csv).toContain(bom.netVolumeM3.toFixed(5));
  });

  it('开料 CSV 按损耗计算采购数量', () => {
    const csv = cuttingToCsv([{ unitName: '托盘', unitType: '托盘', parts }]);
    expect(csv).toContain('采购数量');
    expect(csv).toContain('损耗(%)');
    expect(csv.split('\r\n').length).toBeGreaterThan(parts.length);
  });
});
