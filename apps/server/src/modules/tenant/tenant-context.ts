import { requestContext } from '../../common/request-context.js';

// 受控跨租户作用域（design/租户.md §1 / §5）：
// 平台开通、平台守卫与 seed 显式进入目标租户后，数据访问层才附加租户条件。
// 业务接口禁止接受外部传入的 tenantId；只允许平台流程经此函数切换。
// 首个租户主键保留历史值 default（迁移写入，schema 注释）。
export const DEFAULT_TENANT_ID = 'default';

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  const store = requestContext.getStore();
  // 请求内切换租户时保留同一 requestId，保证技术日志仍可串联；
  // 非请求场景（seed / 脚本）给一个稳定标识。
  return requestContext.run({ requestId: store?.requestId ?? 'platform', tenantId }, fn);
}
