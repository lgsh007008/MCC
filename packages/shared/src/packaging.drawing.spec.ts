import { describe, expect, it } from 'vitest';
import { buildUnitDrawingSheets } from './design/drawing';
import { drawingToDxf } from './design/dxf';
import { drawingToSvg, drawingToViewSvg } from './design/svg';
import { buildPalletGeometry } from './pallet.geometry';
import { palletTemplateComponents } from './pallet.templates';

const geometry = buildPalletGeometry(
  { lengthMm: 1200, widthMm: 800, templateType: 'block' },
  palletTemplateComponents('block', 1200, 800),
);

const sheets = buildUnitDrawingSheets({
  projectCode: 'PD-00001',
  projectName: '出口包装方案',
  customerName: '测试客户',
  revision: 0,
  unitName: '1200×800 托盘',
  unitType: 'PALLET',
  drawingNo: 'PD-00001-U01-01',
  geometry,
  date: '2026-11-17',
});

describe('图纸模型', () => {
  it('生成 A3 图幅、四个视图与图框标题栏', () => {
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0]!;
    expect(sheet.paper).toEqual({ width: 420, height: 297, size: 'A3' });
    expect(sheet.views.map((view) => view.kind)).toEqual(['top', 'front', 'side', 'iso']);
    expect(sheet.entities.some((entity) => entity.kind === 'rect' && entity.layer === 'FRAME')).toBe(true);
    expect(sheet.entities.some((entity) => entity.kind === 'rect' && entity.layer === 'TITLE')).toBe(true);
    expect(
      sheet.entities.some(
        (entity) => entity.kind === 'text' && entity.text.includes('PD-00001-U01-01'),
      ),
    ).toBe(true);
    expect(sheet.entities.filter((entity) => entity.kind === 'rect').length).toBeGreaterThan(10);
    expect(sheet.entities.some((entity) => entity.kind === 'dimension')).toBe(true);
    expect(sheet.entities.some((entity) => entity.kind === 'polyline')).toBe(true);
  });
});

describe('SVG 与 DXF 渲染器', () => {
  it('SVG 使用 mm 图幅并包含图元', () => {
    const svg = drawingToSvg(sheets[0]!);
    expect(svg).toContain('viewBox="0 0 420 297"');
    expect(svg).toContain('width="420mm"');
    expect(svg).toContain('PD-00001-U01-01');
    expect(svg).toContain('<rect');
    expect(svg).toContain('<polyline');
  });

  it('按视图 SVG 保留图框标题栏，只输出指定视图', () => {
    const top = drawingToViewSvg(sheets[0]!, 'top');
    expect(top).toContain('viewBox="0 0 420 297"');
    expect(top).toContain('PD-00001-U01-01');
    expect(top).toContain('俯视');
    expect(top).not.toContain('主视');

    const front = drawingToViewSvg(sheets[0]!, 'front');
    expect(front).toContain('主视');
    expect(front).not.toContain('俯视');
  });

  it('DXF R12 包含图层表、实体与 EOF', () => {
    const dxf = drawingToDxf(sheets[0]!);
    expect(dxf).toContain('AC1009');
    expect(dxf).toContain('$INSUNITS');
    expect(dxf).toContain('LAYER');
    expect(dxf).toContain('DASHED');
    expect(dxf).toContain('ENTITIES');
    expect(dxf).toContain('PD-00001-U01-01');
    expect(dxf).toContain('EOF');
    expect((dxf.match(/\nLINE\n/g) ?? []).length).toBeGreaterThan(10);
  });
});
