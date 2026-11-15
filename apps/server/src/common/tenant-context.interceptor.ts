import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable } from 'rxjs';
import { requestContext } from './request-context.js';
import type { AuthUser } from './decorators/current-user.decorator.js';
import { isOpsRequest } from './ops-path.js';

// 租户上下文注入（ADR-012）：AuthGuard 校验通过后，把租户身份写入请求上下文，
// 数据访问层据此附加租户条件（common/prisma-tenant.extension.ts）。
// 全局表（租户注册表 / 套餐 / 平台身份 / 平台审计）不受影响。
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (user?.tenantId && !isOpsRequest(request.path)) {
      const store = requestContext.getStore();
      if (store) {
        // 同一请求共享 store，后续服务层与审计拦截器都能读到租户
        store.tenantId = user.tenantId;
      } else {
        // 未经过 request-id 中间件（如集成测试）时补一个最小上下文
        requestContext.enterWith({ requestId: 'tenant-context', tenantId: user.tenantId });
      }
    }
    return next.handle();
  }
}
