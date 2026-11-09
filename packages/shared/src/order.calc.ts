// 订单领域计算纯函数（design/order.md §3）：
// 服务端落账与 web 实时预览调用同一套函数，单测为最高优先级（技术方案 §10）。
// 金额/尺寸禁止浮点（技术方案 §5.1）：以字符串表示的小数全部经 BigInt 整数运算完成，
// 舍入一律四舍五入（round half up）。入参格式由 zod schema（order.schemas.ts）保证。

const MONEY_SCALE = 2;
const VOLUME_SCALE = 4;
const CM_SCALE = 3;
// 方量 = 厚/100 × 宽/100 × 长/100 × 根数（m³）；长宽厚各自放大 10^3（3 位小数），
// 分母 = (10^3 × 10^2)^3 = 10^15；再 ×10^4 保留 4 位小数 → 除 10^11
const VOLUME_ROUND_DIVISOR = 10n ** 11n;

// 把非负小数字符串放大 10^scale 转为 BigInt（小数位不足补零）
function toScaled(value: string, scale: number): bigint {
  const [intPart, fracPart = ''] = value.split('.');
  const fracPadded = (fracPart + '0'.repeat(scale)).slice(0, scale);
  return BigInt(intPart + fracPadded || '0');
}

// 缩放整数回写小数（补零至 scale 位），输出字符串
function fromScaled(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, '0');
  const intPart = digits.slice(0, -scale);
  const fracPart = scale > 0 ? digits.slice(-scale) : '';
  return `${intPart}${fracPart ? `.${fracPart}` : ''}`;
}

// 非负整数除法，四舍五入（round half up）
function divRoundHalfUp(numerator: bigint, divisor: bigint): bigint {
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  return remainder * 2n >= divisor ? quotient + 1n : quotient;
}

// 方量（板材行）：thicknessCm/widthCm/lengthCm 为 3 位小数 cm 字符串，pieces 为整数根数。
// 返回 4 位小数 m³ 字符串。
export function calcVolumeM3(
  thicknessCm: string,
  widthCm: string,
  lengthCm: string,
  pieces: number,
): string {
  const numerator =
    toScaled(thicknessCm, CM_SCALE) *
    toScaled(widthCm, CM_SCALE) *
    toScaled(lengthCm, CM_SCALE) *
    BigInt(pieces);
  return fromScaled(divRoundHalfUp(numerator, VOLUME_ROUND_DIVISOR), VOLUME_SCALE);
}

// 板材行小计金额 = 方量（4 位小数）× 单价（2 位小数），返回 2 位小数金额字符串。
export function calcBoardLineAmount(volumeM3: string, price: string): string {
  // 产品放大 10^6；四舍五入保留 2 位 → 除 10^4
  const product = toScaled(volumeM3, VOLUME_SCALE) * toScaled(price, MONEY_SCALE);
  return fromScaled(divRoundHalfUp(product, 10n ** 4n), MONEY_SCALE);
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
  volumeM3: string | null;
}

// 整单汇总：合计方量、主表小计金额（Σ单行金额）、主表合计金额（小计 + 主表其他金额）。
// 单行金额 = 小计金额 + 其他金额（product/order.md R-订单-001 计算口径）。
export function calcOrderTotals(
  items: OrderTotalsLine[],
  orderOtherAmount: string,
): { totalVolume: string; subtotalAmount: string; totalAmount: string } {
  const lineTotals = items.map((item) => addAmounts(item.lineAmount, item.otherAmount));
  const volumes = items
    .filter((item): item is OrderTotalsLine & { volumeM3: string } => item.volumeM3 !== null)
    .map((item) => item.volumeM3);
  const subtotalAmount = lineTotals.length > 0 ? addAmounts(...lineTotals) : '0.00';
  return {
    totalVolume: sumVolumes(volumes),
    subtotalAmount,
    totalAmount: addAmounts(subtotalAmount, orderOtherAmount),
  };
}