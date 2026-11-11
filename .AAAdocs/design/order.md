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
| `sale_order` | 编号（唯一）、销售日期、客户外键、客户名称快照、合计方量、小计金额、其他金额、合计金额、备注 | 通用字段（主键、`tenant_id`、`created_at/updated_at`、`deleted_at`）按技术方案 §5.1；编号唯一约束按租户复合 `(tenant_id, 编号)`；客户外键建索引 |
| `sale_order_item` | 行序、产品类型（固定方木）、长度/宽度/高度（整数 mm）、根数、计价方式、方量、单价、小计金额、其他金额、备注、所属销售单 | 通用字段同上按 §5.1；尺寸为整数 `Int`，方量非空 |

- 金额与尺寸一律 Decimal / Int，禁止浮点（§5.1）；精度按需求口径：方量 4 位、金额 2 位、尺寸整数毫米
- 产品类型枚举当前**仅一个值** `SQUARE_TIMBER`（方木），服务端固定写入，接口创建/更新不接收；详情/列表响应返回，供展示与未来扩展
- 计价方式枚举 `pricing_mode`：`VOLUME`（默认）/ `PIECE`，行级；金额列与单价列复用，单价单位随计价方式变化
- 方量对每一行**非空**：无论按方量还是按根数计价都计算落库（工资依据）
- 合计方量 / 小计金额 / 合计金额为主表落账快照：每次保存按明细重算写入，不手填；
  - 主表小计金额 = Σ明细（小计金额 + 其他金额）；主表合计金额 = 主表小计金额 + 主表其他金额
- 删除 = 软删除（§5.1 `deleted_at` 落值）：编号不回收，列表默认过滤已删
- **客户 = 引用 + 快照**：`customer_id` 外键指向 `customer` 表（`product/customer.md` R-客户-001），用于归属与聚合；`customer_name` 保留为下单当时的名称快照，客户改名不回改历史单据。跨模块只经 customer 的 `index.ts` 公开接口校验，不读 customer 表（§4.2）
- 迁移纪律（§5.3）：先加 `customer_id` 列并回填存量 → 切读 → 再评估下线名称直填入口
- **本次迁移（v20261110，破坏性、已授权）**：正式库无订单数据，测试库按序执行
  1. 新建只含 `SQUARE_TIMBER` 的产品类型枚举与 `VOLUME`/`PIECE` 计价方式枚举；明细表加 `pricing_mode`，默认 `VOLUME`
  2. 删除 `product_type = 'OTHER'` 的明细
  3. 删除因此变成零明细的主单
  4. 新增 `thickness_mm` / `width_mm` / `length_mm` 整数列，按 `ROUND(cm × 10)` 回填
  5. 用新尺寸重算剩余明细的 `volume_m3` 与 `line_amount`（默认按方量）
  6. 重算受影响主单的 `total_volume` / `subtotal_amount` / `total_amount`
  7. 删除旧 cm 列与旧枚举，`volume_m3`、`pieces`、`pricing_mode` 收紧为非空
  8. 尺寸列叫法与顺序统一（追加迁移，非破坏）：`thickness_mm` 重命名为 `height_mm`，数据保留；接口字段同步为 `heightMm`，顺序为长度 / 宽度 / 高度

## 3. 计算规则（纯函数，`packages/shared`）

- 方量 = round4(长mm × 宽mm × 高mm × 根数 ÷ 10⁹)，四舍五入；**每一行都计算**
- 按方量行小计金额 = round2(方量 × 单价)
- 按根数行小计金额 = round2(根数 × 单价)
- 单行金额 = 小计金额 + 其他金额
- 逐行舍入后落账；主表合计方量 = Σ明细方量，主表小计金额 = round2(Σ单行金额)
- 纯函数单测为最高优先级（技术方案 §10 测试策略：计算类逻辑纯函数化）

## 4. 编号生成

- 主单编号 `SO-#####`：保存时事务内取 `SO-` 前缀的最大流水 +1 生成（不含日期）；唯一约束兜底并发冲突
- 明细编码 = 主单编号 + 行序（两位）。行序在行创建时分配；行软删后行序作废、编号不回改、不重排
- 编号只读、永不复用

## 5. 接口清单

> 契约由 NestJS 装饰器代码生成 OpenAPI（技术方案 §6.1 / ADR-006），本文不手写参数与响应细节，只列清单。

| 接口 | 路径 | 用途 |
| --- | --- | --- |
| list | `GET /api/v1/sale-orders` | 列表（筛选：销售日期区间、客户 id、客户名称快照模糊 `customerName`；排序：saleDate / totalVolume / totalAmount，asc / desc，默认日期倒序；分页；响应含 `summary` 汇总——对筛选全量、排除分页） |
| detail | `GET /api/v1/sale-orders/:id` | 详情（含明细）；客户编号经 customer 公开接口读取（含已删档案），并返回 `customerDeleted` 供界面标注「已删除」 |
| create | `POST /api/v1/sale-orders` | 新建（幂等见 §6.3 Idempotency-Key；保存前经 customer 公开接口校验客户存在且启用，并按客户当前名称写入 `customer_name` 快照） |
| update | `PUT /api/v1/sale-orders/:id` | 更新（整单提交：明细重算落账；客户未变更时不校验启用态，允许历史单保存；变更客户时重取名称快照） |
| remove | `DELETE /api/v1/sale-orders/:id` | 删除（软删除，编号不回收） |
| batch-delete | `POST /api/v1/sale-orders/batch-delete` | 批量删除（body `{ ids }`，软删除，返回删除条数；不存在/已删行静默跳过） |
| customer-volume-summary | `GET /api/v1/sale-orders/customer-volume-summary?customerIds=` | 客户维度累计方量汇总：对未软删销售单按 `customer_id` 聚合 `total_volume` 与 `orderCount`（订单数），供客户列表页与详情页批量取数与删除确认（`product/customer.md` 只引用不重述） |

## 6. 后置边界（本轮不建）

- 收款记录、欠款余额：本模块不建，finance 域建成后另立需求（见 `product/order.md` 待补注记）
- 客户档案：归 `customer` 模块（`design/customer.md`），本模块只经其公开接口校验并保存外键，不读 customer 表（技术方案 §4.2 禁止穿透）

## 7. 前端实现节（web）

- **多端变更清单**：修改销售单的字段、校验、计算或交互时，按序核对——`packages/shared`（schema / 计算纯函数）→ `apps/server`（DTO / service）→ 重建契约（`gen:openapi` / `gen:client`）→ PC 表单 / 列表 / 详情（`components/order/sale-order-form.tsx`、`app/admin/sale-orders/**`）→ 移动端表单 / 列表 / 详情（`components/mobile/sale-order-form.tsx`、`app/m/sale-orders/**`）→ PC 与移动 E2E；移动端不展示编号等差异按 `product/order.md` 移动页口径处理，不可直接照搬 PC。
- **PC 页面骨架**：新建 / 编辑 / 详情统一用 `components/admin/page-frame.tsx`——标题区与底部操作区固定、中间内容区滚动；表单的 `<form>` 包裹 `PageFrame`，保存按钮 `type="submit"` 放操作区；详情标题含单号 + 客户括注，编辑 / 打印 / 返回列表放操作区；详情明细表 `containerClassName="max-h-[420px] overflow-y-auto"` + 表头 sticky。
- 列表页（`/admin/sale-orders`）：筛选 / 多选 / 排序 / 分页按列表页模式（组件拼装见 `design/平台布局.md` §1.5）；客户筛选项为下拉（数据源 customer 列表接口，含停用客户，按 `customerId` 下发），列显示 `customerName` 快照；排序参数随请求下发（sortBy / sortOrder），批量删除调 batch-delete；路由与菜单随菜单表（`design/平台布局.md` §1.3 静态配置）登记更新
- 表单页：客户为下拉选择（数据源 customer 列表接口，只列启用客户；编辑历史单且其客户已停用或已删除时，用单据自带的 `customerId + customerName` 快照补一个选项并保持选中，不再请求客户档案，否则单据无法保存）；明细行动态增删（行操作 = 复制 / 删除，图标按钮）；复制为深拷贝当前行（去行 id，追加末尾，达 200 行禁用，新增行滚动到可见）；尺寸列顺序为长度、宽度、高度，均用文本输入 + `inputMode="numeric"`（整数毫米、不显示步进器），根数同样文本输入，计价方式下拉（按方量 / 按根数，最小宽度 `w-24`），单价标签随计价方式切换为「元/m³」或「元/根」；小计金额两种方式下均只读；输入时实时调用 `packages/shared` 计算纯函数显示方量 / 小计 / 合计（与服务端落账同源）；面包屑标识经 `usePageCrumb` 注入壳（新建 =「新建」；编辑 =「单号 / 编辑」，单号链接回详情）
- 保存：整单提交（主表 + 明细，明细不含 `productType`），服务端固定写入方木、重算校验后落账并回传；服务端经 customer 公开接口校验客户启用态，客户未变更的更新不校验
- 详情页：只读展示 + 编辑入口；信息条展示客户编号与名称快照、产品类型（方木）；客户档案已删除时编号后缀标注「已删除」；明细单价按行标注「元/m³」或「元/根」，不单列计价方式；面包屑标识经 `usePageCrumb` 注入壳（单号）
- 移动页（移动 Web `/m`，ADR-011）：路由 `/m`（入口卡片）、`/m/sale-orders`（搜索 + 卡片列表 + 加载更多；搜索按 `customerName` 模糊，回车即查、查询后回第 1 页并清空已加载数据；卡片层级 = 销售日期大号 + 客户名称在上、合计方量 + 合计金额在下；统一使用 `components/mobile/list.tsx` 的搜索框 / 卡片 / 加载更多 / 空态）、`/m/sale-orders/new`、`/m/sale-orders/[id]`（详情）、`/m/sale-orders/[id]/edit`；**移动端不展示销售单编号、客户编号与明细编码**（PC 与打印单据保留，接口字段不删）；详情页在明细下方提供「删除销售单」（`order:manage` 才渲染，`useConfirm` 二次确认，`DELETE /api/v1/sale-orders/{id}` 成功后 `router.replace('/m/sale-orders')`）；壳用 `components/mobile/mobile-shell.tsx`（`data-mode="mobile"`，无侧边栏 / 标签页 / 面包屑），页面自带底部固定操作条；表单组件 `components/mobile/sale-order-form.tsx` 为新建 / 编辑共用，状态与校验沿用 PC 表单口径（`saleOrderUpdateSchema`、`calcVolumeM3` / `calcLineAmount` / `calcOrderTotals` 同源），明细逐行卡片、行内两列栅格、数字字段 `inputMode="numeric"`；保存成功跳 `/m/sale-orders/{id}`；不新增后端接口

## 8. 打印实现（web）

规则（入口、版式、单联、PDF 口径）以 `product/order.md` R-订单-002 与 `product/平台布局.md`「打印预览弹窗」为准，本节只写实现：

- **组件**：`components/order/sale-order-print.tsx` 为 A4 单联模板（纯展示，入参 = 详情订单 DTO；抬头「梅好木业」、单据名、单据信息、明细表、合计、备注、签字栏固定为「客户」；不打印明细编码）；`components/order/print-preview-dialog.tsx` 为大尺寸弹窗（左侧预览、右侧操作栏、打印/关闭）
- **入口**：详情页操作区加「打印」，打开弹窗；不跳转、不新开标签页、不新增路由，不产生面包屑与多标签页
- **预览缩放**：左侧容器按可用空间对 210×297mm 白纸做等比缩放（`ResizeObserver` + CSS `zoom`）；白纸内边距 12mm 10mm，与 `@page` 边距一致
- **打印隔离**：点击打印创建隐藏 iframe，复制主文档 `<style>` 与 `link[rel=stylesheet]`，注入 `@page { size: A4; margin: 12mm 10mm }`、`thead { display: table-header-group }`、`tr { break-inside: avoid }` 等规则，用 `createRoot` 渲染同一模板后调用 `iframe.contentWindow.print()`；`afterprint` 后卸载并移除 iframe，打印样式不写入主文档
- **打印提示**：弹窗操作栏提示「如出现浏览器页眉页脚（时间、网址等），请在打印对话框中取消勾选页眉和页脚」；页面不尝试用 CSS 关闭浏览器页眉页脚（避免多页贴边）
- **数据**：复用详情查询 `['sale-order', id]` 的已加载数据，打印端只展示、不重算；客户档案已删除时名称后标注「已删除」
- **验证**：E2E 在详情页打开打印弹窗，断言单号、客户、明细与合计可见、A4 模板容器存在，ESC 可关闭；实际打印效果以浏览器打印预览与「另存为 PDF」人工验收（A4 分页、表头重复、单行不截断）

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
| 7 前端实现节 | 修改 | 复制明细行达 50 行禁用 | 达 200 行禁用 | 与服务端 zod 明细上限 200 统一，消除前端 50 / 服务端 200 两套口径 |
| 2 数据模型概览 | 修改 | 客户为纯文本 `customer_name` 列；customer 域建成后回迁外键 | `customer_id` 外键 + `customer_name` 名称快照并存；外键建索引；跨模块经 customer 公开接口校验，不读其表 | customer 域建成，回迁外键；名称保留快照以免客户改名改写历史单据 |
| 5 接口清单 | 修改 | list 按客户名称筛选 | 改按客户 id 筛选；create 增加客户启用态校验；update 在客户未变更时不校验 | 与客户外键化同步；历史单客户停用后仍需可保存 |
| 5 接口清单 | 新增 | — | 增补 customer-volume-summary：按客户 id 批量聚合未软删销售单的 `total_volume` | 客户列表页与详情页需展示累计下单方量（`product/customer.md` 只引用不重述） |
| 6 后置边界 | 修改 | 客户档案：不建 customer 表，不读他模块表 | 客户档案归 customer 模块，本模块只经其公开接口校验并保存外键 | 与 customer 域建成后的事实对齐 |
| 7 前端实现节 | 修改 | 表单 / 列表无客户下拉口径 | 补客户下拉（启用才可选；历史单已停用则补入并保留）、列表筛选与详情信息条口径 | 客户字段由文本改为外键选择，前端实现需同步 |
| 2 数据模型概览 / 5 接口清单 / 7 前端实现节 | 修改 | 客户档案不可删除；详情只显示客户编号；汇总接口只返回方量 | 客户档案支持软删除：findById 含已删并返回 deleted，详情返回 customerDeleted 并标注「已删除」；汇总接口增 `orderCount`；编辑历史单时已停用/已删客户用单据快照补选项，不再查档案 | 客户域新增删除规则；删除后历史单仍需可读可编辑，且删除确认需要销售单数量 |

### v20261110

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 2 数据模型概览 / 3 计算规则 / 5 接口清单 / 7 前端实现节 | 修改 | 产品类型 `board` / `other`；尺寸 cm、3 位小数；其他行无尺寸、手填行金额；方量仅板材有 | 产品类型枚举仅 `SQUARE_TIMBER`，服务端固定写入、请求不接收；尺寸改整数 mm；新增行级 `pricing_mode`（`VOLUME` 默认 / `PIECE`），按根数时行金额 = 根数 × 单价；方量对所有行非空；方量公式改为 mm ÷ 10⁹ | 新调研：产品统一为方木、尺寸标准为毫米；所有产品需方量作为工资依据；极少数按根数售卖 |
| 2 数据模型概览 · 迁移 | 新增 | 无迁移计划 | 补七步破坏性迁移：建新枚举与计价列 → 删 OTHER 明细 → 删空主单 → 新增整数 mm 列并回填 → 重算明细 → 重算主单 → 删旧列/旧枚举并收紧非空 | 新模型不再支持无尺寸产品行；经确认正式库无数据、测试库直接清理 |
| 7 前端实现节 | 修改 | 表单按类型切换字段显隐、cm 输入、单价固定元/m³；详情单价无单位 | 表单去掉类型切换、加计价方式、mm 整数输入、单价单位随模式切换、小计只读；详情信息条显示方木、单价按行标注单位 | 产品类型单值化且不再驱动计算；界面围绕计价方式与毫米单位调整 |
| 2 数据模型概览 / 迁移 / 3 计算规则 / 7 前端实现节 | 修改 | 尺寸字段为 `thicknessMm` / `thickness_mm`，列与公式顺序为厚、宽、长 | 字段改 `heightMm` / `height_mm`，列与公式顺序统一为长度、宽度、高度；追加第 8 步迁移（`RENAME COLUMN thickness_mm TO height_mm`，非破坏）；`calcVolumeM3(lengthMm, widthMm, heightMm, pieces)` 参数顺序同步 | 用户指出业务叫法与录入顺序应为长宽高；首列「厚度」1000mm 上限会诱导长度误填并报「厚度超出合理范围」 |
| 8 打印实现 | 新增 | — | 新增打印实现节：A4 单联模板组件、打印预览弹窗（左侧缩放预览 + 右侧操作栏）、隐藏 iframe + 样式复制 + `createRoot` + `print()` 的打印隔离、复用详情数据不重算、E2E 与人工打印验收 | 落地 R-订单-002；预览与打印共用同一模板，打印样式不污染主文档 |
| 8 打印实现 | 修改 | 签字栏为制单 / 司机 / 客户；未说明浏览器页眉页脚 | 签字栏固定为「客户」；操作栏提示“如出现浏览器页眉页脚，在打印对话框中取消勾选”，不用 CSS 关闭页眉页脚 | 用户确认仅需客户签字；浏览器页眉页脚不可由页面关闭，需明示提示与取舍 |
| 7 前端实现节 | 新增 | 无移动端实现落点 | 补移动页（`/m`）实现：路由清单、`MobileShell`、新建/编辑共用移动表单、明细行卡片与数字键盘、保存跳转移动详情、复用 shared 校验与计算纯函数、不新增后端接口 | 落地产品文档新增的销售单移动页（ADR-011），明确实现路径与复用边界 |
| 7 前端实现节 | 新增 | 未约定多端变更核对顺序 | 新增「多端变更清单」：shared → server DTO/service → 重建契约 → PC 表单/列表/详情 → 移动表单/列表/详情 → PC 与移动 E2E；移动端不展示编号等差异按产品文档移动页口径处理 | 避免后续只改 PC、漏掉移动端；把影响面写进实现节，AI 与开发者可直接照单核对 |
| 7 前端实现节 · 移动列表 | 修改 | 移动卡片未写层级口径 | 补「卡片层级 = 销售日期大号 + 客户名称在上、编号小字 + 合计金额在下」 | 与产品文档移动页列表对调主次信息同步，避免实现再按旧层级写 |
| 4 编号生成 | 修改 | 主单编号 `YYYYMM-####`（取销售日期年月 + 当月流水） | 改为 `SO-#####`：取 `SO-` 前缀最大流水 +1，不含日期；明细仍为主单号 + 行序（如 `SO-00001-01`） | 全局编号规范统一弃用日期前缀，改按域字母识别；`nextCode` 不再读取 `saleDate` |
| 7 前端实现节 · 移动页 | 修改 | 移动列表底行显示单号、详情标题显示单号与客户编号、明细行显示明细编码 | 移动端不渲染任何编号：列表底行改合计方量 + 合计金额；详情标题区改为客户名称 + 销售日期，信息条去掉客户编号，明细行头改为「第 x 行」；接口与 PC / 打印保持原样 | 现场使用不看编号；隐藏只发生在移动端展示层，不改数据与契约 |
| 7 前端实现节 · 移动详情 | 新增 | 移动端无删除入口 | 明细下方增加「删除销售单」（`order:manage` 才渲染）：`useConfirm` 二次确认 → `DELETE /api/v1/sale-orders/{id}` → `router.replace('/m/sale-orders')`；失败页内提示 | 现场录错单需要可删；单条删除 + 二次确认控制误触，不做批量与滑动删除 |
| 5 接口清单 list / 7 前端实现节 · 移动列表 | 修改 | 列表只支持日期区间与客户 id；移动列表无搜索 | list 查询增加 `customerName`（名称快照模糊）；移动列表增整行搜索框（回车即查、回第 1 页、清空已加载数据），使用 `components/mobile/list.tsx` 共用件 | 现场按客户找单是最高频检索；两套移动列表共用同一套搜索与卡片样式 |

### v20261111

| 位置 | 类型 | 原本 | 现在 | 原因 |
| --- | --- | --- | --- | --- |
| 7 前端实现节 · PC 页面骨架 | 新增 | 新建/编辑/详情各自 `space-y-4`，标题、内容与操作区同处一个滚动文档流 | 新增 `components/admin/page-frame.tsx`：标题区与底部操作区固定、内容区独立滚动；销售单新建/编辑/详情接入；详情明细表限高 420px + 内滚 + sticky 表头 | 落地产品文档「表单页与详情页共用骨架」；长明细不再把标题与操作区顶出视口 |

---

*本文件为订单领域实现设计文档，与 `product/order.md` 同名配对。*