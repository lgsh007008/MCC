import { z } from 'zod';

// 跨端共享的分页查询校验（技术方案 §6.3：分页统一 page/pageSize 并全站一致）。

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;