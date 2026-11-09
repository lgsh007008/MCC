import { AsyncLocalStorage } from 'node:async_hooks';

// 单请求上下文（技术方案 §9.2 结构化日志）：requestId 由 request-id.middleware.ts 写入，
// AppLogger 输出日志时自动携带，实现同一请求内全部日志的串联。
export interface RequestContext {
  requestId: string;
  // ADR-005：多租户启用前恒为 undefined，数据访问层以 DEFAULT_TENANT_ID 兜底（prisma-tenant.extension.ts）
  tenantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();