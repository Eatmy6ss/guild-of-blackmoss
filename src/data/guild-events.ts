// 公会大事事件池(M1 P2,巫师 3 式:选择即取舍,结果有权重分支——没有标准答案)
// 灵感池(制作人指示:广泛搜集,不限于这几个):巫师3(两害取其轻/延迟后果)、杀戮尖塔(结构化取舍)、
// 暗黑地牢(压力与代价)、黑暗之魂(悲凉托付/力量的诱惑)、博德之门3(遇险者与寄生之诱)、环世界(涌现)、
// **魔兽世界**(稀有精英追猎/世界传闻/宝藏发现)、**矮人要塞**(涌现叙事:事件与公会历史联动、随机名号传奇)。
// 改编纪律:只取骨架,不抄文本;全部落到黑苔世界观。
// 效果键:gold 金币 / blessing 英灵祝福 / moraleAll 全员士气 / moraleRandom 随机一人士气 /
//        expAll 全员经验 / item 获得装备(baseId)/ recruit 获得一位上门候选 / injure 随机一人重伤(HP 减半)
//        potionHeal / potionFury 药水库存增减(负数=消耗,药水经济接入事件叙事)
//        attrPoint 属性点(六维改革):全队每人 +N 点随机维
// 反馈④事件大项新增:
//        runBuff 远征内持续状态(乘数,仅副本内事件生效;hp=生命上限,heal=受疗,atk/def 直改)
//        delayed 延迟第二幕:{ eventId, dueDays }——dueDay 后弹出的后续事件(巫师3式后果延迟)

/** 远征内持续状态(整次远征,乘数制:<1 为减益) */
export interface RunBuffDef {
  id: string
  name: string
  desc: string
  mods: { atk?: number; def?: number; hp?: number; heal?: number }
}

export interface EventOutcome {
  weight: number
  text: string
  effects?: {
    gold?: number
    blessing?: number
    moraleAll?: number
    moraleRandom?: number
    expAll?: number
    item?: string
    recruit?: boolean
    injure?: boolean
    potionHeal?: number
    potionFury?: number
    /** 属性点(六维改革):全队每人 +N 点随机维 */
    attrPoint?: number
    runBuff?: RunBuffDef
    delayed?: { eventId: string; dueDays: number }
    /** 稀有猎杀(WoW 式):下次出征首场遭遇敌方 ×mult、奖励 ×rewardMult(公会层记忆,用后即逝) */
    rareHuntNext?: { mult: number; rewardMult: number }
    /** 公会层持续状态(跨天传奇):days 天内的出征全队生效,到期自动消退 */
    guildBuff?: RunBuffDef & { days: number }
  }
}

export interface EventChoice {
  text: string
  outcomes: EventOutcome[]
}

export interface GuildEventDef {
  id: string
  title: string
  text: string
  choices: EventChoice[]
  /** F08(U14 前置):地域限定——龙脊系事件不出现在黑苔远征/公会层;缺省=通用 */
  region?: ('blackmoss-wild' | 'dragonridge')[]
}

// 试玩反馈④:回城事件率 0.45→0.3——「打完回城事件概率有点高」;访客 roll 互斥不变
export const EVENT_CHANCE = 0.3

export const GUILD_EVENTS: GuildEventDef[] = [
  {
    id: 'cursed-coffin',
    title: '受诅咒的报酬',
    text: '一个面色蜡黄商人开双倍工钱,请你护送一口棺材去邻镇。棺材缝里渗出奇怪的甜香。',
    choices: [
      {
        text: '接下。钱是真的,诅咒是玄学。',
        outcomes: [
          { weight: 6, text: '路程平安。商人付了双倍工钱,临别时欲言又止。', effects: { gold: 120 } },
          { weight: 4, text: '第三天夜里棺材自己开了。你们烧了它,烧的时候那甜香沾在衣服上,一周都没散——没人再提这次委托。', effects: { gold: 120, moraleAll: -10 } },
        ],
      },
      {
        text: '拒绝。双倍工钱买不动这支队伍的鼻子。',
        outcomes: [
          { weight: 8, text: '商人耸耸肩,雇了隔壁镇的野路子。三天后邻镇传来消息,那支队伍一个都没回来。你们喝着酒,各自没说话。', effects: { moraleAll: 4 } },
          { weight: 2, text: '商人记下了公会门口的招牌,临走时多看了一眼。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'orphan-wolves',
    title: '孤儿与狼群',
    text: '一个光脚的孩子冲进酒馆,说父亲被狼群叼进了林子。猎户们都摇头——那是腐化狼的地界。',
    choices: [
      {
        text: '全队出击,救人要紧。',
        outcomes: [
          { weight: 6, text: '狼群被击溃,父亲拖着断腿活了下来。村里凑了一小袋谢礼,孩子记住了你们的脸。', effects: { gold: 40, moraleAll: 8 } },
          { weight: 4, text: '去晚了。你们只带回了父亲的靴子。孩子没哭,只是再也不来酒馆了。', effects: { moraleAll: -8 } },
        ],
      },
      {
        text: '这是猎户的活,不是佣兵的。',
        outcomes: [
          { weight: 7, text: '话虽如此,那孩子离店时的眼神让桌上安静了很久。', effects: { moraleAll: -4 } },
          { weight: 3, text: '村里后来雇了别家公会,价钱是你们的两倍。他们觉得值。', effects: {} },
        ],
      },
      {
        text: '给新兵发把剑,让他自己去练练胆。',
        outcomes: [
          { weight: 5, text: '新兵活着回来了,眼神不一样了。他说林子深处有火光。', effects: { expAll: 40 } },
          { weight: 5, text: '新兵是被抬回来的,瘸了一条腿。他学会的第一课是恐惧。', effects: { injure: true, moraleAll: -5 } },
        ],
      },
    ],
  },  {
    id: 'deserter',
    title: '逃兵入伍',
    text: '一个逃兵想加入公会。他的剑法很扎实,但眼神一直在往门口飘。',
    choices: [
      {
        text: '收下。逃兵也是兵。',
        outcomes: [
          { weight: 6, text: '他留下并很快证明了自己——只是从不参加宴席。', effects: { recruit: true } },
          { weight: 4, text: '一个月后的雨夜,他带着公会的钱箱消失了。追到河边只剩脚印。', effects: { gold: -80, moraleAll: -5 } },
        ],
      },
      {
        text: '扭送军镇,领那份赏格。',
        outcomes: [
          { weight: 6, text: '军镇付了四十金的赏。他路过酒馆时看了你们一眼,什么也没说。', effects: { gold: 40, moraleAll: -5 } },
          { weight: 4, text: '军镇加付了酒钱,感谢公会「维持了体面」。', effects: { gold: 55 } },
        ],
      },
      {
        text: '收下,但扣着他的剑。',
        outcomes: [
          { weight: 10, text: '他没跑。剑在别人手里的时候,他反而睡得很沉。', effects: { recruit: true } },
        ],
      },
    ],
  },
  {
    id: 'relic-escort',
    title: '祭司的圣物',
    text: '修道院请你护送一件圣物回祠堂供奉,工钱之外,他们承诺「英灵会记得善行」。',
    choices: [
      {
        text: '接下,亲自护送。',
        outcomes: [
          { weight: 9, text: '圣物入祠那天,烛火无风自动。修道院没有食言。', effects: { blessing: 3, gold: 30 } },
          { weight: 1, text: '圣物在半路摔裂了。修道院认为这是「英灵收下了它」,照付不误。', effects: { blessing: 3 } },
        ],
      },
      {
        text: '接下,但把它「复刻」一份卖给收藏家。',
        outcomes: [
          { weight: 5, text: '收藏家没验出来。一百二十金入账,祠堂里的蜡烛长得一模一样。', effects: { gold: 120 } },
          { weight: 5, text: '收藏家是个行家。交易黄了,消息却传开了——最近酒馆的客人少了两桌。', effects: { gold: 40, moraleAll: -5 } },
        ],
      },
    ],
  },  {
    id: 'night-knock',
    title: '夜半敲窗',
    text: '三更天,酒馆后窗被轻轻敲响。窗外的人压着嗓子说:「他们在追我,开开窗。」',
    choices: [
      {
        text: '开窗。',
        outcomes: [
          { weight: 6, text: '是个浑身湿透的佣兵,天亮前讲完了自己的故事,然后加入了你们。', effects: { recruit: true } },
          { weight: 4, text: '追进来的人不依不饶。混乱中窗框碎了一地,还赔了邻居家三十金。', effects: { gold: -30, moraleAll: -8 } },
        ],
      },
      {
        text: '不动。夜里叫门的,九成没好事。',
        outcomes: [
          { weight: 8, text: '敲窗声停了。第二天早上,窗台上一行泥脚印通向河边,断了。', effects: {} },
          { weight: 2, text: '敲窗声停了。后来巡夜的说,那晚河里捞上来一个人。', effects: { moraleAll: -4 } },
        ],
      },
      {
        text: '报官,领一份「夜警」的辛苦钱。',
        outcomes: [
          { weight: 10, text: '官差收了线报,丢下二十金辛苦钱,没说抓没抓到。', effects: { gold: 20 } },
        ],
      },
    ],
  },
  {
    id: 'old-debt',
    title: '旧识讨债',
    text: '一位旧识拍着账本上门:公会初创时他垫过的账,连本带利六十金,今天要个说法。',
    choices: [
      {
        text: '还。有借有还,公会立身之本。',
        outcomes: [
          { weight: 9, text: '账本合上,他反而没全拿,抽回两张说:「利息我不要,情我收下。」', effects: { gold: -40, moraleAll: 3 } },
          { weight: 1, text: '全款结清。他在账本上盖了个「讫」字印,深藏功与名。', effects: { gold: -60 } },
        ],
      },
      {
        text: '赖。哪来的账?拿字据来。',
        outcomes: [
          { weight: 6, text: '他真拿不出字据,骂骂咧咧走了。酒馆里有人小声说:「会长这样,啧。」', effects: { blessing: -2 } },
          { weight: 4, text: '他还真有字据。当着满堂酒客被按着还了钱,公会的脸面挂不住了。', effects: { gold: -60, moraleAll: -8 } },
        ],
      },
      {
        text: '让最能打的去「谈谈」。',
        outcomes: [
          { weight: 5, text: '谈得很好。非常非常好。他撕了账本,鞠了一躬。', effects: {} },
          { weight: 5, text: '「谈谈」变成了动手,公会被罚一百金赔药费——这事传得比什么都快。', effects: { gold: -100, moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'old-armory',
    title: '废弃的军械库',
    text: '斥候发现一处塌了半边的旧军械库,里面可能有前朝的武备——也可能有塌陷和别的东西。',
    choices: [
      {
        text: '让守卫带队进去,稳扎稳打。',
        outcomes: [
          { weight: 6, text: '守卫扛回了一面旧盾和几件成色尚可的武备。稳,就是稳。', effects: { item: 'arm-t2-plate' } },
          { weight: 4, text: '里面塌了。守卫用盾扛住了落顶,人没事,但回来后半个月没怎么说话。', effects: { moraleAll: -6 } },
        ],
      },
      {
        text: '让最敏捷的进去,轻装快取。',
        outcomes: [
          { weight: 7, text: '身手快就是好。进出三趟,带回的家伙什件件能用。', effects: { item: 'trk-t2-totem' } },
          { weight: 3, text: '脚下打滑,人空手滚了出来,还砸坏了一段承重梁——里面彻底封死了。', effects: { injure: true } },
        ],
      },
      {
        text: '封了它。前朝的东西,不碰。',
        outcomes: [
          { weight: 10, text: '封条贴上那天,路过的人都多看了一眼。里面到底有什么,只有塔知道。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'noble-duel',
    title: '贵族的决斗',
    text: '一位贵族出八十金,请公会派一人作为他决斗的「护卫替补」。明眼人都知道,替补就是挨刀的。',
    choices: [
      {
        text: '派人去。挨刀也拿钱。',
        outcomes: [
          { weight: 7, text: '贵族的对手技不如人,替补全程没挨一下,八十金到手还看了场好戏。', effects: { gold: 80, moraleAll: 3 } },
          { weight: 3, text: '对面是个疯子。替补挂了彩回来,金子倒是没少。', effects: { gold: 80, injure: true } },
        ],
      },
      {
        text: '回绝。公会的人不给人当门面。',
        outcomes: [
          { weight: 10, text: '贵族雇了镇上的浪荡子。据说决斗双方都打得很难看,围观者大失所望。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'swamp-scent',
    title: '沼泽异香',
    text: '营地夜半飘来一阵甜香,众人的眼皮越来越沉。远处的树影里,似乎有什么在动。',
    choices: [
      {
        text: '让牧师查查——这事邪性,得用正路子对。',
        outcomes: [
          { weight: 6, text: '牧师寻着味找到一丛「眠妄花」,一把火烧了。那晚之后,营地前所未有地安稳。', effects: { blessing: 2, moraleAll: 5 } },
          { weight: 4, text: '花丛深处盘着一条白花花的蛇皮。牧师说,烧它的时候,林子里有什么叹了口气。', effects: { blessing: 1 } },
        ],
      },
      {
        text: '硬扛。睡着的都给俺绑起来!',
        outcomes: [
          { weight: 5, text: '绑是绑了,可所有人都做了整晚的噩梦。天亮时个个眼窝深陷。', effects: { moraleAll: -5 } },
          { weight: 5, text: '有人挣脱绳子走向了树影,找回来时高烧不退,躺了两天。', effects: { injure: true, moraleAll: -3 } },
        ],
      },
      {
        text: '换营地。惹不起,躲得起。',
        outcomes: [
          { weight: 10, text: '新营地的蚊子比异香难缠得多,但至少能睡着觉。二十金的酒洒在了搬家路上。', effects: { gold: -20 } },
        ],
      },
    ],
  },
  {
    id: 'cursed-statue',
    title: '遗迹的雕像',
    text: '遗迹深处立着一尊石像,无论站在哪个角度,它都在「注视」你。石像底座刻着:「携我者,偿我愿。」',
    choices: [
      {
        text: '带回公会。它的「愿」说不定值钱。',
        outcomes: [
          { weight: 5, text: '收藏家当场开出一百五十金。搬运的兄弟们全程汗毛倒竖,但钱是真的。', effects: { gold: 150 } },
          { weight: 5, text: '石像入夜后发出磨牙般的声响。祠堂长老看了一眼,连夜让人沉了塘,还收了三缕香灰「压惊」。', effects: { blessing: -3 } },
        ],
      },
      {
        text: '留在原地。有些门不敲为妙。',
        outcomes: [
          { weight: 10, text: '离开遗迹时回头看,它还在原来的位置注视着。以后每一支路过的队伍,都会被它注视。', effects: {} },
        ],
      },
      {
        text: '砸了。看什么看!',
        outcomes: [
          { weight: 6, text: '锤落像碎,众人齐齐舒了口气——砸碎它的那一下,莫名解压。', effects: { moraleAll: 4 } },
          { weight: 4, text: '碎石飞溅的瞬间,所有人听见了一声极轻的叹息。那晚的篝火怎么添都旺不起来。', effects: { blessing: -1, moraleAll: 2 } },
        ],
      },
    ],
  },
  {
    id: 'fisherman-tribute',
    title: '河湾的水鬼',
    text: '渔村凑了六十金请公会除掉河湾里的「水鬼」——半年来它拖走了三张渔网,和一个醉汉。',
    choices: [
      {
        text: '先潜下去看清楚再动手。',
        outcomes: [
          { weight: 6, text: '水鬼是一窝寄居石缝的秃尾水獭,一网端了。渔村请你们喝了顿鱼汤,尾款分文不少。', effects: { gold: 60, moraleAll: 4 } },
          { weight: 4, text: '水下黑得伸手不见五指。水鬼没找着,先下去的弟兄被石缝划了满身口子。', effects: { injure: true, moraleAll: -3 } },
        ],
      },
      {
        text: '把河湾围了,箭雨伺候。',
        outcomes: [
          { weight: 7, text: '箭雨过后,河面浮起来的东西让渔村集体噤了声——那不是水獭。尾款照付,只是没人再提这件事。', effects: { gold: 60, blessing: 1 } },
          { weight: 3, text: '箭矢白白消耗了一下午,什么也没打中。渔村觉得六十金花得冤,砍成了 30。', effects: { gold: 30 } },
        ],
      },
      {
        text: '劝他们换个地方下网,退一半钱。',
        outcomes: [
          { weight: 10, text: '渔村将信将疑地换了下网处,当季鱼获翻了一倍。如今他们逢人便说,是公会指点的好地方。', effects: { gold: 30, moraleAll: 6 } },
        ],
      },
    ],
  },
  {
    id: 'twin-bounties',
    title: '一颗头的两份悬赏',
    text: '军镇贴出一百金悬赏捉拿逃犯「独眼科尔」。当晚,死者的遗孀也找上门,出八十金,只求「再也见不到他」。要的是同一个人。',
    choices: [
      {
        text: '交给军镇。王法归王法。',
        outcomes: [
          { weight: 7, text: '押送顺利,赏格全额到手。遗孀在酒馆门口站了一晚,第二天没再来。', effects: { gold: 100, moraleAll: -4 } },
          { weight: 3, text: '押送路上科尔挣断了绳子,混乱里伤了两名弟兄才被按住。赏金没少,药钱不少。', effects: { gold: 100, injure: true } },
        ],
      },
      {
        text: '交给遗孀。恩怨归恩怨。',
        outcomes: [
          { weight: 6, text: '她只问了一句话,然后在雪地里哭到天亮。八十金用旧布包着,还带着灶台的温度。', effects: { gold: 80, moraleAll: 5 } },
          { weight: 4, text: '军镇嗅出了味道:悬赏作废不说,公会的名字被记进了某本册子。', effects: { gold: 80, moraleAll: -2 } },
        ],
      },
      {
        text: '谁都不帮。这趟水太浑。',
        outcomes: [
          { weight: 10, text: '半个月后传来消息:科尔和遗孀在渡口碰了个正着。结局没有人愿意细说。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'veteran-beggar',
    title: '门槛边的断刀',
    text: '老乞丐在公会门口坐了三天,身边一柄断成两截的军刀。他只要一碗酒钱,话都说不利索了。',
    choices: [
      {
        text: '给酒钱,再给个火炉边的位置。',
        outcomes: [
          { weight: 7, text: '他喝完酒,用断刀在泥地上给新兵比划了一套防身架势。行家,是行家。', effects: { gold: -10, expAll: 30 } },
          { weight: 3, text: '酒钱他收了,架势没比划。第二天人走了,泥地上留着半截刀,和一行歪歪扭扭的「多谢」。', effects: { gold: -10, moraleAll: 3 } },
        ],
      },
      {
        text: '请他当教官,月钱照付。',
        outcomes: [
          { weight: 5, text: '他教得极好,新兵脱胎换骨——只是每次喝酒都必须有人作陪,否则他不肯开口。', effects: { gold: -30, expAll: 60 } },
          { weight: 5, text: '第三天他醉倒在河沟里,月钱原封不动缝在衣角。他到底是谁,成了一个没答案的问题。', effects: { gold: -30 } },
        ],
      },
      {
        text: '劝他去军镇的荣养院。',
        outcomes: [
          { weight: 10, text: '他朝军镇的方向走了。后来有人在那里见过他,说他在教新兵,教得骂骂咧咧。', effects: { moraleAll: 2 } },
        ],
      },
    ],
  },  {
    id: 'moonshine-still',
    title: '山那边的私酿',
    text: '酒馆掌柜私下抱怨:山里的私酿坊抢了他三成生意,愿出四十金请公会「顺路举报」。而弟兄们上周刚喝过那私酿——确实好酒。',
    choices: [
      {
        text: '收钱办事,举报。',
        outcomes: [
          { weight: 10, text: '税吏端了酿坊,掌柜付了钱。只是此后弟兄们喝的酒,总有人说不如山里那口。', effects: { gold: 40, moraleAll: -4 } },
        ],
      },
      {
        text: '不掺和,再买两坛。',
        outcomes: [
          { weight: 10, text: '私酿坊听闻风声,给公会送了两坛「封口酒」。酒好,话少。', effects: { gold: -20, moraleAll: 6 } },
        ],
      },
      {
        text: '劝掌柜和酿坊合营。',
        outcomes: [
          { weight: 5, text: '谈成了。掌柜管卖,酿坊管酿,公会拿了笔「引荐费」,三方都请了客。', effects: { gold: 70, moraleAll: 3 } },
          { weight: 5, text: '两家当场翻脸,连带着都觉得公会多事。这个月的酒钱,两边都不肯赊了。', effects: { moraleAll: -3 } },
        ],
      },
    ],
  },
  {
    id: 'unclaimed-sword',
    title: '没人认领的剑',
    text: '战利品清点时多出一柄没人认领的长剑,剑柄缠布下刻着一个陌生的名字。夜里,兵器架会朝着它的方向嗡嗡作响。',
    choices: [
      {
        text: '卖给收藏家。',
        outcomes: [
          { weight: 7, text: '收藏家翻来覆去看了半天,痛快付了一百三十金。据说他往后的夜里也睡不好,但那不关我们的事了。', effects: { gold: 130 } },
          { weight: 3, text: '买家是行家,验出剑上「缠着旧誓」。钱给得少,话还难听——「公会不挑食啊。」', effects: { gold: 60, moraleAll: -3 } },
        ],
      },
      {
        text: '供进祠堂,当无名英灵拜着。',
        outcomes: [
          { weight: 9, text: '长老给它上了三炷香。说也奇怪,兵器架从此安静了。', effects: { blessing: 2 } },
          { weight: 1, text: '香烧到一半灭了三次。长老没说话,只是让人把祠堂的门槛加高了半寸。', effects: { blessing: 1 } },
        ],
      },
      {
        text: '熔了打农具,卖给开春的村子。',
        outcomes: [
          { weight: 10, text: '炉火正旺,那点嗡嗡声再也没人听见。农具卖了四十五金,村里开春的犁也有着落了。', effects: { gold: 45, moraleAll: 3 } },
        ],
      },
    ],
  },
  {
    id: 'lost-caravan',
    title: '山道上的尾款',
    text: '上个月护送商队的雇主一直没付尾款,人也失了联。斥候回报:他的货还堆在山道上,货堆旁有狼粪,还很新。',
    choices: [
      {
        text: '再走一趟,把货护送回来抵尾款。',
        outcomes: [
          { weight: 6, text: '货物完好入库,变卖后尾款抵清还多出些零头,货栈老板娘直夸会办事。', effects: { gold: 60, moraleAll: 2 } },
          { weight: 4, text: '狼群比想象中多。货保住了,殿后的弟兄挂了彩——这趟尾款赚的是血汗钱。', effects: { gold: 60, injure: true } },
        ],
      },
      {
        text: '只取回公会寄存的那部分,其余烧了省事。',
        outcomes: [
          { weight: 7, text: '火烧起来的时候,山道上狼嚎一片。尾款折半,省下的脚钱也算钱。', effects: { gold: 30 } },
          { weight: 3, text: '烧货的烟引来一支巡山税队,好说歹说才解释清「不是走私」。三十金辛苦钱全填了「通融费」。', effects: {} },
        ],
      },
      {
        text: '不管了,就当喂了狼。',
        outcomes: [
          { weight: 4, text: '半个月后,失联的雇主自己找上门,不光付清尾款还加了两成「赔罪钱」——他躲进山里,躲过了仇家。', effects: { gold: 75, moraleAll: 3 } },
          { weight: 6, text: '货和尾款一起喂了狼。酒馆里有人替你们惋惜,也有人觉得「早说了那老板不靠谱」。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'rival-defector',
    title: '灰隼的副团长',
    text: '死对头「灰隼佣团」的副团长深夜到访,想带着账册和两名老兵投奔你们——「灰隼克扣抚恤,弟兄们寒了心。」',
    choices: [
      {
        text: '收下,人和账册都要。',
        outcomes: [
          { weight: 6, text: '老兵能打,账册干净,副团长交了投名状。灰隼那边气得跳脚。', effects: { gold: -30, recruit: true, moraleAll: 3 } },
          { weight: 4, text: '灰隼的团长找上门,指着鼻子骂「收留叛徒」。人是留下了——只是账册怎么都对不上总账。', effects: { gold: -30, recruit: true, moraleAll: -3 } },
        ],
      },
      {
        text: '送走人,把「克扣抚恤」捅给军镇。',
        outcomes: [
          { weight: 8, text: '军镇立案,灰隼被罚得肉疼,公会在佣兵堆里的名声悄悄涨了一截。线人赏六十金。', effects: { gold: 60, moraleAll: 4 } },
          { weight: 4, text: '军镇收了状子,转头把消息卖回给灰隼。副团长连夜逃去南边,临走托人留话:「黑苔,也不过如此。」', effects: { moraleAll: -4 } },
        ],
      },
      {
        text: '拒之门外,是非别沾。',
        outcomes: [
          { weight: 10, text: '他在门外的雨里站了一会儿,压低头巾走进雨幕。会长关上门时说了句「对不住」——也可能只是心里说说。', effects: { moraleAll: 2 } },
        ],
      },
    ],
  },
  {
    id: 'midwife-night',
    title: '雪夜三十金',
    text: '后半夜砸门:村里产婆难产,丈夫跪在雪里,掏出全部家当三十金,只求有人翻山去邻镇取药——单程两个时辰,风雪没停。',
    choices: [
      {
        text: '让脚最快的去,火把多带两支。',
        outcomes: [
          { weight: 8, text: '药在鸡叫头遍前赶到了。孩子落地时的哭声,据说半个村子都听见了。三十金他们非要塞,收了。', effects: { gold: 30, moraleAll: 8, expAll: 20 } },
          { weight: 2, text: '风雪太急,取药的人在山脊上滚了一跤,药瓶碎了两支——剩下的刚好够用。人和药都到了。', effects: { gold: 30, injure: true, moraleAll: 5 } },
        ],
      },
      {
        text: '全队点起火把,护送着去。',
        outcomes: [
          { weight: 10, text: '火把在雪山上排成一条线。药到了,人也都回来了。那晚之后,「黑苔」在村里是个带着热气的词。', effects: { gold: 30, moraleAll: 5 } },
        ],
      },
      {
        text: '给他指条路,关门。雪夜翻山,九死一生。',
        outcomes: [
          { weight: 9, text: '门关上,炉火照旧。没人说话,有人把自己那杯酒喝得特别慢。', effects: { moraleAll: -6 } },
          { weight: 1, text: '天亮才知道,邻镇的医生当夜恰好出诊路过村子。命运有时比人多走一步。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'tower-shard',
    title: '会发光的碎片',
    text: '一个山人兜售从黑苔高塔外围捡的「碎片」,说贴身戴着,夜夜梦见战死的袍泽对自己笑。碎片确实在微光里一明一暗。',
    choices: [
      {
        text: '买下来,送修道院鉴定。',
        outcomes: [
          { weight: 6, text: '长老看了一眼就用黄布裹住:「这是塔里没走完的人留下的东西。」鉴定费二十金,换回一句「英灵安了」。', effects: { gold: -20, blessing: 2 } },
          { weight: 4, text: '碎片在祠堂过夜时哭了一宿。长老把它沉了塘,没收钱,只说「这钱留着买香」。', effects: { gold: -20, moraleAll: -4 } },
        ],
      },
      {
        text: '让弟兄们一人摸一下,不买。',
        outcomes: [
          { weight: 10, text: '摸过的人都做了同一个梦:塔门口有人挥手。没人说得清那是好梦还是坏梦,那晚的酒喝得格外安静。', effects: { moraleAll: 3 } },
        ],
      },
      {
        text: '买下来,自己戴。',
        outcomes: [
          { weight: 5, text: '连着一周,你梦见高塔每一层的门都开着。第七天,碎片不亮了——你莫名松了口气。', effects: { gold: -50, blessing: 3 } },
          { weight: 5, text: '噩梦缠了半个月,酒馆里都说会长「脸色比塔还青」。碎片最后沉了塘,五十金打了个水漂。', effects: { gold: -50, moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'harvest-hands',
    title: '收割的三天',
    text: '秋收正忙,村长来问:公会能否派几个人帮工三天?工钱微薄,但「管饭,管饱,新米酿的酒管够」。',
    choices: [
      {
        text: '派新兵去,就当操练。',
        outcomes: [
          { weight: 10, text: '三天里新兵学会了挥镰,也学会了敬酒。回来的路上个个晒黑了一圈,饭量翻了倍。', effects: { gold: 20, expAll: 30, moraleAll: 4 } },
        ],
      },
      {
        text: '婉拒。佣兵不种地。',
        outcomes: [
          { weight: 10, text: '村长讪讪走了。那年新米酒开坛时,飘进酒馆的香味让好几个人放下了筷子。', effects: { moraleAll: -2 } },
        ],
      },
      {
        text: '把库房旧农具打包送去,抵个情分。',
        outcomes: [
          { weight: 10, text: '村长扛着农具连声道谢。修道院听说了此事,罕见地主动送来 2 缕英灵香灰:「善行,英灵记得。」', effects: { gold: -20, blessing: 2 } },
        ],
      },
    ],
  },
  {
    id: 'plague-village',
    title: '疫病村的门',
    text: '邻村发热病蔓延。修道院征人手去隔离区协助,承诺「英灵会记得」;药商同时开出高价:去收购病人家贱卖的田产地契。',
    choices: [
      {
        text: '接修道院的活,派人进隔离区。',
        outcomes: [
          { weight: 7, text: '两周后队伍撤出来,人人瘦了一圈。村里活着的人记住了每一个名字。修道院的谢礼很沉。', effects: { blessing: 3, moraleAll: 5, expAll: 30 } },
          { weight: 3, text: '有弟兄染了热病,躺了半个月才缓过来。修道院照付了谢礼,还多送了一味药。', effects: { blessing: 3, injure: true } },
        ],
      },
      {
        text: '接药商的活,收地契。',
        outcomes: [
          { weight: 6, text: '低价吃进的田产转手赚了一百四十金。只是后来路过那个村,弟兄们都不肯多看路边一眼。', effects: { gold: 140, moraleAll: -6 } },
          { weight: 4, text: '热病蔓延得比想象快,收上来的地契一半成了废纸——村子没了,地还在,可没人敢去种。', effects: { gold: 40, moraleAll: -3 } },
        ],
      },
      {
        text: '两边都不接,关门谢客一周。',
        outcomes: [
          { weight: 10, text: '公会大门紧闭的那周,酒馆的生意倒照旧。修道院和药商后来都找了别家。', effects: { moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'peddler-potions',
    title: '行脚药贩',
    text: '一个背着半人高木箱的行脚药贩在酒馆门口支起摊子,嗓音沙哑:「行军药膏,亲测有效——便宜一半,别问来路。」木箱上爬着细小的白霜,在秋日里不化。',
    choices: [
      {
        text: '便宜一半,要了。药效才是硬道理。',
        outcomes: [
          { weight: 5, text: '药膏管用。冰凉的膏体抹上伤口,疼得人一激灵,第二天就能拉弓。', effects: { potionHeal: 2, potionFury: 1 } },
          { weight: 5, text: '药膏管用,但用完的人手心起了细小的霜纹,三天才退。没人愿意再用第二罐。', effects: { potionHeal: 2, injure: true } },
        ],
      },
      {
        text: '不买来路不明的东西,把他轰走。',
        outcomes: [
          { weight: 7, text: '药贩骂骂咧咧地收拾摊子。他的木箱在门槛上磕了一下,洒出的霜粉把地砖蚀出一个小坑。', effects: {} },
          { weight: 3, text: '轰走药贩的当晚,有队员偷偷溜出去追他。回来时手里多了两罐正经药,和一句「他其实人不坏」。', effects: { potionHeal: 2 } },
        ],
      },
    ],
  },
  {
    id: 'warehouse-thief',
    title: '仓库里的手',
    text: '守夜的队员抓了个翻墙的小贼,怀里揣着两瓶治疗药。是个瘦得脱形的女人,说孩子在矿道镇病着,药铺的价钱她付不起。',
    choices: [
      {
        text: '送官。规矩就是规矩。',
        outcomes: [
          { weight: 6, text: '民兵带走了她。第二天,矿道镇的药铺老板送来一篮子酒,感谢公会替他除恶。队员喝着酒,没人说话。', effects: { moraleAll: -4 } },
          { weight: 4, text: '民兵带走了她。三天后一个高个子男人来公会门口放下两瓶药,深深鞠了一躬就走。是她的丈夫。', effects: { potionHeal: 2, moraleAll: -2 } },
        ],
      },
      {
        text: '药还回来,放她走,再送她一瓶。',
        outcomes: [
          { weight: 6, text: '女人磕了个头,抱着药跑了。一周后矿道镇捎来消息:孩子的烧退了。公会的药柜里,少的那一瓶有了去处。', effects: { potionHeal: -1, moraleAll: 6 } },
          { weight: 4, text: '女人走后,守夜队员嘀咕:「下回别人有样学样怎么办?」你发现他说得对——当月仓库又少了两瓶。', effects: { potionHeal: -2, moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'frost-envoy',
    title: '白霜的信使',
    text: '一个嘴唇冻成青色的信使带来了白霜墓园的信:织法者们愿意付钱,只求公会不要再接去墓园的委托。「死者需要安静。」信纸落款处的名字,全是你葬送在那里的旧敌。',
    choices: [
      {
        text: '收钱,暂停墓园委托。',
        outcomes: [
          { weight: 6, text: '金子是真的,而且很沉。但下一个来委托扫墓的遗族,你们没脸接。', effects: { gold: 150, moraleAll: -4 } },
          { weight: 4, text: '收钱的事被酒馆传成「黑苔收了死人的封口费」。来的委托少了一半,来的目光重了一倍。', effects: { gold: 150, moraleAll: -8 } },
        ],
      },
      {
        text: '把信原样退回。佣兵不看死人的脸色。',
        outcomes: [
          { weight: 7, text: '信退回去的当夜,公会屋檐挂了一层不合时令的霜。早上化了,什么也没发生——大概。', effects: { moraleAll: 3 } },
          { weight: 3, text: '一周后,常客里最沉默的游侠不告而别,只留下一句「我不想葬在那种地方」。', effects: { moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'abyss-preacher',
    title: '渊底的传教士',
    text: '一个穿深袍的传教士在酒馆后巷布道,听众多是输光了的佣兵。他说渊底能让人「忘掉输掉的一切」。有人劝你们管管——也有人已经在问他入教的事。',
    choices: [
      {
        text: '赶人。输光的人不该输掉别的。',
        outcomes: [
          { weight: 6, text: '传教士被请走了。听讲的佣兵们骂骂咧咧,但三天后,有两个人回来问你还有没有活干。', effects: { moraleAll: 5 } },
          { weight: 4, text: '传教士临走留下一句:「主教会记住这份热情。」渊底祭坛方向的夜空,此后总有一线暗红。', effects: {} },
        ],
      },
      {
        text: '睁一只眼闭一只眼,收下他留的「香火钱」。',
        outcomes: [
          { weight: 5, text: '香火钱很厚。酒馆照常开门,只是角落里多了几个眼睛发直的人,他们后来委托时也不再多问价钱。', effects: { gold: 100, moraleAll: -4 } },
          { weight: 5, text: '香火钱很厚。但当月公会的工资桌上,有人开始把酬金分出一半「献给渊底」。', effects: { gold: 100, moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'veteran-legacy',
    title: '老兵的遗产',
    text: '一个拄拐的退役佣兵被邻居发现死在屋里。邻居说,老人临终前一直念叨「黑苔」——三十年前他在这里当过队长。他没有任何亲人。',
    choices: [
      {
        text: '出钱办丧事,把他的旧剑挂在堂前。',
        outcomes: [
          { weight: 6, text: '葬礼来了一百多个老佣兵,谁也没提当年的事,但谁都没走。旧剑挂在酒馆最亮的墙上。', effects: { gold: -60, moraleAll: 10 } },
          { weight: 4, text: '葬礼办完,邻居送来老人真正留下的东西:一只上锁的箱子,钥匙在遗物里。里面是他攒了一辈子的药和金子。', effects: { gold: -60, moraleAll: 8, potionHeal: 2 } },
        ],
      },
      {
        text: '公会是做生意的地方。让镇上收容所料理吧。',
        outcomes: [
          { weight: 8, text: '收容所草草葬了他。没人怪公会——佣兵死在床上已经是福气。只是酒馆那面挂剑的墙,一直空着。', effects: {} },
          { weight: 2, text: '老人队里活到最后的一个人找上门来,把一枚旧徽章拍在桌上:「他要是知道,会比死了更难受。」说完就走了。', effects: { moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'tax-convoy',
    title: '税官的车队',
    text: '河湾村的村长找上门:税官的车队后天经过,课的是「灾年免不了」的重税。村里凑不出钱,凑得出二十个壮丁——和一份体面的报酬。',
    choices: [
      {
        text: '接下。车队在渡口「遇上山洪」。',
        outcomes: [
          { weight: 5, text: '车队折返,税册泡烂了。村长付的钱里混着嫁妆银镯,你们谁也没说破。', effects: { gold: 110, moraleAll: 6 } },
          { weight: 5, text: '车队折返,但护卫里有行家,认出了斧口的走向。镇上传言税官在攒一支讨伐队。', effects: { gold: 110, moraleAll: -3 } },
        ],
      },
      {
        text: '反过来接税官的镖:灾年是灾年,规矩是规矩。',
        outcomes: [
          { weight: 6, text: '车队平安过境。税官多付了酬金,村长在你们路过时往地上啐了一口。', effects: { gold: 80, moraleAll: -5 } },
          { weight: 4, text: '车队平安过境。一个月后税官荐来一桩肥活——护送秋税。「墙头草」的名声,有时候也值钱。', effects: { gold: 130 } },
        ],
      },
    ],
  },
  {
    id: 'mining-strike',
    title: '矿工的请愿',
    text: '锈坑矿道的矿工们联名请愿:公会一直在给「换掉他们」的裸井队做护卫。他们不求公会倒戈,只求别再接那种活。',
    choices: [
      {
        text: '答应。矿道的死人已经够多了。',
        outcomes: [
          { weight: 6, text: '矿工们凑了份子钱,还把矿道深处一条「没被掘锚啃过」的支脉画给了你们。', effects: { gold: 60, moraleAll: 6 } },
          { weight: 4, text: '裸井队转头雇了别家护卫,矿上打死人的事当月就出了。矿工们的感谢是真的,却救不了谁。', effects: { moraleAll: 3 } },
        ],
      },
      {
        text: '护卫是生意,跟谁做不是做。',
        outcomes: [
          { weight: 7, text: '裸井队的钱结得爽快。只是此后在酒馆,矿工们换到了最角落的桌子。', effects: { gold: 90, moraleAll: -4 } },
          { weight: 3, text: '裸井队的钱结得爽快。月底对账时你发现,矿道出的委托少了两成——有些钱挣了,另一些钱就没了。', effects: { gold: 90 } },
        ],
      },
    ],
  },  {
    id: 'snow-caravan',
    title: '雪困的商队',
    text: '急报:一支商队困在白霜墓园外的雪坡上,看守的人手被「会走路的冰雕」冲散。货主开出的救援价很高——高到说明他清楚那些冰雕是什么。',
    choices: [
      {
        text: '连夜出发。人是真的会冻死。',
        outcomes: [
          { weight: 5, text: '人救回来了,货也带回来了。货主按约付钱,还多给了一箱「路上驱寒」的药酒。', effects: { gold: 120, potionHeal: 1, moraleAll: 6 } },
          { weight: 5, text: '人救回来了。归途中队伍被霜狼盯了两天两夜,回城时每个人都瘦了一圈。货主只按货付钱。', effects: { gold: 120, moraleAll: -3, injure: true } },
        ],
      },
      {
        text: '让货主加价再来。天一亮人就该冻透了,但他得知道命值多少钱。',
        outcomes: [
          { weight: 5, text: '货主咬牙加了钱。队伍出发时天还没亮,回来时雪坡上只剩货箱能救。', effects: { gold: 180, moraleAll: -5 } },
          { weight: 5, text: '货主没再来。一周后另一家公会接了那单,活着回来了六个,没回来的十四个。酒馆里没人提这件事,但都记得。', effects: { moraleAll: -4 } },
        ],
      },
    ],
  },
  {
    id: 'cursed-grimoire',
    title: '拾来的经书',
    text: '一个采药孩子挖到一本用皮封面的书,拿到公会想换两个面包。识字的队员翻了两页就合上了:那不是经书,是「说明书」——教你如何给伤口做「不会好的包扎」。',
    choices: [
      {
        text: '烧掉,给孩子两个面包和一句夸奖。',
        outcomes: [
          { weight: 7, text: '书烧的时候没有烟,只有一层白霜贴着火苗打转。孩子的面包换成了肉馅的。', effects: { gold: -5, moraleAll: 4, blessing: 1 } },
          { weight: 3, text: '书烧了,但那天夜里,有队员梦见自己在给谁包扎,包得很好,好得吓人。醒来后他对伤口的处理突然熟练了。', effects: { expAll: 35 } },
        ],
      },
      {
        text: '留下研究。知识没有立场。',
        outcomes: [
          { weight: 4, text: '研究出了一些门道,某几种缝合手法确实高明。代价是研读的人连着一周梦见冰下的眼睛。', effects: { expAll: 50, moraleRandom: -8 } },
          { weight: 6, text: '研究到第三天,书页开始多出没人写过的章节。你烧了它,烧的时候感觉自己慢了一步。', effects: { expAll: 30, moraleAll: -5 } },
        ],
      },
    ],
  },
  {
    id: 'arena-invite',
    title: '斗技场的请柬',
    text: '邻镇斗技场送来烫金请柬:邀请「黑苔的勇士们」参加表演赛,胜方奖金丰厚,观众就爱看真佣兵。请柬背面用小字写着:死伤自负。',
    choices: [
      {
        text: '去。赚钱和扬名,一趟全有了。',
        outcomes: [
          { weight: 5, text: '三场全胜,观众喊的是你们的名字。奖金里还混着观众扔的首饰。', effects: { gold: 140, moraleAll: 7 } },
          { weight: 5, text: '赢了,但打得难看——对手是头没睡醒的熊。观众嘘声一片,钱照付,名没扬成,还添了伤员。', effects: { gold: 100, injure: true } },
        ],
      },
      {
        text: '不去。佣兵的剑不为取悦人出鞘。',
        outcomes: [
          { weight: 6, text: '请柬退了回去。斗技场后来办的那场,主演的是「黑苔风格的佣兵」——一群舞台武行。听说票卖得不错。', effects: { moraleAll: 3 } },
          { weight: 4, text: '请柬退了回去。年轻队员们私下嘀咕了一阵子,但下次操练,没人缺席。', effects: { expAll: 15 } },
        ],
      },
    ],
  },
  {
    id: 'great-contract',
    title: '压垮桌子的大单',
    text: '一位侯爵的管家带来一份长约:全公会整编听调三个月,扫清领地内所有「不安定因素」。报酬是一年的进项。管家补了一句:「包括那些不方便走法庭的。」',
    choices: [
      {
        text: '接。一年进项,三个月脏活,公道自在人心。',
        outcomes: [
          { weight: 4, text: '活干完了,钱货两清。只是这三个月里干的事,队员们在酒桌上换了个讲法,又换了个讲法。', effects: { gold: 220, moraleAll: -6 } },
          { weight: 6, text: '干到第二个月,队里最好的人来交辞职信:「我入这行不是为了这个。」管家催得紧,单还得干完。', effects: { gold: 160, moraleAll: -9 } },
        ],
      },
      {
        text: '拒。「不安定因素」这五个字,太像会给公会招麻烦的说法。',
        outcomes: [
          { weight: 6, text: '管家记下了拒绝,没有失态。三个月后,侯爵领地「肃清」的消息传来——接单的公会拿了钱,也拿进了墓碑一样的名声。', effects: { moraleAll: 5 } },
          { weight: 4, text: '拒绝的理由传开后,几个不安分的队员反倒觉得公会「怂了」。人心这东西,拒绝也是一种考题。', effects: { moraleAll: -3 } },
        ],
      },
    ],
  },
  // ===== 事件大项第一批(反馈④:两难取舍+延迟后果;灵感池见文件头) =====
  {
    id: 'toll-bridge',
    title: '断桥收费',
    text: '去对岸的吊桥断了一半,一个抱着酒坛的渡翁躺在缆绳边:「五个金币,我背你过去。一个一个来,别晃。」',
    choices: [
      {
        text: '付钱。专业的事交给专业的人,虽然他看着像刚从酒坛里捞出来的。',
        outcomes: [
          { weight: 7, text: '渡翁的背稳得像码头石阶。到了对岸他只说了一句:「回程免费。」', effects: { gold: -50, moraleAll: 2 } },
          { weight: 3, text: '背到最后一人时老头打了个酒嗝。全队看着他晃了三晃,没人敢出声。钱付了,酒嗝的利息是全队的心跳。', effects: { gold: -50, moraleAll: -4 } },
        ],
      },
      {
        text: '绕浅滩。多走半里路,不把命拴在一个酒鬼的背上。',
        outcomes: [
          { weight: 6, text: '浅滩水冷,扎得骨头疼,但都过去了。渡翁在对岸冲你们举了举酒坛。', effects: { moraleRandom: -3 } },
          { weight: 4, text: '暗流比看上去急。有人呛了水,装备也泡了汤——铜器还好,皮文书全毁了。', effects: { moraleRandom: -5, potionHeal: -1 } },
        ],
      },
    ],
  },
  {
    id: 'wounded-scout',
    title: '沼泽里的斥候',
    text: '灌木丛里有呻吟声。一个斥候打扮的年轻人被兽夹咬住小腿,已经两天了,伤口发黑。他看见你们,眼睛亮得吓人。',
    choices: [
      {
        text: '救。撬开夹子,上药,把人背出去——这行的规矩比沼泽大。',
        outcomes: [
          { weight: 6, text: '斥候烧得迷糊,却始终攥着一张手绘的兽径图。他家人送来了谢礼,那张图的抄本也留在了公会。', effects: { potionHeal: -1, moraleAll: 5, expAll: 15 } },
          { weight: 4, text: '人是救回来了,伤口的臭味却跟了你们三天。有人开始问:下次还救吗?没人回答。', effects: { potionHeal: -2, moraleRandom: -4 } },
        ],
      },
      {
        text: '给他留点水,夹子自己想办法。沼泽不原谅任何人的腿,包括你们的。',
        outcomes: [
          { weight: 7, text: '你们走出很远还能听见水声,和他不再呻吟后的安静。水壶空了一个,心口堵了一路。', effects: { potionHeal: -1, moraleAll: -6 } },
          { weight: 3, text: '三天后回程,夹子空了,血迹拖向村子方向。他爬出去了。世界有时比想象中硬气。', effects: { moraleAll: 2 } },
        ],
      },
    ],
  },
  {
    id: 'fever-hamlet',
    title: '烧还是不烧',
    text: '一个村子在求救:热病倒了半村人。村长老泪纵横:「再没人帮,我们只能烧了村子断病根。」药铺就剩半间,药材没来得及糟蹋。',
    choices: [
      {
        text: '进村。药材拿来救人,病来了再说。',
        outcomes: [
          { weight: 5, text: '药是真的,病也真的过了人。回程时队伍里多了两声咳嗽——但村里活下来的孩子记住了你们的招牌。', effects: { moraleAll: 6, runBuff: { id: 'plague-cough', name: '热病余波', desc: '咳嗽没停——受疗降低,直到本次远征结束', mods: { heal: 0.8 } } } },
          { weight: 5, text: '药材搬完了,人群里却有人指着你们喊「带走病的」。恐惧不认好人。货是真的,委屈也是真的。', effects: { moraleAll: -4, runBuff: { id: 'plague-cough', name: '热病余波', desc: '咳嗽没停——受疗降低,直到本次远征结束', mods: { heal: 0.8 } } } },
        ],
      },
      {
        text: '帮他们烧。快刀斩病根,这是沼泽教的第一课。',
        outcomes: [
          { weight: 6, text: '火烧了一夜。药铺的存货被你们抢救出来一半,算是不幸中的万利。村民的眼睛在火光里看着你们,没人说话。', effects: { gold: 80, moraleAll: -5 } },
          { weight: 4, text: '火里跑出来几个人,是自封的「病愈者」。拦,还是不拦?最后拦了。这事会在你们的酒里泡很多年。', effects: { gold: 60, moraleAll: -8 } },
        ],
      },
    ],
  },
  {
    id: 'old-shrine',
    title: '无名老祭坛',
    text: '半塌的石祭坛,香灰是新的——荒地里不该有新的香灰。石头上刻着看不懂的旧字,只有一行通用语:「留者得,取者偿。」',
    choices: [
      {
        text: '留下贡品,拜一拜。入乡随俗,尤其当「俗」看起来会咬人。',
        outcomes: [
          { weight: 6, text: '香灰忽然平了,像被什么舔过。一路无话,但所有人都觉得脚下轻了些。', effects: { gold: -30, runBuff: { id: 'shrine-light', name: '祭坛的注视', desc: '某种东西记下了你们的礼数——防御提升,直到本次远征结束', mods: { def: 1.15 } } } },
          { weight: 4, text: '贡品收了,保佑没来。荒地就是荒地,香灰会平,是因为底下有白蚁。', effects: { gold: -30 } },
        ],
      },
      {
        text: '把供品取走。死人的规矩管不了活人的账。',
        outcomes: [
          { weight: 5, text: '供品是三枚旧金币和一把没锈的短刀——成色好得反常。手快的人已经揣上了。', effects: { gold: 70, item: 'wpn-t1-dagger' } },
          { weight: 5, text: '刀是好的,但从拿起它开始,队里总有人半夜听见磨刀声。刀留在公会,磨刀声跟着人。', effects: { gold: 70, item: 'wpn-t1-dagger', runBuff: { id: 'shrine-grudge', name: '取者之偿', desc: '磨刀声在夜里跟着你们——受疗降低,直到本次远征结束', mods: { heal: 0.75 } } } },
        ],
      },
    ],
  },
  {
    id: 'bonfire-ember',
    title: '路人的篝火',
    text: '沼泽高地有一堆没人看守的篝火,火苗白得反常,暖意却实实在在。火边插着一柄断剑,剑身刻着谁也不认识的名字。',
    choices: [
      {
        text: '坐下烤火。暖意面前,来历先放一放。',
        outcomes: [
          { weight: 6, text: '火烤透了湿透的靴子,连旧伤都松快了。走时你们往火里添了自己的柴——礼尚往来,火才不灭。', effects: { moraleAll: 5, runBuff: { id: 'ember-warm', name: '白火的暖', desc: '骨头缝里的暖意——攻击提升,直到本次远征结束', mods: { atk: 1.1 } } } },
          { weight: 4, text: '烤到后半夜,断剑「当啷」倒了。火瞬间矮了半截,像被抽走了什么。没人再睡得着。', effects: { moraleAll: -3 } },
        ],
      },
      {
        text: '拔剑走人。好铁在荒地里就是钱。',
        outcomes: [
          { weight: 5, text: '剑出火的瞬间,白火「呼」地熄了。从此那片高地再没有旅人敢走夜路——断剑卖了个好价钱。', effects: { gold: 90, moraleAll: -4 } },
          { weight: 5, text: '断剑拔断了,手里只剩剑柄。火灭了,寒气从脚底漫上来,一路跟着你们到营地。', effects: { runBuff: { id: 'ember-cold', name: '熄火之寒', desc: '寒气入骨——防御降低,直到本次远征结束', mods: { def: 0.85 } } } },
        ],
      },
    ],
  },
  {
    id: 'dying-knight',
    title: '将死骑士的托付',
    text: '一位锈甲骑士靠在界碑上,胸口插着不属于这片沼泽的细剑。他把手中的圣徽递过来:「把它送到北边的旧教堂……有人会等。别打开它。」他的眼睛已经在看别处了。',
    choices: [
      {
        text: '接下,不打开。死人的托付比活人的合同重。',
        outcomes: [
          { weight: 6, text: '圣徽在行囊里沉甸甸的,像多带了一位同伴。全队走得不快,却走得齐。', effects: { moraleAll: 4, expAll: 20, delayed: { eventId: 'knight-pursuit', dueDays: 2 } } },
          { weight: 4, text: '当夜,圣徽在行囊里发了烫。有人提议打开看看——被老兵一巴掌打回去。托付是托付,烫也是真烫。', effects: { moraleAll: 2, expAll: 20, runBuff: { id: 'knight-oath', name: '沉甸甸的托付', desc: '队伍走得更齐了——防御提升,直到本次远征结束', mods: { def: 1.12 } }, delayed: { eventId: 'knight-pursuit', dueDays: 2 } } },
        ],
      },
      {
        text: '不接。「别打开」这种话,等于里面装着麻烦。',
        outcomes: [
          { weight: 7, text: '你们走出百步,听见身后一声长出的气。回来时他已去了,手还保持着递东西的姿势。有人默默帮他合了眼。', effects: { moraleAll: -5 } },
          { weight: 3, text: '你们没回头。第二天,几个披同样锈甲的人在打听「抬圣徽的佣兵」——幸好你们没拿。', effects: { moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'wine-cellar',
    title: '战利品酒窖',
    text: '塌了半边的庄园地窖里,几十桶酒码得整整齐齐——酒庄主人显然不是死于战乱,而是舍不得喝。桶上写着:「非贺功者勿开。」',
    choices: [
      {
        text: '开一桶,就一桶。活着的功臣,先贺为敬。',
        outcomes: [
          { weight: 6, text: '酒是三十年的陈酿。全队就着干粮喝了个痛快,那晚的哨兵都哼着歌。', effects: { moraleAll: 8, runBuff: { id: 'wine-hangover', name: '宿醉', desc: '快乐是有账单的——攻击略降,直到本次远征结束', mods: { atk: 0.92 } } } },
          { weight: 4, text: '酒是好酒,后劲是好酒的后劲。第二天的行军队伍走得像一条波浪线。', effects: { moraleAll: 6, runBuff: { id: 'wine-hangover', name: '宿醉', desc: '快乐是有账单的——攻击略降,直到本次远征结束', mods: { atk: 0.9 } } } },
        ],
      },
      {
        text: '全搬走,找城里识货的。贺功的事让买家自己来。',
        outcomes: [
          { weight: 6, text: '酒商眼睛都直了,现钱现结。只是「非贺功者勿开」的字样让搬运的人嘀咕了一路。', effects: { gold: 130, moraleAll: -2 } },
          { weight: 4, text: '搬最后一桶时塌了半边地窖,两桶好酒埋了,一个人的腿差点也埋了。剩下的卖了不少。', effects: { gold: 100, moraleRandom: -4 } },
        ],
      },
    ],
  },
  {
    id: 'dragon-cult',
    title: '鳞音教的募捐',
    text: '白袍信士拦在路口,衣角绣着鳞纹:「龙苏醒之日,捐资者可记名于鳞册,灾时得眷属之庇。多少是个心意。」',
    choices: [
      {
        text: '捐。龙不龙的不急,眼下他们的刀是真的。',
        outcomes: [
          { weight: 6, text: '信士在鳞册上写下公会名,郑重盖印:「眷属之庇,必不落空。」至少他们的语气是真的。', effects: { gold: -60, runBuff: { id: 'scale-bless', name: '鳞册记名', desc: '白袍人的保票——受疗提升,直到本次远征结束', mods: { heal: 1.15 } } } },
          { weight: 4, text: '捐完钱走出十里,才有人反应过来:「鳞册记名,记的是名字——他们知道我们叫什么了。」荒野里安静了一瞬。', effects: { gold: -60, moraleAll: -4, runBuff: { id: 'scale-bless', name: '鳞册记名', desc: '受疗提升,直到本次远征结束', mods: { heal: 1.15 } } } },
        ],
      },
      {
        text: '拒绝,顺便告诉他们龙是不存在的。听劝的信士会更信龙,不听劝的会更信刀——都试过了。',
        outcomes: [
          { weight: 5, text: '信士们让开了路,诵经声在背后跟了半里地。', effects: { moraleAll: 2 } },
          { weight: 5, text: '夜里,营地周围多了几百个白袍人围成的圈,不攻,只是围着,齐声诵经到天亮。没人睡好。', effects: { moraleAll: -6, runBuff: { id: 'chant-night', name: '诵经之夜', desc: '一整夜的诵经声——精神疲惫,受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
        ],
      },
    ],
  },
  {
    id: 'lost-girl',
    title: '迷路的小女孩',
    text: '泥路上坐着个六七岁的女孩,裙角干净得不像走失的。她说要去外婆家,却连村名都说不清。她盯着你们的干粮袋,又飞快移开视线。',
    choices: [
      {
        text: '派人送她回去。干粮分她吃,到了地方再走。',
        outcomes: [
          { weight: 6, text: '村子真找到了。她外婆是位独眼老妇,塞给你们一罐蜂蜜渍的药根:「沼泽里走的人,用得上。」', effects: { potionHeal: 2, moraleAll: 4 } },
          { weight: 4, text: '送到地方,她爹却堵在门口骂了半天「拐子」。蜂蜜渍的药根最后还是塞过来了——大人的脸面和老人的心意,各是各的。', effects: { potionHeal: 1, moraleAll: -2 } },
        ],
      },
      {
        text: '给块干粮,让她自己回家。行程不等人,善意也要看里程。',
        outcomes: [
          { weight: 5, text: '她抱着干粮往岔路跑了,轻车熟路。至少这顿是饱的。', effects: { moraleRandom: -2 } },
          { weight: 5, text: '她的视线一直挂在你们腰间的钱袋上——那手法不像孩子。走出二里地,队长摸了摸钱袋,庆幸自己多看了一眼。', effects: { moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'blackmarket-healer',
    title: '黑市医师',
    text: '地下室里的医师干净得可疑:「正规治疗五十金。我这只要十金,不问来路,不留病历——就是缝线的针脚丑了点。」',
    choices: [
      {
        text: '十金的。丑针脚总比没针脚强。',
        outcomes: [
          { weight: 5, text: '针脚丑,但真管用。第二天队伍活蹦乱跳,只有伤口痒得钻心。', effects: { gold: -10, runBuff: { id: 'itchy-stitch', name: '丑针脚', desc: '伤口在痒——受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
          { weight: 5, text: '回去才发现他给缝的线会自己化掉——「不拆线,省事」。省事是真省事,吓人也是真吓人。', effects: { gold: -10, runBuff: { id: 'itchy-stitch', name: '化线', desc: '伤口痒且虚——受疗略降,直到本次远征结束', mods: { heal: 0.85 } } } },
        ],
      },
      {
        text: '五十金的正规医师。命只有一条,不赌针脚。',
        outcomes: [
          { weight: 7, text: '医师的手很稳,账单也很稳。队里有人嘀咕贵,嘀咕完也承认缝得漂亮。', effects: { gold: -50, moraleAll: 2 } },
          { weight: 3, text: '正规医师检查完却说:「你们这伤,最好去找黑市那个老家伙——他这行干了四十年,整条街的疑难都是他缝的。」', effects: { gold: -20, moraleAll: -2 } },
        ],
      },
    ],
  },  {
    id: 'mirror-lake',
    title: '不照人的湖',
    text: '湖水平得像镜子,但村里人从不照:「它照的不是脸,是你欠的账。」湖边只有一块洗衣石,和一句被磨了一半的旧话:「照见者……」后半句风化了。',
    choices: [
      {
        text: '照。欠的账早晚要还,先看清是多少。',
        outcomes: [
          { weight: 5, text: '水面映出的比记忆里年轻,也比记忆里狠。看完的人都沉默了一会儿,然后更用力地赶路。', effects: { moraleAll: -3, expAll: 20 } },
          { weight: 5, text: '湖面什么都没有——不是平静,是空白。有人腿软了三天。也许村人的话反着听才是忠告。', effects: { moraleAll: -5, runBuff: { id: 'lake-blank', name: '空白的湖面', desc: '那片空白总在眼前——受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
        ],
      },
      {
        text: '不照。有些账,让湖自己记着。',
        outcomes: [
          { weight: 7, text: '绕湖而过,洗衣石上坐着只青蛙,目送你们。世界偶尔会允许人不多事。', effects: { moraleAll: 3 } },
          { weight: 3, text: '没照湖,却在村里被认出:「不照湖的佣兵?那湖照过的可都是大人物。」酒钱都被村民抢着付了。', effects: { gold: 25, moraleAll: 2 } },
        ],
      },
    ],
  },
  // ===== 第二幕(延迟后果):由主事件的 delayed 触发,dueDay 后弹出 =====
  {
    id: 'knight-pursuit',
    title: '第二幕·锈甲的来客',
    text: '三名披同款锈甲的骑士堵在公会门口,为首的盯着柜台上那枚圣徽:「他临死前把东西给谁了?」他没有出示任何凭证。圣徽此刻不在柜台上——在你们挑中的远征队行囊里。',
    choices: [
      {
        text: '交出去。「他只说送到,没说要陪着它死。」',
        outcomes: [
          { weight: 6, text: '为首的接过圣徽,久久没说话,最后留下一小袋钱:「替我们,给他立杯酒。」', effects: { gold: 70, moraleAll: 3 } },
          { weight: 4, text: '他们收了圣徽,却记下了公会和那支远征队每个人的名字。是谢是忌,没人说得清。', effects: { gold: 40, moraleRandom: -3 } },
        ],
      },
      {
        text: '不交。托付是托付,徽在人在。',
        outcomes: [
          { weight: 5, text: '对峙到黄昏,骑士们退了。临走留话:「它会认主。它已经认了。」行囊里的圣徽,似乎更沉了。', effects: { moraleAll: 4, runBuff: { id: 'relic-kept', name: '守诺之重', desc: '全队背负着托付——防御提升,直到本次远征结束', mods: { def: 1.15 } } } },
          { weight: 5, text: '谈崩了,动起手。三位骑士带走了话,也留下了伤——「下回在旧教堂见」。那地方你们早晚要去。', effects: { moraleAll: -3, delayed: { eventId: 'knight-pursuit', dueDays: 4 } } },
        ],
      },
    ],
  },  {
    id: 'girl-debt',
    title: '第二幕·小女孩的债主',
    text: '一个精瘦的男人闯进公会,拍下一张画像——就是当初那个「迷路」的女孩:「她偷了我东家的东西,见过她的人都要作证。作证费,二十金。不作证……那就是同伙。」',
    choices: [
      {
        text: '付钱,打发走。别让一个孩子背上一伙佣兵的麻烦。',
        outcomes: [
          { weight: 6, text: '他前脚走,后脚隔壁酒馆老板探头:「那骗子又来?他东家早倒了,专挑软柿子吓唬。」软柿子。你们把钱袋攥出了印子。', effects: { gold: -20, moraleAll: -4 } },
          { weight: 4, text: '付完钱,老板娘多送了两盘下酒菜:「替那丫头谢谢你们。她爹是我们这儿的渔夫,去年走的。」', effects: { gold: -20, moraleAll: 4 } },
        ],
      },
      {
        text: '不作证,也不给钱。请他体会一下,被一群佣兵「作证」的滋味。',
        outcomes: [
          { weight: 5, text: '他跑得比女孩快多了。此后东区的地界上,「黑苔作证」成了句玩笑话,玩笑里带着三分敬。', effects: { moraleAll: 5 } },
          { weight: 5, text: '他怂了,他东家的账房却没怂——一周后,公会收到了真正的传票。这次,是盖章的那种。', effects: { gold: -30, moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'cult-wrath',
    title: '第二幕·鳞册的批注',
    text: '一封鳞纹封口的信送到公会:您的鳞册记名已作批注——「曾拒圣听,心意不诚」。附言:已为您在「眷属之庇」名单中除名,并移入「灾时顺延」名单。',
    choices: [
      {
        text: '烧了信。龙要真醒,先烧的应该是这种名单。',
        outcomes: [
          { weight: 6, text: '烧信的火苗是白的,烧完连灰都不剩。全队看着那团火,默默决定今晚早睡。', effects: { moraleAll: -2 } },
          { weight: 4, text: '信烧了,诵经声却在自己营地外响了一夜——不进,不散,天亮即去。荒野的心理战,他们玩得比龙熟练。', effects: { moraleAll: -5 } },
        ],
      },
      {
        text: '回信捐款,「补个心意」。有些名单,进比出便宜。',
        outcomes: [
          { weight: 6, text: '补捐次日,新鳞册寄到,名字端正,还多了一枚「诚心」鳞印。白袍人的账,比谁都清楚。', effects: { gold: -45, runBuff: { id: 'scale-bless2', name: '诚心鳞印', desc: '白袍人的保票升级——受疗提升,直到本次远征结束', mods: { heal: 1.18 } } } },
          { weight: 4, text: '补捐的钱刚送出去,他们的募捐队伍就常驻到了公会街口——「诚心信士」的招牌,想摘都摘不掉了。', effects: { gold: -45, moraleAll: -3 } },
        ],
      },
    ],
  },
  // ===== 事件大项第二批(事件二期:链扩充+第三幕+WoW 稀有猎杀+矮人要塞涌现) =====
  {
    id: 'knight-chapel',
    title: '第三幕·旧教堂的答案',
    text: '北边的旧教堂找到了。门推开,长椅上坐着一排锈甲骑士的亡魂——那位托付圣徽的同僚。他们齐齐转头,等一个答案。',
    choices: [
      {
        text: '把圣徽放上祭坛,讲完他最后一程。',
        outcomes: [
          { weight: 7, text: '亡魂们逐一起身,向你们行了个古老的军礼,随后化作尘埃。晨光从破窗落进来——多年没这么亮过。', effects: { blessing: 12, moraleAll: 8, expAll: 30 } },
          { weight: 3, text: '礼成时,为首的亡魂多说了一句:「他也曾把别人的托付弄丢过。」原来大家都是一边弄丢,一边补上。', effects: { blessing: 8, moraleAll: 5, expAll: 20 } },
        ],
      },
      {
        text: '圣徽是我们的了——死人的东西,该活人继承。',
        outcomes: [
          { weight: 5, text: '亡魂们没有阻拦,只是齐齐低头。圣徽在你手里沉得像一块墓碑,可它确实是一件好东西。', effects: { item: 'trk-t2-rune', moraleAll: -6 } },
          { weight: 5, text: '抢夺的瞬间,圣徽碎成齑粉。亡魂们散了,什么也没留下——连同那些本该给你们的谢礼。', effects: { moraleAll: -4 } },
        ],
      },
    ],
  },
  {
    id: 'siren-marsh',
    title: '沼泽歌姬',
    text: '黄昏,水面漂来歌声。听得懂的人说那是在唱自己的名字——沼泽歌姬在点名,被点到的人会不由自主往水里走。全队的眼睛都开始发直。',
    choices: [
      {
        text: '堵耳,快速通过。老办法,笨办法,好办法。',
        outcomes: [
          { weight: 7, text: '歌声在耳边变成闷响,像隔着棉被的世界。走出沼泽时,谁也没提自己刚才差点迈错的那半步。', effects: { moraleRandom: -3 } },
          { weight: 3, text: '堵住的是耳朵,堵不住的是心里的事。有人边走边哭,问起都说「进水了」。', effects: { moraleAll: -2 } },
        ],
      },
      {
        text: '循声找她。会唱歌的东西,杀了都能换钱。',
        outcomes: [
          { weight: 5, text: '歌姬的巢穴里堆满了溺亡者的财物。她本人……你们赢得很险,但战利品是真的。', effects: { gold: 110, item: 'trk-t2-medic', runBuff: { id: 'siren-ear', name: '耳中余音', desc: '歌声还在脑子里绕——受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
          { weight: 5, text: '找上门的代价是被反伏击。你们狼狈击退了她,什么都没捞到,还搭上了干粮。', effects: { moraleAll: -5, potionHeal: -1 } },
        ],
      },
    ],
  },
  {
    id: 'siren-bones',
    title: '第二幕·歌姬的骨头',
    text: '一个骨头贩子找上门:「歌姬的肋骨是乐器匠的圣物,一根五十金。你们见过她,对吧?告诉我她的巢穴,五五分账。」他笑起来牙床外露。',
    choices: [
      {
        text: '告诉地址。死物生财,各凭本事。',
        outcomes: [
          { weight: 6, text: '分账到手的钱带着腥气。一个月后,乐器行挂出了「歌姬骨笛」——据说音色空灵,卖得很好。', effects: { gold: 90, moraleAll: -3 } },
          { weight: 4, text: '骨头贩子在巢穴翻了三天,一无所获地回来,逢人就说你们合伙骗他。威胁的话,他记在小本本上了。', effects: { moraleRandom: -3 } },
        ],
      },
      {
        text: '赶走。她的歌已经唱完了,别连骨头都不放过。',
        outcomes: [
          { weight: 7, text: '贩子骂骂咧咧走了。当晚睡得格外沉——有些事做不做,身体比脑子诚实。', effects: { moraleAll: 3 } },
        ],
      },
    ],
  },
  {
    id: 'gilded-skull',
    title: '镀金头骨',
    text: '游商摊位正中摆着一颗镀金头骨:「了解过去,预言未来,一次十金。不满意,退钱。」眼窝里镶的黑曜石随人转动,像在打量谁。',
    choices: [
      {
        text: '问一次。十金买个好奇。',
        outcomes: [
          { weight: 5, text: '头骨说:「你们的敌人在数自己的心跳,而你们在数金币。」全队琢磨了一路,越琢磨越觉得赚了。', effects: { gold: -10, expAll: 20 } },
          { weight: 5, text: '头骨沉默半晌,说:「回去看看你的床。」没人敢问是什么意思。当晚有人把行军床换了方向。', effects: { gold: -10, moraleRandom: -3 } },
        ],
      },
      {
        text: '不问,但出五金买下它的眼珠。黑曜石是好货。',
        outcomes: [
          { weight: 5, text: '游商竟答应了,还痛快得可疑。挖出来的眼珠确实是极品——但当天夜里,营地所有枕着头骨图案行囊的人都做了同一个梦。', effects: { gold: 60, runBuff: { id: 'skull-dream', name: '黑曜石之梦', desc: '共享的怪梦——受疗略降,直到本次远征结束', mods: { heal: 0.92 } } } },
          { weight: 5, text: '游商脸色一变,收摊走人。追出二里地也没追上——一个摆摊老头,脚程快得像年轻的佣兵。这行有高人。', effects: { moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'rival-guild',
    title: '挑战书',
    text: '「铁棘会」的挑战书钉在公会大门上:比试猎杀,下周同期,同一片猎场,猎物价值高者得——输的一方,挂牌让出名字三个月。',
    choices: [
      {
        text: '应战。名字是靠猎物堆出来的,不是让出来的。',
        outcomes: [
          { weight: 5, text: '背水一战的动员意外顺利,连最懒的成员都提前出了三次工。这一周,公会像上了发条。', effects: { moraleAll: 6, expAll: 25, runBuff: { id: 'rival-fire', name: '争胜之火', desc: '全公会较着劲——攻击提升,直到本次远征结束', mods: { atk: 1.12 } } } },
          { weight: 5, text: '铁棘会做了局,好猎点全被他们的人先占了。你们啃着硬骨头,咬牙撑完了这周——输是输了,骨气传开了。', effects: { moraleAll: -3, expAll: 15 } },
        ],
      },
      {
        text: '不应。跟人斗气,不如跟怪斗智。',
        outcomes: [
          { weight: 6, text: '挑战书被用来生火。铁棘会等了三天没等来回音,自己先乱了阵脚——原来他们缺的是名头,不是猎物。', effects: { moraleAll: 2 } },
          { weight: 4, text: '「黑苔怕了铁棘」的顺口溜在酒馆传开。花了很久才明白:不理流言需要的心力,比应战还多。', effects: { moraleAll: -4 } },
        ],
      },
    ],
  },
  {
    id: 'moon-well',
    title: '月井',
    text: '林间圆井,月光落进去不散,反而像凝成了实物。井边石碑:「投其所珍,取其所需。」——典型的古老契约措辞,也典型的没说清楚违约条款。',
    choices: [
      {
        text: '投下一枚金币,求队伍平安。',
        outcomes: [
          { weight: 6, text: '金币落井无声。月光忽然柔了一分——这单契约,对方履约得很体面。', effects: { gold: -30, runBuff: { id: 'moon-calm', name: '月之安眠', desc: '睡眠沉了——受疗提升,直到本次远征结束', mods: { heal: 1.15 } } } },
          { weight: 4, text: '井里的月亮晃了晃,散了。什么都没发生——古老契约的第一条款:对方也有不接单的自由。', effects: { gold: -30 } },
        ],
      },
      {
        text: '打捞井底的「月光」。凝成实物的东西,就是钱。',
        outcomes: [
          { weight: 4, text: '捞上来的碎月凝成一块「月银」,入手温凉,是没见过的好料。井水随之黑了下去——它记住你们了。', effects: { gold: 100, runBuff: { id: 'moon-grudge', name: '月井之怨', desc: '井水黑下去的样子总在眼前——防御略降,直到本次远征结束', mods: { def: 0.9 } } } },
          { weight: 6, text: '捞了半天,只捞起一把旧剑柄。月光的「实物」原来是历代打捞者留下的东西——你们添了一枚金币进去,快步离开。', effects: { moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'fleeing-serf',
    title: '逃亡的佃农',
    text: '田埂上追出一个抱婴儿的佃农家庭,身后烟尘滚滚——领主的骑奴。佃农喊:「行行好,让我们躲躲!地租利滚利,三代都还不完了!」',
    choices: [
      {
        text: '藏。干草垛后面塞下一家三口,对骑奴摇头:「没见过。」',
        outcomes: [
          { weight: 6, text: '骑奴走后,佃农从干草里出来,膝盖砸进泥里给你们磕头。你们扶都扶不及——这礼太重,收不起。', effects: { moraleAll: 5, blessing: 3 } },
          { weight: 4, text: '藏是藏住了,骑奴却记下了公会的脸。领主的「佣兵黑名单」上,大概多了一行字。', effects: { moraleAll: 3, delayed: { eventId: 'lord-mercy', dueDays: 3 } } },
        ],
      },
      {
        text: '不掺和。领主的私事,佣兵掺和就是找死。',
        outcomes: [
          { weight: 7, text: '一家人被拽回去时的哭声,跟了你们一路。有队员攥断了手里的草茎。', effects: { moraleAll: -6 } },
          { weight: 3, text: '当夜领主的管家找来,赏了你们一笔「识相钱」:「识时务的佣兵,领主喜欢。」钱是真的,味道也是真的。', effects: { gold: 45, moraleAll: -4 } },
        ],
      },
    ],
  },
  {
    id: 'lord-mercy',
    title: '第二幕·领主的谢礼',
    text: '领主的管家到访,礼数周全:「大人查阅卷宗,发现贵会曾「恰巧」存在于某片干草垛附近。大人重温旧事,感念当日不必为难彼此。」留下一个锦盒。',
    choices: [
      {
        text: '收下。贵族的台阶,给就要接。',
        outcomes: [
          { weight: 6, text: '锦盒里是一枚领主家徽的银章——持此章,领地内佣兵税减半。当日那家人若知道,大概也会松口气。', effects: { gold: 50, moraleAll: 3 } },
          { weight: 4, text: '银章是真的,管家的附言也是真的:「大人说,下次就没这么巧了。」贵族的善意,利息都是提前算好的。', effects: { gold: 30, moraleRandom: -2 } },
        ],
      },
      {
        text: '退回。「不必为难彼此」这种话,本身就是威胁。',
        outcomes: [
          { weight: 5, text: '管家收盒离开,脸上没什么表情。这种人的记性,是拿来记仇的,也是拿来记人情的——至少黑苔公会从此「有名有姓」。', effects: { moraleAll: 4 } },
          { weight: 5, text: '半月后,领地内三个长期雇主「恰好」都改用了铁棘会。贵族的报复从不明说,只让你慢慢发现。', effects: { gold: -50, moraleAll: -3 } },
        ],
      },
    ],
  },
  {
    id: 'rare-hunt',
    title: '稀有的传闻',
    text: '酒馆角落,独眼老猎人不紧不慢地开了口:「沼泽深处最近出了个稀罕物——「三沼之灾」,头上有旧战盔,杀过一整支勘探队。它的巢,就是它的宝藏。」几个酒客听得眼睛发亮,又互相看了看,都没敢动。',
    choices: [
      {
        text: '追。稀有物配稀有胆——下一战,冲它去。',
        outcomes: [
          { weight: 6, text: '老猎人指了路,收了杯酒钱:「活着回来,告诉我它长什么样。」', effects: { gold: -10, rareHuntNext: { mult: 1.5, rewardMult: 2 } } },
          { weight: 4, text: '「三沼之灾」的名号在沼泽有几个版本——三头、双尾、拖尾锤。不管哪个版本,老猎人都说:「都比传闻里凶。」', effects: { gold: -10, rareHuntNext: { mult: 1.5, rewardMult: 2 } } },
        ],
      },
      {
        text: '不追。传闻里活下来的勘探队,人数是零。',
        outcomes: [
          { weight: 7, text: '老猎人也不劝:「稀罕物,本来就是留给稀罕人的。」他接着喝他的酒,你们接着赶你们的路。', effects: { moraleAll: 1 } },
          { weight: 3, text: '半个月后,另一个公会猎杀了它,尾款据说够买下半条街。这种消息的传播速度,比瘟疫快,比刀子疼。', effects: { moraleAll: -3 } },
        ],
      },
    ],
  },
  {
    id: 'bard-chronicle',
    title: '吟游诗人',
    text: '酒馆里来了个吟游诗人,拨着琴弦唱起本地佣兵的旧事——唱到一半,你听出来了:他唱的是你们。细节对得上,连败仗都唱,而且唱得比胜仗还动人。',
    choices: [
      {
        text: '请他喝一轮,把细节讲给他听。故事要有人记,公会才活得比人久。',
        outcomes: [
          { weight: 7, text: '诗人更新了唱本。从此每个酒馆都传唱黑苔的故事——招募的新人,一半是听着这些歌来的。', effects: { gold: -20, moraleAll: 4, recruit: true } },
          { weight: 3, text: '诗人记性好得吓人,连某次撤退时谁摔进泥坑都唱出来了。全队笑着听完,笑着笑着就不说话了——那画面的主角,正是自己。', effects: { gold: -20, moraleRandom: -3, moraleAll: 2 } },
        ],
      },
      {
        text: '轰走。佣兵的旧账不需要配乐。',
        outcomes: [
          { weight: 5, text: '诗人收琴离开,临走说:「故事不归你们所有,归听见的人。」门外,他已经开始编下一首了——不唱你们,唱铁棘会。', effects: { moraleAll: -2 } },
          { weight: 5, text: '其他酒客不满了:「我们还爱听呢!」原来你们的故事,已经不只是你们的故事。这一晚,公会的名字被叫得格外响。', effects: { moraleAll: 3 } },
        ],
      },
    ],
  },
  {
    id: 'memorial-visitor',
    title: '纪念碑前的陌生人',
    text: '公会石碑前站着一个陌生人,放下一束沼泽菊,敬了个不太标准的军礼。他回头看见你,眼神复杂:「我哥哥……也在这行。想问问,他们走得,疼吗?」',
    choices: [
      {
        text: '陪他站一会儿,把知道的都讲了。活着的人配得上真相,哪怕真相很重。',
        outcomes: [
          { weight: 7, text: '陌生人听完,长长出了一口气,像卸下了什么:「谢谢你。比「不知道」强一万倍。」他留下一小袋钱,说是「香火钱」。', effects: { gold: 30, blessing: 5, moraleAll: 3 } },
          { weight: 3, text: '讲着讲着,你也讲到了自己埋在心里的那一仗。陌生人反过来安慰你。两个人在碑前坐了很久——这行里,谁不是别人故事里的配角。', effects: { moraleAll: 5, expAll: 10 } },
        ],
      },
      {
        text: '岔开话题。「过去的事,提它做什么。」快走,别回头。',
        outcomes: [
          { weight: 6, text: '陌生人愣在原地。你的背影替你回答了他。那束沼泽菊在碑前放了很多天,没人舍得收。', effects: { moraleAll: -4 } },
          { weight: 4, text: '他没再问,只留下一句:「我哥也是佣兵。他说过,最怕的不是死,是被忘掉。」这句话,后来在队里传了很多年。', effects: { moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'living-blade',
    title: '活体之刃',
    text: '黑市深处,一柄剑插在铁砧上,剑身如流水游动。商人压低声音:「它自己挑主人。至今挑了七个,前六个……都出名了。以各种方式。」剑身轻轻震颤,像在打呵欠。',
    choices: [
      {
        text: '让它挑。是它挑人,又不是人求剑——规矩站着也不输。',
        outcomes: [
          { weight: 4, text: '剑身朝队伍里某人亮了一下——成交价极低。商人脸都绿了:「七年来头一次,它打折。」那人从此睡觉都搂着剑。', effects: { gold: -40, item: 'wpn-t2-greatsword', moraleAll: 3 } },
          { weight: 6, text: '剑身扫过所有人,黯淡下去,纹丝不动。商人摊手:「它说,还没到时候。」被一柄剑嫌弃了,说不尴尬是假的。', effects: { gold: -10, moraleRandom: -3 } },
        ],
      },
      {
        text: '不碰。会挑主人的剑,也会挑挑主人的死法。',
        outcomes: [
          { weight: 7, text: '走出黑市,身后隐约传来剑身嗡鸣,像一声嘲笑。但当晚所有人都睡得很踏实——笨铁器不会挑人,也就不会挑事。', effects: { moraleAll: 2 } },
        ],
      },
    ],
  },
  {
    id: 'hunger-altar',
    title: '饥渴之坛',
    text: '地窖深处的石坛,凹槽里干涸的血迹发黑。石壁刻文:「喂养我,我喂养你。」坛边的陶碗里,放着一把银质的割血刀——擦得很亮,有人常用。',
    choices: [
      {
        text: '喂血。一人放一点,试试这个「等价交换」。',
        outcomes: [
          { weight: 5, text: '石坛嗡鸣着饮尽血,凹槽里浮出一批古老的银币——带着体温,像刚从谁的口袋里掏出来。', effects: { gold: 85, runBuff: { id: 'altar-thirst', name: '饥渴的余味', desc: '石坛记得你们的血——受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
          { weight: 5, text: '血被喝了,坛子却毫无表示。石壁刻文的下一行,你这才看清:「……若我不悦。」——上古契约的坑,一个字都不带浪费的。', effects: { moraleAll: -4, runBuff: { id: 'altar-displeasure', name: '坛之不悦', desc: '全队隐隐发冷——攻击略降,直到本次远征结束', mods: { atk: 0.92 } } } },
        ],
      },
      {
        text: '砸坛。来路不明的等价交换,都是高利贷。',
        outcomes: [
          { weight: 6, text: '石坛碎裂,夹层里滚出历代「喂食者」留下的财物——坛子本身就是个聚宝盆。碎石的缝里,隐约有什么叹息了一声。', effects: { gold: 120, moraleAll: -2 } },
          { weight: 4, text: '锤子砸下去的瞬间,所有人都听见一个声音说:「记住你了。」之后一路无事——但每个人都把这句话记了很多年。', effects: { moraleRandom: -4 } },
        ],
      },
    ],
  },
  {
    id: 'mimic-chest',
    title: '可疑的宝箱',
    text: '废墟正中,一只宝箱摆得端端正正——太端正了。箱身上的锁是新的,灰尘却厚得反常;最要命的是,它离墙有一段距离,像什么生物趴在开阔处晒太阳。',
    choices: [
      {
        text: '开。宝箱怪也分很多种,有的只有牙,没有毒。',
        outcomes: [
          { weight: 4, text: '真宝箱!前主人藏得太急没来得及做陷阱。金币和一对完好的护腕——谎言般的运气。', effects: { gold: 75, item: 'arm-t1-mail' } },
          { weight: 6, text: '箱子咬人了!恶战后把它的「舌头」劈了,箱子内部倒是别有洞天——上一批倒霉蛋的家当还在里面。', effects: { moraleRandom: -4, gold: 60, expAll: 15 } },
        ],
      },
      {
        text: '绕开。宝箱不该出现在那里,就像鱼不该挂在树上。',
        outcomes: [
          { weight: 6, text: '绕出去半里地,听见身后「咔哒」一声闷响——它合上了,等下一批人。你们省下的不只是血。', effects: { moraleAll: 2 } },
          { weight: 4, text: '绕路时踩塌了一片朽木,摔了个结实。回头一看,那箱子还在原地端端正正——连笑话都懒得讲。', effects: { moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'soul-trade',
    title: '灵魂商人',
    text: '商人没有影子,货摊却应有尽有。「以记忆易物,」他微笑,「一段童年,换这把匕首;一段初恋,换那件护甲。质量上乘的回忆,我给好价钱。」',
    choices: [
      {
        text: '做一单小的。卖掉某次失败的尴尬回忆——正愁没地方扔。',
        outcomes: [
          { weight: 6, text: '回忆没了,连带着那段日子认识的一个名字也模糊了。东西是真的好,空落落也是真的空。', effects: { item: 'trk-t2-rune', moraleRandom: -3 } },
          { weight: 4, text: '卖的是最疼的那段。商人验货时愣了一下:「这段很贵。」付的价钱,让全队都倒吸凉气——原来伤得越深,越值钱。', effects: { gold: 140, moraleAll: -5 } },
        ],
      },
      {
        text: '不卖。「回忆是非卖品」这种话,说出口才发现自己都没底气。',
        outcomes: [
          { weight: 6, text: '商人点点头,竟有些欣慰:「少见。大多数人是跑回来求我买的——可惜卖了的,买不回来。」', effects: { moraleAll: 3 } },
          { weight: 4, text: '走出很远,你发现自己想不起一个旧友的长相了——不是卖掉的,是本来就在淡。有些东西不留神就没了,跟商人无关。', effects: { moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'wolf-cub',
    title: '狼崽',
    text: '捕兽夹旁边,一只狼崽在装死——装得很差,耳朵一直抖。母狼不在,血迹却是母狼的。它盯着你们,喉咙里滚着不成样子的小小咆哮。',
    choices: [
      {
        text: '解开夹子,放它走。它的獠牙还没长成,脾气倒已经不小——当心手。',
        outcomes: [
          { weight: 7, text: '狼崽一瘸一拐钻进灌木,三步一回头。半个月后,远征队常在沼泽边看见一头年轻的狼远远跟着——不近,也不走。', effects: { moraleAll: 5, runBuff: { id: 'wolf-shadow', name: '沼泽之影', desc: '有一头狼在暗处同行——攻击提升,直到本次远征结束', mods: { atk: 1.08 } } } },
          { weight: 3, text: '解开夹子时它咬了你一口——不重,是警告的力道。跑出去老远,它停下来舔了舔那道自己留下的牙印。', effects: { moraleAll: 3, moraleRandom: -2 } },
        ],
      },
      {
        text: '带走驯养。沼泽狼的崽,养大了是最好的哨兵。',
        outcomes: [
          { weight: 5, text: '狼崽在公会住下了,偷肉、啃桌腿、半夜嚎——但值夜的兄弟都说,有它在,睡得香。', effects: { gold: -20, moraleAll: 4 } },
          { weight: 5, text: '驯了三天没驯服,它绝食。最后送到猎人那儿寄养,它绝食的第七天,猎人来信说它跑了两回,都朝着一个方向——你们上次扎营的方向。', effects: { gold: -20, moraleAll: -3 } },
        ],
      },
    ],
  },
  {
    id: 'prisoner-ransom',
    title: '俘虏与赎金',
    text: '你们端了匪窝,俘虏里有个绸衫商人:「我家里有钱!送信回去,三百金赎金!」另一个俘虏啐他:「他的「家里」是骗来的,我认识他,他叫三手刘!」',
    choices: [
      {
        text: '信绸衫的,送信等赎金。锦衣玉食的人,绑错了会赔得很惨。',
        outcomes: [
          { weight: 5, text: '第七天,赎金到了,分文不少。三手刘被释放时发誓改行——第八天他就因销赃又被抓了。', effects: { gold: 150, delayed: { eventId: 'ransom-aftermath', dueDays: 3 } } },
          { weight: 5, text: '等到第十天,赎金没来,来的却是剿匪的官兵——把你们和三手刘一起围了。解释了很久,官兵最后没收了「赃物」充公。', effects: { moraleAll: -5, gold: -20 } },
        ],
      },
      {
        text: '信泼皮的话,把绸衫的交给官府。骗子的赎金,烫手。',
        outcomes: [
          { weight: 6, text: '官府顺藤摸瓜端了三手刘的销赃网,给公会的赏格比赎金还厚。绸衫的他在大牢里反而吃得香——牢饭免费,这回不是骗的。', effects: { gold: 90, moraleAll: 3 } },
          { weight: 4, text: '官府说人证物证需要你们随行作证——耽搁了三天行程,还倒贴了两顿牢饭的招待钱。「见义勇为」的账,原来是这样算的。', effects: { gold: 40, moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'ransom-aftermath',
    title: '第二幕·三手刘的信',
    text: '一封信送到公会,字迹歪歪扭扭:「我是三手刘。改行了,真的。现在给商队当镖师,合法的。听说你们那边招人——别收我,我就是想说声谢。」信封里塞着一小袋钱,不多,压得平整。',
    choices: [
      {
        text: '收下钱,回封信:「改了就别回头。」',
        outcomes: [
          { weight: 7, text: '信发出去石沉大海。三个月后,一支商队路过公会,领头的朝门里望了很久——像三手刘,又不太像了。', effects: { gold: 25, moraleAll: 3 } },
          { weight: 3, text: '钱袋里的钱是真的,还带着铁锈味——镖师这行也不好干。这声「谢」的分量,比想象中重。', effects: { gold: 40, moraleAll: 2 } },
        ],
      },
      {
        text: '不回。各走各路,就是最好的祝福。',
        outcomes: [
          { weight: 7, text: '那袋钱在柜台上放了三天,最后充了公账。天下拐弯的旧账,多这一笔不多。', effects: { gold: 25 } },
        ],
      },
    ],
  },
  // ===== 事件大项第二批·独立事件 =====
  {
    id: 'wedding-ring',
    title: '泥里的婚戒',
    text: '练兵场泥地里,游侠的脚踢到一枚戒指——内圈刻着两个名字和一个日期,做工远超这片沼泽的水平。失主肯定翻遍了整个训练场。',
    choices: [
      {
        text: '挂在公会门口最显眼处,等失主来认。',
        outcomes: [
          { weight: 6, text: '第十天,一个眼睛通红的汉子冲进来,看到戒指当场嚎啕大哭——那是他战死的兄长留给嫂子的,丢了不敢回家。谢礼是一坛好酒。', effects: { moraleAll: 5, gold: 30 } },
          { weight: 4, text: '一直没人来认。戒指在门口挂成了一个安静的标志:这行里,有人还在等东西回家。', effects: { moraleAll: 2 } },
        ],
      },
      {
        text: '熔了卖金。刻字的部分剪掉,谁也不认识谁。',
        outcomes: [
          { weight: 5, text: '金匠验货时啧啧称奇:「这手工,城里贵族才戴得起。」卖出的价钱,配得上它的来历——也配不上。', effects: { gold: 70, moraleAll: -3 } },
          { weight: 5, text: '熔金的火光里,两个名字最后闪了一下。打杂的小学徒那天下午一直没说话,晚上偷偷在原地挖了半天泥。', effects: { gold: 60, moraleRandom: -4 } },
        ],
      },
    ],
  },
  {
    id: 'flooded-mine',
    title: '淹水的矿洞',
    text: '锈坑矿道的旧巷道重新积水了,水下的矿脉在灯下闪——矿主开价:抽干水,采出的矿五五分。抽水要请水法师,预付四十金。',
    choices: [
      {
        text: '垫付抽水钱,赌矿脉是真的。',
        outcomes: [
          { weight: 5, text: '水抽干,矿脉比说的还肥。五五分账,矿主数钱数到笑出声——你们也分到了实打实的一袋。', effects: { gold: 110, moraleAll: 2 } },
          { weight: 5, text: '水抽干了,矿脉是假的——早被上上个矿主采光了。矿主连道歉都很敷衍,四十金买了句「下次合作」。', effects: { gold: -40, moraleAll: -5 } },
        ],
      },
      {
        text: '不赌。矿主自己怎么不垫?',
        outcomes: [
          { weight: 7, text: '你们走后,矿主找了别家的佣兵垫钱——同样血本无归。老矿工们私下说:那巷道的水,从来就没干净过。', effects: { moraleAll: 1 } },
          { weight: 3, text: '三个月后,另一伙人抽干了水,挖出了本世纪最大的银脉。消息传来的那天,当初劝你别赌的老兵一个人喝了半夜的酒。', effects: { moraleAll: -4 } },
        ],
      },
    ],
  },
  {
    id: 'smuggler-hideout',
    title: '走私洞',
    text: '山洞里的走私据点人去楼空,留下的货码得整整齐齐:上好的酒、南方的香料、几桶没贴标的火药。洞口刻着规矩:「同行不动同行的货。」',
    choices: [
      {
        text: '搬。规矩管的是「同行」,你们是佣兵,吃这碗饭的不算。',
        outcomes: [
          { weight: 5, text: '货卖了三笔好价钱。只是从此公会的货也走山道时,总有人「顺路」检查——江湖规矩,来日方长。', effects: { gold: 130, moraleAll: -2 } },
          { weight: 5, text: '搬火药时磕了一下,全洞轰的一声塌了半边。人是跑出来了,货只剩怀里的两瓶酒和一身灰。', effects: { gold: 40, moraleRandom: -4 } },
        ],
      },
      {
        text: '不搬,顺手把塌方的洞口做上记号。规矩是荒野的秩序,秩序护着每一个夜宿的人。',
        outcomes: [
          { weight: 6, text: '一个月后,洞口的记号旁多了第二行字:「黑苔公会,可信。」走私犯的认可方式很怪,但很实用。', effects: { moraleAll: 3 } },
          { weight: 4, text: '什么都没发生。有时什么都没发生,就是守规矩的全部回报。', effects: { moraleAll: 1 } },
        ],
      },
    ],
  },
  {
    id: 'fallen-star',
    title: '坠星与铁匠',
    text: '一颗流星落在铁匠村后山。老铁匠眼睛发直:「星铁!三十年没见过的料!但老朽的锤子降不住它——需要一支佣兵去把流星头搬回来。路上,肯定不只有你们想要它。」',
    choices: [
      {
        text: '去搬。抢星铁的都有谁?来一个打一个。',
        outcomes: [
          { weight: 5, text: '三拨人抢,打了两仗。流星头抬回村时,老铁匠亲手给全队各打了一件小物什——星铁的小件,也是无价。', effects: { moraleAll: 5, item: 'wpn-line-ranger', expAll: 25 } },
          { weight: 5, text: '赶到时,流星头已经被先到的商队雇人切走了。老铁匠蹲在坑边坐了一夜,你们陪着——谁也没说话。', effects: { moraleAll: -4, expAll: 10 } },
        ],
      },
      {
        text: '让给铁匠村自己组织人手,你们收个「指路费」走人。',
        outcomes: [
          { weight: 6, text: '老铁匠千恩万谢地付了路费。三个月后,村里寄来一批「星铁淬火」的箭头——说是谢礼,成色是真的好。', effects: { gold: 35, moraleAll: 2 } },
          { weight: 4, text: '指路费收了,星铁的事再没消息。打铁的和搬铁的,各是各的命——只是偶尔想起来,会好奇那块铁最后成了什么。', effects: { gold: 35, moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'orphan-apprentice',
    title: '门口的孤儿',
    text: '公会门口蹲着个半大孩子,包袱里是一套缝补过的佣兵皮甲——他爹的。「我会磨箭,认草药,记账。」他背了一遍,像背了很多遍。「收我。什么都干。」',
    choices: [
      {
        text: '收下打杂。公会的灶台和账本,确实需要一双勤快的手。',
        outcomes: [
          { weight: 6, text: '孩子把账理得清清楚楚,磨箭磨得比谁都亮。有人说看见他在练他爹的劈砍——没人点破,只是有人开始「顺路」教他两招。', effects: { gold: -15, moraleAll: 5, recruit: true } },
          { weight: 4, text: '干了半个月,他的叔叔找来了,硬把孩子接走——「这行太苦」。走的那天,灶台的火没人会烧了,冷了三天的饭有人偷偷抹泪。', effects: { moraleAll: -3 } },
        ],
      },
      {
        text: '给盘缠,劝他去南边的学堂。这行的坟,够多了。',
        outcomes: [
          { weight: 6, text: '孩子攥着盘缠走了,一步三回头。多年后南边来信:学堂毕业,在给商会做文书——字里行间,再没有当年的怯。', effects: { gold: -25, blessing: 4, moraleAll: 3 } },
          { weight: 4, text: '盘缠收了,人却没去学堂——他在下个镇子又找了家佣兵公会。这行的召唤,有些人天生听得见。', effects: { gold: -25, moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'ghost-banquet',
    title: '深夜的宴席',
    text: '扎营半夜,营地中央多出一桌宴席:热气腾腾,杯盏齐全,坐垫朝着四个方向——不多不少,刚好是你们的人数。没人看见它是什么时候摆好的。',
    choices: [
      {
        text: '入席。深更半夜的款待,推辞才是失礼。',
        outcomes: [
          { weight: 5, text: '菜是真香,酒是真暖。天亮时桌椅消失了,但每个人的疲惫都消了大半——有人的嘴角还挂着油光。', effects: { moraleAll: 6, runBuff: { id: 'ghost-feast', name: '宴席之恩', desc: '吃人的嘴软?不,是吃饱了有力气——攻击提升,直到本次远征结束', mods: { atk: 1.08 } } } },
          { weight: 5, text: '酒过三巡,对面空着的坐垫上,有人开了口:「替我看看今年的收成。」大家礼貌地应了。答应亡者的事,记得还。', effects: { moraleAll: 3, delayed: { eventId: 'ghost-harvest', dueDays: 4 } } },
        ],
      },
      {
        text: '撤营。不明来路的热饭,比明晃晃的刀还危险。',
        outcomes: [
          { weight: 6, text: '连夜拔营,走出去五里,回头望——宴席还在原地,热气还在飘。没人说话,安静得像送葬。', effects: { moraleAll: -3 } },
          { weight: 4, text: '换营地后倒是睡了个好觉。只是天亮收账时发现,饭钱被「结」过了——每个钱袋里,都少了一枚币,却多了一粒饱满的新米。', effects: { gold: -4, moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'ghost-harvest',
    title: '第二幕·收成',
    text: '路过一片陌生的农田,田里的麦子黑了半边——某种看不见的东西正在糟蹋收成。农夫抱头蹲在田埂:「去年答应过一个过路人,给他看今年的收成……人没来,田就成这样了。」',
    choices: [
      {
        text: '替那位「过路人」看收成,大声报个平安——再把答应的事做了。',
        outcomes: [
          { weight: 7, text: '话音落下,黑麦的边缘以肉眼可见的速度转黄。农夫跪在田里哭,你们悄悄绕开了他的谢礼——有些托付,做了就该轻描淡写。', effects: { moraleAll: 5, blessing: 6 } },
          { weight: 3, text: '报了平安,黑麦却只好转了一半——「过路人」欠的债太重,你们这点诚意只够打个折。农夫照样千恩万谢,你们照样心里有数。', effects: { moraleAll: 2, blessing: 2 } },
        ],
      },
      {
        text: '不管。谁知道是哪位大人物的旧账。',
        outcomes: [
          { weight: 6, text: '绕开农田继续赶路。当晚,营地里每个人的干粮袋都空了一角——麦粒不翼而飞,取而代之的是几粒黑麦。它在提醒你们:看见了的债,就是你们的了。', effects: { moraleAll: -4, runBuff: { id: 'black-wheat', name: '黑麦的记性', desc: '干粮袋里的黑麦扎手——受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
          { weight: 4, text: '不管,也没事。第二天路过时,黑麦自己转了黄——原来那位的债主不止你们一个,有人抢在前头还了。', effects: { moraleAll: 1 } },
        ],
      },
    ],
  },
  {
    id: 'caravan-storm',
    title: '狼群下的商队',
    text: '暴雨里,一支商队被狼群围在坡下,押货人举着火把结成圈,圈里的绸缎和铁器在闪电下发亮。商队领队嘶喊:「救命!货分你们三成!」',
    choices: [
      {
        text: '冲下去。狼好打,人心难买——三成货是顺带的。',
        outcomes: [
          { weight: 6, text: '火把与刀光里,狼群散了。商队领队当场划货抵账,还多塞了两匹布:「下回走这条道,报黑苔的名号。」', effects: { gold: 100, moraleAll: 4 } },
          { weight: 4, text: '救是救下了,狼群却也咬走了两箱货。商人肉疼得直哆嗦,三成变成了两成——还理直气壮。行吧,狼口里省下的都是赚的。', effects: { gold: 70, moraleRandom: -3 } },
        ],
      },
      {
        text: '不动。暴雨里的狼群,狼和人都看不清,刀更看不清。',
        outcomes: [
          { weight: 6, text: '天亮经过坡下,火把熄了,血迹被雨冲干净了。货散了一地,没人捡——捡了,就是跟狼群和幸存者同时结仇。', effects: { moraleAll: -3 } },
          { weight: 4, text: '你们没下去,倒是狼群先散了——原来它们的目标只是掉队的一匹骡子。商队自己撑过来了,还朝坡上你们的方向嘲讽地挥了挥手巾。', effects: { moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'mad-alchemist',
    title: '疯药剂师',
    text: '药剂师从窗口探出头,白发炸成一朵蒲公英:「新药!喝了就知道明天的事!可惜昨天喝的那批,试药的人说知道的全是上礼拜的!」他晃着两瓶颜色可疑的药水:「半价!限时!」',
    choices: [
      {
        text: '买一瓶,挑个胆大的喝。',
        outcomes: [
          { weight: 5, text: '喝的人说看见了「金色的麦田和一扇红门」——没人懂,但那天他的箭百发百中,像提前看过了弹道。', effects: { gold: -30, runBuff: { id: 'vision-haze', name: '幻视余韵', desc: '眼睛偶尔发花——但直觉变准了,攻击提升,直到本次远征结束', mods: { atk: 1.1 } } } },
          { weight: 5, text: '喝的人看见的全是本周的伙食清单。药剂师大怒:「他体质特殊!」退款一半,算是有点良心。', effects: { gold: -15, moraleAll: -2 } },
        ],
      },
      {
        text: '不买,但买他三句真话。疯子的话里,偶尔藏着金子。',
        outcomes: [
          { weight: 5, text: '他说了三条沼泽的实情:哪片水有毒,哪片苇子藏匪,哪家的酒掺了水。条条值钱,句句不沾药。', effects: { gold: -10, expAll: 15 } },
          { weight: 5, text: '他真的只说疯话,三条「真话」全是「月亮是奶酪做的」级别的。药剂师的疯,是套餐,不单点。', effects: { gold: -10, moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'confession-booth',
    title: '路旁忏悔室',
    text: '荒野小教堂的忏悔室居然亮着灯。隔板后一个声音在哭:「我拿了不该拿的东西,卖了不该卖的人……神父睡着了,你听我说完行吗?就一次。」',
    choices: [
      {
        text: '听。有些话憋着会毒死人,说出来,对说话的人是解药。',
        outcomes: [
          { weight: 6, text: '他讲了一个通宵。天亮时他平静了,塞过来一把钥匙:「仓库在码头,第三排。东西你们分,我解脱了。」', effects: { gold: 80, moraleAll: 2 } },
          { weight: 4, text: '听完才知道,他卖的是「人」——字面意思。你攥着忏悔的重量,一夜没合眼:这种事,该报官,还是该守诺?天亮时他走了,你还在想。', effects: { moraleAll: -3, gold: 50 } },
        ],
      },
      {
        text: '不进。「神父睡着了」——你又不是神父,这锅背不起。',
        outcomes: [
          { weight: 6, text: '你走你的夜路,他说他的忏悔。声音在身后渐渐低了。有些救赎,注定跟你没关系。', effects: { moraleRandom: -2 } },
          { weight: 4, text: '第二天天亮回看,忏悔室空了,灯还亮着。桌上留了半块没吃完的干粮——一个逃亡者的干粮,只有逃亡者懂。你把干粮埋了。', effects: { moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'old-map',
    title: '酒鬼的旧地图',
    text: '酒鬼拽住你的袖子,掏出一张油乎乎的羊皮:「祖上传的!藏宝图!三十金卖你——不买拉倒,反正我孙子也不信。」图上的确画着错综的标记,还有一半被油渍泡烂了。',
    choices: [
      {
        text: '买。三十金赌一个酒鬼的祖上,值。',
        outcomes: [
          { weight: 4, text: '按图索骥,烂掉的那半恰好是关键的岔口——但就靠没烂的半张,你们硬是摸到了窖口。祖上是真有货的,酒鬼没吹。', effects: { gold: 120, moraleAll: 4 } },
          { weight: 6, text: '图上的标记全是本地酒馆的位置。所谓「藏宝」,是他祖父当年的一场酒局路线。图是老的,醉是新的。', effects: { gold: -30, moraleRandom: -4 } },
        ],
      },
      {
        text: '不买,但请他喝一顿,听他讲「祖上」。故事有时候比图值钱。',
        outcomes: [
          { weight: 6, text: '酒过三巡,他把祖父当年走私的路线、暗桩、所有「同行不动同行货」的门道,全倒了出来——图会烂,口述的传承不会。', effects: { gold: -15, expAll: 20 } },
          { weight: 4, text: '祖上的事他讲不出几句,倒是把村里三十年的恩怨情仇播报了一遍。信息不值钱,但下酒。', effects: { gold: -15, moraleAll: 1 } },
        ],
      },
    ],
  },
  {
    id: 'parasite-tongue',
    title: '蛆舌预言者',
    text: '沼泽集市角落,兜帽人竖起一根手指:「免费预言。」手指顶端趴着一条一寸长的白虫,蠕动着指向每个驻足的人。「它尝过世界深处的味道。听,还是挖掉它?挖掉,预言就归你了。」',
    choices: [
      {
        text: '听。免费的预言,再恶心也是信息。',
        outcomes: [
          { weight: 5, text: '白虫用细不可闻的声音说:「西边的路在流血,东边的路在睡觉。」后来你们在西边撞见了流寇,在东边睡了个好觉——字面意思的预言。', effects: { expAll: 15, moraleAll: 2 } },
          { weight: 5, text: '预言是:「你的靴子不合脚。」当时全场嗤笑,三天后远征里唯一磨破脚的就是那个换新靴子的——恶心的预言,也是预言。', effects: { moraleRandom: -3, expAll: 10 } },
        ],
      },
      {
        text: '挖掉。想要预言就干脆点——连虫带窝,一起算我的。',
        outcomes: [
          { weight: 5, text: '兜帽人居然没拦,反而鼓掌:「每年就等一个敢挖的。」白虫的窝里藏着一枚旧戒指——那是他「去年敢挖的那位」留下的定金。', effects: { gold: 55, moraleRandom: -2 } },
          { weight: 5, text: '挖是挖下来了,虫却顺着刀爬上了手腕,钻进袖口不见了。兜帽人摊手:「它自己挑地方。祝你好运。」那一整周,手腕都痒。', effects: { moraleRandom: -4, runBuff: { id: 'tongue-itch', name: '腕上之痒', desc: '总感觉袖子里有什么——受疗略降,直到本次远征结束', mods: { heal: 0.9 } } } },
        ],
      },
    ],
  },
  // ===== 事件三期(版图二·龙脊山脉主题):龙蛋/教团清算/龙裔叛逃者/火雨夜等 =====
  {
    id: 'dragon-egg',
    region: ['dragonridge'],
    title: '龙蛋的困境',
    text: '温泉眼边窝着三枚龙蛋,壳面温热,偶尔颤动——里面有活物。鳞音教的通缉令就贴在百里外的镇口:「私藏龙蛋者,株连雇主。」每个蛋,黑市开价两百金。',
    choices: [
      {
        text: '全部抱走。两百一个,三个六百,这是行军财务上的正确决策。',
        outcomes: [
          { weight: 5, text: '蛋在行囊里一路发烫,夜里轮流抱睡。卖是卖了,可从那以后,队伍里总有人在半夜听见壳裂的声音。', effects: { gold: 200, moraleAll: -5, delayed: { eventId: 'egg-hatch', dueDays: 3 } } },
          { weight: 5, text: '搬蛋的队员被突然破壳的一只咬了——那不是龙,是只认人的小蜥蜴。它赖上了背它的人,赶都赶不走。', effects: { gold: 120, injure: true, moraleAll: 2 } },
        ],
      },
      {
        text: '留下,再用温泉灰把窝盖回去。有些买卖做了,夜就睡不安稳。',
        outcomes: [
          { weight: 7, text: '离开半里地,身后传来极轻的一声脆响——是壳裂了,还是你脚下的枯枝?没人回头确认。', effects: { moraleAll: 3, blessing: 3 } },
          { weight: 3, text: '盖灰的时候发现窝下压着半块教团圣牌——原来教团早找到了这里,只是没敢动。你们比教团有种,也可能比教团蠢。', effects: { moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'egg-hatch',
    title: '第二幕·壳里的东西',
    text: '卖掉龙蛋的第九天,营地水桶里发现一只巴掌大的小龙崽——湿漉漉的,是从你们行囊缝里掉进水桶的蛋里孵出来的。它谁也不认,只咬当初提议「抱走」的那位。',
    choices: [
      {
        text: '养着。能咬雇佣兵的东西,将来能咬别的。',
        outcomes: [
          { weight: 6, text: '小龙崽在营地横着走了半个月,连最横的老兵都绕着它的食盆走。但它夜里会盘在火塘边——像收了个脾气差的战友。', effects: { gold: -30, moraleAll: 5, runBuff: { id: 'whelp-guard', name: '小龙崽', desc: '营地里多了条小恶龙——全队攻击提升,直到本次远征结束', mods: { atk: 1.1 } } } },
          { weight: 4, text: '养到第三天,它顺着烟囱跑了,顺走了两件发亮的装备。账算不清——它给的快乐是真的,顺走的东西也是真的。', effects: { moraleAll: 2, gold: -40 } },
        ],
      },
      {
        text: '放归山里。它的牙印还留在谁的手上,就当学费。',
        outcomes: [
          { weight: 7, text: '放生那天它飞得很笨,像一片逆风的斗篷。全队目送——有人说看见它回头了,有人说没有。', effects: { moraleAll: 3, blessing: 4 } },
        ],
      },
    ],
  },
  {
    id: 'cult-purge',
    title: '教团的清算',
    text: '鳞音教的执事团堵在营地外,展开一卷名单:「据鳞册批注,贵会曾于圣地带不敬。念贵会屡建战功,罚金三百金,或——交出当日带队的名字,由圣火净化其不敬。」',
    choices: [
      {
        text: '交钱。三百金买个既往不咎,比背上人命便宜。',
        outcomes: [
          { weight: 6, text: '执事收钱划名,临走留下一句:「圣火看得见忠诚。」队伍里没人说话——被用钱定义的忠诚,总觉得哪里不对。', effects: { gold: -300, moraleAll: -4 } },
          { weight: 4, text: '钱交了,名单上却多了一行小字:「已训诫,暂缓清算。」暂缓两个字,像根刺。', effects: { gold: -300, moraleRandom: -3 } },
        ],
      },
      {
        text: '抗到底。净化两个字冲着谁来的,谁就站出来——全队都会站出来。',
        outcomes: [
          { weight: 5, text: '对峙到深夜,执事团烧了自己的营帐走了——那是教团最烈的抗议。全队握刀握到天亮,手上是汗,心里是火。', effects: { moraleAll: 8, delayed: { eventId: 'cult-vengeance', dueDays: 2 } } },
          { weight: 5, text: '冲突见血了。双方各伤了人,教团扛着伤员撤离时,老队长说了句谁都懂的话:「这下梁子结到龙了。」', effects: { moraleAll: 5, moraleRandom: -3, delayed: { eventId: 'cult-vengeance', dueDays: 2 } } },
        ],
      },
    ],
  },
  {
    id: 'cult-vengeance',
    title: '第二幕·圣火的回信',
    text: '夜里,营地四周的火把无故自燃,火苗全是幽蓝色。火堆边留着一封烧了一半的信:「圣火已至,勿谓言之不预。」字迹是烧出来的,不是写出来的。',
    choices: [
      {
        text: '灭火,加固岗哨,照常行军。吓唬人的火,烧不穿铁甲。',
        outcomes: [
          { weight: 6, text: '一夜平安。第二天路口多了具烧焦的稻草人,穿着公会的制服——恐吓的手艺,糟蹋了这么好的火。', effects: { moraleAll: 3 } },
          { weight: 4, text: '岗哨加了两道,全队却还是一夜没合眼。第二天有个队员递了辞呈——他不怕刀,怕这种看不见的火。', effects: { moraleAll: -5 } },
        ],
      },
      {
        text: '回敬。把他们的圣像也点一把火,火对火,公平。',
        outcomes: [
          { weight: 5, text: '圣像烧塌的那刻,远处山脊上所有教团的火把同时熄灭——然后同时亮起。他们记住了。你们也记住了:这里没人敢惹黑苔。', effects: { moraleAll: 6, gold: -20, delayed: { eventId: 'cult-vengeance', dueDays: 4 } } },
          { weight: 5, text: '火太大了,烧过了山脊的枯草——教团的营地没了,半片林子也没了。你们赢了这一局,输了一片林子,也输掉了说「我们只是自卫」的底气。', effects: { moraleAll: -3, gold: 40 } },
        ],
      },
    ],
  },
  {
    id: 'dragon-defector',
    region: ['dragonridge'],
    title: '龙裔的叛逃者',
    text: '一个龙裔鳞甲半褪、躲在溪水边发抖。他说自己是教团的锻奴,偷了火种图谱逃出来:「收留我,图谱归你们。被找到——你们和我是同罪。」',
    choices: [
      {
        text: '收。图谱归公,人归队伍——教团的账,让教团自己头疼。',
        outcomes: [
          { weight: 6, text: '图谱是真的,人也是真的能干——他锻的箭头比铁匠铺的直。教团派来的说客被他一个人骂退了三回。', effects: { moraleAll: 4, recruit: true, runBuff: { id: 'forge-map', name: '火种图谱', desc: '图谱上的锻法全队受用——攻击提升,直到本次远征结束', mods: { atk: 1.08 } } } },
          { weight: 4, text: '人是收了,教团的追踪者也是真的来了——接下来的一路,你们甩掉了三拨尾巴。图谱值这个险,但险就是险。', effects: { recruit: true, moraleRandom: -3 } },
        ],
      },
      {
        text: '给他干粮和盘缠,让他去投奔别处。这里的战火已经够多了。',
        outcomes: [
          { weight: 6, text: '他朝着自由城邦的方向走了。半个月后的消息说,他在那边开了间铁匠铺,铺子门口挂着块木牌:谢一位佣兵队长。没写名字,但你知道是你。', effects: { gold: -20, blessing: 5, moraleAll: 3 } },
          { weight: 4, text: '盘缠给了,图谱他却没交——图谱是我的命,人可以走。这买卖不算亏,只是总觉得自己错过了什么。', effects: { gold: -20, moraleRandom: -2 } },
        ],
      },
    ],
  },
  {
    id: 'pilgrim-alms',
    region: ['dragonridge'],
    title: '朝圣者的众筹',
    text: '一队衣衫褴褛的朝圣者在山道上支起木牌:众筹登龙脊,敬龙以止天罚。捐资者名入功德簿。他们的领袖是个瘸腿老妇,眼神却像鹰。',
    choices: [
      {
        text: '捐,顺便护送他们一程。龙脊上他们比你们有用——他们知道哪块石头不塌。',
        outcomes: [
          { weight: 6, text: '老妇领路避开了两处塌方和一处不该看的地方。分别时她往你们每人手里塞了一枚平安鳞——不知是真是假,但磨得很亮。', effects: { gold: -40, moraleAll: 4, expAll: 15 } },
          { weight: 4, text: '护送到半路,朝圣队伍里有人认出了你们中某个人的旧债。气氛僵了一路——江湖不大,旧账都在。', effects: { gold: -40, moraleRandom: -4 } },
        ],
      },
      {
        text: '不捐。天罚要真存在,黑苔的刀会先跟它谈谈。',
        outcomes: [
          { weight: 5, text: '老妇不怒反笑:好胆色。那祝你们刀快。队伍走远了,她还在原地盯着你们的方向——不知是敬意还是记仇。', effects: { moraleAll: 2 } },
          { weight: 5, text: '当夜山道塌方,你们绕了半天冤枉路。有人嘀咕:早知道捐了。队长说:「塌方和捐款没关系。」没人接话。', effects: { moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'whelp-poachers',
    region: ['dragonridge'],
    title: '盗猎幼龙者',
    text: '岩架下三个盗猎者正往麻袋里塞幼龙崽,龙妈妈被网罩住奄奄一息。盗猎头子冲你们晃了晃钱袋:一人五十,当没看见。龙崽贩子出手比你们公会大方。',
    choices: [
      {
        text: '动手。放龙,也放龙妈妈——钱他们留着买棺材。',
        outcomes: [
          { weight: 6, text: '盗猎者跑了,留下钱袋和满地绳网。龙妈妈挣脱后没有攻击你们,只是用头蹭了蹭每只龙崽,然后领着它们消失在岩雾里。', effects: { gold: 50, moraleAll: 6, blessing: 3 } },
          { weight: 4, text: '交手时网里的龙妈妈暴起,烧了盗猎者也燎了你们的眉毛。龙崽得救了,你们的鬓角三个月后才长回来。', effects: { moraleAll: 4, moraleRandom: -2 } },
        ],
      },
      {
        text: '收钱,闭眼。龙崽贩子出的价,确实比良心值钱。',
        outcomes: [
          { weight: 5, text: '五十金一人,分账很痛快。回去的路上没人提这件事,但营地那晚特别安静——安静得能听见岩架下龙崽的叫声,其实早就听不见了。', effects: { gold: 150, moraleAll: -7 } },
          { weight: 5, text: '收钱的时候,龙妈妈挣脱了网。盗猎者死了两个,你们因为在场被龙记住了脸——之后每次过那片岩架,天上都有影子跟着。', effects: { gold: 150, runBuff: { id: 'dragon-grudge', name: '母龙的注视', desc: '天上有影子在跟着你们——受疗略降,直到本次远征结束', mods: { heal: 0.88 } } } },
        ],
      },
    ],
  },
  {
    id: 'fire-rain',
    region: ['dragonridge'],
    title: '火雨之夜',
    text: '龙脊的夜空烧起来了——火山的碎屑随雨落下,火星打在帐篷上滋滋作响。老向导蹲在岩下:往南走能躲,往北走是猎场。但火雨后的猎场,会露出平时看不见的东西。',
    choices: [
      {
        text: '南撤避雨。命比宝物值钱,这句是老兵教的。',
        outcomes: [
          { weight: 7, text: '南边一夜无事,只有远处的山被火雨染成剪影。有人半夜醒来两次,确认自己不在梦里。', effects: { moraleAll: 2 } },
          { weight: 3, text: '南撤的路上,火雨点着了一片枯草,队伍帮着扑了半夜火——帮的是山,也是山里不认识的猎户。', effects: { moraleAll: 3, blessing: 3 } },
        ],
      },
      {
        text: '北上。火雨后猎场露出的东西,值得赌这一夜。',
        outcomes: [
          { weight: 4, text: '火雨浇透了地表,冲出的岩缝里卡着一条星铁矿脉——还有一具抱着矿镐的先驱者遗骨。你们取矿,也葬了骨。', effects: { item: 'wpn-dragon-brand', moraleAll: 3, expAll: 20 } },
          { weight: 6, text: '北上代价惨重:火雨灼伤了半队人,露出的宝贝是一堆教团的废铁。老向导说得对,但这种话没人爱听。', effects: { moraleAll: -5, runBuff: { id: 'fire-rain-burn', name: '火雨灼伤', desc: '火星燎过的伤口在发烫——受疗降低,直到本次远征结束', mods: { heal: 0.85 } } } },
        ],
      },
    ],
  },
  {
    id: 'cult-recruiter',
    title: '教团的征募官',
    text: '征募官的文书摊开在桌上:加入鳞音教,享受眷属庇护、圣火抚恤、龙裔锻武优先权。条件:宣誓、纳贡、以及——必要的时候,替圣火做点小事。',
    choices: [
      {
        text: '加入。教团的小事再多,也比没有庇护强。',
        outcomes: [
          { weight: 5, text: '宣誓那天发了圣徽和抚恤册。第一件小事三天后就来了——帮教团运一口绝对不能打开的箱子。你们没打开,但箱子在夜里发出过声音。', effects: { gold: 80, runBuff: { id: 'cult-member', name: '教团编内', desc: '眷属庇护是真的——受疗提升,直到本次远征结束', mods: { heal: 1.15 } }, delayed: { eventId: 'cult-errand', dueDays: 3 } } },
          { weight: 5, text: '加入容易,宣誓的措辞却很讲究——效忠圣火,永不背弃。签字画押后,队里识字的那位脸色发白:这条款,退不出去了。', effects: { gold: 80, moraleAll: -3, runBuff: { id: 'cult-member', name: '教团编内', desc: '受疗提升,直到本次远征结束', mods: { heal: 1.15 } } } },
        ],
      },
      {
        text: '拒绝。佣兵只效忠钱和兄弟,不效忠火。',
        outcomes: [
          { weight: 6, text: '征募官收起文书,不怒自威:「圣火记性好。」他走后,酒馆老板免费送了一轮酒——跟教团说不的人,酒钱我出。', effects: { moraleAll: 5 } },
          { weight: 4, text: '拒了之后一切如常——直到下次进城,铁匠铺恰好没了你们订的货,粮商恰好涨价了。没有明枪,全是暗箭。', effects: { gold: -40, moraleRandom: -3 } },
        ],
      },
    ],
  },
  {
    id: 'cult-errand',
    title: '第二幕·那口箱子',
    text: '教团的传令官追上来:上次那口箱子,收件人说里面少了东西——少了一只会唱歌的石头。他盯着你们:开箱验货是规矩,赔也是规矩。你们自己选。',
    choices: [
      {
        text: '赔。唱歌的石头值多少,照价赔——别再纠缠。',
        outcomes: [
          { weight: 6, text: '赔完钱,传令官递了张清讫的红印条。事毕,你们才想起:从头到尾,没人打开过那口箱子验货——包括收件人。这行水深,教团的更甚。', effects: { gold: -60, moraleRandom: -2 } },
          { weight: 4, text: '照价赔了,可石头半夜真的在货栈里唱起了歌——呜呜的,像哭。伙计们连夜把箱子扔进了河里。歌停了。', effects: { gold: -60, moraleAll: -3 } },
        ],
      },
      {
        text: '要求开箱。当着传令官的面——箱子是你们运的,也是你们封的,封条完好无损。',
        outcomes: [
          { weight: 5, text: '封条完好,当众开箱:里面根本没有石头,只有一袋教团私运的赈灾粮——他们走私赈灾粮!传令官脸色铁青地收了箱子走了,再没提赔偿。', effects: { moraleAll: 6, gold: -10 } },
          { weight: 5, text: '开箱瞬间,一只唱歌的石头跳了出来——真是只石头,一种会共鸣的鸣石,教团用它传讯。石头当众唱了一段教团的密令。传令官下令当场销毁——你们白捡了一段情报。', effects: { expAll: 20, moraleAll: 3 } },
        ],
      },
    ],
  },
  {
    id: 'dragon-blood-spring',
    region: ['dragonridge'],
    title: '龙血泉',
    text: '山岩缝里渗出一泓暗红的泉水,附近草木疯长,泉水边伏着一具巨兽骸骨——骸骨的心口位置,泉水正对着一枚心脏形状的凹坑。喝,还是不喝?',
    choices: [
      {
        text: '喝。龙脊的东西,进了肚才算数。',
        outcomes: [
          { weight: 5, text: '泉水灼烧喉咙后化作热流散遍四肢——当天的行军快得反常,连伤疤都在发烫。好东西,烫也是真的好。', effects: { moraleAll: 4, runBuff: { id: 'blood-spring', name: '龙血热', desc: '血在烧——攻击大幅提升,直到本次远征结束', mods: { atk: 1.18 } } } },
          { weight: 5, text: '喝完一夜高烧,全队轮流说了胡话。烧退之后人人神清气爽——但那晚的胡话里,有人喊了一个死去多年的名字。', effects: { moraleAll: 2, expAll: 25, runBuff: { id: 'blood-spring', name: '龙血热', desc: '血在烧——攻击大幅提升,直到本次远征结束', mods: { atk: 1.15 } } } },
        ],
      },
      {
        text: '不喝,灌进水囊带回去卖。龙脊的疯货,城里有的是人抢。',
        outcomes: [
          { weight: 6, text: '炼金商人抢着收购,当场现结。他灌装时手抖得厉害,嘴里念叨:「喝过的人都说好——但我不喝,你们最好也别喝。」', effects: { gold: 90 } },
          { weight: 4, text: '水囊漏了。一路红痕,引来了两头循血而来的岩狼。打退狼,丢了泉,账面上不亏,心里堵得慌。', effects: { gold: 40, moraleRandom: -4, expAll: 10 } },
        ],
      },
    ],
  },
]
