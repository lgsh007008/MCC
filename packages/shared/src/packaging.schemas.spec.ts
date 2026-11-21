import { describe, expect, it } from 'vitest';
import {
  packagingExportEventSchema,
  packagingPrintEventSchema,
  packagingProjectInputSchema,
} from './packaging.schemas';
import { PACKAGING_DEFAULT_TEMPLATES } from './packaging.templates';

const validBody = () => ({
  name: '出口包装方案',
  customerName: '测试客户',
  destination: 'export' as const,
  note: '',
  units: [
    {
      unitType: 'PALLET' as const,
      templateCode: 'block',
      name: '1200×800 托盘',
      lengthMm: 1200,
      widthMm: 800,
      targetLoadKg: 500,
      loadType: 'uniform' as const,
      params: { entryDirection: '4' },
      parts: [
        {
          role: 'topDeck' as const,
          name: '面板',
          materialCode: 'pine',
          orientation: 'x' as const,
          lengthMm: 1200,
          widthMm: 90,
          heightMm: 20,
          quantity: 5,
        },
      ],
    },
  ],
});

describe('packagingProjectInputSchema', () => {
  it('接受方案 → 单元 → 构件三层结构', () => {
    const parsed = packagingProjectInputSchema.parse(validBody());
    expect(parsed.units).toHaveLength(1);
    expect(parsed.units[0]?.unitType).toBe('PALLET');
    expect(parsed.units[0]?.parts[0]?.wastePct).toBe(0.08);
  });

  it('至少需要一个单元', () => {
    const result = packagingProjectInputSchema.safeParse({ ...validBody(), units: [] });
    expect(result.success).toBe(false);
  });

  it('构件尺寸必须为正整数', () => {
    const body = validBody();
    body.units[0]!.parts[0]!.lengthMm = 0;
    const result = packagingProjectInputSchema.safeParse(body);
    expect(result.success).toBe(false);
  });

  it('单元类型必须是已登记枚举', () => {
    const body = validBody();
    (body.units[0] as { unitType: string }).unitType = 'UNKNOWN';
    const result = packagingProjectInputSchema.safeParse(body);
    expect(result.success).toBe(false);
  });
});

describe('packagingExportEventSchema / packagingPrintEventSchema', () => {
  it('接受已登记导出格式与可选版本', () => {
    const parsed = packagingExportEventSchema.parse({
      format: 'dxf',
      revisionNo: 2,
      unitCode: 'PD-00001-U01',
    });
    expect(parsed.format).toBe('dxf');
    expect(parsed.revisionNo).toBe(2);
  });

  it('SVG 视图导出必须指定视图，其他格式不得带视图', () => {
    expect(packagingExportEventSchema.safeParse({ format: 'svg_view' }).success).toBe(false);
    expect(
      packagingExportEventSchema.safeParse({ format: 'svg_view', view: 'top' }).success,
    ).toBe(true);
    expect(
      packagingExportEventSchema.safeParse({ format: 'dxf', view: 'top' }).success,
    ).toBe(false);
  });

  it('拒绝未登记格式', () => {
    expect(packagingExportEventSchema.safeParse({ format: 'pdf' }).success).toBe(false);
  });

  it('打印事件允许空 body 或版本号', () => {
    expect(packagingPrintEventSchema.safeParse({}).success).toBe(true);
    expect(packagingPrintEventSchema.safeParse({ revisionNo: 1 }).success).toBe(true);
    expect(packagingPrintEventSchema.safeParse({ revisionNo: 0 }).success).toBe(false);
  });
});

describe('PACKAGING_DEFAULT_TEMPLATES', () => {
  it('预置托盘模板与木箱 G 型模板', () => {
    const pallet = PACKAGING_DEFAULT_TEMPLATES.filter((template) => template.unitType === 'PALLET');
    expect(pallet).toHaveLength(6);
    expect(pallet.map((template) => template.code)).toContain('block');
    const crate = PACKAGING_DEFAULT_TEMPLATES.find((template) => template.code === 'crate-g');
    expect(crate?.unitType).toBe('CRATE');
    expect(crate?.definition.schemaVersion).toBe(1);
    expect((crate?.definition.config as unknown[] | undefined)?.length).toBeGreaterThan(5);
    expect((pallet[0]?.definition.config as unknown[] | undefined)?.length).toBeGreaterThan(0);
    const skid = PACKAGING_DEFAULT_TEMPLATES.find((template) => template.code === 'skid-g');
    expect(skid?.unitType).toBe('SKID');
    expect((skid?.definition.config as unknown[] | undefined)?.length).toBeGreaterThan(0);
  });
});
