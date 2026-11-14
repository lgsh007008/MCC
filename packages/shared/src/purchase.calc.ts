// 采购领域计算纯函数（design/purchase.md §3）：
// 服务端落账与 web 实时预览共用，单测为最高优先级（技术方案 §10）。
// 吨数 3 位小数 × 单价 2 位小数 → 金额 2 位小数，四舍五入（round half up）；禁浮点。
import { divRoundHalfUp, fromScaled, toScaled } from './money';

const TONS_SCALE = 3;
const MONEY_SCALE = 2;

// 小计 = 结算吨数 × 单价；乘积放大 10^5，四舍五入保留 2 位 → 除 10^3
export function calcPurchaseSubtotal(settledTons: string, unitPrice: string): string {
  const product = toScaled(settledTons, TONS_SCALE) * toScaled(unitPrice, MONEY_SCALE);
  return fromScaled(divRoundHalfUp(product, 10n ** 3n), MONEY_SCALE);
}

// 合计 = 小计 + 其他金额（运费等）
export function calcPurchaseTotal(subtotalAmount: string, otherAmount: string): string {
  const scaled =
    toScaled(subtotalAmount, MONEY_SCALE) + toScaled(otherAmount, MONEY_SCALE);
  return fromScaled(scaled, MONEY_SCALE);
}
