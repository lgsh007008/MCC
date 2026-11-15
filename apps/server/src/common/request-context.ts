import { AsyncLocalStorage } from 'node:async_hooks';

// 单请求上下文（技术方案 §9.2 结构化日志）：requestId 由 request-id.middleware.ts 写入，
// AppLogger 输出日志时自动携带，实现同一请求内全部日志的串联。
export interface RequestContext {
  requestId: string;
  // ADR-012：租户作用域。租户请求由 TenantContextInterceptor 注入；
  // 平台开通 / 平台守卫经 runWithTenant 显式进入；缺失时数据访问层直接拒绝业务表访问。
  tenantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();
