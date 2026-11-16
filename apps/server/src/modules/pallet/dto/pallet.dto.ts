import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 zod schema 为准（ZodValidationPipe），本文件只承载契约形状。

export class PalletComponentBodyDto {
  @ApiProperty({
    type: String,
    enum: ['topDeck', 'endDeck', 'stringerBoard', 'block', 'bottomDeck', 'stringer', 'runner', 'plywood', 'spacer', 'custom'],
    description: '构件类型',
  })
  role!: string;

  @ApiProperty({ type: String, description: '构件名称', example: '面板' })
  name!: string;

  @ApiProperty({ type: String, description: '材料 code', example: 'pine' })
  materialCode!: string;

  @ApiProperty({ type: String, enum: ['x', 'y'], description: '方向：x 沿长度 / y 沿宽度' })
  orientation!: 'x' | 'y';

  @ApiProperty({ type: Number, description: '长度（整数毫米）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（整数毫米）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '厚度（整数毫米）' })
  heightMm!: number;

  @ApiProperty({ type: Number, description: '数量（正整数）' })
  quantity!: number;

  @ApiPropertyOptional({ type: Number, description: '损耗比例，0.08 表示 8%', default: 0.08 })
  wastePct?: number;

  @ApiPropertyOptional({ type: Number, description: '加工费（元/件）', default: 0 })
  processCost?: number;

  @ApiPropertyOptional({ type: Number, description: '单价覆盖（元/m³），0 表示使用材料单价', default: 0 })
  priceOverride?: number;
}

export class PalletProjectBodyDto {
  @ApiProperty({ type: String, description: '项目名称', example: '1200×800 出口实木托盘' })
  name!: string;

  @ApiPropertyOptional({ type: String, description: '客户名称快照', default: '' })
  customerName?: string;

  @ApiProperty({
    type: String,
    enum: ['block', 'stringer', 'notched', 'skid', 'plywood', 'custom'],
    description: '结构模板',
  })
  templateType!: string;

  @ApiPropertyOptional({ type: String, enum: ['export', 'domestic'], description: '使用范围', default: 'domestic' })
  destination?: 'export' | 'domestic';

  @ApiPropertyOptional({ type: String, enum: ['4', '2'], description: '进叉方向', default: '4' })
  entryDirection?: '4' | '2';

  @ApiProperty({ type: Number, description: '外形长度（整数毫米）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '外形宽度（整数毫米）' })
  widthMm!: number;

  @ApiPropertyOptional({ type: Number, description: '目标载荷（kg）', nullable: true })
  targetLoadKg?: number | null;

  @ApiPropertyOptional({ type: String, enum: ['uniform', 'concentrated'], description: '载荷形式', default: 'uniform' })
  loadType?: 'uniform' | 'concentrated';

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: () => [PalletComponentBodyDto], description: '构件列表（从上到下）' })
  components!: PalletComponentBodyDto[];
}

export class PalletComponentDto {
  @ApiProperty({ type: String, description: '构件 id' })
  id!: string;

  @ApiProperty({ type: Number, description: '行序（从 1 开始）' })
  seq!: number;

  @ApiProperty({ type: String, description: '构件类型' })
  role!: string;

  @ApiProperty({ type: String, description: '构件名称' })
  name!: string;

  @ApiProperty({ type: String, description: '材料 code' })
  materialCode!: string;

  @ApiProperty({ type: String, description: '方向' })
  orientation!: string;

  @ApiProperty({ type: Number, description: '长度（mm）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（mm）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '厚度（mm）' })
  heightMm!: number;

  @ApiProperty({ type: Number, description: '数量' })
  quantity!: number;

  @ApiProperty({ type: Number, description: '损耗比例' })
  wastePct!: number;

  @ApiProperty({ type: Number, description: '加工费（元/件）' })
  processCost!: number;

  @ApiProperty({ type: Number, description: '单价覆盖（元/m³）' })
  priceOverride!: number;
}

export class PalletProjectDto {
  @ApiProperty({ type: String, description: '项目 id' })
  id!: string;

  @ApiProperty({ type: String, description: '项目编号（PD-#####）' })
  code!: string;

  @ApiProperty({ type: String, description: '项目名称' })
  name!: string;

  @ApiProperty({ type: String, description: '客户名称快照' })
  customerName!: string;

  @ApiProperty({ type: String, description: '结构模板' })
  templateType!: string;

  @ApiProperty({ type: String, description: '使用范围' })
  destination!: string;

  @ApiProperty({ type: String, description: '进叉方向' })
  entryDirection!: string;

  @ApiProperty({ type: Number, description: '外形长度（mm）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '外形宽度（mm）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '外形高度（mm）' })
  totalHeightMm!: number;

  @ApiProperty({ type: Number, nullable: true, description: '目标载荷（kg）' })
  targetLoadKg!: number | null;

  @ApiProperty({ type: String, description: '载荷形式' })
  loadType!: string;

  @ApiProperty({ type: String, description: '木材净体积（m³，5 位小数）' })
  totalVolumeM3!: string;

  @ApiProperty({ type: String, description: '估算重量（kg，1 位小数）' })
  totalWeightKg!: string;

  @ApiProperty({ type: String, description: '材料费（元，2 位小数）' })
  materialCost!: string;

  @ApiProperty({ type: String, description: '加工费（元，2 位小数）' })
  processingCost!: string;

  @ApiProperty({ type: String, description: '备注' })
  note!: string;

  @ApiProperty({ type: String, description: '创建时间（ISO）' })
  createdAt!: string;

  @ApiProperty({ type: String, description: '更新时间（ISO）' })
  updatedAt!: string;

  @ApiProperty({ type: () => [PalletComponentDto], description: '构件列表' })
  components!: PalletComponentDto[];
}

export class PalletProjectListItemDto {
  @ApiProperty({ type: String, description: '项目 id' })
  id!: string;

  @ApiProperty({ type: String, description: '项目编号' })
  code!: string;

  @ApiProperty({ type: String, description: '项目名称' })
  name!: string;

  @ApiProperty({ type: String, description: '客户名称快照' })
  customerName!: string;

  @ApiProperty({ type: String, description: '结构模板' })
  templateType!: string;

  @ApiProperty({ type: Number, description: '外形长度（mm）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '外形宽度（mm）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '外形高度（mm）' })
  totalHeightMm!: number;

  @ApiProperty({ type: String, description: '木材净体积（m³）' })
  totalVolumeM3!: string;

  @ApiProperty({ type: String, description: '估算重量（kg）' })
  totalWeightKg!: string;

  @ApiProperty({ type: String, description: '更新时间（ISO）' })
  updatedAt!: string;
}

export class PalletProjectListDto {
  @ApiProperty({ type: Number, description: '总数' })
  total!: number;

  @ApiProperty({ type: () => [PalletProjectListItemDto] })
  items!: PalletProjectListItemDto[];
}

export class PalletMaterialDto {
  @ApiProperty({ type: String, description: '材料 code' })
  code!: string;

  @ApiProperty({ type: String, description: '材料名称' })
  name!: string;

  @ApiProperty({ type: Number, description: '密度（kg/m³）' })
  densityKgM3!: number;

  @ApiProperty({ type: String, description: '采购单价（元/m³）' })
  pricePerM3!: string;

  @ApiProperty({ type: Boolean, description: '出口是否通常需要熏蒸' })
  fumigation!: boolean;

  @ApiProperty({ type: String, description: '图纸颜色' })
  color!: string;
}
