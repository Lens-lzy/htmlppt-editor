import type { SelectionController } from '../selection/SelectionController'
import type { StyleApplier } from '../style/StyleApplier'
import type { History } from '../history/History'
import type { FrameHost } from '../frame/FrameHost'
import type { ResizeKind } from '../types'
import type { HandleDir } from '../selection/Overlay'
import { MultiStylePatchCommand } from '../history/commands/StylePatchCommand'

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
  private shift = false
  private active = false

  constructor(
    private selection: SelectionController,
    private applier: StyleApplier,
    private history: History,
    private host: FrameHost,
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
    this.startFont = parseFloat(this.host.win.getComputedStyle(el).fontSize) || 16
    this.oldW = el.style.width
    this.oldH = el.style.height
    this.oldFont = el.style.fontSize
    this.startX = e.clientX
    this.startY = e.clientY
    this.active = true
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
      const aspect = this.startW / this.startH || 1
      if (this.shift && signX !== 0 && signY !== 0) {
        newH = newW / aspect
      }
      if (signX !== 0) this.applier.set(this.el, this.id, 'width', `${Math.max(MIN, Math.round(newW))}px`)
      if (signY !== 0) this.applier.set(this.el, this.id, 'height', `${Math.max(MIN, Math.round(newH))}px`)
    }
    this.selection.reposition()
  }

  private onUp = (): void => {
    if (!this.active || !this.el) return
    this.active = false
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)

    const changes =
      this.kind === 'font'
        ? [{ prop: 'font-size', oldVal: this.oldFont, newVal: this.el.style.fontSize }]
        : [
            { prop: 'width', oldVal: this.oldW, newVal: this.el.style.width },
            { prop: 'height', oldVal: this.oldH, newVal: this.el.style.height },
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
