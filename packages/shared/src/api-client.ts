import createClient from 'openapi-fetch';
import type { paths } from './gen/api';

// 类型化 API client 工厂（ADR-006 契约生成链的消费端）：
// 契约类型由 openapi.json 生成，禁止手写接口定义。
// 各端（web / miniapp / agent）各自创建实例；登录态刷新、重试等端侧行为由调用端包装。
export function createApiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}

export type ApiPaths = paths;