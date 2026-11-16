// 生产与库存领域计算纯函数（design/生产与库存.md §3）：
// 原木全局成本池 + 生产批次成本对象（批次待结转 / 批次方木池）、库存估值、销售单材料成本快照。
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
      // 期初方木必须归属期初库存批次（R-生产-006）
      timber: Array<{ spec: TimberSpec; volume: string; amount: string; batchRef: string }>;
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
      /** 原木领用吨数；成本按当时原木平均成本转入本批次待结转 */
      tons: string;
      batchRef: string;
      batchDate?: string;
    }
  | {
      kind: 'output';
      date: string;
      createdAt: string;
      ref: string;
      batchRef: string;
      batchDate?: string;
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
    }
  | {
      kind: 'batch_close';
      date: string;
      createdAt: string;
      ref: string;
      batchRef: string;
    };

/** 逐单归属：领用单的结转情况（批内 FIFO，只用于追溯，不参与成本计算） */
export interface IssueSettlement {
  ref: string;
  batchRef: string;
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

/** 逐单归属：产出单本次结转的金额与来源领用单（批内全额结转） */
export interface OutputSettlement {
  ref: string;
  batchRef: string;
  date: string;
  /** 本次结转金额 */
  amount: string;
  /** 来源领用单编号 */
  sources: string[];
}

/** 销售材料成本层：按批次先进先出扣层；负库存层 batchRef 为空字符串 */
export interface SaleCostLayer {
  batchRef: string;
  spec: TimberSpec;
  volume: string;
  unitCost: string;
  amount: string;
}

export interface SaleSettlement {
  ref: string;
  date: string;
  amount: string;
  layers: SaleCostLayer[];
}

/** 单个批次的成本池结果（product/生产与库存.md R-生产-006） */
export interface BatchPoolResult {
  ref: string;
  date: string;
  status: 'open' | 'closed';
  timberVolume: string;
  timberAmount: string;
  timberUnitCost: string;
  pendingAmount: string;
  specs: Record<string, string>;
  closedSettledAmount: string;
  issueSettlements: IssueSettlement[];
  outputSettlements: OutputSettlement[];
}

export interface InventoryPoolResult {
  rawTons: string;
  rawAmount: string;
  rawUnitCost: string;
  /** 方木总计 = Σ批次 + 负库存缺口 */
  timberVolume: string;
  timberAmount: string;
  timberUnitCost: string;
  /** 原木领用成本 − 产出 / 关闭结转成本；不计入库存总值 */
  pendingAmount: string;
  /** 净尺寸规格 key → 库存方数（4 位小数） */
  specs: Record<string, string>;
  batches: BatchPoolResult[];
  /** 负库存缺口：销售超出批次可售数量时按当前平均成本估算，不计入任何批次 */
  shortfallVolume: string;
  shortfallAmount: string;
  issueSettlements: IssueSettlement[];
  outputSettlements: OutputSettlement[];
  saleSettlements: SaleSettlement[];
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

function addToSpec(map: Map<string, bigint>, key: string, delta: bigint): void {
  const next = (map.get(key) ?? 0n) + delta;
  if (next === 0n) {
    map.delete(key);
  } else {
    map.set(key, next);
  }
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

interface PendingEntry {
  ref: string;
  date: string;
  cost: bigint;
  remaining: bigint;
  settledBy: string[];
}

interface BatchState {
  ref: string;
  date: string;
  status: 'open' | 'closed';
  timberVolume: bigint;
  timberAmount: bigint;
  timberUnitCost: bigint;
  pendingAmount: bigint;
  specs: Map<string, bigint>;
  issueEntries: PendingEntry[];
  queue: PendingEntry[];
  outputSettlements: OutputSettlement[];
  closedSettledAmount: bigint;
}

interface FoldState {
  rawTons: bigint;
  rawAmount: bigint;
  rawUnitCost: bigint;
  timberVolume: bigint;
  timberAmount: bigint;
  timberUnitCost: bigint;
  shortfallVolume: bigint;
  shortfallAmount: bigint;
  specs: Map<string, bigint>;
  batches: Map<string, BatchState>;
  saleSettlements: SaleSettlement[];
}

function createBatch(ref: string, date: string): BatchState {
  return {
    ref,
    date,
    status: 'open',
    timberVolume: 0n,
    timberAmount: 0n,
    timberUnitCost: 0n,
    pendingAmount: 0n,
    specs: new Map(),
    issueEntries: [],
    queue: [],
    outputSettlements: [],
    closedSettledAmount: 0n,
  };
}

function getBatch(state: FoldState, ref: string, date: string, batchDate?: string): BatchState {
  let batch = state.batches.get(ref);
  if (!batch) {
    batch = createBatch(ref, batchDate ?? date);
    state.batches.set(ref, batch);
  } else if (batchDate && batch.date > batchDate) {
    batch.date = batchDate;
  }
  return batch;
}

function refreshRawCost(state: FoldState): void {
  if (state.rawTons > 0n && state.rawAmount > 0n) {
    state.rawUnitCost = rawUnitCostOf(state.rawAmount, state.rawTons);
  }
}

function refreshBatchCost(batch: BatchState): void {
  if (batch.timberVolume > 0n && batch.timberAmount > 0n) {
    batch.timberUnitCost = timberUnitCostOf(batch.timberAmount, batch.timberVolume);
  }
}

function refreshTimberCost(state: FoldState): void {
  if (state.timberVolume > 0n && state.timberAmount > 0n) {
    state.timberUnitCost = timberUnitCostOf(state.timberAmount, state.timberVolume);
  }
}

function addTimber(
  state: FoldState,
  batch: BatchState,
  key: string,
  volume: bigint,
  amount: bigint,
): void {
  addToSpec(batch.specs, key, volume);
  addToSpec(state.specs, key, volume);
  batch.timberVolume += volume;
  batch.timberAmount += amount;
  state.timberVolume += volume;
  state.timberAmount += amount;
  refreshBatchCost(batch);
  refreshTimberCost(state);
}

// 销售扣层：按批次日期先进先出，且只扣有该规格库存的批次；不足部分进负库存缺口。
function consumeSaleItem(
  state: FoldState,
  item: { spec: TimberSpec; volume: string },
  layers: SaleCostLayer[],
): bigint {
  const key = timberSpecKey(item.spec);
  let remaining = toScaled(item.volume, VOLUME_SCALE);
  let cost = 0n;
  const ordered = [...state.batches.values()].sort(
    (left, right) => left.date.localeCompare(right.date) || left.ref.localeCompare(right.ref),
  );
  for (const batch of ordered) {
    if (remaining <= 0n) {
      break;
    }
    const available = batch.specs.get(key) ?? 0n;
    if (available <= 0n) {
      continue;
    }
    const take = available < remaining ? available : remaining;
    const unitCost =
      batch.timberUnitCost > 0n ? batch.timberUnitCost : state.timberUnitCost;
    const amount = divRoundSigned(take * unitCost, TIMBER_COST_FACTOR);
    addToSpec(batch.specs, key, -take);
    batch.timberVolume -= take;
    batch.timberAmount -= amount;
    refreshBatchCost(batch);
    layers.push({
      batchRef: batch.ref,
      spec: item.spec,
      volume: fromScaled(take, VOLUME_SCALE),
      unitCost: fromScaled(unitCost, COST_SCALE),
      amount: fromScaled(amount, AMOUNT_SCALE),
    });
    cost += amount;
    remaining -= take;
  }
  if (remaining > 0n) {
    const unitCost = state.timberUnitCost;
    const amount = divRoundSigned(remaining * unitCost, TIMBER_COST_FACTOR);
    state.shortfallVolume -= remaining;
    state.shortfallAmount -= amount;
    layers.push({
      batchRef: '',
      spec: item.spec,
      volume: fromScaled(remaining, VOLUME_SCALE),
      unitCost: fromScaled(unitCost, COST_SCALE),
      amount: fromScaled(amount, AMOUNT_SCALE),
    });
    cost += amount;
  }
  addToSpec(state.specs, key, -toScaled(item.volume, VOLUME_SCALE));
  state.timberVolume -= toScaled(item.volume, VOLUME_SCALE);
  state.timberAmount -= cost;
  refreshTimberCost(state);
  return cost;
}

function foldInternal(events: InventoryEvent[]): FoldState {
  const state: FoldState = {
    rawTons: 0n,
    rawAmount: 0n,
    rawUnitCost: 0n,
    timberVolume: 0n,
    timberAmount: 0n,
    timberUnitCost: 0n,
    shortfallVolume: 0n,
    shortfallAmount: 0n,
    specs: new Map(),
    batches: new Map(),
    saleSettlements: [],
  };

  for (const event of sortEvents(events)) {
    if (event.kind === 'opening') {
      if (event.raw) {
        state.rawTons += toScaled(event.raw.tons, TONS_SCALE);
        state.rawAmount += toScaled(event.raw.amount, AMOUNT_SCALE);
      }
      for (const line of event.timber) {
        const batch = getBatch(state, line.batchRef, event.date);
        addTimber(
          state,
          batch,
          timberSpecKey(line.spec),
          toScaled(line.volume, VOLUME_SCALE),
          toScaled(line.amount, AMOUNT_SCALE),
        );
      }
      refreshRawCost(state);
      continue;
    }

    if (event.kind === 'purchase') {
      state.rawTons += toScaled(event.deliveredTons, TONS_SCALE);
      state.rawAmount += toScaled(event.totalAmount, AMOUNT_SCALE);
      refreshRawCost(state);
      continue;
    }

    if (event.kind === 'issue') {
      const consumed = toScaled(event.tons, TONS_SCALE);
      // 领用成本 = 吨数 × 当前原木单位成本；无有效成本时按 0
      const cost = divRoundSigned(consumed * state.rawUnitCost, RAW_COST_FACTOR);
      state.rawTons -= consumed;
      state.rawAmount -= cost;
      const batch = getBatch(state, event.batchRef, event.date, event.batchDate);
      batch.pendingAmount += cost;
      const entry: PendingEntry = {
        ref: event.ref,
        date: event.date,
        cost,
        remaining: cost,
        settledBy: [],
      };
      batch.issueEntries.push(entry);
      if (cost > 0n) {
        batch.queue.push(entry);
      }
      refreshRawCost(state);
      continue;
    }

    if (event.kind === 'output') {
      const batch = getBatch(state, event.batchRef, event.date, event.batchDate);
      for (const output of event.outputs) {
        addTimber(
          state,
          batch,
          timberSpecKey(output.spec),
          toScaled(output.volume, VOLUME_SCALE),
          0n,
        );
      }
      // 产出把本批次待结转全额转入本批次方木池（批内 FIFO 追溯）
      const transferred = batch.pendingAmount;
      const sources: string[] = [];
      let left = transferred;
      while (left > 0n && batch.queue.length > 0) {
        const head = batch.queue[0]!;
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
          batch.queue.shift();
        }
      }
      batch.outputSettlements.push({
        ref: event.ref,
        batchRef: batch.ref,
        date: event.date,
        amount: fromScaled(transferred, AMOUNT_SCALE),
        sources,
      });
      batch.pendingAmount = 0n;
      batch.timberAmount += transferred;
      state.timberAmount += transferred;
      refreshBatchCost(batch);
      refreshTimberCost(state);
      continue;
    }

    if (event.kind === 'batch_close') {
      const batch = getBatch(state, event.batchRef, event.date);
      const transferred = batch.pendingAmount;
      if (transferred > 0n) {
        batch.closedSettledAmount += transferred;
        batch.pendingAmount = 0n;
        batch.timberAmount += transferred;
        state.timberAmount += transferred;
        refreshBatchCost(batch);
        refreshTimberCost(state);
      }
      batch.status = 'closed';
      continue;
    }

    if (event.kind === 'sale') {
      const layers: SaleCostLayer[] = [];
      let amount = 0n;
      for (const item of event.items) {
        amount += consumeSaleItem(state, item, layers);
      }
      state.saleSettlements.push({
        ref: event.ref,
        date: event.date,
        amount: fromScaled(amount, AMOUNT_SCALE),
        layers,
      });
      continue;
    }

    // adjustment
    if (event.targetType === 'raw_log') {
      state.rawTons += toScaled(event.quantityDelta, TONS_SCALE);
      state.rawAmount += toScaled(event.amountDelta, AMOUNT_SCALE);
      refreshRawCost(state);
      continue;
    }

    // 方木盘点差异：按批次日期 FIFO 分摊数量与金额；盘点不涉及待结转。
    const delta = toScaled(event.quantityDelta, VOLUME_SCALE);
    const amount = toScaled(event.amountDelta, AMOUNT_SCALE);
    if (delta === 0n) {
      continue;
    }
    const key = event.spec ? timberSpecKey(event.spec) : '';
    if (!key) {
      continue;
    }
    const ordered = [...state.batches.values()].sort(
      (left, right) => left.date.localeCompare(right.date) || left.ref.localeCompare(right.ref),
    );
    if (ordered.length === 0) {
      // 盘点日期早于任何批次（补录历史盘点）：盘盈进入以调整单号为标识的临时批次，
      // 后续产出 / 销售按先进先出消费；盘亏无可调整库存，直接忽略。
      if (delta > 0n) {
        const target = getBatch(state, event.ref, event.date);
        addTimber(state, target, key, delta, amount);
      }
      continue;
    }
    if (delta > 0n) {
      // 盘盈：归入最早持有该规格的批次；没有则归入最早批次
      const target = ordered.find((batch) => (batch.specs.get(key) ?? 0n) > 0n) ?? ordered[0]!;
      addTimber(state, target, key, delta, amount);
      continue;
    }
    let need = -delta;
    let amountLeft = amount;
    let last: BatchState | undefined;
    for (const batch of ordered) {
      if (need === 0n) {
        break;
      }
      const available = batch.specs.get(key) ?? 0n;
      if (available <= 0n) {
        continue;
      }
      const take = available < need ? available : need;
      const share = amountLeft * take === 0n ? 0n : divRoundSigned(amountLeft * take, need);
      addTimber(state, batch, key, -take, share);
      need -= take;
      amountLeft -= share;
      last = batch;
      if (need === 0n) {
        break;
      }
    }
    if (need > 0n) {
      // 盘亏超过批次可售数量：剩余部分记入最早批次，允许批次数量为负
      const target = last ?? ordered[0]!;
      addTimber(state, target, key, -need, amountLeft);
    }
  }

  return state;
}

function toResult(state: FoldState): InventoryPoolResult {
  const batches = [...state.batches.values()]
    .sort((left, right) => left.date.localeCompare(right.date) || left.ref.localeCompare(right.ref))
    .map((batch): BatchPoolResult => ({
      ref: batch.ref,
      date: batch.date,
      status: batch.status,
      timberVolume: fromScaled(batch.timberVolume, VOLUME_SCALE),
      timberAmount: fromScaled(batch.timberAmount, AMOUNT_SCALE),
      timberUnitCost: fromScaled(batch.timberUnitCost, COST_SCALE),
      pendingAmount: fromScaled(batch.pendingAmount, AMOUNT_SCALE),
      specs: Object.fromEntries(
        [...batch.specs.entries()]
          .filter(([, volume]) => volume !== 0n)
          .map(([key, volume]) => [key, fromScaled(volume, VOLUME_SCALE)]),
      ),
      closedSettledAmount: fromScaled(batch.closedSettledAmount, AMOUNT_SCALE),
      issueSettlements: batch.issueEntries.map((entry) => ({
        ref: entry.ref,
        batchRef: batch.ref,
        date: entry.date,
        cost: fromScaled(entry.cost, AMOUNT_SCALE),
        settled: fromScaled(entry.cost - entry.remaining, AMOUNT_SCALE),
        remaining: fromScaled(entry.remaining, AMOUNT_SCALE),
        settledBy: entry.settledBy,
      })),
      outputSettlements: batch.outputSettlements,
    }));
  const issueSettlements = batches.flatMap((batch) => batch.issueSettlements);
  const outputSettlements = batches.flatMap((batch) => batch.outputSettlements);
  return {
    rawTons: fromScaled(state.rawTons, TONS_SCALE),
    rawAmount: fromScaled(state.rawAmount, AMOUNT_SCALE),
    rawUnitCost: fromScaled(state.rawUnitCost, COST_SCALE),
    timberVolume: fromScaled(state.timberVolume, VOLUME_SCALE),
    timberAmount: fromScaled(state.timberAmount, AMOUNT_SCALE),
    timberUnitCost: fromScaled(state.timberUnitCost, COST_SCALE),
    pendingAmount: fromScaled(
      [...state.batches.values()].reduce((sum, batch) => sum + batch.pendingAmount, 0n),
      AMOUNT_SCALE,
    ),
    specs: Object.fromEntries(
      [...state.specs.entries()]
        .filter(([, volume]) => volume !== 0n)
        .map(([key, volume]) => [key, fromScaled(volume, VOLUME_SCALE)]),
    ),
    batches,
    shortfallVolume: fromScaled(state.shortfallVolume, VOLUME_SCALE),
    shortfallAmount: fromScaled(state.shortfallAmount, AMOUNT_SCALE),
    issueSettlements,
    outputSettlements,
    saleSettlements: state.saleSettlements,
  };
}

export function foldInventoryEvents(events: InventoryEvent[]): InventoryPoolResult {
  return toResult(foldInternal(events));
}

/** 销售下单时的材料成本：按保存时当前批次层先进先出试算，不写入事件流 */
export function calcTimberSaleCost(
  events: InventoryEvent[],
  items: Array<{ spec: TimberSpec; volume: string }>,
): { amount: string; unitCost: string; status: 'final' | 'pending'; layers: SaleCostLayer[] } {
  const state = foldInternal(events);
  const layers: SaleCostLayer[] = [];
  let amount = 0n;
  let volume = 0n;
  for (const item of items) {
    amount += consumeSaleItem(state, item, layers);
    volume += toScaled(item.volume, VOLUME_SCALE);
  }
  const unitCost = volume > 0n ? timberUnitCostOf(amount, volume) : 0n;
  return {
    amount: fromScaled(amount, AMOUNT_SCALE),
    unitCost: fromScaled(unitCost, COST_SCALE),
    status: unitCost > 0n ? 'final' : 'pending',
    layers,
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

// 库存总值 = 原木金额 + 方木金额（批次合计 + 负库存缺口，不含待结转）
export function calcInventoryTotalAmount(rawAmount: string, timberAmount: string): string {
  return fromScaled(
    toScaled(rawAmount, AMOUNT_SCALE) + toScaled(timberAmount, AMOUNT_SCALE),
    AMOUNT_SCALE,
  );
}
