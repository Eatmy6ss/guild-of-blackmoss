# #0.7a 测试基础接入

2026-09-27。用户明确“还没试玩，先继续技术准备”，本项提前执行，M1 仍待试玩。

- 新增 Vitest 3.2.7，锁文件保留既有依赖版本，复用项目 Vite 5.4.21。[官方配置说明](https://v3.vitest.dev/config/)。
- 新增 vitest.config.ts，合并原 Vite 配置，只收集 src/**/*.test.ts；Node 环境，显式导入测试 API。既有 scripts/ 文件与入口未迁移、未修改（按本轮开工文件哈希核对；#0.1 改动另计）。
- npm test 一次运行后退出，test:watch 用于持续开发；verify 在 package.json 层先运行新测试，再执行原验证脚本。
- 新增真实战斗集成用例 src/sim/combat.test.ts，验证模块加载、战斗终止、终止后不再推进和输入成员不被修改；不设置胜率或数值平衡目标。
- 验证：1 项 Vitest 集成测试通过；临时失败用例使 verify 返回 1，零匹配返回 1，.only 返回 1，探针文件已清理。最终完整 verify 退出 0，历史 smoke 47、玩法 70、王国回归、TypeScript 与生产构建通过。
- 文件：package.json、package-lock.json、vitest.config.ts、src/sim/combat.test.ts、README.md、本专题、实施计划和 HANDOFF。
- 本项未修改游戏运行逻辑或存档；已随 `076aaf4` 推送至 `codex/mechanic-registry`，尚未创建 PR 或合并。后续用户另行要求的独立管理员工具已完成，详见 [T01](admin-test-lab-2026-09-27.md)，不把 M1 标为通过。
