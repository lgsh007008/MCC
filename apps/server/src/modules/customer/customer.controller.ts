import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  customerBatchDeleteInputSchema,
  customerBatchStatusInputSchema,
  customerInputSchema,
  customerListQuerySchema,
  customerNameCheckQuerySchema,
  customerStatusInputSchema,
  customerUpdateSchema,
  type CustomerBatchDeleteInput,
  type CustomerBatchStatusInput,
  type CustomerInput,
  type CustomerListQuery,
  type CustomerNameCheckQuery,
  type CustomerStatusInput,
  type CustomerUpdateInput,
} from '@mcc/shared';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  CustomerBatchDeleteBodyDto,
  CustomerBatchDeleteResponseDto,
  CustomerBatchStatusBodyDto,
  CustomerBatchStatusResponseDto,
  CustomerBodyDto,
  CustomerDto,
  CustomerListDto,
  CustomerNameCheckDto,
  CustomerStatusBodyDto,
} from './dto/customer.dto.js';
import { CustomerService } from './customer.service.js';

// 接口清单与路径（design/customer.md §5）；契约由装饰器代码生成（ADR-006）。
@ApiTags('customers')
@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @ApiOperation({ summary: '客户列表：筛选（名称模糊、状态）+ 分页' })
  @ApiQuery({ name: 'name', required: false, type: String, description: '客户名称模糊' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'], type: String, description: '状态' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: '页码，默认 1' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: '每页条数，默认 20（最大 100）' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], type: String, description: '创建日期排序，默认 desc' })
  @ApiOkResponse({ type: CustomerListDto })
  list(@Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery): Promise<CustomerListDto> {
    return this.customerService.list(query);
  }

  // 注意：具体路径须声明在 :id 之前，否则会被 ParseUUIDPipe 当作 id 校验。
  @Get('name-check')
  @ApiOperation({ summary: '客户重名检查（只提示不阻断）' })
  @ApiQuery({ name: 'name', required: true, type: String, description: '客户名称' })
  @ApiQuery({ name: 'excludeId', required: false, type: String, description: '排除的客户 id（编辑时传自身）' })
  @ApiOkResponse({ type: CustomerNameCheckDto })
  nameCheck(
    @Query(new ZodValidationPipe(customerNameCheckQuerySchema)) query: CustomerNameCheckQuery,
  ): Promise<{ duplicate: boolean }> {
    return this.customerService.nameCheck(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '客户详情' })
  @ApiOkResponse({ type: CustomerDto })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerDto> {
    return this.customerService.detail(id);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: '新建客户（编号自动生成；重名只提示不阻断）' })
  @ApiBody({ type: CustomerBodyDto })
  @ApiCreatedResponse({ type: CustomerDto })
  create(@Body(new ZodValidationPipe(customerInputSchema)) body: CustomerInput): Promise<CustomerDto> {
    return this.customerService.create(body);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新客户（名称、联系信息、备注）' })
  @ApiBody({ type: CustomerBodyDto })
  @ApiOkResponse({ type: CustomerDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(customerUpdateSchema)) body: CustomerUpdateInput,
  ): Promise<CustomerDto> {
    return this.customerService.update(id, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: '启用 / 停用客户' })
  @ApiBody({ type: CustomerStatusBodyDto })
  @ApiOkResponse({ type: CustomerDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(customerStatusInputSchema)) body: CustomerStatusInput,
  ): Promise<CustomerDto> {
    return this.customerService.setStatus(id, body);
  }

  @Post('batch-status')
  @HttpCode(200)
  @ApiOperation({ summary: '批量启用 / 停用客户（已是目标状态或已删的跳过，返回实际变更条数）' })
  @ApiBody({ type: CustomerBatchStatusBodyDto })
  @ApiOkResponse({ type: CustomerBatchStatusResponseDto })
  setStatusMany(
    @Body(new ZodValidationPipe(customerBatchStatusInputSchema)) body: CustomerBatchStatusInput,
  ): Promise<{ updated: number }> {
    return this.customerService.setStatusMany(body);
  }

  @Post('batch-delete')
  @HttpCode(200)
  @ApiOperation({ summary: '批量删除客户（软删除；不存在 / 已删行静默跳过，返回删除条数）' })
  @ApiBody({ type: CustomerBatchDeleteBodyDto })
  @ApiOkResponse({ type: CustomerBatchDeleteResponseDto })
  removeMany(
    @Body(new ZodValidationPipe(customerBatchDeleteInputSchema)) body: CustomerBatchDeleteInput,
  ): Promise<{ deleted: number }> {
    return this.customerService.removeMany(body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: '删除客户（软删除，编号不回收）' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.customerService.remove(id);
  }
}
