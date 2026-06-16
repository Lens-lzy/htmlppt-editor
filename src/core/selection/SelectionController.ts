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

  handleClick(el: HTMLElement, x?: number, y?: number): void {
    if (!el || el.tagName === 'HTML') return
    this.select(this.resolveUnit(el, x, y))
  }

  /**
   * 把点击/悬停目标归一到「内容单元」。PPTX 生成的内容里，每个形状/图片/表格都带
   * `.el` 类，内部文字是 `.el-tx>.pp>span`（无 `.el`）。点到文字时应选中整个文本框
   * （`.el-sp`），这样缩放走 width/height 让文字自动换行，而非缩放单个文字 run 的字号
   * —— 与 PowerPoint 的文本框行为一致。HTML 编辑器加载的任意 HTML 无 `.el` 类，
   * closest 返回 null，回退到原始目标，行为不变。
   *
   * 点击容错：大字号文本常溢出自身文本框，点到「露在框外」的字形其实命中了背景，
   * closest 找不到 `.el`。此时（给了点击坐标）在同页内按到光标的距离找最近的 `.el`
   * 兜底选中（阈值内），让溢出的大字也能点中。悬停不传坐标，保持轻量。
   */
  private resolveUnit(el: HTMLElement, x?: number, y?: number): HTMLElement {
    // 无坐标（悬停）：就近归一到 .el
    if (x == null || y == null) return (el.closest('.el') as HTMLElement | null) || el
    // 关键：不要直接用事件命中的元素 —— 整页背景图/透明形状常盖在最上层，会把它下面的
    // 文本框、图片全挡住。改为在本页所有 .el 里，挑「包含光标且面积最小」的那个（前景内容
    // 必然比整页背景小），让前景胜出；点空白处再按距离就近兜底（覆盖大字溢出小框的情况）。
    // 想选最底层的大图/背景，用左侧图层面板点名即可。
    const slide =
      (el.closest('.slide') as HTMLElement | null) ||
      this.host.doc.querySelector<HTMLElement>('.slide')
    if (!slide) return (el.closest('.el') as HTMLElement | null) || el
    const THRESH = 36 // 内容像素：点空超出此距离视为有意点空
    let inside: HTMLElement | null = null
    let insideArea = Infinity
    let near: HTMLElement | null = null
    let nearArea = Infinity
    let nearDist = Infinity
    for (const cand of Array.from(slide.querySelectorAll<HTMLElement>('.el'))) {
      const r = cand.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const area = r.width * r.height
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        if (area < insideArea) {
          insideArea = area
          inside = cand
        }
      } else {
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
        const d = Math.hypot(dx, dy)
        if (d <= THRESH && (d < nearDist || (d === nearDist && area < nearArea))) {
          nearDist = d
          nearArea = area
          near = cand
        }
      }
    }
    return inside || near || (el.closest('.el') as HTMLElement | null) || el
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
