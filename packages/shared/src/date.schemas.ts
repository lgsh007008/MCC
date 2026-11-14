import { z } from 'zod';

// 日期（YYYY-MM-DD）边界校验：财务发生日期、采购日期等共用，避免各域复制同一段 refine。
export function dateStringSchema(label: string) {
  return z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label}须为 YYYY-MM-DD`)
    .refine(
      (value) =>
        !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
      { message: `${label}不是有效日期` },
    );
}

export type DateString = z.infer<ReturnType<typeof dateStringSchema>>;
