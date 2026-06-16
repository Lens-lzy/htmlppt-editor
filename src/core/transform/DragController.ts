import type { SelectionController } from '../selection/SelectionController'
import type { StyleApplier } from '../style/StyleApplier'
import type { History } from '../history/History'
import type { FrameHost } from '../frame/FrameHost'
import type { Overlay } from '../selection/Overlay'
import { MultiStylePatchCommand } from '../history/commands/StylePatchCommand'
import { collectSnapTargets, computeSnap, snapConfig, type SnapSet } from './snap'

function parseTranslate(v: string): { x: number; y: number } {
  if (!v) return { x: 0, y: 0 }
  const parts = v.trim().split(/\s+/)
  const x = parseFloat(parts[0]) || 0
  const y = parts[1] !== undefined ? parseFloat(parts[1]) || 0 : 0
  return { x, y }
}

/**
 * 拖动移动元素：用 CSS `translate` 长属性叠加偏移（与 transform 独立，非破坏式）。
 * 过程实时预览并对其它元素吸附对齐（显示纵向/横向辅助线，按住 Alt 临时关闭吸附）。
 * 松手时记一条命令进 history。
 */
export class DragController {
  private el: HTMLElement | null = null
  private id = ''
  private startX = 0
  private startY = 0
  private startTx = 0
  private startTy = 0
  private startVal = ''
  private moving = false
  private snapSet: SnapSet = { xs: [], ys: [] }

  constructor(
    private selection: SelectionController,
    private applier: StyleApplier,
    private history: History,
    private host: FrameHost,
    private overlay: Overlay,
    private getZoom: () => number,
  ) {}

  begin(e: PointerEvent): void {
    const el = this.selection.selected
    if (!el || el.hasAttribute('data-hve-lock')) return // 锁定的元素不可拖动
    this.el = el
    this.id = this.selection.selectedId!
    this.startVal = el.style.translate
    const t = parseTranslate(this.startVal)
    this.startTx = t.x
    this.startTy = t.y
    this.startX = e.clientX
    this.startY = e.clientY
    this.moving = true
    this.snapSet = collectSnapTargets(this.host.doc, el)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    e.preventDefault()
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.moving || !this.el) return
    // 安全网：若移动时已无按键按下（pointerup 丢失），立即结束，避免「不按也能拖」
    if (e.buttons === 0) {
      this.onUp()
      return
    }
    const z = this.getZoom()
    let nx = this.startTx + (e.clientX - this.startX) / z
    let ny = this.startTy + (e.clientY - this.startY) / z
    // 先按光标位置放置，再测量矩形算吸附
    this.applier.set(this.el, this.id, 'translate', `${Math.round(nx)}px ${Math.round(ny)}px`)
    if (snapConfig.enabled && !e.altKey) {
      const snap = computeSnap(this.el.getBoundingClientRect(), this.snapSet, z, snapConfig.threshold)
      if (snap.dx || snap.dy) {
        nx += snap.dx
        ny += snap.dy
        this.applier.set(this.el, this.id, 'translate', `${Math.round(nx)}px ${Math.round(ny)}px`)
      }
      this.overlay.showSnapGuides(snap.guides, this.host.iframe, z)
    } else {
      this.overlay.clearGuides()
    }
    this.selection.reposition()
  }

  private onUp = (): void => {
    if (!this.moving || !this.el) return
    this.moving = false
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    this.overlay.clearGuides()
    const newVal = this.el.style.translate
    if (newVal !== this.startVal) {
      this.history.pushApplied(
        new MultiStylePatchCommand(
          this.el,
          this.id,
          [{ prop: 'translate', oldVal: this.startVal, newVal }],
          this.applier,
          '移动',
        ),
      )
    }
    this.selection.refresh()
  }
}
