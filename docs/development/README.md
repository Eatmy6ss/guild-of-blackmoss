# docs/development · 文档地图

> **外部 AI/新读者请按此顺序读**:①仓库根 [AGENTS.md](../../AGENTS.md) ② [HANDOFF.md](HANDOFF.md)——**「认领板」表格里有每个协作者(Codex/shldo/Claude/zcode)各自该领的工单和开工动作** ③ [DECISIONS.md](DECISIONS.md)(拍板台账)。不要从头读历史;需要历史再看 [HANDOFF-archive.md](HANDOFF-archive.md)。

## 现行文档(7+4 份)

| 文档 | 职责 | 更新时机 |
|---|---|---|
| [AGENTS.md](../../AGENTS.md) | AI 上岗须知+制作人红线六条 | 协作管线变化时 |
| [HANDOFF.md](HANDOFF.md) | **当前状态卡+活跃工单+纪律要点** | 每工单交付时 |
| [HANDOFF-archive.md](HANDOFF-archive.md) | 历史工单登记(R1→U36 全录,只读) | 只追加 |
| [DECISIONS.md](DECISIONS.md) | 拍板台账(U01…U37,一行一决策) | 每次 grill 拍板 |
| [BACKLOG.md](BACKLOG.md) | 任务池(状态列同步) | 认领/交付时 |
| [ROADMAP.md](ROADMAP.md) | 门驱动路线图(G0-G5) | 过门时 |
| [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md) | 批次 0-6 施工规格(唯一施工依据) | 批次调整时 |
| [ISSUE-INVENTORY.md](ISSUE-INVENTORY.md) | 已知缺口盘点 | 盘点时 |
| [SYSTEM-MAP.md](SYSTEM-MAP.md) | 系统全景(已交付/接线点) | 批次交付时 |
| [events-audit.md](events-audit.md) | **事件创作五条规范**(写事件必读,一票否决项) | 活规范 |
| [monster-affixes-grill-2026-09-30.md](monster-affixes-grill-2026-09-30.md) | **批次 3 设计规格**(U22 拍板,塔赌局+怪物词缀以它为准) | 批次 3 前必读 |

**美术线归档**(shldo 重做参考,不随本轮清理):[art-resource-library-2026-10-01.md](art-resource-library-2026-10-01.md)(+同名目录)、[ui-ux-art-upgrade-2026-09-30.md](ui-ux-art-upgrade-2026-09-30.md)、ui-art-audit-2026-09-30/(目录)。

## 术语表(压缩记号解码)

| 记号 | 含义 |
|---|---|
| U01-U37 | DECISIONS 台账的拍板编号(grill 结论) |
| #0.x-#6.x | 实施计划批次内工单号(批次 0 地基/1 战斗/2 装备/3 塔赌局/4 经营/5 副本阶梯/6 收尾) |
| R1-R5 | 2026-10-03 改版轮:R1 副本层/R2 界面拆分/R3 武器族/R4 生平设施情报委托/R5 修补(全部已交付) |
| A1-A17 | 阶段 A 工单(批次 1 后的试玩包系列,已清) |
| G0-G5 | ROADMAP 门:M1 操纵感✅/G1 批次0✅/**G2 外部试玩(招募中)**/G3 数值统调/M2 主菜门/M3 全验收 |
| C1/C4/B6 | 宪法冻结:C1 宪法冻结/C4 数值冻结(批次 2 出口解冻)/B6 事件表冻结(U27 已解冻) |
| ⑨⑲⑱ 等 | smoke 门禁编号(scripts/smoke.ts;⑨ 塔尔玛节奏带/⑲ 副本注册表+节奏带/⑱ 战斗节奏带/㉘ 装备扩容等) |
| I8 / I4-I6 | 不变量断言(vitest):I8=无死属性(stat-wiring)/I4 词条取值统一/I5 格式化 |
| v22-v30 | 存档 schema 版本(迁移链在 src/state/save.ts;**缺省字段不注入键**) |
| M1/M2 | 实施计划里程碑:M1 操纵感✅/M2 主菜门 |
| 垫片/rngScope | gameplay 回归测试的作用域注入(scripts/gameplay.test.ts;新标识符需同步扩容) |

## 归档说明

- 2026-10-07 清理:34 份已消化的 dated 方案/报告/日报已从仓库移除(关键结论全部在 DECISIONS/HANDOFF-archive),原文件见 git tag `archive-docs-2026-10-07`。
- 新写文档原则:一次性方案/报告写进当轮工单登记(HANDOFF 或 archive),不再单独开文件;需要长文时先问制作人。
