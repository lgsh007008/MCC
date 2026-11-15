import { API_PREFIX } from './api-prefix.js';

// 平台运营接口边界（design/平台布局.md §1.9 / design/账号与权限.md §6）：
// 租户身份与平台身份两条流水线按路径严格分流，守卫与拦截器共用同一判定。
export const OPS_PATH_PREFIX = `/${API_PREFIX}/ops`;

export function isOpsRequest(path: string): boolean {
  return path === OPS_PATH_PREFIX || path.startsWith(`${OPS_PATH_PREFIX}/`);
}
