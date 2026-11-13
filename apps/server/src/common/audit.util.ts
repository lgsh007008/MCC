import type { Request } from 'express';
import { requestContext } from './request-context.js';

// 审计请求上下文（design/审计日志.md §3）：IP 取代理头第一个地址，回退 req.ip；
// requestId 来自 request-context，与技术日志共用同一个串联标识。
export interface AuditRequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export function auditRequestMeta(req: Request): AuditRequestMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const userAgent = req.headers['user-agent'];
  return {
    ip: forwardedValue?.split(',')[0]?.trim() || req.ip || null,
    userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent ?? null,
    requestId: requestContext.getStore()?.requestId ?? null,
  };
}

// 兼容旧接口与守卫 403：从 /api/v1/<domain>/<action>/... 解析；新接口优先使用装饰器元数据。
export function parseAuditPath(path: string): { domain: string; action: string } {
  const parts = path.split('/').filter(Boolean);
  return { domain: parts[2] ?? 'unknown', action: parts[3] ?? '' };
}
