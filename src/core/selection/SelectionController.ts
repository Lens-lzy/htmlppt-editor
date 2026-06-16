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
    // PPTX（有 .slide）：一律按坐标在幻灯片内挑元素；点到幻灯片外（黑边/页间空隙）则取消选中。
    if (x != null && y != null && this.host.doc.querySelector('.slide')) {
      this.selectAtPoint(x, y)
      return
    }
    // HTML 编辑器（无 .slide）：保持原行为，直接选中命中的元素
    this.select((el.closest('.el') as HTMLElement | null) || el)
  }

  /**
   * 按坐标选中（坐标为 iframe 内容/视口坐标系，与 getBoundingClientRect 同系）。
   * 供画布点击与「选择框上点击穿透」共用：点在某页内 -> 选该页内命中且面积最小的元素；
   * 点在所有幻灯片之外（黑边/页间空隙）-> 取消选中。找不到则取消。
   */
  selectAtPoint(x: number, y: number): void {
    const found = this.pickAtPoint(x, y)
    if (found) this.select(found)
    else this.deselect()
  }

  /**
   * 选取命中点的内容单元。关键：不要用事件命中的最上层元素 —— 整页背景图/透明形状常盖在
   * 最上层，会把下面的文本框、图片全挡住。改为在「光标所在那一页」的所有 .el 里挑「包含光标
   * 且面积最小」的（前景内容必然比整页背景小），让前景胜出；点页内空白再按距离就近兜底
   * （覆盖大字溢出小框）。想选最底层大图/背景，用左侧图层面板点名。
   */
  private pickAtPoint(x: number, y: number): HTMLElement | null {
    // 先定位光标落在哪一页；不在任何页内（黑边/页间空隙）直接判为点空
    let slide: HTMLElement | null = null
    for (const s of Array.from(this.host.doc.querySelectorAll<HTMLElement>('.slide'))) {
      const r = s.getBoundingClientRect()
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        slide = s
        break
      }
    }
    if (!slide) return null
    const THRESH = 36 // 内容像素：点页内空白且超出此距离视为点空
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
    return inside || near
  }

  /** 把悬停目标归一到内容单元（仅就近 closest，无坐标） */
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
