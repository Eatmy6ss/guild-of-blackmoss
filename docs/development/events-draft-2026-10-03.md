# 副本专属事件与事件链修复(Claude 起草,制作人 2026-10-03 已审定)

依据:[DECISIONS.md](DECISIONS.md) U27④、[event-scope-draft-2026-10-03.md](event-scope-draft-2026-10-03.md)(制作人已同意)、[redesign-2026-10-03.md](redesign-2026-10-03.md) R1.4。
口吻:黑魂式神秘感 + 冷幽默。效果键只用现有的那几种(`guild-events.ts:6-13`),数值是结构占位,受 C4 约束。

**状态**:制作人 2026-10-03 已同意,定稿。施工方把 §1 的代码块原样放进 `guild-events.ts`,按 §2 修改现有事件,不自行改措辞。

**总量**:新增 16 个,其中 15 个可首遇、1 个第三幕;改写 5 处文本;修 2 条自环;接上 5 个没有前因的后续幕;给全部 15 条延迟链标注 `at`。

**补完后各副本可首遇的事件数**(专属 + 本版图地形;版图二按草案 §5 把 7 条通用地形事件放开版图限制):

| 副本 | 原专属 | 新增 | 合计 |
|---|---|---|---|
| frostgrave 白霜墓园 | 0 | 3 | 9 |
| thornhold 荆棘要塞 | 0 | 2 | 8 |
| dragonmaw 龙渊之心 | 0 | 2 | 8 |
| scalehaven 鳞音圣地带 | 1 | 2 | 6 |
| pilgrim-path 朝圣者古道 | 1 | 2 | 6 |
| rustmine / ashfield / forge-works / blackmoss | — | 各 1 | 都 ≥ 8 |

> 版图二的 7 条通用地形事件**必须**放开版图限制,不只是兜底:不放开的话,scalehaven 只有 3 条,pilgrim-path 只有 3 条。

---

## 1. 新事件

`scope` 和 `delayed.at` 是 R1.4 新增的字段,写法按改版方案。

```ts
export const NEW_EVENTS_2026_10_03: GuildEventDef[] = [
  // ===== 白霜墓园 =====
  {
    id: 'fg-ice-hand',
    scope: { kind: 'dungeon', ids: ['frostgrave'] },
    title: '不化的冰',
    text: '祭坛上结着一层冰,冰下封着一只手,掌心向上,像在讨要什么。手指上套着一枚戒指。旁边钉着守墓人的木牌,只有两个字:「勿予。」字迹比冰还旧。',
    choices: [
      {
        text: '放一枚金币进那只手。',
        outcomes: [
          { weight: 6, text: '冰面裂开一道细缝,金币沉了下去,手指慢慢合拢。当夜全队睡得出奇地安稳——在墓园里,这算是回礼。', effects: { gold: -10, blessing: 4, moraleAll: 3 } },
          { weight: 4, text: '金币沉下去了,手没有合拢。它还在等。等的显然不是金币。', effects: { gold: -10, moraleRandom: -2 } },
        ],
      },
      {
        text: '凿冰,取戒指。',
        outcomes: [
          { weight: 5, text: '戒指到手,冰下那只手空了。回程路上,每个人的影子都比平时慢半步。', effects: { item: 'trk-t1-band', runBuff: { id: 'frost-shadow', name: '慢半步的影子', desc: '有东西跟着你们——攻击降低,直到本次远征结束', mods: { atk: 0.92 } } } },
          { weight: 5, text: '凿到一半,冰里的手先动了——它把戒指递了出来。据说被拒绝太多次的东西,会学着主动一点。', effects: { item: 'trk-t1-band', moraleAll: -3 } },
        ],
      },
    ],
  },
  {
    id: 'fg-gravedigger',
    scope: { kind: 'dungeon', ids: ['frostgrave'] },
    title: '掘墓人的铲子',
    text: '一个掘墓人在雪里挖坑,挖得很认真。坑的长短刚好装下一个人。他抬头,用目光量了量你们的队长,点点头,继续挖。',
    choices: [
      {
        text: '问他,这坑给谁挖的。',
        outcomes: [
          { weight: 6, text: '「给下一个。」他没停手。「墓园从不缺下一个。」临走时他塞过来一瓶药:「省着点用。我不想加班。」', effects: { potionHeal: 1, moraleAll: -2 } },
          { weight: 4, text: '「给你们中的某一位。不急,我挖得慢。」全队绕开那个坑走,步子比来时快。', effects: { moraleAll: -4, expAll: 15 } },
        ],
      },
      {
        text: '一言不发,把坑填上。',
        outcomes: [
          { weight: 7, text: '填完了。掘墓人看了看,在旁边重新挖了一个。敬业这种东西,在墓园里也是有的。', effects: { moraleAll: 2 } },
          { weight: 3, text: '坑填平的那一刻,地底传来一声叹息——不是掘墓人发出的。', effects: { blessing: 3, moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'fg-frozen-scout',
    scope: { kind: 'dungeon', ids: ['frostgrave'] },
    title: '冰中的斥候',
    text: '冰棺回廊尽头冻着一个人。看装束,是别家公会的斥候,怀里紧抱着一张地图。冰面上用指甲刻着两个字:「别信」。后面的字没刻完。',
    choices: [
      {
        text: '破冰救人。',
        outcomes: [
          { weight: 5, text: '还有一口气。斥候醒来后盯着你们看了半晌,问:「这次是第几年?」没等回答,又昏了过去。地图留给了你们,上面标着一条小路。', effects: { expAll: 20, runBuff: { id: 'scout-map', name: '斥候的地图', desc: '有人替你们探过路——防御提升,直到本次远征结束', mods: { def: 1.1 } } } },
          { weight: 5, text: '冰破了,人没救回来。冰面上那句话的后半截,刻在地图背面:「别信地图」。', effects: { moraleAll: -3 } },
        ],
      },
      {
        text: '取走地图,让冰继续保管它的主人。',
        outcomes: [
          { weight: 6, text: '地图很准,准得让人不安。墓园里没有别的佣兵,只有被冻住的那一个。', effects: { gold: 30, moraleRandom: -2 } },
          { weight: 4, text: '拿走地图时,身后的冰面轻轻响了一声,像一句没说出口的「别」。', effects: { moraleAll: -2 } },
        ],
      },
    ],
  },
  // ===== 荆棘要塞 =====
  {
    id: 'th-deserter-deal',
    scope: { kind: 'dungeon', ids: ['thornhold'] },
    title: '逃兵的条件',
    text: '一个荆棘团的兵蹲在暗渠口,铠甲上的团徽被刮掉了一半。「团库的钥匙挂在哪,哪段墙的弩手是新兵,我都知道。」他伸出三根手指。「三十金。你们走的时候,带上我。」',
    choices: [
      {
        text: '成交。',
        outcomes: [
          { weight: 6, text: '他说的每一句都是真的。后来荆棘团的人四处打听,到底是谁出卖了他们——没人想到去问一个只要三十金的人。', effects: { gold: -30, recruit: true, runBuff: { id: 'inside-man', name: '内应', desc: '知道弩手在哪——防御提升,直到本次远征结束', mods: { def: 1.12 } } } },
          { weight: 4, text: '情报是真的,人跑了。佣兵之间的信任,大概就值三十金。', effects: { gold: -30, runBuff: { id: 'inside-man', name: '内应', desc: '知道弩手在哪——防御提升,直到本次远征结束', mods: { def: 1.12 } } } },
        ],
      },
      {
        text: '打发走。叛徒在哪儿都是叛徒。',
        outcomes: [
          { weight: 6, text: '他耸耸肩,钻回暗渠。半个时辰后,要塞里响起了警钟——他把你们卖了个更好的价钱。', effects: { runBuff: { id: 'fort-alarm', name: '警钟', desc: '全团都在等你们——防御降低,直到本次远征结束', mods: { def: 0.9 } } } },
          { weight: 4, text: '他走了,没回头。据说荆棘团的逃兵最后都会回来,只是不以活人的身份。', effects: { moraleAll: 1 } },
        ],
      },
    ],
  },
  {
    id: 'th-old-banner',
    scope: { kind: 'dungeon', ids: ['thornhold'] },
    title: '旧团旗',
    text: '校场的旗杆上挂着荆棘团的第一面团旗,破得只剩一半。旗下钉着木牌:「此旗在,团在。」旗杆脚下堆着历任想摘旗的人留下的东西——头盔、靴子、半截矛。',
    choices: [
      {
        text: '摘旗。',
        outcomes: [
          { weight: 5, text: '旗摘下来了,很轻。守军看见空旗杆,阵脚明显乱了一截——原来真有人信木牌上的话。', effects: { moraleAll: 5, runBuff: { id: 'banner-down', name: '空旗杆', desc: '守军乱了阵脚——攻击提升,直到本次远征结束', mods: { atk: 1.1 } } } },
          { weight: 5, text: '绳子断了,旗杆砸下来,砸中了一个人。旗杆脚下的那堆东西,差一点就多了一件。', effects: { injure: true, moraleAll: 2 } },
        ],
      },
      {
        text: '不碰。',
        outcomes: [
          { weight: 7, text: '有些东西不碰是出于尊重,有些东西不碰是为了活得长。这一次,大概两者都是。', effects: { moraleAll: 1 } },
          { weight: 3, text: '路过时,有人顺手捡走了那堆里的一顶头盔。头盔内侧刻着一串名字,最下面还留着空位。', effects: { item: 'arm-t1-mail', moraleRandom: -2 } },
        ],
      },
    ],
  },
  // ===== 龙渊之心 =====
  {
    id: 'dm-offering',
    scope: { kind: 'dungeon', ids: ['dragonmaw'] },
    title: '未熄的祭火',
    text: '献祭祭坛的火还在烧。祭品刚放上去不久:一只盛满金币的铜盆,盆底压着一张鳞纸——「献给沉睡者。取者,当醒。」',
    choices: [
      {
        text: '拿走金币。',
        outcomes: [
          { weight: 5, text: '金币很烫,但花得出去。至于沉睡者——至少今天没醒。', effects: { gold: 120, runBuff: { id: 'stolen-offering', name: '窃祭之热', desc: '口袋一直在发烫——受疗降低,直到本次远征结束', mods: { heal: 0.85 } } } },
          { weight: 5, text: '端起铜盆的那一刻,深渊里传来一声很长的呼吸。没人再说话,也没人放下铜盆。', effects: { gold: 120, moraleAll: -5 } },
        ],
      },
      {
        text: '往盆里再添一枚。',
        outcomes: [
          { weight: 6, text: '火苗跳了一下,像是点头。暗处的信徒看着你们,一时拿不准该拜还是该杀。', effects: { gold: -10, blessing: 4 } },
          { weight: 4, text: '添了一枚,祭火熄了。据说这是龙渊三百年来,第一次有外人倒贴。', effects: { gold: -10, moraleAll: 4 } },
        ],
      },
    ],
  },
  {
    id: 'dm-shed-scale',
    scope: { kind: 'dungeon', ids: ['dragonmaw'] },
    title: '蜕下的鳞',
    text: '渊壁上嵌着一片鳞,比门板还大,边缘还是软的——刚蜕下不久。教团的人在鳞前跪了一圈,睡着了,或者死了,分不太清。',
    choices: [
      {
        text: '撬下鳞片。',
        outcomes: [
          { weight: 6, text: '鳞片做成了甲面,挡火。跪着的那圈人一个都没动,这让收获显得格外安静。', effects: { item: 'arm-dragon-scalemail', moraleAll: -2 } },
          { weight: 4, text: '撬到一半,跪着的人齐齐抬头——原来是睡着了。这一架打得很尴尬,双方都没来得及穿鞋。', effects: { injure: true, gold: 40 } },
        ],
      },
      {
        text: '绕过去。',
        outcomes: [
          { weight: 7, text: '经过时,有一个睁开眼看了看你们,又闭上了。在龙渊,互不打扰也是一种礼节。', effects: { moraleAll: 2 } },
        ],
      },
    ],
  },
  // ===== 鳞音圣地带 =====
  {
    id: 'sh-alms-table',
    scope: { kind: 'dungeon', ids: ['scalehaven'] },
    title: '施舍台',
    text: '圣像大道旁摆着施舍台:热粥、干净的绷带、一小瓶药,随取。台边的白袍信士只问一句:「诸位,信龙吗?」',
    choices: [
      {
        text: '说信。取粥。',
        outcomes: [
          { weight: 6, text: '粥是热的,绷带是新的。信士在鳞册上记下你们的名字,笑得很诚恳。名字被记在那种地方,通常不是什么好事。', effects: { potionHeal: 1, moraleAll: 3 } },
          { weight: 4, text: '粥喝到一半,有人从碗底捞出一片鳞。信士说这是福分。没人敢问,是谁的福分。', effects: { potionHeal: 1, moraleRandom: -3 } },
        ],
      },
      {
        text: '说不信。也不取。',
        outcomes: [
          { weight: 6, text: '信士点点头,把粥倒回锅里,对下一个人露出同样的笑。在圣地带,不信的人也能活,只是活得冷一点。', effects: { moraleAll: -1 } },
          { weight: 4, text: '信士合掌:「不信也无妨。龙会信你们。」这句话,比拒绝更让人不安。', effects: { moraleAll: -3, blessing: 2 } },
        ],
      },
    ],
  },
  {
    id: 'sh-hymn',
    scope: { kind: 'dungeon', ids: ['scalehaven'] },
    title: '空着的声部',
    text: '唱诗庭院里,颂歌唱到一半,有一个声部空着。祭卫们转过头看着你们,很有礼貌地等。',
    choices: [
      {
        text: '跟着唱。',
        outcomes: [
          { weight: 6, text: '唱得不好,但唱完了。祭卫们点头放行,其中一个低声说:「上一个唱错词的,现在是庭院里的那根柱子。」', effects: { moraleAll: 3, blessing: 3 } },
          { weight: 4, text: '唱到第三段,没人记得词了。庭院安静了很久,然后祭卫们拔出了武器——看来这首歌没有即兴的部分。', effects: { moraleAll: -2, expAll: 20 } },
        ],
      },
      {
        text: '不唱。',
        outcomes: [
          { weight: 6, text: '祭卫们让开了路,目送你们走过。被一整个唱诗班目送,感觉像在出席自己的葬礼。', effects: { moraleAll: -2 } },
          { weight: 4, text: '有人小声哼了一句,跑调了。祭卫们集体皱眉,但没有动手。圣地带的宽容,到此为止。', effects: { moraleRandom: -1 } },
        ],
      },
    ],
  },
  // ===== 朝圣者古道 =====
  {
    id: 'pp-roadstone',
    scope: { kind: 'dungeon', ids: ['pilgrim-path'] },
    title: '刻满名字的路碑',
    text: '千年路碑上刻满了还愿者的名字,密到连裂缝里都有。碑脚放着一把刻刀,刀柄磨得发亮。碑顶最后一行,还空着一半。',
    choices: [
      {
        text: '刻上公会的名字。',
        outcomes: [
          { weight: 6, text: '刻完退后几步,碑上的名字好像都转过来,看了一眼新来的。从此在这条路上,黑苔不再是外人。', effects: { blessing: 5, moraleAll: 3 } },
          { weight: 4, text: '刻到一半,刻刀断了。剩下的半个名字,看上去像别的什么字。据说路碑会自己决定收谁。', effects: { blessing: 2, moraleRandom: -2 } },
        ],
      },
      {
        text: '读那些名字。',
        outcomes: [
          { weight: 6, text: '读到第三百个时,有人读到了自己父亲的名字。那人什么也没说,只是那一夜的岗站得最久。', effects: { expAll: 20, moraleAll: 2 } },
          { weight: 4, text: '名字太多,读不完。有些名字刻了两遍——同一个人,来过两次。第二次,大概是来还愿的。', effects: { expAll: 15 } },
        ],
      },
    ],
  },
  {
    id: 'pp-borrowed-lamp',
    scope: { kind: 'dungeon', ids: ['pilgrim-path'] },
    title: '借灯',
    text: '长明灯阶上,一个提灯的亡魂停下来,把灯递给你们。灯火很暗,刚好照亮下一级台阶。它不说话,只是等着。',
    choices: [
      {
        text: '接过灯。',
        outcomes: [
          { weight: 6, text: '有灯的路好走得多。走到灶屋时灯自己灭了,亡魂早已不知去向——借出去的东西,它没打算要回。', effects: { runBuff: { id: 'pilgrim-lamp', name: '借来的灯', desc: '下一级台阶总看得见——防御提升,直到本次远征结束', mods: { def: 1.1 } } } },
          { weight: 4, text: '接灯的那位从此走路总要看脚下,走了很远也改不掉。亡魂的灯,大概是要一个个传下去的。', effects: { moraleRandom: -2, expAll: 15 } },
        ],
      },
      {
        text: '谢绝。',
        outcomes: [
          { weight: 7, text: '亡魂收回灯,继续往上走,走得很慢。几百年了,它大概也不急。', effects: { moraleAll: 1 } },
          { weight: 3, text: '谢绝之后,台阶上所有的灯同时暗了一下。在这条路上,礼貌有时也是一种冒犯。', effects: { moraleAll: -3 } },
        ],
      },
    ],
  },
  // ===== 版图一其余副本:兑现原节点描述 =====
  {
    id: 'rm-knocking',
    scope: { kind: 'dungeon', ids: ['rustmine'] },
    title: '三长两短',
    text: '塌方的巷道里传来敲击声,三长两短,很有规律。矿工的老规矩:三长两短,是「还活着」。',
    choices: [
      {
        text: '挖。',
        outcomes: [
          { weight: 5, text: '挖开石堆,里面是个老矿工,饿得只剩一把骨头,手里还攥着锤子。他说自己敲了十一天。没人问他是怎么数的。', effects: { expAll: 20, moraleAll: 6 } },
          { weight: 5, text: '挖开石堆,里面没有人,只有一把锤子,还在敲。三长两短,很有规律。', effects: { moraleAll: -5, blessing: 3 } },
        ],
      },
      {
        text: '不挖,继续走。',
        outcomes: [
          { weight: 6, text: '敲击声跟了你们很远。三长两短,三长两短。走出矿道时,它终于停了。', effects: { moraleAll: -4 } },
          { weight: 4, text: '走出十步,敲击声变了——两长三短。队里的老矿工脸色发白:那是「我看见你们了」。', effects: { moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'af-silent-horn',
    scope: { kind: 'dungeon', ids: ['ashfield'] },
    title: '未响的号角',
    text: '白骨大道中央插着一支号角,铜锈斑斑。旁边坐着一具骸骨,姿势像在等谁。据说号角一响,旧战场上的亡者都会站回自己的位置。',
    choices: [
      {
        text: '吹响。',
        outcomes: [
          { weight: 5, text: '号声传遍了旧战场。骸骨们站起身,排成整齐的方阵,朝你们敬了个礼,然后散了。他们等的,大概只是一声收兵。', effects: { blessing: 6, moraleAll: 4 } },
          { weight: 5, text: '号声传遍了旧战场。骸骨们站起身,排成整齐的方阵——面朝你们。', effects: { moraleAll: -3, expAll: 25, runBuff: { id: 'roused-dead', name: '被唤醒的方阵', desc: '整片战场都醒了——防御降低,直到本次远征结束', mods: { def: 0.9 } } } },
        ],
      },
      {
        text: '把号角留给它的主人。',
        outcomes: [
          { weight: 7, text: '骸骨没有动。旧战场上的东西,大多不需要人帮忙。', effects: { moraleAll: 1 } },
          { weight: 3, text: '走远后,身后传来一声很轻的号响。有人替它吹了,吹得很难听。', effects: { moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'bm-mud-peddler',
    scope: { kind: 'dungeon', ids: ['blackmoss'] },
    title: '泥里的药摊',
    text: '栈道尽头支着一个药摊。摊主泡在齐腰深的泥水里,只露出上半身,身后的货架却干干净净。「治疗药,一瓶十五金。」他补了一句,「出了沼泽,就买不到了。」',
    choices: [
      {
        text: '买两瓶。',
        outcomes: [
          { weight: 6, text: '药是真的。摊主是不是真的,不好说——付完钱一回头,摊子和人都沉回了泥里,只剩几个气泡。', effects: { gold: -30, potionHeal: 2 } },
          { weight: 4, text: '药是真的。摊主收钱时露出了手,手上有蹼。沼泽里做生意的,不一定是人。', effects: { gold: -30, potionHeal: 2, moraleRandom: -2 } },
        ],
      },
      {
        text: '不买。',
        outcomes: [
          { weight: 7, text: '摊主点点头,慢慢沉回泥里:「下次见。」沼泽里的人都这么说,通常也真会再见。' },
          { weight: 3, text: '刚走出几步,泥里伸出一只手,把一瓶药放在了栈道上。免费的。没人敢要。', effects: { moraleAll: -1 } },
        ],
      },
    ],
  },
  // ===== 版图二:熔铸工坊 =====
  {
    id: 'fo-stubborn-blank',
    scope: { kind: 'dungeon', ids: ['forge-works'] },
    title: '不肯冷的胚料',
    text: '废模坑里卡着半截没铸完的剑胚,刃口已经成形,剑柄还是一团铁水凝成的疙瘩。旁边的工头记录只有一行:「废品。原因:它不肯冷。」',
    choices: [
      {
        text: '撬出来带走。',
        outcomes: [
          { weight: 5, text: '剑胚到手,确实不肯冷。回到公会它还在发烫,铁匠看了一眼,说这是他见过最倔的废品。', effects: { item: 'wpn-dragon-brand', runBuff: { id: 'hot-blank', name: '不肯冷的铁', desc: '行囊里有块烫手的铁——受疗降低,直到本次远征结束', mods: { heal: 0.9 } } } },
          { weight: 5, text: '撬的时候铁水还没凝透,溅了一身。剑胚留在坑里,看上去有点得意。', effects: { injure: true } },
        ],
      },
      {
        text: '不碰。',
        outcomes: [
          { weight: 7, text: '有些东西被扔掉是有原因的。工头的记录很简洁,也很有说服力。', effects: { moraleAll: 1 } },
        ],
      },
    ],
  },
  // ===== 第三幕(只由 cult-vengeance 触发,不进随机池) =====
  {
    id: 'cult-reckoning',
    scope: { kind: 'dungeon', ids: ['dragonmaw'] },
    title: '第三幕·圣火的尽头',
    text: '龙渊之心的入口,执事团已经在等了。为首的那位捧着一颗烧焦的圣像头——正是你们烧的那一尊。「教主想见见你们。不为清算。教主只是好奇,是什么人敢烧圣像。」',
    choices: [
      {
        text: '去见。',
        outcomes: [
          { weight: 5, text: '教主没有出现。出现的是一把空椅子,椅子上放着一枚鳞印。执事说:「教主说,你们可以走了。」这是龙渊里最客气的威胁。', effects: { item: 'trk-dragon-talisman', blessing: 6, moraleAll: -2 } },
          { weight: 5, text: '走到半路,执事团悄悄散了。门后没有教主,只有一条很长的下坡路——通往你们本来就要去的地方。', effects: { moraleAll: 3, expAll: 30 } },
        ],
      },
      {
        text: '把圣像头还给他。',
        outcomes: [
          { weight: 7, text: '执事接过圣像头,看了很久,说了声谢谢。烧圣像的和还圣像的是同一伙人,这件事让整个教团困惑了好几天。', effects: { moraleAll: 5, gold: 50 } },
        ],
      },
    ],
  },
]
```

---

## 2. 改写与接线

行号以 2026-10-03 工作区的 `guild-events.ts` 为准。

### 2.1 文本改写(5 处)

| 事件 | 行 | 问题 | 改为 |
|---|---|---|---|
| prisoner-ransom | L1527 | 前幕写他「第八天又因销赃被抓」,后幕却是他改行寄钱致谢 | 「第七天,赎金到了,分文不少。三手刘被释放时发誓改行。没人信,包括他自己。」 |
| ghost-harvest | L1696 起 | 前幕是亡者托付「替我看看今年的收成」,后幕变成农夫自己欠了过路人 | 正文:「路边一片麦田黑了半边。田埂上坐着个农夫,对着空处说话:『爹,今年的收成不好。』他说他爹去年冬天走的,走前一直念叨着要看今年的麦子。」选项 1:「替那位看收成:把麦穗举到空处,大声报一句『今年还行』。」其余结果文本不变 |
| dragon-egg | L1878 | 选项写「三个六百」,结果只给 200 金 | 结果 1:「黑市只收了一枚,另外两枚贩子说『成色不对』,只好扔在半路。从那以后,队伍里总有人在半夜听见壳裂的声音。」金额不变 |
| egg-hatch | L1895 起 | 写「卖掉龙蛋的第九天」,与 dueDays 3 不符;并且是从卖掉的蛋里孵出来的 | 正文开头改为:「营地水桶里多了一只巴掌大的小龙崽,湿漉漉的——是扔在半路的那两枚之一,循着气味跟了上来。」后半句「它谁也不认……」保留 |
| knight-chapel | L1172 起 | 「北边的旧教堂」,与旧战场位置不一致 | 「旧战场边上的那座教堂,找到了。」后文不变 |

### 2.2 全部延迟链(`at` 标注 + 修自环 + 接孤儿)

`at: 'dungeon'` 的含义:到期后,下一趟进入 `dungeonId` 指定的副本时,第一个 event 节点必出这一幕;不写 `dungeonId` 就是「下一趟远征,不限副本」。没走到 event 节点就结束,顺延到下一趟。

| # | 源事件 · 结果 | → 目标 | dueDays | at | 变化 |
|---|---|---|---|---|---|
| 1 | dying-knight L982 | knight-pursuit | 2 | town | — |
| 2 | dying-knight L983 | knight-pursuit | 2 | town | — |
| 3 | knight-pursuit L1122「谈崩了」 | **knight-chapel** | 4 | dungeon · ashfield | 修自环 |
| 4 | fleeing-serf L1311 | lord-mercy | 3 | town | — |
| 5 | prisoner-ransom L1527 | ransom-aftermath | 3 | town | 文本见 2.1 |
| 6 | ghost-banquet L1680 | ghost-harvest | 4 | dungeon | 文本见 2.1 |
| 7 | dragon-egg L1878 | egg-hatch | 3 | dungeon · fireridge | 文本见 2.1 |
| 8 | cult-purge L1928 | cult-vengeance | 2 | dungeon | — |
| 9 | cult-purge L1929 | cult-vengeance | 2 | dungeon | — |
| 10 | cult-vengeance L1950「圣像烧塌」 | **cult-reckoning** | 4 | dungeon · dragonmaw | 修自环,接新第三幕 |
| 11 | cult-recruiter L2053 | cult-errand | 3 | town | — |
| 12 | **lost-girl L1056**「那手法不像孩子」 | **girl-debt** | 3 | town | 新接,孤儿 |
| 13 | **dragon-cult L1034**「诵经到天亮」 | **cult-wrath** | 3 | town | 新接,孤儿 |
| 14 | **siren-marsh L1209**「赢得很险」 | **siren-bones** | 3 | town | 新接,孤儿 |
| 15 | **cult-wrath L1157、L1158**「烧了信」两个结果 | **cult-purge** | 2 | dungeon | 新接,准孤儿 |

接线后,girl-debt、cult-wrath、siren-bones、cult-purge、knight-chapel、cult-reckoning 都会自动进入 `SECOND_ACT_IDS`,不再被当作首遇事件抽到。

### 2.3 不用改文本、只需改 scope 的

- **warehouse-thief「仓库里的手」**(你遇到的母女偷药):改成 town 以后只在回城时出现。「当月仓库又少了两瓶」从此扣的是公会库存,与文本一致。
- 其余按分类草案 §2 落地,不改文本。

### 2.4 施工方校验(并入 R1.4 的数据校验单测)

- 新事件的 `item` 都存在于 `ITEM_BASES`:trk-t1-band、arm-t1-mail、arm-dragon-scalemail、wpn-dragon-brand、trk-dragon-talisman。
- 15 条延迟链的目标都存在,且没有一条指向自己。
- 标题带「幕」的事件,至少被一条 `delayed` 指向。
- 每个副本「专属 + 本版图地形」的可首遇事件不少于 4 条。
