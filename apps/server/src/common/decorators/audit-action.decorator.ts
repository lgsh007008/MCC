import { SetMetadata } from '@nestjs/common';

// 审计语义（product/审计日志.md R-审计-001；design/审计日志.md §3）：
// 写接口用 @AuditAction 声明领域、动作、中文名与对象类型，拦截器不再依赖 URL 猜动作。
export const AUDIT_ACTION_KEY = 'mcc:audit-action';
export const SKIP_AUDIT_KEY = 'mcc:skip-audit';

export interface AuditActionMeta {
  domain: string;
  action: string;
  label: string;
  objectType?: string;
}

export const AuditAction = (meta: AuditActionMeta): MethodDecorator & ClassDecorator =>
  SetMetadata(AUDIT_ACTION_KEY, meta);

// 登录 / 登出 / 刷新等需要显式记录或不应记录的接口使用，避免拦截器重复落库。
export const SkipAudit = (): MethodDecorator & ClassDecorator => SetMetadata(SKIP_AUDIT_KEY, true);
