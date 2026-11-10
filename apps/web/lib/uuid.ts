// 幂等键生成（design/order.md §7）。
// `crypto.randomUUID` 仅在安全上下文（HTTPS / localhost）可用；生产以 http://IP 访问时它是
// undefined，直接调用会抛错（销售单保存提示「提交失败，请稍后重试」）。
// 幂等键只要求唯一、不要求不可预测，非安全上下文回退到 getRandomValues 生成 UUID v4。
export function randomUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
