# 订单领域实现设计（order）

> 定位：订单领域的**实现设计**（How）。需求见 `product/order.md`（R-订单-001）。
> 全局约定见技术方案 §4（模块边界）/ §5（数据模型）/ §6（API 契约），本文件只写本领域落点，不重述约定。

---

## 1. 模块结构与职责

`modules/order` 为业务模块，遵循技术方案 §4.1 四件套模板：

```
modules/order/
├── order.controller.ts   # 销售单列表 / 详情 / 新建 / 更新 / 删除（软删）
├── order.service.ts      # 校验、编号生成、计算落账、软删除
├── dto/                  # 契约形状（@nestjs/swagger class，供 OpenAPI 生成）；运行时校验用 @mcc/shared 的 zod schema
├── order.module.ts
└── index.ts              # 唯一公开出口
```

- 计算纯函数（方量、金额、舍入）放 `packages/shared`，服务端落账与 web 实时预览调用同一套函数。
- `sale_order`、`sale_order_item` 两表归本模块（数据所有权，技术方案 §4.2）。

## 2. 数据模型概览

> 细节归 `packages/db/prisma/schema.prisma`（表结构唯一事实源，技术方案 §5），此处只列概览与约定。

| 表 | 字段要点 | 备注 |
| --- | --- | --- |
| `sale_order` | 编号（唯一）、销售日期、客户名称（文本）、合计方量、小计金额、其他金额、合计金额、备注 | 通用字段（主键、`tenant_id`、`created_at/updated_at`、`deleted_at`）按技术方案 §5.1；编号唯一约束按租户复合 `(tenant_id, 编号)` |
| `sale_order_item` | 行序、产品类型、长度/宽度/厚度（cm）、根数、方量、单价、小计金额、其他金额、备注、所属销售单 | 通用字段同上按 §5.1 |

- 金额与尺寸一律 Decimal，禁止浮点（§5.1）；精度按需求口径：方量 4 位、金额 2 位
- 产品类型存可读字符串枚举 `board` / `other`（§6.5 禁魔法数字）
- 合计方量 / 小计金额 / 合计金额为主表落账快照：每次保存按明细重算写入，不手填；
  - 主表小计金额 = Σ明细（小计金额 + 其他金额）；主表合计金额 = 主表小计金额 + 主表其他金额
- 删除 = 软删除（§5.1 `deleted_at` 落值）：编号不回收，列表默认过滤已删
- 客户为纯文本 `customer_name` 列；customer 域建成后回迁外键（迁移纪律 §5.3：先加列、双写、再切读）

## 3. 计算规则（纯函数，`packages/shared`）

- 方量（板材行）= round4(厚cm/100 × 宽cm/100 × 长cm/100 × 根数)，四舍五入
- 板材行小计金额 = round2(方量 × 单价)
- 单行金额 = 小计金额 + 其他金额（「其他」类型：小计金额 = 手填行金额）
- 逐行舍入后落账；主表合计方量 = Σ明细方量，主表小计金额 = round2(Σ单行金额)
- 纯函数单测为最高优先级（技术方案 §10 测试策略：计算类逻辑纯函数化）

## 4. 编号生成

- 主单编号 `YYYYMM-####`：保存时事务内取当月最大流水 +1 生成；唯一约束兜底并发冲突
- 明细编码 = 主单编号 + 行序（两位）。行序在行创建时分配；行软删后行序作废、编号不回改、不重排
- 编号只读、永不复用

## 5. 接口清单

> 契约由 NestJS 装饰器代码生成 OpenAPI（技术方案 §6.1 / ADR-006），本文不手写参数与响应细节，只列清单。

| 接口 | 路径 | 用途 |
| --- | --- | --- |
| list | `GET /api/v1/sale-orders` | 列表（筛选：销售日期区间、客户名称；排序：saleDate / totalVolume / totalAmount，asc / desc，默认日期倒序；分页；响应含 `summary` 汇总——对筛选全量、排除分页） |
| detail | `GET /api/v1/sale-orders/:id` | 详情（含明细） |
| create | `POST /api/v1/sale-orders` | 新建（幂等见 §6.3 Idempotency-Key） |
| update | `PUT /api/v1/sale-orders/:id` | 更新（整单提交：明细重算落账） |
| remove | `DELETE /api/v1/sale-orders/:id` | 删除（软删除，编号不回收） |
| batch-delete | `POST /api/v1/sale-orders/batch-delete` | 批量删除（body `{ ids }`，软删除，返回删除条数；不存在/已删行静默跳过） |

## 6. 后置边界（本轮不建）

- 收款记录、欠款余额：本模块不建，finance 域建成后另立需求（见 `product/order.md` 待补注记）
- 客户档案：不建 customer 表，不读他模块表（技术方案 §4.2 禁止穿透）

## 7. 前端实现节（web）

- 列表页（`/admin/sale-orders`）：筛选 / 多选 / 排序 / 分页按列表页模式（组件拼装见 `design/平台布局.md` §1.5）；排序参数随请求下发（sortBy / sortOrder），批量删除调 batch-delete；路由与菜单随菜单表（`design/平台布局.md` §1.3 静态配置）登记更新
- 表单页：明细行动态增删（行操作 = 复制 / 删除，图标按钮）；复制为深拷贝当前行（去行 id，追加末尾，达 50 行禁用，新增行滚动到可见）；根数用文本输入 + `inputMode="numeric"`（不显示步进器），类型下拉按最小宽度 `w-24` 摆放；按产品类型切换字段显隐；输入时实时调用 `packages/shared` 计算纯函数显示方量 / 小计 / 合计（与服务端落账同源）；面包屑标识经 `usePageCrumb` 注入壳（新建 =「新建」；编辑 =「单号 / 编辑」，单号链接回详情）
- 保存：整单提交（主表 + 明细），服务端重算校验后落账并回传
- 详情页：只读展示 + 编辑入口；面包屑标识经 `usePageCrumb` 注入壳（单号）

---

## Changelog

> 变更纪律见 `0-文档驱动开发机制.md`。

### v20261109

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立订单领域实现设计：order 模块四件套、sale_order / sale_order_item 表概览、计算纯函数约定、编号生成、接口清单、后置边界、web 前端实现节 | 与 `product/order.md` 配对，支撑 R-订单-001 落地 |
| 5 接口清单 list | 修改 | 列表仅支持筛选与分页 | 列表增加排序参数：sortBy（saleDate / totalVolume / totalAmount）与 sortOrder（asc / desc），默认销售日期倒序 | 表头正倒序排序落地（页面模式规范） |
| 5 接口清单 | 新增 | — | 增补 batch-delete：`POST /api/v1/sale-orders/batch-delete`，body `{ ids }`，软删除并返回删除条数 | 列表页批量删除（页面模式规范多选/批量操作） |
| 7 前端实现节 | 修改 | 列表页仅「筛选 + 表格 + 分页」 | 补多选与批量删除（调 batch-delete）、排序参数（sortBy / sortOrder）、行操作图标；通用规则引用 `design/平台布局.md` §1.5 | 前端实现节未同步多选 / 排序 / 批量删除，避免实现者漏做 |
| 7 前端实现节 | 修改 | 表单页仅「明细行动态增删、切换显隐、实时计算」 | 补复制行实现（深拷贝去 id、追加末尾、达上限禁用、新增行滚动可见）与控件口径（根数文本输入无步进器、类型下拉最小宽度 w-24） | 用户反馈：新增复制行操作；修复根数与类型控件被挤压裁切 |
| 5 接口清单 list | 修改 | 列表响应仅 total + items | 增 `summary`（totalVolume / subtotalAmount / otherAmount / totalAmount），由筛选条件 aggregate 得出、排除分页 | 列表页固定合计行（范围为筛选全量） |
| 7 前端实现节 | 修改 | 表单 / 详情页未说明面包屑标识来源 | 补：页面经 `usePageCrumb` 向壳注入面包屑标识（新建 =「新建」；编辑 =「单号 / 编辑」；详情 = 单号） | 子页面在顶栏面包屑中需可辨识（product/平台布局.md 整体布局同步） |

---

*本文件为订单领域实现设计文档，与 `product/order.md` 同名配对。*