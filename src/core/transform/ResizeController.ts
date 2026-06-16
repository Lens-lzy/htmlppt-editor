import type { SelectionController } from '../selection/SelectionController'
import type { StyleApplier } from '../style/StyleApplier'
import type { History } from '../history/History'
import type { FrameHost } from '../frame/FrameHost'
import type { ResizeKind } from '../types'
import type { Overlay, HandleDir } from '../selection/Overlay'
import { MultiStylePatchCommand } from '../history/commands/StylePatchCommand'
import { collectSnapTargets, snapEdge, snapConfig, type SnapSet, type Guide } from './snap'

/** 按元素类型决定缩放改什么属性（难点 1） */
export function classifyResize(el: HTMLElement, win: Window): ResizeKind {
  const tag = el.tagName.toLowerCase()
  if (['img', 'svg', 'video', 'canvas', 'picture'].includes(tag)) return 'size'
  const bg = win.getComputedStyle(el).backgroundImage
  if (bg && bg !== 'none') return 'size'
  // 没有元素子节点的文本叶子 -> 改字号
  const hasElementChild = Array.from(el.children).length > 0
  if (!hasElementChild && (el.textContent ?? '').trim().length > 0) return 'font'
  return 'size'
}

const MIN = 8

/**
 * 8 向手柄缩放。size 类改 width/height（顶左锚定）；font 类改 font-size；
 * Shift 锁比例。松手记一条命令。
 */
export class ResizeController {
  private el: HTMLElement | null = null
  private id = ''
  private dir: HandleDir = 'se'
  private kind: ResizeKind = 'size'
  private startX = 0
  private startY = 0
  private startW = 0
  private startH = 0
  private startFont = 0
  private oldW = ''
  private oldH = ''
  private oldFont = ''
  private oldLeft = ''
  private oldTop = ''
  private startLeft = 0 // 定位空间(style.left, 相对 offsetParent)的初始左/上
  private startTop = 0
  private shift = false
  private active = false
  private snapSet: SnapSet = { xs: [], ys: [] }
  private left0 = 0 // 视口内容空间(getBoundingClientRect)的初始左/上，用于吸附比对/辅助线
  private top0 = 0

  constructor(
    private selection: SelectionController,
    private applier: StyleApplier,
    private history: History,
    private host: FrameHost,
    private overlay: Overlay,
    private getZoom: () => number,
  ) {}

  begin(dir: HandleDir, e: PointerEvent): void {
    const el = this.selection.selected
    if (!el) return
    this.el = el
    this.id = this.selection.selectedId!
    this.dir = dir
    this.kind = classifyResize(el, this.host.win)
    const rect = el.getBoundingClientRect()
    this.startW = rect.width
    this.startH = rect.height
    this.left0 = rect.left
    this.top0 = rect.top
    this.startFont = parseFloat(this.host.win.getComputedStyle(el).fontSize) || 16
    this.startLeft = parseFloat(el.style.left) || el.offsetLeft || 0
    this.startTop = parseFloat(el.style.top) || el.offsetTop || 0
    this.oldW = el.style.width
    this.oldH = el.style.height
    this.oldLeft = el.style.left
    this.oldTop = el.style.top
    this.oldFont = el.style.fontSize
    this.startX = e.clientX
    this.startY = e.clientY
    this.active = true
    this.snapSet = this.kind === 'size' ? collectSnapTargets(this.host.doc, el) : { xs: [], ys: [] }
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    e.preventDefault()
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.active || !this.el) return
    this.shift = e.shiftKey
    const z = this.getZoom()
    const dx = (e.clientX - this.startX) / z
    const dy = (e.clientY - this.startY) / z
    const signX = this.dir.includes('e') ? 1 : this.dir.includes('w') ? -1 : 0
    const signY = this.dir.includes('s') ? 1 : this.dir.includes('n') ? -1 : 0

    let newW = this.startW + signX * dx
    let newH = this.startH + signY * dy

    if (this.kind === 'font') {
      const ratioW = signX !== 0 ? newW / this.startW : null
      const ratioH = signY !== 0 ? newH / this.startH : null
      let scale = ratioW ?? ratioH ?? 1
      if (ratioW != null && ratioH != null) scale = Math.max(ratioW, ratioH)
      const font = clamp(this.startFont * scale, 4, 400)
      this.applier.set(this.el, this.id, 'font-size', `${round1(font)}px`)
    } else {
      const hasE = this.dir.includes('e')
      const hasW = this.dir.includes('w')
      const hasS = this.dir.includes('s')
      const hasN = this.dir.includes('n')

      // 抓哪条边动哪条：东/南改尺寸（左上锚定）；西/北同时改尺寸与 left/top（右下锚定）
      newW = this.startW + (hasE ? dx : hasW ? -dx : 0)
      newH = this.startH + (hasS ? dy : hasN ? -dy : 0)
      let dLeft = hasW ? dx : 0 // left 的位移（内容 px）
      let dTop = hasN ? dy : 0

      // Shift 锁比例（角手柄）：以宽定高，北向时同步顶边
      if (this.shift && signX !== 0 && signY !== 0) {
        const aspect = this.startW / this.startH || 1
        newH = newW / aspect
        if (hasN) dTop = this.startH - newH
      }

      // 吸附：对正在移动的边对齐其它元素的线（坐标均在视口内容空间）
      const guides: Guide[] = []
      const snapping = snapConfig.enabled && !e.altKey && !this.shift
      if (snapping && hasE) {
        const cand = snapEdge(this.left0 + newW, this.snapSet.xs, z, snapConfig.threshold)
        if (cand) {
          newW = cand.pos - this.left0
          guides.push({ orient: 'v', pos: cand.pos, from: Math.min(this.top0, cand.a), to: Math.max(this.top0 + newH, cand.b) })
        }
      } else if (snapping && hasW) {
        const cand = snapEdge(this.left0 + dLeft, this.snapSet.xs, z, snapConfig.threshold)
        if (cand) {
          dLeft = cand.pos - this.left0
          newW = this.startW - dLeft
          guides.push({ orient: 'v', pos: cand.pos, from: Math.min(this.top0, cand.a), to: Math.max(this.top0 + newH, cand.b) })
        }
      }
      if (snapping && hasS) {
        const cand = snapEdge(this.top0 + newH, this.snapSet.ys, z, snapConfig.threshold)
        if (cand) {
          newH = cand.pos - this.top0
          guides.push({ orient: 'h', pos: cand.pos, from: Math.min(this.left0, cand.a), to: Math.max(this.left0 + newW, cand.b) })
        }
      } else if (snapping && hasN) {
        const cand = snapEdge(this.top0 + dTop, this.snapSet.ys, z, snapConfig.threshold)
        if (cand) {
          dTop = cand.pos - this.top0
          newH = this.startH - dTop
          guides.push({ orient: 'h', pos: cand.pos, from: Math.min(this.left0, cand.a), to: Math.max(this.left0 + newW, cand.b) })
        }
      }

      // 触底夹紧：尺寸不小于 MIN，同时锁住对应的 left/top 不越过对边
      if (newW < MIN) { if (hasW) dLeft = this.startW - MIN; newW = MIN }
      if (newH < MIN) { if (hasN) dTop = this.startH - MIN; newH = MIN }

      if (hasE || hasW) this.applier.set(this.el, this.id, 'width', `${Math.round(newW)}px`)
      if (hasS || hasN) this.applier.set(this.el, this.id, 'height', `${Math.round(newH)}px`)
      if (hasW) this.applier.set(this.el, this.id, 'left', `${Math.round(this.startLeft + dLeft)}px`)
      if (hasN) this.applier.set(this.el, this.id, 'top', `${Math.round(this.startTop + dTop)}px`)
      this.overlay.showSnapGuides(guides, this.host.iframe, z)
    }
    this.selection.reposition()
  }

  private onUp = (): void => {
    if (!this.active || !this.el) return
    this.active = false
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    this.overlay.clearGuides()

    const changes =
      this.kind === 'font'
        ? [{ prop: 'font-size', oldVal: this.oldFont, newVal: this.el.style.fontSize }]
        : [
            { prop: 'width', oldVal: this.oldW, newVal: this.el.style.width },
            { prop: 'height', oldVal: this.oldH, newVal: this.el.style.height },
            { prop: 'left', oldVal: this.oldLeft, newVal: this.el.style.left },
            { prop: 'top', oldVal: this.oldTop, newVal: this.el.style.top },
          ]
    const changed = changes.some((c) => c.oldVal !== c.newVal)
    if (changed) {
      this.history.pushApplied(
        new MultiStylePatchCommand(this.el, this.id, changes, this.applier, '缩放'),
      )
    }
    this.selection.refresh()
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
function round1(n: number): number {
  return Math.round(n * 10) / 10
}
