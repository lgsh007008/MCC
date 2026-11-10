# 财务领域实现设计（finance）

> 定位：财务领域的**实现设计**（How）。需求见 `product/finance.md`（R-财务-001）。
> 全局约定见技术方案 §4（模块边界）/ §5（数据模型）/ §6（API 契约），本文件只写本领域落点，不重述约定。

---

## 1. 模块结构与职责

`modules/finance` 为业务模块，遵循技术方案 §4.1 四件套模板：

```
modules/finance/
├── finance.controller.ts   # 事件列表 / 详情 / 手工新建 / 更新 / 删除 / 批量删除 / 收支汇总
├── finance.service.ts      # 编号生成、符号规范化、软删除、汇总聚合、销售单联动
├── dto/                    # 契约形状（@nestjs/swagger class，供 OpenAPI 生成）；运行时校验用 @mcc/shared 的 zod schema
├── finance.module.ts
└── index.ts                # 唯一公开出口
```

- 计算纯函数（符号、汇总）放 `packages/shared`（`finance.calc.ts`），服务端与 web 共用。
- `finance_events` 一张表归本模块（数据所有权，技术方案 §4.2）。
- 本域**不建会计科目表、不建凭证表**（需求口径：管理会计单式台账）。

## 2. 数据模型概览

> 细节归 `packages/db/prisma/schema.prisma`（表结构唯一事实源，技术方案 §5），此处只列概览与约定。

| 表 | 字段要点 | 备注 |
| --- | --- | --- |
| `finance_events` | 事件编号（唯一）、发生日期、分类、金额（有符号）、备注、来源（自动/手工）、源单类型 / id / 编号 | 通用字段（主键、`tenant_id`、`created_at/updated_at`、`deleted_at`）按技术方案 §5.1；编号唯一按租户复合 `(tenant_id, code)`；`occurred_date`、`category` 建索引 |

- 枚举 `finance_event_category`：`SALES_REVENUE` / `OTHER_REVENUE` / `PURCHASE_COST` / `LABOR_COST` / `OTHER_EXPENSE`；接口层用小写（`sales_revenue` 等）
- 枚举 `finance_event_source`：`AUTO` / `MANUAL`
- 金额 `Decimal(18,2)`，**有符号**（收入正、支出负），禁止浮点
- **源单唯一约束** `(tenant_id, source_type, source_id)`：防同一单据重复生成事件；手工事件两列为 NULL，Postgres 唯一索引允许任意多个 NULL
- 删除 = 软删除（`deleted_at` 落值）；销售单删除时其自动事件一并软删
- 不存汇总快照：总收入 / 总成本 / 净利润全部按日期区间实时聚合（需求 R-财务-001）

## 3. 计算规则（纯函数，`packages/shared`）

- 符号规范化：收入类（`sales_revenue`、`other_revenue`）为正，成本/费用类（`purchase_cost`、`labor_cost`、`other_expense`）为负；手工录入按正数提交，落库前由服务端按分类转有符号
- 汇总：总收入 = Σ正数金额；总成本 = Σ负数金额的绝对值；净利润 = 总收入 − 总成本；分类小计按五类固定输出（无数据为 0）
- 金额运算以字符串 + BigInt 实现（含负数），禁浮点；纯函数单测为最高优先级（技术方案 §10）

## 4. 编号生成

- 事件编号 `YYYYMM-####`：取**发生日期**年月 + 当月流水；保存时事务内取当月最大流水 +1，唯一约束兜底并发冲突
- 编号只读、永不复用

## 5. 接口清单

> 契约由 NestJS 装饰器代码生成 OpenAPI（技术方案 §6.1 / ADR-006），本文不手写参数与响应细节，只列清单。

| 接口 | 路径 | 用途 |
| --- | --- | --- |
| list | `GET /api/v1/finance/events` | 列表（筛选：发生日期区间、分类、来源；排序：occurredDate / amount，asc / desc，默认日期倒序；分页；响应含 `summary` 金额合计——对筛选全量、排除分页） |
| detail | `GET /api/v1/finance/events/:id` | 详情 |
| create | `POST /api/v1/finance/events` | 手工新建（分类仅 `other_revenue` / `other_expense`；金额按正数提交，服务端按分类转符号） |
| update | `PUT /api/v1/finance/events/:id` | 更新（仅手工事件；自动事件拒绝，400） |
| remove | `DELETE /api/v1/finance/events/:id` | 删除（仅手工事件，软删除） |
| batch-delete | `POST /api/v1/finance/events/batch-delete` | 批量删除（仅手工事件，body `{ ids }`，返回删除条数） |
| summary | `GET /api/v1/finance/summary?dateFrom&dateTo` | 收支汇总：总收入 / 总成本 / 净利润 / 事件条数 / 分类小计（实时聚合） |

## 6. 与订单域的联动（跨模块边界）

- 自动事件由 **order 在同一事务内调用 finance 公开接口**完成：`OrderModule` 导入 `FinanceModule`，order 只调 `FinanceService`，**不写 finance 表**（技术方案 §4.2）
- `create`：销售单创建后写一条 `SALES_REVENUE` 事件——发生日期 = 销售日期，金额 = 主表合计金额（正数），备注 = `销售单 <编号> · <客户名称>`，来源 = AUTO，源单类型 `sale_order` + 销售单 id + 编号
- `update`：按源单定位事件，同步发生日期 / 金额 / 备注；事件缺失则补建（容错）
- `remove` / `batch-delete`：按源单批量软删对应事件
- 源单唯一约束兜底防重复；自动事件在财务侧只读（不可编辑 / 删除）
- 采购成本（`purchase_cost`）、人工成本（`labor_cost`）为后续域接入预留，本模块暂不生成

## 7. 前端实现节（web）

- 列表页（`/admin/finance/events`）：筛选 / 多选 / 排序 / 分页按列表页模式（组件拼装见 `design/平台布局.md` §1.5）；筛选项 = 发生日期区间、分类（五类）、来源（全部 / 自动 / 手工）；列为编号、发生日期、分类、金额（带符号、右对齐）、来源、源单（销售单来源时链接到销售单详情）、备注（截断 + title）；多选与批量删除**仅对手工事件**生效（自动事件行复选框禁用，表头全选只选本页手工行）；行操作 = 查看（详情弹窗）、编辑（仅手工，弹窗）、删除（仅手工）；编号点击打开详情弹窗；新建与编辑经**弹窗表单**（`Dialog`，标题「新建财务事件 / 编辑财务事件」，保存后关闭并就地刷新列表，保持筛选与分页）
- 弹窗表单（新建 / 编辑共用 `components/finance/finance-event-form.tsx`）：Dialog 受控于列表页；字段 = 分类（仅「其他收入 / 其他支出」）、发生日期、金额（正数录入、2 位小数）、备注；客户端用 `financeEventInputSchema` 校验；未保存改动时关闭弹确认（复用 `useConfirm`，确认框叠在弹窗之上）；保存成功不跳转详情
- 详情弹窗（`components/finance/finance-event-detail-dialog.tsx`）：数据取自列表项（不再请求详情接口）；标题 = 事件编号 + 分类括注；`dl` 信息条（发生日期、分类、金额、来源、源单、备注）；操作区 = 编辑（仅手工，**状态切换**为编辑弹窗，不嵌套）/ 关闭
- 汇总页（`/admin/finance/summary`，聚合页模式）：日期区间（默认本月 1 日至今天）+ 查询；三张指标卡 = 总收入 / 总成本 / 净利润；下方分类小计表（分类、收入、成本、净额）；根容器 `flex h-full min-h-0 flex-col`，卡片与表格铺满内容区（不设最大宽度），分类表卡片 `min-h-60 flex-1` + `containerClassName="h-full overflow-y-auto"`（表体内滚、表头 sticky）；事件条数与口径说明在卡片区下方右侧小字
- 路由与菜单：菜单「财务」分组两项（财务台账 / 收支汇总）随 `design/平台布局.md` §1.3 静态配置登记；财务事件不设独立表单页与详情页路由（`/new`、`/[id]/edit`、`/[id]` 均移除，全部走列表页弹窗）

## 8. 后置边界（本轮不建）

- 应收应付（客户 / 供应商往来）：`R-财务-002` 另立（`product/finance.md` 待补注记）
- 采购成本、人工成本自动生成：待采购域、payroll 域建成后接入
- 复式记账升级：按 ADR 决策后另立，不在本轮

---

## Changelog

> 变更纪律见 `0-文档驱动开发机制.md`。

### v20261110

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立财务领域实现设计：finance 模块四件套、finance_events 表概览、符号与汇总纯函数、编号生成、接口清单、订单联动边界、web 前端实现节、后置边界 | 与 `product/finance.md` 配对，支撑 R-财务-001 落地 |
| 7 前端实现节 | 修改 | 新建 / 编辑为独立路由页面，保存后跳转详情 | 新建 / 编辑改为列表页与详情页内的弹窗表单（Dialog 受控、保存关闭并就地刷新、未保存改动拦截）；移除 `/new` 与 `/[id]/edit` 路由 | 字段少的表单按平台「弹窗表单」规范改为弹窗，减少页面跳转 |
| 7 前端实现节 | 修改 | 详情为独立路由页面（`/[id]`），列表「查看」跳转 | 详情改为列表页弹窗：`finance-event-detail-dialog.tsx`（数据取自列表项、`dl` 信息条、编辑仅手工并切换为编辑弹窗）；移除 `/[id]` 路由 | 财务事件为流水记录，详情与编辑同构、无需 URL 直达；平台弹窗规范同步扩展至弹窗详情 |
| 7 前端实现节 · 汇总页 | 修改 | 内容 `max-w-3xl`、页面不撑满高度、条数说明在筛选行 | 去最大宽度、整页弹性布局（分类表 `flex-1` + 表体内滚）、条数说明移卡片区下方右侧 | 与产品文档聚合页「铺满宽度 + 弹性高度」同步；修复宽屏空白 |

---

*本文件为财务领域实现设计文档，与 `product/finance.md` 同名配对。*
