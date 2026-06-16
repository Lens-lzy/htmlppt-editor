import type { EventBus } from '../EventBus'
import type { FrameHost } from '../frame/FrameHost'
import type { History } from '../history/History'
import type { SlideDetectMode, SlideInfo } from '../types'
import { ensureId } from '../model/idattr'
import { detectSlides, slideTitle } from './SlideDetector'
import { CallbackCommand } from '../history/commands/CallbackCommand'

/** 幻灯片管理：识别、切换、复制/删除/重排（结构性操作走 history） */
export class SlideController {
  private roots: HTMLElement[] = []
  private mode: SlideDetectMode = 'auto'
  private selector = ''
  current = 0

  constructor(
    private bus: EventBus,
    private host: FrameHost,
    private history: History,
  ) {}

  detect(mode?: SlideDetectMode, selector?: string): void {
    if (mode) this.mode = mode
    if (selector !== undefined) this.selector = selector
    this.rebuild()
    this.current = 0
    this.emit()
  }

  private rebuild(): void {
    this.roots = detectSlides(this.host.doc, this.mode, this.selector)
  }

  get count(): number {
    return this.roots.length
  }

  /** 当前页的根元素（新增元素插入到这里；无则回退到 body） */
  get currentRoot(): HTMLElement | null {
    return this.roots[this.current] || this.host.doc.body || null
  }
  get detectMode(): SlideDetectMode {
    return this.mode
  }

  list(): SlideInfo[] {
    return this.roots.map((r, i) => ({ id: ensureId(r), index: i, title: slideTitle(r, i) }))
  }

  switchTo(i: number): void {
    if (i < 0 || i >= this.roots.length) return
    this.current = i
    this.roots[i].scrollIntoView({ behavior: 'smooth', block: 'start' })
    this.emit()
  }

  duplicate(i: number): void {
    const root = this.roots[i]
    if (!root || root.tagName === 'BODY') return
    const parent = root.parentElement!
    const clone = root.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-hve-id')
    clone.querySelectorAll('[data-hve-id]').forEach((e) => e.removeAttribute('data-hve-id'))
    this.history.exec(
      new CallbackCommand(
        '复制页',
        () => {
          parent.insertBefore(clone, root.nextSibling)
          this.sync()
        },
        () => {
          clone.remove()
          this.sync()
        },
      ),
    )
  }

  remove(i: number): void {
    const root = this.roots[i]
    if (!root || root.tagName === 'BODY' || this.roots.length <= 1) return
    const parent = root.parentElement!
    const next = root.nextSibling
    this.history.exec(
      new CallbackCommand(
        '删除页',
        () => {
          root.remove()
          this.sync()
        },
        () => {
          parent.insertBefore(root, next)
          this.sync()
        },
      ),
    )
  }

  move(i: number, dir: -1 | 1): void {
    const j = i + dir
    if (j < 0 || j >= this.roots.length) return
    const oldOrder = [...this.roots]
    const newOrder = [...this.roots]
    ;[newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]]
    this.history.exec(
      new CallbackCommand(
        '调整页序',
        () => {
          reorderContiguous(newOrder)
          this.sync()
        },
        () => {
          reorderContiguous(oldOrder)
          this.sync()
        },
      ),
    )
  }

  /** 重新广播当前幻灯片状态（切换激活编辑器时同步 UI 用） */
  broadcast(): void {
    this.emit()
  }

  /** 随滚动同步「当前页」：取在视口内可见高度最大的那一页；仅在变化时广播，不触发滚动 */
  syncCurrentToScroll(): void {
    if (this.roots.length < 2) return
    const vh = this.host.win.innerHeight || 1
    let best = this.current
    let bestVis = -Infinity
    this.roots.forEach((r, i) => {
      const rect = r.getBoundingClientRect()
      const vis = Math.min(rect.bottom, vh) - Math.max(rect.top, 0)
      if (vis > bestVis) {
        bestVis = vis
        best = i
      }
    })
    if (best !== this.current) {
      this.current = best
      this.emit()
    }
  }

  /** 结构操作后重建并广播 */
  private sync(): void {
    this.rebuild()
    if (this.current >= this.roots.length) this.current = this.roots.length - 1
    this.emit()
  }

  private emit(): void {
    this.bus.emit('slides-changed', { slides: this.list(), current: this.current, mode: this.mode })
  }
}

/** 把一组连续的兄弟节点按给定顺序重排（假设它们是相邻兄弟） */
function reorderContiguous(order: HTMLElement[]): void {
  if (!order.length) return
  const parent = order[0].parentElement
  if (!parent) return
  const set = new Set<Node>(order)
  // 锚点 = DOM 中这组节点之前的那个非本组节点（先于 detach 计算）
  const children = Array.from(parent.childNodes)
  const firstIdx = children.findIndex((n) => set.has(n))
  const anchor = firstIdx > 0 ? children[firstIdx - 1] : null
  // 先全部摘下，再按目标顺序插回锚点之后
  for (const n of order) n.remove()
  const ref = anchor ? anchor.nextSibling : parent.firstChild
  for (const n of order) parent.insertBefore(n, ref)
}
