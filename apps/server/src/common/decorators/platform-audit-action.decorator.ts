import { SetMetadata } from '@nestjs/common';

// 平台审计语义（product/审计日志.md R-审计-002；design/审计日志.md §9）：
// 平台写接口用 @PlatformAuditAction 声明领域、动作、中文名与对象类型；
// 刷新令牌等需要显式处理或不应记录的接口使用 @SkipPlatformAudit。
export const PLATFORM_AUDIT_ACTION_KEY = 'mcc:platform-audit-action';
export const SKIP_PLATFORM_AUDIT_KEY = 'mcc:skip-platform-audit';

export interface PlatformAuditActionMeta {
  domain: string;
  action: string;
  label: string;
  objectType?: string;
}

export const PlatformAuditAction = (
  meta: PlatformAuditActionMeta,
): MethodDecorator & ClassDecorator => SetMetadata(PLATFORM_AUDIT_ACTION_KEY, meta);

export const SkipPlatformAudit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_PLATFORM_AUDIT_KEY, true);
