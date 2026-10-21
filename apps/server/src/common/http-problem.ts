import { HttpException } from '@nestjs/common';

// 统一错误体（技术方案 §6.4）：code（机器可读）+ message（中文人可读）+ details。
// 各处禁止返回内部异常栈或数据库信息。
export function problem(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): HttpException {
  return new HttpException({ code, message, details }, status);
}