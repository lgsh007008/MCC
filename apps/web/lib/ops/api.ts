import type { Middleware } from 'openapi-fetch';
import { createApiClient } from '@mcc/shared';
import { opsSession } from './session';

// 平台运营 API client（design/账号与权限.md §7）：
// baseUrl 为空串，经 Next rewrites 同源访问；刷新令牌走 ops_refresh_token（Path /api/v1/ops）。
export const opsApi = createApiClient('');

let refreshPromise: Promise<boolean> | null = null;

export async function refreshOpsSession(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const { data, response } = await opsApi.POST('/api/v1/ops/auth/refresh', { body: {} });
      if (response.ok && data) {
        opsSession.set(data.accessToken);
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

const opsAuthMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = opsSession.get();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    return request;
  },
  async onResponse({ request, response }) {
    const path = new URL(request.url).pathname;
    // 平台登录 / 刷新接口自身 401 不触发重试，避免循环
    if (
      response.status !== 401 ||
      path.startsWith('/api/v1/ops/auth/login') ||
      path.startsWith('/api/v1/ops/auth/refresh')
    ) {
      return response;
    }
    const refreshed = await refreshOpsSession();
    if (!refreshed) {
      opsSession.clear();
      if (typeof window !== 'undefined') {
        window.location.assign('/ops/login');
      }
      return response;
    }
    const retried = request.clone();
    retried.headers.set('Authorization', `Bearer ${opsSession.get() ?? ''}`);
    return fetch(retried);
  },
};

opsApi.use(opsAuthMiddleware);
