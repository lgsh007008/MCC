// 唯一公开出口（技术方案 §4.2）：他模块只许经此引用，禁止深入内部实现。
export { TenantModule } from './tenant.module.js';
export { TenantService } from './tenant.service.js';
export type { TenantSummary } from './tenant.service.js';
export { runWithTenant, DEFAULT_TENANT_ID } from './tenant-context.js';
