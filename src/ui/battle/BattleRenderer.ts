import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture } from 'pixi.js'
import { pixelTexture, spriteKeyFor, tryGetTex, cache_get, preloadUrlSprites } from './pixelSprites'
import { sfxHit, sfxCrit, sfxDeath, sfxTelegraph, sfxInterrupt, sfxGuard, sfxSlam, sfxEnrage } from '../audio'
import type { BattleEvent, BattleState, Combatant } from '../../sim/types'
import { TICK_MS } from '../../sim/combat'
import { heroLayers, sceneArt, type Appearance } from '../art/catalog'
import { battleLayout } from '../art/battleLayout'
import { paintScene } from '../art/scene'

// 演出层（D5-6）：模拟是唯一事实源，这里只消费 BattleState + BattleEvent 播动画。
// 共享素材清单负责地图与人物外观；动画只改变演出，不回写模拟。


const COL = {
  guildTank: 0x5a8fd4,
  guildHealer: 0xd9d9d9,
  guildDps: 0x6dbf6d,
  enemy: 0xc05a5a,
  hpGuild: 0x4f9d5d,
  hpEnemy: 0xb05252,
  dmgNormal: 0xf1f1f1,
  dmgCrit: 0xffa94d,
  heal: 0x7fd48f,
  projectileGuild: 0x9fc48f,
  projectileEnemy: 0xd98f8f,
}

interface Slot {
  x: number
  y: number
}

interface Effect {
  update(dtMs: number): boolean
}

/** 重要性分级（game-feel：juice 与事件重要性成比例） */
type JuiceTier = 'small' | 'medium' | 'large'

const TRAUMA_BY_TIER: Record<JuiceTier, number> = {
  small: 0, // 普通打击：飘字+形变足够，不震
  medium: 0.25, // 暴击
  large: 0.45, // 死亡（boss 机制 D8-9 用更大档）
}

function unitColor(c: Combatant): number {
  if (c.team === 'enemy') return COL.enemy
  if (c.role === 'tank') return COL.guildTank
  if (c.role === 'healer') return COL.guildHealer
  return COL.guildDps
}

class UnitView {
  container = new Container()
  slot: Slot
  baseScale: number
  /** 动画占用计数（突进/形变/倒地可叠加，全部结束才恢复回位插值） */
  lockCount = 0
  body: Sprite
  /** 分层精灵组(素材包职业分层);bob/tint 作用于整组 */
  bodyGroup = new Container()
  bodySprites: Sprite[] = []
  bobPhase: number
  private hpTrack = new Container()
  bodyScale = 2
  /** 素材帧待就绪替换:非空且 tryGetTex 命中时,替换占位纹理 */
  texKey: string | null = null
  nameText: Text
  /** 单位被点击（指挥台：点击敌人 = 集火） */
  onClick?: (c: Combatant) => void
  private hpFill: Graphics
  private hpColor: number

  private appearanceKey = ''
  constructor(public combatant: Combatant, x: number, y: number, urls?: string[], bodyScale = 2, labelChars = 10, spriteOverride?: string) {
    this.slot = { x, y }
    this.hpColor = combatant.team === 'guild' ? COL.hpGuild : COL.hpEnemy
    this.baseScale = 1

    // M1 演出验证:像素精灵(换皮只换 pixelSprites.ts 的像素图与调色板)
    // 素材包分层(DCSS):职业/龙裔怪为多层叠加(32×32 同网格);其余单精灵
    const bodyKey = spriteOverride ?? spriteKeyFor(combatant)
    const layers = urls?.filter(url => cache_get(url))
    this.bodyScale = bodyScale
    const bodyGroup = new Container()
    bodyGroup.position.set(0, 6)
    const bodySprites: Sprite[] = []
    if (layers?.length) {
      for (const url of layers) {
        const s = new Sprite(pixelTexture(url))
        s.anchor.set(0.5, 1)
        s.scale.set(bodyScale)
        bodyGroup.addChild(s)
        bodySprites.push(s)
      }
    } else {
      const s = new Sprite(tryGetTex(bodyKey) ?? pixelTexture(combatant.team === 'enemy' ? 'ogre' : 'guard'))
      s.anchor.set(0.5, 1)
      s.scale.set(bodyScale)
      bodyGroup.addChild(s)
      bodySprites.push(s)
    }
    const body = bodySprites[0]
    if (!layers?.length && !tryGetTex(bodyKey)) this.texKey = bodyKey // 占位中,加载完成后自愈替换
    this.bodyGroup = bodyGroup
    this.bodySprites = bodySprites
    this.appearanceKey = urls?.join('|') ?? ''
    this.body = body
    this.bobPhase = Math.random() /* presentation-only */ * Math.PI * 2
    const hpBg = new Graphics()
    hpBg.rect(-22, 0, 44, 5).fill(0x121416)
    this.hpFill = new Graphics()
    const nameText = new Text({
      text: combatant.name.length > labelChars ? combatant.name.slice(0, labelChars) + '…' : combatant.name,
      style: { fontFamily: 'Fusion Pixel 12px Proportional SC', fontSize: 12, fill: 0xf4edcf },
    })
    nameText.anchor.set(0.5)
    nameText.position.set(0, -32 * bodyScale - 18)
    this.nameText = nameText

    this.hpTrack.addChild(hpBg, this.hpFill)
    this.hpTrack.y = -32 * bodyScale - 9
    this.container.addChild(bodyGroup, this.hpTrack, nameText)
    this.container.position.set(x, y)
    this.container.scale.set(this.baseScale)
    this.updateHp(1)
    // 点击集火（D8-9 指挥台）：显式命中区覆盖整个人形，
    // 不依赖 Graphics 几何（腿间空隙会让原点点击落空）
    this.container.eventMode = 'static'
    this.container.cursor = combatant.team === 'enemy' ? 'pointer' : 'default'
    this.container.hitArea = new Rectangle(-Math.max(22, 16 * bodyScale), -32 * bodyScale - 26, Math.max(44, 32 * bodyScale), 32 * bodyScale + 34)
    this.container.on('pointerdown', () => this.onClick?.(this.combatant))
    if (!combatant.alive) {
      this.settleFall()
      this.container.y += 6
    }
  }

  settleFall(): void {
    this.bodyGroup.tint = 0x798582
    this.container.rotation = Math.PI / 2 * (this.combatant.team === 'enemy' ? -1 : 1)
    this.container.alpha = .35
    this.hpTrack.visible = false
    this.nameText.visible = false
    this.container.eventMode = 'none'
  }

  resize(bodyScale: number, labelChars: number): void {
    this.bodyScale = bodyScale
    for (const sprite of this.bodySprites) sprite.scale.set(bodyScale)
    this.nameText.y = -32 * bodyScale - 18
    this.nameText.text = this.combatant.name.length > labelChars ? this.combatant.name.slice(0, labelChars) + '…' : this.combatant.name
    this.hpTrack.y = -32 * bodyScale - 9
    this.container.hitArea = new Rectangle(-Math.max(22, 16 * bodyScale), -32 * bodyScale - 26, Math.max(44, 32 * bodyScale), 32 * bodyScale + 34)
  }

  updateAppearance(urls: string[]): void {
    const key = urls.join('|')
    if (key === this.appearanceKey) return
    const available = urls.flatMap(url => { const texture = cache_get(url); return texture ? [texture] : [] })
    if (!available.length) return
    this.appearanceKey = key
    this.bodyGroup.removeChildren().forEach(child => child.destroy())
    this.bodySprites = available.map(texture => {
      const sprite = new Sprite(texture)
      sprite.anchor.set(.5, 1); sprite.scale.set(this.bodyScale)
      this.bodyGroup.addChild(sprite); return sprite
    })
    this.body = this.bodySprites[0]; this.texKey = null
  }

  /** 近战突进冲量(试玩反馈④:攻击节奏可见)——靠回位插值的弹簧自然收回 */
  lungeTo(target: UnitView): void {
    const dx = target.slot.x - this.slot.x
    const dy = target.slot.y - this.slot.y
    const len = Math.max(1, Math.hypot(dx, dy))
    this.container.x += (dx / len) * 7
    this.container.y += (dy / len) * 7
  }

  updateHp(pct: number): void {
    this.hpFill.clear()
    if (pct > 0) {
      this.hpFill.rect(-20, 1, Math.max(1, 40 * pct), 3).fill(this.hpColor)
    }
  }
}

export class BattleRenderer {
  private app: Application | null = null
  private root = new Container()
  private units = new Map<string, UnitView>()
  private effects: Effect[] = []
  private battle: BattleState | null = null
  private pendingEvents: BattleEvent[] = []
  private disposed = false
  private ready = false
  private host: HTMLElement | null = null
  private observer: ResizeObserver | null = null
  private width = 760
  private height = 360
  private backdrop: Sprite | null = null
  // trauma 震动（game-feel）：值随事件叠加、按秒衰减，shake = trauma²
  private trauma = 0
  private traumaT = 0
  /** 最近一次渲染帧时间戳：模拟层用它感知渲染停摆（遮挡/最小化时 rAF 停） */
  lastTickAt = performance.now()
  /** 效果队列上限：超出即强制结算最旧的（遮挡恢复后的淤积保险） */
  private static MAX_EFFECTS = 150
  /** 指挥台回调：点击场上单位 */
  onUnitClick?: (c: Combatant) => void
  private focusMarker: Text | null = null
  /** 阵型变化横幅（D14 反馈：阵型切换要有直观感受）——追踪上一帧阵型 */
  private lastStance: string | null = null
  /** boss 咏唱条（bossId → 条对象）：打断时找条做「碎裂」演出 */
  private castBars = new Map<string, Graphics>()

  private static STANCE_BANNER: Record<string, { text: string; color: number }> = {
    advance: { text: '推进阵型 · 输出↑ 防御↓', color: 0xe8a04d },
    standard: { text: '标准阵型', color: 0x9aa3b5 },
    tighten: { text: '收缩阵型 · 防御↑', color: 0x6b9bd9 },
    spread: { text: '分散阵型 · AOE 大幅减伤', color: 0x7fd48f },
  }

  async mount(container: HTMLElement): Promise<void> {
    const app = new Application()
    // 按容器宽度重新布阵；人物保留整数像素倍率，名称始终12px。
    await app.init({
      width: this.width,
      height: this.height,
      background: 0x1c1410,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
    if (this.disposed) {
      app.destroy(
        { removeView: true, releaseGlobalResources: true },
        { children: true },
      )
      return
    }
    this.app = app
    this.host = container
    container.appendChild(app.canvas)
    await preloadUrlSprites() // 素材包 PNG 预加载(失败静默降级)
    if (this.disposed) return
    this.ready = true
    this.observer = new ResizeObserver(() => { this.fit(); if (this.battle) this.syncUnits(this.battle) })
    this.observer.observe(container)
    this.fit()
    app.stage.addChild(this.root)
    this.drawBackdrop(this.theme)
    app.ticker.add((t) => this.tick(t.deltaMS))
    if (this.battle) {
      this.syncUnits(this.battle)
      this.play(this.pendingEvents.splice(0))
    }
  }

  /** 每次模拟推进后调用：battle 引用变化（新一战）时自动重建场景 */
  private membersById = new Map<string, Appearance>()
  setMembers(members: (Appearance & { id: string })[]): void {
    this.membersById = new Map(members.map(member => [member.id, member]))
  }

  private fit() {
    const width = this.host?.clientWidth
    if (!width || !this.app) return
    const layout = battleLayout(width, this.battle?.combatants ?? [])
    if (this.width !== width || this.height !== layout.height) {
      this.width = width; this.height = layout.height
      this.host!.style.height = layout.height + 'px'
      this.app.renderer.resize(width, layout.height)
      this.drawBackdrop(this.theme)
    }
    return layout
  }

  setBattle(b: BattleState, events: BattleEvent[]): void {
    if (this.battle !== b) {
      this.clearUnits()
      this.battle = b
      // 新战斗：阵型重置为标准，不播横幅（换场不等于换阵）
      this.lastStance = b.commands?.stance ?? null
    }
    if (!this.app || !this.ready) {
      this.pendingEvents.push(...events)
      return
    }
    this.syncUnits(b)
    this.play(events)
    // 阵型切换横幅：切阵即所见（D14 反馈）
    const stance = b.commands?.stance
    if (stance && stance !== this.lastStance) {
      this.lastStance = stance
      this.spawnStanceBanner(stance)
    }
  }

  reset(): void {
    this.battle = null
    this.clearUnits()
  }

  destroy(): void {
    this.disposed = true
    this.observer?.disconnect()
    this.observer = null
    // releaseGlobalResources：React 严格模式会 挂载→销毁→再挂载，
    // 不释放全局池会导致重建后闪烁/纹理残留（pixijs-application 技能标注的坑）
    this.app?.destroy(
      { removeView: true, releaseGlobalResources: true },
      { children: true },
    )
    this.app = null
  }


  // ---- 场景 ----

  /** 当前背景主题(按副本) */
  private theme = 'default'
  private envSpawnAcc = 0

  /** 环境粒子:尘埃(非 heat/frost 主题的通用点缀) */
  private spawnDust(): void {
    const g = new Graphics()
    const size = 1.5 + Math.random() /* presentation-only */ * 1.5
    g.rect(-size / 2, -size / 2, size, size).fill(0xa89878)
    const x = this.width * Math.random() /* presentation-only */
    const y = this.height * (0.2 + Math.random() /* presentation-only */ * 0.7)
    g.position.set(x, y)
    g.alpha = 0.35
    this.root.addChild(g)
    const drift = (Math.random() /* presentation-only */ < 0.5 ? -1 : 1) * (0.008 + Math.random() /* presentation-only */ * 0.012)
    let life = 0
    const dur = 3000 + Math.random() /* presentation-only */ * 3000
    this.effects.push({
      update: (dt) => {
        life += dt
        g.x += drift * dt
        g.y += Math.sin(life / 400) * 0.15
        g.alpha = 0.35 * Math.max(0, 1 - life / dur)
        if (life >= dur) {
          g.destroy()
          return false
        }
        return true
      },
    })
  }

  /** 环境粒子:heat 火星(底部上浮)/ frost 落雪(顶部飘落) */
  private spawnEmber(): void {
    const g = new Graphics()
    const size = 2 + Math.random() /* presentation-only */ * 2
    g.rect(-size / 2, -size / 2, size, size).fill(Math.random() /* presentation-only */ < 0.5 ? 0xff7a2a : 0xffb040)
    const x = this.width * (0.05 + Math.random() /* presentation-only */ * 0.9)
    const y = this.height * (0.86 + Math.random() /* presentation-only */ * 0.1)
    g.position.set(x, y)
    this.root.addChild(g)
    const drift = (Math.random() /* presentation-only */ - 0.5) * 0.02
    const rise = 0.03 + Math.random() /* presentation-only */ * 0.03
    let life = 0
    const dur = 2200 + Math.random() /* presentation-only */ * 1500
    this.effects.push({
      update: (dt) => {
        life += dt
        g.y -= rise * dt
        g.x += drift * dt
        g.alpha = Math.max(0, 1 - life / dur)
        if (life >= dur) {
          g.destroy()
          return false
        }
        return true
      },
    })
  }

  private spawnSnow(): void {
    const g = new Graphics()
    const size = 1.5 + Math.random() /* presentation-only */ * 1.5
    g.rect(-size / 2, -size / 2, size, size).fill(0xe8f4ff)
    const x = this.width * Math.random() /* presentation-only */
    const y = -4
    g.position.set(x, y)
    g.alpha = 0.85
    this.root.addChild(g)
    const drift = (Math.random() /* presentation-only */ - 0.5) * 0.03
    const fall = 0.02 + Math.random() /* presentation-only */ * 0.02
    let life = 0
    const dur = 6000 + Math.random() /* presentation-only */ * 4000
    this.effects.push({
      update: (dt) => {
        life += dt
        g.y += fall * dt
        g.x += drift * dt
        if (life >= dur || g.y > this.height) {
          g.destroy()
          return false
        }
        return true
      },
    })
  }

  setTheme(theme: string): void {
    if (this.theme === theme) return
    this.theme = theme
    if (this.app) this.drawBackdrop(theme)
  }

  private drawBackdrop(theme = this.theme): void {
    if (!this.app) return
    this.backdrop?.destroy({ texture: true, textureSource: true })
    const canvas = document.createElement('canvas')
    canvas.width = this.width; canvas.height = this.height
    paintScene(canvas.getContext('2d')!, this.width, this.height, theme)
    const texture = Texture.from(canvas)
    texture.source.scaleMode = 'nearest'
    this.backdrop = new Sprite(texture)
    this.root.addChildAt(this.backdrop, 0)
  }

  private clearUnits(): void {
    for (const child of [...this.root.children]) if (child !== this.backdrop) { child.removeFromParent(); child.destroy({ children: true }) }
    this.units.clear(); this.effects = []
    this.focusMarker = null; this.castBars.clear()
    this.trauma = 0; this.root.position.set(0)
  }

  private syncUnits(b: BattleState): void {
    const layout = this.fit() ?? battleLayout(this.width, b.combatants)
    for (const c of b.combatants) {
      let u = this.units.get(c.id)
      const slot = layout.positions[c.id]
      const member = c.memberId ? this.membersById.get(c.memberId) : undefined
      const layers = member ? heroLayers(member) : undefined
      if (!u) {
        const caster = c.petOf ? b.combatants.find(parent => parent.id === c.petOf) : undefined
        const petSprite = caster ? caster.specId?.includes('warlock') ? '/assets/mon/imp.png' : 'mon-wolf' : undefined
        u = new UnitView(c, slot.x, slot.y, layers, layout.bodyScale, layout.labelChars, petSprite)
        u.onClick = combatant => this.onUnitClick?.(combatant)
        this.units.set(c.id, u); this.root.addChild(u.container)
      }
      u.combatant = c; u.slot = slot
      if (!c.alive && u.lockCount === 0) u.container.position.set(slot.x, slot.y + 6)
      if (layers) u.updateAppearance(layers)
      u.resize(layout.bodyScale, layout.labelChars)
      u.updateHp(c.hp / c.maxHp)
    }
    const focusUnit = b.commands?.focusId ? this.units.get(b.commands.focusId) : undefined
    if (this.focusMarker?.destroyed) this.focusMarker = null
    if (focusUnit) {
      if (!this.focusMarker) {
        this.focusMarker = new Text({ text: '▼ 集火', style: { fontFamily: 'sans-serif', fontSize: 12, fill: 0xedc47b, fontWeight: 'bold' } })
        this.focusMarker.anchor.set(.5); this.root.addChild(this.focusMarker)
      }
      this.focusMarker.visible = true
      this.focusMarker.position.set(focusUnit.slot.x, focusUnit.slot.y - 32 * layout.bodyScale - 36)
    } else if (this.focusMarker) this.focusMarker.visible = false
  }

  // ---- 事件 → 动画 ----

  play(events: BattleEvent[]): void {
    if (!this.app) return
    // 队列淤积保险：渲染停摆期间模拟可能灌入大量事件，恢复后强制结算最旧的
    if (this.effects.length > BattleRenderer.MAX_EFFECTS) {
      const doomed = this.effects.splice(0, this.effects.length - 100)
      for (const e of doomed) e.update(1e9)
    }
    for (const ev of events) {
      const target = this.units.get(ev.targetId)
      if (!target) continue
      if (ev.type === 'death') {
        sfxDeath()
        this.spawnFall(target)
        this.spawnDeathBurst(target)
        this.hitStop(110)
        this.addTrauma(TRAUMA_BY_TIER.large)
        continue
      }
      if (ev.type === 'telegraph') {
        sfxTelegraph()
        this.spawnTelegraph(target, ev.amount ?? 30)
        this.spawnFloat(target, '⚠ 蓄力', 0xd93a3a, 14)
        continue
      }
      if (ev.type === 'casting') {
        this.spawnCastBar(target, ev.amount ?? 25)
        continue
      }
      if (ev.type === 'interrupted') {
        // 指挥高光时刻(game-feel large 级):打断 = 玩家指令的直接胜利,值得全套反馈
        sfxInterrupt()
        this.shatterCastBar(target)
        this.spawnFlash(target)
        this.spawnRing(target)
        this.hitStop(120)
        this.addTrauma(0.5)
        this.spawnFloat(target, '打断!!', 0xe8c67a, 20)
        continue
      }
      if (ev.type === 'slam') {
        // 震地 payoff:减伤成功/失败必须演得不一样,否则玩家感觉指令没用
        if (ev.mitigated) {
          sfxGuard()
          this.addTrauma(0.18)
          this.spawnFloat(target, '分散减伤!', 0x7fd48f, 18)
        } else {
          sfxSlam()
          this.hitStop(90)
          this.addTrauma(0.7)
          this.spawnFloat(target, '命中全队!!', 0xd93a3a, 20)
        }
        continue
      }
      if (ev.type === 'bound') {
        this.spawnFloat(target, '束缚!', 0x6b9bd9, 14)
        continue
      }
      if (ev.type === 'enraged') {
        sfxEnrage()
        target.bodyGroup.tint = 0xff5a5a
        this.spawnFloat(target, '狂暴!!', 0xff5a5a, 18)
        this.addTrauma(0.5)
        continue
      }
      if (ev.type === 'summoned') {
        this.spawnFloat(target, '增援出现!', 0xd98f8f, 13)
        continue
      }
      if (ev.type === 'fury') {
        this.spawnFloat(target, '爆发!', 0xe8c67a, 14)
        continue
      }
      if (ev.type === 'slowed') {
        this.spawnFloat(target, '❄ 减速!', 0x9ad4e8, 13)
        continue
      }
      if (ev.type === 'pulled') {
        this.spawnFloat(target, '被拽到前排!', 0xd9a05a, 14)
        continue
      }
      if (ev.type === 'zoned') {
        this.spawnFloat(target, ev.amount ? '毒沼缠身!' : '成功脱离!', 0x8ab86a, 13)
        continue
      }
      if (ev.type === 'phase') {
        this.spawnFloat(target, '相位·无效!', 0xb89ad4, 13)
        continue
      }
      if (ev.type === 'armorbreak') {
        this.spawnFloat(target, '破甲!', 0xd9b05a, 13)
        continue
      }
      if (ev.type === 'reposition') {
        this.spawnFloat(target, '换位!', 0x9ad4b8, 13)
        continue
      }
      const attacker = ev.attackerId ? this.units.get(ev.attackerId) : undefined
      if (ev.type === 'heal') {
        this.spawnFloat(target, `+${ev.amount}`, COL.heal, 12)
        continue
      }
      const text = `${ev.amount}${ev.crit ? '!' : ''}`
      const color = ev.crit ? COL.dmgCrit : COL.dmgNormal
      const size = ev.crit ? 18 : 12
      const tier: JuiceTier = ev.crit ? 'medium' : 'small'
      if (ev.crit) {
        sfxCrit()
        this.spawnRing(target)
        this.hitStop(70)
      } else {
        sfxHit()
      }
      if (ev.ranged && attacker) {
        this.spawnProjectile(attacker, target, () => {
          sfxHit()
          this.spawnFloat(target, text, color, size)
          this.spawnPunch(target)
          this.spawnFlash(target)
        })
      } else {
        if (attacker) this.spawnLunge(attacker, target)
        if (attacker) this.spawnSlash(target, attacker)
        this.spawnFloat(target, text, color, size)
        this.spawnPunch(target)
        this.spawnFlash(target)
      }
      this.addTrauma(TRAUMA_BY_TIER[tier])
    }
  }

  private spawnLunge(attacker: UnitView, target: UnitView): void {
    const sx = attacker.container.x
    const sy = attacker.container.y
    attacker.lockCount++
    let t = 0
    const dur = 220
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        const k = Math.sin(p * Math.PI) * 0.35
        attacker.container.x = sx + (target.container.x - sx) * k
        attacker.container.y = sy + (target.container.y - sy) * k
        if (p >= 1) {
          attacker.lockCount--
          return false
        }
        return true
      },
    })
  }

  private spawnProjectile(from: UnitView, to: UnitView, onHit: () => void): void {
    const g = new Graphics()
    g.roundRect(-5, -1.5, 10, 3, 1).fill(
      from.combatant.team === 'guild' ? COL.projectileGuild : COL.projectileEnemy,
    )
    const sx = from.container.x + 10
    const sy = from.container.y - 12
    const tx = to.container.x
    const ty = to.container.y - 12
    g.position.set(sx, sy)
    g.rotation = Math.atan2(ty - sy, tx - sx)
    this.root.addChild(g)
    let t = 0
    const dur = 160
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        g.position.set(sx + (tx - sx) * p, sy + (ty - sy) * p)
        if (p >= 1) {
          // v8 的 destroy() 不会把节点从父容器摘除，必须显式移除
          g.removeFromParent()
          g.destroy()
          onHit()
          return false
        }
        return true
      },
    })
  }

  private spawnFloat(u: UnitView, text: string, color: number, size: number): void {
    const x = u.container.x + (Math.random() /* presentation-only */ * 16 - 8)
    // y 也抖动：同帧多个飘字错开，避免叠成一坨读不了（D13 修复）
    const y = u.container.y - 40 - Math.random() /* presentation-only */ * 14
    const label = new Text({
      text,
      style: { fontFamily: 'sans-serif', fontSize: size, fill: color, fontWeight: 'bold' },
    })
    label.anchor.set(0.5)
    label.position.set(x, y)
    this.root.addChild(label)
    let t = 0
    const dur = 650
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        label.position.set(x, y - p * 26)
        label.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3
        if (p >= 1) {
          // v8 的 destroy() 不会把节点从父容器摘除，必须显式移除
          label.removeFromParent()
          label.destroy()
          return false
        }
        return true
      },
    })
  }

  /** 阵型切换横幅：舞台中央大字，上浮渐隐（切换即所见） */
  private spawnStanceBanner(stance: string): void {
    const info = BattleRenderer.STANCE_BANNER[stance]
    if (!info) return
    const label = new Text({
      text: info.text,
      style: {
        fontFamily: 'sans-serif',
        fontSize: this.width < 640 ? 12 : 20,
        fill: info.color,
        fontWeight: 'bold',
      },
    })
    label.anchor.set(0.5)
    label.position.set(this.width / 2, this.height * 0.32)
    this.root.addChild(label)
    let t = 0
    const dur = 1000
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        label.position.set(this.width / 2, this.height * 0.32 - p * 14)
        label.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4
        if (p >= 1) {
          label.removeFromParent()
          label.destroy()
          return false
        }
        return true
      },
    })
  }

  /** 近战挥砍弧光:朝向攻击者的弧线扫过并消散 */
  private spawnSlash(target: UnitView, attacker: UnitView): void {
    const g = new Graphics()
    g.position.set(target.container.x, target.container.y - 12)
    const base = Math.atan2(attacker.container.y - target.container.y, attacker.container.x - target.container.x)
    const color = attacker.combatant.team === 'guild' ? COL.projectileGuild : COL.projectileEnemy
    this.root.addChild(g)
    let t = 0
    const dur = 130
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        g.clear()
        g.arc(0, 0, 14 + p * 6, base - 0.8, base - 0.8 + 1.6 * (0.3 + p * 0.7))
          .stroke({ width: 3, color, alpha: 0.85 * (1 - p) })
        if (p >= 1) {
          g.removeFromParent()
          g.destroy()
          return false
        }
        return true
      },
    })
  }

  /** 死亡粒子:单位颜色的像素碎片向上抛洒,受重力坠落 */
  private spawnDeathBurst(u: UnitView): void {
    const color = unitColor(u.combatant)
    for (let i = 0; i < 10; i++) {
      const g = new Graphics()
      g.rect(-1.5, -1.5, 3, 3).fill(color)
      g.position.set(u.container.x + (Math.random() /* presentation-only */ * 10 - 5), u.container.y - 14)
      this.root.addChild(g)
      const vx = Math.random() /* presentation-only */ * 240 - 120
      const vy = -(60 + Math.random() /* presentation-only */ * 140)
      let t = 0
      const dur = 520
      this.effects.push({
        update: (dt) => {
          t += dt
          const s = t / 1000
          g.position.set(
            g.position.x + vx * (dt / 1000),
            g.position.y + vy * (dt / 1000) + 420 * s * (dt / 1000),
          )
          g.alpha = 1 - t / dur
          g.rotation += dt / 100
          if (t >= dur) {
            g.removeFromParent()
            g.destroy()
            return false
          }
          return true
        },
      })
    }
  }

  /** 暴击冲击环:扩张圆环快闪 */
  private spawnRing(u: UnitView): void {
    const g = new Graphics()
    g.position.set(u.container.x, u.container.y - 14)
    this.root.addChild(g)
    let t = 0
    const dur = 240
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        g.clear()
        g.circle(0, 0, 8 + p * 26).stroke({ width: 3 * (1 - p) + 1, color: 0xffa94d, alpha: 0.9 * (1 - p) })
        if (p >= 1) {
          g.removeFromParent()
          g.destroy()
          return false
        }
        return true
      },
    })
  }

  /** boss 蓄力预警:脚下红圈脉动 + 头顶倒计时条(前摇必须可读——还剩多久落地) */  private spawnTelegraph(u: UnitView, durTicks: number): void {
    const g = new Graphics()
    g.ellipse(0, 8, 40 * u.baseScale, 15 * u.baseScale)
      .fill({ color: 0xd93a3a, alpha: 0.3 })
      .stroke({ width: 2, color: 0xd93a3a, alpha: 0.7 })
    g.position.set(u.container.x, u.container.y)
    this.root.addChild(g)
    // 倒计时条:挂单位容器上跟随移动,红条缩到 0 = 蓄力落地;最后 1/3 急促闪烁
    const bar = new Graphics()
    const barY = -32 * u.bodyScale - 31
    u.container.addChild(bar)
    let t = 0
    const dur = durTicks * TICK_MS
    this.effects.push({
      update: (dt) => {
        if (bar.destroyed) return false
        t += dt
        const p = Math.min(t / dur, 1)
        const urgent = p >= 0.66
        g.alpha = urgent ? 0.5 + 0.5 * Math.sin(t / 28) : 0.7 + 0.3 * Math.sin(t / 80)
        bar.clear()
        bar.roundRect(-20 * u.baseScale, barY, 40 * u.baseScale, 4, 2).fill({ color: 0x262b38, alpha: 0.9 })
        if (p < 1) {
          bar.roundRect(-20 * u.baseScale, barY, 40 * u.baseScale * (1 - p), 4, 2)
            .fill({ color: 0xd93a3a, alpha: urgent ? 1 : 0.85 })
        }
        if (p >= 1) {
          g.removeFromParent()
          g.destroy()
          bar.removeFromParent()
          bar.destroy()
          return false
        }
        return true
      },
    })
  }

  /** boss 咏唱条:紫色计时条挂在 boss 头顶,被集火打断时由 shatterCastBar 接手演出 */
  private spawnCastBar(u: UnitView, durTicks: number): void {
    // 同一 boss 重复开咏唱前先清旧条(mechanics 保证不叠加,这里兜底)
    const prev = this.castBars.get(u.combatant.id)
    if (prev && !prev.destroyed) {
      prev.removeFromParent()
      prev.destroy()
    }
    const bar = new Graphics()
    const barY = -32 * u.bodyScale - 31
    u.container.addChild(bar)
    this.castBars.set(u.combatant.id, bar)
    let t = 0
    const dur = durTicks * TICK_MS
    this.effects.push({
      update: (dt) => {
        if (bar.destroyed) return false // 被打断演出接管/场景重建时静默退出
        t += dt
        const p = Math.min(t / dur, 1)
        bar.clear()
        bar.roundRect(-20 * u.baseScale, barY, 40 * u.baseScale, 4, 2).fill({ color: 0x262b38, alpha: 0.9 })
        bar.roundRect(-20 * u.baseScale, barY, 40 * u.baseScale * (1 - p), 4, 2)
          .fill({ color: 0xb08fd9, alpha: 0.95 })
        if (p >= 1) {
          bar.removeFromParent()
          bar.destroy()
          if (this.castBars.get(u.combatant.id) === bar) this.castBars.delete(u.combatant.id)
        }
        return true
      },
    })
  }

  /** 打断演出:咏唱条胀大淡出「碎裂」(interrupted 事件调用,配合白闪/hit-stop) */
  private shatterCastBar(u: UnitView): void {
    const bar = this.castBars.get(u.combatant.id)
    if (!bar || bar.destroyed) return
    this.castBars.delete(u.combatant.id)
    let t = 0
    this.effects.push({
      update: (dt) => {
        if (bar.destroyed) return false
        t += dt
        const p = Math.min(t / 160, 1)
        bar.scale.set(1 + p * 0.6)
        bar.alpha = 1 - p
        if (p >= 1) {
          bar.removeFromParent()
          bar.destroy()
          return false
        }
        return true
      },
    })
  }

  /** 挤压拉伸：保体积形变 + 阻尼弹簧回弹（game-feel：优于均匀缩放） */
  private spawnPunch(u: UnitView): void {
    u.lockCount++
    let t = 0
    const dur = 240
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        // 阻尼振动：初始横向压扁纵向拉长，指数衰减回 1
        const damp = Math.exp(-p * 6) * Math.cos(p * Math.PI * 2.5)
        const sx = u.baseScale * (1 - 0.22 * damp)
        const sy = u.baseScale * (1 + 0.22 * damp)
        u.container.scale.set(sx, sy)
        if (p >= 1) {
          u.container.scale.set(u.baseScale, u.baseScale)
          u.lockCount--
          return false
        }
        return true
      },
    })
  }

  /** 受击白闪：挂在单位容器上跟随移动，90ms 熄灭 */
  private spawnFlash(u: UnitView): void {
    const g = new Graphics()
    g.roundRect(-9, -28, 18, 34, 3).fill({ color: 0xffffff, alpha: 0.55 })
    u.container.addChild(g)
    let t = 0
    const dur = 90
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        g.alpha = 1 - p
        if (p >= 1) {
          g.removeFromParent()
          g.destroy()
          return false
        }
        return true
      },
    })
  }

  private spawnFall(u: UnitView): void {
    u.lockCount++
    // 遗骸样式：变暗变灰 + 名字淡出——清晰读作尸体，不是白色残影
    u.bodyGroup.tint = 0x6e6e6e
    u.nameText.alpha = 0.4
    const sy = u.container.y
    const dir = u.combatant.team === 'enemy' ? -1 : 1
    let t = 0
    const dur = 400
    this.effects.push({
      update: (dt) => {
        t += dt
        const p = Math.min(t / dur, 1)
        u.container.rotation = (p * Math.PI) / 2 * dir
        u.container.alpha = 1 - p * 0.65
        u.container.y = sy + p * 6
        if (p >= 1) {
          u.settleFall()
          u.lockCount--
          return false
        }
        return true
      },
    })
  }

  private addTrauma(amount: number): void {
    if (amount <= 0) return
    this.trauma = Math.min(1, this.trauma + amount)
  }

  // ---- 帧循环 ----

  /** 命中停顿(game-feel:真实时间恢复,只放慢演出,永不触碰模拟层) */
  private hitStopUntil = 0
  private hitStop(ms: number): void {
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + ms)
  }

  private tick(dtMs: number): void {
    // 钳制单帧 dt：rAF 恢复后的追赶帧不允许一步跳完动画;hit-stop 期间演出放慢 94%
    let dt = Math.min(dtMs, 100)
    if (performance.now() < this.hitStopUntil) dt *= 0.06
    this.lastTickAt = performance.now()
    const k = 1 - Math.exp(-dt / 80)
    const nowT = performance.now()
    // 素材帧自愈:预加载晚于单位创建时,占位纹理就绪后自动替换
    for (const u of this.units.values()) {
      if (u.texKey) {
        const t = tryGetTex(u.texKey)
        if (t) {
          for (const s of u.bodySprites) s.texture = t
          u.texKey = null
        }
      }
    }
    for (const u of this.units.values()) {
      // 死亡单位永久退出回位插值：尸体留在倒下的地方，绝不拖拽滑动
      if (u.lockCount > 0 || !u.combatant.alive) continue
      u.container.x += (u.slot.x - u.container.x) * k
      u.container.y += (u.slot.y - u.container.y) * k
      // 待机呼吸:像素小人轻轻起伏(活着才有生命)
      u.bodyGroup.y = Math.round(6 + Math.sin(nowT / 320 + u.bobPhase) * 1.2)
    }
    // 环境粒子(版图二观感:heat 火星上浮 / frost 落雪)——主题背景的"动"的部分
    this.envSpawnAcc += dt
    if (this.envSpawnAcc > 140 && this.effects.length < 200) {
      this.envSpawnAcc = 0
      if (sceneArt(this.theme).atmosphere === 'ember') this.spawnEmber()
      else if (sceneArt(this.theme).atmosphere === 'snow') this.spawnSnow()
      else this.spawnDust()
    }
    // 手动循环而非 filter：弹道命中的 onHit 会在迭代期间向 this.effects
    // 推入新效果——filter 按初始长度迭代，会把它们遗弃在旧数组里永不更新
    // （表现为永久冻结的飘字与锁泄漏）
    // 先换新数组再迭代：帧内新推入的效果落进新数组，旧数组安全遍历后丢弃
    const current = this.effects
    this.effects = []
    const survivors: Effect[] = []
    for (const e of current) {
      if (e.update(dt)) survivors.push(e)
    }
    this.effects = survivors.concat(this.effects)

    // 镜头震动：作用于 root（全部子节点的视觉偏移），不碰单位逻辑坐标
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - (dtMs / 1000) * 1.2)
      this.traumaT += (dtMs / 1000) * 30
      const shake = this.trauma * this.trauma
      this.root.x = 10 * shake * Math.sin(this.traumaT * 1.7)
      this.root.y = 7 * shake * Math.sin(this.traumaT * 2.3)
    } else if (this.root.x !== 0 || this.root.y !== 0) {
      this.root.x = 0
      this.root.y = 0
    }
  }
}
