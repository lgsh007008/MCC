-- 四固定角色（design/账号与权限.md §2）：只新增枚举值，不在本迁移内使用新值。
ALTER TYPE "user_role" ADD VALUE 'ADMIN';
ALTER TYPE "user_role" ADD VALUE 'FINANCE';
ALTER TYPE "user_role" ADD VALUE 'WORKER';
