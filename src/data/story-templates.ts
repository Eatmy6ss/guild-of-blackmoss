// A9 说书人模板(U23:人工手写+槽位,禁程序拼句;U26:事实在前,收尾可氛围但不得捏造事件/言行;全文不用代词)。
// 2026-10-03 制作人三审修订:全量改写为黑魂式笔触——短句、留白、迷雾与疲惫感;
// 禁用「账/旧账/兑现/利息」类记账比喻;不解释因果链,只留回声。
// 三审状态:三审中(按制作人口味改写,待复核;通过后改为「定稿 + 日期」)。

export type StoryType =
  | 'consequence-due'
  | 'firstkill-death'
  | 'firstkill-fallen'
  | 'scar-survive'
  | 'relic-wait'
  | 'wish-done'
  | 'bond-star'

export interface StorySlots {
  /** 找上门的那一幕标题(已去「第X幕·」前缀) */
  eventTitle?: string
  choiceDay?: number
  dueDay?: number
  boss?: string
  place?: string
  hero?: string
  /** 首杀记名者(第一名存活者,不一定是出手的人——模板只写其生还) */
  killer?: string
  a?: string
  b?: string
  /** 默契星数(1 或 3,见 U26 门槛) */
  stars?: number
  /** 本人第几条伤疤(含新增) */
  nth?: number
}

const star = (s: StorySlots) => '★'.repeat(s.stars ?? 1)

export const TEMPLATES: Record<StoryType, ((s: StorySlots) => string)[]> = {
  'consequence-due': [
    (s) => `第 ${s.choiceDay} 天留下的那个决定,第 ${s.dueDay} 天睁开了眼睛。「${s.eventTitle}」——旧事如雾,散得慢,回来得快。`,
    (s) => `「${s.eventTitle}」。那一天的选择没有走远,只是沉在看不见的地方。这一天,水面动了。`,
    (s) => `有些事不会结束。它们只是睡着。第 ${s.dueDay} 天,「${s.eventTitle}」睡醒了。`,
    (s) => `第 ${s.choiceDay} 天种下的东西,第 ${s.dueDay} 天发了芽。「${s.eventTitle}」——谁也说不清,这是不是注定。`,
    (s) => `那一天的选择很轻。落下来的时候,很重。「${s.eventTitle}」,第 ${s.dueDay} 天。`,
    (s) => `旧事有回声。第 ${s.choiceDay} 天的回声,第 ${s.dueDay} 天才抵达——「${s.eventTitle}」。`,
  ],
  'firstkill-death': [
    (s) => `${s.boss}倒在${s.place}。${s.hero}也是。首杀的名声会传得很远;丧钟不会。`,
    (s) => `那一仗之后,${s.place}安静了下来。${s.boss}死了。${s.hero}也是。名册把两件事记在同一页。`,
    (s) => `胜利的记录里写着${s.boss}。没写出来的那部分,是${s.hero}。`,
    (s) => `${s.hero}与${s.boss},同一场仗,同一个结局。一个成了首杀,一个成了纪念堂里的一行。`,
    (s) => `首杀${s.boss}。代价记在纪念堂:${s.hero},不归队。`,
    (s) => `${s.place}的雾散了。${s.boss}与${s.hero}都没有回来。`,
  ],
  'firstkill-fallen': [
    (s) => `${s.hero}没能走到${s.boss}面前。首杀还是拿下了——只是那份荣耀里,有一个再也补不上的空位。`,
    (s) => `${s.boss}倒在远征的尽头。${s.hero}倒在半路上。同一趟远征,两个方向。`,
    (s) => `首杀${s.boss}的消息回到公会时,${s.hero}的名字已经先一步进了纪念堂。`,
    (s) => `去${s.place}的路很长。${s.hero}停在了中途;剩下的人,把${s.boss}的名字带了回来。`,
    (s) => `记名的是${s.killer}。但那一趟远征,是从${s.hero}还在的时候开始的。`,
    (s) => `${s.hero}先走了一步。剩下的路由剩下的人走完——${s.boss}的首杀,写给全队,也写给${s.hero}。`,
  ],
  'scar-survive': [
    (s) => `${s.hero}从${s.place}回来了。第 ${s.nth} 条伤疤,跟着一起回来的。`,
    (s) => `${s.place}留下了记号。第 ${s.nth} 条。疗养所已经认识${s.hero}的名字了。`,
    (s) => `伤疤不会说话。第 ${s.nth} 条落在${s.hero}身上,安静得像从来没有发生过。`,
    (s) => `${s.hero}回来了。慢了一些,沉了一些。${s.place}的雾,也跟着带回来了一点。`,
    (s) => `第 ${s.nth} 条伤疤落在${s.hero}身上。名册替着记下了;别处,无人提起。`,
    (s) => `${s.place}给每个人的东西不一样。${s.hero}拿到的是第 ${s.nth} 条伤疤,和一条命。`,
  ],
  'relic-wait': [
    (s) => `${s.hero}的遗物在仓库里等。等一个赎回的名字。或者,不再有人来。`,
    (s) => `${s.place}之后,${s.hero}的东西归了仓库。价签,是后来才写上去的。`,
    (s) => `赎回,或者不赎。${s.hero}的遗物不着急——它们已经等过一场死亡了。`,
    (s) => `纪念堂里多了一个名字。仓库里,多了${s.hero}留下的重量。`,
    (s) => `${s.place}收走人,仓库收下物。中间隔着一张赎回的价目。`,
    (s) => `${s.hero}的遗物安静地躺着。像还在等主人回来,把它们穿戴整齐。`,
  ],
  'wish-done': [
    (s) => `${s.hero}了却了一桩心愿。这件事没有惊动任何人——只有名册,轻轻划了一笔。`,
    (s) => `心愿这种东西,说出来就轻了。${s.hero}的那一个,是做完了才被看见的。`,
    (s) => `${s.hero}的心愿,成了。远征与远征的间隙里,这一点微光也算数。`,
    (s) => `名册上划掉了一行字。那是${s.hero}记了很久的事。`,
    (s) => `${s.hero}的愿望很小,小得没有人注意。这一天,它完成了。`,
    (s) => `佣兵的一生里,总有几件比生死更执着的小事。${s.hero}的那一件,了了。`,
  ],
  'bond-star': [
    (s) => `${s.a}与${s.b}之间,多了一道看不见的线。${star(s)}——名册是这样记的。`,
    (s) => `一起从雾里活着回来的人,影子会挨得很近。${s.a}与${s.b},${star(s)}。`,
    (s) => `${s.a}和${s.b}的默契到了${star(s)}。不需要言语,也不需要理由。`,
    (s) => `有些羁绊在酒馆里结下,有些在濒死的喘息里。${s.a}与${s.b}的,${star(s)}。`,
    (s) => `${s.a}与${s.b}。两束火光照进同一片黑暗——默契,到了${star(s)}。`,
    (s) => `名册用${star(s)}记录${s.a}与${s.b}。数字很轻。分量很重。`,
  ],
}
