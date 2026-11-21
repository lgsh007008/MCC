import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// OpenAPI 契约的请求/响应形状（ADR-006：契约由装饰器代码生成）。
// 运行时校验以 @mcc/shared 的 packaging schemas 为准（ZodValidationPipe），本文件只承载契约形状。

export class PackagingPartBodyDto {
  @ApiProperty({
    type: String,
    enum: ['topDeck', 'endDeck', 'stringerBoard', 'block', 'bottomDeck', 'stringer', 'runner', 'plywood', 'spacer', 'panel', 'frame', 'batten', 'steelStrap', 'dunnage', 'custom'],
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

export class PackagingUnitBodyDto {
  @ApiProperty({
    type: String,
    enum: ['PALLET', 'CRATE', 'SKID', 'FRAME', 'DIVIDER', 'DUNNAGE', 'STEEL_STRAP'],
    description: '单元类型',
    default: 'PALLET',
  })
  unitType!: string;

  @ApiProperty({ type: String, description: '模板 code', example: 'block' })
  templateCode!: string;

  @ApiProperty({ type: String, description: '单元名称', example: '1200×800 出口托盘' })
  name!: string;

  @ApiProperty({ type: Number, description: '长度（整数毫米）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（整数毫米）' })
  widthMm!: number;

  @ApiPropertyOptional({ type: Number, description: '目标载荷（kg）', nullable: true })
  targetLoadKg?: number | null;

  @ApiPropertyOptional({ type: String, enum: ['uniform', 'concentrated'], description: '载荷形式', default: 'uniform' })
  loadType?: 'uniform' | 'concentrated';

  @ApiPropertyOptional({ type: Object, additionalProperties: true, description: '单元类型特有参数，如进叉方向、板厚', default: {} })
  params?: Record<string, unknown>;

  @ApiProperty({ type: () => [PackagingPartBodyDto], description: '构件列表（从上到下）' })
  parts!: PackagingPartBodyDto[];
}

export class PackagingProjectBodyDto {
  @ApiProperty({ type: String, description: '方案名称', example: '出口包装方案' })
  name!: string;

  @ApiPropertyOptional({ type: String, description: '客户名称快照', default: '' })
  customerName?: string;

  @ApiPropertyOptional({ type: String, enum: ['export', 'domestic'], description: '使用范围', default: 'domestic' })
  destination?: 'export' | 'domestic';

  @ApiPropertyOptional({ type: String, description: '备注', default: '' })
  note?: string;

  @ApiProperty({ type: () => [PackagingUnitBodyDto], description: '单元列表（1..n）' })
  units!: PackagingUnitBodyDto[];
}

export class PackagingPartDto {
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

export class PackagingUnitDto {
  @ApiProperty({ type: String, description: '单元 id' })
  id!: string;

  @ApiProperty({ type: Number, description: '方案内行序' })
  seq!: number;

  @ApiProperty({ type: String, description: '单元类型' })
  unitType!: string;

  @ApiProperty({ type: String, description: '模板 code' })
  templateCode!: string;

  @ApiProperty({ type: String, description: '单元名称' })
  name!: string;

  @ApiProperty({ type: Number, description: '长度（mm）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '宽度（mm）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '高度（mm）' })
  totalHeightMm!: number;

  @ApiProperty({ type: Number, nullable: true, description: '目标载荷（kg）' })
  targetLoadKg!: number | null;

  @ApiProperty({ type: String, description: '载荷形式' })
  loadType!: string;

  @ApiProperty({ type: Object, additionalProperties: true, description: '单元类型特有参数' })
  params!: Record<string, unknown>;

  @ApiProperty({ type: String, description: '净体积（m³，5 位小数）' })
  totalVolumeM3!: string;

  @ApiProperty({ type: String, description: '估算重量（kg，1 位小数）' })
  totalWeightKg!: string;

  @ApiProperty({ type: String, description: '材料费（元，2 位小数）' })
  materialCost!: string;

  @ApiProperty({ type: String, description: '加工费（元，2 位小数）' })
  processingCost!: string;

  @ApiProperty({ type: () => [PackagingPartDto], description: '构件列表' })
  parts!: PackagingPartDto[];
}

export class PackagingProjectDto {
  @ApiProperty({ type: String, description: '方案 id' })
  id!: string;

  @ApiProperty({ type: String, description: '方案编号（PD-#####）' })
  code!: string;

  @ApiProperty({ type: String, description: '方案名称' })
  name!: string;

  @ApiProperty({ type: String, description: '客户名称快照' })
  customerName!: string;

  @ApiProperty({ type: String, description: '使用范围' })
  destination!: string;

  @ApiProperty({ type: String, description: '状态：DRAFT / ISSUED / ARCHIVED' })
  status!: string;

  @ApiProperty({ type: Number, description: '当前版本号' })
  currentRevision!: number;

  @ApiProperty({ type: String, description: '净体积（m³，5 位小数）' })
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

  @ApiProperty({ type: () => [PackagingUnitDto], description: '单元列表' })
  units!: PackagingUnitDto[];
}

export class PackagingProjectListItemDto {
  @ApiProperty({ type: String, description: '方案 id' })
  id!: string;

  @ApiProperty({ type: String, description: '方案编号' })
  code!: string;

  @ApiProperty({ type: String, description: '方案名称' })
  name!: string;

  @ApiProperty({ type: String, description: '客户名称快照' })
  customerName!: string;

  @ApiProperty({ type: String, description: '首个单元类型' })
  unitType!: string;

  @ApiProperty({ type: Number, description: '单元数' })
  unitCount!: number;

  @ApiProperty({
    type: () => PackagingUnitDto,
    nullable: true,
    description: '首个单元（方案库缩略图用）',
  })
  firstUnit!: PackagingUnitDto | null;

  @ApiProperty({ type: Number, description: '首单元长度（mm）' })
  lengthMm!: number;

  @ApiProperty({ type: Number, description: '首单元宽度（mm）' })
  widthMm!: number;

  @ApiProperty({ type: Number, description: '首单元高度（mm）' })
  totalHeightMm!: number;

  @ApiProperty({ type: String, description: '净体积（m³）' })
  totalVolumeM3!: string;

  @ApiProperty({ type: String, description: '估算重量（kg）' })
  totalWeightKg!: string;

  @ApiProperty({ type: String, description: '状态' })
  status!: string;

  @ApiProperty({ type: String, description: '更新时间（ISO）' })
  updatedAt!: string;
}

export class PackagingProjectListDto {
  @ApiProperty({ type: Number, description: '总数' })
  total!: number;

  @ApiProperty({ type: () => [PackagingProjectListItemDto] })
  items!: PackagingProjectListItemDto[];
}

export class PackagingMaterialDto {
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

  @ApiProperty({ type: [String], description: '适用单元类型；空数组表示全部可用' })
  applicableUnitTypes!: string[];
}

export class PackagingTemplateDto {
  @ApiProperty({ type: String, description: '模板 code' })
  code!: string;

  @ApiProperty({ type: String, description: '单元类型' })
  unitType!: string;

  @ApiProperty({ type: String, description: '模板名称' })
  name!: string;

  @ApiProperty({ type: Number, description: '模板结构版本' })
  schemaVersion!: number;

  @ApiProperty({ type: Object, additionalProperties: true, description: '模板定义' })
  definition!: Record<string, unknown>;
}

export class PackagingRevisionDto {
  @ApiProperty({ type: Number, description: '版本号' })
  revisionNo!: number;

  @ApiProperty({ type: String, description: '发布时间（ISO）' })
  issuedAt!: string;

  @ApiProperty({ type: String, description: '发布人' })
  issuedBy!: string;

  @ApiProperty({ type: String, description: '备注' })
  note!: string;

  @ApiProperty({ type: String, description: '净体积（m³）' })
  totalVolumeM3!: string;

  @ApiProperty({ type: String, description: '估算重量（kg）' })
  totalWeightKg!: string;

  @ApiProperty({ type: String, description: '材料费（元）' })
  materialCost!: string;

  @ApiProperty({ type: String, description: '加工费（元）' })
  processingCost!: string;
}

export class PackagingRevisionListDto {
  @ApiProperty({ type: Number, description: '总数' })
  total!: number;

  @ApiProperty({ type: () => [PackagingRevisionDto] })
  items!: PackagingRevisionDto[];
}

export class PackagingRevisionDetailDto extends PackagingRevisionDto {
  @ApiProperty({ type: Object, additionalProperties: true, description: '版本快照' })
  snapshot!: Record<string, unknown>;
}

export class PackagingPrintEventBodyDto {
  @ApiPropertyOptional({ type: Number, nullable: true, description: '打印的版本号；当前版本不传' })
  revisionNo?: number | null;
}

export class PackagingExportEventBodyDto {
  @ApiProperty({
    type: String,
    enum: ['svg_view', 'svg_sheet', 'dxf', 'csv_bom', 'csv_cutting', 'obj', 'stl'],
    description: '导出格式',
  })
  format!: string;

  @ApiPropertyOptional({
    type: String,
    enum: ['top', 'front', 'side', 'iso'],
    description: 'SVG 视图；仅 format = svg_view 时必填',
  })
  view?: string;

  @ApiPropertyOptional({ type: Number, nullable: true, description: '导出的版本号；当前版本不传' })
  revisionNo?: number | null;

  @ApiPropertyOptional({ type: String, description: '单元图号，如 PD-00001-U01' })
  unitCode?: string;
}

export class PackagingOutputEventDto {
  @ApiProperty({ type: String, description: '方案 id' })
  id!: string;

  @ApiProperty({ type: String, description: '方案编号（PD-#####）' })
  code!: string;
}
