# 供应商领域实现设计（supplier）

> 定位：供应商领域的**实现设计**（How）。需求见 `product/supplier.md`（R-供应商-001）。
> 全局约定见技术方案 §4（模块边界）/ §5（数据模型）/ §6（API 契约），本文件只写本领域落点，不重述约定。

---

## 1. 模块结构与职责

`modules/supplier` 为业务模块，遵循技术方案 §4.1 四件套模板：

```
modules/supplier/
├── supplier.controller.ts   # 列表 / 详情 / 新建 / 更新 / 状态切换 / 重名检查 / 删除
├── supplier.service.ts      # 校验、编号生成、重名检查、状态流转、期初应付
├── dto/                     # 契约形状（@nestjs/swagger class，供 OpenAPI 生成）；运行时校验用 @mcc/shared 的 zod schema
├── supplier.module.ts
└── index.ts                 # 唯一公开出口（供 purchase 校验供应商、finance 取名称快照与期初应付）
```

- `suppliers` 表归本模块（数据所有权，技术方案 §4.2）。
- 累计采购、累计付款、应付都**不落在本模块**：由 finance 实时聚合，本领域只在页面消费，不读采购表、不建冗余列；唯一例外是期初应付（上线前余额的录入源）。

## 2. 数据模型概览

> 细节归 `packages/db/prisma/schema.prisma`（表结构唯一事实源，技术方案 §5），此处只列概览与约定。

| 表 | 字段要点 | 备注 |
| --- | --- | --- |
| `suppliers` | 编号（唯一）、名称、联系方式、期初应付、状态、备注 | 通用字段（主键、`tenant_id`、`created_at/updated_at`、`deleted_at`）按技术方案 §5.1；编号唯一按租户复合 `(tenant_id, code)` |

- 名称不建唯一索引，重名只提示不阻断；重名为服务层查询
- 状态存可读字符串枚举 `active` / `inactive`
- 期初应付 `opening_payable` 为 `decimal(14,2)`，非空、默认 `0.00`、校验 ≥ 0；只作 finance 计算应付的基数，不计入累计采购与经营收支
- 删除为软删除；编号不回收，历史采购单靠名称快照保留

## 3. 编号生成

- 供应商编号 `SP-#####`：保存时事务内取 `SP-` 前缀的最大流水 +1 生成；唯一约束兜底并发，冲突重试
- 租户内递增，超出 5 位自然进位；只读、永不复用，停用不回收

## 4. 状态流转

| 动作 | 允许条件 | 结果 |
| --- | --- | --- |
| 停用 | 当前启用 | 状态置 `inactive`；历史采购单不受影响，新建采购单不再可选 |
| 启用 | 当前停用 | 状态置 `active` |

- 状态切换记审计；停用不做在途单据校验

## 5. 接口清单

| 接口 | 路径 | 用途 |
| --- | --- | --- |
| list | `GET /api/v1/suppliers` | 列表（筛选：名称模糊、状态；排序：`sortBy` = `createdAt`、`sortOrder` = `asc` / `desc`，默认倒序；分页） |
| detail | `GET /api/v1/suppliers/:id` | 详情 |
| create | `POST /api/v1/suppliers` | 新建（编号自动生成；重名仅回提示） |
| update | `PUT /api/v1/suppliers/:id` | 更新（名称、联系方式、期初应付、备注） |
| set-status | `PATCH /api/v1/suppliers/:id/status` | 启用 / 停用 |
| batch-status | `POST /api/v1/suppliers/batch-status` | 批量启用 / 停用，返回实际变更条数 |
| remove | `DELETE /api/v1/suppliers/:id` | 软删除 |
| batch-delete | `POST /api/v1/suppliers/batch-delete` | 批量软删除 |
| name-check | `GET /api/v1/suppliers/name-check?name=&excludeId=` | 重名检查 |

**公开接口**：

- `assertSelectable(id)`：校验供应商存在且启用；purchase 新建或更换供应商时调用
- `findById(id)`：取供应商基本信息（含已软删记录与 `deleted` 标志），供 finance 取名称快照
- `findOpeningPayables(ids)`：批量取期初应付，返回 `id → 金额字符串` 映射，供 finance 批量计算应付；含已软删记录

## 6. 前端实现节（web）

- 列表页（`/admin/suppliers`）：筛选 / 排序 / 分页按列表页模式，创建日期表头可点击切换正 / 倒序（默认倒序、切换后回第 1 页）；首列多选与批量启用 / 停用 / 删除；列表只调 `GET /api/v1/finance/payables?supplierIds=`（每批 ≤200）取 `outstanding` 一列；接口失败显示 `0.00`，不阻断加载
- 表单页：新建与编辑共用；编号新建只读占位「系统生成」、编辑只读真实编号；名称失焦调 `name-check`；字段 = 名称、联系方式、期初应付、备注；PC 用 `PageFrame`
- 详情页：与客户详情同构——横排信息条（编号、名称、状态、创建日期、期初应付非 0、累计采购、累计付款、应付）+ 联系信息 / 备注长文本卡；只读 + 编辑，操作区只放编辑 / 返回列表；应付三项单 id 调 finance 批量接口
- 移动页（`/m/purchase/suppliers`、`/new`、`/[id]`、`/[id]/edit`）：列表用移动列表骨架（搜索按名称）、卡片显示名称 + 应付 + 状态；详情固定标题「供应商详情」，`MobileInfoRow` 展示应付三项与联系信息，状态标签在名称右侧，`supplier:manage` 提供停用（二次确认）/ 启用（直接）/ 删除（描边 + `Trash2Icon` + 失败提示，确认前调 `supplier-summary` 取采购单数）；加载 / 失败用 `MobileListState`；底部 `MobileActionBar` 只放编辑 / 返回列表；表单用 `MobileActionBar`，控件高 48px；移动端不展示编号、不做批量；权限 `supplier:view` / `supplier:manage`
- 菜单与路由：菜单「采购 / 供应商」登记入 `product/平台布局.md` 菜单表；`apps/web/lib/nav.ts` 增采购分组；`scopeForPath` 对 `/admin/suppliers` 返回 `supplier:view`

## 7. 与其他领域的边界

- **purchase**：采购单保存时经 `assertSelectable` 校验供应商存在且启用，不读 suppliers 表；采购单保留名称快照
- **finance**：应付（累计采购 / 累计付款 / 应付）归 finance，经 `GET /api/v1/finance/payables` 批量引用；finance 取供应商名称快照经 `findById`、取期初应付经 `findOpeningPayables`，不直读 suppliers 表；supplier 不预留金额列，唯一例外是期初应付

---

## Changelog

> 变更纪律见 `0-文档驱动开发机制.md`。

### v20261114

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 全文 | 新增 | — | 建立供应商领域实现设计：四件套、suppliers 表、SP 编号、状态流转、接口清单（含公开接口）、前端实现节、边界 | 与 `product/supplier.md` 配对，支撑 R-供应商-001 落地 |
| 6 前端实现节 | 修改 | 详情两列信息卡；移动详情自写行组件；删除混在底部操作 | 详情横排信息条 + 长文本卡；移动详情用 `MobileInfoRow`、底部 `MobileActionBar` 只放编辑 / 返回，删除放内容区 | 复用客户页的详情骨架与移动共用件 |
| 6 前端实现节 · 移动详情 | 修改 | 标题用供应商名称；状态纯文字；无启停用；删除实心按钮；加载 / 失败普通文本；负数应付按原值 | 固定标题 + 状态标签；停用 / 启用入口；描边删除 + 图标 + 失败提示；`MobileListState`；负数应付显示「（预付）」 | 与客户移动详情同构，补齐入口与金额语义 |
| 5 接口清单 / 6 前端实现节 · 列表排序 | 修改 | list 固定按 `createdAt` 倒序，表头不可点 | list 增加 `sortBy`（`createdAt`）+ `sortOrder`（`asc` / `desc`）；列表「创建日期」表头可切换正 / 倒序（默认倒序、切换后回第 1 页），`orderBy` 以 `code` 作次级排序保证翻页稳定 | 与销售单 / 采购单列表的排序契约一致 |
