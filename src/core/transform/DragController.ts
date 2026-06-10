import type { SelectionController } from '../selection/SelectionController'
import type { StyleApplier } from '../style/StyleApplier'
import type { History } from '../history/History'
import { MultiStylePatchCommand } from '../history/commands/StylePatchCommand'

function parseTranslate(v: string): { x: number; y: number } {
  if (!v) return { x: 0, y: 0 }
  const parts = v.trim().split(/\s+/)
  const x = parseFloat(parts[0]) || 0
  const y = parts[1] !== undefined ? parseFloat(parts[1]) || 0 : 0
  return { x, y }
}

/**
 * 拖动移动元素：用 CSS `translate` 长属性叠加偏移（与 transform 独立，非破坏式）。
 * 过程实时预览，松手时记一条命令进 history。
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

  constructor(
    private selection: SelectionController,
    private applier: StyleApplier,
    private history: History,
    private getZoom: () => number,
  ) {}

  begin(e: PointerEvent): void {
    const el = this.selection.selected
    if (!el) return
    this.el = el
    this.id = this.selection.selectedId!
    this.startVal = el.style.translate
    const t = parseTranslate(this.startVal)
    this.startTx = t.x
    this.startTy = t.y
    this.startX = e.clientX
    this.startY = e.clientY
    this.moving = true
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    e.preventDefault()
  }

  private onMove = (e: PointerEvent): void => {
    if (!this.moving || !this.el) return
    const z = this.getZoom()
    const nx = this.startTx + (e.clientX - this.startX) / z
    const ny = this.startTy + (e.clientY - this.startY) / z
    this.applier.set(this.el, this.id, 'translate', `${Math.round(nx)}px ${Math.round(ny)}px`)
    this.selection.reposition()
  }

  private onUp = (): void => {
    if (!this.moving || !this.el) return
    this.moving = false
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
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
