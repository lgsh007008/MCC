# 财务领域实现设计（finance）

> 定位：财务领域的**实现设计**（How）。需求见 `product/finance.md`（R-财务-001 / R-财务-002）。
> 全局约定见技术方案 §4（模块边界）/ §5（数据模型）/ §6（API 契约），本文件只写本领域落点，不重述约定。

---

## 1. 模块结构与职责

`modules/finance` 为业务模块，遵循技术方案 §4.1 四件套模板：

```
modules/finance/
├── finance.controller.ts   # 收支汇总 / 资金账户 / 资金流水 / 资金汇总 / 应收 / 应付
├── finance.service.ts      # 编号生成、余额与应收应付聚合、软删除、源单联动、收支汇总
├── dto/                    # 契约形状（@nestjs/swagger class，供 OpenAPI 生成）；运行时校验用 @mcc/shared 的 zod schema
│   ├── finance.dto.ts      # 收支汇总
│   └── cash.dto.ts         # 资金账户 / 流水 / 应收 / 应付
├── finance.module.ts       # imports: CustomerModule（收款客户校验与名称快照）、SupplierModule（付款供应商校验与名称快照）
└── index.ts                # 唯一公开出口
```

- 计算纯函数（汇总、余额、应收、应付）放 `packages/shared`（`finance.calc.ts`），服务端与 web 共用。
- `finance_accounts` / `finance_cash_entries` 两张表归本模块（数据所有权，技术方案 §4.2）。
- 本域**不建会计科目表、不建凭证表、不建事件表**（需求口径：资金流水单轨制）。
- 收款挂客户：客户校验与名称快照经 `CustomerService.findById`（customer 模块公开接口），不直读 customer 表；允许停用客户继续收款。
- 付款挂供应商：供应商校验与名称快照经 `SupplierService.findById`（supplier 模块公开接口），不直读 suppliers 表；允许停用供应商继续付款。
- 应收的「累计销售」对 order 域 `sale_orders` 做**只读聚合**（不注入 OrderService，避免成环）；不写订单表；现结单按 `received_amount`、赊销单按 `total_amount` 计。
- 应付的「累计采购」对 purchase 域 `purchase_orders` 做**只读聚合**（不注入 PurchaseService，避免成环）；不写采购表；现结单按 `paid_amount`、赊购单按 `total_amount` 计。
- 应收的「期初欠款」经 `CustomerService.findOpeningDebts(ids)` 批量取得；应付的「期初应付」经 `SupplierService.findOpeningPayables(ids)` 批量取得。
- **源单流水**：销售单现结派生的收款流水、采购单现结派生的付款流水记录 `source_type` + `source_id` + `source_code`；源单流水在财务侧只读，只能回源单修改或删除。
- **一次录入**：销售单现结与采购单现结分别在其单据事务内调用本模块公开方法生成 / 同步 / 软删流水，不出现两处手工录入。

## 2. 数据模型概览

> 细节归 `packages/db/prisma/schema.prisma`（表结构唯一事实源，技术方案 §5），此处只列概览与约定。

| 表 | 字段要点 | 备注 |
| --- | --- | --- |
| `finance_accounts` | 账户编号（唯一）、名称、类型（对公/对私）、渠道、期初余额、启用状态 | 编号唯一按租户复合；列表不返回已删除账户（软删 `deletedAt`），历史流水保留账户名、编号不回收；余额不落库、按流水实时计算；类型与渠道级联，服务端校验组合 |
| `finance_cash_entries` | 流水编号（唯一）、方向（收/付/转账）、发生日期、金额（正数）、账户 id、转入账户 id（转账）、收支分类、客户 id + 客户名快照、供应商 id + 供应商名快照、方式、备注、源单类型 / id / 编号 | 账户 / 转入账户外键（转出 `RESTRICT`、转入 `SET NULL`）；`occurred_date`、`account_id`、`customer_id`、`supplier_id`、`category` 建索引；软删除；源单唯一 `(tenant_id, source_type, source_id)`，手工流水三列 NULL；方式由账户渠道推导 |
| `sale_orders` | 结算方式（`CREDIT` / `SETTLED`）、实收金额（`received_amount`）、收款账户 id 快照 | 合计金额仍为原价；现结时实收默认合计、可改 |

- 枚举 `finance_cash_category`：`SALES_RECEIPT` / `OTHER_REVENUE` / `LOAN_IN` / `PURCHASE_PAYMENT` / `LABOR_COST` / `OPERATING_EXPENSE` / `ASSET_PURCHASE` / `LOAN_REPAY`；接口层用小写（`sales_receipt` 等）；内部转账为 NULL
- 分类与方向：收款 = `SALES_RECEIPT` / `OTHER_REVENUE` / `LOAN_IN`；付款 = `PURCHASE_PAYMENT` / `LABOR_COST` / `OPERATING_EXPENSE` / `ASSET_PURCHASE` / `LOAN_REPAY`；服务端校验组合
- 枚举 `finance_account_kind`：`CORPORATE` / `PERSONAL`（删除 `BILL`）；`finance_account_channel`：`BANK` / `WECHAT` / `ALIPAY` / `CASH` / `BILL`
- 级联矩阵：对公 = `BANK` / `BILL`；对私 = `BANK` / `WECHAT` / `ALIPAY` / `CASH`
- 枚举 `finance_cash_direction`：`IN` / `OUT` / `TRANSFER`；`finance_cash_method`：`BANK` / `WECHAT` / `ALIPAY` / `CASH` / `ACCEPTANCE`
- 枚举 `sale_order_settlement`：`CREDIT` / `SETTLED`
- 金额 `Decimal(18,2)`：流水与销售单实收均存**正数**（方向 / 状态决定语义），禁止浮点
- **源单唯一约束**：`finance_cash_entries` 为 `(tenant_id, source_type, source_id)`；手工流水对应列为 NULL，Postgres 唯一索引允许任意多个 NULL
- 删除 = 软删除（`deleted_at` 落值）；销售单删除时其收款流水一并软删；流水删除后余额自动回退
- 不存汇总快照：收支汇总、资金汇总、账户余额、应收全部实时聚合

## 3. 计算规则（纯函数，`packages/shared`）

- 经营收支汇总：销售收入 = 期间销售单（现结取 `received_amount`、赊销取 `total_amount`）；采购支出 = 期间采购单（现结取 `paid_amount`、赊购取 `total_amount`）；其他收入 = `OTHER_REVENUE` 收款流水合计；工资 = `LABOR_COST`、费用 = `OPERATING_EXPENSE` 付款流水合计；总收入 = 销售收入 + 其他收入，总支出 = 采购支出 + 工资 + 费用，净额 = 总收入 − 总支出；分类小计固定输出六项（销售收入、其他收入、采购支出、工资、费用、净额，无数据为 0）
- 不计入经营收支的分类：`SALES_RECEIPT`、`PURCHASE_PAYMENT`、`LOAN_IN`、`LOAN_REPAY`、`ASSET_PURCHASE`、`TRANSFER`——销售回款与采购付款的损益已由单据计入，再算重复
- 账户余额 `calcAccountBalance`：期初 + 收款 − 付款 + 转入 − 转出；转账按 `accountId` 减、`toAccountId` 加，**同一笔转账不重复计入同一账户**
- 应收 `calcReceivable`：期初欠款 + 累计销售 − 累计收款；期初欠款取客户档案录入值（默认 0），累计销售现结取实收、赊销取合计，累计收款只取挂该客户的 `SALES_RECEIPT` 流水，两者都只统计系统内数据；历史回款不补录（补录会流入资金账户、虚增账户余额与资金总额）；负数为预收，不截断
- 应付 `calcPayable`：期初应付 + 累计采购 − 累计付款；期初应付取供应商档案录入值（默认 0），累计采购现结取实付、赊购取合计，累计付款只取挂该供应商的 `PURCHASE_PAYMENT` 流水，两者都只统计系统内数据；历史付款不补录（补录会流出资金账户、虚减账户余额与资金总额）；负数为预付，不截断
- 资金汇总：期间收款 = Σ`IN`；期间付款 = Σ`OUT`；净流入 = 收款 − 付款；期末资金总额 = Σ各账户当前余额；`TRANSFER` 三项均不计
- 金额运算以字符串 + BigInt 实现（含负数），禁浮点；纯函数单测为最高优先级（技术方案 §10）

## 4. 编号生成

- 账户编号 `AC-#####`、流水编号 `CF-#####`：各自独立序列，事务内取号 + P2002 重试
- 编号只读、永不复用；各前缀在 `1-产品文档.md`「五、全局编号规范」登记

## 5. 接口清单

> 契约由 NestJS 装饰器代码生成 OpenAPI（技术方案 §6.1 / ADR-006），本文不手写参数与响应细节，只列清单。

| 接口 | 路径 | 用途 |
| --- | --- | --- |
| summary | `GET /api/v1/finance/summary?dateFrom&dateTo` | 经营收支汇总：销售收入 / 其他收入 / 采购付款 / 工资 / 费用 / 总收入 / 总支出 / 净额 / 条数 / 分类小计（实时聚合，销售单只读聚合 + 流水分类） |
| accounts | `GET /api/v1/finance/accounts` | 资金账户列表（不分页，含每个账户实时余额与流水条数 `entryCount`） |
| account-create | `POST /api/v1/finance/accounts` | 新建账户（类型 / 渠道级联 / 期初余额 / 启用状态） |
| account-update | `PUT /api/v1/finance/accounts/:id` | 更新账户（名称 / 类型 / 渠道 / 期初 / 启用；状态切换由列表行操作提交整行字段） |
| account-remove | `DELETE /api/v1/finance/accounts/:id` | 删除账户（软删除；历史流水保留账户名，编号不复用） |
| cash-entries | `GET /api/v1/finance/cash-entries` | 流水列表（筛选：方向、收支分类、账户（含转入）、客户、日期区间；分页；`summary` 含收款 / 付款 / 净额；响应含来源与源单编号） |
| cash-entries/:id | `GET /api/v1/finance/cash-entries/:id` | 单条流水详情（含来源与 `editable`；移动端详情 / 编辑页使用） |
| cash-create | `POST /api/v1/finance/cash-entries` | 登记手工流水（分类按方向必选；销售回款挂客户，其他收入 / 借款不挂；付款写备注；转账选转入账户；方式由账户渠道推导） |
| cash-update | `PUT /api/v1/finance/cash-entries/:id` | 更新手工流水（源单流水拒绝，400） |
| cash-remove | `DELETE /api/v1/finance/cash-entries/:id` | 删除手工流水（软删除，余额回退；源单流水拒绝） |
| cash-summary | `GET /api/v1/finance/cash-summary?dateFrom&dateTo` | 资金汇总：期间收款 / 付款 / 净流入 / 资金总额 / 各账户余额 |
| receivables | `GET /api/v1/finance/receivables?customerIds=` | 批量应收（逗号分隔客户 id）：期初欠款 / 累计销售 / 累计收款 / 欠款（期初欠款经 `findOpeningDebts` 取得） |
| payables | `GET /api/v1/finance/payables?supplierIds=` | 批量应付（逗号分隔供应商 id）：期初应付 / 累计采购 / 累计付款 / 应付（期初应付经 `findOpeningPayables` 取得） |

## 6. 与源单域的联动（跨模块边界）

- 现结收款流水由 **order 在同一事务内调用 finance 公开接口**完成：`OrderModule` 导入 `FinanceModule`，order 只调 `FinanceService`，**不写 finance 表**（技术方案 §4.2）；现结付款流水由 **purchase 同法**完成。
- `create`（销售单）：仅现结生成一条收款流水——方向 `IN`、金额 = 实收、账户 = 销售单收款账户、客户 = 销售单客户、分类 = `SALES_RECEIPT`、备注 = 销售单编号、源单类型 `sale_order` + 销售单 id + 编号；方式由账户渠道推导；赊销不生成流水
- `create`（采购单）：仅现结生成一条付款流水——方向 `OUT`、金额 = 实付、账户 = 采购单现结账户、供应商 = 采购单供应商、分类 = `PURCHASE_PAYMENT`、备注 = 采购单编号、源单类型 `purchase_order` + 采购单 id + 编号；赊购不生成流水
- `update`：按源单定位流水，同步日期、金额、账户、客户 / 供应商、备注；现结改赊销 / 赊购软删流水，赊销 / 赊购改现结补建；源单缺失则补建（容错）
- `remove` / `batch-delete`：按源单软删流水
- 源单唯一约束兜底防重复；源单流水在财务侧只读（不可编辑 / 删除）
- 销售收入由收支汇总对销售单只读聚合、采购支出对采购单只读聚合；工资、费用由流水分类承载，order / purchase 不参与

## 7. 前端实现节（web）

- 汇总页（`/admin/finance/summary`，聚合页 + 页内 Tab）：顶部两个 Tab「经营收支 / 资金收付」，状态写入 `?tab=funds`，默认经营收支；日期为两个 Tab **共用的一份 state**（`filters` 输入 + `applied` 已查询），切 Tab 保留已查询区间、未提交输入丢弃；Tab 1 展示总收入 / 总支出 / 净额三卡 + 分类小计表（销售收入、其他收入、采购支出、工资、费用），说明区为同一段小字——定位句后接「N 张销售单 / M 张采购单 / K 条收支流水」，右侧只放「分类口径说明」按钮（打开 `components/finance/business-summary-help-dialog.tsx`：`sm:max-w-[520px]`，三组信息条——怎么算 / 五个分类 / 为什么不含其余分类 + 收尾句，底部只有关闭；标题与底部操作固定、仅中部内容滚动）；Tab 2 展示四卡同排（期间收款 / 期间付款 / 净流入 + 「当前资金总额 · 此刻」，`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4`；第四卡 `border-l-2 border-l-primary/40 bg-muted/40`，金额 `text-xl xl:text-2xl`，下方小字「不随日期筛选变化」，取 `cash.totalFunds`）+ 各账户余额列表（账户编号、名称、类型 / 渠道、当前余额、状态，不含期初余额），说明区右为「资金口径说明」按钮（打开 `components/finance/cash-summary-help-dialog.tsx`：三组信息条——怎么算 / 净流入为什么不等于资金总额 / 哪些钱进哪些不进 + 收尾句；同样固定标题与底部操作、仅中部内容滚动）；两个口径弹窗共用 `components/finance/summary-help-parts.tsx`（`HelpDialogShell` / `HelpSection` / `HelpRow`）：`HelpDialogShell` 的 `DialogContent` 为 `flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0`，标题 `shrink-0 border-b`（`pr-12` 让开右上角关闭按钮），内容区 `scroll-area min-h-0 flex-1 overflow-y-auto`（平台滚动条样式），底部 `shrink-0 border-t`，头尾固定、仅中部滚动；查询 / 重置作用于共用筛选；根容器 `flex h-full min-h-0 flex-col`，内容铺满
- 资金流水页（`/admin/finance/cash`，主从列表页模式）：根容器 `flex h-full min-h-0 overflow-hidden rounded-lg border border-border bg-card`（单一面板）。左栏 `w-60 shrink-0 border-r border-border flex flex-col`：卡片头「资金账户」标题左 + `新增账户`（outline sm）右；列表首项「全部」默认选中，单行左「全部账户」右账户数 / 启用数摘要，不显示金额并加粗；账户行为单行：名称按钮（`flex-1 truncate` + `title`，内含名称与启用 / 停用标签，点名称或状态均筛选）+ 行尾「⋯」`MoreHorizontal` 触发按钮（`icon-sm` ghost，`aria-label="账户操作"`，点击不触发筛选）；不显示金额、编号、渠道、期初；选中态 `bg-muted` + 左侧竖条；「⋯」菜单（`DropdownMenuContent align="end"`）= 查看详情 / 编辑 / 停用（二次确认）或启用（不确认）/ 删除（`destructive`，二次确认）；点击行即设置右栏 `accountId` 条件并回第 1 页；左栏数据来自 `/finance/accounts`，随流水变更同步刷新。右栏 `min-w-0 flex-1` 沿用列表页：筛选按「方向、收支分类、日期区间、客户、供应商」顺序排列（无账户下拉，往来单位居末）；收支分类与方向级联（取 `FINANCE_CASH_CATEGORIES_BY_DIRECTION`，方向为空列全部，收款 / 付款只列各自子集；内部转账无分类——分类值清空且 `Select` 置 `disabled`、只显示「内部转账无分类」，切回收款 / 付款恢复可选）；客户筛选只作用于销售回款、供应商筛选只作用于采购付款（方向不符时结果自然为空）；列 = 编号（主色按钮，点击打开详情）、发生日期、方向、账户（内部转账显示「转出 → 转入」）、收支分类、客户（仅销售回款）、供应商（仅采购付款）、备注、金额（收 +、付 −，右对齐着色）、来源、操作；**源单流水行只读**（显示来源，只有查看），手工流水可查看 / 编辑 / 删除；合计行与表头逐列对齐（`TableFooter` 加 `bg-muted [&_td]:bg-muted`）：`合计` 单元格 `colSpan={8}` 覆盖编号至备注列，金额列放 `收款 / 付款`（右对齐），来源列放 `净额`，操作列补一个空 `TableCell`，保证合计行格数与 11 列表头一致、背景覆盖到表格右缘；分页同列表页；`登记流水` 为主操作，弹窗默认账户 = 左栏选中项（「全部」取第一个启用账户）；重置 = 清空方向、分类、客户、供应商与日期 + 左栏回「全部」+ 回第 1 页。账户与流水弹窗（`components/finance/finance-account-form.tsx`、`finance-cash-entry-form.tsx`）保存后关闭并刷新两栏；账户弹窗同为 `sm:max-w-[720px]`、`p-6`、双列网格（名称整行，类型 / 渠道一行，期初余额整行）；状态字段移出表单，由左栏「⋯」菜单独占，删除经 `DELETE /finance/accounts/:id` 软删；账户类型与渠道级联（类型变更时渠道重置为「银行」）；表格超宽时按列表页在表格容器内滚动
- 资金流水弹窗：`sm:max-w-[720px]`、`p-6`、双列网格（`gap-x-6 gap-y-5`），标签宽 96px、控件占满所在列；顶部为收款 / 付款 / 内部转账模式切换；收支分类在收款时三选一（销售回款 / 其他收入 / 借款），付款时五选一（采购付款 / 工资 / 费用 / 资产购置 / 还款），内部转账无分类；仅「销售回款」显示客户下拉且必选，仅「采购付款」显示供应商下拉且必选，其他分类不显示往来单位；方式由账户渠道推导，不单独录入
- 资金流水弹窗的客户 / 供应商下拉：只列启用项；编辑历史流水时若往来单位已停用 / 删除，经对应详情补快照，保证可保存（与销售单 / 采购单表单同法）
- 详情弹窗：`components/finance/finance-account-detail-dialog.tsx`（编号、名称、类型、渠道、期初余额、当前余额、状态，`sm:max-w-[640px]` + `grid grid-cols-2`；编辑 = 关闭详情后打开账户弹窗）；`components/finance/finance-cash-entry-detail-dialog.tsx`（编号、发生日期、方向、金额、账户 / 转入账户、收支分类、客户、供应商、方式、来源、备注；两列信息条，备注 `col-span-2` 且 `whitespace-pre-wrap break-words`，容器与值 `min-w-0` 防长串溢出；编辑 = 关闭详情后打开流水弹窗，仅手工流水）；左栏「⋯」菜单的查看详情、右栏编号点击与行内查看均打开对应详情，详情与编辑不嵌套
- 路由与菜单：菜单「财务」分组两项（资金流水 / 收支汇总）随 `design/平台布局.md` §1.3 静态配置登记；`scopeForPath` 对 `/admin/finance/*` 返回 `finance:view`（写操作按钮按 `finance:manage` 裁剪）；财务另建移动页（见下条）。
- 移动页（`/m/finance`、`/m/finance/cash`、`/m/finance/cash/new`、`/m/finance/cash/[id]`、`/m/finance/cash/[id]/edit`、`/m/finance/summary`）：`/m` 入口卡片按 `useCan('finance:view')` 裁剪（与客户 / 销售单移动页同法，不走 `scopeForPath`）；`/m/finance` 为二级入口（两个 48px 大按钮）；资金流水页顶部账户下拉取 `/finance/accounts`（「全部账户」+ 启用项），列表取 `/finance/cash-entries`（`pageSize: 20` + 加载更多，筛选含账户、日期、方向、分类；移动端不设客户 / 供应商筛选），卡片组件 `components/mobile/finance-cash-card.tsx`（采购付款卡片显示供应商）；登记 / 编辑表单 `components/mobile/finance-cash-entry-form.tsx`（单列、控件 `h-12`、方向用 `Segmented`、分类按 `FINANCE_CASH_CATEGORIES_BY_DIRECTION` 级联、内部转账禁用分类、销售回款显示客户下拉、采购付款显示供应商下拉、金额 `inputMode="decimal"`、日期 `size="touch"`），写 `POST` / `PUT /finance/cash-entries`，源单流水不提供编辑删除；详情 `app/m/finance/cash/[id]/page.tsx` 只读 + 手工流水编辑 / 删除（`useConfirm`）；收支汇总页 `app/m/finance/summary/page.tsx` 复用 `/finance/summary` 与 `/finance/cash-summary`，Tab 用 `Segmented` 写 `?tab=funds`，口径弹窗复用 `business-summary-help-dialog` / `cash-summary-help-dialog`；移动页均不新增后端接口。

## 8. 后置边界（本轮不建）

- 未收未付的其他收支单独登记：等实际收付时记流水，不做应收应付挂账
- 部分现结、分期收款、分期付款
- 账龄、单笔核销、预收核销；对私账户个人消费统计
- 逐张票据台账（承兑按对公 + 承兑汇票处理）
- 复式记账升级：按 ADR 决策后另立，不在本轮

## 9. 数据迁移

1. `finance_cash_entries` 增加 `category` 枚举列与 `(tenant_id, category, occurred_date)` 索引；
2. 按方向与来源回填分类：源单 `sale_order` → `SALES_RECEIPT`；源单 `fixed_asset` → `ASSET_PURCHASE` 并把源单三列置 NULL；无源单收款有客户 → `SALES_RECEIPT`、无客户 → `OTHER_REVENUE`；无源单付款 → `OPERATING_EXPENSE`；内部转账 → NULL；迁移脚本输出各行清单供人工复核；
3. `counterparty` 非空值并入 `note`（无备注直接取对象，有备注为「对象 · 备注」），随后删除 `counterparty` 列；
4. 事件表全量备份到 `finance_events_backup_20261113`；已联动流水的补分类后删除事件；未联动流水的没有账户，保留在备份表供人工复核（不再进入业务界面）；
5. 删除 `finance_events` 表与事件枚举；
6. `sale_orders` 的结算字段保持不变；
7. 删除固定资产模块：`DROP TABLE fixed_assets`、`DROP TYPE fixed_asset_category`、`DROP TYPE fixed_asset_status`（dev 库仅有测试数据，不做备份；购置支出历史值已在流水 `ASSET_PURCHASE` 分类中保留）；
8. 本轮（采购与应付）：新建 `suppliers`、`purchase_orders` 表；`finance_cash_entries` 增加 `supplier_id`（可空、外键 `SET NULL`）、`supplier_name` 快照与 `(tenant_id, supplier_id)` 索引；系统无历史采购单与采购付款流水，无需回填；
9. 迁移后重建 Prisma Client、OpenAPI 与 web client。

---

## Changelog

> 变更纪律见 `0-文档驱动开发机制.md`。

### v20261113

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 1 模块结构 | 修改 | 四张表（含 finance_events）；事件 / 汇总 / 资金全部职责 | 三张表（accounts / cash_entries / fixed_assets）；删除事件表与事件职责；源单只保留销售单 | 财务改为资金流水单轨制 |
| 2 数据模型 | 修改 | finance_events 表、事件分类与来源枚举、有符号金额 | 删除事件表与枚举；流水增加 `finance_cash_category`（8 个值）与索引；金额全部正数；固定资产不与流水联动 | 流水成为唯一录入入口，分类决定经营口径 |
| 3 计算规则 | 修改 | 事件符号规范化 + 事件汇总 + 现结收入事件 | 经营收支 = 销售单只读聚合 + 流水分类汇总；排除销售回款 / 借款 / 还款 / 资产购置 / 内部转账 | 台账下线，汇总改由流水与销售单计算 |
| 4 编号 | 删除 | 事件编号 FN-##### | 删除；保留 AC / CF / FA | 事件表取消 |
| 5 接口清单 | 修改 | 事件列表 / 详情 / 新建 / 更新 / 删除 / 批量删除 6 个接口；资产含 purchasePayment | 删除事件接口；流水接口增加分类；资产接口去掉购置付款 | 与需求同步 |
| 6 联动 | 修改 | order 写收入事件 + 收款流水；事件与资产派生流水 | order 只写现结收款流水 | 自动事件线取消 |
| 6.1 | 删除 | 财务事件与固定资产的自动派生整节 | 整节移除 | 两类联动均取消 |
| 7 前端实现 | 修改 | 台账列表 / 弹窗 / 详情；汇总 Tab 1 为业务发生额；资产含购置付款区；菜单四项 | 删除台账页与组件；汇总 Tab 1 改经营收支；流水加分类；资产去付款区；菜单三项 | 页面随需求下线 |
| 9 数据迁移 | 修改 | 上一轮流水源单、销售单结算、资产账户、账户枚举迁移 | 本轮新增流水分类回填、事件迁移与删表、资产源单置空 | 单轨化需要数据迁移 |
| 2 数据模型 / 5 接口 / 7 前端 | 修改 | 流水含付款对象，方式由用户选择 | 删除付款对象（并入备注）；方式由账户渠道推导；列表合并「客户 / 对象 / 备注」 | 弹窗字段超出建议线，且与自动派生流水口径不一致 |
| 9 数据迁移 | 修改 | 无付款对象迁移步骤 | 增加 `counterparty` 并入 `note` 后删除列 | 字段下线需保留历史值 |
| 7 前端实现节 · 资金流水弹窗 | 修改 | 单列、`sm:max-w-[560px]` | 双列、`sm:max-w-[720px]`、`p-6`、加大行列间距与标签宽度 | 双列在 560px 下过于紧凑 |
| 7 前端实现节 · 账户弹窗 | 修改 | 单列、`sm:max-w-[480px]`，控件宽度 144 / 256px 混用 | 与流水弹窗一致：`sm:max-w-[720px]`、双列网格，名称整行，类型 / 渠道、期初余额 / 状态各一行 | 同类弹窗视觉与间距不统一 |
| 7 前端实现节 · 资金流水页 | 修改 | 根容器 `gap-4`；左栏独立卡片；账户行显示余额；右栏列含合并列与方式 | 单一面板 + 内部竖线；左栏去金额、显示状态与数量摘要；右栏拆客户 / 备注、删方式、编号主色链接、转账合并账户列 | 两栏割裂，左栏与列表信息重复 |
| 7 前端实现节 · 详情弹窗 | 新增 | 主从页只有编辑弹窗 | 新增账户详情与流水详情两个组件；查看 → 详情 → 编辑为状态切换，不嵌套 | 两栏都需要可查看 |
| 5 接口 / 7 前端 · 账户删除 | 修改 | 账户不提供删除，只可停用；编辑弹窗内含状态字段 | 新增 `DELETE /finance/accounts/:id` 软删；状态改为左栏行内启用 / 停用 / 删除，编辑弹窗移除状态字段；列表返回 `entryCount` 供删除确认文案 | 启停与删除应作为列表操作，口径对齐客户档案 |
| 5 接口 / 7 前端 · 流水筛选 | 修改 | 仅方向 / 分类 / 日期；分类为全量下拉 | 增加 `customerId` 筛选（shared query / controller / service / web 同步）；分类与方向级联 | 客户与分类是高频定位条件，全量分类易选错 |
| 7 前端实现节 · 详情弹窗布局 | 修改 | 两个详情弹窗单列 520px；备注长串不换行溢出 | 两列信息条 640px；备注独占整行并 `break-words`，容器 `min-w-0` | 单列视觉割裂、留白过多；长备注撑破弹窗 |

### v20261114

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 1 模块结构 | 修改 | imports 仅 CustomerModule；职责含应收聚合 | 增 SupplierModule；补付款挂供应商、应付累计采购只读聚合、findOpeningPayables、采购单源单流水与一次录入 | 采购与供应商域落地，财务需承接应付与采购付款 |
| 2 数据模型 | 修改 | 流水只有客户 id + 名称快照 | 增供应商 id + 名称快照与索引；说明源单类型含采购单 | 应付按供应商归集 |
| 3 计算规则 | 修改 | 总支出 = 采购付款（流水）+ 工资 + 费用；PURCHASE_PAYMENT 计入经营收支 | 总支出 = 采购支出（采购单）+ 工资 + 费用；PURCHASE_PAYMENT 退出经营收支；新增应付 calcPayable | 采购按应计，与销售对称，避免赊购成本滞后导致净额虚高 |
| 5 接口清单 | 新增 | 无应付接口 | 新增 `GET /api/v1/finance/payables?supplierIds=` | 供应商页需要批量应付 |
| 6 联动 | 修改 | 仅销售单现结派生收款流水 | 增采购单现结派生付款流水；改删同步；收入与采购支出均对源单只读聚合 | 采购与销售对称，一次录入 |
| 7 前端实现 | 修改 | 汇总分类小计含采购付款；流水筛选 / 列 / 表单 / 详情无供应商；移动卡片与表单无供应商 | 分类小计改采购支出、条数加采购单；流水补供应商筛选、列、下拉与详情；移动端补供应商展示与表单 | 与应付及新口径同步 |
| 9 数据迁移 | 新增 | 无供应商与采购单表 | 新建 suppliers / purchase_orders；流水加 supplier_id / supplier_name 与索引；无历史数据不回填 | 本轮新增两张表与流水两列 |
| 7 前端实现节 · 账户行布局 | 修改 | 账户行名称与状态竖排、右侧 4 个操作图标横向争抢 240px，名称被截断 | 两行排布：第一行名称独占整行，第二行状态在左、操作图标在右；选中按钮铺满整行（`sr-only` 名含名称与状态），内容层 `pointer-events-none` | 左栏宽度固定，横向空间不足导致行内拥挤 |
| 7 前端实现节 · 流水筛选 | 修改 | 客户排在日期之前；方向为内部转账时仍列全部 8 个分类（必然查空） | 客户移到日期区间之后（居末）；内部转账时分类清空并禁用、显示「内部转账无分类」；客户在付款 / 转账时保持可选 | 转账无分类，原下拉为错配；筛选顺序按使用频率排列 |
| 7 前端实现节 · 账户行布局 | 修改 | 绝对定位透明按钮覆盖整行 + 内容层 `pointer-events-none` | 取消覆盖层：第一行名称按钮独占整行宽度承载筛选点击，第二行状态文本 + 操作图标为普通流式布局 | 覆盖层中心点落在右侧图标区，点击被命中拦截而超时；流式结构更稳 |
| 7 前端实现节 · 账户行布局 | 修改 | 两行排布 + 4 个图标仍显拥挤，且第二行状态文字不可点 | 回归单行：名称与状态同在一个按钮内（点任一处均筛选），行尾「⋯」`DropdownMenu` 承载查看详情 / 编辑 / 启停 / 删除 | 操作收敛为一个入口后宽度足够，整行可点更符合直觉 |
| 1 模块结构 / 2 数据模型 / 4 编号 / 5 接口 / 7 前端实现 / 8 边界 / 9 迁移 | 删除 | `fixed_assets` 表与两个枚举、`FA-#####` 编号、资产 5 个接口、固定资产列表 / 详情 / 表单页与菜单项 | 全部删除；财务只剩 `finance_accounts` / `finance_cash_entries` 两张表与资金流水、收支汇总两个页面；新增迁移步骤 7 直接 drop 表与类型 | 固定资产模块下线，资产购置改由资金流水 `ASSET_PURCHASE` 分类留痕 |
| 7 前端实现节 · 汇总页 | 修改 | 两个 Tab 各自日期筛选；Tab 2 资金四卡（含期末资金总额）与账户表含期初余额；说明为口径术语小字 | 共用一份日期 state（切 Tab 保留已查询区间）；Tab 2 改期间三卡 + 独立「当前资金总额」区块（`cash.totalFunds`）；账户表去掉期初余额列；说明区改定位句 + 条数 + 口径说明按钮 | 期末值与期间值并列易误读，两份筛选导致跨区间对比，期初属账户详情 |
| 7 前端实现节 · 口径说明弹窗 | 新增 | — | `business-summary-help-dialog.tsx`：`sm:max-w-[520px]`、`p-6`，三组信息条（怎么算 / 五个分类 / 为什么不含其余分类）+ 收尾句，底部只有关闭；沿用弹窗覆盖层，不新增平台形态 | 分类归属需页面内可查 |
| 7 前端实现节 · 汇总页资金卡 | 修改 | 期间三卡 + 独立的「当前资金总额」整行区块 | 四卡同排（`sm:grid-cols-2 xl:grid-cols-4`），第四卡 `border-l-2` + `bg-muted/40` + 「此刻」标注区分，金额 `text-xl xl:text-2xl` | 独立整行卡片断层、留白，并压扁账户表 |
| 7 前端实现节 · 资金收付口径弹窗 | 新增 | Tab 2 无口径说明入口 | 新增 `cash-summary-help-dialog.tsx`（三组：怎么算 / 净流入为什么不等于资金总额 / 哪些钱进哪些不进）；与经营收支弹窗共用 `summary-help-parts.tsx`，两弹窗均加 `max-h-[85vh] overflow-y-auto` | 两个 Tab 说明能力不对称；净流入与资金总额易被误认为同一个数 |
| 7 前端实现节 · 移动页 / 路由与菜单 | 修改 | 财务仅 PC，不建移动页 | 新增 `/m/finance`、`/m/finance/cash`、`/m/finance/cash/new`、`/m/finance/cash/[id]`、`/m/finance/cash/[id]/edit`、`/m/finance/summary` 六路由与两个移动组件；入口按 `useCan('finance:view')` 裁剪；复用只读与写接口，另增单条详情接口（见下行） | 现场收付款与资金概览需要手机端可用 |
| 5 接口清单 · cash-entries/:id | 新增 | 流水只有列表与写接口，单条详情由 PC 弹窗复用行数据 | 新增 `GET /api/v1/finance/cash-entries/:id`（含来源与 `editable`），供移动详情 / 编辑页加载；契约重建 | 移动端整页详情需要可刷新的单条取数 |
| 1 模块结构 / 3 计算规则 / 5 接口清单 | 修改 | 应收 = 累计销售 − 累计收款，期初欠款不参与 | 应收 = 期初欠款 + 累计销售 − 累计收款；期初欠款经 `CustomerService.findOpeningDebts` 批量取得并随应收接口返回；累计销售 / 累计收款只统计系统内 | 客户历史欠款无法用系统内单据表达，需一个录入型基数让三项闭合；历史回款不补录以免虚增账户余额 |
| 5 接口清单 · 经营汇总 DTO | 修改 | `FinanceSummaryDto.categories[].category` 枚举写作 `purchase_payment` | 更正为 `purchase_expense` 并重生成 OpenAPI 与 web client | 枚举与 shared 计算输出不一致，移动汇总页按分类取标签时命中不到，属契约与实现漂移 |
| 7 前端实现节 · 口径说明弹窗 | 修改 | 弹窗整体 `max-h-[85vh] overflow-y-auto`，标题与底部「关闭」随内容滚动；滚动条为浏览器默认 | 两个弹窗共用 `summary-help-parts.tsx` 新增的 `HelpDialogShell`：`DialogContent` 改 `flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0`，标题 `shrink-0 border-b`（`pr-12` 让开关闭按钮）、内容区 `scroll-area min-h-0 flex-1 overflow-y-auto`、底部 `shrink-0 border-t`；头尾固定、仅中部滚动 | 标题与操作随内容滚走，长内容下不便关闭；滚动条样式与平台不一致 |
| 7 前端实现节 · 汇总页定位句 | 修改 | 定位句 70 余字，含两组「按…确认（…也计入）」并列 | 精简为「看这段时间生意赚了多少：收入按销售单、采购按采购单确认（赊销赊购都计入），工资费用按实付计入，所以净额不等于手里的现金。」 | 原句过长，页面定位句需一眼读完 |
| 7 前端实现节 · 汇总页说明区 | 修改 | 说明区 `flex flex-wrap items-start justify-between`：左段定位句、右段条数小字 + 按钮，右块易整块折到下一行 | 定位句与条数并入同一 `<p>`，去掉 `flex-wrap` 与右侧包裹层，按钮 `shrink-0` 独占右侧 | 条数与定位句被排成两行，视觉上像两段话 |
| 7 前端实现节 · 资金流水合计行 | 修改 | 合计行 4 格、列跨度为 6 + 1 + 1 + 2 = 10，表头 11 列；`[&_td]:bg-muted` 覆盖不到不存在的操作列，统计值整体左移一列 | 合计行改 8 + 1 + 1 + 1 = 11 格：`合计` 跨编号至备注列、金额列放收款 / 付款、来源列放净额、操作列空单元格；e2e 断言合计行末格右边界与表头末列对齐 | 合计行与表头列数一致、背景铺满整行，避免再加列时漏格 |

### v20261112

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 1 模块结构 | 修改 | 仅 finance_events 一张表；dto 单文件 | 四张表归本模块（events / accounts / cash_entries / fixed_assets）；dto 拆 `finance.dto.ts` + `cash.dto.ts`；module 导入 CustomerModule；应收销售聚合说明为只读（避免 order ↔ finance 成环） | R-财务-002 / R-财务-003 落地，模块职责与边界同步 |
| 2 数据模型 | 新增 | 仅 finance_events | 增 `finance_accounts` / `finance_cash_entries` / `fixed_assets` 概览与 6 个枚举；流水与资产原值为正数、方向 / 状态定语义；余额与应收实时聚合 | 资金收付与资产清单需要落表 |
| 3 计算规则 | 新增 | 仅符号与收支汇总 | 增 `calcAccountBalance`（转账按转出减、转入加，不重复）、`calcReceivable`（负数为预收）、资金汇总口径（TRANSFER 不计） | 余额与欠款口径需纯函数化并单测 |
| 3 计算规则 / 5 接口 / 7 前端 | 修改 | 净利润 | 净额（接口字段 `netAmount`，DTO / 页面 / 单测 / e2e 同步） | 产品口径改名，避免与会计核算利润混淆 |
| 4 编号生成 | 新增 | 仅 FN | 增 AC / CF / FA 三个独立序列，事务取号 + P2002 重试 | 新增账户、流水、资产实体 |
| 5 接口清单 | 新增 | 7 个事件接口 | 增账户 3 个、流水 4 个、资金汇总 1 个、应收 1 个、资产 4 个 | 资金收付、应收与资产页面所需契约 |
| 7 前端实现节 | 新增 | 仅事件页 / 汇总页 | 增资金流水页、固定资产页、汇总资金四卡、资金弹窗与账户弹窗；菜单财务分组四项；资金与资产仅 PC | 本轮页面落地 |
| 7 前端实现节 · 资金流水页 | 修改 | 列表页模式：顶部账户卡片区 + 账户下拉筛选 | 主从列表页：左栏账户列表（全部默认、点击筛选、行内编辑）、右栏流水列表（无账户下拉）；两栏同源刷新；登记流水默认带选中账户；重置回全部 | 承接产品文档与平台主从列表页规范 |
| 5 接口清单 / 7 前端实现节 · 固定资产 | 修改 | 列表仅状态 / 类别筛选；登记与编辑走弹窗；无详情接口与详情页 | 列表增加购入日期区间与购入日期 / 原值排序；新增 `GET /finance/assets/:id`；固定资产改为列表 + 详情 + 独立新建 / 编辑页（PageFrame），new/edit 路由 scope 为 `finance:manage` | 弹窗表单 7 字段超过平台适用线（≤6）；用户要求按表单 / 详情页规范拆分，并补日期筛选与排序 |
| 8 后置边界 | 修改 | 应收应付另立 | 应收已落地；边界改为应付、账龄 / 核销、对私消费统计、票据台账、折旧与处置损益、复式 | 按当前真相重写边界 |
| 2 数据模型 | 修改 | 流水无来源；资产含 account_id；账户类型含 BILL | 流水增加 source_type / source_id / source_code + 唯一约束；资产删除 account_id；账户 kind 删除 BILL 并定义级联矩阵；销售单增加结算方式 / 实收 / 收款账户快照 | 一次录入自动派生、账户级联、资产去冗余 |
| 3 计算规则 / 5 接口 / 6 联动 | 修改 | 销售单收入事件金额 = 合计；应收累计销售 = 合计 | 现结按实收、赊销按合计；应收的累计销售现结取实收；事件 / 资产 / 销售单接口增加联动字段；源单流水只读 | 抹零 / 约整与双线联动口径 |
| 7 前端实现节 | 修改 | 事件弹窗无联动；汇总页 7 卡；流水页全部可编辑 | 事件弹窗增加「同时登记收付款」；汇总页拆两个 Tab 并写 URL；流水页增加来源列、源单行只读；资产表单增加购置付款区并删除所属账户 | 一次录入自动派生与两个口径分离 |
| 9 数据迁移 | 新增 | 无 | 五步迁移：流水来源、销售单结算、资产删列、账户枚举重建、历史单按赊销 | 支撑模型变更安全上线 |

### v20261110

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立财务领域实现设计：finance 模块四件套、finance_events 表概览、符号与汇总纯函数、编号生成、接口清单、订单联动边界、web 前端实现节、后置边界 | 与 `product/finance.md` 配对，支撑 R-财务-001 落地 |
| 7 前端实现节 | 修改 | 新建 / 编辑为独立路由页面，保存后跳转详情 | 新建 / 编辑改为列表页与详情页内的弹窗表单（Dialog 受控、保存关闭并就地刷新、未保存改动拦截）；移除 `/new` 与 `/[id]/edit` 路由 | 字段少的表单按平台「弹窗表单」规范改为弹窗，减少页面跳转 |
| 7 前端实现节 | 修改 | 详情为独立路由页面（`/[id]`），列表「查看」跳转 | 详情改为列表页弹窗：`finance-event-detail-dialog.tsx`（数据取自列表项、`dl` 信息条、编辑仅手工并切换为编辑弹窗）；移除 `/[id]` 路由 | 财务事件为流水记录，详情与编辑同构、无需 URL 直达；平台弹窗规范同步扩展至弹窗详情 |
| 7 前端实现节 · 汇总页 | 修改 | 内容 `max-w-3xl`、页面不撑满高度、条数说明在筛选行 | 去最大宽度、整页弹性布局（分类表 `flex-1` + 表体内滚）、条数说明移卡片区下方右侧 | 与产品文档聚合页「铺满宽度 + 弹性高度」同步；修复宽屏空白 |
| 4 编号生成 | 修改 | 事件编号 `YYYYMM-####`：取发生日期年月 + 当月流水 | 改为 `FN-#####`：取 `FN-` 前缀最大流水 +1，不含日期；手工与自动事件共用同一序列 | 全局编号规范统一弃用日期前缀；`nextCode` 不再读取 `occurredDate` / `saleDate` |

---

*本文件为财务领域实现设计文档，与 `product/finance.md` 同名配对。*
