import { z } from 'zod';
import { paginationQuerySchema } from '../../pagination.schemas';

// 托盘单元的边界校验（design/包装设计.md §4）：
// 前后端共用同一份；几何、BOM 与校验纯函数只依赖本文件的类型。

export const palletTemplateTypeSchema = z.enum([
  'block',
  'stringer',
  'notched',
  'skid',
  'plywood',
  'custom',
]);
export type PalletTemplateType = z.infer<typeof palletTemplateTypeSchema>;

export const palletComponentRoleSchema = z.enum([
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
export type PalletComponentRole = z.infer<typeof palletComponentRoleSchema>;

export const palletOrientationSchema = z.enum(['x', 'y']);
export type PalletOrientation = z.infer<typeof palletOrientationSchema>;

export const palletDestinationSchema = z.enum(['export', 'domestic']);
export type PalletDestination = z.infer<typeof palletDestinationSchema>;

export const palletLoadTypeSchema = z.enum(['uniform', 'concentrated']);
export type PalletLoadType = z.infer<typeof palletLoadTypeSchema>;

export const palletEntryDirectionSchema = z.enum(['4', '2']);
export type PalletEntryDirection = z.infer<typeof palletEntryDirectionSchema>;

export const palletComponentInputSchema = z.object({
  role: palletComponentRoleSchema,
  name: z.string().trim().min(1, '构件名称必填').max(50, '构件名称最多 50 字'),
  materialCode: z.string().trim().min(1, '材料必填').max(50),
  orientation: palletOrientationSchema,
  lengthMm: z.number().int('长度须为整数毫米').positive('长度须大于 0').max(10000),
  widthMm: z.number().int('宽度须为整数毫米').positive('宽度须大于 0').max(10000),
  heightMm: z.number().int('厚度须为整数毫米').positive('厚度须大于 0').max(10000),
  quantity: z.number().int('数量须为整数').positive('数量须大于 0').max(200),
  wastePct: z.number().min(0, '损耗不能为负').max(1, '损耗不能超过 100%').default(0.08),
  processCost: z.number().min(0).max(1_000_000).default(0),
  priceOverride: z.number().min(0).max(1_000_000).default(0),
});
export type PalletComponentInput = z.infer<typeof palletComponentInputSchema>;

export const palletProjectInputSchema = z.object({
  name: z.string().trim().min(1, '项目名称必填').max(100, '项目名称最多 100 字'),
  customerName: z.string().trim().max(100, '客户名称最多 100 字').default(''),
  templateType: palletTemplateTypeSchema,
  destination: palletDestinationSchema.default('domestic'),
  entryDirection: palletEntryDirectionSchema.default('4'),
  lengthMm: z.number().int('长度须为整数毫米').positive('长度须大于 0').max(10000),
  widthMm: z.number().int('宽度须为整数毫米').positive('宽度须大于 0').max(10000),
  targetLoadKg: z.number().int('目标载荷须为整数').positive('目标载荷须大于 0').max(100000).nullable().optional(),
  loadType: palletLoadTypeSchema.default('uniform'),
  note: z.string().trim().max(500, '备注最多 500 字').default(''),
  components: z.array(palletComponentInputSchema).min(1, '至少需要一个构件').max(100, '构件最多 100 项'),
});
export type PalletProjectInput = z.infer<typeof palletProjectInputSchema>;

export const palletListQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().max(100).optional(),
  templateType: palletTemplateTypeSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type PalletListQuery = z.infer<typeof palletListQuerySchema>;

export interface PalletMaterialLike {
  code: string;
  name: string;
  densityKgM3: number;
  pricePerM3: number;
  fumigation: boolean;
  color: string;
}
