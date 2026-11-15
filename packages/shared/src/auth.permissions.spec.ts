import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ROLE_LABELS,
  PLATFORM_ROLE_SCOPES,
  PLATFORM_ROLES,
  PLATFORM_SCOPES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_SCOPES,
  SCOPES,
  USER_ROLES,
  hasPlatformScope,
  hasScope,
  isPlatformRole,
  platformScopeSatisfied,
  scopeSatisfied,
  scopesOf,
} from './auth.permissions';
import type { PlatformScope, Scope } from './auth.permissions';

// 角色矩阵完整性（product/账号与权限.md R-账号与权限-003）：
// 新增角色时必须同时补标签、说明与 scope，否则账号管理与权限说明会出现空缺。
describe('角色与权限矩阵', () => {
  it('每个角色都有标签与说明', () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy();
      expect(ROLE_DESCRIPTIONS[role]).toBeTruthy();
    }
  });

  it('每个角色的 scope 都在合法清单内', () => {
    for (const role of USER_ROLES) {
      for (const scope of ROLE_SCOPES[role]) {
        expect(SCOPES).toContain(scope);
      }
    }
  });

  it('管理员拥有全部 scope；工人仅订单查看', () => {
    expect(scopesOf('ADMIN')).toEqual(SCOPES);
    expect(scopesOf('WORKER')).toEqual(['order:view']);
  });

  it('审计日志仅管理员可查看', () => {
    expect(hasScope('ADMIN', 'audit:view')).toBe(true);
    expect(hasScope('SALES', 'audit:view')).toBe(false);
    expect(hasScope('FINANCE', 'audit:view')).toBe(false);
    expect(hasScope('WORKER', 'audit:view')).toBe(false);
    expect(SCOPES).not.toContain('audit:manage');
  });

  // 技术方案 §8.2：manage 默认包含同域 view；角色矩阵只列 manage 时也能查看
  it('manage 包含同域 view，反之不成立', () => {
    expect(scopeSatisfied(['order:manage'], 'order:view')).toBe(true);
    expect(scopeSatisfied(['finance:manage'], 'finance:view')).toBe(true);
    expect(scopeSatisfied(['order:view'], 'order:manage')).toBe(false);
    // 无 view/manage 配对的 scope 不受包含规则影响
    expect(scopeSatisfied(['account:manage'], 'account:view' as Scope)).toBe(false);
    expect(scopeSatisfied(['audit:view'], 'audit:manage' as Scope)).toBe(false);
  });

  it('未知角色无任何 scope', () => {
    expect(scopesOf(null)).toEqual([]);
    expect(scopesOf('GUEST')).toEqual([]);
  });

  it('销售含财务维护；财务可看订单与客户但不能维护', () => {
    expect(hasScope('SALES', 'finance:manage')).toBe(true);
    expect(hasScope('FINANCE', 'finance:manage')).toBe(true);
    expect(hasScope('FINANCE', 'order:view')).toBe(true);
    expect(hasScope('FINANCE', 'order:manage')).toBe(false);
    expect(hasScope('FINANCE', 'customer:view')).toBe(true);
    expect(hasScope('FINANCE', 'customer:manage')).toBe(false);
  });
});

// 平台运营身份与租户身份是两套命名空间（design/账号与权限.md R-账号与权限-004）：
describe('平台运营权限', () => {
  it('每个平台角色都有标签与 scope', () => {
    for (const role of PLATFORM_ROLES) {
      expect(PLATFORM_ROLE_LABELS[role]).toBeTruthy();
      expect(PLATFORM_ROLE_SCOPES[role].length).toBeGreaterThan(0);
    }
  });

  it('平台管理员拥有全部平台 scope', () => {
    expect(PLATFORM_ROLE_SCOPES.PLATFORM_ADMIN).toEqual(PLATFORM_SCOPES);
    expect(hasPlatformScope('PLATFORM_ADMIN', 'platform:tenant:manage')).toBe(true);
    expect(hasPlatformScope('PLATFORM_ADMIN', 'platform:account:manage')).toBe(true);
    expect(hasPlatformScope('PLATFORM_ADMIN', 'platform:audit:view')).toBe(true);
  });

  it('平台 manage 包含 tenant view，反之不成立', () => {
    expect(platformScopeSatisfied(['platform:tenant:manage'], 'platform:tenant:view')).toBe(true);
    expect(platformScopeSatisfied(['platform:tenant:view'], 'platform:tenant:manage')).toBe(false);
    expect(platformScopeSatisfied(['platform:account:manage'], 'platform:tenant:view')).toBe(false);
    expect(
      platformScopeSatisfied(['platform:audit:view'], 'platform:audit:manage' as PlatformScope),
    ).toBe(false);
  });

  it('租户角色不能获得平台 scope，平台角色不能获得租户 scope', () => {
    expect(isPlatformRole('ADMIN')).toBe(false);
    expect(hasPlatformScope('ADMIN', 'platform:tenant:view')).toBe(false);
    expect(hasScope('PLATFORM_ADMIN', 'order:view')).toBe(false);
  });

  it('未知平台角色无任何 scope', () => {
    expect(isPlatformRole('GUEST')).toBe(false);
    expect(hasPlatformScope(null, 'platform:tenant:view')).toBe(false);
    expect(hasPlatformScope('GUEST', 'platform:tenant:view')).toBe(false);
  });
});
