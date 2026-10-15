import { z } from 'zod';

// 跨端共享的校验与类型。各领域的具体 schema 随需求新增；
// 由 openapi.json 代码生成的类型化 API client 亦将落在此包。

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
