import type { EventBus } from '../EventBus'
import type { FrameHost } from '../frame/FrameHost'
import type { Overlay } from './Overlay'
import type { EditModel } from '../model/EditModel'
import type { SelectionInfo } from '../types'
import { ensureId } from '../model/idattr'
import { readSnapshot } from '../model/computed'

export class SelectionController {
  selected: HTMLElement | null = null
  selectedId: string | null = null
  private hovered: HTMLElement | null = null

  constructor(
    private bus: EventBus,
    private host: FrameHost,
    private overlay: Overlay,
    private model: EditModel,
  ) {}

  handleHover(el: HTMLElement | null): void {
    if (!el || el.tagName === 'HTML' || el.tagName === 'BODY') {
      this.hovered = null
      this.overlay.showHover(null)
      return
    }
    if (el === this.selected) {
      this.overlay.showHover(null)
      return
    }
    this.hovered = el
    this.overlay.showHover(this.host.viewRect(el))
  }

  handleClick(el: HTMLElement): void {
    if (!el || el.tagName === 'HTML') return
    this.select(el)
  }

  /** 程序化选中（图层面板点击等） */
  select(el: HTMLElement): void {
    this.selected = el
    this.selectedId = ensureId(el)
    this.overlay.showHover(null)
    this.overlay.showSelection(this.host.viewRect(el))
    this.emitSelection()
    this.emitSnapshot()
  }

  deselect(): void {
    this.selected = null
    this.selectedId = null
    this.overlay.showSelection(null)
    this.overlay.showHover(null)
    this.bus.emit('selection-changed', null)
  }

  /** overlay 跟随 iframe 滚动/尺寸变化重绘 */
  reposition(): void {
    if (this.selected) this.overlay.showSelection(this.host.viewRect(this.selected))
    if (this.hovered) this.overlay.showHover(this.host.viewRect(this.hovered))
  }

  /** 改完样式后刷新面板快照（值可能联动变化） */
  refresh(): void {
    if (this.selected) {
      this.emitSnapshot()
      this.emitSelection()
    }
  }

  private emitSelection(): void {
    if (!this.selected || !this.selectedId) return
    const info: SelectionInfo = {
      id: this.selectedId,
      tagName: this.selected.tagName.toLowerCase(),
      overrides: this.model.overriddenProps(this.selectedId),
    }
    this.bus.emit('selection-changed', info)
  }

  private emitSnapshot(): void {
    if (!this.selected) return
    this.bus.emit('style-snapshot', readSnapshot(this.selected, this.host.win))
  }
}
