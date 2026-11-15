import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { platformAuditLogQuerySchema, type PlatformAuditLogQuery } from '@mcc/shared';
import { RequirePlatformScopes } from '../../common/decorators/require-platform-scopes.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PlatformAuditLogListDto } from './dto/platform-audit.dto.js';
import { PlatformAuditService } from './platform-audit.service.js';

// 平台运营审计只读查询（design/审计日志.md §9）：仅 platform:audit:view；无修改 / 删除 / 导出。
@ApiTags('ops-audit-logs')
@Controller('ops/audit-logs')
export class PlatformAuditController {
  constructor(private readonly platformAuditService: PlatformAuditService) {}

  @Get()
  @RequirePlatformScopes('platform:audit:view')
  @ApiOperation({ summary: '平台审计列表：时间范围、操作人、动作、目标租户、结果 + 分页' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '开始日期 YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '结束日期 YYYY-MM-DD' })
  @ApiQuery({ name: 'actor', required: false, type: String, description: '操作人账号模糊' })
  @ApiQuery({ name: 'action', required: false, type: String, description: '动作标识' })
  @ApiQuery({ name: 'targetTenant', required: false, type: String, description: '目标租户编号/名称模糊' })
  @ApiQuery({ name: 'result', required: false, type: String, enum: ['ok', 'failed'], description: '结果' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: PlatformAuditLogListDto })
  list(
    @Query(new ZodValidationPipe(platformAuditLogQuerySchema)) query: PlatformAuditLogQuery,
  ): Promise<PlatformAuditLogListDto> {
    return this.platformAuditService.list(query);
  }
}
