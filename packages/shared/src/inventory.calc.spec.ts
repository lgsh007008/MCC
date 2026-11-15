import { describe, expect, it } from 'vitest';
import {
  calcInventoryTotalAmount,
  calcMaterialCostAmount,
  calcMaterialMargin,
  calcMaterialProfit,
  foldInventoryEvents,
  type InventoryEvent,
  type TimberSpec,
} from './inventory.calc';

const specA: TimberSpec = { lengthMm: 3000, widthMm: 100, heightMm: 20 };
const specB: TimberSpec = { lengthMm: 2000, widthMm: 100, heightMm: 20 };

const purchase = (id: string, tons: string, amount: string, date = '2026-11-01'): InventoryEvent => ({
  kind: 'purchase',
  date,
  createdAt: `${date}T08:00:00.000Z`,
  ref: id,
  deliveredTons: tons,
  totalAmount: amount,
});

const issue = (id: string, tons: string, date = '2026-11-02'): InventoryEvent => ({
  kind: 'issue',
  date,
  createdAt: `${date}T08:00:00.000Z`,
  ref: id,
  tons,
});

const output = (
  id: string,
  outputs: Array<{ spec: TimberSpec; volume: string }>,
  date = '2026-11-02',
): InventoryEvent => ({
  kind: 'output',
  date,
  createdAt: `${date}T08:00:00.000Z`,
  ref: id,
  outputs,
});

const sale = (
  id: string,
  items: Array<{ spec: TimberSpec; volume: string }>,
  date = '2026-11-03',
): InventoryEvent => ({
  kind: 'sale',
  date,
  createdAt: `${date}T08:00:00.000Z`,
  ref: id,
  items,
});

describe('成本池', () => {
  it('采购 → 生产 → 销售：原木与方木成本按平均成本结转', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '5'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }]),
      sale('SO-1', [{ spec: specA, volume: '1.0000' }]),
    ]);

    expect(result.rawTons).toBe('5.000');
    expect(result.rawAmount).toBe('2500.00');
    expect(result.rawUnitCost).toBe('500.000000');
    expect(result.timberVolume).toBe('1.5000');
    expect(result.timberAmount).toBe('1500.00');
    expect(result.timberUnitCost).toBe('1000.000000');
    expect(result.specs).toEqual({ '3000x100x20': '1.5000' });
  });

  it('领用记待结转、产出时转入方木池；库存总值先降后恢复', () => {
    const afterIssue = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '5', '2026-11-02'),
    ]);
    expect(afterIssue.rawTons).toBe('5.000');
    expect(afterIssue.rawAmount).toBe('2500.00');
    expect(afterIssue.timberVolume).toBe('0.0000');
    expect(afterIssue.timberAmount).toBe('0.00');
    expect(afterIssue.pendingAmount).toBe('2500.00');
    expect(afterIssue.timberUnitCost).toBe('0.000000');
    expect(calcInventoryTotalAmount(afterIssue.rawAmount, afterIssue.timberAmount)).toBe('2500.00');

    const afterOutput = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '5', '2026-11-02'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }], '2026-11-03'),
    ]);
    expect(afterOutput.timberVolume).toBe('2.5000');
    expect(afterOutput.timberAmount).toBe('2500.00');
    expect(afterOutput.pendingAmount).toBe('0.00');
    expect(afterOutput.timberUnitCost).toBe('1000.000000');
    expect(calcInventoryTotalAmount(afterOutput.rawAmount, afterOutput.timberAmount)).toBe('5000.00');
  });

  it('加工期间销售沿用现有方木成本，不受待结转影响', () => {
    const result = foldInventoryEvents([
      {
        kind: 'opening',
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
        ref: 'IC-1',
        raw: { tons: '10', amount: '5000.00' },
        timber: [{ spec: specA, volume: '10.0000', amount: '10000.00' }],
      },
      issue('MI-1', '4', '2026-11-02'),
      sale('SO-1', [{ spec: specA, volume: '1.0000' }], '2026-11-03'),
      output('PR-1', [{ spec: specA, volume: '2.0000' }], '2026-11-04'),
    ]);

    expect(result.rawTons).toBe('6.000');
    expect(result.rawAmount).toBe('3000.00');
    expect(result.pendingAmount).toBe('0.00');
    expect(result.timberVolume).toBe('11.0000');
    expect(result.timberAmount).toBe('11000.00');
    expect(result.timberUnitCost).toBe('1000.000000');
    expect(calcInventoryTotalAmount(result.rawAmount, result.timberAmount)).toBe('14000.00');
  });

  it('无待结转时产出按 0 成本入库', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }]),
    ]);

    expect(result.rawTons).toBe('10.000');
    expect(result.rawAmount).toBe('5000.00');
    expect(result.timberVolume).toBe('2.5000');
    expect(result.timberAmount).toBe('0.00');
    expect(result.pendingAmount).toBe('0.00');
    expect(result.timberUnitCost).toBe('0.000000');
  });

  it('多张产出单时第一张拿走全部待结转，后续产出成本为 0', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '4', '2026-11-02'),
      output('PR-1', [{ spec: specA, volume: '1.0000' }], '2026-11-03'),
      output('PR-2', [{ spec: specA, volume: '2.0000' }], '2026-11-04'),
    ]);

    expect(result.timberVolume).toBe('3.0000');
    expect(result.timberAmount).toBe('2000.00');
    expect(result.timberUnitCost).toBe('666.666667');
    expect(result.pendingAmount).toBe('0.00');
  });

  it('产出日期早于领用时成本不结转，待结转留在池外', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }], '2026-11-02'),
      issue('MI-1', '4', '2026-11-03'),
    ]);

    expect(result.timberVolume).toBe('2.5000');
    expect(result.timberAmount).toBe('0.00');
    expect(result.timberUnitCost).toBe('0.000000');
    expect(result.pendingAmount).toBe('2000.00');
  });

  it('期初库存进入成本池，并按净尺寸规格聚合', () => {
    const result = foldInventoryEvents([
      {
        kind: 'opening',
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
        ref: 'IC-1',
        raw: { tons: '2', amount: '1000.00' },
        timber: [{ spec: specA, volume: '1.0000', amount: '800.00' }],
      },
      sale('SO-1', [{ spec: specA, volume: '0.5000' }], '2026-11-02'),
    ]);

    expect(result.rawTons).toBe('2.000');
    expect(result.rawUnitCost).toBe('500.000000');
    expect(result.timberVolume).toBe('0.5000');
    expect(result.timberAmount).toBe('400.00');
    expect(result.timberUnitCost).toBe('800.000000');
    expect(result.specs).toEqual({ '3000x100x20': '0.5000' });
  });

  it('多规格共用同一个方木平均成本，并按规格记录数量', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '5'),
      output('PR-1', [
        { spec: specA, volume: '1.5000' },
        { spec: specB, volume: '1.0000' },
      ]),
      sale('SO-1', [{ spec: specB, volume: '0.5000' }]),
    ]);

    expect(result.timberVolume).toBe('2.0000');
    expect(result.timberAmount).toBe('2000.00');
    expect(result.timberUnitCost).toBe('1000.000000');
    expect(result.specs).toEqual({
      '3000x100x20': '1.5000',
      '2000x100x20': '0.5000',
    });
  });

  it('负库存时保留最近一次有效成本，数量与规格可为负', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '5'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }]),
      sale('SO-1', [{ spec: specA, volume: '3.0000' }]),
    ]);

    expect(result.timberVolume).toBe('-0.5000');
    expect(result.timberAmount).toBe('-500.00');
    expect(result.timberUnitCost).toBe('1000.000000');
    expect(result.specs).toEqual({ '3000x100x20': '-0.5000' });
  });

  it('盘点调整按差异数量与金额调整成本池', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '5'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }]),
      sale('SO-1', [{ spec: specA, volume: '3.0000' }]),
      {
        kind: 'adjustment',
        date: '2026-11-04',
        createdAt: '2026-11-04T08:00:00.000Z',
        ref: 'IC-2',
        targetType: 'timber',
        spec: specA,
        quantityDelta: '0.5000',
        amountDelta: '500.00',
      },
    ]);

    expect(result.timberVolume).toBe('0.0000');
    expect(result.timberAmount).toBe('0.00');
    expect(result.specs).toEqual({});
  });

  it('同一天按创建时间排序，生产先于销售时可正常结转', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      {
        ...issue('MI-1', '5', '2026-11-02'),
        createdAt: '2026-11-02T08:00:00.000Z',
      },
      {
        ...output('PR-1', [{ spec: specA, volume: '2.5000' }], '2026-11-02'),
        createdAt: '2026-11-02T08:00:00.000Z',
      },
      {
        ...sale('SO-1', [{ spec: specA, volume: '1.0000' }], '2026-11-02'),
        createdAt: '2026-11-02T09:00:00.000Z',
      },
    ]);

    expect(result.timberVolume).toBe('1.5000');
    expect(result.timberAmount).toBe('1500.00');
  });

  it('期初即使排在输入末尾也先于采购与生产参与成本池', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00', '2026-11-02'),
      {
        kind: 'opening',
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
        ref: 'IC-1',
        raw: { tons: '2', amount: '1000.00' },
        timber: [],
      },
    ]);

    expect(result.rawTons).toBe('12.000');
    expect(result.rawAmount).toBe('6000.00');
    expect(result.rawUnitCost).toBe('500.000000');
  });

  it('原木盘点调整按差异吨数与金额调整原木池', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      {
        kind: 'adjustment',
        date: '2026-11-04',
        createdAt: '2026-11-04T08:00:00.000Z',
        ref: 'IC-2',
        targetType: 'raw_log',
        quantityDelta: '1.000',
        amountDelta: '500.00',
      },
    ]);

    expect(result.rawTons).toBe('11.000');
    expect(result.rawAmount).toBe('5500.00');
    expect(result.rawUnitCost).toBe('500.000000');
  });

  it('无原木成本时生产领用成本为 0，方木成本待补', () => {
    const result = foldInventoryEvents([
      issue('MI-1', '5'),
      output('PR-1', [{ spec: specA, volume: '2.5000' }]),
      sale('SO-1', [{ spec: specA, volume: '1.0000' }]),
    ]);

    expect(result.rawTons).toBe('-5.000');
    expect(result.timberAmount).toBe('0.00');
    expect(result.timberUnitCost).toBe('0.000000');
  });
});

describe('逐单归属（FIFO）', () => {
  it('单笔领用被一张产出单全额结转', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '4', '2026-11-02'),
      output('PR-1', [{ spec: specA, volume: '2.0000' }], '2026-11-03'),
    ]);

    expect(result.issueSettlements).toEqual([
      { ref: 'MI-1', date: '2026-11-02', cost: '2000.00', settled: '2000.00', remaining: '0.00', settledBy: ['PR-1'] },
    ]);
    expect(result.outputSettlements).toEqual([
      { ref: 'PR-1', date: '2026-11-03', amount: '2000.00', sources: ['MI-1'] },
    ]);
  });

  it('分多张产出单时按最早未结转先结转', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '4', '2026-11-02'),
      output('PR-1', [{ spec: specA, volume: '1.0000' }], '2026-11-03'),
      issue('MI-2', '2', '2026-11-04'),
      output('PR-2', [{ spec: specA, volume: '2.0000' }], '2026-11-05'),
    ]);

    expect(result.pendingAmount).toBe('0.00');
    expect(result.issueSettlements).toEqual([
      { ref: 'MI-1', date: '2026-11-02', cost: '2000.00', settled: '2000.00', remaining: '0.00', settledBy: ['PR-1'] },
      { ref: 'MI-2', date: '2026-11-04', cost: '1000.00', settled: '1000.00', remaining: '0.00', settledBy: ['PR-2'] },
    ]);
    expect(result.outputSettlements).toEqual([
      { ref: 'PR-1', date: '2026-11-03', amount: '2000.00', sources: ['MI-1'] },
      { ref: 'PR-2', date: '2026-11-05', amount: '1000.00', sources: ['MI-2'] },
    ]);
  });

  it('产出金额跨多笔领用时按顺序依次结转', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '2', '2026-11-02'),
      issue('MI-2', '3', '2026-11-03'),
      output('PR-1', [{ spec: specA, volume: '1.0000' }], '2026-11-04'),
    ]);

    expect(result.outputSettlements[0]).toEqual({
      ref: 'PR-1',
      date: '2026-11-04',
      amount: '2500.00',
      sources: ['MI-1', 'MI-2'],
    });
    expect(result.issueSettlements).toEqual([
      { ref: 'MI-1', date: '2026-11-02', cost: '1000.00', settled: '1000.00', remaining: '0.00', settledBy: ['PR-1'] },
      { ref: 'MI-2', date: '2026-11-03', cost: '1500.00', settled: '1500.00', remaining: '0.00', settledBy: ['PR-1'] },
    ]);
  });

  it('产出早于领用时该产出结转金额为 0，领用保持待结转', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      output('PR-1', [{ spec: specA, volume: '2.0000' }], '2026-11-02'),
      issue('MI-1', '4', '2026-11-03'),
    ]);

    expect(result.outputSettlements[0]).toEqual({
      ref: 'PR-1',
      date: '2026-11-02',
      amount: '0.00',
      sources: [],
    });
    expect(result.issueSettlements[0]).toMatchObject({
      ref: 'MI-1',
      settled: '0.00',
      remaining: '2000.00',
      settledBy: [],
    });
  });

  it('逐单归属之和等于待结转总额', () => {
    const result = foldInventoryEvents([
      purchase('PO-1', '10', '5000.00'),
      issue('MI-1', '2', '2026-11-02'),
      issue('MI-2', '3', '2026-11-03'),
      output('PR-1', [{ spec: specA, volume: '1.0000' }], '2026-11-04'),
    ]);

    const remainingSum = result.issueSettlements.reduce(
      (sum, item) => sum + Math.round(Number(item.remaining) * 100),
      0,
    );
    expect(remainingSum).toBe(Math.round(Number(result.pendingAmount) * 100));
  });
});

describe('材料成本快照与毛利', () => {
  it('材料成本 = 方量 × 单位成本，保留 2 位', () => {
    expect(calcMaterialCostAmount('1.5000', '1000.000000')).toBe('1500.00');
    expect(calcMaterialCostAmount('0.3333', '1234.567890')).toBe('411.48');
  });

  it('材料毛利与毛利率', () => {
    const profit = calcMaterialProfit('1800.00', '1000.00');
    expect(profit).toBe('800.00');
    expect(calcMaterialMargin(profit, '1800.00')).toBe('44.44');
    expect(calcMaterialMargin('0.00', '0.00')).toBeNull();
    expect(calcMaterialMargin('-100.00', '1800.00')).toBe('-5.56');
  });

  it('库存总值 = 原木金额 + 方木金额', () => {
    expect(calcInventoryTotalAmount('2500.00', '1500.00')).toBe('4000.00');
    expect(calcInventoryTotalAmount('-500.00', '1500.00')).toBe('1000.00');
  });
});
