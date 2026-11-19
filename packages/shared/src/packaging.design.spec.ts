import { describe, expect, it } from 'vitest';
import {
  buildCrateGeometry,
  deriveCrateOuter,
  deriveCrateParts,
  validateCrateStructure,
} from './design/crate';
import {
  buildFrameGeometry,
  deriveFrameOuter,
  deriveFrameParts,
  FRAME_DEFAULT_PARAMS,
  validateFrameStructure,
} from './design/frame';
import {
  buildDividerGeometry,
  deriveDividerOuter,
  deriveDividerParts,
  DIVIDER_DEFAULT_PARAMS,
  validateDividerStructure,
} from './design/divider';
import {
  buildDunnageGeometry,
  deriveDunnageOuter,
  deriveDunnageParts,
  DUNNAGE_DEFAULT_PARAMS,
  validateDunnageStructure,
} from './design/dunnage';
import { resolvePartSources } from './design/overrides';
import { evaluateExpression } from './design/expression';
import { applyPalletDeckCounts, PALLET_DECK_MAX, palletDeckDefaults, palletTemplateComponents } from './pallet.templates';
import type { PalletComponentInput } from './pallet.schemas';

const crateParams = {
  innerLengthMm: 1200,
  innerWidthMm: 800,
  innerHeightMm: 900,
  thicknessMm: 15,
  bottomThicknessMm: 15,
  baseHeightMm: 90,
  frameThicknessMm: 90,
};

const toComponents = (): PalletComponentInput[] =>
  deriveCrateParts(crateParams).map((part) => ({
    role: part.role as PalletComponentInput['role'],
    name: part.name,
    materialCode: part.materialCode,
    orientation: part.orientation,
    lengthMm: part.lengthMm,
    widthMm: part.widthMm,
    heightMm: part.heightMm,
    quantity: part.quantity,
    wastePct: part.wastePct,
    processCost: part.processCost,
    priceOverride: part.priceOverride,
  }));

describe('受限表达式', () => {
  it('支持参数、四则与函数', () => {
    expect(evaluateExpression('innerLengthMm + 2 * thicknessMm', { innerLengthMm: 1200, thicknessMm: 15 })).toBe(1230);
    expect(evaluateExpression('ceil(innerWidthMm / 90)', { innerWidthMm: 800 })).toBe(9);
    expect(evaluateExpression('max(1, min(10, 12))', {})).toBe(10);
  });

  it('拒绝未定义参数、除零与非法字符', () => {
    expect(() => evaluateExpression('unknown + 1', {})).toThrow(/未定义参数/);
    expect(() => evaluateExpression('1 / 0', {})).toThrow(/除零/);
    expect(() => evaluateExpression('a.b', { a: 1 })).toThrow(/不支持的字符/);
  });
});

describe('木箱 G 型派生与几何', () => {
  it('外尺寸包含面板、框架、底板、盖板与底部支承', () => {
    expect(deriveCrateOuter(crateParams)).toEqual({
      lengthMm: 1410,
      widthMm: 1010,
      heightMm: 1020,
    });
    expect(deriveCrateOuter({ ...crateParams, frameThicknessMm: 30 })).toEqual({
      lengthMm: 1290,
      widthMm: 890,
      heightMm: 1020,
    });
  });

  it('由参数派生底板、侧板、端板、盖板、立柱、滑木与钢带', () => {
    const parts = deriveCrateParts(crateParams);
    expect(parts).toHaveLength(7);
    const bottom = parts.find((part) => part.name === '底板');
    expect(bottom?.lengthMm).toBe(1410);
    expect(bottom?.widthMm).toBe(1010);
    expect(bottom?.heightMm).toBe(15);
    const side = parts.find((part) => part.name === '侧板');
    expect(side?.lengthMm).toBe(1200);
    expect(side?.widthMm).toBe(15);
    expect(side?.heightMm).toBe(900);
    expect(side?.quantity).toBe(2);
    const frame = parts.find((part) => part.role === 'frame');
    expect(frame?.quantity).toBe(4);
    expect(parts.find((part) => part.role === 'steelStrap')?.quantity).toBe(2);
  });

  it('钢带数量为 0 时不生成钢带构件', () => {
    const parts = deriveCrateParts({ ...crateParams, steelStrapCount: 0 });
    expect(parts).toHaveLength(6);
    expect(parts.some((part) => part.role === 'steelStrap')).toBe(false);
  });

  it('滑木箱按滑木数量与宽度派生滑木', () => {
    const parts = deriveCrateParts({
      ...crateParams,
      runnerCount: 4,
      runnerWidthMm: 100,
    });
    const runner = parts.find((part) => part.role === 'runner');
    expect(runner?.quantity).toBe(4);
    expect(runner?.widthMm).toBe(100);
  });

  it('钢带箱无框架时按钢带宽度与方向派生', () => {
    const params = {
      ...crateParams,
      frameThicknessMm: 0,
      steelStrapCount: 4,
      strapWidthMm: 40,
      strapDirection: 'both' as const,
    };
    expect(deriveCrateOuter(params)).toEqual({
      lengthMm: 1230,
      widthMm: 830,
      heightMm: 1020,
    });
    const parts = deriveCrateParts(params);
    expect(parts.some((part) => part.role === 'frame')).toBe(false);
    const horizontal = parts.find((part) => part.name === '钢带（横向）');
    expect(horizontal?.quantity).toBe(2);
    expect(horizontal?.lengthMm).toBe(40);
    const longitudinal = parts.find((part) => part.name === '钢带（纵向）');
    expect(longitudinal?.quantity).toBe(2);
    expect(longitudinal?.widthMm).toBe(40);
    expect(longitudinal?.orientation).toBe('y');
  });

  it('钢带箱纵向钢带沿 Y 轴分布并覆盖全高', () => {
    const params = {
      ...crateParams,
      frameThicknessMm: 0,
      steelStrapCount: 4,
      strapWidthMm: 30,
      strapDirection: 'both' as const,
    };
    const components = deriveCrateParts(params).map((part) => ({
      ...part,
      role: part.role as PalletComponentInput['role'],
    }));
    const geometry = buildCrateGeometry(
      {
        outerLengthMm: 1230,
        outerWidthMm: 830,
        innerHeightMm: 900,
        thicknessMm: 15,
        bottomThicknessMm: 15,
        baseHeightMm: 90,
        frameThicknessMm: 0,
      },
      components,
    );
    const straps = geometry.pieces.filter((piece) => piece.role === 'steelStrap');
    // 每道钢带绕箱体一圈，拆成左右竖带 + 顶带 + 底带四段。
    expect(straps).toHaveLength(16);
    const longitudinal = straps.filter((piece) => piece.label.includes('纵向'));
    expect(longitudinal).toHaveLength(8);
    const bandT = Math.max(1.5, Math.round(30 * 0.08));
    const vertical = longitudinal.filter((piece) => piece.label.includes('竖带'));
    expect(vertical).toHaveLength(4);
    vertical.forEach((piece) => {
      expect(piece.h).toBe(1020 + bandT);
      expect(piece.l).toBe(bandT);
      expect(piece.w).toBe(30);
    });
    const caps = longitudinal.filter((piece) => piece.label.includes('顶带'));
    expect(caps).toHaveLength(2);
    caps.forEach((piece) => {
      expect(piece.l).toBe(1230 + bandT * 2);
      expect(piece.h).toBe(bandT);
    });
    expect(geometry.pieces.some((piece) => piece.role === 'frame')).toBe(false);
  });

  it('校验底板、盖板与侧板', () => {
    const components = toComponents();
    expect(validateCrateStructure(components)).toHaveLength(0);
    const withoutLid = components.filter((component) => component.role !== 'topDeck');
    expect(validateCrateStructure(withoutLid).some((issue) => issue.message.includes('盖板'))).toBe(true);
  });

  it('生成底座 + 箱体 + 箱盖的几何', () => {
    const geometry = buildCrateGeometry(
      {
        outerLengthMm: 1410,
        outerWidthMm: 1010,
        innerHeightMm: 900,
        thicknessMm: 15,
        bottomThicknessMm: 15,
        baseHeightMm: 90,
        frameThicknessMm: 90,
      },
      toComponents(),
    );
    expect(geometry.L).toBe(1410);
    expect(geometry.W).toBe(1010);
    expect(geometry.H).toBe(1020);
    expect(geometry.pieces).toHaveLength(54);
    // 侧板 2 × 8 条、端板 2 × 6 条、盖板 10 条：几何呈现真实拼板。
    expect(geometry.pieces.filter((piece) => piece.role === 'panel')).toHaveLength(28);
    expect(geometry.pieces.filter((piece) => piece.role === 'topDeck')).toHaveLength(10);
    const bottom = geometry.pieces.find((piece) => piece.role === 'bottomDeck');
    expect(bottom?.z).toBe(90);
    const lid = geometry.pieces.find((piece) => piece.role === 'topDeck');
    expect(lid?.z).toBe(1005);
    const side = geometry.pieces.find((piece) => piece.role === 'panel' && piece.label === '侧板');
    expect(side?.h).toBe(900);
    expect(side?.w).toBe(15);
    expect(side?.z).toBe(105);
    // 侧板夹在两根立柱之间，端板包住侧板，四周不留缝。
    expect(side?.x).toBe(105);
    const end = geometry.pieces.find((piece) => piece.role === 'panel' && piece.label === '端板');
    expect(end?.x).toBe(90);
    expect(end?.y).toBe(90);
    expect(end?.l).toBe(15);
  });
});

describe('框架箱 G 型派生与几何', () => {
  const frameParams = { ...FRAME_DEFAULT_PARAMS };

  it('默认无面板、有盖板的外尺寸与构件', () => {
    expect(deriveFrameOuter(frameParams)).toEqual({
      lengthMm: 1380,
      widthMm: 980,
      heightMm: 1110,
    });
    const parts = deriveFrameParts(frameParams);
    expect(parts).toHaveLength(7);
    expect(parts.find((part) => part.name === '立柱')?.quantity).toBe(4);
    expect(parts.find((part) => part.name === '上框梁')?.quantity).toBe(2);
    expect(validateFrameStructure(parts, { panelCoverage: 'none', hasLid: true })).toHaveLength(0);
  });

  it('侧端面板、盖板开关与全包口径', () => {
    const sides = { ...frameParams, panelCoverage: 'sides' as const, hasLid: false };
    expect(deriveFrameOuter(sides)).toEqual({
      lengthMm: 1410,
      widthMm: 1010,
      heightMm: 1095,
    });
    const parts = deriveFrameParts(sides);
    expect(parts.filter((part) => part.role === 'panel')).toHaveLength(2);
    expect(parts.some((part) => part.role === 'topDeck')).toBe(false);
    expect(validateFrameStructure(parts, sides)).toHaveLength(0);

    const full = { ...frameParams, panelCoverage: 'full' as const, hasLid: false };
    expect(deriveFrameOuter(full).heightMm).toBe(1110);
    expect(deriveFrameParts(full).some((part) => part.role === 'topDeck')).toBe(true);
  });

  it('生成立柱、上下框梁与面板几何', () => {
    const components = deriveFrameParts({ ...frameParams, panelCoverage: 'sides' }).map((part) => ({
      ...part,
      role: part.role as PalletComponentInput['role'],
    }));
    const geometry = buildFrameGeometry(
      {
        outerLengthMm: 1410,
        outerWidthMm: 1010,
        innerHeightMm: 900,
        frameThicknessMm: 90,
        bottomThicknessMm: 15,
        baseHeightMm: 90,
        outerHeightMm: 1110,
      },
      components,
    );
    expect(geometry.H).toBe(1110);
    expect(geometry.pieces.filter((piece) => piece.label.includes('立柱'))).toHaveLength(4);
    expect(geometry.pieces.filter((piece) => piece.label.includes('上框梁'))).toHaveLength(2);
    expect(geometry.pieces.filter((piece) => piece.role === 'panel')).toHaveLength(4);
  });
});

describe('围板 G 型派生与几何', () => {
  const dividerParams = { ...DIVIDER_DEFAULT_PARAMS };

  it('外尺寸与每层四块围板', () => {
    expect(deriveDividerOuter(dividerParams)).toEqual({
      lengthMm: 1216,
      widthMm: 816,
      heightMm: 200,
    });
    const parts = deriveDividerParts(dividerParams);
    expect(parts.find((part) => part.name === '长围板')?.quantity).toBe(2);
    expect(parts.find((part) => part.name === '宽围板')?.quantity).toBe(2);
    expect(parts.find((part) => part.name === '铰链')?.quantity).toBe(4);
    expect(
      validateDividerStructure(parts, {
        layerCount: 1,
        lapWidthMm: 30,
        innerLengthMm: 1200,
        innerWidthMm: 800,
      }),
    ).toHaveLength(0);
  });

  it('层数变化重算高度与构件', () => {
    const params = { ...dividerParams, layerCount: 2, layerHeightMm: 250 };
    expect(deriveDividerOuter(params)).toEqual({
      lengthMm: 1216,
      widthMm: 816,
      heightMm: 500,
    });
    const parts = deriveDividerParts(params);
    expect(parts.find((part) => part.name === '长围板')?.quantity).toBe(4);
    expect(parts.find((part) => part.name === '宽围板')?.quantity).toBe(4);
    expect(parts.find((part) => part.name === '铰链')?.quantity).toBe(8);
  });

  it('搭接宽度超限时校验报错', () => {
    const issues = validateDividerStructure(deriveDividerParts(dividerParams).map((part) => ({
      ...part,
      role: part.role as PalletComponentInput['role'],
    })), {
      layerCount: 1,
      lapWidthMm: 500,
      innerLengthMm: 1200,
      innerWidthMm: 800,
    });
    expect(issues.some((issue) => issue.message.includes('搭接宽度'))).toBe(true);
  });

  it('按层叠生成围板与铰链几何', () => {
    const params = { ...dividerParams, layerCount: 2, layerHeightMm: 250 };
    const components = deriveDividerParts(params).map((part) => ({
      ...part,
      role: part.role as PalletComponentInput['role'],
    }));
    const geometry = buildDividerGeometry(
      {
        outerLengthMm: 1216,
        outerWidthMm: 816,
        layerHeightMm: 250,
        layerCount: 2,
        thicknessMm: 8,
      },
      components,
    );
    expect(geometry.L).toBe(1216);
    expect(geometry.W).toBe(816);
    expect(geometry.H).toBe(500);
    expect(geometry.pieces.filter((piece) => piece.role === 'panel')).toHaveLength(8);
    expect(geometry.pieces.filter((piece) => piece.label.includes('铰链'))).toHaveLength(8);
  });
});

describe('垫木 G 型派生与几何', () => {
  const dunnageParams = { ...DUNNAGE_DEFAULT_PARAMS };

  it('平行排列：外宽按数量累加', () => {
    expect(deriveDunnageOuter(dunnageParams)).toEqual({
      lengthMm: 1200,
      widthMm: 270,
      heightMm: 90,
    });
    const parts = deriveDunnageParts(dunnageParams);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.name).toBe('垫木');
    expect(parts[0]?.quantity).toBe(3);
  });

  it('交叉排列：上下两组与双层高度', () => {
    const params = { ...dunnageParams, arrangement: 'cross' as const };
    expect(deriveDunnageOuter(params)).toEqual({
      lengthMm: 1200,
      widthMm: 90,
      heightMm: 180,
    });
    const parts = deriveDunnageParts(params);
    expect(parts).toHaveLength(2);
    expect(parts.find((part) => part.name === '垫木（下层）')?.quantity).toBe(3);
    expect(parts.find((part) => part.name === '垫木（上层）')?.quantity).toBe(3);
    expect(
      validateDunnageStructure(parts, { quantity: 3, arrangement: 'cross' }),
    ).toHaveLength(0);
  });

  it('交叉排列数量不足时校验报错', () => {
    const issues = validateDunnageStructure(
      deriveDunnageParts({ ...dunnageParams, arrangement: 'cross' }).map((part) => ({
        ...part,
        role: part.role as PalletComponentInput['role'],
      })),
      { quantity: 1, arrangement: 'cross' },
    );
    expect(issues.some((issue) => issue.message.includes('至少需要 2 根'))).toBe(true);
  });

  it('平行与交叉的梁件排布', () => {
    const parallelParts = deriveDunnageParts(dunnageParams).map((part) => ({
      ...part,
      role: part.role as PalletComponentInput['role'],
    }));
    const parallel = buildDunnageGeometry(
      { outerLengthMm: 1200, outerWidthMm: 270, outerHeightMm: 90, arrangement: 'parallel' },
      parallelParts,
    );
    expect(parallel.pieces).toHaveLength(3);
    expect(parallel.H).toBe(90);

    const crossParts = deriveDunnageParts({ ...dunnageParams, arrangement: 'cross' }).map((part) => ({
      ...part,
      role: part.role as PalletComponentInput['role'],
    }));
    const cross = buildDunnageGeometry(
      { outerLengthMm: 1200, outerWidthMm: 90, outerHeightMm: 180, arrangement: 'cross' },
      crossParts,
    );
    expect(cross.pieces).toHaveLength(6);
    expect(cross.H).toBe(180);
  });
});

describe('托盘铺板配置', () => {
  it('模板默认数量与上限', () => {
    const defaults = palletDeckDefaults('block', 1200, 800);
    expect(defaults).toEqual({ top: 5, bottom: 3 });
    expect(palletDeckDefaults('skid', 1200, 800).bottom).toBeNull();
    expect(palletDeckDefaults('plywood', 1200, 800).top).toBeNull();
    expect(applyPalletDeckCounts(palletTemplateComponents('block', 1200, 800), { top: 99 })[0]!.quantity).toBe(
      PALLET_DECK_MAX,
    );
  });

  it('手动数量写回面板与底板', () => {
    const parts = applyPalletDeckCounts(palletTemplateComponents('block', 1200, 800), {
      top: 6,
      bottom: 4,
    });
    expect(parts.find((part) => part.role === 'topDeck')?.quantity).toBe(6);
    expect(parts.find((part) => part.role === 'bottomDeck')?.quantity).toBe(4);
  });
});

describe('构件来源', () => {
  it('与派生默认值一致为自动，尺寸 / 数量 / 材料变化为手动', () => {
    const derived = toComponents();
    const actual = derived.map((part) => ({ ...part }));
    expect(resolvePartSources(derived, actual).every((info) => info.source === 'auto')).toBe(true);

    actual[0] = { ...actual[0]!, quantity: actual[0]!.quantity + 1 };
    const changed = resolvePartSources(derived, actual);
    expect(changed[0]?.source).toBe('manual');
    expect(changed[0]?.changedFields).toContain('quantity');
  });

  it('手动铺板模式即使数量相同也标记手动', () => {
    const derived = toComponents();
    const topIndex = derived.findIndex((part) => part.role === 'topDeck');
    const sources = resolvePartSources(derived, derived, ['topDeck']);
    expect(sources[topIndex]?.source).toBe('manual');
    expect(sources[topIndex]?.reason).toBe('config');
  });
});
