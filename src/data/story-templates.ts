// A9 说书人模板(U23:人工手写+槽位,禁程序拼句;U26:事实在前,收尾可氛围但不得捏造事件/言行;全文不用代词)。
// 每类碰撞 6 条;槽位由 storyteller.ts 从账本事实填充。
// 三审状态:三审中(对照稿 docs/development/story-templates-draft-2026-10-02.md;制作人通过后改为「定稿 + 日期」)。

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
const gap = (s: StorySlots) => (s.dueDay ?? 0) - (s.choiceDay ?? 0)

export const TEMPLATES: Record<StoryType, ((s: StorySlots) => string)[]> = {
  'consequence-due': [
    (s) => `第 ${s.choiceDay} 天做下的那个决定,第 ${s.dueDay} 天找上门来——「${s.eventTitle}」。账,从来不会自己消失。`,
    (s) => `「${s.eventTitle}」。离当初那个选择过去了 ${gap(s)} 天,公会的账本上,这一笔一直没有划掉。`,
    (s) => `第 ${s.choiceDay} 天的事,看上去已经翻篇了。第 ${s.dueDay} 天,「${s.eventTitle}」证明:没有。`,
    (s) => `第 ${s.choiceDay} 天的旧账,第 ${s.dueDay} 天兑现:「${s.eventTitle}」。公会的经验是:每一个决定都会回来,带着利息。`,
    (s) => `那件事到底还是没有完。第 ${s.dueDay} 天,「${s.eventTitle}」按账本上记的日子准时抵达。`,
    (s) => `第 ${s.choiceDay} 天的那个选择,在账本里躺了 ${gap(s)} 天——直到「${s.eventTitle}」把它叫醒。`,
  ],
  'firstkill-death': [
    (s) => `${s.boss}倒在了${s.place}——${s.hero}也留在了那里。公会的旗上多了一道疤,纪念堂里多了一个名字。`,
    (s) => `首杀${s.boss}的代价,是${s.hero}的命。值不值,公会说不了话,只有酒馆的酒知道。`,
    (s) => `${s.hero}倒在了和${s.boss}的最后一仗里,没能看到${s.boss}倒下。首杀记在公会名下,名字记在纪念堂。`,
    (s) => `${s.place}这一仗,账本上只有两行:${s.boss},首杀;${s.hero},阵亡。`,
    (s) => `这一战写进了公会史:${s.boss}的首杀。也写进了纪念堂:${s.hero}的名字。`,
    (s) => `${s.boss}和${s.hero}死在了${s.place}的同一场仗里。一个进了首杀簿,一个进了纪念堂。`,
  ],
  'firstkill-fallen': [
    (s) => `${s.hero}没走到${s.boss}面前。剩下的人走到了,而且赢了——首杀${s.boss},是带着一个空位打下来的。`,
    (s) => `首杀${s.boss}的那一趟,${s.hero}已经先倒在了${s.place}更早的一段路上。名单上少了一个人,首杀簿上多了一行。`,
    (s) => `${s.place}这一趟:${s.hero}阵亡在前,${s.boss}首杀在后。两件事隔着一段路,记在同一趟远征里。`,
    (s) => `${s.boss}倒下的时候,${s.hero}不在场——${s.hero}倒在了半路上。首杀算全队的,也算没走到最后的那一个。`,
    (s) => `首杀${s.boss}记在${s.killer}名下。同一趟里,${s.hero}没能走到那一仗。`,
    (s) => `首杀${s.boss}的消息传回公会时,纪念堂里已经先多了一个名字:${s.hero}。`,
  ],
  'scar-survive': [
    (s) => `${s.hero}从${s.place}活着回来了,带回了第 ${s.nth} 条伤疤。活着回来,是这一趟最要紧的事。`,
    (s) => `疗养所的价目表上,${s.hero}多了一行字。${s.place}不赊账。`,
    (s) => `${s.hero}身上现在有 ${s.nth} 条伤疤了。名册上这个数字,没人愿意看它涨。`,
    (s) => `从${s.place}回来的人里,${s.hero}走得更慢了些,但走回来了。`,
    (s) => `${s.place}在${s.hero}身上留下了记号。公会付疗养所的账,身体付剩下的。`,
    (s) => `第 ${s.nth} 条伤疤,${s.place}给的。${s.hero}还站着,这一条先记在账上。`,
  ],
  'relic-wait': [
    (s) => `${s.hero}的遗物躺在仓库里,标着赎回的价钱。死亡有价——公会定的。`,
    (s) => `${s.place}之后,${s.hero}的装备进了待赎清单。价钱贵不贵,要看是谁来赎。`,
    (s) => `${s.hero}留下了装备,装备留下了价钱。赎,还是不赎——这个决定,留给活着的人。`,
    (s) => `纪念堂里添了${s.hero}的名字,仓库里添了${s.hero}的遗物。两样都在等公会拿主意。`,
    (s) => `${s.hero}用不上的东西,如今标着价。这就是佣兵行当:连告别都明码标价。`,
    (s) => `${s.place}收走了${s.hero},仓库收下了剩下的。价目单上写着:回忆无价,装备有价。`,
  ],
  'wish-done': [
    (s) => `${s.hero}了却了一桩心愿。公告栏没写,酒馆的酒替${s.hero}庆祝了。`,
    (s) => `名册上那行小字终于划掉了——${s.hero}的心愿,成了。`,
    (s) => `${s.hero}心里记着的那件事,这一趟做成了。佣兵的故事,不总是流血的。`,
    (s) => `心愿单上,${s.hero}那一行划掉了。士气跟着涨了一截。`,
    (s) => `${s.hero}的心愿达成了。没有围观,没有仪式,只有名册上多出来的一个勾。`,
    (s) => `有些胜利没有奖杯。${s.hero}的这一个,写在心愿单的背面。`,
  ],
  'bond-star': [
    (s) => `${s.a}和${s.b}的默契升到了${star(s)}。并肩活着回来的次数,账本都记着。`,
    (s) => `多少场仗一起活下来,才换得来这${star(s)}——${s.a}和${s.b}之间的话,可以少说几句了。`,
    (s) => `${s.a}和${s.b}的配合到了${star(s)}。敌人最先发现的,往往是这个。`,
    (s) => `${s.a}和${s.b}一起从远征里活着回来了。默契:${star(s)}。`,
    (s) => `${s.a}和${s.b}的默契到了${star(s)}。谁欠谁更多,账已经算不清了,索性不算。`,
    (s) => `默契这东西看不见摸不着,但名册上写着:${s.a}和${s.b},${star(s)}。`,
  ],
}
