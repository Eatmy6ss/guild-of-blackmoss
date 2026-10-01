# 2026-10-01 深夜—10-02 施工日報(zcode 本机第二批,7 工单)· 交 Codex 复审

**HEAD**:`1c577ab`(2026-10-02 凌晨)。全程每提交完整 verify 绿;E2E 4 脚本+QA 全流程通过。
**本文用途**:①记录第二批施工内容;②§4 列 Codex 复审重点。第一批(11 工单)见 [daily-2026-10-01-zcode.md](daily-2026-10-01-zcode.md)(已交 shldo 验证)。

## 1. 交付清单

| 工单 | 提交 | 内容 |
|---|---|---|
| 合规审计+战士修复 | `e959d73` | **bug:signature 注册表键名错误**(warrior-charge/weaponmaster→实际 vanguard/weapons),锁足冲锋与处决此前从未生效;由新增「12 专精全覆盖断言」抓获 |
| A9 说书人 A 步 | `cc99c08`+`2d61b08` | `sim/storyteller.ts` tellExpedition(碰撞优先级:延迟兑现>首杀陪葬>创伤生还>遗物待赎>心愿>默契)+`data/story-templates.ts` 6 类×6 条手写模板;远征终局最多讲 1 条入编年史(📖);Fact 补 names 映射 |
| A10 新手引导 | `0d3424c`+`8a252f7` | 战斗三条一次性提示(招牌技按队伍适用/集火/撤退)+首归来指向大事记与位阶+主菜单**天数+里程碑**双条件解锁;`hintsSeen` 可选存档字段免迁移;QA 脚本适配 |
| A16 基础设置 | `70302e6` | 战斗 1×/2× 实时倍速(localStorage 持久)+主音量滑块(与静音独立)+变卖二次确认 |
| A2→A9 期间记录 | (含在 A2 提交) | — |
| A11 试玩包 | `1c577ab` | `__PLAYTEST__` 构建开关(存档键隔离 `guild-game-playtest-v1`);版图一截断;通关荆棘要塞弹「试玩版到此结束」+导出试玩记录 JSON(build/day/gold/towerBest/manual/memorial 死因/说书人条目/playMeta 计数+§4.2 六题问卷);playMeta 轻计数(出发/撤退/手动招牌技) |

阶段 A 现状:**A1-A11+A15/A16 全清**;余 A12/A17 尾款(美术同伴)、说书人模板三审(制作人)、A11 的 itch 分发(等 G2 招募)。

## 2. 实现要点(Claude 方案对照)

- A9 按 §3.4 逐条:回城汇总每趟 1 条/只讲本趟+延迟兑现/手写模板/入口唯一 `tellExpedition`。**两处有意偏差已记录**(详见 HANDOFF):A6 倍率无条件化(非折入基础,折法实测破坏 ⑲ 节奏带)、A14 位阶行+教学链并存(非替换,保 K07 引导)。
- A11 分发按 §3.7:itch unlisted 或直接发单文件 HTML,不上 Steam 不开仓库;README 404 已在 A13 修正。
- 战报卡 v0(可选 0.5)未做——按 §3.7「没有外部玩家时没有意义」,绑定试玩包后再议。

## 3. 本批已知坑(复审时留意)

1. **测试垫片作用域**(gameplay.test.ts rngScope)随新标识符已 4 次扩容:storyCursorRef/expeditionStartFactRef/hintsSeen 族/playMeta 族/__PLAYTEST__ 等——复审跑玩法回归若报 ReferenceError,先查这里。
2. settlement 浅拷贝 guild 会穿透账本引用(A2 时踩过,已显式克隆)——复审结算相关改动时警惕。
3. QA 脚本已适配渐进解锁(锁定入口=skip);「稳路远征 60 轮快进未结束」为 ROADMAP §8 #8 已知脚本局限,非回归。

## 4. 请 Codex 复审的重点清单

1. **A2/A9 数据链**:fact-ledger 断言(death 带 cause/relic-bind 单有效)是否可绕过;settlement 浅拷贝修复后是否还有其他 in-place 改写输入的字段;consequence-due 的 links 建链是否有漏网路径(如公会层事件无 runRef 时)。
2. **A9 模板文案**:36 条模板是否符合「事实句在前+一句锚定解读」;有无超出账本事实的虚构表述。
3. **A10 解锁设计**:天数+里程碑双条件是否有把玩家锁在门外的路径(如仓库在有装备前完全不可见是否造成困惑)。
4. **A11 隔离**:playtest 存档键是否彻底(还有哪些 localStorage 键未隔离?gg-muted/gg-volume 故意共享——评估合理性);__PLAYTEST__ 分支在正常构建是否确实死代码。
5. **A16 倍速**:2× 下存档节流(时间基)与渲染同步(rAF 800ms 守卫)是否仍成立。
6. **战士键名修复**:确认 vanguard/weapons 两招牌技实装生效(可写针对性断言或管理员实验室实测)。
7. **总体**:跑完整 verify+E2E 四脚本+QA 全流程,对照本表与本表声称的绿是否属实。

## 5. 复审产出

结论写回 HANDOFF「复审报告(Codex)」节:阻断项(须修)/建议项(排期)/疑问项(交制作人)。复审通过后,G2 前的施工即告完成,剩余=制作人三审模板+招募试玩者。
