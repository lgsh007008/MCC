import type { PalletBom } from '../pallet.bom';
import type { PalletComponentInput } from '../pallet.schemas';

// CSV 导出（design/包装设计.md §5）：BOM 与开料清单。
// 纯字符串生成，浏览器下载；首行带 BOM，便于 Excel 正确识别中文。

export interface BomCsvUnit {
  unitName: string;
  unitType: string;
  bom: PalletBom;
}

export interface CuttingCsvUnit {
  unitName: string;
  unitType: string;
  parts: PalletComponentInput[];
}

const escapeCell = (value: string | number): string => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvLine = (cells: Array<string | number>): string => cells.map(escapeCell).join(',');

const BOM_HEADERS = [
  '单元',
  '单元类型',
  '构件',
  '材料',
  '规格',
  '数量',
  '净体积(m³)',
  '采购体积(m³)',
  '重量(kg)',
  '材料费(元)',
  '加工费(元)',
];

export function bomToCsv(units: BomCsvUnit[]): string {
  const lines: string[] = [csvLine(BOM_HEADERS)];
  for (const unit of units) {
    for (const item of unit.bom.items) {
      lines.push(
        csvLine([
          unit.unitName,
          unit.unitType,
          item.name,
          item.materialName,
          item.spec,
          item.quantity,
          item.netVolumeM3.toFixed(5),
          item.grossVolumeM3.toFixed(5),
          item.weightKg.toFixed(1),
          item.materialCost.toFixed(2),
          item.processCost.toFixed(2),
        ]),
      );
    }
    lines.push(
      csvLine([
        unit.unitName,
        unit.unitType,
        '本单元合计',
        '',
        '',
        '',
        unit.bom.netVolumeM3.toFixed(5),
        unit.bom.grossVolumeM3.toFixed(5),
        unit.bom.weightKg.toFixed(1),
        unit.bom.materialCost.toFixed(2),
        unit.bom.processCost.toFixed(2),
      ]),
    );
  }
  const totals = units.reduce(
    (acc, unit) => ({
      netVolumeM3: acc.netVolumeM3 + unit.bom.netVolumeM3,
      grossVolumeM3: acc.grossVolumeM3 + unit.bom.grossVolumeM3,
      weightKg: acc.weightKg + unit.bom.weightKg,
      materialCost: acc.materialCost + unit.bom.materialCost,
      processCost: acc.processCost + unit.bom.processCost,
    }),
    { netVolumeM3: 0, grossVolumeM3: 0, weightKg: 0, materialCost: 0, processCost: 0 },
  );
  lines.push(
    csvLine([
      '',
      '',
      '全部单元合计',
      '',
      '',
      '',
      totals.netVolumeM3.toFixed(5),
      totals.grossVolumeM3.toFixed(5),
      totals.weightKg.toFixed(1),
      totals.materialCost.toFixed(2),
      totals.processCost.toFixed(2),
    ]),
  );
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

const CUTTING_HEADERS = [
  '单元',
  '单元类型',
  '构件',
  '材料',
  '长(mm)',
  '宽(mm)',
  '厚(mm)',
  '数量',
  '损耗(%)',
  '采购数量',
];

export function cuttingToCsv(units: CuttingCsvUnit[]): string {
  const lines: string[] = [csvLine(CUTTING_HEADERS)];
  for (const unit of units) {
    for (const part of unit.parts) {
      const purchaseQuantity = Math.ceil(
        Math.max(0, part.quantity) * (1 + Math.max(0, part.wastePct)),
      );
      lines.push(
        csvLine([
          unit.unitName,
          unit.unitType,
          part.name,
          part.materialCode,
          part.lengthMm,
          part.widthMm,
          part.heightMm,
          part.quantity,
          (part.wastePct * 100).toFixed(1),
          purchaseQuantity,
        ]),
      );
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
