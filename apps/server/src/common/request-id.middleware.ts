import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.js';

// requestId 贯穿应用日志与响应头（技术方案 §9.2）：透传上游 x-request-id，无则生成；
// 回写响应头便于客户端/Agent 关联排查。需在路由与守卫之前注册（main.ts）。
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['x-request-id'];
  const requestId = (Array.isArray(header) ? header[0] : header) ?? randomUUID();
  res.setHeader('x-request-id', requestId);
  requestContext.run({ requestId }, () => next());
}