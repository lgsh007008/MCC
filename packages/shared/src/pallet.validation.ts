import type { PalletComponentInput, PalletTemplateType } from './pallet.schemas';

// 托盘结构基础校验（design/托盘设计.md §3.5）：
// 只保证图纸与数据可继续使用，不代表承载合格；error 阻止保存，warning 提示确认。

export interface PalletIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface PalletValidationProject {
  widthMm: number;
  templateType: PalletTemplateType;
}

const LAYER_RANK: Record<PalletComponentInput['role'], number> = {
  topDeck: 0,
  endDeck: 0,
  plywood: 0,
  stringerBoard: 1,
  block: 2,
  stringer: 2,
  runner: 2,
  spacer: 2,
  bottomDeck: 3,
  custom: 2,
};

export function validatePalletStructure(
  project: PalletValidationProject,
  components: PalletComponentInput[],
): PalletIssue[] {
  const issues: PalletIssue[] = [];
  if (components.length === 0) {
    issues.push({ level: 'error', message: '至少需要一个构件' });
    return issues;
  }

  components.forEach((component) => {
    const name = component.name || '未命名构件';
    if (component.lengthMm <= 0 || component.widthMm <= 0 || component.heightMm <= 0) {
      issues.push({ level: 'error', message: `${name}存在零尺寸或负尺寸` });
    }
    if (component.quantity <= 0) {
      issues.push({ level: 'error', message: `${name}数量必须大于 0` });
    }
  });

  const hasDeck = components.some((component) => ['topDeck', 'plywood'].includes(component.role));
  const hasSupport = components.some((component) => ['block', 'stringer', 'runner'].includes(component.role));
  if (!hasDeck) {
    issues.push({ level: 'error', message: '缺少面板或胶合板面层' });
  }
  if (!hasSupport) {
    issues.push({ level: 'error', message: '缺少墩块、纵梁或滑木支承' });
  }

  const totalHeight = components.reduce((sum, component) => sum + Math.max(0, component.heightMm), 0);
  if (totalHeight <= 0) {
    issues.push({ level: 'error', message: '外形高度必须大于 0' });
  }

  if (project.templateType === 'block') {
    const blocks = components
      .filter((component) => component.role === 'block')
      .reduce((sum, component) => sum + component.quantity, 0);
    const middleBoards = components.filter((component) => component.role === 'stringerBoard');
    if (blocks < 9) {
      issues.push({ level: 'error', message: '九墩块结构至少需要 9 个墩块' });
    }
    if (middleBoards.length === 0) {
      issues.push({ level: 'error', message: '九墩块结构缺少中间纵梁板' });
    } else {
      const count = middleBoards.reduce((sum, component) => sum + component.quantity, 0);
      if (count < 3) {
        issues.push({ level: 'error', message: '九墩块结构至少需要 3 块中间纵梁板' });
      }
      if (middleBoards.some((component) => Math.abs(component.lengthMm - project.widthMm) > 1)) {
        issues.push({ level: 'warning', message: '中间纵梁板长度通常应等于托盘宽度' });
      }
    }
  }

  if (project.templateType === 'notched') {
    const notched = components.some(
      (component) => component.role === 'stringer' && component.name.includes('开槽'),
    );
    if (!notched) {
      issues.push({ level: 'warning', message: '开槽纵梁模板缺少开槽纵梁，图纸将按普通纵梁绘制' });
    }
  }

  let previousRank = -1;
  components.forEach((component) => {
    const rank = LAYER_RANK[component.role];
    if (previousRank >= 0 && rank < previousRank) {
      issues.push({ level: 'warning', message: '构件层级为非常规顺序，请确认上下接触与钉接位置' });
    }
    previousRank = Math.max(previousRank, rank);
  });

  return issues;
}

export function hasPalletErrors(issues: PalletIssue[]): boolean {
  return issues.some((issue) => issue.level === 'error');
}
