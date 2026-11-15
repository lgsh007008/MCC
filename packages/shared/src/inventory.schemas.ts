import { z } from 'zod';
import { dateStringSchema } from './date.schemas';
import { paginationQuerySchema } from './pagination.schemas';

// 库存期初 / 盘点（product/生产与库存.md R-生产-002 / R-生产-003）：
// 期初录入数量与金额；盘点录入实盘数量，差异与金额由服务端按当前成本计算。

const quantityRe = /^\d+(\.\d{1,4})?$/;
const tonsRe = /^\d+(\.\d{1,3})?$/;
const amountRe = /^\d+(\.\d{1,2})?$/;
const unitCostRe = /^\d+(\.\d{1,6})?$/;

const nonNegativeQuantity = (label: string) =>
  z.string().regex(quantityRe, `${label}须为非负数、最多 4 位小数`);
const nonNegativeTons = (label: string) =>
  z.string().regex(tonsRe, `${label}须为非负数、最多 3 位小数`);
const nonNegativeAmount = (label: string) =>
  z.string().regex(amountRe, `${label}须为非负数、最多 2 位小数`);
const nonNegativeUnitCost = z
  .string()
  .regex(unitCostRe, '单位成本须为非负数、最多 6 位小数');

const timberDimensions = {
  lengthMm: z.coerce.number().int('长度须为整数毫米').min(1, '长度必须大于 0').max(20000),
  widthMm: z.coerce.number().int('宽度须为整数毫米').min(1, '宽度必须大于 0').max(5000),
  heightMm: z.coerce.number().int('高度须为整数毫米').min(1, '高度必须大于 0').max(1000),
};

// ── 期初 ──────────────────────────────────────────────

const openingRawSchema = z
  .object({
    quantity: nonNegativeTons('期初原木吨数'),
    unitCost: nonNegativeUnitCost.optional(),
    amount: nonNegativeAmount('期初原木金额').optional(),
  })
  .refine((value) => value.unitCost !== undefined || value.amount !== undefined, {
    message: '期初原木须填写单位成本或金额',
    path: ['amount'],
  });

const openingTimberSchema = z
  .object({
    ...timberDimensions,
    quantity: nonNegativeQuantity('期初方木方数'),
    unitCost: nonNegativeUnitCost.optional(),
    amount: nonNegativeAmount('期初方木金额').optional(),
  })
  .refine((value) => value.unitCost !== undefined || value.amount !== undefined, {
    message: '期初方木须填写单位成本或金额',
    path: ['amount'],
  });

export const inventoryOpeningInputSchema = z.object({
  openingDate: dateStringSchema('期初日期'),
  note: z.string().trim().max(500).default(''),
  rawLog: openingRawSchema,
  timber: z.array(openingTimberSchema).max(200),
});
export type InventoryOpeningInput = z.infer<typeof inventoryOpeningInputSchema>;

// ── 盘点 ──────────────────────────────────────────────

export const inventoryAdjustmentReasonSchema = z.enum([
  'measurement',
  'missing',
  'damage',
  'other',
]);
export type InventoryAdjustmentReasonValue = z.infer<typeof inventoryAdjustmentReasonSchema>;

export const inventoryTargetTypeSchema = z.enum(['raw_log', 'timber']);
export type InventoryTargetTypeValue = z.infer<typeof inventoryTargetTypeSchema>;

const countReason = inventoryAdjustmentReasonSchema.optional();

const countRawSchema = z.object({
  actualQuantity: nonNegativeTons('原木实盘吨数').optional(),
  reason: countReason,
});

const countTimberSchema = z.object({
  ...timberDimensions,
  actualQuantity: nonNegativeQuantity('方木实盘方数').optional(),
  reason: countReason,
});

const countBase = {
  countDate: dateStringSchema('盘点日期'),
  note: z.string().trim().max(500).default(''),
};

// 一张盘点单只盘一类库存（product/生产与库存.md R-生产-003）
export const inventoryCountInputSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('raw_log'),
    ...countBase,
    rawLog: countRawSchema,
  }),
  z.object({
    targetType: z.literal('timber'),
    ...countBase,
    timber: z.array(countTimberSchema).max(200),
  }),
]);
export type InventoryCountInput = z.infer<typeof inventoryCountInputSchema>;

export const inventoryAdjustmentResultSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: z.enum(['opening', 'count']),
  adjustmentDate: z.string(),
});
export type InventoryAdjustmentResult = z.infer<typeof inventoryAdjustmentResultSchema>;

export const inventoryCountListQuerySchema = paginationQuerySchema.extend({
  dateFrom: dateStringSchema('盘点日期起').optional(),
  dateTo: dateStringSchema('盘点日期止').optional(),
  targetType: inventoryTargetTypeSchema.optional(),
});
export type InventoryCountListQuery = z.infer<typeof inventoryCountListQuerySchema>;

