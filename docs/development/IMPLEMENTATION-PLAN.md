# 实施计划（活文档）

> **本文件是 AI 编码代理（Codex / zcode / Claude）的唯一施工依据。**
> 制作人已于 2026-09-27 采纳全部决策，下述内容**不是提案，是已定方案**。
> 设计层论证见 `../REDESIGN-PROPOSAL-2026-09-27.md`（背景阅读）。
> 缺陷台账见 `./ISSUE-INVENTORY.md`（同步更新）。
> `../EXECUTION-PLAN-2026-09-27.md` 为面向制作人的决策稿，**已被本文件取代**，勿作施工依据。
>
> 约束：半职约 20 小时／周（≈2.5 人日／周）；无外部硬期限；**允许破坏性重构，不需保老存档兼容**。
>
> **v2 修订（2026-09-27，基于合并后 `main@423cf52` 重新读码）**：见下方「修订说明」。**制作人已于 2026-09-27 采纳 v2 全部内容，⚖ D-1/D-2/D-3 均按推荐裁定**（DECISIONS U21）。v1 仅保留在 git 历史中，勿再作施工依据。

---

## 修订说明 · v2（先读这一节）

### 读码基准

- `main@423cf52`（`a84a4fe` 合并 `codex/gameplay-next` 之后）。工作树干净，`origin/main` 已同步。
- **事实**：`git diff codex/gameplay-next main -- src` 为空，即 main 的游戏代码与 Codex 分支 HEAD 逐字节相同。zcode 主线的功能（装备 2.0、套装、特性、特权训练、遗物赎回、S1 创伤、王国委托）早在 Codex 分支的基点 `0767ac9` 里就已包含。合并带进来的实质只有 zcode 的文档：DECISIONS U20、BACKLOG 阶段约定、IMPLEMENTATION-PLAN 复审附录。
- **合并事故**：zcode 在 `d0a9e1a` 追加的「zcode 侧独立复审意见」附录在合并时被丢了。v2 已把它恢复到文末。

### v1 与代码不符、v2 已更正的地方

| # | v1 说法 | 读码事实 | v2 处置 |
|---|---|---|---|
| C-1 | #0.9：裸 `Math.random` 主要在 `tower.ts`，0.5 人日 | `App.tsx` 里有 **25 处**，覆盖远征关键路径：杂兵掉落 `:544`、挂机选路 `:770`、远征内事件 `:779`、宝箱 `:796-801`、事件结局 `:959`、属性点 `:1019`、疗养判定 `:1859` 等。另有 `tower.ts:198-203` 3 处，`member-traits.ts:6` 默认参数 1 处 | 「同种子逐字节一致」这条验收，在结算仍留在 `App.tsx` 时做不到。#0.9 拆开并入 #0.10 与 #0.6 |
| C-2 | #0.6：新建 `RunState` 类型 | `sim/run.ts:14` `DungeonRun` 和 `sim/tower.ts` `TowerRun` 本来就是 sim 层的远征对象。再建一个 `RunState` 等于**计划自己开出第二条实现路径**，违反 0.3 | 改为扩展现有两个对象，让它们可序列化。真正的障碍是：`dungeon` 存的是整份 `DungeonDef`，`members` 与花名册是同一对象引用（`run.ts:22`） |
| C-3 | 没有识别 | **结算管线有两份**：副本走 `App.tsx:516-640 settleBattleEnd`，高塔走 `App.tsx:344-420` 的 useEffect，两边行为已经分叉。高塔阵亡**不触发**目睹冲击 `applyDeathShock`，**不写**编年史阵亡条目 `chronicleHeroFall`；高塔胜利**不发**士气 `applyVictory`；高塔经验走 `grantExp`，绕过 `settleGrowth`，所以**不涨默契**。`markPermadeath`（`run.ts:182`）与 `towerMarkPermadeath`（`tower.ts:233`）也是两份拷贝 | **新增 #0.10 结算管线收口**。这是全项目最大的一处接缝，而且直接违反制作人红线 6「涌现叙事」：高塔里死人，不会长出故事。批次 3 的高塔赌局化建在这条管线上，必须先收口 |
| C-4 | #0.1 只针对 Boss | `8b4db9b` 起普通敌人也能挂机制（`EnemyDef.mechanics` → `enemyToCombatant` 写进 `bossMechanics`，`combat.ts:222`）。字段名 `bossMechanics` 已经名不副实。`summon` 通过 `recoveryTicks` 直接读写 `telegraph-aoe` 的运行时（`mechanics.ts:168-178`），属于**跨机制耦合**。`ground-zone` 起读条时**不发 `casting` 事件**（`mechanics.ts:143-147`），演出层看不到读条 | 在 #0.1 补齐规格与验收 |
| C-5 | #0.8：只有 3 处难度手调 | 敌人实际乘区有 **6 个**：`enemyPower`、`difficultyMods.{hp,atk}`、`ENEMY_HP_MULT=1.1`（只作用于有 `expectedLevel` 的图，`combat.ts:59,251`）、精英 ×1.25（`run.ts:134`）、稀有猎杀 `rareHunt.mult`、高塔自带的 `scaleEnemy`（`tower.ts:78`，**和 v1 规划的 `difficulty.scaleEnemy` 同名**） | 在 #0.8 补全乘区清单，解决命名冲突 |
| C-6 | I7：按 `rating` 升序，Boss 强度严格单调 | 3 人本和 5 人本的 Boss 血量天然不在一个量级。制作人 2026-09-27 的口径是「按合法编制、同等级同装备比较整趟压力」，并明确要求**烬石隘口 > 荆棘要塞** | I7 改成按编制归一化，并把制作人这条要求写成断言 I7b |
| C-7 | #1.4：两条隐形 synergy，并入基础值、保持总强度 | `shield-wall` 在 `combat.ts:364` 生效。`blessed-formation`（「治疗者存活时全队防御 +10%」）**引擎里没有实现**，是死数据。两条的 `desc` 也都没有 UI 展示 | `shield-wall` 并入基础值。`blessed-formation` 直接删除，**不能**并入：它目前是 0 效果，并入反而会变强 |
| C-8 | §10：「套装系统」列为明确不做 | K08 套装已经上线（灰冠/猎风，2/3 件），`App.tsx:1407` 还把套装数值**硬编码写进文案**，与引擎各存一份 | 见 ⚖D-2 |
| C-9 | #2.7：治疗只有受疗一条路径 | 治疗输出 = `attack × 4.5 × (1+目标受疗)`（`combat.ts:699`），治疗职业其实吃攻击力。远征事件 buff 的 `mods.heal` 也改写 `healReceived`（`combat.ts:264`）。所以一共有三条路径 | 在 #2.7 写清楚 `healPower` 与攻击力的关系 |
| C-10 | #0.4：只改 `describeItem` | 百分比格式化还散落在 `combat.ts:1199,1221`（属性面板）和 `App.tsx:1407`（套装） | 把这些位置列进 #0.4 的范围 |

### ⚖ 制作人裁定（2026-09-27 已按推荐全部采纳，U21）

| ID | 冲突 | 裁定（= 原推荐） |
|---|---|---|
| **D-1** | v1 的 B8（把 `wish.ts` 与特性并入创伤/性格）与 **U14**（制作人亲选「个人心愿层」）冲突，也碰到红线 6 | **撤销 B8**。心愿与特性保持现状并冻结，不扩写也不合并。合并要花几人日，换来的只是「少一个认知槽位」，却会伤到涌现叙事 |
| **D-2** | 套装已经上线，v1 却写着「不做」 | **保留现有 2 套并冻结**，不新增。批次 2 把套装加成接进 `formatStat` 与 I8，成为构筑轴之一；新套装留到批次 2 出口之后再议 |
| **D-3** | 高塔阵亡要不要补上目睹冲击、编年史和默契（C-3） | **补上**。A6′ 说塔中阵亡是「你自己多爬了一层」，这正是最该留下故事的死亡。按缺陷修复处理，不算数值调整 |

### 工期变化

批次 0：21 → **26 人日**。v1 标题写 21，但各任务工期加起来其实是 24，这是 v1 自身的算术错误。v2 在 24 的基础上：#0.10 +3，#0.1 +0.5，#0.8 +0.5，#0.9 −0.5（拆分并入），#0.6 −1.5（改造现有类型而不是新建）。总计约 101 人日 ≈ **42 周**。M1 位置不变，仍在 #0.1 之后，约第 2–3 周。

---

## 第 0 节 · 代理工作协议（每次开工前必读）

### 0.1 基本纪律

1. **一次只做一个任务 ID。** commit message 必须以任务 ID 开头，例如 `#0.1 机制注册表：收敛打断判据`。
2. **动手前先读本文件中对应任务节的全文**，包括「禁止事项」。不要跨任务顺手改别的东西。
3. **规格与代码不符时停下。** 在 `ISSUE-INVENTORY.md` 追加一条记录，说明冲突，然后**等人确认**。不要自行发挥补齐。
4. 每个任务完成必须通过：`tsc` 无错 + 本任务「验收」一节列出的脚本 + 既有回归脚本不新增失败。
5. **不要为了让测试变绿而改测试的期望值。** 期望值变化必须在 commit message 里单列一行说明原因。

### 0.2 硬禁止（批次 0–2 期间全程有效）

| 禁止 | 原因 |
|---|---|
| **调整任何数值平衡**（敌人数值、技能系数、掉落率、经验曲线） | 批次 1 的主动技能与批次 2 的新属性会让全部 TTK 结论作废。现在调参是纯浪费。发现「变难了／变简单了」→ 记录，不要动手 |
| **扩写 `src/data/guild-events.ts`** | 已 2110 行且冻结。该文件顶部有冻结抬头，勿移除 |
| **新增 `DESIGN.md` 章节** | 宪法已冻结。设计变更走本文件 |
| **新增系统**（新面板、新货币、新资源、新玩法） | 本计划只新增 4 个机制：主动技能、精力、加码条款、塔词缀。其余一律是把已有系统挖深 |
| **裸 `Math.random()`** | 必须用 `src/sim/rng.ts`。现存违规点见 v2 修订说明 C-1，收口在 #0.10 |
| **同一概念开第二条实现路径** | 见 0.3 |

### 0.3 反接缝规则（本项目最主要的缺陷来源）

本项目 6 个确定缺陷里有 5 个是同一模式：**同一概念存在两条独立实现路径，只改了一条**。自动回归用固定模板 + 固定种子，恰好掩盖这类问题。

因此，**新增任何「一类东西」之前，先搜索该概念现有的全部登记点**：

```
新增 MechanicKind  → 搜 registry；改完只应有 1 处登记（#0.1 之后）
新增 StatKey       → 必须走 §批次2 的「新增属性 7 处接线清单」，一处不落
新增 SkillEffect   → 搜 effect switch；解释器、AI 提示、文案三处
新增存档字段       → 搜 SAVE_VERSION；schema、迁移、默认值、清档四处
新增结算后果       → 只许写进 sim/settlement.ts（#0.10 之后）；禁止在 App.tsx 的副本或高塔分支里单独加
新增敌人乘区       → 只许写进 sim/difficulty.ts（#0.2/#0.8 之后）
```

若发现某概念的登记点多于一处且无法合并，**在本文件末尾「接缝登记簿」追加一条**，写清都有哪几处。

### 0.4 术语表（禁止改名）

| 术语 | 含义 | 代码标识 |
|---|---|---|
| 副本 / 远征 | 作者设计的有限内容，可反复刷，惩罚是**损耗** | `DungeonDef` / `run` |
| 高塔 / 大秘境 | 无限阶梯 + 随机词缀，一次一赌，惩罚是**死亡** | `tower` |
| 词缀（塔） | 挂在塔段落上的局内变数 | `TowerAffix` |
| 词条（装备） | 装备上的属性条目 | `AffixDef` ← **注意与上一行同名不同物，勿混用类型名** |
| 精力 | 英雄出勤状态，0–100，只能靠天数恢复 | `stamina` |
| 加码条款 | 玩家自选的副本附加约束，换奖励乘算 | `Clause` |
| 招牌技能 | 玩家可点名释放的主动技，每专精一个 | `SignatureSkill` |
| 损耗 | 精力／创伤／补给／天数的统称 | — |

---

## 第 1 节 · 已定决策（勿再讨论，勿回退）

| ID | 决策 | 一句话依据 |
|---|---|---|
| A1 | **不迁移 Godot。** 宪法 v2 迁移修正案作废 | 控制台感是美术问题；换引擎会清零全部 sim 与平衡资产 |
| A2 | **引入玩家可点名释放的招牌技能** | 引擎有约 15 种效果，玩家能触发 0 种。这是「没有操纵感」与「刷不下去」的共同根因 |
| A3 | **高塔改为下塔才结算** | 逐层立即入账＝零风险，塔当不成赌局 |
| A4 | **高塔禁止挂机**，挂机仅限已通关副本 | 塔是证明，不可代打。让 G04 从数值问题变成结构非问题 |
| A5 | **引入精力／出勤系统** | 公会经营层成立的唯一支点，同时解决 G03 |
| A6 | **副本「不设防」条款**：玩家自选开启永久死亡换 ×2 奖励 | 让副本能死人，但只在玩家签字时。见 A6′ |
| A6′ | **死亡统一原则**：全游戏不存在「骰子杀死了我的角色」。每次永久死亡都是玩家决策的后果 | 塔中阵亡＝你自己多爬了一层；副本阵亡＝你自己签了不设防 |
| B1 | 装备词条表砍到 **8 条命名词条 + tier 缩放**，老词条 id 作废 | 18 条实际只有 8 种属性，同属性多档不产生任何决策 |
| B2 | **新增 7 种属性类型**并完成引擎接线 | 当前最大的内容缺口 |
| B3 | 删除换皮精进技能，保留项必须换 `effect` 不得只换 CD | 见 #1.2 删除清单 |
| B4 | 火焰法师给真机制（灼烧 DoT / 引燃） | 现 identity skill 是通用 `heavy-strike` + `critChance 0.02`，违反宪法 v3.1 自己的禁令 |
| B5 | 砍掉两条隐形 synergy，数值并入基础值 | 永久生效且不可见的被动 buff 不是机制 |
| B6 | 冻结 `guild-events.ts` | 叙事产能转投创伤／关系，让内容由模拟长出 |
| B7 | 休眠混合职阶移出 live 数据目录 | 降低 live 目录噪音 |
| ~~B8~~ ⚖ | ~~`wish.ts` 与 `traits.ts`／`member-traits.ts` 合并进创伤／性格~~ → **已撤销**（D-1，U21），心愿与特性冻结保留 | 与 U14 冲突；合并成本大于收益 |
| B9 | **六维保留六维**（修正早先「砍成 4 维」的建议）。改做两件事：①每一维的战斗作用在 UI 可见；②事件 `attrPoint` 从随机维改为**玩家指定维** | 读码确认（`sim/gen.ts:72`、`types.ts:8-26`）：六维在招募时 roll，升级按 `Nature.growth` 自动成长，**玩家全程无法分配**。但 `Nature.growth/caps` 使每个招募对象真的不同，这正是批次 4 名册玩法需要的质感。所以问题不是维度太多，而是**六维完全不可见、且唯一的成长输入是随机的** |
| B10 | 战力评分降级为背包过滤器；换装场景改为取舍展示 | 刷子游戏需要评分做过滤，但不能用它回答「该不该换」 |
| C1 | 本计划执行期间宪法冻结 | 七天十五章是设计扩张远超验证的信号 |
| C2 | 计划收尾时 `DESIGN.md` 做**重写式修订**（15 章合并为一份当前有效版），不追加第 16 章 | — |
| C3 | 历史文档加「历史快照，截至 YYYY-MM-DD，勿作现状依据」抬头；活文档只保留 `ISSUE-INVENTORY.md`、`DECISIONS.md`、本文件 | — |
| C4 | 批次 0–2 完成前不做任何数值精调 | 见 0.2 |
| C5 | 统一验收口径见第 9 节 | 回应 R05 |

---

## 第 2 节 · 批次与时间表

约 101 人日 ≈ 42 周（按 2.5 人日／周）。

| 批次 | 内容 | 人日 | 累计周 | 规格详细度 |
|---|---|---|---|---|
| 0 | 地基（无新玩法） | 26 | 第 11 周 | **完整工单** |
| 1 | 让战斗值得重复 | 17 | 第 18 周 | **完整工单** |
| 2 | 让装备值得刷 | 19 | 第 26 周 | **完整工单** |
| 3 | 高塔赌局化 | 9 | 第 30 周 | 结构规格 |
| 4 | 公会经营成立 | 13 | 第 35 周 | 结构规格 |
| 5 | 副本阶梯 | 8 | 第 38 周 | 结构规格 |
| 6 | 收尾与验收 | 9 | 第 42 周 | 结构规格 |

**为什么后四批只给结构规格**：M1 与 M2 两个验证点会实质改变后续设计。现在把批次 4–6 写成逐行工单，大概率要重写。批次 3 的规格在 M1 之后细化，批次 4–6 在 M2 之后细化。这是有意的，不是遗漏。

### 里程碑（必须人工试玩，脚本不算）

- **M1 · ✅ 通过（2026-09-29 制作人实测）**：#0.1 已合并（PR#3），制作人打隘口 Boss 后原话「不错，现在这种就很不错了」——「没有操纵感」判定**被推翻**，批次 1 按全规模 17 人日执行。
- **M2 · 第 30 周，批次 3 完成后**：完整跑「养成 → 进塔 → 决定何时收手」。验证主菜是否好玩。不好玩则暂停批次 4–6 重新设计。
- **M3 · 第 42 周**：完整真人式新档验收（第 9 节口径）。

---

## 第 3 节 · 批次 0 · 地基（26 人日）

**目标：让引擎不再撒谎，让之后的一切测量可信。本批次不新增任何玩家可见玩法。**

执行顺序（v2）：`#0.1` → **M1** → `#0.7a` → `#0.2` → `#0.3` → `#0.4` → **`#0.10`** → `#0.5` → `#0.8` → `#0.7b` → `#0.6`

排序理由：#0.10 把结算从 `App.tsx` 搬进 sim 之后，物品归属（#0.5）和随机数收口（原 #0.9）才有唯一的落点。#0.6 的序列化又依赖前两者，所以仍然排在最后。

---

### #0.1 机制注册表 —— 收敛打断判据（5.5 人日）

**解决**：B01、B02，以及整个接缝缺陷类别。

**2026-09-27 实施状态**：#0.1 已在本地分支完成实现与自动/界面验证，待 M1 人工试玩，尚未提交或发布。R1 校准已并入下方规格，详见 [本轮验收](mechanic-registry-2026-09-27.md)。下方“现状”引用为实施前基准证据。

#### 现状

`MechanicKind` 共 12 种（`src/sim/types.ts`）：`telegraph-aoe`、`cast-buff`、`cast-heal`、`slow-touch`、`pull`、`ground-zone`、`phase-invuln`、`summon`、`bind`、`enrage`、`breath-charge`、`fear-aura`。

每种机制需要在**至少 5 处**分别登记，漏登记是静默失败：

| 登记点 | 文件:行 | 现状 |
|---|---|---|
| 解释器 switch | `src/sim/mechanics.ts:28` | 12 个 case |
| **打断伤害累计** | `src/sim/combat.ts:494-502` | **硬编码 `['cast-buff','cast-heal']`** |
| 意图查询 | `src/sim/mechanics.ts:316-317` | 硬编码 `telegraph-aoe` / `cast-buff` / `cast-heal` |
| 挂机 AI | `src/sim/ai.ts:31-32` | 硬编码同上 |
| 玩家可见应对文案 | `src/data/mech-docs.ts` | 独立手写清单 |

**B01 的真相**：`mechanics.ts:140`（`ground-zone`，`breakDamage` 默认 200）与 `mechanics.ts:262`（`fear-aura`，默认 110）**已经写好了打断分支**，但 `combat.ts:496` 的白名单不给它们累计 `rt.taken`，所以那两段是**死代码**。同时 `mech-docs.ts` 明确告诉玩家「集火可打断」——**玩家看到的承诺与引擎行为是两份独立维护的清单。**

**B02 的真相**：读条窗口的判定顺序不对称。

```ts
// cast-buff（mechanics.ts:50-63）：先判完成，后判打断  ← 错
if (state.tick >= rt.until) { /* 完成 */ }
else if ((rt.taken ?? 0) >= breakDamage) { /* 打断 */ }

// cast-heal（mechanics.ts:79-85）：先判打断，后判完成  ← 对
if ((rt.taken ?? 0) >= breakDamage) { /* 打断 */ }
else if (state.tick >= rt.until) { /* 完成 */ }
```

最后一 tick 打断在 `cast-buff` 上会失效。修法不是把 `cast-buff` 改成和 `cast-heal` 一样，**而是让读条窗口只存在一份实现**。

> v2 注：`cast-heal` 的判定顺序已在 `8b4db9b` 单独修好（`mechanics.ts:77-85`），所以 B02 现在只剩 `cast-buff`。但 `ground-zone` 与 `fear-aura` 也是「先判完成」，和 `cast-buff` 一样错。统一窗口仍是正解。

#### v2 补充现状（`8b4db9b` 之后）

1. **普通敌人也挂机制**：`EnemyDef.mechanics` → `enemyToCombatant` 写入 `bossMechanics`（`combat.ts:222-223`），`boss` 身份改由 `c.boss` 标记。registry 的遍历对象是「所有带机制的 combatant」，**不得用 `c.boss` 过滤**。`bossMechanics` 字段先不改名（改名会波及演出层），在 `types.ts` 注释里标明它等于「机制列表」。
2. **跨机制耦合**：`summon` 的 `recoveryTicks` 会读取并推迟同一单位 `telegraph-aoe` 的运行时（`mechanics.ts:168-178`）。所以 `MechanicCtx` 要多带一个 `sibling(kind)` 访问器；**只能**经它读写兄弟机制的状态，不得直接去碰 `self.mech[...]`。
3. **读条事件保留**（R1 校准）：`ground-zone` 已在 `mechanics.ts:151` 发出 `casting`。迁入 `stepCastWindow` 后每次开始只发一次，不额外补发。
4. **结构约束（记录，不改）**：运行时按 `kind` 做键，所以同一单位不能挂两个同 kind 机制。在 registry 注释里写明，并加一条数据断言兜底：同一 def 的 `mechanics` 数组内 kind 不重复。

#### 目标状态

新建 `src/sim/mechanic-registry.ts`：

```ts
import type { BossMechanicDef, BattleState, Combatant, MechanicKind } from './types'

/** 机制运行时状态，存于 combatant.mech[kind]（沿用现有结构，勿改形状） */
export interface MechanicRuntime {
  until?: number
  next?: number
  taken?: number
  fired?: number
  resolvedAt?: number
}

export type MechanicIntent =
  | { type: 'none' }
  | { type: 'telegraph' }                                        // → 建议分散
  | { type: 'cast'; interruptible: false }
  | { type: 'cast'; interruptible: true; breakDamage: number; taken: number }
  | { type: 'invuln' }

export interface MechanicCtx {
  state: BattleState
  self: Combatant
  def: BossMechanicDef
  rt: MechanicRuntime
  /** 保留召唤与范围技错峰；仅经此访问兄弟机制运行时。 */
  sibling(kind: MechanicKind): MechanicRuntime
}

export interface MechanicSpec {
  kind: MechanicKind
  /** 指挥台与提示用的短标签 */
  label: string
  /** 玩家可见的应对文案。data/mech-docs.ts 的内容迁移到这里，该文件删除 */
  counter: string
  /** 执行与图鉴共用既有引擎缺省值。 */
  defaults: Readonly<Record<string, number>>
  describe(def: BossMechanicDef): string
  /** 每 tick 推进 */
  step(ctx: MechanicCtx): void
  /** 意图查询：指挥台脉冲、挂机 AI、教学提示共用唯一来源 */
  intent(ctx: { tick: number; self: Combatant; def: BossMechanicDef; rt: Readonly<MechanicRuntime> }): MechanicIntent
}

export const MECHANIC_REGISTRY: Record<MechanicKind, MechanicSpec> = { /* 12 条 */ }

/**
 * 「可打断」的唯一判据：显式参数或注册表缺省参数可解析出 breakDamage。
 * 四种既有读条的缺省阈值原样保留；不得因数据省略参数而取消打断。
 * 禁止在任何其他位置书写 kind 白名单来判断可打断性。
 */
export function interruptThreshold(def: BossMechanicDef): number | undefined {
  const v = def.params.breakDamage
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : MECHANIC_REGISTRY[def.kind].defaults.breakDamage
}

/**
 * 统一读条窗口推进。所有带读条的机制（cast-buff / cast-heal / ground-zone /
 * fear-aura 及未来新增）必须走这里，不得各自写 until/taken 逻辑。
 * 判定顺序固定为：先打断，后完成。
 */
export function stepCastWindow(ctx: MechanicCtx, opts: {
  castTicks: number
  everyTicks: number
  firstTick: number
  startLog: string
  onComplete(ctx: MechanicCtx): void
}): void
```

改动点：

1. `mechanics.ts` 的 `processBossMechanics` 改为遍历 registry 派发，删除 `switch`。四个带读条的机制改用 `stepCastWindow`。
2. `combat.ts:494-502` 改为**按声明遍历**，删除白名单：
   ```ts
   if (target.bossMechanics && target.mech) {
     for (const def of target.bossMechanics) {
       if (interruptThreshold(def) === undefined) continue
       const rt = target.mech[def.kind]
       if (rt?.until !== undefined && state.tick < rt.until) {
         rt.taken = (rt.taken ?? 0) + amount
       }
     }
   }
   ```
3. `mechanics.ts:302-324` 的 `bossIntents` 改为聚合 `spec.intent()` 结果，不再判 kind。
4. `ai.ts:31-32` 改为：
   ```ts
   const telegraphing = foes.some(f => (f.bossMechanics ?? []).some(d =>
     MECHANIC_REGISTRY[d.kind].intent({ tick: state.tick, self: f, def: d, rt: f.mech?.[d.kind] ?? {} }).type === 'telegraph'))
   const caster = foes.find(f => (f.bossMechanics ?? []).some(d => {
     const it = MECHANIC_REGISTRY[d.kind].intent({ tick: state.tick, self: f, def: d, rt: f.mech?.[d.kind] ?? {} })
     return it.type === 'cast' && it.interruptible
   }))
   ```
5. 删除 `src/data/mech-docs.ts`，类型名、counter 与参数化 `mechanicBrief` 全部迁入 registry 的 label/counter/describe；UI 与原 smoke 改为读 registry，保留现有信息量。

#### ⚠ 预期副作用（不要当 bug 修）

修好后，`ground-zone` 与 `fear-aura` **第一次真的可以被打断**。这会降低版图二 Boss 的实际难度、缩短战斗时长。

**这是预期行为。按 C4，不要为此调整任何数值。** 在 `ISSUE-INVENTORY.md` 记一条「版图二难度待批次 2 后重测」即可。

#### 验收

- `tsc` 无错；全项目 `grep -rn "'cast-buff'" src/` 只剩 registry 内部与数据表，无判据性白名单。
- 探针：给 `ground-zone` 与 `fear-aura` 的 Boss 在读条期间打足 `breakDamage`，必须产生 `{type:'interrupted'}` 事件。
- 探针：四种读条在 **until - 1** 打足阈值，截止时先结算打断；**until 当刻**的伤害不再累计。覆盖中途、阈值不足、死亡取消、重复处理与新一轮读条，不改全局行动顺序。
- `mech-docs` 的类型名、counter 和参数化说明完整迁移；说明与执行用同一套默认值。无敌到期意图消失，查询不得创建运行时状态。
- （v2）探针：**普通敌人**（隘口唱诗者）挂的可打断机制，与 Boss 挂的同款机制，打断行为一致。
- （v2）四种读条机制起读条时都产生 `casting` 事件。
- （v2）`grep -n "mech?.\['telegraph-aoe'\]\|mech\['telegraph-aoe'\]" src/sim/mechanics.ts` 只在 `sibling()` 内部出现。

#### 禁止事项

- 不要改 `combatant.mech[kind]` 的数据形状（存档与演出层都依赖它）。
- 不要顺手给机制加新参数或新机制种类。
- 不要改任何 `params` 默认值。
- 本项可调整旧验证脚本的必要导入与受修复影响的断言，并补定向回归；测试框架迁移留在 M1 后的 #0.7a。
- **完成后停下，交 M1 试玩。**

---

### #0.7a 引入 Vitest（✅ 已完成——PR#3 随 #0.1 接入 Vitest 并配 8 项测试，本任务剩余=零）

**2026-09-27 状态**：用户明确 M1 尚未试玩并授权先做技术准备，本项已提前完成本地接入。新测试通过后从 package.json 串接原 verify，scripts/ 保持原样。见 [接入记录](vitest-setup-2026-09-27.md)。M1 未通过，未据此批准后续玩法改版。

**现状**：`package.json` 无测试框架；`scripts/` 约 17.3k 行手写 `.ts`/`.mjs`（`smoke.mjs` 10.7k 行疑为签入的构建产物）。

**做法**：
- 装 Vitest（Vite 已在依赖里，成本极低），加 `npm run test`。
- **不迁移任何现有脚本。** 17.3k 行保持原样继续跑。
- 约定：**此后所有新测试写在 Vitest 里**，放 `src/**/*.test.ts`；`scripts/` 视为冻结的历史资产。

**理由**：#0.7b 起的不变量断言需要一个能低成本增删用例的框架，否则代理会继续往 `smoke.mjs` 里堆，问题原地复现。

**禁止**：不要动 `scripts/` 下任何文件；不要试图统一两套测试。

---

### #0.2 统一敌人缩放入口（1.5 人日）

**2026-09-29 状态**：已在 `codex/enemy-scaling` 完成 B03 修复与验证，基于最新 `main@4816f3e`（M1 已通过）。初始/召唤/塔层统一生成入口，保持原始数值与取整；完整 verify 通过，见 [实施与验收](enemy-scaling-2026-09-29.md)。本项只引入 `DifficultyInput.dungeon/role/modifiers`，#0.8 再替换为 rating/archetype；不在本项改地图曲线。

**解决**：B03。

**现状**：`createBattle` 对初始怪应用地图倍率，`summonPool` 保留原始定义 —— 同一概念两条路径。

**目标**：新增 `src/sim/difficulty.ts` 的 `scaleEnemy()`（最终模型签名见 #0.8），令**全项目只有这一处做敌人生成时的数值乘算**。`createBattle` 与 `summon` 机制的 `mkEnemy`（#0.1 后位于 `mechanic-registry.ts`）都走它。高塔已预缩放的怪打标记，防二次放大。战中狂暴、强化属于机制状态变化，保持现状。

**v2 注**：
- `tower.ts:78` 已经有一个私有的 `scaleEnemy(def, floor)`，**和本任务的函数重名**。本任务先把它改名为 `towerFloorScale`，再改成调用 `difficulty.scaleEnemy`，避免代理 grep 时混淆两者。
- 精英 ×1.25 与稀有猎杀 `rareHunt.mult` 原经裸 `enemyScale` 参数传入 `createBattle`。本任务改为 `DifficultyInput` 的 `modifiers` 字段；增援继承本场精英/猎杀倍率，精英标记与初始怪一致。猎杀仅首场有效。Boss 的原有分步取整保持，不顺带统一成普通怪的一次取整。

**验收**：不变量断言 —— 同一 `EnemyDef` 经初始生成与经 `summon` 生成，属性完全相同。

---

### #0.3 统一词条生成入口（1 人日）

**解决**：B04。

**现状**：紫装额外词条分支与普通词条分支各有一套预算规则（`src/sim/loot.ts`）。

**目标**：单一 `rollAffixes(budget, pools, rng)`，品质只影响**输入预算与条数**，不得拥有独立的取值规则。

**验收（2026-09-29 校准 I4）**：相同数值预算、相同词条和相同区间抽样下，普通/追加路径的词条数值逐项相等；条数上限、去重和追加机会保持，旧装备不重掷。不同属性不能把攻击、生命和百分比直接相加作总分；随机抽样不同也不要求数值恰好相等。此项细化验证口径，不改变品质倍率或装备方向。

**实现状态（2026-09-29）**：本地已实现并验证，详见 [#0.3 阶段验收](affix-generation-2026-09-29.md)。七项新自动回归、5,130 组生成前后对照、旧装备导入/战斗投影与完整 verify 通过；尚未推送。新增追加区间抽样会多消费一次随机数，历史种子的后续掉落可能变化；不重掷已存实例，不宣称成长曲线已经通过第 9 节的玩法验收。

---

### #0.4 统一百分比格式化（0.5 人日）

**解决**：B05。

**现状**：`describeItem` 的百分比格式化遗漏 `healReceived`。

**目标**：建 `formatStat(stat: StatKey, value: number): string` 单一入口，由 `StatKey` 决定「整数 / 百分比 / 带符号」。所有展示位调用它。

**v2 范围**：`loot.ts` `describeItem`、`combat.ts:1199,1221`（属性分层面板）、`App.tsx:1407`（套装加成文案；这里同时把硬编码的 5%/10%/3%/6% 改为读引擎的套装定义）。

**验收**：不变量断言 —— 遍历 `StatKey` 全集，每个 key 的 `formatStat` 输出非空且格式与该 key 声明的种类一致（这条断言在批次 2 加 7 个新属性时会自动生效，是防漏的关键）。

**实现/验收校准（2026-09-29）**：在 `a7b8c94` 已修物品受疗的基础上补齐属性分层和套装定义共用。StatKey 决定数量/百分比单位，是否加正号由增量/合计的展示场景决定；沿用现有数量小数，统一最多一位小数、零无正号/负零，不改存储或计算精度。五项显示回归及真实普攻/暴击关系验证、独立页面换装与键盘检查、完整 verify 通过，见 [#0.4 阶段验收](stat-display-integration-2026-09-29.md)。更早 #0.2/#0.3 的版本记录以最新整合专题为准；主线 #0.8/#0.7b 已部分推进，后续先核对实际代码，不重复照旧工单开工。

---

### ~~#0.9 确定性 RNG 收口~~ → v2 已拆分并入 #0.10 与 #0.6

**v1 低估了范围**。实际裸 `Math.random` 共 29 处：`App.tsx` 25 处（远征掉落、挂机选路、远征内事件、宝箱、事件结局、属性点、疗养判定、招募），`tower.ts:198-203` 3 处，`member-traits.ts:6` 默认参数 1 处。另有 `ui/audio.ts` 和 `ui/battle/` 下约 25 处纯演出用途，可保留。

这些调用点大多嵌在 `App.tsx` 的结算闭包里，**不先把结算搬进 sim，就没有地方可以接 RNG**。所以：
- 结算路径上的随机数 → 随 **#0.10** 一起改为 `rng.ts`（远征对象持有 `rng`）。
- 基地侧的随机数（招募、访客、公会事件、疗养）→ 随 **#0.10** 顺带改为公会级 `rng`，种子随存档保存。
- 「同种子逐字节一致」的验收 → 移到 **#0.6**（那时 `rngState` 才进存档）。

最终出口条件不变：`grep -rn "Math.random" src/ | grep -v presentation-only` 为空，演出层调用需加 `// presentation-only` 注释。

---

### #0.8 难度模型（4.5 人日）

**解决**：G01、G02 的**根**（难度倒挂）。

**现状（v2 更正）**：敌人数值一共经过 6 个乘区，分散在 4 个文件：

| 乘区 | 位置 | 性质 |
|---|---|---|
| `DungeonDef.enemyPower` | `data/dungeons*.ts`，经 `combat.ts:245` | 地图手调 |
| `DungeonDef.difficultyMods.{enemyHp,enemyAttack}` | `data/dungeons*.ts`，经 `combat.ts:253-254` | 地图手调（V1 与 2026-09-27 跨版图校准叠在这里） |
| `ENEMY_HP_MULT = 1.1` | `combat.ts:59`，仅作用于有 `expectedLevel` 的图 | 全局常量 |
| 精英 ×1.25 | `run.ts:134` | 场次修饰 |
| 稀有猎杀 `rareHunt.mult` | `run.ts:117` | 场次修饰 |
| 高塔层数缩放 | `tower.ts:65,78,93` | 高塔专属 |

前三项属于「地图难度」，本任务收敛为一个 `rating`；后三项属于「场次/模式修饰」，保留，但必须经 `DifficultyInput.modifiers` 传入同一个 `scaleEnemy`。手调必然产生非单调。

**目标**：新建 `src/sim/difficulty.ts`：

```ts
export type EnemyRole = 'trash' | 'elite' | 'boss'

export interface DifficultyInput {
  /** 地图唯一难度标量。全游戏唯一允许手调的难度旋钮。 */
  rating: number
  role: EnemyRole
  archetype: EnemyArchetype
}

/** 全项目唯一允许对敌人数值做乘算的函数 */
export function scaleEnemy(base: EnemyDef, input: DifficultyInput): EnemyDef

/** 用于单调性断言的等效强度估算 */
export function ratingOfEnemy(e: EnemyDef): number
```

数据表改造：`DungeonDef` 删除 `enemyPower` 与 `difficultyMods`，新增 `rating: number`。`archetype` 决定攻／血／速的**分配形状**（`shield` 偏防、`striker` 偏攻速、`bruiser` 均衡），`rating` 决定**总量**。

#### 验收（这条是 G01/G02 的机器可证版本）

- 不变量断言（v2 更正）：`rating` 定义为**按编制归一化**的压力，即 Boss 等效强度 ÷ 该副本 `size`。把全部副本按 `rating` 升序排列，归一化后的 Boss `ratingOfEnemy / size` 必须**严格单调递增**。3 人本与 5 人本不能直接比较裸血量（制作人 2026-09-27 口径）。
- （v2 新增 I7b）制作人硬约束断言：`rating(烬石隘口) > rating(荆棘要塞)`，并且版图二每张图的 `rating` 都高于版图一的最高值。
- 不变量断言：同 `rating` 不同 `archetype` 的敌人，`ratingOfEnemy` 差值在 ±5% 内（形状不同、总量相同）。
- 注：`rating` 的单调性只是**静态模型**上的必要条件。整趟压力还取决于机制与路线，这部分以第 9 节口径实测为准；本断言不能替代实测。

#### 禁止事项

- **不要在迁移时顺手调难度曲线。** 先用模型**尽可能复现当前数值**，让单调性断言暴露出哪几张图本来就是倒挂的，把清单写进 `ISSUE-INVENTORY.md`。**修倒挂是批次 2 之后的事**（C4）。
- 不要给 `DungeonDef` 保留 `difficultyMods` 作为「特例逃生口」。留了就会被用，模型即失效。

---

### #0.7b 不变量测试首批（2 人日）

**为什么**：现有测试是固定模板 + 固定种子的**黄金值比对**，恰好掩盖「两条路径碰巧一致」的接缝缺陷。需要的是**断言不变量**，而不是比对快照。

首批断言（Vitest）：

| # | 断言 | 防的缺陷 |
|---|---|---|
| I1 | 任何 `interruptThreshold(def) !== undefined` 的机制，读条窗口内累计伤害达阈值**必**产生 `interrupted` 事件 | B01 类 |
| I2 | 读条最后一 tick 打断有效，且所有带读条机制行为一致 | B02 类 |
| I3 | 同一 `EnemyDef` 经初始生成与经 `summon` 生成属性完全相同 | B03 类 |
| I4 | 同预算、同词条、同区间抽样下，普通/追加路径数值逐项相等（不混加不同属性） | B04 类 |
| I5 | 遍历 `StatKey` 全集，`formatStat` 输出格式与声明种类一致 | B05 类 |
| I6 | 任一物品 uid 在全存档中出现次数恰为 1 | B06 类（#0.5 后生效） |
| I7 | 副本按 `rating` 升序，**按编制归一化**后的 Boss 等效强度严格单调递增（v2 更正） | G01/G02 |
| I7b | `rating(烬石隘口) > rating(荆棘要塞)`；版图二每图都高于版图一最高值（v2 新增） | 2026-09-27 制作人口径 |
| I9 | 同一名英雄在副本与高塔中阵亡，`settleEncounter` 产出的**后果类型集合**相同（v2 新增，#0.10 后生效） | C-3 结算双管线 |
| I10 | 带战斗机制的**杂兵**与 Boss 挂同一机制时，打断行为一致（v2 新增） | C-4 |

再加一个 **fuzz 驱动**：随机职业组合 × 随机装备 × 随机种子跑 200 场，断言无异常抛出、无 NaN、战斗必在 `TICK_HARD_CAP` 内终止。

**禁止**：不要把断言写成「等于某个具体数字」。数值会在批次 1–2 全面变化，写死数字的断言会被下一个代理直接删掉。断言要写**关系**，不写**数值**。

---

### #0.10 结算管线收口（3 人日，v2 新增）

**2026-09-30 实施校准**：shldo 基于合并后的 `3f92dcd` 认领。塔掉落的裸随机数已由主线修复，不重复改掉落数值；本轮把正式 UI 的两处结算接到统一入口，并保留 `settleTowerFloor` 为内部阶段/奖励助手。`EncounterOutcome` 返回成员/公会/本趟的更新快照和实际后果，App 只同步状态。I9 除键集合外必须检验真实死亡冲击、故事、遗物与参战边界；同输入同 RNG 的完整输出一致且输入不变。纯函数显式分配本趟物品 ID 和编年史序号，不能依赖 crypto/全局计数器。副本对照分离 RNG 来源变化与规则变化，不重新生成旧数值来掩盖差异。详情与结果见 [本轮专题](settlement-pipeline-2026-09-30.md)。

**解决**：C-3（副本与高塔两条结算管线）；并承接 #0.9 拆出的结算侧 RNG。

**现状**：
- 副本结算在 `App.tsx:516-640`（`settleBattleEnd`），流程完整：王国声望 → 伤疤 → 遗物 → `applyDeathShock` → `chronicleHeroFall` → 士气 → 心愿 → `settleGrowth`（含羁绊）→ 金币 → 精通 → 自动循环。
- 高塔结算在 `App.tsx:344-420` 的一个 `useEffect` 里，**另写了一份**：没有 `applyDeathShock`、没有 `chronicleHeroFall`、没有 `applyVictory`；经验走 `grantExp`，绕过 `settleGrowth`，因此**不产生羁绊**。
- 阵亡登记有两份：`run.ts:182 markPermadeath` 和 `tower.ts:233 towerMarkPermadeath`。
- `tower.ts:177 settleTowerFloor` 用裸 `Math.random`（198-203）。

**后果**：英雄死在塔里，公会**不会有任何反应**，编年史也不记。这直接违背宪法「涌现叙事」和已定的死亡统一原则（「不存在『骰子杀死了我的角色』」）——死亡不仅要有理由，还要有回响。另外，批次 3「下塔才结算」如果在两条管线上各做一遍，是必然的新接缝。

**目标**：新建 `src/sim/settlement.ts`：

```ts
export interface EncounterOutcome {
  source: 'dungeon' | 'tower'
  win: boolean
  deaths: Array<{ memberId: string; cause: DeathCause }>
  survivors: string[]
  loot: { items: ItemInstance[]; gold: number; starMarrow: number }
  exp: number
  /** 以下均为待应用的「后果」，由 App 层逐条 apply，App 不再自己计算 */
  consequences: {
    deathShock: DeathShockEffect[]
    chronicle: ChronicleEntry[]
    scars: ScarEffect[]
    relics: PendingRelic[]
    morale: MoraleDelta[]
    wishes: WishProgress[]
    growth: GrowthResult     // 经验 + 羁绊，统一走 settleGrowth
    kingdom?: KingdomDelta
    mastery?: MasteryDelta
  }
}

export function settleEncounter(input: EncounterInput, rng: Rng): EncounterOutcome
```

1. `settleEncounter` 是**纯函数**：输入战斗结果、远征上下文和 `rng`，输出 `EncounterOutcome`。不读写 React 状态、不读写存档。
2. `App.tsx` 两处结算都改为 `const o = settleEncounter(…); applyOutcome(o)`。`applyOutcome` 只做 setState，不做任何判定。
3. 合并 `markPermadeath` / `towerMarkPermadeath` 为一个。
4. 高塔补齐：阵亡 → `applyDeathShock` + `chronicleHeroFall`；胜利 → `applyVictory`；经验 → `settleGrowth`（依据 ⚖ D-3）。
5. 高塔的差异（每层掉落、赐福 `App.tsx:373`、保险 `insureNextTowerFloor`）作为 `source === 'tower'` 的**分支参数**留在 `settleEncounter` 内部，不另起函数。
6. 结算路径上的随机数全部走 `rng`；基地侧 `App.tsx` 的其余裸 `Math.random`（招募、访客、事件、疗养、属性点）同批改为公会级 `rng`（种子进存档）。

**验收**：
- I9 通过：同一名英雄、同样死因，副本与高塔产出的 `consequences` 键集合一致（数值可以不同）。
- `grep -n "Math.random" src/App.tsx src/sim/tower.ts src/sim/member-traits.ts` 为空。
- 现有 smoke / gameplay 的副本结算金值**不变**（副本路径只是搬家，不改行为）。高塔金值会变，因为多了死亡冲击和羁绊。变化须在 HANDOFF 里列出，**不得**通过改测试数值来掩盖。

**禁止事项**：
- 不改任何数值（掉落率、金币、经验、士气幅度一律照搬）。
- 不动自动循环的 UI（`auto-loop` 相关按钮与状态机留给 #0.6）。
- 不要为高塔另写一套「简化版」死亡冲击。它必须和副本调用**同一个**函数。

**依赖**：放在 #0.4 之后、#0.5 之前。#0.5 要改物品归属，而遗物（`pendingRelics`）的产生点就在结算里，先收口结算，#0.5 只需改一处。

---

### #0.5 物品注册表（3 人日）

**解决**：B06（重复物品 ID）。

**现状**：物品实例同时存在于 `members[].equipment`、`inventory`、`pendingRelics` 三处，**无单一归属不变量**，重复 ID 是直接后果。

**目标**：存档 v20，物品单一仓库 + 引用（#0.10 已使用 v19 保存 RNG；本项顺延，不覆盖迁移级别）。

```ts
export type ItemUid = string   // `it_${n}`，单调递增，永不复用

export interface GuildSave {
  version: 20
  /** 唯一物品仓库。物品实例只存在于此。 */
  items: Record<ItemUid, ItemInstance>
  /** 下一个可用序号，随存档持久化（重启后不得回绕） */
  itemSeq: number
  members: Array<Omit<Member, 'equipment'> & { equipment: Partial<Record<Slot, ItemUid>> }>
  inventory: ItemUid[]
  pendingRelics: Array<{ uid: ItemUid; /* 其余字段不变 */ }>
  // …其余字段不变
}
```

**不变量**：每个 uid 在 `members[].equipment` ∪ `inventory` ∪ `pendingRelics` 中**合计出现恰好一次**。

迁移 v19 → v20（更旧存档先逐级经过 #0.10 的 v18 → v19，保留 rngState）：
1. 遍历三处，为每个物品实例**重新签发** uid（不要沿用旧 id，旧 id 本身就可能重复）。
2. 重复实例按「装备中 > 待赎回 > 背包」优先级保留一份，其余**重新签发新 uid 后放入背包**（不要丢弃玩家物品）。
3. 孤儿 uid（在 `items` 里但无人持有）回收进 `inventory`。
4. 加载时跑一次 I6 断言；失败则修复并在控制台警告，**不要静默通过**。

**禁止**：不要趁机改 `ItemInstance` 的字段（批次 2 才改词条结构）。本任务只改**归属方式**。

---

### #0.6 远征对象可序列化（4.5 人日，本批次最大风险）

**解决**：R04（远征中途刷新丢失）。

**现状**：`src/App.tsx` 约 2660 行、49 个 `useState`、0 个 `useReducer`。远征流程隐式编码在组件状态里 —— R04 是**结构后果**，不是策略选择。

**v2 更正**：v1 要求新建 `RunState` 类型，但代码里**已经有**两个远征对象：`run.ts:14 DungeonRun` 和 `tower.ts` 的 `TowerRun`（后者带 `autoMode`）。再建一个 `RunState` 就是第三份「远征」概念 —— 这正是 §0.3 禁止的接缝。它们不能直接存档的原因很具体：
- `DungeonRun.dungeon` 存的是整个 `DungeonDef` 对象，而不是 id；
- `members` 是对名册成员的**共享引用**，序列化后引用关系就断了；
- 没有 RNG 状态，恢复后结果不可复现。

**目标**：**改造现有两个类型**，不新建第三个。抽出公共部分：

```ts
/** DungeonRun 与 TowerRun 的共同可序列化部分 */
export interface RunCore {
  schema: 1
  seed: number
  /** 断点续跑必须能复现 —— 不存 RNG 状态就等于没解决 R04 */
  rngState: number
  /** 只存 id，运行时从名册解析 */
  memberIds: string[]
  party: Array<{ memberId: string; hp: number }>
  /** 未结算战利品。批次 3「下塔才结算」依赖此字段 */
  pendingLoot: { items: ItemUid[]; gold: number; starMarrow: number; exp: number }
  /** 预留字段，批次 3 / 5 填充。现在建好，避免再来一次存档迁移 */
  affixes?: string[]            // 批次 3 塔词缀
  clauses?: string[]            // 批次 5 加码条款
}

export interface DungeonRun extends RunCore {
  kind: 'dungeon'
  dungeonId: string             // 取代 dungeon: DungeonDef
  routeTaken: string[]
  nodeIndex: number
  // …现有其余字段保留，但必须全部是可 JSON 化的值
}

export interface TowerRun extends RunCore {
  kind: 'tower'
  floor: number
  // autoMode 保留到批次 3 再删（届时禁挂机）
}

export type ActiveRun = DungeonRun | TowerRun
```

**重要**：即使 `pendingLoot` / `affixes` / `clauses` 在批次 0 完全不用，**现在就要建**。批次 3 和 5 会挂在这三个字段上；留到那时再加，等于多一次破坏性存档迁移。

改动策略（按此顺序，勿跳步）：
1. 先给远征流程补 UI 冒烟测试（Vitest + 现有 e2e 脚本），**建立安全网再动刀**。
2. 把 `DungeonRun.dungeon` / `members` 改为 id 引用，并提供 `resolveRun(run, save)` 在运行时解析。
3. 把远征相关的 `useState` 收拢成一个 `useReducer(runReducer)`，reducer 放在 sim 层，纯函数；结算动作调用 #0.10 的 `settleEncounter`。
4. `ActiveRun` 接入存档（与 #0.5 同一次 v20 迁移，或紧随其后的 v21；实施前重新核对最新已发布版本）；刷新后可恢复。
5. **不做**其他 UI 重构。App.tsx 仍会很大，那是可接受的。

**验收**：
- 远征任意节点（副本与高塔各测一次）刷新页面，恢复后继续跑完，战果与不刷新时**逐字节一致**（依赖 `rngState`）。这是 v1 #0.9「同种子逐字节一致」的最终落点。
- `JSON.parse(JSON.stringify(run))` 与原对象深相等（无函数、无循环引用、无 def 对象）。
- 测试刷新只能用内存或临时 storage mock，**严禁写入用户真实 localStorage**（AGENTS.md 红线）。

**禁止事项**：
- 不要新建与 `DungeonRun` / `TowerRun` 并列的第三个远征类型。
- 不要把 49 个 `useState` 全部重构。只动远征相关的那些。范围蔓延是本任务失败的主要方式。
- 不要引入状态管理库（Redux / Zustand / Jotai）。`useReducer` + sim 层纯函数足够。
- 不要在本任务里改任何战斗逻辑。

**若受阻**：可推迟到批次 4 之前，但**不可取消**（批次 4 的精力系统依赖远征生命周期）。推迟必须在 `ISSUE-INVENTORY.md` 留记录。

---

### 批次 0 出口条件

- I1–I7、I7b、I9、I10 全绿；fuzz 200 局无失败。
- `grep -rn "Math.random" src/` 为空（除标注 presentation-only）。
- 副本与高塔只经过一条结算管线（`settleEncounter`）；塔中阵亡有死亡冲击与编年史记录（#0.10）。
- 敌人数值只在 `difficulty.scaleEnemy` 一处做乘算，`tower.ts` 不再有私有缩放函数。
- 全部地图难度由 `rating` 生成，单调性可证；倒挂清单已记录（**未修**）。
- 远征刷新可恢复。
- **未调整任何数值平衡。**

---

## 第 4 节 · 批次 1 · 让战斗值得重复（17 人日）

**目标：把执行深度从 4 个团队动词，提升到玩家真的在操作具体英雄。**

现状：玩家只有 4 个动词（`setStance` / `setFocus` / `useHealPotion` / `orderRetreat`），全部作用于**团队**。约 15 种技能效果全部「CD 到了自动放」，玩家能触发 **0** 种。反复刷需要执行技巧上限，否则就是等待。

---

### #1.1 招牌技能系统（7 人日）

**目标**：每个专精一个玩家可点名释放的主动技。

```ts
export interface SignatureSkill {
  id: string
  name: string
  cdTicks: number
  /** 必须是 effect 层的新动词或新目标形状；禁止与基础技同 effect 只改 CD */
  effect: SkillEffect
  targeting: 'enemy' | 'ally' | 'self' | 'none'
  desc: string
}
```

**指令 API 必须与现有 4 个动词同构**（这是让挂机与手动真正共用一套决策系统的唯一机会；宪法声称已共用，实际只共用指令 API）：

```ts
// src/sim/combat.ts，与 setFocus / useHealPotion 并列
export function useSignature(state: BattleState, memberId: string, targetId?: string): boolean
```

写入 `state.commands`，由 `stepBattle` 消费。UI 与 `ai.ts` 都只调这个函数。

**12 个技能的设计约束**（具体技能由制作人定稿，代理按约束实现；专精 id 去 `src/data/jobs.ts` 现读，勿凭记忆）：

1. 每个招牌技必须引入一个**当前 15 种效果里没有的动词**，或一个**新的目标形状**（如「指定友方」「指定敌方 + 位移」）。
2. 禁止「通用 `heavy-strike` + 数值差异」——这正是 B4 要修的火焰法师那种做法。
3. 至少 4 个技能必须与 Boss 机制**产生交互**（打断加成 / 免疫蓄力 / 清除束缚 / 拉回被 `pull` 的后排）。机制引擎已经在那了，招牌技是玩家终于能回应它的手段。
4. 治疗系的招牌技必须作用于**指定友方**，否则 `heal-lowest` 的自动化会把它吃掉。

**判定标准**：如果一个招牌技可以被「自动施放」而玩家察觉不到差别，它就没做对。

---

### #1.2 清理换皮精进技能（2 人日）

**现状**：`src/data/jobs.ts` 的 `advancedSkills`（精进二选一）大量是**同 effect 改 CD**，部分选项严格劣于基础技。

确认删除清单：

| 技能 | 问题 |
|---|---|
| `盾墙坚守` | `taunt` cd45 —— 与 `威吓` cd60 同 effect |
| `荆棘威吓` | `taunt` cd55 —— 同上 |
| `战吼` | `taunt` cd60 —— 同上 |
| `真言盾·固` | 与 `真言盾` 同 effect，仅 cd45 vs 50 |
| `极寒领域` | `frost-nova` cd150 —— 严格劣于 `霜寒新星` cd120 |
| `穿云箭` | `heavy-strike` cd75 —— 劣于 `瞄准射击` cd70 |
| `炎爆术` | `heavy-strike` cd70 —— 劣于 `火球术` cd60 |
| `冲锋号角` | cd75 —— 劣于 `冲锋号令` cd70 |

**规则**：精进二选一的每个存活选项必须**改变 `effect`**，不得只改 `cdTicks` 或系数。被删项留下的空位由 #1.1 的招牌技或新 effect 填补；**宁可暂时只有一个选项，也不要放一个换皮选项。**

**验收**：不变量断言 —— 同一专精的 `advancedSkills` 内，任意两项 `effect` 不得相同。

---

### #1.3 火焰法师真机制（1.5 人日）

**现状**（B4）：`mage-fire` 的 identity skill 是通用 `heavy-strike`，差异只有 `critChance +0.02`，属于宪法 v3.1 明令砍掉的「纯数值专精」，因「经典」被保留。

**目标**：新增 `burn`（灼烧 DoT）与 `detonate`（引燃引爆：消耗目标身上的灼烧层数换爆发）两个 effect。战斗层已有 `burnUntilTick` / `burnFrom` 字段（`combat.ts:478-483` 的 `ember-breath` 特质在用），复用之。

火法身份变为「叠灼烧 → 选时机引爆」，这同时给了它一个招牌技（#1.1）和一个**资源维度**（层数），是当前唯一「攒还是放」的决策。

**禁止**：不要为此新增法力/怒气等全局资源系统（0.2 节）。灼烧层数挂在**目标**身上，不是角色资源。

---

### #1.4 砍隐形 synergy（0.5 人日）

**现状**：`jobs.ts` 的 `SYNERGY` 只有 2 条（`shield-wall`、`blessed-formation`），均为永久生效且**不可见**的被动团队 buff。

**v2 读码**：两条的实际状态不同，处理也不同。
- `shield-wall`（`combat.ts:364` 消费）：有坦克存活时，游侠/战士 +15% 攻击。**正在生效。**
- `blessed-formation`（`jobs.ts:287-294` 定义）：`combat.ts` 里**没有任何读取点**，是死数据，UI 也没展示它的说明。

**目标**：
- `shield-wall`：删除，+15% 并入游侠/战士基础攻击。注意这会去掉「有坦克存活」这个条件，严格说是一次小幅加强（坦克阵亡后仍保留加成）。这点可以接受，因为 C4 冻结的是**调参**，不是这类收敛；但 HANDOFF 里必须写明。
- `blessed-formation`：直接删除定义。它现在不生效，删掉对数值**零影响**，不要「并入」任何职业，否则反而是一次加强。

**禁止**：不要改成「可见条件羁绊」——那是新机制，违反 0.2 节。羁绊系统留给批次 4 之后。

---

### #1.5 挂机 AI 适配招牌技能（2 人日）

**现状**：`ai.ts` 仅 78 行，if-else 阶梯。另有一个独立缺陷：

```ts
const captain = aliveOf(state, 'guild')[0]   // ai.ts:21
```

队长取「第一个存活成员」，**队长阵亡后性格换人，挂机打法中途改变**。

**目标**：
1. 队长改为**显式字段**，阵亡后保持（阵亡队长的指令风格继续生效，或明确降级为中性），不得随数组顺序漂移。
2. AI 通过 `useSignature` 释放招牌技，释放倾向由性格决定（勇猛优先爆发、谨慎优先保护/打断）。
3. AI 的**机制判断必须走 `MECHANIC_REGISTRY[...].intent()`**，不得重新写一遍 kind 判断（#0.1 的成果不许退化）。

**验收**：手动与挂机在同一副本的胜率差**可测量且显著**（这是 G04 的正向指标）。

---

### #1.6 战斗反馈打磨（4 人日）

伤害数字弹出、击中顿帧、暴击特写、血条缓动、命中音效、打断成功的明显演出。

**必须排在 #1.1 之后。** 在玩家无法操作的战斗上加特效是本末倒置——先让操作存在，再让操作有回响。

`BattleRenderer.ts` 已 1072 行，事件流（`state.events`）已完备（`damage` / `interrupted` / `slam` / `telegraph` / `zoned` / `pulled` / `bound` / `enraged` / `summoned` / `phase`）。本任务是消费既有事件，**不要为了演出往 sim 层加事件类型**；确需新事件时先确认 sim 侧本就该发它。

---

### 批次 1 出口条件

- 12 专精各有 1 个招牌技，玩家可点名释放。
- `advancedSkills` 内无同 effect 选项（断言保证）。
- 手动 vs 挂机胜率差可测量。
- 人工试玩确认「每 30–60 秒一个有意义决策」。
- **仍未做数值精调。**

---

## 第 5 节 · 批次 2 · 让装备值得刷（19 人日）

**目标：让「构筑」这个词开始存在。**

现状（`src/data/affixes.ts`，全文 25 行）：18 条词条实际只覆盖 **8 种属性** —— attack ×3（锋利/蛮力/残暴）、maxHp ×4、defense ×2、speed ×2、critChance ×2、lifesteal ×2、healReceived ×1、fireResist ×2。同属性多档只是换名换区间，**不产生任何构筑决策**。装备唯一的问题是「数字大不大」。`DESIGN.md` 第 13 章承诺的暴伤/破甲/威胁/药效词条**均未实装**。

---

### ⚠ 新增属性 7 处接线清单（#2.2 的核心，一处不落）

每新增一个 `StatKey`，必须同时登记 7 处。**这是本项目最容易产生接缝缺陷的地方。**

| # | 位置 | 内容 |
|---|---|---|
| 1 | `src/sim/types.ts` | `StatKey` 联合类型 + 该 key 的格式种类（整数/百分比） |
| 2 | `src/sim/loot.ts` `equipmentStats()` | 装备聚合 |
| 3 | `src/sim/combat.ts` `statLayers()` / `toCombatant()` | 有效值计算（基础 + 装备 + buff + 创伤） |
| 4 | **实际战斗数学点** | 该属性真正改变某个数字的地方 |
| 5 | `formatStat()`（#0.4 建立） | 展示格式 |
| 6 | `powerScore()` | 权重 |
| 7 | `src/data/affixes.ts` | 词条条目 + 倾向池归属 |

**配套不变量断言（I8）**：对每一个 `StatKey`，构造两个仅该属性不同的探针战斗，结果**必须不同**。这条断言会自动抓出「加了属性但没接到战斗里」的死属性——那正是当前 `healReceived` 之类问题的成因。

---

### #2.1 词条表重做（1.5 人日）

存活 8 条命名词条：`aff-atk` 锋利、`aff-hp` 坚韧、`aff-def` 加固、`aff-spd` 轻捷、`aff-crit` 致命、`aff-steal` 吸血、`aff-heal` 受疗、`aff-fireguard` 驭火。

删除（同属性多档）：`aff-atk2`、`aff-brutal`、`aff-hp2`、`aff-thick`、`aff-vital`、`aff-guard`、`aff-swift`、`aff-keen`、`aff-leech`、`aff-emberproof`。

```ts
export interface AffixDef {
  id: string
  name: string
  stat: StatKey
  /** tier 化：同词条不同 tier 只改区间，不新增 id */
  tiers: Array<{ tier: 1 | 2 | 3 | 4; range: [number, number] }>
  /** 倾向池（E02） */
  pools: Array<'common' | 'tank' | 'healer' | 'dps' | 'caster'>
}
```

tier 区间直接沿用被删词条的原区间（锋利 [2,6] → 蛮力 [4,9] → 残暴 [6,11] 天然就是 tier 1/2/3），**不要重新设计数值**。

---

### #2.2 新增 7 种属性 + 引擎接线（5 人日）

| StatKey | 中文 | 战斗数学点 | 意义 |
|---|---|---|---|
| `critDamage` | 暴击伤害 | 暴击倍率 | 与 `critChance` 形成第一个真乘区取舍 |
| `attackSpeed` | 攻速 | 攻击间隔 tick | 与 `attack` 形成 DPS 两条路 |
| `armorPen` | 破甲 | 减防结算 | 对 `shield` 原型专属价值 → 产生**针对性配装** |
| `damageReduction` | 减伤 | 受伤乘区 | 与 `defense` 分工（定值 vs 百分比） |
| `healPower` | 治疗强度 | 己方治疗**输出** | 见 #2.7 |
| `threatMult` | 威胁加成 | 仇恨累计 | 坦克首个非生存向属性 |
| `cdReduction` | 冷却缩减 | 技能 CD | **与 #1.1 招牌技直接联动，批次 1 之后它才有意义——这是排序的原因** |

每条都走 7 处接线清单。成本几乎全在第 3、4 两处。

---

### #2.3 触发类词条（2.5 人日）

受击时 / 击杀时 / 低血时触发。复用**威能（legacy powers）已有的钩子机制**，下放到词条层。

这是让装备从「属性条」变成「行为改变」的关键，也是刷子游戏「chase item」的载体。

**禁止**：不要新建一套触发系统。先读威能的钩子实现，复用它。

---

### #2.4 装备对比界面（3 人日）

**现状（E04）**：战力评分上涨的换装会出现系统性胜转败。

**根因不是评分算错，是评分被用在了错误的场景。** 刷子游戏在**背包过滤**场景需要一个标量（几百件装备必须能排序），但在**「该不该换」**场景需要看取舍。

实现两个语境：
- **过滤语境**：保留评分，用于排序与隐藏垃圾。
- **取舍语境**：候选 vs 已装备，逐属性 delta + 对该角色关键属性的影响（如坦克看有效血量与威胁，治疗看 `healPower` 与续航），**不给单一结论**。

**验收**：E04 复测 —— 对比界面能解释每一次「评分涨了但打输了」的换装。

---

### #2.5 掉落过滤 + 一键分解（2 人日）

刷子游戏的生死线级 QoL。按品质/倾向池/属性阈值过滤；批量分解；锁定保护。

---

### #2.6 确定性改造（4 人日）

词条升级 / 重洗单条 / 品质提升 + 配套货币（货币来源＝分解）。

**目的**：让第 50 遍有**进度感**，而不是纯等运气。这是 Last Epoch 对 Diablo 的主要改进，也是「反复刷」定位的必需品。

**禁止**：这是本计划允许的唯一新增经济系统。不要顺手加别的货币或商店。

---

### #2.7 治疗定位纠偏（1 人日）

**现状（E01）**：`healReceived`（受疗，作用于**自己被治疗时**）被当成治疗职业的收益词条，但治疗者需要的是**治疗输出**。

**v2 读码**：当前治疗有 3 条独立的路径，本任务必须全部覆盖：
1. 技能治疗：`combat.ts:699`，`c.attack * 4.5 * (1 + healReceived)` —— 治疗量吃的是治疗者**攻击力**与**被治者**的受疗。
2. 药水：`useHealPotion`，固定比例，不吃任何属性。
3. 远征 buff：`combat.ts:264` 的 `mods.heal` 直接改写 `healReceived`（「治疗减半」塔词缀将来也会走这里）。

**目标**：拆成两个属性 —— `healPower`（我治别人的量，#2.2）与 `healReceived`（别人治我的量，保留）。
- `healPower` 以乘区方式挂在第 1 条路径的 `attack * 4.5` 之后：`attack * 4.5 * (1 + healPower) * (1 + healReceived)`。不要改 `4.5` 这个系数（C4）。
- 第 2 条路径（药水）明确声明**不吃** `healPower`，也不吃 `healReceived`，写进 `mech-docs` 或属性说明，不要留成隐含行为。
- 第 3 条路径的 `mods.heal` 改为独立乘区 `healTakenMod`，不再覆盖 `healReceived`。否则玩家堆的受疗词条会被远征 buff 吞掉。
- 断言：三条路径都经过同一个 `computeHeal(source, target, kind)` 函数。

---

### #2.8 词条倾向池（1.5 人日）

**现状（E02）**：职业命名的装备不具备对应属性。

**目标**：倾向池（`tank`/`healer`/`dps`/`caster`）+ 通用池。职业命名装备从对应倾向池抽取。

**禁止**：**不加职业穿戴硬锁。** 倾向只影响掉落分布，不限制穿戴 —— 跨职业配装是构筑乐趣的一部分。

---

### 批次 2 出口条件

- I8（无死属性）全绿，覆盖范围**包括现有两套套装的加成**（依据 ⚖ D-2：套装已上线，数值冻结，但必须接进 `formatStat` 与 I8）。
- `App.tsx:1407` 的套装文案改为读引擎定义，不再硬编码数字。
- E04 复测通过。
- 15 条词条（8 旧 + 7 新）× tier 化，无同属性多档。
- 过滤 + 分解 + 确定性改造闭环可用。
- **此时才解除 C4 数值冻结**，开始第一轮正式平衡（含修 #0.8 记录的倒挂清单）。

---

## 第 6 节 · 批次 3 · 高塔赌局化（9 人日，结构规格）

**目标：把主菜从「更难的副本」改造成赌局。** 本批次成本最低、体验改变最大。

`src/sim/tower.ts`（256 行）现状四个缺口：

| # | 现状 | 改法 | 人日 |
|---|---|---|---|
| 1 | **奖励逐层立即入账**（`settleTowerFloor`）→ 零风险 | **下塔才结算**：战利品累计进 `TowerRun.pendingLoot`（#0.6 已建好），下塔兑现，团灭损失大部分 | 2 |
| 2 | 纯线性缩放（`scalingPerFloor: 0.15`），**无任何局内变数** | **词缀层**：每 3 层一「段」，进段随机挂 1–2 条，层数越高越多 | 2.5 |
| 3 | 内容池只取版图一：`BOSS_ROTATION`（`tower.ts:87`）只有格鲁什、塔尔玛、深锚 3 个 Boss；`FLOOR_POOL`（`:151`）只有黑苔的蛙/狼/水蛭 | 随层数解锁全版图怪组与 Boss 轮换（纯数据工作）。版图二的怪进塔同样经 `difficulty.scaleEnemy`，不得在 `tower.ts` 再写缩放 | 1.5 |
| 4 | 允许挂机爬塔（`TowerRun.autoMode`） | **禁止**（A4）。删除 `autoMode` 及其 UI 入口；挂机仅限已通关副本。塔记录已经只认手动，所以这里只需删代码 | 0.5 |

塔词缀全部**复用已有机制**，几乎零新增引擎工作：

| 词缀 | 复用 |
|---|---|
| 灼热 | `DungeonDef.env: 'heat'` 已实现 |
| 增援加倍 | `summon` 机制 `params.count` |
| 治疗减半 | 治疗乘区已存在 |
| 残血开局 | 战斗初始化 |
| 提前狂暴 | `enrage` 的 `params.atTick` |
| 精英附加机制 | `bossMechanics` 数组追加 |

另外两项：
- **保险扩展**（1 人日）：`insureNextTowerFloor`（现 `target * 40`）从「阵亡装备免赎回」扩展为「团灭保住部分累计战利品」，成为赌局的对冲工具而非边缘钱坑。
- **收手界面戏剧化**（1.5 人日）：累计战利品 + 下一段词缀预览 + 队伍状态同屏。「何时收手」必须是戏剧性时刻，不是一个「继续/离开」按钮。**塔的全部乐趣来自这一屏。**

塔的 3 人限制（`startTower` 的 `.slice(0, 3)`）在批次 4 精力系统落地后重新评估，本批次不动。

**依赖（v2）**：第 1 项「下塔才结算」依赖 #0.10。只在 `settleEncounter` 的 `source === 'tower'` 分支里改，不另开结算函数。

**出口 = M2 里程碑。**

---

## 第 7 节 · 批次 4 · 公会经营成立（13 人日，结构规格）

**目标：公会 KPI 从「战力」改为「可持续出勤人数」。** 依赖 #0.6。M2 之后细化。

| ID | 内容 | 人日 |
|---|---|---|
| #4.1 | **精力（`stamina` 0–100）**：出征按场次/受创/天数消耗，只能靠天数恢复。低精力 → 属性衰减、创伤概率上升、士气下滑加快 | 4 |
| #4.2 | **出征补给成本**：口粮（人数×天数）+ 药水 + 装备维护。回应 R01 金币溢出，且不必削减卖装收入 | 2 |
| #4.3 | **撤退代价**：保命但本次收获全丢 + 额外精力惩罚 + 创伤判定。现状撤退＝零代价，副本因此没有「输」的体感 | 1.5 |
| #4.4 | **建筑职责重分工**：宿舍＝名册上限/精力恢复；酒馆＝招募与士气；疗养所＝创伤；训练场＝替补追赶；铁匠铺＝维护费/重铸/分解；纪念堂＝遗产 | 3 |
| #4.5 | 替补追赶（训练场经验补正）+ B9 的 `attrPoint` 改玩家指定维 | 1.5 |
| #4.6 | 「天」收口为主时间资源：出征/休息/治疗/建设/委托期限共享同一池 | 1 |

精力一条机制同时解决六个悬空问题：G03 主力替补差距（主力必须休息→替补必须上场）、三人打天下、建筑只是被动加成、招募无真实需求、「天」无资源竞争、无脑连刷低级图。

**没有精力，公会经营层永远是装饰。**

**出口**：G03 复测 —— 三人长期出征在新规则下不可持续；自然形成 8–12 人轮换名册。

---

## 第 8 节 · 批次 5–6（结构规格）

### 批次 5 · 副本阶梯（8 人日）

**#5.1 悬赏加码条款（4 人日）** —— 接副本时自选，可叠加，奖励乘算。难度由**玩家主动出价**，而非系统强加，这是让副本有阶梯又不污染「反复刷」的关键。

| 条款 | 约束 | 奖励 |
|---|---|---|
| 急行军 | 限制总轮次 | ×1.3 |
| 轻装 | 不可携带药水 | ×1.4 |
| 带新人 | 必带 1 名低于队伍均等级 5 级者，且其不可倒下 | ×1.5，该员双倍经验 |
| 深潜 | 必须走完整路线，禁用直捣 Boss | ×1.3 |
| 不设防 | 关闭撤退保护，本次开启永久死亡 | ×2.0 |

「带新人」把 G03 从待测量问题变成核心玩法；「不设防」落实 A6/A6′。

**#5.2 熟练度新出口（1.5 人日）** —— 现设计终点「满熟练解锁直捣 Boss」与「反复刷」方向相反：它奖励重复的方式是**消除变数并允许跳过内容**。改为：1–10 遍揭迷雾（保留，体验良好）；满熟练后「直捣 Boss」降级为**低收益快速通道**（只给 Boss 掉落，不给沿途材料与经验），用于赶委托进度；完整收益必须走全程，而全程可挂加码条款。

**#5.3 敌人原型扩充（2.5 人日）** —— 现仅 `shield`/`striker`/`bruiser` 三种，配不上 15 条词条的构筑空间。

### 批次 6 · 收尾（9 人日）

| ID | 内容 | 人日 |
|---|---|---|
| #6.1 | 图鉴/收藏（装备、怪物、英雄纪念册、最高层记录墙）。数据已有，只差界面，留存性价比极高 | 3 |
| #6.2 | 目标链/公会总览可视化 | 2 |
| #6.3 | M3 完整真人式新档验收 | 2 |
| #6.4 | 文档整理：`DESIGN.md` 重写式修订（C2）；历史文档加快照抬头（C3）；`ISSUE-INVENTORY.md` 更新 | 1 |
| #6.5 | 移动端与长时间运行覆盖补测 | 1 |

---

## 第 9 节 · 统一验收口径（C5，回应 R05）

旧目标「首次通关累计死亡 1–3 人」「70–85% 胜率」口径不清，无法复现。现统一为：

| 维度 | 口径 |
|---|---|
| 阵容 | 自然养成档，主力 3 人 + 替补，**禁止固定模板** |
| 装备 | 该版图自然掉落所得，**不得人工发装** |
| 保护 | 默认开启（「不设防」条款视为独立档位单独验收） |
| 范围 | **整趟远征**，非单 Boss |
| 操作 | 手动 |
| 采样 | 随机 20 次取平均，**不得挑选种子** |
| 目标 | 首次通关累计死亡 0–1 人；抽样胜率 70–85% |

**「已修复」不等于「已上线」**。本节用于阶段出口的难度、死亡与成长体验验收，保留自然养成和人工试玩要求。

**阶段验收校准（2026-09-29，按用户“合理验收、自动化、结果分析与修正文档”的要求）**：具体修复先按其目标验证复现用例、相关边界、实际调用链及兼容性，并通过完整 verify；不能只跑最初的单一探针。结果分开记录“代码缺陷已验证”“玩法阶段待验收”“是否上线”。例如 #0.3 的异属性总和不能验证词条公平性，应检查同预算逐项一致；也不能凭这一项通过就宣称整趟远征的成长/胜率达标。涉及难度与奖励强度的实际影响，带入本节后续阶段复测，不为每个局部修复重复要求 20 趟自然养成。

---

## 第 10 节 · 明确不做（防止复活）

本计划周期内**不启动**，除非批次 0–6 全部完成：

- 混合职阶回归、**新增**套装（现有灰冠/猎风 2 套已上线，保留并冻结，见 ⚖ D-2）、声望、10 人本、公会保卫战、亡灵叙事、版图三
- 心愿（`wish.ts`）与特性（`traits.ts` / `member-traits.ts`）的合并或扩写（已上线，冻结保留，见 ⚖ D-1）
- 深度人物模拟、完整新手引导、美术/UI 换皮、BGM
- 任何新增经济系统（#2.6 确定性改造除外）
- **继续扩写事件表**
- 可见条件羁绊系统（批次 4 之后再议）

S2 心理怪癖 / S3 永久残缺：批次 4 之后再议，届时精力系统会提供更好的挂载点。

---

## 第 11 节 · 风险登记

| 风险 | 应对 |
|---|---|
| #0.6 远征对象序列化受阻（App.tsx 约 2660 行） | 先补冒烟测试再动刀；严格限定范围；可推迟至批次 4 前，不可取消 |
| 批次 1–2 使全部平衡结论作废 | **预期行为。** 遵守 C4，批次 2 出口才解冻 |
| #0.1 后版图二变简单 | **预期行为**（死代码变活）。记录，不要调数值 |
| 新增 7 属性漏接线 → 死属性 | I8 断言 + 7 处接线清单 |
| M2 发现主菜不好玩 | **这正是 M2 的意义。** 预留重设计缓冲，不要跳过 |
| 破坏性重构后现有试玩档作废 | 扩展 `scripts/dev-save.ts` 为新 schema 的档案生成器 |
| 代理跨任务顺手改 | 0.1 节纪律；commit 必须单任务 |
| #0.10 搬结算时改变了副本行为（v2） | 副本路径的 smoke/gameplay 金值必须**不变**，这是「只搬家」的机器证明。高塔金值允许变化，但要在 HANDOFF 里逐条列出 |
| #0.10 使高塔突然「更痛」（多了死亡冲击），试玩者误以为是平衡调整（v2） | 这是缺陷修复（D-3）。更新日志里写明「塔中阵亡现在会被公会记住」，并且作为叙事功能来介绍 |
| `shield-wall` 并入基础值后坦克阵亡时战士/游侠更强（v2） | 幅度小，属于收敛的必然代价；HANDOFF 写明，C4 解冻后统一复核 |
| 裸 `Math.random` 换成 `rng` 后，所有固定种子的黄金值一次性全变（v2） | 预期行为。在同一个 commit 里重新生成黄金值，commit 说明写「仅 RNG 来源变化」，复审方据此核对没有夹带逻辑改动 |
| 用 v1 施工的代理按旧规格新建 `RunState`（v2） | 仓库内只保留 v2；v1 由 git 历史保留。HANDOFF 标注「以 v2 为准」 |

---

## 第 12 节 · 缺陷台账映射

| 既有 ID | 处置 |
|---|---|
| B01 | #0.1（根治整类，非逐个补丁） |
| B02 | #0.1（`stepCastWindow` 统一判定顺序） |
| B03 | #0.2 / #0.8（`scaleEnemy` 唯一入口） |
| B04 | #0.3 |
| B05 | #0.4（`formatStat` + I5 断言） |
| B06 | #0.5（物品注册表 + I6 断言） |
| C-3（v2 新发现：结算双管线、塔中阵亡无后果） | #0.10 + I9 |
| C-4（v2 新发现：杂兵机制、召唤↔预警耦合、ground-zone 无读条事件） | #0.1 v2 补充 + I10 |
| C-5（v2 新发现：敌人 6 个乘区、`scaleEnemy` 重名） | #0.2 + #0.8 |
| C-7（`blessed-formation` 死数据） | #1.4 |
| C-9（治疗 3 条路径） | #2.7 |
| E01 | #2.7 |
| E02 | #2.8 |
| E03 | #2.1 |
| E04 | #2.4（双语境） |
| E05 | 随批次 2 装备重做覆盖 |
| G01 G02 | #0.8 难度模型 + I7 / I7b 断言；实际修倒挂在批次 2 出口后 |
| G03 | #4.1 精力 + #4.5 替补追赶 + #5.1 带新人条款 |
| G04 | #3 塔禁挂机（结构解）+ #1.5 胜率差可测 |
| G05 | #4.6「天」资源收口后重测 |
| R01 | #4.2 补给成本 |
| R02 R03 | 批次 4 随精力/疗养体系重设计 |
| R04 | #0.6 远征对象可序列化（含 `rngState`） |
| R05 | 第 9 节统一口径 |

---

## 第 13 节 · 接缝登记簿

发现「同一概念多处登记且无法合并」时在此追加，格式：`概念 → 登记点清单 → 是否已合并`。

| 概念 | 登记点 | 状态 |
|---|---|---|
| 机制可打断性 | ~~`combat.ts:496`、`mechanics.ts:317`、`ai.ts:32`、`mech-docs.ts`~~ → `mechanic-registry.ts` | #0.1 后合并为 1 处 |
| 敌人数值缩放 | ~~`createBattle`、`summonPool`~~ → `difficulty.scaleEnemy` | #0.2 后合并 |
| 词条生成预算 | ~~紫装分支、普通分支~~ → `rollAffixes` | #0.3 后合并 |
| 属性展示格式 | ~~各展示位~~ → `formatStat` | #0.4 后合并 |
| 物品归属 | ~~members/inventory/pendingRelics~~ → `save.items` 单一仓库 | #0.5 后合并 |
| `StatKey` | 7 处（见批次 2 清单）**无法合并** | 靠 I8 断言守 |
| 遭遇结算（v2） | ~~`App.tsx:516-640` 副本、`App.tsx:344-420` 高塔~~ → `settlement.settleEncounter` | #0.10 后合并 |
| 阵亡登记（v2） | ~~`run.ts:182 markPermadeath`、`tower.ts:233 towerMarkPermadeath`~~ → 1 个 | #0.10 后合并 |
| 敌人乘区（v2） | ~~`enemyPower`、`difficultyMods`、`ENEMY_HP_MULT`~~ → `rating`；精英 / 稀有猎杀 / 塔层 → `DifficultyInput.modifiers` | #0.2 + #0.8 后合并 |
| 远征对象（v2） | `DungeonRun`、`TowerRun` 共用 `RunCore`；**禁止第三个类型** | #0.6 后合并公共部分 |
| 套装加成文案（v2） | ~~`App.tsx:1407` 硬编码~~ → 读引擎定义 + `formatStat` | 批次 2 后合并 |
| 治疗量（v2） | ~~技能 `combat.ts:699`、药水、`mods.heal` 覆盖 `healReceived`~~ → `computeHeal` | #2.7 后合并 |
| 随机数来源（v2） | ~~`App.tsx` 25 处、`tower.ts` 3 处、`member-traits.ts` 1 处~~ → `rng.ts` | #0.10 后合并 |

---

<!-- v2 注：以下附录由 d0a9e1a 加入，在合并 a84a4fe 时丢失，此处原文恢复。复审意见针对 v1；v2 的改动均在复审第 4 点纪律（反接缝、C4、关系断言、单任务 commit）范围内，未改变第 2 点投赞成票的三项核心设计。 -->

## 附 · zcode 侧独立复审意见(2026-09-27,复审方背书)

复审人:zcode(制作人侧 AI,独立复审与部署职责)。全文阅读 IMPLEMENTATION-PLAN/REDESIGN-PROPOSAL/ISSUE-INVENTORY 后的正式意见:

1. **诊断认同**:反接缝规则(六大缺陷五个同源于"同一概念两条实现路径")与制作人侧复审的踩坑史互相印证(potionHeal 双路径/选路索引漂移/settleGrowth 索引错位均属此类);"玩家可触发机制为 0"的操纵感根因诊断,与制作人最早"没有操纵感"反馈及 K06 后的实测感受一致。
2. **三项核心设计投赞成票**:招牌技能(每专精一个点名技,至少 4 个与 Boss 机制交互)/精力系统(公会经营的唯一支点,一机制解六悬空)/塔赌局化(下塔才结算+词缀+禁挂机,成本最低体验改变最大)。
3. **三项代价已知悉并向制作人转达**:试玩者存档随破坏性重构反复作废(需知会试玩群);"通关太轻松"按 C4 冻结至批次 2 出口(约半年);周期 40 周(半职口径)以 M1/M2 止损点控制。
4. **复审执行纪律**:批次 0 起每个 PR 的独立复审将额外核查——①反接缝规则执行(新概念登记点收敛);②C4 数值冻结未被顺手破坏;③I1-I8 断言写关系不写数值;④commit 单任务纪律。
5. **S3 口径漂移修正备案**:zcode 此前 S3 复审中"独臂防御 +2/清空 scars"与 DESIGN 14.1 既有值(防御习惯 +1)不一致,以 DESIGN 14.1 为准,已按 Codex 标记回退。

复审方将按本计划配合施工,里程碑 M1/M2/M3 的人工试玩组织与数据桩对齐由制作人侧完成。
