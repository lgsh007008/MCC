// 订单领域计算纯函数（design/order.md §3）：
// 服务端落账与 web 实时预览调用同一套函数，单测为最高优先级（技术方案 §10）。
// 金额/尺寸禁止浮点（技术方案 §5.1）：以字符串表示的小数全部经 BigInt 整数运算完成，
// 舍入一律四舍五入（round half up）。入参格式由 zod schema（order.schemas.ts）保证。
import { divRoundHalfUp, fromScaled, toScaled } from './money';

const MONEY_SCALE = 2;
const VOLUME_SCALE = 4;
// 方量 = 厚mm × 宽mm × 长mm × 根数 ÷ 10^9（m³）；
// 再 ×10^4 保留 4 位小数 → 分母 10^5
const VOLUME_ROUND_DIVISOR = 10n ** 5n;

// 方量：lengthMm/widthMm/heightMm 为整数毫米，pieces 为整数根数。
// 返回 4 位小数 m³ 字符串；每一行都计算（工资依据）。
export function calcVolumeM3(
  lengthMm: number,
  widthMm: number,
  heightMm: number,
  pieces: number,
): string {
  const numerator =
    BigInt(lengthMm) * BigInt(widthMm) * BigInt(heightMm) * BigInt(pieces);
  return fromScaled(divRoundHalfUp(numerator, VOLUME_ROUND_DIVISOR), VOLUME_SCALE);
}

// 按方量计价：行金额 = 方量（4 位小数）× 单价（2 位小数），返回 2 位小数。
export function calcVolumeLineAmount(volumeM3: string, price: string): string {
  // 乘积放大 10^6；四舍五入保留 2 位 → 除 10^4
  const product = toScaled(volumeM3, VOLUME_SCALE) * toScaled(price, MONEY_SCALE);
  return fromScaled(divRoundHalfUp(product, 10n ** 4n), MONEY_SCALE);
}

// 按根数计价：行金额 = 根数 × 单价（2 位小数），天然 2 位。
export function calcPieceLineAmount(pieces: number, price: string): string {
  return fromScaled(BigInt(pieces) * toScaled(price, MONEY_SCALE), MONEY_SCALE);
}

// 统一行金额入口：计价方式决定公式，方量两种方式下都已计算。
export function calcLineAmount(
  pricingMode: 'volume' | 'piece',
  volumeM3: string,
  pieces: number,
  price: string,
): string {
  return pricingMode === 'piece'
    ? calcPieceLineAmount(pieces, price)
    : calcVolumeLineAmount(volumeM3, price);
}

// 金额相加（2 位小数字符串，任意项）
export function addAmounts(...values: string[]): string {
  const sum = values.reduce((acc, value) => acc + toScaled(value, MONEY_SCALE), 0n);
  return fromScaled(sum, MONEY_SCALE);
}

// 方量相加（4 位小数字符串，任意项）
export function sumVolumes(values: string[]): string {
  const sum = values.reduce((acc, value) => acc + toScaled(value, VOLUME_SCALE), 0n);
  return fromScaled(sum, VOLUME_SCALE);
}

export interface OrderTotalsLine {
  lineAmount: string;
  otherAmount: string;
  volumeM3: string;
}

// 整单汇总：合计方量、主表小计金额（Σ单行金额）、主表合计金额（小计 + 主表其他金额）。
// 单行金额 = 小计金额 + 其他金额（product/order.md R-订单-001 计算口径）。
export function calcOrderTotals(
  items: OrderTotalsLine[],
  orderOtherAmount: string,
): { totalVolume: string; subtotalAmount: string; totalAmount: string } {
  const lineTotals = items.map((item) => addAmounts(item.lineAmount, item.otherAmount));
  const volumes = items.map((item) => item.volumeM3);
  const subtotalAmount = lineTotals.length > 0 ? addAmounts(...lineTotals) : '0.00';
  return {
    totalVolume: sumVolumes(volumes),
    subtotalAmount,
    totalAmount: addAmounts(subtotalAmount, orderOtherAmount),
  };
}