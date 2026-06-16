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
    el = this.resolveUnit(el)
    if (el === this.selected) {
      this.overlay.showHover(null)
      return
    }
    this.hovered = el
    this.overlay.showHover(this.host.viewRect(el))
  }

  handleClick(el: HTMLElement): void {
    if (!el || el.tagName === 'HTML') return
    this.select(this.resolveUnit(el))
  }

  /**
   * 把点击/悬停目标归一到「内容单元」。PPTX 生成的内容里，每个形状/图片/表格都带
   * `.el` 类，内部文字是 `.el-tx>.pp>span`（无 `.el`）。点到文字时应选中整个文本框
   * （`.el-sp`），这样缩放走 width/height 让文字自动换行，而非缩放单个文字 run 的字号
   * —— 与 PowerPoint 的文本框行为一致。HTML 编辑器加载的任意 HTML 无 `.el` 类，
   * closest 返回 null，回退到原始目标，行为不变。
   */
  private resolveUnit(el: HTMLElement): HTMLElement {
    return (el.closest('.el') as HTMLElement | null) || el
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
