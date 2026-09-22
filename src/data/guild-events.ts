// 公会大事事件池(M1 P2,巫师 3 式:选择即取舍,结果有权重分支——没有标准答案)
// 效果键:gold 金币 / blessing 英灵祝福 / moraleAll 全员士气 / moraleRandom 随机一人士气 /
//        expAll 全员经验 / item 获得装备(baseId)/ recruit 获得一位上门候选 / injure 随机一人重伤(HP 减半)
//        potionHeal / potionFury 药水库存增减(负数=消耗,药水经济接入事件叙事)

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
}

export const EVENT_CHANCE = 0.45

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
  },
  {
    id: 'drunk-map',
    title: '醉汉的地图',
    text: '一个烂醉的瘦子兜售一张"藏宝图",开价 50 金。图上的字迹一半是酒嗝。',
    choices: [
      {
        text: '买下。万一是真的呢。',
        outcomes: [
          { weight: 5, text: '图是真的。你们在枯树第三根杈下挖出一只铁箱——里面的东西成色不错。', effects: { item: 'wpn-t2-bow' } },
          { weight: 5, text: '挖了三个坑,只有一具骸骨和半块铭牌。骸骨手边有一小罐英灵香灰,倒也算个念想。', effects: { blessing: 2 } },
        ],
      },
      {
        text: '揭穿他。全酒馆都看着呢。',
        outcomes: [
          { weight: 6, text: '瘦子被赶了出去。掌柜的暗暗竖了个拇指——这酒馆的风气,公会有份儿。', effects: {} },
          { weight: 4, text: '瘦子被赶了出去。角落里有老客嘀咕:"那图……去年我见过,是真的。"', effects: { moraleAll: -3 } },
        ],
      },
    ],
  },
  {
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
          { weight: 6, text: '军镇付了 40 金的赏。他路过酒馆时看了你们一眼,什么也没说。', effects: { gold: 40, moraleAll: -5 } },
          { weight: 4, text: '军镇加付了酒钱,感谢公会"维持了体面"。', effects: { gold: 55 } },
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
    text: '修道院请你护送一件圣物回祠堂供奉,工钱之外,他们承诺"英灵会记得善行"。',
    choices: [
      {
        text: '接下,亲自护送。',
        outcomes: [
          { weight: 9, text: '圣物入祠那天,烛火无风自动。修道院没有食言。', effects: { blessing: 3, gold: 30 } },
          { weight: 1, text: '圣物在半路摔裂了。修道院认为这是"英灵收下了它",照付不误。', effects: { blessing: 3 } },
        ],
      },
      {
        text: '接下,但把它"复刻"一份卖给收藏家。',
        outcomes: [
          { weight: 5, text: '收藏家没验出来。120 金入账,祠堂里的蜡烛长得一模一样。', effects: { gold: 120 } },
          { weight: 5, text: '收藏家是个行家。交易黄了,消息却传开了——最近酒馆的客人少了两桌。', effects: { gold: 40, moraleAll: -5 } },
        ],
      },
    ],
  },
  {
    id: 'healer-ointment',
    title: '郎中的药膏',
    text: '走方郎中兜售"必愈药膏",宣称敷哪儿好哪儿。他推车上的瓶瓶罐罐确实不少。',
    choices: [
      {
        text: '全员一人一罐。',
        outcomes: [
          { weight: 5, text: '药膏奇效。连旧伤都好了,酒馆里此起彼伏的是舒坦的呻吟。', effects: { gold: -50, moraleAll: 15 } },
          { weight: 5, text: '是猪油混薄荷。除了清凉一无是处,那郎中已经跑没影了。', effects: { gold: -50, moraleAll: -10 } },
        ],
      },
      {
        text: '只买一罐,给伤最重的人。',
        outcomes: [
          { weight: 7, text: '伤最重的那个人敷了,确实好了大半。值。', effects: { gold: -10, moraleRandom: 20 } },
          { weight: 3, text: '那罐是清水。运气不好,赶上了骗子批次的头一罐。', effects: { gold: -10 } },
        ],
      },
      {
        text: '赶走郎中。装神弄鬼。',
        outcomes: [
          { weight: 10, text: '郎中推着车骂骂咧咧地走了。若干天后,有人在邻镇见他把同一套说辞卖了个好价钱。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'night-knock',
    title: '夜半敲窗',
    text: '三更天,酒馆后窗被轻轻敲响。窗外的人压着嗓子说:"他们在追我,开开窗。"',
    choices: [
      {
        text: '开门。',
        outcomes: [
          { weight: 6, text: '是个浑身湿透的佣兵,天亮前讲完了自己的故事,然后加入了你们。', effects: { recruit: true } },
          { weight: 4, text: '追进来的人不依不饶。混乱中窗框碎了一地,还赔了邻居家 30 金。', effects: { gold: -30, moraleAll: -8 } },
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
        text: '报官,领一份"夜警"的辛苦钱。',
        outcomes: [
          { weight: 10, text: '官差收了线报,丢下 20 金辛苦钱,没说抓没抓到。', effects: { gold: 20 } },
        ],
      },
    ],
  },
  {
    id: 'old-debt',
    title: '旧识讨债',
    text: '一位旧识拍着账本上门:公会初创时他垫过的账,连本带利 60 金,今天要个说法。',
    choices: [
      {
        text: '还。有借有还,公会立身之本。',
        outcomes: [
          { weight: 9, text: '账本合上,他反而没全拿,抽回两张说:"利息我不要,情我收下。"', effects: { gold: -40, moraleAll: 3 } },
          { weight: 1, text: '全款结清。他在账本上盖了个"讫"字印,深藏功与名。', effects: { gold: -60 } },
        ],
      },
      {
        text: '赖。哪来的账?拿字据来。',
        outcomes: [
          { weight: 6, text: '他真拿不出字据,骂骂咧咧走了。酒馆里有人小声说:"会长这样,啧。"', effects: { blessing: -2 } },
          { weight: 4, text: '他还真有字据。当着满堂酒客被按着还了钱,公会的脸面挂不住了。', effects: { gold: -60, moraleAll: -8 } },
        ],
      },
      {
        text: '让最能打的去"谈谈"。',
        outcomes: [
          { weight: 5, text: '谈得很好。非常非常好。他撕了账本,鞠了一躬。', effects: {} },
          { weight: 5, text: '"谈谈"变成了动手,公会被罚 100 金赔药费——这事传得比什么都快。', effects: { gold: -100, moraleAll: -6 } },
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
    text: '一位贵族出 80 金,请公会派一人作为他决斗的"护卫替补"。明眼人都知道,替补就是挨刀的。',
    choices: [
      {
        text: '派人去。挨刀也拿钱。',
        outcomes: [
          { weight: 7, text: '贵族的对手技不如人,替补全程没挨一下,80 金到手还看了场好戏。', effects: { gold: 80, moraleAll: 3 } },
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
          { weight: 6, text: '牧师寻着味找到一丛"眠妄花",一把火烧了。那晚之后,营地前所未有地安稳。', effects: { blessing: 2, moraleAll: 5 } },
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
          { weight: 10, text: '新营地的蚊子比异香难缠得多,但至少能睡着觉。20 金的酒洒在了搬家路上。', effects: { gold: -20 } },
        ],
      },
    ],
  },
  {
    id: 'cursed-statue',
    title: '遗迹的雕像',
    text: '遗迹深处立着一尊石像,无论站在哪个角度,它都在"注视"你。石像底座刻着:"携我者,偿我愿。"',
    choices: [
      {
        text: '带回公会。它的"愿"说不定值钱。',
        outcomes: [
          { weight: 5, text: '收藏家当场开出 150 金。搬运的兄弟们全程汗毛倒竖,但钱是真的。', effects: { gold: 150 } },
          { weight: 5, text: '石像入夜后发出磨牙般的声响。祠堂长老看了一眼,连夜让人沉了塘,还收了 3 缕香灰"压惊"。', effects: { blessing: -3 } },
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
    text: '渔村凑了 60 金请公会除掉河湾里的"水鬼"——半年来它拖走了三张渔网,和一个醉汉。',
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
          { weight: 3, text: '箭矢白白消耗了一下午,什么也没打中。渔村觉得 60 金花得冤,砍成了 30。', effects: { gold: 30 } },
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
    text: '军镇贴出 100 金悬赏捉拿逃犯"独眼科尔"。当晚,死者的遗孀也找上门,出 80 金,只求"再也见不到他"。要的是同一个人。',
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
          { weight: 6, text: '她只问了一句话,然后在雪地里哭到天亮。80 金用旧布包着,还带着灶台的温度。', effects: { gold: 80, moraleAll: 5 } },
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
          { weight: 3, text: '酒钱他收了,架势没比划。第二天人走了,泥地上留着半截刀,和一行歪歪扭扭的"多谢"。', effects: { gold: -10, moraleAll: 3 } },
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
  },
  {
    id: 'tax-collector',
    title: '税吏的算盘',
    text: '王国税吏抱着账册上门,说公会去年的"战利品折算"少报了,补缴 60 金——数目他"大概估的"。',
    choices: [
      {
        text: '如数补缴,买个清净。',
        outcomes: [
          { weight: 10, text: '税吏盖章走人,临走压低声音:"其实还有三家没你们痛快。"', effects: { gold: -60 } },
        ],
      },
      {
        text: '请他喝酒,慢慢"核对"。',
        outcomes: [
          { weight: 6, text: '三坛酒下肚,数目变成了 20 金,还附赠一条消息:下季度要开新税。', effects: { gold: -20 } },
          { weight: 4, text: '酒喝了不少,账却越核越多——他把酒钱也算了进去。', effects: { gold: -80, moraleAll: -3 } },
        ],
      },
      {
        text: '藏起账本,就说烧了。',
        outcomes: [
          { weight: 5, text: '他信了,或者懒得深究,记了笔"凭证灭失"便走了。', effects: {} },
          { weight: 5, text: '王法不讲情面:罚金 130 金,外加满酒馆的围观。公会的脸面和金袋一起瘪了。', effects: { gold: -130, moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'moonshine-still',
    title: '山那边的私酿',
    text: '酒馆掌柜私下抱怨:山里的私酿坊抢了他三成生意,愿出 40 金请公会"顺路举报"。而弟兄们上周刚喝过那私酿——确实好酒。',
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
          { weight: 10, text: '私酿坊听闻风声,给公会送了两坛"封口酒"。酒好,话少。', effects: { gold: -20, moraleAll: 6 } },
        ],
      },
      {
        text: '劝掌柜和酿坊合营。',
        outcomes: [
          { weight: 5, text: '谈成了。掌柜管卖,酿坊管酿,公会拿了笔"引荐费",三方都请了客。', effects: { gold: 70, moraleAll: 3 } },
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
          { weight: 7, text: '收藏家翻来覆去看了半天,痛快付了 130 金。据说他往后的夜里也睡不好,但那不关我们的事了。', effects: { gold: 130 } },
          { weight: 3, text: '买家是行家,验出剑上"缠着旧誓"。钱给得少,话还难听——"公会不挑食啊。"', effects: { gold: 60, moraleAll: -3 } },
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
          { weight: 10, text: '炉火正旺,那点嗡嗡声再也没人听见。农具卖了 45 金,村里开春的犁也有着落了。', effects: { gold: 45, moraleAll: 3 } },
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
          { weight: 3, text: '烧货的烟引来一支巡山税队,好说歹说才解释清"不是走私"。30 金辛苦钱全填了"通融费"。', effects: {} },
        ],
      },
      {
        text: '不管了,就当喂了狼。',
        outcomes: [
          { weight: 4, text: '半个月后,失联的雇主自己找上门,不光付清尾款还加了两成"赔罪钱"——他躲进山里,躲过了仇家。', effects: { gold: 75, moraleAll: 3 } },
          { weight: 6, text: '货和尾款一起喂了狼。酒馆里有人替你们惋惜,也有人觉得"早说了那老板不靠谱"。', effects: {} },
        ],
      },
    ],
  },
  {
    id: 'rival-defector',
    title: '灰隼的副团长',
    text: '死对头"灰隼佣团"的副团长深夜到访,想带着账册和两名老兵投奔你们——"灰隼克扣抚恤,弟兄们寒了心。"',
    choices: [
      {
        text: '收下,人和账册都要。',
        outcomes: [
          { weight: 6, text: '老兵能打,账册干净,副团长交了投名状。灰隼那边气得跳脚。', effects: { gold: -30, recruit: true, moraleAll: 3 } },
          { weight: 4, text: '灰隼的团长找上门,指着鼻子骂"收留叛徒"。人是留下了——只是账册怎么都对不上总账。', effects: { gold: -30, recruit: true, moraleAll: -3 } },
        ],
      },
      {
        text: '送走人,把"克扣抚恤"捅给军镇。',
        outcomes: [
          { weight: 8, text: '军镇立案,灰隼被罚得肉疼,公会在佣兵堆里的名声悄悄涨了一截。线人赏 60 金。', effects: { gold: 60, moraleAll: 4 } },
          { weight: 4, text: '军镇收了状子,转头把消息卖回给灰隼。副团长连夜逃去南边,临走托人留话:"黑苔,也不过如此。"', effects: { moraleAll: -4 } },
        ],
      },
      {
        text: '拒之门外,是非别沾。',
        outcomes: [
          { weight: 10, text: '他在门外的雨里站了一会儿,压低头巾走进雨幕。会长关上门时说了句"对不住"——也可能只是心里说说。', effects: { moraleAll: 2 } },
        ],
      },
    ],
  },
  {
    id: 'midwife-night',
    title: '雪夜三十金',
    text: '后半夜砸门:村里产婆难产,丈夫跪在雪里,掏出全部家当 30 金,只求有人翻山去邻镇取药——单程两个时辰,风雪没停。',
    choices: [
      {
        text: '让脚最快的去,火把多带两支。',
        outcomes: [
          { weight: 8, text: '药在鸡叫头遍前赶到了。孩子落地时的哭声,据说半个村子都听见了。30 金他们非要塞,收了。', effects: { gold: 30, moraleAll: 8, expAll: 20 } },
          { weight: 2, text: '风雪太急,取药的人在山脊上滚了一跤,药瓶碎了两支——剩下的刚好够用。人和药都到了。', effects: { gold: 30, injure: true, moraleAll: 5 } },
        ],
      },
      {
        text: '全队点起火把,护送着去。',
        outcomes: [
          { weight: 10, text: '火把在雪山上排成一条线。药到了,人也都回来了。那晚之后,"黑苔"在村里是个带着热气的词。', effects: { gold: 30, moraleAll: 5 } },
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
    text: '一个山人兜售从黑苔高塔外围捡的"碎片",说贴身戴着,夜夜梦见战死的袍泽对自己笑。碎片确实在微光里一明一暗。',
    choices: [
      {
        text: '买下来,送修道院鉴定。',
        outcomes: [
          { weight: 6, text: '长老看了一眼就用黄布裹住:"这是塔里没走完的人留下的东西。"鉴定费 20 金,换回一句"英灵安了"。', effects: { gold: -20, blessing: 2 } },
          { weight: 4, text: '碎片在祠堂过夜时哭了一宿。长老把它沉了塘,没收钱,只说"这钱留着买香"。', effects: { gold: -20, moraleAll: -4 } },
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
          { weight: 5, text: '噩梦缠了半个月,酒馆里都说会长"脸色比塔还青"。碎片最后沉了塘,50 金打了个水漂。', effects: { gold: -50, moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'harvest-hands',
    title: '收割的三天',
    text: '秋收正忙,村长来问:公会能否派几个人帮工三天?工钱微薄,但"管饭,管饱,新米酿的酒管够"。',
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
          { weight: 10, text: '村长扛着农具连声道谢。修道院听说了此事,罕见地主动送来 2 缕英灵香灰:"善行,英灵记得。"', effects: { gold: -20, blessing: 2 } },
        ],
      },
    ],
  },
  {
    id: 'plague-village',
    title: '疫病村的门',
    text: '邻村发热病蔓延。修道院征人手去隔离区协助,承诺"英灵会记得";药商同时开出高价:去收购病人家贱卖的田产地契。',
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
          { weight: 6, text: '低价吃进的田产转手赚了 140 金。只是后来路过那个村,弟兄们都不肯多看路边一眼。', effects: { gold: 140, moraleAll: -6 } },
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
    text: '一个背着半人高木箱的行脚药贩在酒馆门口支起摊子,嗓音沙哑:"行军药膏,亲测有效——便宜一半,别问来路。"木箱上爬着细小的白霜,在秋日里不化。',
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
          { weight: 3, text: '轰走药贩的当晚,有队员偷偷溜出去追他。回来时手里多了两罐正经药,和一句"他其实人不坏"。', effects: { potionHeal: 2 } },
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
          { weight: 4, text: '女人走后,守夜队员嘀咕:"下回别人有样学样怎么办?"你发现他说得对——当月仓库又少了两瓶。', effects: { potionHeal: -2, moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'frost-envoy',
    title: '白霜的信使',
    text: '一个嘴唇冻成青色的信使带来了白霜墓园的信:织法者们愿意付钱,只求公会不要再接去墓园的委托。"死者需要安静。"信纸落款处的名字,全是你葬送在那里的旧敌。',
    choices: [
      {
        text: '收钱,暂停墓园委托。',
        outcomes: [
          { weight: 6, text: '金子是真的,而且很沉。但下一个来委托扫墓的遗族,你们没脸接。', effects: { gold: 150, moraleAll: -4 } },
          { weight: 4, text: '收钱的事被酒馆传成"黑苔收了死人的封口费"。来的委托少了一半,来的目光重了一倍。', effects: { gold: 150, moraleAll: -8 } },
        ],
      },
      {
        text: '把信原样退回。佣兵不看死人的脸色。',
        outcomes: [
          { weight: 7, text: '信退回去的当夜,公会屋檐挂了一层不合时令的霜。早上化了,什么也没发生——大概。', effects: { moraleAll: 3 } },
          { weight: 3, text: '一周后,常客里最沉默的游侠不告而别,只留下一句"我不想葬在那种地方"。', effects: { moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'abyss-preacher',
    title: '渊底的传教士',
    text: '一个穿深袍的传教士在酒馆后巷布道,听众多是输光了的佣兵。他说渊底能让人"忘掉输掉的一切"。有人劝你们管管——也有人已经在问他入教的事。',
    choices: [
      {
        text: '赶人。输光的人不该输掉别的。',
        outcomes: [
          { weight: 6, text: '传教士被请走了。听讲的佣兵们骂骂咧咧,但三天后,有两个人回来问你还有没有活干。', effects: { moraleAll: 5 } },
          { weight: 4, text: '传教士临走留下一句:"主教会记住这份热情。"渊底祭坛方向的夜空,此后总有一线暗红。', effects: {} },
        ],
      },
      {
        text: '睁一只眼闭一只眼,收下他留的"香火钱"。',
        outcomes: [
          { weight: 5, text: '香火钱很厚。酒馆照常开门,只是角落里多了几个眼睛发直的人,他们后来委托时也不再多问价钱。', effects: { gold: 100, moraleAll: -4 } },
          { weight: 5, text: '香火钱很厚。但当月公会的工资桌上,有人开始把酬金分出一半"献给渊底"。', effects: { gold: 100, moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'veteran-legacy',
    title: '老兵的遗产',
    text: '一个拄拐的退役佣兵被邻居发现死在屋里。邻居说,老人临终前一直念叨"黑苔"——三十年前他在这里当过队长。他没有任何亲人。',
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
          { weight: 2, text: '老人队里活到最后的一个人找上门来,把一枚旧徽章拍在桌上:"他要是知道,会比死了更难受。"说完就走了。', effects: { moraleAll: -6 } },
        ],
      },
    ],
  },
  {
    id: 'tax-convoy',
    title: '税官的车队',
    text: '河湾村的村长找上门:税官的车队后天经过,课的是"灾年免不了"的重税。村里凑不出钱,凑得出二十个壮丁——和一份体面的报酬。',
    choices: [
      {
        text: '接下。车队在渡口"遇上山洪"。',
        outcomes: [
          { weight: 5, text: '车队折返,税册泡烂了。村长付的钱里混着嫁妆银镯,你们谁也没说破。', effects: { gold: 110, moraleAll: 6 } },
          { weight: 5, text: '车队折返,但护卫里有行家,认出了斧口的走向。镇上传言税官在攒一支讨伐队。', effects: { gold: 110, moraleAll: -3 } },
        ],
      },
      {
        text: '反过来接税官的镖:灾年是灾年,规矩是规矩。',
        outcomes: [
          { weight: 6, text: '车队平安过境。税官多付了酬金,村长在你们路过时往地上啐了一口。', effects: { gold: 80, moraleAll: -5 } },
          { weight: 4, text: '车队平安过境。一个月后税官荐来一桩肥活——护送秋税。"墙头草"的名声,有时候也值钱。', effects: { gold: 130 } },
        ],
      },
    ],
  },
  {
    id: 'mining-strike',
    title: '矿工的请愿',
    text: '锈坑矿道的矿工们联名请愿:公会一直在给"换掉他们"的裸井队做护卫。他们不求公会倒戈,只求别再接那种活。',
    choices: [
      {
        text: '答应。矿道的死人已经够多了。',
        outcomes: [
          { weight: 6, text: '矿工们凑了份子钱,还把矿道深处一条"没被掘锚啃过"的支脉画给了你们。', effects: { gold: 60, moraleAll: 6 } },
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
  },
  {
    id: 'wandering-bard',
    title: '写歌的人',
    text: '一个吟游诗人愿意为公会写一首长歌,代价是食宿一个月,"和讲真话的权利"。他说歌要是写成了,黑苔的名声能传到公国边境。',
    choices: [
      {
        text: '管吃管住,随他写。',
        outcomes: [
          { weight: 5, text: '歌写成了,连你们卖过命又被人赖账的破事都写了。奇怪的是,听过的没人嘲笑——真话有真话的分量。', effects: { gold: -40, moraleAll: 8 } },
          { weight: 5, text: '歌写成了,把某位阵亡队员唱成了"被公会辜负的英雄"。客人们听得眼眶发红,队员们听得脸色发青。', effects: { gold: -40, moraleAll: -4, expAll: 20 } },
        ],
      },
      {
        text: '付费定制:只写光荣的部分。',
        outcomes: [
          { weight: 6, text: '定制的颂歌朗朗上口,就是没什么人记第二句。名声这东西,含金量果然和价钱成正比。', effects: { gold: -70 } },
          { weight: 4, text: '诗人收了定金,写出一首完美的颂歌。临走时他说:"好的部分我写得很好。别的那部分,总会有人写的。"', effects: { gold: -70, moraleAll: -2 } },
        ],
      },
    ],
  },
  {
    id: 'snow-caravan',
    title: '雪困的商队',
    text: '急报:一支商队困在白霜墓园外的雪坡上,看守的人手被"会走路的冰雕"冲散。货主开出的救援价很高——高到说明他清楚那些冰雕是什么。',
    choices: [
      {
        text: '连夜出发。人是真的会冻死。',
        outcomes: [
          { weight: 5, text: '人救回来了,货也带回来了。货主按约付钱,还多给了一箱"路上驱寒"的药酒。', effects: { gold: 120, potionHeal: 1, moraleAll: 6 } },
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
    text: '一个采药孩子挖到一本用皮封面的书,拿到公会想换两个面包。识字的队员翻了两页就合上了:那不是经书,是"说明书"——教你如何给伤口做"不会好的包扎"。',
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
    text: '邻镇斗技场送来烫金请柬:邀请"黑苔的勇士们"参加表演赛,胜方奖金丰厚,观众就爱看真佣兵。请柬背面用小字写着:死伤自负。',
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
          { weight: 6, text: '请柬退了回去。斗技场后来办的那场,主演的是"黑苔风格的佣兵"——一群舞台武行。听说票卖得不错。', effects: { moraleAll: 3 } },
          { weight: 4, text: '请柬退了回去。年轻队员们私下嘀咕了一阵子,但下次操练,没人缺席。', effects: { expAll: 15 } },
        ],
      },
    ],
  },
  {
    id: 'great-contract',
    title: '压垮桌子的大单',
    text: '一位侯爵的管家带来一份长约:全公会整编听调三个月,扫清领地内所有"不安定因素"。报酬是一年的进项。管家补了一句:"包括那些不方便走法庭的。"',
    choices: [
      {
        text: '接。一年进项,三个月脏活,公道自在人心。',
        outcomes: [
          { weight: 4, text: '活干完了,钱货两清。只是这三个月里干的事,队员们在酒桌上换了个讲法,又换了个讲法。', effects: { gold: 220, moraleAll: -6 } },
          { weight: 6, text: '干到第二个月,队里最好的人来交辞职信:"我入这行不是为了这个。"管家催得紧,单还得干完。', effects: { gold: 160, moraleAll: -9 } },
        ],
      },
      {
        text: '拒。"不安定因素"这五个字,太像会给公会招麻烦的说法。',
        outcomes: [
          { weight: 6, text: '管家记下了拒绝,没有失态。三个月后,侯爵领地"肃清"的消息传来——接单的公会拿了钱,也拿进了墓碑一样的名声。', effects: { moraleAll: 5 } },
          { weight: 4, text: '拒绝的理由传开后,几个不安分的队员反倒觉得公会"怂了"。人心这东西,拒绝也是一种考题。', effects: { moraleAll: -3 } },
        ],
      },
    ],
  },
]
