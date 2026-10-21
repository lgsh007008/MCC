import type { Middleware } from 'openapi-fetch';
import { createApiClient } from '@mcc/shared';
import { authSession } from './auth/session';

// 类型化 API client（ADR-006：契约由 openapi.json 生成）：
// baseUrl 为空串——浏览器端经 Next rewrites 同源访问 /api/v1/*。
export const api = createApiClient('');

// 登录态静默恢复：并发 401 只触发一次 refresh（design/账号与权限.md §7）。
let refreshPromise: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const { data, response } = await api.POST('/api/v1/auth/refresh', {});
      if (response.ok && data) {
        authSession.set(data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = authSession.get();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
  async onResponse({ request, response }) {
    // 登录页以外的业务请求遇 401：先静默刷新，再用新令牌重放一次；
    // 刷新失败则清会话并跳登录页（design/账号与权限.md §7 前端实现节）。
    const isAuthApi = new URL(request.url).pathname.startsWith('/api/v1/auth');
    if (response.status !== 401 || isAuthApi) {
      return response;
    }
    const refreshed = await refreshSession();
    if (!refreshed) {
      authSession.clear();
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
      return response;
    }
    const retried = request.clone();
    retried.headers.set('Authorization', `Bearer ${authSession.get() ?? ''}`);
    return fetch(retried);
  },
};

api.use(authMiddleware);