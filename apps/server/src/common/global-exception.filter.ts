import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';

// 全局异常兜底（技术方案 §6.4 统一错误体）：HttpException（含守卫、管道、控制器抛出的）
// 保留各自已构造的统一错误体原样返回；未预期的异常统一收敛为 500 统一错误体，
// 堆栈与内部细节只进服务端日志，不下发客户端（禁止泄露内部异常栈或数据库信息）。
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }
    this.logger.error(
      exception instanceof Error ? (exception.stack ?? exception.message) : String(exception),
    );
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ code: 'INTERNAL_ERROR', message: '服务器内部错误' });
  }
}