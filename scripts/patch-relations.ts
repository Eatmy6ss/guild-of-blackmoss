// K05 关系表数据补丁(2026-09-25,U13):12 图 routeRelations 边列表,插在各图 routeNodes 块之后
// 边列表格式与未来固定地图(C)的连边同构,升级零迁移。一次执行后删除。
import fs from 'node:fs'

const REL = {
  blackmoss: [
    ['bm-frogs', 'bm-leeches'], // 蛙人与水蛭抢地盘
    ['bm-frogs', 'bm-quirrel'], // 蛙人会合狼群设伏
    ['bm-wolves', 'bm-quirrel'], // 狼群会合
    ['bm-hut', 'bm-mire'], // 棚屋在沼腹深处
    ['bm-frogs', 'bm-chest'], // 沉船被蛙人盘踞
    ['bm-camp', 'bm-leeches'], // 药贩爱在水蛭边采药
  ],
  rustmine: [
    ['rm-miners', 'rm-spiders'], // 矿道共生
    ['rm-bats', 'rm-deepvein'], // 蝙蝠栖深脉
    ['rm-cart', 'rm-miners'], // 矿车轨道旁
    ['rm-echo', 'rm-deepvein'], // 回声来自深脉
    ['rm-bats', 'rm-batmix'], // 会合
    ['rm-miners', 'rm-batmix'], // 会合
  ],
  ashfield: [
    ['af-skeletons', 'af-funeral'], // 旧葬场
    ['af-wraiths', 'af-bonemix'], // 会合
    ['af-knights', 'af-bonemix'], // 会合
    ['af-camp', 'af-funeral'], // 营地办丧
    ['af-knights', 'af-relic'], // 遗物出自骑士
  ],
  frostgrave: [
    ['fg-wights', 'fg-gravers'], // 墓卫守掘墓人
    ['fg-wolves', 'fg-frostmix'], // 会合
    ['fg-gravers', 'fg-icetomb'], // 冰棺在墓区深处
    ['fg-altar', 'fg-tent'], // 祭坛与营地都在外围
    ['fg-frostmix', 'fg-icetomb'], // 深处会合
  ],
  abyssaltar: [
    ['ab-cultists', 'ab-bloodfeast'], // 血祭场
    ['ab-ghouls', 'ab-abyssmix'], // 会合
    ['ab-eyes', 'ab-whisper'], // 观渊之眼的低语
    ['ab-stone', 'ab-abyssmix'], // 石碑旁混编
    ['ab-relic', 'ab-bloodfeast'], // 祭器出自血祭
  ],
  thornhold: [
    ['th-swords', 'th-siege'], // 刀盾守城门
    ['th-heavies', 'th-vanguard2'], // 重斧与亲卫
    ['th-yard', 'th-siege'], // 校场近城门
    ['th-armory', 'th-heavies'], // 军械库养重斧
    ['th-deserter', 'th-swords'], // 逃兵来自刀盾
  ],
  emberpass: [
    ['ep-sentinels', 'ep-camp'], // 哨卡沿线
    ['ep-shrine', 'ep-rest'], // 圣龛旁歇脚
    ['ep-sentinels', 'ep-cache'], // 哨卡守着货
  ],
  scalehaven: [
    ['sh-avenue', 'sh-choir'], // 大道咏唱
    ['sh-alms', 'sh-rest'], // 施舍处近歇脚
    ['sh-choir', 'sh-relic'], // 咏唱护圣物
  ],
  fireridge: [
    ['fr-ledges', 'fr-nest'], // 崖壁通巢
    ['fr-eggs', 'fr-nest'], // 蛋在巢中
    ['fr-rest', 'fr-cache'], // 歇脚近货箱
  ],
  forge_works: [
    ['fo-hall', 'fo-ember'], // 大厅炉火
    ['fo-mold', 'fo-ember'], // 铸模近炉
    ['fo-hall', 'fo-vault'], // 库房连大厅
  ],
  'pilgrim-path': [
    ['pp-lanterns', 'pp-shrine'], // 灯柱引路至龛
    ['pp-hunt', 'pp-lanterns'], // 猎手守灯
    ['pp-shrine', 'pp-offering'], // 龛收供奉
  ],
  dragonmaw: [
    ['dm-vanguard', 'dm-final'], // 前卫接精锐
    ['dm-altar', 'dm-rest'], // 祭坛旁歇脚
    ['dm-elite', 'dm-treasure'], // 精锐守宝
  ],
}

// forge-works 的数据 key 是 'forge-works'(上面写错为下划线,修正)
REL['forge-works'] = REL.forge_works
delete REL.forge_works

for (const [file, keys] of [
  ['../src/data/dungeons.ts', ['blackmoss', 'rustmine', 'ashfield', 'frostgrave', 'abyssaltar', 'thornhold']],
  ['../src/data/dungeons-r2.ts', ['emberpass', 'scalehaven', 'fireridge', 'forge-works', 'pilgrim-path', 'dragonmaw']],
] as [string, string[]][]) {
  const p = new URL(file, "file:///Users/a1-6/.zcode/workspace/default/guild-game/")
  let s = fs.readFileSync(p, 'utf8')
  for (const key of keys) {
    if (s.includes(`routeRelations`)) break // 已注入过(整文件级幂等)
    // 锚点:该图 routeNodes 块的收尾 "  ],\n  encounters:"
    const idAnchor = `id: '${key}',`
    const idIdx = s.indexOf(idAnchor)
    if (idIdx < 0) { console.log(`SKIP ${key}(锚点未找到)`); continue }
    const encIdx = s.indexOf('  encounters: [', idIdx)
    if (encIdx < 0) { console.log(`SKIP ${key}(encounters 未找到)`); continue }
    const rel = REL[key] ?? []
    const relText = `  routeRelations: [\n${rel.map(([a, b]) => `    ['${a}', '${b}'],`).join('\n')}\n  ],\n`
    s = s.slice(0, encIdx) + relText + s.slice(encIdx)
    console.log(`✓ ${key}: ${rel.length} 条边`)
  }
  fs.writeFileSync(p, s)
}
console.log('done')
