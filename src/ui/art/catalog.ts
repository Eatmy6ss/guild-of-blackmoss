import credits from '../../../public/assets/CREDITS.json'
import type { JobId, Member } from '../../sim/types'
export { credits }
export const SPRITE_PATHS = credits.assets.filter(a => a.kind === 'sprite').map(a => a.path)
export const DOCK_ART: Record<string, string> = { roster: '/assets/layers/w-sword.png', tavern: '/assets/icons/coins.png', warehouse: '/assets/icons/armor.png', base: '/assets/props/column.png', chronicle: '/assets/icons/book.png', memorial: '/assets/props/statue.png', manual: '/assets/icons/book.png', statistics: '/assets/icons/coins.png' }
const layer = (name: string) => `/assets/layers/${name}.png`
export type Appearance = Pick<Member, 'job'> & Partial<Pick<Member, 'id' | 'race' | 'equipment'>>
const JOB_OUTFITS: Record<JobId, { armor: string; cloak: string; weapon: string }> = {
  guard: { armor: 'chainmail', cloak: 'cloak_blue', weapon: 'long_sword' },
  priest: { armor: 'robe_white', cloak: 'cloak_brown', weapon: 'quarterstaff' },
  ranger: { armor: 'leather', cloak: 'cloak_green', weapon: 'bow' },
  warrior: { armor: 'plate', cloak: 'cloak_red', weapon: 'hand_axe' },
  mage: { armor: 'robe_blue', cloak: 'cloak_cyan', weapon: 'hand_mage' },
  warlock: { armor: 'robe_black', cloak: 'cloak_black', weapon: 'hand_warlock' },
}
const BODY_BY_RACE: Record<string, string> = { human: 'human_m', dwarf: 'base_dwarf', elf: 'base_elf', bloodelf: 'base_elf', orc: 'base_orc', undead: 'base_undead' }
// 稳定的装备ID绑定。未知装备保留职业装束；新装备必须显式登记，不猜中文名称。
export const WEAPON_LAYERS: Record<string, string> = {
  'wpn-t1-sword': 'long_sword', 'wpn-t1-axe': 'hand_axe', 'wpn-t1-dagger': 'hand_dagger',
  'wpn-t2-bow': 'bow', 'wpn-t2-crossbow': 'hand_crossbow', 'wpn-t2-staff': 'quarterstaff',
  'wpn-t2-greatsword': 'hand_greatsword', 'wpn-t3-katana': 'hand_greatsword', 'wpn-t3-rapier': 'long_sword',
  'wpn-line-guard': 'long_sword', 'wpn-line-priest': 'quarterstaff', 'wpn-line-ranger': 'bow',
  'wpn-line-warrior': 'hand_axe', 'wpn-line-mage': 'hand_mage', 'wpn-line-warlock': 'hand_warlock',
  'wpn-dragon-brand': 'hand_greatsword',
  'wpn-sign-warbrand': 'long_sword', 'wpn-sign-bloodletter': 'hand_dagger',
  'wpn-t3-dawn': 'hand_greatsword', 'wpn-t3-tide': 'quarterstaff', 'wpn-t3-gale': 'bow',
  'wpn-t3-ember': 'hand_mage', 'wpn-t3-vox': 'hand_warlock',
}
export const ARMOR_LAYERS: Record<string, string> = {
  'arm-t1-mail': 'chainmail', 'arm-t1-leather': 'leather', 'arm-t2-plate': 'plate',
  'arm-t2-chain': 'chainmail', 'arm-t2-robe': 'robe_blue', 'arm-t2-bulwark': 'plate',
  'arm-line-guard': 'plate', 'arm-line-priest': 'robe_white', 'arm-line-ranger': 'leather',
  'arm-line-warrior': 'plate', 'arm-line-mage': 'robe_blue', 'arm-line-warlock': 'robe_black',
  'arm-sign-minershell': 'plate', 'arm-sign-thornmail': 'chainmail', 'arm-dragon-scalemail': 'chainmail',
  'arm-t3-bulwark': 'plate', 'arm-t3-drake': 'chainmail', 'arm-t3-whisper': 'robe_black', 'arm-t3-gale': 'leather',
}
export function heroLayers(member: Appearance): string[] {
  const outfit = JOB_OUTFITS[member.job] ?? JOB_OUTFITS.guard
  const armor = ARMOR_LAYERS[member.equipment?.armor?.baseId ?? ''] ?? outfit.armor
  const weapon = WEAPON_LAYERS[member.equipment?.weapon?.baseId ?? ''] ?? outfit.weapon
  const race = member.race ?? 'human'
  return [
    layer(BODY_BY_RACE[race] ?? 'human_m'), layer(race === 'bloodelf' ? 'cloak_red' : outfit.cloak),
    layer('pants'), layer('boots'), layer(armor),
    ...(race === 'undead' ? [] : [layer(race === 'elf' || race === 'bloodelf' ? 'hair_elf' : 'hair_brown')]),
    ...(member.job === 'guard' ? [layer('buckler')] : []), layer(weapon),
  ]
}
export function itemIcon(baseId: string, slot: string): string {
  const weapon = WEAPON_LAYERS[baseId] ?? 'long_sword'
  const icons: Record<string, string> = { bow: 'w-bow', hand_crossbow: 'w-bow', hand_axe: 'w-axe', hand_dagger: 'w-dagger', hand_greatsword: 'w-sword', hand_mage: 'w-staff', hand_warlock: 'w-staff', quarterstaff: 'w-staff', long_sword: 'w-sword' }
  if (slot === 'weapon') return layer(icons[weapon])
  if (slot === 'armor') return layer(ARMOR_LAYERS[baseId] ?? 'chainmail')
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
