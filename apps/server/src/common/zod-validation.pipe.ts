import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

// 服务层边界的 zod 校验管道（技术方案 §8.4）：
// schema 定义在 @mcc/shared（前后端共用），本管道只负责执行与错误成形。
// 用法：@Body(new ZodValidationPipe(loginSchema)) body: LoginInput
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    // POST 无 body（如 refresh/logout）时 NestJS 传 undefined，按空对象校验
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: '请求参数不合法',
        details: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}