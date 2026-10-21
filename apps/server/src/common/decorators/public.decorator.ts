import { SetMetadata } from '@nestjs/common';

// 免登录标记：标在 login / refresh 等公开接口上，全局鉴权守卫据此放行。
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);