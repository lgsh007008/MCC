import { describe, expect, it } from 'vitest';
import { palletTemplateComponents } from './pallet.templates';
import { hasPalletErrors, validatePalletStructure } from './pallet.validation';

describe('validatePalletStructure', () => {
  it('标准九墩块结构无错误', () => {
    const components = palletTemplateComponents('block', 1200, 800);
    const issues = validatePalletStructure({ widthMm: 800, templateType: 'block' }, components);
    expect(hasPalletErrors(issues)).toBe(false);
  });

  it('空构件报错', () => {
    const issues = validatePalletStructure({ widthMm: 800, templateType: 'block' }, []);
    expect(hasPalletErrors(issues)).toBe(true);
  });

  it('缺少支承报错', () => {
    const components = palletTemplateComponents('block', 1200, 800).filter(
      (component) => !['block', 'stringer', 'runner'].includes(component.role),
    );
    const issues = validatePalletStructure({ widthMm: 800, templateType: 'block' }, components);
    expect(issues.some((issue) => issue.message.includes('支承'))).toBe(true);
  });

  it('九墩块少于 9 个报错', () => {
    const components = palletTemplateComponents('block', 1200, 800).map((component) =>
      component.role === 'block' ? { ...component, quantity: 4 } : component,
    );
    const issues = validatePalletStructure({ widthMm: 800, templateType: 'block' }, components);
    expect(issues.some((issue) => issue.message.includes('9 个墩块'))).toBe(true);
  });

  it('零尺寸报错', () => {
    const components = palletTemplateComponents('block', 1200, 800);
    components[0] = { ...components[0]!, lengthMm: 0 };
    const issues = validatePalletStructure({ widthMm: 800, templateType: 'block' }, components);
    expect(issues.some((issue) => issue.level === 'error' && issue.message.includes('零尺寸'))).toBe(true);
  });

  it('开槽模板缺少开槽纵梁给提示', () => {
    const components = palletTemplateComponents('notched', 1100, 1100).map((component) =>
      component.role === 'stringer' ? { ...component, name: '纵梁' } : component,
    );
    const issues = validatePalletStructure({ widthMm: 1100, templateType: 'notched' }, components);
    expect(issues.some((issue) => issue.level === 'warning' && issue.message.includes('开槽'))).toBe(true);
  });
});
