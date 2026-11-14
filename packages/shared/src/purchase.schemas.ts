import { z } from 'zod';
import { dateStringSchema } from './date.schemas';
import { zeroOrPositiveMoneySchema } from './finance.schemas';
import { paginationQuerySchema } from './pagination.schemas';

// 采购领域的边界校验（design/purchase.md §3）：前后端共用同一份。
// 采购单是单头单据；送货吨数只记录过磅，结算吨数用于计价。

const tonsRe = /^\d+(\.\d{1,3})?$/; // 吨数：最多 3 位小数

const purchaseDateSchema = dateStringSchema('采购日期');

const tonsSchema = z
  .string()
  .regex(tonsRe, '吨数须为非负数、最多 3 位小数')
  .refine((value) => Number(value) > 0, { message: '吨数必须大于 0' });

export const purchaseSettlementModeSchema = z.enum(['credit', 'settled']);
export type PurchaseSettlementMode = z.infer<typeof purchaseSettlementModeSchema>;

export const purchaseInputSchema = z
  .object({
    supplierId: z.string().uuid(),
    purchaseDate: purchaseDateSchema,
    deliveredTons: tonsSchema,
    settledTons: tonsSchema,
    unitPrice: zeroOrPositiveMoneySchema,
    otherAmount: zeroOrPositiveMoneySchema.default('0.00'),
    settlementMode: purchaseSettlementModeSchema.default('credit'),
    settleAccountId: z.string().uuid().nullable().optional(),
    paidAmount: zeroOrPositiveMoneySchema.nullable().optional(),
    note: z.string().trim().max(500, '备注最多 500 字').default(''),
  })
  .superRefine((value, ctx) => {
    if (Number(value.settledTons) > Number(value.deliveredTons)) {
      ctx.addIssue({
        code: 'custom',
        message: '结算吨数不能大于送货吨数',
        path: ['settledTons'],
      });
    }
    if (value.settlementMode === 'settled') {
      if (!value.settleAccountId) {
        ctx.addIssue({
          code: 'custom',
          message: '现结须选择付款账户',
          path: ['settleAccountId'],
        });
      }
    } else if (value.settleAccountId || value.paidAmount != null) {
      ctx.addIssue({
        code: 'custom',
        message: '赊购不填写付款账户与实付金额',
        path: ['settleAccountId'],
      });
    }
  });
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

export const purchaseUpdateSchema = purchaseInputSchema;
export type PurchaseUpdateInput = z.infer<typeof purchaseUpdateSchema>;

// 列表可排序列（页面模式规范：表头正/倒序）
export const purchaseSortFieldSchema = z.enum(['purchaseDate', 'totalAmount']);
export type PurchaseSortField = z.infer<typeof purchaseSortFieldSchema>;

export const purchaseListQuerySchema = paginationQuerySchema.extend({
  code: z.string().trim().max(50).optional(),
  supplierId: z.string().uuid().optional(),
  // 移动端按供应商名称模糊搜索（查的是单据里的名称快照，与销售单 customerName 同构）
  supplierName: z.string().trim().max(100).optional(),
  settlementMode: purchaseSettlementModeSchema.optional(),
  dateFrom: purchaseDateSchema.optional(),
  dateTo: purchaseDateSchema.optional(),
  sortBy: purchaseSortFieldSchema.optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type PurchaseListQuery = z.infer<typeof purchaseListQuerySchema>;

export const purchaseSupplierSummaryQuerySchema = z.object({
  supplierIds: z.string().trim().min(1, '缺少供应商 id'),
});
export type PurchaseSupplierSummaryQuery = z.infer<typeof purchaseSupplierSummaryQuerySchema>;

// 批量删除（页面模式规范：列表多选 + 批量操作）
export const purchaseBatchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, '请选择要删除的采购单').max(200, '一次最多 200 张采购单'),
});
export type PurchaseBatchDeleteInput = z.infer<typeof purchaseBatchDeleteSchema>;
