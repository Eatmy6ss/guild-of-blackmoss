// 公会大事事件池(M1 P2,巫师 3 式:选择即取舍,结果有权重分支——没有标准答案)
// 效果键:gold 金币 / blessing 英灵祝福 / moraleAll 全员士气 / moraleRandom 随机一人士气 /
//        expAll 全员经验 / item 获得装备(baseId)/ recruit 获得一位上门候选 / injure 随机一人重伤(HP 减半)

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
          { weight: 5, text: '绑是绑了,可 everyone 都做了整晚的噩梦。天亮时个个眼窝深陷。', effects: { moraleAll: -5 } },
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
]
