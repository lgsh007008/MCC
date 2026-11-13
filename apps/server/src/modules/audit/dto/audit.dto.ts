import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约形状（ADR-006）：审计日志只读响应；不暴露 payload 原文与敏感字段。

export class AuditLogItemDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String, description: 'ISO 时间' })
  createdAt!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorUsername?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  actorRole?: string | null;

  @ApiProperty({ type: String, description: '领域' })
  domain!: string;

  @ApiProperty({ type: String, description: '动作标识' })
  action!: string;

  @ApiPropertyOptional({ type: String, nullable: true, description: '中文动作名' })
  actionLabel?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  objectType?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  objectId?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: '业务编号快照' })
  objectCode?: string | null;

  @ApiProperty({ type: String, description: 'ok / failed（旧记录可能为状态码）' })
  result!: string;

  @ApiPropertyOptional({ type: Number, nullable: true })
  statusCode?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  errorCode?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  ip?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  userAgent?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  requestId?: string | null;
}

export class AuditLogListDto {
  @ApiProperty({ type: Number, description: '筛选后总数' })
  total!: number;

  @ApiProperty({ type: () => [AuditLogItemDto] })
  items!: AuditLogItemDto[];
}
