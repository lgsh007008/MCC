import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { auditLogQuerySchema, type AuditLogQuery } from '@mcc/shared';
import { RequireScopes } from '../../common/decorators/require-scopes.decorator.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AuditService } from './audit.service.js';
import { AuditLogListDto } from './dto/audit.dto.js';

// 审计日志只读查询（design/审计日志.md §6）：仅管理员；无修改 / 删除接口。
@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequireScopes('audit:view')
  @ApiOperation({ summary: '审计日志列表：时间范围、操作人、领域、动作、结果 + 分页' })
  @ApiQuery({ name: 'dateFrom', required: false, type: String, description: '开始日期 YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, type: String, description: '结束日期 YYYY-MM-DD' })
  @ApiQuery({ name: 'actor', required: false, type: String, description: '操作人账号模糊' })
  @ApiQuery({ name: 'domain', required: false, type: String, description: '领域' })
  @ApiQuery({ name: 'action', required: false, type: String, description: '动作标识' })
  @ApiQuery({ name: 'result', required: false, type: String, enum: ['ok', 'failed'], description: '结果' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiOkResponse({ type: AuditLogListDto })
  list(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<AuditLogListDto> {
    return this.auditService.list(query);
  }
}
