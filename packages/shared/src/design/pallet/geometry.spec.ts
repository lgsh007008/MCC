import { describe, expect, it } from 'vitest';
import {
  buildPalletGeometry,
  isNotchedStringer,
  projectIsometricPoint,
  projectPalletPiece,
  sortPiecesForIsometric,
} from './geometry';
import { palletTemplateComponents, PALLET_TEMPLATE_OPTIONS } from './templates';

const projectFor = (template: (typeof PALLET_TEMPLATE_OPTIONS)[number]) => ({
  lengthMm: template.defaultLengthMm,
  widthMm: template.defaultWidthMm,
  templateType: template.value,
});

describe('buildPalletGeometry', () => {
  it.each(PALLET_TEMPLATE_OPTIONS)('$label 生成构件与总高', (template) => {
    const components = palletTemplateComponents(
      template.value,
      template.defaultLengthMm,
      template.defaultWidthMm,
    );
    const geometry = buildPalletGeometry(projectFor(template), components);
    const expectedPieces = components.reduce((sum, component) => sum + component.quantity, 0);
    expect(geometry.pieces).toHaveLength(expectedPieces);
    expect(geometry.L).toBe(template.defaultLengthMm);
    expect(geometry.W).toBe(template.defaultWidthMm);
    expect(geometry.H).toBeGreaterThan(0);
    expect(geometry.H).toBe(components.reduce((sum, component) => sum + component.heightMm, 0));
  });

  it('九墩块模板生成 5 面板 + 3 中间板 + 9 墩块 + 3 底板', () => {
    const components = palletTemplateComponents('block', 1200, 800);
    const geometry = buildPalletGeometry(
      { lengthMm: 1200, widthMm: 800, templateType: 'block' },
      components,
    );
    expect(geometry.pieces).toHaveLength(20);
    expect(geometry.H).toBe(130);
    expect(geometry.forkPocketHeight).toBe(90);
    expect(geometry.pieces[0]!.y).toBe(0);
    expect(geometry.pieces[4]!.y).toBe(710);
  });

  it('开槽纵梁可被识别', () => {
    const components = palletTemplateComponents('notched', 1100, 1100);
    const geometry = buildPalletGeometry(
      { lengthMm: 1100, widthMm: 1100, templateType: 'notched' },
      components,
    );
    expect(geometry.pieces.some((piece) => isNotchedStringer(piece))).toBe(true);
  });
});

describe('pallet projection', () => {
  it('俯视取长宽平面，主视与侧视按总高翻转', () => {
    const components = palletTemplateComponents('block', 1200, 800);
    const geometry = buildPalletGeometry(
      { lengthMm: 1200, widthMm: 800, templateType: 'block' },
      components,
    );
    const first = geometry.pieces[0]!;
    expect(projectPalletPiece(first, 'top', geometry.H)).toEqual({ x: 0, y: 0, w: 1200, h: 90 });
    const bottom = geometry.pieces[geometry.pieces.length - 1]!;
    expect(projectPalletPiece(bottom, 'front', geometry.H)).toEqual({
      x: 0,
      y: 110,
      w: 1200,
      h: 20,
    });
  });

  it('轴测投影保持标准 30 度比例', () => {
    expect(projectIsometricPoint(0, 0, 0)).toEqual({ u: 0, v: 0 });
    const point = projectIsometricPoint(100, 0, 0);
    expect(point.u).toBeCloseTo(86.6, 1);
    expect(point.v).toBeCloseTo(50, 1);
  });

  it('轴测排序先按高度再按平面位置', () => {
    const components = palletTemplateComponents('block', 1200, 800);
    const geometry = buildPalletGeometry(
      { lengthMm: 1200, widthMm: 800, templateType: 'block' },
      components,
    );
    const sorted = sortPiecesForIsometric(geometry.pieces);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]!;
      const current = sorted[index]!;
      expect(current.z).toBeGreaterThanOrEqual(previous.z);
    }
  });
});
