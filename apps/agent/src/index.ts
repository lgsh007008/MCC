// Agent 服务骨架：占位，未实现（技术方案 §1.2 / ADR-002 / ADR-006）。
// 规划形态：MCP Server 的工具由业务 API 契约（openapi.json）生成，Agent 只经业务 API 取数，禁止直连数据库。
// 当前无业务逻辑与依赖，待 Agent 需求立项后按 ADR-002 接入；在此之前不作为可运行组件。

async function main(): Promise<void> {
  console.log('[agent] 占位骨架：MCP Server 与工具编排尚未实现');
}

void main();
