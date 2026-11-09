import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@mcc/db';
import { tenantExtension } from './prisma-tenant.extension.js';

// 服务内唯一的 PrismaClient（技术方案 §1.2：server 是唯一访问数据库的进程）。
// ADR-005：租户条件附加集中在 tenantExtension，本服务对外即扩展后的 client，
// 调用方经 `prisma.client` 访问，无法绕过租户过滤。
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient().$extends(tenantExtension) as unknown as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}