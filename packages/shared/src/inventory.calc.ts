// 生产与库存领域计算纯函数（design/生产与库存.md §3）：
// 原木 / 方木移动加权平均成本池、库存估值、销售单材料成本快照与材料毛利。
// 金额 / 数量一律字符串 + BigInt 放大整数，禁浮点（技术方案 §5.1）；入参格式由 zod schema 保证。

import { divRoundHalfUp, fromScaled, toScaled } from './money';

const TONS_SCALE = 3;
const VOLUME_SCALE = 4;
const AMOUNT_SCALE = 2;
const COST_SCALE = 6;

// 原木：金额 2 位 / 吨数 3 位 → 成本 6 位，需 × 10^7
const RAW_COST_FACTOR = 10n ** 7n;
// 方木：金额 2 位 / 方数 4 位 → 成本 6 位，需 × 10^8
const TIMBER_COST_FACTOR = 10n ** 8n;

export interface TimberSpec {
  lengthMm: number;
  widthMm: number;
  heightMm: number;
}

export function timberSpecKey(spec: TimberSpec): string {
  return `${spec.lengthMm}x${spec.widthMm}x${spec.heightMm}`;
}

export type InventoryEvent =
  | {
      kind: 'opening';
      date: string;
      createdAt: string;
      ref: string;
      raw?: { tons: string; amount: string };
      timber: Array<{ spec: TimberSpec; volume: string; amount: string }>;
    }
  | {
      kind: 'purchase';
      date: string;
      createdAt: string;
      ref: string;
      deliveredTons: string;
      totalAmount: string;
    }
  | {
      kind: 'issue';
      date: string;
      createdAt: string;
      ref: string;
      /** 原木领用吨数；成本按当时原木平均成本自动转入方木池 */
      tons: string;
    }
  | {
      kind: 'output';
      date: string;
      createdAt: string;
      ref: string;
      outputs: Array<{ spec: TimberSpec; volume: string }>;
    }
  | {
      kind: 'sale';
      date: string;
      createdAt: string;
      ref: string;
      items: Array<{ spec: TimberSpec; volume: string }>;
    }
  | {
      kind: 'adjustment';
      date: string;
      createdAt: string;
      ref: string;
      targetType: 'raw_log' | 'timber';
      spec?: TimberSpec;
      quantityDelta: string;
      amountDelta: string;
    };

/** 逐单归属：领用单的结转情况（只用于追溯，不参与成本计算） */
export interface IssueSettlement {
  ref: string;
  date: string;
  /** 领用成本 */
  cost: string;
  /** 已结转金额 */
  settled: string;
  /** 待结转金额 */
  remaining: string;
  /** 结转过它的产出单编号 */
  settledBy: string[];
}

/** 逐单归属：产出单本次结转的金额与来源领用单 */
export interface OutputSettlement {
  ref: string;
  date: string;
  /** 本次结转金额 */
  amount: string;
  /** 来源领用单编号 */
  sources: string[];
}

export interface InventoryPoolResult {
  rawTons: string;
  rawAmount: string;
  rawUnitCost: string;
  timberVolume: string;
  timberAmount: string;
  timberUnitCost: string;
  /** 原木领用成本 − 产出结转成本；不计入库存总值 */
  pendingAmount: string;
  /** 净尺寸规格 key → 库存方数（4 位小数） */
  specs: Record<string, string>;
  /** 按「最早未结转的先结转」推导的领用结转情况 */
  issueSettlements: IssueSettlement[];
  /** 按「最早未结转的先结转」推导的产出结转金额 */
  outputSettlements: OutputSettlement[];
}

// 有符号四舍五入除法（divisor 必须为正）；成本与毛利可能为负。
function divRoundSigned(numerator: bigint, divisor: bigint): bigint {
  const negative = numerator < 0n;
  const abs = negative ? -numerator : numerator;
  const quotient = divRoundHalfUp(abs, divisor);
  return negative ? -quotient : quotient;
}

// 原木单位成本（6 位）：金额 2 位 / 吨数 3 位
function rawUnitCostOf(amount: bigint, tons: bigint): bigint {
  return divRoundSigned(amount * RAW_COST_FACTOR, tons);
}

// 方木单位成本（6 位）：金额 2 位 / 方数 4 位
function timberUnitCostOf(amount: bigint, volume: bigint): bigint {
  return divRoundSigned(amount * TIMBER_COST_FACTOR, volume);
}

function addToSpec(map: Map<string, bigint>, spec: TimberSpec, delta: bigint): void {
  const key = timberSpecKey(spec);
  map.set(key, (map.get(key) ?? 0n) + delta);
}

// 事件排序：期初固定最前；其余按业务日期 → 创建时间 → 编号升序，保证成本池可复现。
function sortEvents(events: InventoryEvent[]): InventoryEvent[] {
  return [...events].sort((left, right) => {
    if (left.kind === 'opening' && right.kind !== 'opening') {
      return -1;
    }
    if (right.kind === 'opening' && left.kind !== 'opening') {
      return 1;
    }
    return (
      left.date.localeCompare(right.date) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.ref.localeCompare(right.ref)
    );
  });
}

export function foldInventoryEvents(events: InventoryEvent[]): InventoryPoolResult {
  let rawTons = 0n;
  let rawAmount = 0n;
  let rawUnitCost = 0n;
  let timberVolume = 0n;
  let timberAmount = 0n;
  let timberUnitCost = 0n;
  let pendingAmount = 0n;
  const specs = new Map<string, bigint>();

  // 逐单归属：queue 为「按事件顺序、最早未结转在前」的队列，entries 保留全部领用以供追溯
  interface PendingEntry {
    ref: string;
    date: string;
    cost: bigint;
    remaining: bigint;
    settledBy: string[];
  }
  const issueEntries: PendingEntry[] = [];
  const queue: PendingEntry[] = [];
  const outputSettlements: OutputSettlement[] = [];

  const refreshRawCost = (): void => {
    if (rawTons > 0n && rawAmount > 0n) {
      rawUnitCost = rawUnitCostOf(rawAmount, rawTons);
    }
  };
  const refreshTimberCost = (): void => {
    if (timberVolume > 0n && timberAmount > 0n) {
      timberUnitCost = timberUnitCostOf(timberAmount, timberVolume);
    }
  };

  for (const event of sortEvents(events)) {
    if (event.kind === 'opening') {
      if (event.raw) {
        rawTons += toScaled(event.raw.tons, TONS_SCALE);
        rawAmount += toScaled(event.raw.amount, AMOUNT_SCALE);
      }
      for (const line of event.timber) {
        const volume = toScaled(line.volume, VOLUME_SCALE);
        timberVolume += volume;
        timberAmount += toScaled(line.amount, AMOUNT_SCALE);
        addToSpec(specs, line.spec, volume);
      }
      refreshRawCost();
      refreshTimberCost();
      continue;
    }

    if (event.kind === 'purchase') {
      rawTons += toScaled(event.deliveredTons, TONS_SCALE);
      rawAmount += toScaled(event.totalAmount, AMOUNT_SCALE);
      refreshRawCost();
      continue;
    }

    if (event.kind === 'issue') {
      const consumed = toScaled(event.tons, TONS_SCALE);
      // 领用成本 = 吨数 × 当前原木单位成本；无有效成本时按 0
      const cost = divRoundSigned(consumed * rawUnitCost, RAW_COST_FACTOR);
      rawTons -= consumed;
      rawAmount -= cost;
      // 成本先记待结转，不计入库存总值；方木产出时全额转入方木池（product/生产与库存.md R-生产-002）
      pendingAmount += cost;
      const entry: PendingEntry = {
        ref: event.ref,
        date: event.date,
        cost,
        remaining: cost,
        settledBy: [],
      };
      issueEntries.push(entry);
      if (cost > 0n) {
        queue.push(entry);
      }
      refreshRawCost();
      continue;
    }

    if (event.kind === 'output') {
      for (const output of event.outputs) {
        const volume = toScaled(output.volume, VOLUME_SCALE);
        timberVolume += volume;
        addToSpec(specs, output.spec, volume);
      }
      // 产出时把当前待结转成本全额转入方木池；一批领用对应一张产出单
      const transferred = pendingAmount;
      const sources: string[] = [];
      let left = transferred;
      while (left > 0n && queue.length > 0) {
        const head = queue[0]!;
        const take = head.remaining < left ? head.remaining : left;
        head.remaining -= take;
        left -= take;
        if (take > 0n) {
          head.settledBy.push(event.ref);
          if (!sources.includes(head.ref)) {
            sources.push(head.ref);
          }
        }
        if (head.remaining === 0n) {
          queue.shift();
        }
      }
      outputSettlements.push({
        ref: event.ref,
        date: event.date,
        amount: fromScaled(transferred, AMOUNT_SCALE),
        sources,
      });
      timberAmount += transferred;
      pendingAmount = 0n;
      refreshTimberCost();
      continue;
    }

    if (event.kind === 'sale') {
      for (const item of event.items) {
        const volume = toScaled(item.volume, VOLUME_SCALE);
        const cost = divRoundSigned(volume * timberUnitCost, TIMBER_COST_FACTOR);
        timberVolume -= volume;
        timberAmount -= cost;
        addToSpec(specs, item.spec, -volume);
      }
      refreshTimberCost();
      continue;
    }

    // adjustment
    if (event.targetType === 'raw_log') {
      rawTons += toScaled(event.quantityDelta, TONS_SCALE);
      rawAmount += toScaled(event.amountDelta, AMOUNT_SCALE);
      refreshRawCost();
    } else {
      const delta = toScaled(event.quantityDelta, VOLUME_SCALE);
      timberVolume += delta;
      timberAmount += toScaled(event.amountDelta, AMOUNT_SCALE);
      if (event.spec) {
        addToSpec(specs, event.spec, delta);
      }
      refreshTimberCost();
    }
  }

  return {
    rawTons: fromScaled(rawTons, TONS_SCALE),
    rawAmount: fromScaled(rawAmount, AMOUNT_SCALE),
    rawUnitCost: fromScaled(rawUnitCost, COST_SCALE),
    timberVolume: fromScaled(timberVolume, VOLUME_SCALE),
    timberAmount: fromScaled(timberAmount, AMOUNT_SCALE),
    timberUnitCost: fromScaled(timberUnitCost, COST_SCALE),
    pendingAmount: fromScaled(pendingAmount, AMOUNT_SCALE),
    issueSettlements: issueEntries.map((entry) => ({
      ref: entry.ref,
      date: entry.date,
      cost: fromScaled(entry.cost, AMOUNT_SCALE),
      settled: fromScaled(entry.cost - entry.remaining, AMOUNT_SCALE),
      remaining: fromScaled(entry.remaining, AMOUNT_SCALE),
      settledBy: entry.settledBy,
    })),
    outputSettlements,
    specs: Object.fromEntries(
      [...specs.entries()]
        .filter(([, volume]) => volume !== 0n)
        .map(([key, volume]) => [key, fromScaled(volume, VOLUME_SCALE)]),
    ),
  };
}

// 材料成本金额 = 方量（4 位）× 单位成本（6 位），2 位四舍五入
export function calcMaterialCostAmount(volume: string, unitCost: string): string {
  const product = toScaled(volume, VOLUME_SCALE) * toScaled(unitCost, COST_SCALE);
  return fromScaled(divRoundSigned(product, 10n ** 8n), AMOUNT_SCALE);
}

// 材料毛利 = 确认收入（2 位）− 材料成本（2 位）
export function calcMaterialProfit(revenue: string, cost: string): string {
  return fromScaled(
    toScaled(revenue, AMOUNT_SCALE) - toScaled(cost, AMOUNT_SCALE),
    AMOUNT_SCALE,
  );
}

// 毛利率（百分比，2 位）；收入为 0 返回 null
export function calcMaterialMargin(profit: string, revenue: string): string | null {
  const revenueScaled = toScaled(revenue, AMOUNT_SCALE);
  if (revenueScaled === 0n) {
    return null;
  }
  const profitScaled = toScaled(profit, AMOUNT_SCALE);
  return fromScaled(divRoundSigned(profitScaled * 10_000n, revenueScaled), 2);
}

// 库存总值
export function calcInventoryTotalAmount(rawAmount: string, timberAmount: string): string {
  return fromScaled(
    toScaled(rawAmount, AMOUNT_SCALE) + toScaled(timberAmount, AMOUNT_SCALE),
    AMOUNT_SCALE,
  );
}
