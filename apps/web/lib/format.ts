// 展示精度（product/生产与库存.md R-生产-002）：
// 金额展示 2 位；其余数字（吨数 / 方数 / 平均成本）展示 3 位。
// 服务端返回十进制字符串，这里用 BigInt 放大整数做四舍五入，避免浮点误差。

function formatDecimal(value: string | null | undefined, scale: number): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  let scaled = BigInt(`${intPart}${fracPart}` || '0');
  const shift = scale - fracPart.length;
  if (shift >= 0) {
    scaled *= 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const remainder = scaled % divisor;
    scaled /= divisor;
    if (remainder * 2n >= divisor) {
      scaled += 1n;
    }
  }
  const text = scaled.toString().padStart(scale + 1, '0');
  const whole = text.slice(0, text.length - scale);
  const frac = text.slice(text.length - scale);
  const sign = negative && scaled !== 0n ? '-' : '';
  return scale > 0 ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

/** 金额：2 位小数 */
export function formatAmount(value: string | null | undefined): string {
  return formatDecimal(value, 2);
}

/** 数量 / 单价（吨数、方数、平均成本）：3 位小数 */
export function formatQuantity(value: string | null | undefined): string {
  return formatDecimal(value, 3);
}
