import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// 守卫上下文注入的当前账号（技术方案 §8.2：前端不做安全判断，身份一律来自服务层解析）。
export interface AuthUser {
  userId: string;
  username: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      throw new Error('CurrentUser 依赖鉴权守卫注入的 user，请勿在公开接口使用');
    }
    return request.user;
  },
);