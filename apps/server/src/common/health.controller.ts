import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator.js';

// 系统探活端点（技术方案 §9.5）：不校验登录态，供外部监控使用。
@ApiTags('system')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  @ApiOperation({ summary: '健康检查', description: '外部探活使用，不校验登录态', security: [] })
  @ApiOkResponse({ description: '服务存活' })
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
