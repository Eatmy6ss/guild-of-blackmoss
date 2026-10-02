# 阶段 A 验证报告 + 修改方案(Claude,2026-10-02)

**基线**:main `a999094`。**2026-10-02 晚更新**:Q1–Q5 已由制作人拍板(DECISIONS U26),新增第 5 组。

隔离副本里 `npm ci` 后跑完整 verify,**退出 0**(资源检查、Vitest 21 个文件 97 项、管理员类型、smoke ✓×47、玩法/王国回归、生产构建)。verify 是绿的,但下面这些问题它都测不到。

**方法**:三条线并行。
- 读码:账本/说书人、引导/试玩包/设置、招牌技/战斗。
- 实机:无头 Chromium 打开 file:// 试玩包,隔离浏览器配置。
- 单测探针:临时 vitest 文件,跑完即删。

**实机覆盖**:
- 新档从第 1 天跑到第 150 天:119 趟远征,说书人讲了 41 条。
- Lv12 满编档打荆棘要塞,到达结束画面,导出 JSON 和战报卡。
- 通关后经王国委托进入版图二。
- 全程 0 个控制台错误。存档只写入 `guild-game-playtest-v1`。

## 回归脚本

`scripts/e2e-playtest-full.mjs`(已加入 .gitignore 白名单)。它把上面的实机流程固化成脚本,每个问题对应一个断言。

```bash
node scripts/e2e-playtest-full.mjs --build                 # 打包(两步)+ 全部阶段
node scripts/e2e-playtest-full.mjs --phase=fresh --expeditions=12
node scripts/e2e-playtest-full.mjs --phase=ending,region2
CHROME=/path/to/chrome node scripts/e2e-playtest-full.mjs  # 非 Mac
```

- **四个阶段**:
  - `build`:检查产物是否内嵌素材。
  - `fresh`:新档 N 趟远征。检查音量、引导提示、结算横幅、故事文本和存档键。
  - `ending`:用 `dev-save.ts` 现场生成满编档,打荆棘要塞,检查结束画面、导出和战报卡。
  - `region2`:检查试玩边界。
- **隔离**:每个阶段各用一个 mkdtemp 浏览器配置。下载在页面内截获,不落盘。不写仓库,也不写用户的 localStorage。
- **产物**:截图和 `report.json` 写在系统临时目录。有任何 FAIL,退出码为 1。

**今天的运行结果**(VM,修复前):

| 检查 | 结果 | 实测 |
|---|---|---|
| B1 内嵌素材 | ✓ | 14.0MB(VM 里已补跑两步;你本机那份 4MB 的会 ✗) |
| B2 默认音量 | ✗ | 滑块值 0 |
| B3 结算行保留 | ✗ | 有故事的 4 趟里,3 趟的横幅只剩故事 |
| B5 未知之地 | ✓(假阴性) | 这次抽到的创伤模板不含地点槽。150 天长跑里出现过多次,以单测为准 |
| B6 版图二 | ✗ | 进入「烬石隘口 · 朝圣狂徒」 |
| S1 结束前可导出 | ✗ | 大厅没有导出入口 |
| S10 提示一次一条 | ✗ | 同屏 3 条 |
| 结束画面/导出/战报卡 | ✓ | 6 秒通关,JSON 字段齐全,PNG 86KB |
| 存档隔离/控制台 | ✓ | — |

> 已知局限:B4(刷新后重讲)和 B7(同 tick 覆盖)在 UI 层很难稳定触发,改用单测锁定(见修改方案)。B5 的随机性同理。

---

## 问题总表

来源:**实**=实机复现,**码**=读码确认,**测**=单测探针复现。严重度:**阻断**=G2 前必须修;**建议**=可排期;**疑问**=交制作人判断。

### 阻断(7)

| # | 问题 | 来源 | 证据 |
|---|---|---|---|
| B1 | 本机试玩包没有内嵌素材 | 码+实 | `dist-playtest/index.html` 只有 4.0MB,没有任何 `data:image/png`。README:44 只写了 `vite build`,漏了 `node scripts/inline-assets.mjs` |
| B2 | 新玩家默认音量为 0 | 码+实 | `audio.ts:15`:`Number(localStorage.getItem('gg-volume'))`,而 `Number(null) === 0` 能通过校验 |
| B3 | 说书人故事冲掉本趟结算通知 | 码+实 | `App.tsx:507` 先 `setScarNotices(o.notices)`;`:522` 再 `[...scarNotices, story]`,读的是旧闭包。实测 3/4 趟里金币、阵亡、经验行全部消失 |
| B4 | 说书人水位不存档 | 码 | `storyCursorRef`/`expeditionStartFactRef`(`App.tsx:217-218`)只是 ref。刷新后可能重讲旧的延迟兑现;远征中途刷新,会用历次远征的事实拼「本趟」故事 |
| B5 | 创伤故事的地点是「未知之地」 | 码+实 | `storyteller.ts:47` 的 `placeOf` 只读 `f.cause`。scar 事实只有 `refs.dungeonId`(`settlement.ts:173`);塔的 id 是 `'tower'`,不在 DUNGEONS 里 |
| B6 | 试玩版能进入版图二 | 码+实 | 版图过滤只作用于选图按钮(`App.tsx:2292`)。王国委托 `crown-embers` 指向 `emberpass`,`startExpedition`(`:733`)不检查 `__PLAYTEST__` |
| B7 | 招牌技指令只有一个槽,后写覆盖前写 | 码+测 | `combat.ts:1176` 直接赋值 `commands.signature`。探针:m1 手动受理成功后跑一次 `runAutoAI`,队列里只剩 m2。两名打断位同一轮只生效一次;G2 要测的「手动 vs 挂机胜率差」也会失真 |

### 建议(12)

| # | 问题 | 来源 | 证据 |
|---|---|---|---|
| S1 | 导出和战报卡只在结束画面出现 | 码+实 | `App.tsx:1627-1628` 是唯一入口。没打通就流失的试玩者导不出记录。提交 a11c4fa 的说明写了「顶栏」,实际没有 |
| S2 | 热键解锁停在首次渲染时的状态 | 码 | `App.tsx:1400-1411` 的 effect 依赖是 `[]`,`dockUnlocked` 读到的是初始的 day/inventory |
| S3 | AI 引爆取错层数 | 码 | `ai.ts:82` `caster?.burnStacks ?? max`:读条者有 0 层时不回落到最大值,别的敌人叠满 5 层也永不引爆 |
| S4 | 被定身的队友仍能放招牌技 | 码 | `combat.ts:1162/1190` 只检查 `alive`,没看 `boundUntilTick` |
| S5 | 打断技会白扣冷却 | 码 | 读条在入队到执行之间结束,冷却照扣(`:1192`),日志仍写「使出」 |
| S6 | 圣疗可能点名到宠物 | 码 | `ai.ts:39` 的 `lowest` 含宠物,宠物没有 `memberId`,这一轮不治疗任何人 |
| S7 | `priest-chanter` 光环是死代码 | 码 | `combat.ts:1070/1073`,这个专精 id 不存在 |
| S8 | 说书人槽位错误 | 码 | 模板 31/33 显示原始 eventId;延迟兑现的 origin 只在水位之后找,常常找不到,文本变成「第 N 天的旧账,第 N 天兑现」 |
| S9 | 账本健壮性 | 码 | `normalizeLedger` 不校正 `nextId`,不补 `refs`/`actors`;relic-bind 断言在结算中 `throw`,持久化的结算每次读档都会重抛,存档卡死;links 不校验目标是否存在 |
| S10 | 首场战斗三条提示同时出现 | 码+实 | `BattleHints.tsx:11` 全量渲染,把战场推出首屏 |
| S11 | 试玩计数不准 | 码 | `App.tsx:2492` 在 `useSignature` 返回之前就给 `signatureUses` +1,失败也计数;撤退重复点击会重复计数。G2 恰恰要看这个数 |
| S12 | 「含混合职阶」测试名不副实 | 码+测 | `signature.test.ts` 的「全部专精(含混合)各有一个招牌技」只遍历 `JOBS`。15 个混合职阶在 `HYBRIDS`(`vocations.ts`)里,一个都没测,`SIGNATURE_SKILLS` 里也没有 `hy-*` |

### 疑问(已由制作人拍板,见 DECISIONS U26)

| # | 问题 | 结论 |
|---|---|---|
| Q1 | 说书人模板违反融合原则;全部默认用「他」,但账本和成员都没有性别字段 | **放宽规则**:前半句只写事实;收尾可以是氛围,但不得捏造事件或言行。**模板不用代词**。Claude 起草对照稿 [story-templates-draft-2026-10-02.md](story-templates-draft-2026-10-02.md),制作人三审 |
| Q2 | 15 个混合职阶没有招牌技 | **试玩版隐藏混合职阶**:酒馆不刷,训练场不显示、不解锁。正式版补齐招牌技后再开 → 第 5 组 |
| Q3 | 王国委托大厅链接没有第 4 天锁 | **锁住**,与 dock/热键一致 → 第 4 组 |
| Q4 | 故事类型偏科,同几句反复出现 | **B + C**:同类模板不重复最近 2 条;默契只在首次升星或升到 3★ 时讲,创伤只在本场濒死后生还或第 2/3 条伤疤时讲。不加类型冷却 → 第 5 组 |
| Q5 | 早先阵亡的人被配给后面的 Boss 首杀 | **两组都要**:Boss 战当场阵亡用同场模板,首杀之前阵亡用新增的「没走到 Boss 面前」模板 → 第 5 组 |

### 已确认正常

- 12 个专精的招牌技键全部对上。
- 冷却按战斗重置,副本和塔走同一路径。
- 免疫读条不能被打断;没有读条时打断不受理。
- 引爆层数上限 5。
- 战斗模拟里没有 `Math.random`。
- v21→v22 迁移正常;修剪窗口(30 天)大于延迟兑现最长 4 天。
- 变卖二次确认能防住双击。
- 倍速定时器清理正确。
- 存档写失败有提示。
- 试玩存档键已隔离。
- 结束画面、导出 JSON、战报卡全链路可用。
- headless 下战报卡的 emoji 显示成方框,这是 Linux 缺字体,不是游戏问题。

---

## 修改方案

总量约 **17.5 小时**(原四组 13h + U26 新增第 5 组 4.5h),按半职节奏大约一周。建议 zcode 施工,Codex 复审。每组修完都跑 `npm run verify` 和 `node scripts/e2e-playtest-full.mjs --build`。

### 第 1 组:发包止血(约 1.5h,不依赖其他组,可以今天做)

| # | 改法 | 验收 |
|---|---|---|
| B1 | `package.json` 加 `"build:playtest": "vite build --config vite.config.playtest.ts && node scripts/inline-assets.mjs"`;README:44 改成这条命令 | e2e `B1` ✓ |
| B2 | `audio.ts:15` 改为先判空:`const raw = localStorage.getItem('gg-volume'); if (raw !== null) { const v = Number(raw); if (Number.isFinite(v) && v >= 0 && v <= 1) volume = v }` | e2e `B2` ✓(滑块 50) |
| S10 | `BattleHints` 只渲染 `props.hints.slice(0, 1)`,点「知道了」后出下一条 | e2e `S10` ✓ |
| S1 | `__PLAYTEST__` 时在顶栏(音量旁)常驻「📤 导出记录」和「📷 战报卡」两个按钮,复用 `exportPlaytestReport`/`makeWarReportCard` | e2e `S1` ✓ |

### 第 2 组:说书人(约 4h)

| # | 改法 | 验收 |
|---|---|---|
| B3 | 先算故事,再**一次性**写横幅:`setScarNotices(story ? [...o.notices, '📖 ' + story.text] : o.notices)`。删掉 `:507` 和 `:522` 的两次写入 | e2e `B3` ✓ |
| B4 | 两个水位挪进账本本身:`FactLedger` 加可选字段 `toldThrough` 和 `expeditionStart`,由 `normalizeLedger` 兜底缺省(沿用 `hintsSeen`/`playMeta` 可选字段免迁移的先例;如判断需要正式迁移,走 `save.ts` MIGRATIONS 升 v23,smoke 合成存档同步补字段)。App 删掉两个 ref | 新单测:讲一条 → 序列化 → normalize → 再讲 → 返回 null |
| B5 | `placeOf = f.cause?.where.id ?? f.refs.dungeonId`;`dungeonName('tower')` 返回「黑苔高塔」(与大厅 `App.tsx:1727` 现用名一致;U24 的「裂隙」改名另行统一,本轮不动) | 新单测:只有 `refs.dungeonId` 的 scar 事实,对 6 条模板逐条断言文本不含「未知之地」 |
| S8 | `tellExpedition` 的入参改为 `(ledger, rng, { fromId, startId })`:碰撞照旧只看切片,origin 在全账本里找。新增槽位 `eventTitle`,从 `GUILD_EVENTS` 查标题,模板 31/33 改用它 | 新单测:origin 早于水位时,文本里两个天数不同;文本不含 `/[a-z]+-[a-z]+/` |
| S9 | `normalizeLedger`:`nextId = max(nextId, maxId + 1)`,补 `refs: {}`、`actors: []`。`appendFact` 的两条断言在 DEV 下照旧 throw,正式构建改成 `console.warn` 后跳过。links 只保留账本里存在的 id | 新单测:坏账本(nextId 落后、缺 refs)normalize 后能继续追加;重复 relic-bind 在正式模式下不抛 |

> 模板措辞和代词不在这组,见第 5 组(U26)。第 2 组只改逻辑,模板 31/33 先临时改用 `eventTitle`,第 5 组整体替换模板时一并覆盖。

### 第 3 组:招牌技(约 4h,另加门禁重标)

| # | 改法 | 验收 |
|---|---|---|
| B7 | `commands.signature` 单槽改为 `commands.signatures: Record<memberId, SignatureCmd>`,每名队员一格。`stepBattle` 在 tick 开始时按队员顺序执行并清空。`useSignature` 遇到该队员已有入队指令就拒绝,所以手动点的不会被 AI 改写。14 处测试引用随之改名。核对远征恢复(`run-recovery`)是否序列化了 BattleState.commands:旧字段 `signature` 读档时直接丢弃(待执行指令是瞬态) | 新单测:两名打断位同 tick 都执行;手动 m1 后跑 AI,m1 和 m2 都在队列里 |
| S3 | 先算全场最大层数和对应目标;读条者层数 ≥3 时优先引爆读条者 | 新单测:读条者 0 层、别的敌人 5 层 → 引爆别的敌人 |
| S4 | `useSignature`/`executeSignature` 加 `boundUntilTick > tick` 拒绝(UI 按钮同步禁用,显示「被定身」) | 新单测 |
| S5 | 打断类在执行时如果目标已不在读条:不扣冷却,日志改为「目标已收招」 | 新单测 |
| S6 | `ai.ts:39` 的 `lowest` 只在有 `memberId` 的队友里找 | 新单测 |
| S11 | `onUse` 改为 `if (useSignature(...)) setPlayMeta(+1)`;撤退计数按 run 去重 | 读码 |

> **重标提醒**:B7 修完后,挂机能打出的招牌技变多,门禁⑨的「手动 vs 挂机胜率差」黄金值会漂移。重标后,在 HANDOFF 里写明新旧数字,不要直接改阈值了事。

### 第 4 组:试玩边界与小修(约 2h)

| # | 改法 | 验收 |
|---|---|---|
| B6 | 新增唯一入口 `playtestAllows(dungeonId)`(`regions.ts`,`__PLAYTEST__ ? regionOf(id).order === 1 : true`),三处共用:选图按钮、`startExpedition` 首行守卫、`KingdomPanel` 隐藏越界委托(`crown-embers` 显示为「完整版开放」) | e2e `B6` ✓ |
| S2 | 热键 effect 改成读 `dockUnlockedRef.current`(每次渲染刷新),依赖仍为 `[]` | 读码 |
| Q3 | `royal-hub-link`(`App.tsx:1718`)的 `disabled` 加上 `!dockUnlocked('kingdom')`;锁住时右侧文案显示「第 4 天开放」(U26④) | 读码;e2e `fresh` 第 1–3 天大厅链接为 disabled(可选加断言) |
| S7 | 删掉 `priest-chanter` 光环那 8 行(它从未生效,删除不改变任何数值) | verify 绿 |
| S12 | 把测试名改成「全部基础专精」。Q2 已定为试玩版隐藏混合职阶,不补 `HYBRIDS` 断言 | verify 绿 |

### 第 5 组:说书人规则与试玩范围(约 4.5h,U26 新增;依赖第 2 组,在第 2 组之后做)

第 2 组把水位挪进了账本(B4),所以这组的「最近用过的模板」也放在账本里,同一套 normalize 兜底。全组只改事实记录和说书人选择逻辑,不碰战斗,**不应漂移任何门禁黄金值**;如果漂了,说明改到了不该改的地方。

| # | 改法 | 验收 |
|---|---|---|
| Q2 | 酒馆:`pickCandidate`(`tavern.ts:20`)、`rollVisitor`、`taleCandidates` 加可选参数 `opts.hybrids`(默认 `true`,sim 层不读全局常量);悬赏走 `forcedJob`,本来就不出混合职阶,不用改。App 四处调用(`App.tsx:880/988/1054/1823`)传 `{ hybrids: !__PLAYTEST__ }`。`rng() < 0.1` 仍照常抽,不允许时落回普通候选,保证随机流不变。训练场:`__PLAYTEST__` 时不渲染 `HYBRIDS` 按钮(`App.tsx:2066`)和混合职阶说明(`:2046-2047`);`changeVocation` 首行加 `if (__PLAYTEST__ && isHybrid(newSpecId)) return` | 新单测:`hybrids: false` 时 500 个种子的 `rollVisitor`/`taleCandidates` 不出 `hy-*`;默认参数时结果与改前逐个相同(防 smoke 漂移) |
| Q5 | 账本 `Fact.refs` 加可选 `encounter?: number`。`settlement.ts` 写 first-kill(`:137`)和 death(`:168`)时都带 `encounter: encounterId`(`:118` 已在 `advanceRun` 前算好)。说书人新增类型 `firstkill-fallen`,插在 `firstkill-death` 之后。遍历本趟所有 first-kill(荆棘要塞一趟可能有两个):同副本、`encounter` 相同的死亡 → `firstkill-death`;同副本、`encounter` 更小的死亡 → `firstkill-fallen`;首杀之后才阵亡的不配对。旧事实缺 `encounter` 时只允许配 `firstkill-fallen`(不冒充同场) | 新单测三条:同场阵亡 → death 组;第 2 场阵亡、第 6 场首杀 → fallen 组;首杀在第 1 场、阵亡在第 3 场 → 两组都不出 |
| Q4-B | `FactLedger` 加可选 `recentTemplates?: Partial<Record<StoryType, number[]>>`。`tellExpedition` 在该类型里排除最近 2 个下标后再抽,并在返回值里带 `templateIdx`;讲完由 App 调用的记账函数(与 B4 的 `toldThrough` 同处)追加下标、只留最后 2 个。normalize 时丢弃越界下标 | 新单测:同一类型连讲 3 次,下标两两不同;序列化 → normalize 后仍然生效 |
| Q4-C 默契 | bond-star 事实带 `refs.stars`(`settlement.ts:266` 已算出 `stars`)。说书人只认 `stars === 1 \|\| stars === 3` 的事实;缺 `refs.stars` 的旧事实不讲 | 新单测:2★ 事实返回 null;1★、3★ 能讲,文本里带 ★ |
| Q4-C 创伤 | `settleScars` 的返回项加 `nearDeath: boolean`(就是 `rollScarChance` 用的同一个判定:战斗结束时 hp < 15%,不新增追踪)。scar 事实带 `refs.nearDeath` 和 `refs.scarNth`(追加后的伤疤条数)。说书人只认 `nearDeath \|\| scarNth >= 2` | 新单测:第 1 条且非濒死 → null;濒死的第 1 条、非濒死的第 2 条都能讲 |
| S8 补 | `eventTitle` 从 `GUILD_EVENTS` 查 `title`,去掉 `/^第.幕·/` 前缀。**找不到 origin 时这一类返回 null**(取代第 2 组 S8 里「用 `due.day` 兜底」的写法,否则会出现「过去了 0 天」) | 并入第 2 组 S8 的单测 |
| 模板 | 把对照稿文末的 TS 代码块原样放进 `src/data/story-templates.ts`(新类型、新槽位 `eventTitle`/`stars`/`nth`,去掉 `eventId`/`itemUid`),文件头标「三审中」。制作人三审后的改字由施工方另起一个纯文本提交 | 新单测:每个类型的每条模板,用填满的槽位渲染,文本不含 `undefined`、`NaN`、`/[a-z]+-[a-z]+/`、`他`、`她`;每类恰好 6 条 |

> 优先级更新为:consequence-due > firstkill-death > firstkill-fallen > scar-survive > relic-wait > wish-done > bond-star。仍是每趟最多 1 条、挑最强碰撞,不加类型冷却(U26⑥)。
>
> 预期效果:默契和创伤从「几乎每趟都讲」变成真碰撞,有些回城会没有故事,这是 U26 接受的代价。e2e `fresh` 的 B3 断言只检查「有故事时结算行没被冲掉」,不受故事变少影响;但如果 12 趟里一条故事都没出,B3/B5/S8 会记为 SKIP,这时改用 `--expeditions=20` 再跑。

### 收尾

1. 五组都修完后,`node scripts/e2e-playtest-full.mjs --build --expeditions=12` 必须全部 ✓。B5 那条在这时由单测保证,不会再假阴性。
2. 交 Codex 复审:范围是上面五组的 diff,外加这份报告和 DECISIONS U26。
3. 制作人侧(不归施工方):按对照稿三审模板;然后亲自用 Mac Chrome 打开试玩包试玩一局,听一下声音、看一下 emoji。
4. 满足 ROADMAP §3.8 的 G2 条件后再发包。
