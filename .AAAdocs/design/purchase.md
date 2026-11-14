# 采购领域实现设计（purchase）

> 定位：采购领域的**实现设计**（How）。需求见 `product/purchase.md`（R-采购-001）。
> 全局约定见技术方案 §4（模块边界）/ §5（数据模型）/ §6（API 契约），本文件只写本领域落点，不重述约定。

---

## 1. 模块结构与职责

`modules/purchase` 为业务模块，遵循技术方案 §4.1 四件套模板：

```
modules/purchase/
├── purchase.controller.ts   # 采购单列表 / 详情 / 新建 / 更新 / 删除 / 供应商采购单数汇总
├── purchase.service.ts      # 校验、编号生成、金额计算、现结派生流水、改删联动
├── dto/                     # 契约形状（@nestjs/swagger class，供 OpenAPI 生成）；运行时校验用 @mcc/shared 的 zod schema
├── purchase.module.ts       # imports: SupplierModule、FinanceModule
└── index.ts                 # 唯一公开出口
```

- `purchase_orders` 表归本模块（数据所有权，技术方案 §4.2）。
- 采购单是**单头单据，无明细**；金额在保存时由 shared 纯函数重算后落账，不手填合计。
- 供应商只经公开接口校验与取快照，不读 suppliers 表；财务流水只经 `FinanceService` 派生，不写 finance 表。
- 累计采购、累计付款、应付不落在本模块；finance 对 `purchase_orders` 做只读聚合（不注入 PurchaseService，避免成环）。

## 2. 数据模型概览

> 细节归 `packages/db/prisma/schema.prisma`（表结构唯一事实源，技术方案 §5），此处只列概览与约定。

| 表 | 字段要点 | 备注 |
| --- | --- | --- |
| `purchase_orders` | 编号（唯一）、采购日期、供应商 id + 名称快照、送货吨数、结算吨数、单价、小计、其他金额、合计、结算方式、现结账户 id、实付金额、备注 | 通用字段按技术方案 §5.1；编号唯一按租户复合 `(tenant_id, code)`；`supplier_id` 外键 `RESTRICT`、`settle_account_id` 外键 `SET NULL`；索引 `(tenant_id, supplier_id)`、`(tenant_id, purchase_date)`；软删除 |

- 吨数 `decimal(12,3)`，单价 `decimal(12,2)`，金额 `decimal(18,2)`
- 枚举 `purchase_settlement_mode`：`CREDIT` / `SETTLED`（接口层 `credit` / `settled`）
- 结算方式为赊购时 `settle_account_id`、`paid_amount` 置 NULL
- 软删除；编号不回收；供应商名称快照保留

## 3. 计算规则（纯函数，`packages/shared`）

- 小计 `calcPurchaseSubtotal`：结算吨数 × 单价，四舍五入 2 位；
- 合计 `calcPurchaseTotal`：小计 + 其他金额；
- 金额运算以字符串 + BigInt 实现，禁浮点；纯函数单测为最高优先级
- 校验：送货吨数 > 0、结算吨数 > 0 且 ≤ 送货吨数、单价 ≥ 0、其他金额 ≥ 0、现结实付 ≥ 0
- 累计采购口径（供 finance）：现结取实付、赊购取合计

## 4. 编号生成

- 采购单编号 `PO-#####`：事务内取 `PO-` 前缀最大流水 +1，P2002 重试；只读、永不复用

## 5. 接口清单

| 接口 | 路径 | 用途 |
| --- | --- | --- |
| list | `GET /api/v1/purchase-orders` | 列表（筛选：编号模糊、供应商、供应商名称模糊、结算方式、采购日期区间；排序：`sortBy` = `purchaseDate` / `totalAmount`、`sortOrder` = `asc` / `desc`，默认采购日期倒序；分页；`summary` 为筛选全量合计金额） |
| detail | `GET /api/v1/purchase-orders/:id` | 详情 |
| create | `POST /api/v1/purchase-orders` | 新建（编号自动生成；现结同事务派生付款流水） |
| update | `PUT /api/v1/purchase-orders/:id` | 更新（同步金额、供应商、日期、账户与派生流水） |
| batch-delete | `POST /api/v1/purchase-orders/batch-delete` | 批量删除（body `{ ids }`，软删除；派生付款流水一并软删；不存在 / 已删行静默跳过，返回 `{ deleted }`） |
| remove | `DELETE /api/v1/purchase-orders/:id` | 软删除（派生流水一并软删） |
| supplier-summary | `GET /api/v1/purchase-orders/supplier-summary?supplierIds=` | 按供应商返回采购单数，供供应商删除确认文案 |

## 6. 与财务的联动（跨模块边界）

- 采购单现结由 **purchase 在同一事务内调用 finance 公开接口**完成：`PurchaseModule` 导入 `FinanceModule`，purchase 只调 `FinanceService`，不写 finance 表。
- `create`：仅现结生成一条付款流水——方向 `OUT`、金额 = 实付、账户 = 现结账户、供应商 = 采购单供应商、分类 = `PURCHASE_PAYMENT`、备注 = 采购单编号、源单类型 `purchase_order` + id + 编号；赊购不生成流水。
- `update`：按源单定位流水同步日期、金额、账户、供应商、备注；现结改赊购软删流水，赊购改现结补建；源单缺失则补建。
- `remove`：按源单软删付款流水。
- 源单唯一约束兜底防重复；源单流水在财务侧只读。
- 采购支出不进流水：由 finance 对采购单只读聚合（`R-财务-001`）。

## 7. 前端实现节（web）

- 列表页（`/admin/purchases`）：筛选 = 供应商 + 结算方式 + 采购日期区间（`DatePicker`，占位「开始日期」「结束日期」）；首列多选（本页全选，翻页 / 改筛选 / 改排序即清空选择），批量操作区 = 新建 + 有选中行时的批量删除（调 `batch-delete`，按钮带条数）；列 = 编号（主色链接进详情）、采购日期、供应商、送货吨数、结算吨数、单价、合计金额（右对齐）、结算方式、操作；采购日期与合计金额表头可点击切换正 / 倒序（换列默认倒序、回第 1 页），其余列不可排序；合计行为表格内粘性 `TableFooter`（筛选全量合计金额）；行操作 = 查看 / 编辑 / 删除（删除二次确认，文案说明派生付款流水一并删除、账户余额回退）；分页与表格规范按平台列表页
- 表单页（新建 / 编辑共用）：与销售单表单同构，分「主单」与「吨数与金额」两个 section；主单区两列，左列只放窄控件 = 采购单编号、采购日期、结算方式、实付金额（现结时），右列只放宽控件 = 供应商、付款账户（现结时）、备注，同列上下等宽；吨数与金额区 = 送货吨数、结算吨数、单价、小计（只读）、其他金额，区底合计条右对齐显示合计金额；小计与合计随输入用 shared 纯函数即时计算；所有控件宽度与销售单表单一致——标签左置右对齐（`w-24`），左列 `w-40`，右列 `w-full max-w-72`；备注用与销售单一致的 `Textarea`（`min-h-8 w-full max-w-72`，不锁死高度、可拖动拉高）；下拉与日期同高（`h-8`）、日期用 `DatePicker`、默认日期取本地时区；供应商下拉只列启用项，编辑历史单时若供应商已停用 / 删除经详情补快照；PC 用 `PageFrame`
- 详情页：与销售单详情同构——标题 = 「采购单 编号」+ 灰色小字「（供应商名）」；主信息卡（编号、供应商、采购日期、结算方式、现结账户与实付、创建日期、备注）+ 独立「吨数与金额」卡（送货吨数、结算吨数、单价、小计、其他金额、合计）；操作区只放编辑 / 返回列表，删除只在列表行操作
- 移动页：`/m/purchase/orders`（列表）、`/m/purchase/orders/new`、`/m/purchase/orders/[id]`、`/m/purchase/orders/[id]/edit`；`/m` 入口「采购」卡片 → `/m/purchase` 二级入口（采购单 / 供应商，整卡可点）；列表卡片 = 供应商 + 采购日期 + 合计 + 结算方式标签，搜索只有 `MobileListSearch`（`supplierName` 模糊，回车查询、清除、回第 1 页）；表单用 `MobileHeader`（编辑标题带编号）+ `MobileActionBar`（左合计右保存）、`Segmented` 选结算方式、`DatePicker size="touch"`、下拉 `h-12 px-3 text-mobile-body`、金额只读文本行、错误固定浮层；**详情用 `MobileInfoRow` + 固定标题「采购单详情」，主卡 + 「吨数与金额」分区，删除放内容区（描边 + 图标 + 失败提示）**；移动端不做批量；权限 `purchase:view` / `purchase:manage`
- 菜单与路由：菜单「采购 / 采购单」登记入 `product/平台布局.md`；`apps/web/lib/nav.ts` 增采购分组；`scopeForPath` 对 `/admin/purchases` 返回 `purchase:view`

## 8. 与其他领域的边界

- **supplier**：保存时经 `assertSelectable` 校验供应商存在且启用；名称快照落采购单；删除确认的采购单数取自本域 `supplier-summary`
- **finance**：现结派生付款流水经 `FinanceService.syncSourceCashEntry`；累计采购 / 应付归 finance，purchase 不实现；finance 只读聚合 `purchase_orders`，不注入 PurchaseService
- **生产与库存**：本轮不建；采购单保存即入库，无库存回写

---

## Changelog

> 变更纪律见 `0-文档驱动开发机制.md`。

### v20261114

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立采购领域实现设计：四件套、purchase_orders 表、金额纯函数、PO 编号、接口清单、财务联动、前端实现节、边界 | 与 `product/purchase.md` 配对，支撑 R-采购-001 落地 |
| 7 前端实现节 · 移动页 | 修改 | 采购单移动路由写作 `/m/purchase` 系列 | 改为 `/m/purchase/orders` 系列；`/m/purchase` 专作二级入口 | 与产品文档一致，入口与列表分层 |
| 7 前端实现节 | 修改 | 表单单卡堆字段；详情两列信息卡；移动详情自写行组件与底部条 | 表单分主单 / 吨数金额两区并加合计条；详情横排信息条 + 长文本卡；移动详情 / 表单改用 `MobileInfoRow`、`MobileActionBar`、`DatePicker`，采购列表补供应商与日期筛选 | 复用既有页面骨架与移动共用件，避免同类页面多套实现 |
| 3 计算规则 / 5 接口 | 修改 | 金额工具在本文件内自写一套缩放与舍入 | 改用 `packages/shared/src/money.ts` 公共工具；日期校验改用 `date.schemas.ts` | 财务 / 订单 / 采购三域共用一套金额与日期实现，避免规则漂移 |
| 5 接口 · list | 修改 | 查询参数只有 `supplierId` 精确筛选与日期区间 | 增 `supplierName`（名称快照模糊，与销售单 `customerName` 同构） | 移动采购列表改为供应商名称模糊搜索 |
| 7 前端实现节 · 移动页 / 详情 / 表单 | 修改 | 移动列表含供应商下拉与日期区间；表单标题不带编号、日期 UTC、结算下拉、金额用禁用输入框、错误内联；详情标题带编号、无分区、删除实心按钮 | 列表改 `MobileListSearch`；表单对齐销售单（编号标题、本地日期、`Segmented`、48px 下拉、单账户自动选中、差额提示、只读金额、错误浮层）；详情固定标题 + 主卡 + 吨数与金额分区 + 描边删除 | 与销售单移动页逐项同构 |
| 7 前端实现节 · PC 详情 / 表单 | 修改 | 详情单条信息卡 + 长文本卡；表单控件宽度混用 `w-40 / w-72`、日期用原生 date、默认日期 UTC | 详情改主信息卡（含备注）+ 独立吨数与金额卡；表单控件 `w-full` 等宽、`h-8` 下拉、`DatePicker`、本地默认日期 | 详情分区对齐销售单；表单消除宽度与日期控件差异 |
| 5 接口 · list | 修改 | 排序固定为采购日期倒序 | 增 `sortBy`（`purchaseDate` / `totalAmount`）+ `sortOrder`；service 动态 `orderBy`，`createdAt` 保留为次级排序 | PC 采购列表需要按采购日期 / 合计金额排序 |
| 7 前端实现节 · PC 列表 | 修改 | 日期筛选用原生 date 输入；采购日期表头不可排序 | 日期筛选改 `DatePicker`；采购日期与合计金额表头改 `SortHead`，换列默认倒序并回第 1 页 | 与销售单列表同构 |
| 7 前端实现节 · PC 表单 / 详情 | 修改 | 表单控件 `w-full` 撑满两列网格、标签顶部对齐；详情标题为「供应商名（编号）」 | 表单标签左置右对齐、控件固定宽度（`w-40` / `max-w-72`）与销售单一致；详情标题改「采购单 编号（供应商名）」 | 消除与销售单的控件宽度与标题主次差异 |
| 7 前端实现节 · PC 表单 | 修改 | 主单单网格按字段顺序排，窄控件（编号 / 日期 / 结算方式 / 实付）与宽控件（供应商 / 付款账户 / 备注）交错在同一列；备注与折价说明多行高度把同排控件挤成垂直居中 | 主单改两列容器：左列只放窄控件（`w-40`）、右列只放宽控件（`max-w-72`），条件项只在各自列内出现；备注与折价说明改单行起始高（`h-8` + `resize-y`） | 同列宽度交错、上下行不齐；对齐销售单「按列分档」的宽度规则 |
| 2 数据模型 / 3 计算规则 / 7 前端实现节 | 删除 | `purchase_orders.discount_note` 列；`purchaseInputSchema.discountNote` 与「送货 ≠ 结算须填折价说明」校验；PC / 移动表单与详情的折价说明展示 | 删除字段、校验与全部展示；新增迁移 `20261114120000_purchase_drop_discount_note` 删除该列 | 折价已由送货吨数与结算吨数两个数字体现，文字说明重复且增加录单负担 |
| 7 前端实现节 · PC 列表 | 修改 | 筛选含编号模糊输入（`filters.code` 传 `code` 参数） | 删除编号筛选控件与 `filters.code`；接口保留 `code` 查询参数 | 与销售单列表筛选结构一致 |
| 7 前端实现节 · PC 表单备注 | 修改 | 备注 `h-8 min-h-8 px-2.5 py-1 resize-y rounded-lg`，固定单行高 | 改为与销售单一致的 `min-h-8 w-full max-w-72`，保留默认内边距、可拖动拉高 | 单行过矮，多行备注不便录入 |
| 5 接口清单 / 7 前端实现节 · PC 列表 | 新增 | 列表只有单行删除，无多选与批量动作 | 增 `batch-delete`（`POST /api/v1/purchase-orders/batch-delete`，`{ ids }`，软删除 + 派生流水软删，返回 `{ deleted }`）；前端补首列多选 / 本页全选 / 批量删除按钮 / 二次确认 / 翻页与筛选清空选择 | 用户要求采购单列表支持批量删除，对齐销售单列表 |
