import { LoggerService } from '@nestjs/common';
import pino from 'pino';
import type { DestinationStream, Level, Logger, LoggerOptions } from 'pino';
import pretty from 'pino-pretty';
import { requestContext } from './request-context.js';

// 结构化日志（技术方案 §9.2；ADR-010 薄适配层）：成熟库 pino 干真活，这里只做 Nest
// LoggerService 接线。CI/生产/test 输出纯 JSON 到 stdout，本地 dev 走 pino-pretty。
// 约定：日志不打请求体；密码/令牌字段有 pino redact 兜底打码。
const REDACT_PATHS = [
  '*.password',
  '*.oldPassword',
  '*.newPassword',
  '*.accessToken',
  '*.refreshToken',
  '*.authorization',
] as const;

const prettyEnabled =
  process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test' && !process.env.CI;

function prettyStream(): DestinationStream {
  return pretty({ colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' });
}

export class AppLogger implements LoggerService {
  private readonly logger: Logger;

  constructor() {
    const options: LoggerOptions = {
      name: 'mcc-server',
      level: process.env.LOG_LEVEL || 'info',
      redact: { paths: [...REDACT_PATHS], censor: '***' },
    };
    this.logger = prettyEnabled ? pino(options, prettyStream()) : pino(options);
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  private write(level: Level, message: unknown, optionalParams: unknown[]): void {
    const context = optionalParams.length > 0 ? optionalParams.at(-1) : undefined;
    const requestId = requestContext.getStore()?.requestId;
    const err = message instanceof Error ? message : undefined;
    const msg = err ? err.message : typeof message === 'string' ? message : JSON.stringify(message);
    this.logger[level]({ context, requestId, err }, msg);
  }
}