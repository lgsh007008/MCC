import { serverConfig } from '@mcc/config/eslint.server.mjs';

// 服务端 lint：基础规则 + 模块边界强制（技术方案 §4.2，ADR-001 要求的 CI 边界纪律）
export default serverConfig();