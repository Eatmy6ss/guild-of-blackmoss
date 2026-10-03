# 事件作用域(scope)草案 — 2026-10-03

> 依据:制作人 2026-10-03 裁定(事件分城内 / 副本专属 / 地形三类;延迟第二幕只能在同副本或回城触发)。
> 数据源:`src/data/guild-events.ts`(下称 GE)、`src/sim/guild-events.ts`、`src/data/dungeons.ts`、`src/data/dungeons-r2.ts`、`src/data/regions.ts`、`src/App.tsx` 事件调用点。
> 本文只做草案,未改任何代码。行号以 2026-10-03 工作区为准。
>
> **状态:制作人 2026-10-03 已同意,按本文落地(R1.4)。** 新增与改写的事件文本见 [events-draft-2026-10-03.md](events-draft-2026-10-03.md)。

## 0. 摘要

**事件总数:89**(GE L64–L2110,按 `^    id:` 逐条计数)。现 region 分布:`blackmoss-wild` 58 / `dragonridge` 15 / 无 region 16。

**建议 scope 计数**

| scope | 数量 | 其中后续幕/链 |
|---|---|---|
| town 城内 | 52 | 7(knight-pursuit、girl-debt、cult-wrath、siren-bones、lord-mercy、ransom-aftermath、cult-errand) |
| dungeon 副本专属 | 19 | 3(knight-chapel、cult-vengeance、egg-hatch)+ 准后续幕 cult-purge* |
| terrain 地形 | 18 | 1(ghost-harvest) |

**根因(已核对调用点)**
- 路线事件节点调用 `rollGuildEvent(..., { force: true, context: { region } })`(App.tsx L837);回城调用 `rollGuildEvent(guildRng)` **不带 context**(App.tsx L895)。过滤条件 `e.region && !opts?.context?.region` → 排除(sim/guild-events.ts L34)。
- 结果:**36 个文本写在公会/酒馆的 town 事件因为带了 region,只会在副本里出现,回城永远抽不到**(其中 32 个可首遇,另 4 个是 delayed 目标)。warehouse-thief 就是其中之一。
- 反过来,16 个无 region 事件两边都能抽到,所以「公会门口的孤儿」「练兵场的婚戒」也会在副本里弹。
- 当前副本节点池:版图一 70 条,其中 45 条是城内文本;版图二 28 条,其中 18 条是城内文本。回城池只有 16 条。
- 回城触发率实际约 0.35 窗口(App.tsx L894)× 内部 `EVENT_CHANCE` 0.3(GE L62,sim L30)≈ 10%。town 池扩到 52 条以后,这个概率也要重议。
- 延迟后果一律在**出征点击时**弹出(App.tsx L756,在 `setDay` L771 之前),也就是在城里、出发前。目前代码里没有「同副本内触发」这条路径。

**问题事件清单(详见 §3 §4)**
1. 自环:knight-pursuit → knight-pursuit(GE L1122);cult-vengeance → cult-vengeance(GE L1950)。原意分别应指向 knight-chapel 和一个第三幕。
2. 孤儿后续幕 4 个,已全部核实:girl-debt L1127、cult-wrath L1149、knight-chapel L1172、siren-bones L1216。它们没有被任何事件 `delayed` 指向,所以会进随机池当首遇事件弹出,文本里的「当初那个女孩」之类没有前因。另有 1 个准孤儿 cult-purge L1913(没有「第二幕」前缀,但文本写的是「据鳞册批注」的后果)。
3. 后续幕文本写的是野外,却在城里出征时弹出:ghost-harvest L1696(农田)、egg-hatch L1895(营地水桶)、cult-vengeance L1938(营地火把)。
4. 前后幕逻辑冲突:prisoner-ransom L1527 →ransom-aftermath L1544;ghost-banquet L1680 → ghost-harvest L1696;dragon-egg L1876/L1878 金额自相矛盾。
5. 设定矛盾:warehouse-thief L647(城内文本带 region,L648)、L662/L663 扣的是远征携带药水(App.tsx L1092–1094 分支),不是仓库。
6. 节点描述与事件脱钩:12 个副本的 event 节点 desc 都承诺了具体内容(如 `fr-eggs` 满窟龙蛋、`th-deserter` 荆棘逃兵),实际弹的是随机事件(§4.3)。

**内容缺口(专属 + 本版图地形合计 < 4)**
- 合计 < 4:scalehaven 1、pilgrim-path 1(+cult-purge*)、dragonmaw 2(专属 0,+cult-purge*)。
- 刚好 4 的:emberpass、forge-works。
- 专属事件为 0 的:frostgrave、thornhold、dragonmaw。
- 版图二的地形池只有 2 条(fire-rain、dragon-blood-spring)。最便宜的补法:把 7 条不含沼泽字眼的通用地形事件(cursed-statue、old-shrine、wine-cellar、mimic-chest、smuggler-hideout、ghost-banquet、confession-booth)去掉 region 限制,两版图共用。这样版图二各副本能升到 4–10 条。

## 1. 地形词表(9 个)

| 标签 | 含义 | 典型节点来源 |
|---|---|---|
| 水域 | 沼泽、河滩、暗河、涉水、排水渠 | bm-leeches、riverwash、darkriver、sewerin |
| 林野 | 树林、松林、猎场 | pinepath、bm-wolves、fg-wolves、pp-hunt |
| 道路 | 小径、栈道、山道、古道、垭口 | shortcut/safepath 各分支、ep 龙脊小径、pp 古道石阶 |
| 营地 | 休息点、营垒、帐篷、校场(扎营类事件) | 各 `kind:'rest'` 节点 |
| 地下 | 矿道、洞穴、地窖、深渊 | rm 全线、ab 观渊回廊、fr 龙蛋窟、dm 龙眠深渊 |
| 废墟 | 塌房、旧军械库、货仓、废模坑 | rm-crate、af-relic、fo-mold |
| 墓地 | 坟场、骸骨、亡魂行列 | af 白骨大道、fg 冰棺回廊、pp 长明灯阶 |
| 圣所 | 祭坛、圣龛、教堂、施舍台 | fg-altar、ab-cultists、ep-shrine、sh-avenue、pp-shrine、dm-altar |
| 熔岩 | 火山、熔炉、落灰、喷气口 | fr 熔岩栈道、fo 锻炉大厅、dm、ep 烬石 |

**各副本使用的地形**

| 副本 | 名称 | 地形 | 依据(routeNodes / 分支) |
|---|---|---|---|
| blackmoss | 黑苔沼泽 | 水域 · 林野 · 道路 · 营地 | 水蛭洼地/沼腹深处;狼群猎场;蛙人小径/枯木栈道;药贩营地/隐士棚屋 |
| rustmine | 锈坑矿道 | 地下 · 废墟 · 营地 | 主矿脉/深层矿脉/通风巷道;坍塌货仓;矿车休息站 |
| ashfield | 灰烬旧战场 | 墓地 · 废墟 · 水域 · 营地 | 白骨大道/葬仪行列;军械库残堆;河滩绕行;旧军营垒 |
| frostgrave | 白霜墓园 | 墓地 · 圣所 · 林野 · 营地 | 墓卫列队/冰棺回廊;冰封祭坛;松林绕行/霜狼猎场;猎户帐篷 |
| abyssaltar | 渊底祭坛 | 圣所 · 地下 · 水域 · 营地 | 教徒环阵/献祭阶梯;观渊回廊;暗河渡道;暗河石台 |
| thornhold | 荆棘要塞 | 营地 · 水域 · 地下 | 校场/正门;水道潜入(排水暗渠) |
| emberpass | 烬石隘口 | 道路 · 圣所 · 营地 · 熔岩 | 龙脊小径/盘山官道;路边圣龛;朝圣营地/背风岩窝;烬石 |
| scalehaven | 鳞音圣地带 | 圣所 · 道路 · 营地 | 圣像大道/施舍台/唱诗庭院;香客绕道;香客房 |
| fireridge | 火脊巢穴 | 熔岩 · 地下 · 道路 · 营地 | 熔岩栈道;龙蛋窟;风口斜坡;风口岩棚 |
| pilgrim-path | 朝圣者古道 | 道路 · 圣所 · 墓地 · 营地 | 古道石阶/雪线垭口;路碑圣龛;长明灯阶亡魂;朝圣者灶屋 |
| forge-works | 熔铸工坊 | 熔岩 · 地下 · 废墟 · 营地 | 锻炉大厅;矿车轨道;废模坑;工头歇脚间 |
| dragonmaw | 龙渊之心 | 圣所 · 熔岩 · 地下 | 献祭祭坛/教团内殿;龙渊;龙眠深渊 |

thornhold 和 dragonmaw 的地形最单薄。要塞题材可以考虑以后加一个「要塞」专用标签,本草案先不加。

## 2. 全事件分类(89 条)

> scope 写法:`town`、`dungeon:<id>`、`terrain:<标签>@<版图>`(版图沿用现 region 字段作为第二层过滤)。「→」表示后续幕。

| L | id | 标题 | 现 region | 建议 scope | 理由 | 问题 |
|---|---|---|---|---|---|---|
| 66 | cursed-coffin | 受诅咒的报酬 | R1 | town | 商人上门开价请护送,结果离屏结算 | 带 region,当前只在副本出现 |
| 88 | orphan-wolves | 孤儿与狼群 | R1 | town | 孩子冲进酒馆 | 同上 |
| 116 | deserter | 逃兵入伍 | — | town | 上门求入会 | 无 region,副本也会抽到;`th-deserter` 节点更适合要一个专属版本 |
| 143 | relic-escort | 祭司的圣物 | R1 | town | 修道院委托 | 带 region |
| 164 | night-knock | 夜半敲窗 | — | town | 酒馆后窗 | 副本也会抽到 |
| 191 | old-debt | 旧识讨债 | — | town | 拍账本上门 | 副本也会抽到 |
| 219 | old-armory | 废弃的军械库 | R1 | dungeon:ashfield | 前朝军械库对应 af-relic「王朝军械库」 | — |
| 247 | noble-duel | 贵族的决斗 | R1 | town | 贵族来雇人 | 带 region |
| 268 | swamp-scent | 沼泽异香 | R1 | dungeon:blackmoss | 沼泽营地夜香 | — |
| 296 | cursed-statue | 遗迹的雕像 | R1 | terrain:废墟 | 遗迹深处 | 可去 region,两版图共用 |
| 324 | fisherman-tribute | 河湾的水鬼 | R1 | town | 渔村凑钱委托 | 带 region |
| 352 | twin-bounties | 一颗头的两份悬赏 | R1 | town | 军镇悬赏 + 遗孀上门 | 带 region |
| 380 | veteran-beggar | 门槛边的断刀 | — | town | 公会门口 | 副本也会抽到 |
| 406 | moonshine-still | 山那边的私酿 | R1 | town | 酒馆掌柜 | 带 region |
| 433 | unclaimed-sword | 没人认领的剑 | — | town | 战利品清点、兵器架 | 副本也会抽到 |
| 460 | lost-caravan | 山道上的尾款 | R1 | town | 斥候回报,离屏处理 | 带 region |
| 489 | rival-defector | 灰隼的副团长 | — | town | 深夜到访 | 副本也会抽到 |
| 516 | midwife-night | 雪夜三十金 | R1 | town | 后半夜砸门 | 带 region |
| 544 | tower-shard | 会发光的碎片 | R1 | town | 山人兜售 | 带 region |
| 572 | harvest-hands | 收割的三天 | R1 | town | 村长来问,用库房农具 | 带 region |
| 598 | plague-village | 疫病村的门 | R1 | town | 修道院征人 | 带 region |
| 626 | peddler-potions | 行脚药贩 | — | town | 酒馆门口支摊 | `bm-camp` 节点 desc 承诺了药贩(dungeons.ts L153),可另做副本版本 |
| 647 | warehouse-thief | 仓库里的手 | R1 | town | 守夜抓翻墙贼 | **制作人报的那条**;L663 在副本内扣的是远征药水 |
| 669 | frost-envoy | 白霜的信使 | R1 | town | 信使上门 | 需要前置:frostgrave 已首杀(L672「葬送在那里的旧敌」) |
| 691 | abyss-preacher | 渊底的传教士 | R1 | town | 酒馆后巷 | 需要前置:abyssaltar 已开放 |
| 713 | veteran-legacy | 老兵的遗产 | — | town | 邻居报丧、堂前挂剑 | 副本也会抽到 |
| 734 | tax-convoy | 税官的车队 | R1 | town | 村长找上门 | 带 region |
| 756 | mining-strike | 矿工的请愿 | R1 | town | 联名请愿 | 需要前置:rustmine 已开放 |
| 777 | snow-caravan | 雪困的商队 | R1 | town | 急报委托 | 需要前置:frostgrave 已开放 |
| 799 | cursed-grimoire | 拾来的经书 | — | town | 孩子拿书到公会 | 副本也会抽到 |
| 820 | arena-invite | 斗技场的请柬 | R1 | town | 请柬送达 | 带 region |
| 842 | great-contract | 压垮桌子的大单 | — | town | 管家带长约 | 副本也会抽到 |
| 864 | toll-bridge | 断桥收费 | R1 | terrain:水域 | 断桥/浅滩 | — |
| 886 | wounded-scout | 沼泽里的斥候 | R1 | dungeon:blackmoss | 标题即沼泽 | L894「家人送来谢礼」的时间跨度偏大 |
| 908 | fever-hamlet | 烧还是不烧 | R1 | town | 村子求救 | 带 region |
| 930 | old-shrine | 无名老祭坛 | R1 | terrain:圣所/废墟 | 荒地石祭坛 | 可去 region |
| 952 | bonfire-ember | 路人的篝火 | R1 | terrain:营地@R1 | 「沼泽高地」 | — |
| 974 | dying-knight | 将死骑士的托付 | R1 | dungeon:blackmoss | 「不属于这片沼泽的细剑」 | 链头,见 §3 |
| 996 | wine-cellar | 战利品酒窖 | R1 | terrain:废墟/地下 | 庄园地窖 | 可去 region |
| 1018 | dragon-cult | 鳞音教的募捐 | R2 | dungeon:emberpass,scalehaven | 白袍信士拦路 | 应当是 cult-wrath 的链头(§4) |
| 1040 | lost-girl | 迷路的小女孩 | R1 | terrain:道路@R1 | 泥路 | 应当是 girl-debt 的链头(§4) |
| 1062 | blackmarket-healer | 黑市医师 | R1 | town | 地下室诊所 | 带 region |
| 1083 | mirror-lake | 不照人的湖 | R1 | terrain:水域 | 湖边 | — |
| 1106 | knight-pursuit | 第二幕·锈甲的来客 | R1 | town(→) | 堵在公会门口,出发时触发正合适 | **L1122 自环** |
| 1127 | girl-debt | 第二幕·小女孩的债主 | R1 | town(→) | 闯进公会 | **孤儿** |
| 1149 | cult-wrath | 第二幕·鳞册的批注 | R2 | town(→) | 信送到公会 | **孤儿** |
| 1172 | knight-chapel | 第三幕·旧教堂的答案 | R1 | dungeon:ashfield(→) | 锈甲骑士亡魂对应墓骑 | **孤儿**;必须在副本里触发 |
| 1194 | siren-marsh | 沼泽歌姬 | R1 | dungeon:blackmoss | 沼泽水面歌声 | 应当是 siren-bones 的链头 |
| 1216 | siren-bones | 第二幕·歌姬的骨头 | R1 | town(→) | 贩子找上门 | **孤儿** |
| 1237 | gilded-skull | 镀金头骨 | R1 | town | 游商摊位 | 带 region |
| 1259 | rival-guild | 挑战书 | — | town | 钉在公会大门 | 副本也会抽到 |
| 1280 | moon-well | 月井 | R1 | terrain:林野 | 林间圆井 | — |
| 1302 | fleeing-serf | 逃亡的佃农 | R1 | terrain:道路@R1 | 田埂、领主 | 链头 |
| 1324 | lord-mercy | 第二幕·领主的谢礼 | R1 | town(→) | 管家到访 | — |
| 1346 | rare-hunt | 稀有的传闻 | R1 | town | 酒馆老猎人 | `rareHuntNext` 不看副本,去了矿道也会生效 |
| 1368 | bard-chronicle | 吟游诗人 | — | town | 酒馆 | 副本也会抽到 |
| 1389 | memorial-visitor | 纪念碑前的陌生人 | — | town | 公会石碑 | 副本也会抽到 |
| 1410 | living-blade | 活体之刃 | R1 | town | 黑市铁砧 | 带 region |
| 1431 | hunger-altar | 饥渴之坛 | R1 | dungeon:abyssaltar | 血槽石坛,对应血祭教团 | — |
| 1453 | mimic-chest | 可疑的宝箱 | R1 | terrain:废墟 | 废墟正中 | 可去 region |
| 1475 | soul-trade | 灵魂商人 | R1 | dungeon:abyssaltar | 对应 ab-whisper「许诺力量,代价未提」 | 文本没写地点,需要补一句 |
| 1497 | wolf-cub | 狼崽 | R1 | terrain:林野@R1 | 沼泽狼 | — |
| 1519 | prisoner-ransom | 俘虏与赎金 | R1 | town | 选项跨 7–10 天,只能当作回城结算 | 「端了匪窝」没有对应副本;链头,逻辑见 §3 |
| 1541 | ransom-aftermath | 第二幕·三手刘的信 | R1 | town(→) | 信送到公会 | 与前幕矛盾 |
| 1563 | wedding-ring | 泥里的婚戒 | — | town | 练兵场 | 副本也会抽到 |
| 1584 | flooded-mine | 淹水的矿洞 | R1 | dungeon:rustmine | 锈坑旧巷道 | 文本是矿主开价,也可以改成 town |
| 1606 | smuggler-hideout | 走私洞 | R1 | terrain:地下 | 山洞 | 可去 region |
| 1628 | fallen-star | 坠星与铁匠 | R1 | town | 铁匠村委托 | 带 region |
| 1650 | orphan-apprentice | 门口的孤儿 | — | town | 公会门口 | 副本也会抽到 |
| 1671 | ghost-banquet | 深夜的宴席 | R1 | terrain:营地 | 扎营半夜 | 链头 |
| 1693 | ghost-harvest | 第二幕·收成 | R1 | terrain:道路@R1(→) | 「路过一片陌生的农田」 | 目前在城里出征时弹 |
| 1715 | caravan-storm | 狼群下的商队 | R1 | terrain:道路 | 暴雨坡下 | — |
| 1737 | mad-alchemist | 疯药剂师 | — | town | 窗口探头卖药 | 副本也会抽到 |
| 1758 | confession-booth | 路旁忏悔室 | R1 | terrain:圣所 | 荒野小教堂 | 可去 region |
| 1780 | old-map | 酒鬼的旧地图 | R1 | town | 酒鬼拽袖子 | 带 region |
| 1802 | parasite-tongue | 蛆舌预言者 | R1 | town | 「沼泽集市」,是城镇集市 | 带 region |
| 1825 | forge-sluice | 熔铸工坊的泄洪闸 | R2 | dungeon:forge-works | 标题即工坊 | — |
| 1847 | ash-waymarkers | 灰中的路标 | R2 | dungeon:fireridge | 「火脊巢穴外的岔路」 | — |
| 1870 | dragon-egg | 龙蛋的困境 | R2 | dungeon:fireridge | 对应 fr-eggs 龙蛋窟 | L1876 选项写「三个六百」,L1878 只给 200;「温泉眼」与龙蛋窟不符 |
| 1892 | egg-hatch | 第二幕·壳里的东西 | R2 | dungeon:fireridge(→) | 营地水桶 | 目前在城里弹;「第九天」≠ dueDays 3 |
| 1913 | cult-purge | 教团的清算 | R2 | dungeon:pilgrim-path,dragonmaw* | 执事团堵营地,追究「圣地带不敬」 | *准孤儿:应只在 scalehaven 之后、且有不敬前因时出现 |
| 1935 | cult-vengeance | 第二幕·圣火的回信 | R2 | dungeon:同 cult-purge(→) | 营地火把 | **L1950 自环**;目前在城里弹 |
| 1957 | dragon-defector | 龙裔的叛逃者 | R2 | dungeon:forge-works | 教团锻奴出逃 | 「溪水边」需改成排水沟一类 |
| 1979 | pilgrim-alms | 朝圣者的众筹 | R2 | dungeon:pilgrim-path,emberpass | 山道朝圣队 | — |
| 2001 | whelp-poachers | 盗猎幼龙者 | R2 | dungeon:fireridge | 岩架幼龙,对应蜥群岩架/幼龙巢区 | — |
| 2023 | fire-rain | 火雨之夜 | R2 | terrain:熔岩@R2 | 火山碎屑 | — |
| 2045 | cult-recruiter | 教团的征募官 | R2 | town | 文书摊在桌上 | 带 region;链头 |
| 2067 | cult-errand | 第二幕·那口箱子 | R2 | town(→) | 传令官追来,回城结算可以接受 | L2076「货栈」说明是城内,吻合 |
| 2089 | dragon-blood-spring | 龙血泉 | R2 | terrain:熔岩@R2 | 山岩泉眼 | — |

R1 = `blackmoss-wild`,R2 = `dragonridge`。「带 region」指:文本是城内,但当前只会在副本节点抽到,回城抽不到。

## 3. 延迟链全表

> 代码现状:所有 `delayed` 都在**出征点击时**于城内弹出(App.tsx L756),`dueDays` 按出征次数计(`day` 只在 L771 递增)。

| # | 源 (行) | 选项/结果 | → 目标 | dueDays | 应在哪触发 | 衔接判定 |
|---|---|---|---|---|---|---|
| 1 | dying-knight L982 | 接下 · 结果1 | knight-pursuit | 2 | 城内(出征时) | 通顺。文本「圣徽在远征队行囊里」正好契合出征时机 |
| 2 | dying-knight L983 | 接下 · 结果2 | knight-pursuit | 2 | 城内 | 同上 |
| 3 | knight-pursuit L1122 | 不交 · 动手 | **knight-pursuit(自环)** | 4 | 应改为 knight-chapel,dungeon:ashfield 同副本或下次进入 | **荒谬**:「下回在旧教堂见」之后又重播一遍「锈甲来客」;每次 50%,可以无限循环。knight-chapel 永远到不了 |
| 4 | fleeing-serf L1311 | 藏 · 被记脸 | lord-mercy | 3 | 城内 | 通顺。黑名单接谢礼是反讽,可以接受 |
| 5 | prisoner-ransom L1527 | 送信 · 赎金到 | ransom-aftermath | 3 | 城内 | **矛盾**:前幕写「第八天他就因销赃又被抓了」,后幕写「改行了,给商队当镖师,合法的」并寄钱致谢 |
| 6 | ghost-banquet L1680 | 入席 · 亡者托付 | ghost-harvest | 4 | terrain:道路@R1,下次远征的路线节点 | **错位**:前幕是亡者托你「看看今年的收成」;后幕变成农夫自己「去年答应过一个过路人」。托付人和欠债人换了位,「去年」也和 4 天对不上。现在在城里弹,却写「路过农田」 |
| 7 | dragon-egg L1878 | 全部抱走 · 卖了 | egg-hatch | 3 | dungeon:fireridge 同副本营地,或下次远征营地 | 勉强通顺,但前幕说卖了,后幕又冒出一枚蛋,需要补一句「漏了一枚」。「第九天」≠3;现在在城里弹,却写「营地水桶」 |
| 8 | cult-purge L1928 | 抗到底 · 对峙 | cult-vengeance | 2 | 同副本(营地) | 文本通顺,触发地点错(城内弹出「营地四周火把」) |
| 9 | cult-purge L1929 | 抗到底 · 见血 | cult-vengeance | 2 | 同副本 | 同上 |
| 10 | cult-vengeance L1950 | 回敬 · 烧圣像 | **cult-vengeance(自环)** | 4 | 应改为新的第三幕(或 dragonmaw 内的清算) | **荒谬**:烧了对方圣像之后,收到的还是同一封「圣火已至」的信;50% 无限循环 |
| 11 | cult-recruiter L2053 | 加入 · 运箱子 | cult-errand | 3 | 城内 | 通顺。前幕埋了「箱子在夜里发出过声音」,后幕兑现 |

**同副本触发**目前没有实现。建议 `delayed` 增加 `at: 'town' | 'same-dungeon' | 'terrain'` 字段:same-dungeon 挂到本次 run 的下一个 event/rest 节点;本次跑完还没触发,则降级为下次进入同副本时触发,不降级到城内。按上表,#3 #6 #7 #8 #9 #10 需要 same-dungeon 或 terrain,其余 5 条保持 town。

## 4. 孤儿事件与设定矛盾

### 4.1 孤儿后续幕(标题含「第二幕/第三幕」但无人指向)

已用 `delayed: { eventId` 全文检索核实:被指向的只有 7 个 id(knight-pursuit、lord-mercy、ransom-aftermath、ghost-harvest、egg-hatch、cult-vengeance、cult-errand)。带幕次标题的共 11 个,孤儿 4 个,和已知名单一致,没有新增。

| 事件 | 行 | 天然前因(建议挂 delayed 的位置) | 现后果 |
|---|---|---|---|
| girl-debt | L1127 | lost-girl L1056「那手法不像孩子」,或 L1048 送她回村 | 作为首遇事件弹出,「当初那个女孩」没有前因 |
| cult-wrath | L1149 | dragon-cult 拒绝分支 L1033/L1034 | 同上,「曾拒圣听」没有前因 |
| knight-chapel | L1172 | knight-pursuit L1122(修自环即可) | 首遇就是「第三幕·旧教堂找到了」 |
| siren-bones | L1216 | siren-marsh L1209「循声找她·赢」 | 「你们见过她」没有前因 |

另有 1 个准孤儿:**cult-purge L1913**。没有幕次标题,但文本是「据鳞册批注,贵会曾于圣地带不敬」,在逻辑上是 cult-wrath 的后续。建议做成 cult-wrath 的 delayed 目标,或者加前置条件(scalehaven 已进入且 dragon-cult 选过拒绝)。

修法:孤儿接上 delayed 以后,F08 的 `SECOND_ACT_IDS`(sim L24)会自动把它们移出随机池,不需要单独登记。

### 4.2 结果与设定矛盾

- warehouse-thief L647:城内文本却带 R1,只会在副本里出现。在副本内选「放她走」时,L662/L663 的 `potionHeal` 扣的是 `run.potions`(App.tsx L1092–1094 分支),不是公会仓库,与「仓库又少了两瓶」不符。改成 town 以后自然消解。
- 16 个无 region 的城内事件(§2 标「副本也会抽到」)都能在副本节点里弹,例如 wedding-ring L1565「练兵场泥地里」、memorial-visitor L1391「公会石碑前」。
- 前置缺失:frost-envoy L672、snow-caravan L780、mining-strike L759、abyss-preacher L694 都假定玩家已经去过对应副本,但当前开局即可抽到。建议加 `requires: { visited?: dungeonId; killed?: bossId }`。
- dragon-egg L1876 写「三个六百」,L1878 只给 200 金。
- rare-hunt L1349 说的是「沼泽深处」的稀有怪,`rareHuntNext` 却作用于下一场远征的首战,不论去哪个副本。
- dragon-defector L1960「溪水边」与 forge-works 无水域不符(只是措辞)。

### 4.3 event 节点 desc 与实际事件脱钩(内容缺口)

每个副本恰好有 1 个 `kind:'event'` 节点。节点 desc 承诺了具体内容,实际弹的却是随机事件:

| 节点 | desc | 最接近的现有事件 | 建议 |
|---|---|---|---|
| bm-camp (dungeons.ts L153) | 行脚药贩在营地等候 | peddler-potions(城内文本) | 拆一个副本版药贩 |
| rm-echo (L288) | 塌方后有敲击声,像求救 | 无(forge-sluice 是同类骨架,但在版图二) | 新写矿道救援 |
| af-trumpet (L417) | 未响的号角 | 无 | 新写 |
| fg-altar (L531) | 冰封祭坛 | 无(frostgrave 专属 0 条) | 新写 |
| ab-whisper (L665) | 低语许诺力量 | soul-trade / hunger-altar | 绑定 |
| th-deserter (L835) | 荆棘逃兵想谈条件 | deserter(城内入会) | 新写要塞版 |
| ep-shrine (r2 L69) | 鳞音教路边圣龛 | dragon-cult | 绑定 |
| sh-alms (r2 L133) | 教团施舍台 | dragon-cult | 绑定或新写 |
| fr-eggs (r2 L196) | 满窟的龙蛋 | dragon-egg(写的是温泉眼三枚) | 改 dragon-egg 文本后绑定 |
| pp-shrine (r2 L259) | 千年路碑 | pilgrim-alms | 新写 |
| fo-mold (r2 L321) | 废模坑卡着胚料 | 无 | 新写 |
| dm-altar (r2 L393) | 献祭祭坛 | 无(dragonmaw 专属 0 条) | 新写 |

建议节点可以带可选的 `eventId`:有就固定触发,没有就从「本副本专属 + 本节点地形」池里抽。

## 5. 各副本可用事件数(按 §2 建议,只计首遇事件)

| 副本 | 专属 | 本版图地形 | 合计 | 7 条通用地形去 region 后 |
|---|---|---|---|---|
| blackmoss | 4 | 9 | 13 | 13 |
| rustmine | 1 | 7 | 8 | 8 |
| ashfield | 1 | 8 | 9 | 9 |
| frostgrave | **0** | 6 | 6 | 6 |
| abyssaltar | 2 | 8 | 10 | 10 |
| thornhold | **0** | 6 | 6 | 6 |
| emberpass | 2 | 2 | 4 | 7 |
| scalehaven | 1 | 0 | **1** | 4 |
| fireridge | 3 | 2 | 5 | 8 |
| pilgrim-path | 1 (+cult-purge*) | 0 | **1** | 4 |
| forge-works | 2 | 2 | 4 | 10 |
| dragonmaw | **0** (+cult-purge*) | 2 | **2** | 6 |

版图一的地形池重复度很高:bonfire-ember、ghost-banquet 能覆盖 5 个副本。所以「合计」看起来够,主题辨识度其实主要靠专属事件。frostgrave、thornhold、dragonmaw 的专属事件为 0,建议优先补写,并与 §4.3 的节点 desc 一起解决。

## 6. 落地建议(供排期,不在本草案范围内实施)

1. `GuildEventDef` 增加 `scope: 'town' | { dungeons: string[] } | { terrain: Terrain[] }`,保留 `region` 作为地形事件的第二层过滤;`RouteNodeDef` 增加 `terrain: Terrain[]` 和可选的 `eventId`。
2. `rollGuildEvent` 改为接收 `{ where: 'town' } | { where: 'node', dungeonId, terrain }`,两处调用点(App.tsx L837 / L895)都显式传入,去掉「缺 context 就静默排除」的隐式分支。
3. `delayed` 增加 `at` 字段(§3)。修两个自环(L1122、L1950),接上 4 个孤儿 + cult-purge。
4. 加一条数据校验测试:town 事件不得带 `dungeons/terrain`;每条 delayed 目标必须存在,且不得指向自身;标题含「幕」的事件必须被至少一条 delayed 指向;每个副本「专属 + 地形」≥ 4。
