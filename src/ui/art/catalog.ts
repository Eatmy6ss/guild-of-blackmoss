import credits from '../../../public/assets/CREDITS.json'
import type { Member } from '../../sim/types'
import { JOBS } from '../../data/jobs'
import { ITEM_BASES } from '../../data/items'
export { credits }
export const SPRITE_PATHS = credits.assets.filter(a => a.kind === 'sprite').map(a => a.path)
export const DOCK_ART: Record<string, string> = { roster: '/assets/layers/w-sword.png', tavern: '/assets/icons/coins.png', warehouse: '/assets/icons/armor.png', base: '/assets/props/column.png', chronicle: '/assets/icons/book.png', memorial: '/assets/props/statue.png', manual: '/assets/icons/book.png', statistics: '/assets/icons/coins.png' }
const layer = (name: string) => `/assets/layers/${name}.png`
export type Appearance = Pick<Member, 'job'> & Partial<Pick<Member, 'id' | 'race' | 'spec' | 'equipment'>>
interface Outfit { armor: string; cloak: string; weapon: string; head: string; offhand?: string; motif: string }
// 头部与副手是专精标志；实际装备只覆盖对应槽位，不靠叠两把武器保留身份。
export const SPEC_OUTFITS: Record<string, Outfit> = {
  'guard-ironwall': { armor: 'body_plate_and_cloth', cloak: 'cloak_blue', weapon: 'long_sword', head: 'fhelm_gray_3', offhand: 'lshield_green', motif: '桶盔 · 塔盾 · 戍卫战袍' },
  'guard-thorns': { armor: 'body_dragon_armor_green', cloak: 'cloak_green', weapon: 'held_black_sword', head: 'fhelm_horn_2', offhand: 'shield_spriggan', motif: '角盔 · 棘盾 · 层叠鳞甲' },
  'priest-holy': { armor: 'body_robe_white_2', cloak: 'cloak_brown', weapon: 'held_scepter', head: 'healer', motif: '祭冠 · 圣杖 · 白麻长袍' },
  'priest-discipline': { armor: 'body_robe_white_red', cloak: 'cloak_black', weapon: 'held_tidebook', head: 'hood_white', motif: '兜帽 · 诫命书 · 赤纹祭衣' },
  'ranger-hawk': { armor: 'body_leather_heavy', cloak: 'cloak_green', weapon: 'held_great_bow', head: 'feather_green', motif: '羽帽 · 长弓 · 皮革猎装' },
  'ranger-beastmaster': { armor: 'body_animal_skin', cloak: 'cloak_brown', weapon: 'hand_crossbow', head: 'bear', motif: '兽首披 · 猎弩 · 毛皮肩襟' },
  'warrior-weapons': { armor: 'body_plate_black', cloak: 'cloak_red', weapon: 'held_great_sword', head: 'bandana_ybrown', motif: '束额 · 重剑 · 黑铁肩甲' },
  'warrior-vanguard': { armor: 'body_half_plate_3', cloak: 'cloak_red', weapon: 'held_sabre', head: 'helm_plume', motif: '红羽冠 · 军刀 · 短战披' },
  'mage-fire': { armor: 'body_robe_red_gold', cloak: 'cloak_brown', weapon: 'held_fire_red', head: 'wizard_red', motif: '折尖帽 · 火种 · 铜纹法袍' },
  'mage-frost': { armor: 'body_robe_blue_white', cloak: 'cloak_cyan', weapon: 'held_crystal', head: 'blue_horn_gold', motif: '霜冠 · 冰晶 · 垂地长袍' },
  'warlock-demon': { armor: 'body_robe_black_red', cloak: 'cloak_black', weapon: 'held_soulbook', head: 'horn_evil', motif: '双角冠 · 契约书 · 暗红祭衣' },
  'warlock-affliction': { armor: 'body_robe_of_night', cloak: 'cloak_black', weapon: 'held_staff_evil', head: 'hood_black_2', motif: '深兜帽 · 咒杖 · 夜色裹布' },
}
const BODY_BY_RACE: Record<string, string> = { human: 'human_m', dwarf: 'base_dwarf', elf: 'base_elf', bloodelf: 'base_elf', orc: 'base_orc', undead: 'base_undead' }
// 稳定的装备ID绑定。未知装备保留职业装束；新装备必须显式登记，不猜中文名称。
export const WEAPON_LAYERS: Record<string, string> = {
  'wpn-t1-sword': 'long_sword', 'wpn-t1-axe': 'hand_axe', 'wpn-t1-dagger': 'hand_dagger',
  'wpn-t2-bow': 'bow', 'wpn-t2-crossbow': 'hand_crossbow', 'wpn-t2-staff': 'quarterstaff',
  'wpn-t2-greatsword': 'hand_greatsword', 'wpn-t3-katana': 'held_katana', 'wpn-t3-rapier': 'held_rapier',
  'wpn-line-guard': 'held_black_sword', 'wpn-line-priest': 'held_scepter', 'wpn-line-ranger': 'held_bow_2',
  'wpn-line-warrior': 'held_axe_blood', 'wpn-line-mage': 'held_orb', 'wpn-line-warlock': 'held_soulbook',
  'wpn-dragon-brand': 'held_black_sword',
  'wpn-sign-warbrand': 'held_sabre', 'wpn-sign-bloodletter': 'hand_dagger',
  'wpn-t3-dawn': 'held_blessed_blade', 'wpn-t3-tide': 'held_tidebook', 'wpn-t3-gale': 'held_great_bow',
  'wpn-t3-ember': 'held_fire_red', 'wpn-t3-vox': 'held_staff_fancy',
}
export const ARMOR_LAYERS: Record<string, string> = {
  'arm-t1-mail': 'chainmail', 'arm-t1-leather': 'leather', 'arm-t2-plate': 'plate',
  'arm-t2-chain': 'chainmail', 'arm-t2-robe': 'robe_blue', 'arm-t2-bulwark': 'plate',
  'arm-line-guard': 'body_bplate_green', 'arm-line-priest': 'body_robe_white_2', 'arm-line-ranger': 'body_leather_green',
  'arm-line-warrior': 'body_plate_black', 'arm-line-mage': 'body_robe_blue_white', 'arm-line-warlock': 'body_robe_black_red',
  'arm-sign-minershell': 'body_half_plate_3', 'arm-sign-thornmail': 'body_dragon_armor_green', 'arm-dragon-scalemail': 'body_dragon_scale_gold_new',
  'arm-t3-bulwark': 'body_plate_and_cloth', 'arm-t3-drake': 'body_dragon_armor_gold_new', 'arm-t3-whisper': 'body_robe_black_hood', 'arm-t3-gale': 'body_leather_metal',
}
export function heroLayers(member: Appearance): string[] {
  const job = JOBS[member.job] ?? JOBS.guard
  const outfit = SPEC_OUTFITS[member.spec && job.specs[member.spec] ? member.spec : job.defaultSpec]
  const armor = ARMOR_LAYERS[member.equipment?.armor?.baseId ?? ''] ?? outfit.armor
  const weapon = WEAPON_LAYERS[member.equipment?.weapon?.baseId ?? ''] ?? outfit.weapon
  const race = member.race ?? 'human'
  return [
    layer(BODY_BY_RACE[race] ?? 'human_m'), layer(outfit.cloak),
    layer('pants'), layer('boots'), layer(armor),
    ...(race === 'undead' ? [] : [layer(race === 'bloodelf' ? 'hair_bloodelf' : race === 'elf' ? 'hair_elf' : 'hair_brown')]),
    layer('head_' + outfit.head),
    ...(outfit.offhand ? [layer('off_' + outfit.offhand)] : []), layer(weapon),
  ]
}
export function itemIcon(baseId: string, slot: string): string {
  if (ITEM_BASES[baseId]?.slot === slot) return '/assets/equipment/' + baseId + '.png'
  if (slot === 'weapon') return layer('w-sword')
  if (slot === 'armor') return '/assets/icons/armor.png'
  return '/assets/icons/ring.png'
}
export interface SceneArt {
  name: string; floor: string; wall: string; accent: string; sky: string
  props: string[]; motif: 'grove' | 'ruins' | 'hall' | 'ridge'; atmosphere: 'dust' | 'snow' | 'ember'
}
const scene = (name: string, floor: string, wall: string, accent: string, sky: string, props: string[], motif: SceneArt['motif'], atmosphere: SceneArt['atmosphere'] = 'dust'): SceneArt => ({ name, floor: `/assets/tiles/floor-${floor}.png`, wall: `/assets/tiles/wall-${wall}.png`, accent, sky, props: props.map(p => `/assets/props/${p}.png`), motif, atmosphere })
export const SCENE_ART: Record<string, SceneArt> = {
  blackmoss: scene('黑苔沼泽', 'swamp', 'gray', '#61724a', '#263527', ['tree', 'column'], 'grove'),
  rustmine: scene('锈坑矿道', 'pebble2', 'gray', '#b88b60', '#241b17', ['torch', 'gate'], 'hall'),
  ashfield: scene('灰烬旧战场', 'ash', 'brick', '#be6550', '#403025', ['autumn_tree', 'column'], 'ruins'),
  frostgrave: scene('白霜墓园', 'ice', 'gray', '#a5c2c7', '#283a48', ['statue', 'column'], 'ruins', 'snow'),
  abyssaltar: scene('渊底祭坛', 'cobalt', 'gray', '#997187', '#422632', ['altar', 'statue'], 'hall'),
  thornhold: scene('荆棘要塞', 'pebble', 'brick', '#c39e56', '#403025', ['gate', 'torch'], 'hall'),
  emberpass: scene('烬石隘口', 'ash', 'gray', '#dd9563', '#624635', ['column', 'autumn_tree'], 'ridge'),
  scalehaven: scene('鳞音圣地带', 'cobalt', 'brick', '#dcba87', '#283a48', ['altar', 'torch'], 'hall'),
  fireridge: scene('火脊巢穴', 'lava2', 'gray', '#be6550', '#512b27', ['red_tree', 'column'], 'ridge', 'ember'),
  'pilgrim-path': scene('朝圣者古道', 'ice', 'brick', '#69919c', '#405f71', ['column', 'statue'], 'ridge', 'snow'),
  'forge-works': scene('熔铸工坊', 'pebble2', 'brick', '#edc47b', '#512b27', ['torch', 'gate'], 'hall', 'ember'),
  dragonmaw: scene('龙渊之心', 'lava', 'gray', '#be6550', '#422632', ['altar', 'column'], 'ruins', 'ember'),
  tower: scene('黑苔高塔', 'pebble2', 'gray', '#69919c', '#202426', ['column', 'torch'], 'hall'),
}
const LEGACY_SCENES: Record<string, string> = { default: 'blackmoss', swamp: 'blackmoss', mine: 'rustmine', ash: 'ashfield', frost: 'frostgrave', abyss: 'abyssaltar', thorn: 'thornhold', heat: 'fireridge' }
export function sceneArt(id: string): SceneArt { return SCENE_ART[id] ?? SCENE_ART[LEGACY_SCENES[id]] ?? SCENE_ART.blackmoss }
export type MusicMood = 'hub' | 'battle' | 'boss' | 'cavern' | 'mourning'
export const MUSIC: Record<MusicMood, { path: string; title: string; loop: boolean }> = {
  hub: { path: '/assets/audio/music/hub.ogg', title: 'Dark Forest Theme', loop: true },
  battle: { path: '/assets/audio/music/battle.ogg', title: 'Battle Theme A', loop: true },
  boss: { path: '/assets/audio/music/boss.ogg', title: 'Epic Boss Battle', loop: true },
  cavern: { path: '/assets/audio/music/cavern.ogg', title: 'Dark Cavern Ambient', loop: true },
  mourning: { path: '/assets/audio/music/mourning.ogg', title: 'What is Left', loop: false },
}
