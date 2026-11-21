import { z } from 'zod';
import { paginationQuerySchema } from './pagination.schemas';
import type { PalletMaterialLike } from './design/pallet/schemas';

// 包装设计领域的边界校验（design/包装设计.md §3 / §7）：
// 方案 → 单元 → 构件三层；前后端共用同一份。

export const packagingUnitTypeSchema = z.enum([
  'PALLET',
  'CRATE',
  'SKID',
  'FRAME',
  'DIVIDER',
  'DUNNAGE',
  'STEEL_STRAP',
]);
export type PackagingUnitType = z.infer<typeof packagingUnitTypeSchema>;

export const packagingProjectStatusSchema = z.enum(['DRAFT', 'ISSUED', 'ARCHIVED']);
export type PackagingProjectStatus = z.infer<typeof packagingProjectStatusSchema>;

export const packagingPartRoleSchema = z.enum([
  'topDeck',
  'endDeck',
  'stringerBoard',
  'block',
  'bottomDeck',
  'stringer',
  'runner',
  'plywood',
  'spacer',
  'panel',
  'frame',
  'batten',
  'steelStrap',
  'dunnage',
  'custom',
]);
export type PackagingPartRole = z.infer<typeof packagingPartRoleSchema>;

export const packagingOrientationSchema = z.enum(['x', 'y']);
export type PackagingOrientation = z.infer<typeof packagingOrientationSchema>;

export const packagingDestinationSchema = z.enum(['export', 'domestic']);
export type PackagingDestination = z.infer<typeof packagingDestinationSchema>;

export const packagingLoadTypeSchema = z.enum(['uniform', 'concentrated']);
export type PackagingLoadType = z.infer<typeof packagingLoadTypeSchema>;

export const packagingPartInputSchema = z.object({
  role: packagingPartRoleSchema,
  name: z.string().trim().min(1, '构件名称必填').max(50, '构件名称最多 50 字'),
  materialCode: z.string().trim().min(1, '材料必填').max(50),
  orientation: packagingOrientationSchema,
  lengthMm: z.number().int('长度须为整数毫米').positive('长度须大于 0').max(20000),
  widthMm: z.number().int('宽度须为整数毫米').positive('宽度须大于 0').max(20000),
  heightMm: z.number().int('厚度须为整数毫米').positive('厚度须大于 0').max(20000),
  quantity: z.number().int('数量须为整数').positive('数量须大于 0').max(500),
  wastePct: z.number().min(0, '损耗不能为负').max(1, '损耗不能超过 100%').default(0.08),
  processCost: z.number().min(0).max(1_000_000).default(0),
  priceOverride: z.number().min(0).max(1_000_000).default(0),
});
export type PackagingPartInput = z.infer<typeof packagingPartInputSchema>;

export const packagingUnitInputSchema = z.object({
  unitType: packagingUnitTypeSchema.default('PALLET'),
  templateCode: z.string().trim().min(1, '模板必填').max(50),
  name: z.string().trim().min(1, '单元名称必填').max(100, '单元名称最多 100 字'),
  lengthMm: z.number().int('长度须为整数毫米').positive('长度须大于 0').max(20000),
  widthMm: z.number().int('宽度须为整数毫米').positive('宽度须大于 0').max(20000),
  targetLoadKg: z.number().int('目标载荷须为整数').positive('目标载荷须大于 0').max(100000).nullable().optional(),
  loadType: packagingLoadTypeSchema.default('uniform'),
  params: z.record(z.string(), z.unknown()).default({}),
  parts: z.array(packagingPartInputSchema).min(1, '至少需要一个构件').max(200, '构件最多 200 项'),
});
export type PackagingUnitInput = z.infer<typeof packagingUnitInputSchema>;

export const packagingProjectInputSchema = z.object({
  name: z.string().trim().min(1, '方案名称必填').max(100, '方案名称最多 100 字'),
  customerName: z.string().trim().max(100, '客户名称最多 100 字').default(''),
  destination: packagingDestinationSchema.default('domestic'),
  note: z.string().trim().max(500, '备注最多 500 字').default(''),
  units: z.array(packagingUnitInputSchema).min(1, '至少需要一个单元').max(20, '单元最多 20 个'),
});
export type PackagingProjectInput = z.infer<typeof packagingProjectInputSchema>;

export const packagingListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).optional(),
  unitType: packagingUnitTypeSchema.optional(),
  status: packagingProjectStatusSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type PackagingListQuery = z.infer<typeof packagingListQuerySchema>;

// 输出审计（product/审计日志.md R-审计-001；design/包装设计.md §7）：
// 打印 / 导出为客户端行为，由领域专用事件端点记录，只记录用户触发，不保证文件落盘。
export const packagingExportFormatSchema = z.enum([
  'svg_view',
  'svg_sheet',
  'dxf',
  'csv_bom',
  'csv_cutting',
  'obj',
  'stl',
]);
export type PackagingExportFormat = z.infer<typeof packagingExportFormatSchema>;

export const packagingExportViewSchema = z.enum(['top', 'front', 'side', 'iso']);
export type PackagingExportView = z.infer<typeof packagingExportViewSchema>;

export const packagingPrintEventSchema = z.object({
  revisionNo: z.number().int().positive().nullable().optional(),
});
export type PackagingPrintEventInput = z.infer<typeof packagingPrintEventSchema>;

export const packagingExportEventSchema = z
  .object({
    format: packagingExportFormatSchema,
    view: packagingExportViewSchema.optional(),
    revisionNo: z.number().int().positive().nullable().optional(),
    unitCode: z.string().trim().max(50).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.format === 'svg_view' && !value.view) {
      ctx.addIssue({
        code: 'custom',
        message: 'SVG 视图导出必须指定视图',
        path: ['view'],
      });
    }
    if (value.format !== 'svg_view' && value.view) {
      ctx.addIssue({
        code: 'custom',
        message: '仅 SVG 视图导出可指定视图',
        path: ['view'],
      });
    }
  });
export type PackagingExportEventInput = z.infer<typeof packagingExportEventSchema>;

export interface PackagingMaterialLike extends PalletMaterialLike {
  applicableUnitTypes: string[];
}
