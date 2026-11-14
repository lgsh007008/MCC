// 金额 / 数量缩放整数工具（技术方案 §5.1：禁浮点）：
// 财务、订单、采购共用同一套放大、还原与四舍五入实现，避免各域各写一份导致舍入规则漂移。
// 入参格式由各域 zod schema 保证；本文件不做业务校验。

// 小数字符串 → 放大 10^scale 的整数（支持负数）
export function toScaled(value: string, scale: number): bigint {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const fracPadded = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const scaled = BigInt((intPart || '0') + fracPadded);
  return negative ? -scaled : scaled;
}

// 放大整数 → 小数字符串（补零至 scale 位，支持负数）
export function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const digits = abs.toString().padStart(scale + 1, '0');
  const intPart = scale > 0 ? digits.slice(0, -scale) : digits;
  const fracPart = scale > 0 ? digits.slice(-scale) : '';
  return `${negative ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`;
}

// 非负整数除法，四舍五入（round half up）；仅用于非负数量 / 金额乘积
export function divRoundHalfUp(numerator: bigint, divisor: bigint): bigint {
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  return remainder * 2n >= divisor ? quotient + 1n : quotient;
}
