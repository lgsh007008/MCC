import { packagingPartRoleSchema, type PackagingPartInput } from '../packaging.schemas';
import { evaluateExpression } from './expression';

// 模板解释（design/包装设计.md §3.1 / §3.3）：
// 模板是数据：参数 → 构件行 → 尺寸 / 数量；解释器只做求值与取整，不执行任意代码。

export interface TemplateParamDefinition {
  key: string;
  label?: string;
  type?: 'int' | 'number';
  min?: number;
  max?: number;
  default?: number;
}

export interface TemplateConfigOption {
  value: string;
  label: string;
}

export interface TemplateConfigField {
  key: string;
  label: string;
  group: string;
  type?: 'int' | 'number' | 'select' | 'deck';
  min?: number;
  max?: number;
  default?: number | string;
  options?: TemplateConfigOption[];
  help?: string;
}

export interface TemplateStructureDefinition {
  builder?: string;
  roles?: string[];
}

export interface TemplateDerivedDefinition {
  outer?: Record<string, string>;
  parts?: string;
}

export interface TemplatePartDefinition {
  role: string;
  name: string;
  materialCode: string;
  orientation?: 'x' | 'y';
  length: string | number;
  width: string | number;
  thickness: string | number;
  quantity: string | number;
  wastePct?: string | number;
  processCost?: string | number;
  priceOverride?: string | number;
}

export interface TemplateDefinition {
  schemaVersion?: number;
  builder?: string;
  structure?: TemplateStructureDefinition;
  config?: TemplateConfigField[];
  derived?: TemplateDerivedDefinition;
  params?: TemplateParamDefinition[];
  parts?: TemplatePartDefinition[];
  views?: string[];
}

const toNumber = (value: string | number, scope: Record<string, number>, field: string): number => {
  if (typeof value === 'number') {
    return value;
  }
  try {
    return evaluateExpression(value, scope);
  } catch (error) {
    throw new Error(`模板字段 ${field} 求值失败：${error instanceof Error ? error.message : '未知错误'}`);
  }
};

export function resolveTemplateParams(
  definition: TemplateDefinition,
  input: Record<string, unknown>,
): Record<string, number> {
  const scope: Record<string, number> = {};
  const params = definition.params ?? [];
  for (const param of params) {
    const raw = input[param.key] ?? param.default;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new Error(`模板参数 ${param.key} 必须是数字`);
    }
    const value = param.type === 'int' ? Math.round(raw) : raw;
    if (param.min !== undefined && value < param.min) {
      throw new Error(`模板参数 ${param.key} 不能小于 ${param.min}`);
    }
    if (param.max !== undefined && value > param.max) {
      throw new Error(`模板参数 ${param.key} 不能大于 ${param.max}`);
    }
    scope[param.key] = value;
  }
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'number' && Number.isFinite(value) && scope[key] === undefined) {
      scope[key] = value;
    }
  }
  return scope;
}

export function buildTemplateParts(
  definition: TemplateDefinition,
  input: Record<string, unknown>,
): PackagingPartInput[] {
  const scope = resolveTemplateParams(definition, input);
  const definitions = definition.parts ?? [];
  if (definitions.length === 0) {
    throw new Error('模板未定义构件');
  }
  return definitions.map((part, index) => {
    const role = packagingPartRoleSchema.safeParse(part.role);
    if (!role.success) {
      throw new Error(`模板第 ${index + 1} 行构件类型 ${part.role} 非法`);
    }
    const lengthMm = Math.round(toNumber(part.length, scope, 'length'));
    const widthMm = Math.round(toNumber(part.width, scope, 'width'));
    const heightMm = Math.round(toNumber(part.thickness, scope, 'thickness'));
    const quantity = Math.round(toNumber(part.quantity, scope, 'quantity'));
    if (lengthMm <= 0 || widthMm <= 0 || heightMm <= 0) {
      throw new Error(`模板第 ${index + 1} 行尺寸必须大于 0`);
    }
    if (quantity <= 0) {
      throw new Error(`模板第 ${index + 1} 行数量必须大于 0`);
    }
    const wastePct =
      part.wastePct === undefined ? 0.08 : Math.min(1, Math.max(0, toNumber(part.wastePct, scope, 'wastePct')));
    const processCost = part.processCost === undefined ? 0 : Math.max(0, toNumber(part.processCost, scope, 'processCost'));
    const priceOverride =
      part.priceOverride === undefined ? 0 : Math.max(0, toNumber(part.priceOverride, scope, 'priceOverride'));
    return {
      role: role.data,
      name: part.name,
      materialCode: part.materialCode,
      orientation: part.orientation === 'y' ? 'y' : 'x',
      lengthMm,
      widthMm,
      heightMm,
      quantity,
      wastePct,
      processCost,
      priceOverride,
    };
  });
}
