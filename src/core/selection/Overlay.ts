import type { ViewRect } from '../types'
import { toContainerSpace } from '../frame/coords'
import { snapConfig, type Guide } from '../transform/snap'

export type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const HANDLES: HandleDir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/**
 * 在父页面绘制悬停框、选择框与 8 个缩放手柄。
 * overlay 层本身 pointer-events:none（让点击穿透到 iframe 选择元素）；
 * 仅「选择框主体」和「手柄」开启 pointer-events 以承接拖动/缩放手势。
 */
export class Overlay {
  private layer: HTMLElement
  private hoverBox: HTMLElement
  private selBox: HTMLElement
  private handles = new Map<HandleDir, HTMLElement>()
  private guideEls: HTMLElement[] = []
  private multiBoxes: HTMLElement[] = []

  /** 抓住选择框主体开始拖动 */
  onSelectionPointerDown?: (e: PointerEvent) => void
  /** 抓住手柄开始缩放 */
  onHandlePointerDown?: (dir: HandleDir, e: PointerEvent) => void
  /** 双击选择框 -> 进入文字编辑 */
  onSelectionDblClick?: (e: MouseEvent) => void
  /** 滚轮落在选择框/手柄上（pointer-events:auto）：转发给画布滚动/缩放，否则会被吞掉 */
  onWheel?: (e: WheelEvent) => void

  constructor(private container: HTMLElement) {
    this.layer = el('div', 'hve-overlay')
    this.hoverBox = el('div', 'hve-hover-box')
    this.selBox = el('div', 'hve-sel-box')
    this.hoverBox.style.display = 'none'
    this.selBox.style.display = 'none'

    this.selBox.addEventListener('pointerdown', (e) => {
      // 手柄自己会 stopPropagation，这里只处理选择框主体
      this.onSelectionPointerDown?.(e as PointerEvent)
    })
    this.selBox.addEventListener('dblclick', (e) => this.onSelectionDblClick?.(e))

    for (const dir of HANDLES) {
      const h = el('div', `hve-handle hve-handle-${dir}`)
      h.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.onHandlePointerDown?.(dir, e as PointerEvent)
      })
      this.handles.set(dir, h)
      this.selBox.appendChild(h)
    }

    // 选择框/手柄会捕获滚轮（pointer-events:auto），导致滚轮无法滚动下面的 iframe；
    // 在 overlay 层接住冒泡上来的 wheel 并转发给画布。passive:false 以便可 preventDefault。
    this.layer.addEventListener('wheel', (e) => this.onWheel?.(e as WheelEvent), { passive: false })

    this.layer.appendChild(this.hoverBox)
    this.layer.appendChild(this.selBox)
    container.appendChild(this.layer)
  }

  showHover(rect: ViewRect | null): void {
    if (!rect) {
      this.hoverBox.style.display = 'none'
      return
    }
    place(this.hoverBox, toContainerSpace(rect, this.container))
  }

  showSelection(rect: ViewRect | null): void {
    if (!rect) {
      this.selBox.style.display = 'none'
      return
    }
    place(this.selBox, toContainerSpace(rect, this.container))
  }

  /** 多选：画一组纯描边框（无手柄、pointer-events:none），primary 选择框另行隐藏 */
  showMulti(rects: ViewRect[]): void {
    this.clearMulti()
    for (const r of rects) {
      const b = el('div', 'hve-multi-box')
      place(b, toContainerSpace(r, this.container))
      this.layer.appendChild(b)
      this.multiBoxes.push(b)
    }
  }

  clearMulti(): void {
    for (const b of this.multiBoxes) b.remove()
    this.multiBoxes = []
  }

  /** 文字编辑期间：隐藏手柄、让选择框不拦截指针，便于直接操作 iframe 元素 */
  setEditing(on: boolean): void {
    this.selBox.classList.toggle('hve-editing', on)
  }

  /** 绘制吸附辅助线（guides 为 iframe 坐标，按 iframe 位置与缩放换算到容器空间） */
  showSnapGuides(guides: Guide[], iframeEl: HTMLIFrameElement, zoom: number): void {
    this.clearGuides()
    if (!guides.length) return
    const f = iframeEl.getBoundingClientRect()
    const c = this.container.getBoundingClientRect()
    for (const g of guides) {
      const line = el('div', `hve-guide hve-guide-${g.orient}`)
      line.style.background = snapConfig.color
      if (g.orient === 'v') {
        const x = f.left + g.pos * zoom - c.left
        const y0 = f.top + g.from * zoom - c.top
        const y1 = f.top + g.to * zoom - c.top
        line.style.left = `${x}px`
        line.style.top = `${y0}px`
        line.style.height = `${Math.max(0, y1 - y0)}px`
      } else {
        const y = f.top + g.pos * zoom - c.top
        const x0 = f.left + g.from * zoom - c.left
        const x1 = f.left + g.to * zoom - c.left
        line.style.top = `${y}px`
        line.style.left = `${x0}px`
        line.style.width = `${Math.max(0, x1 - x0)}px`
      }
      this.layer.appendChild(line)
      this.guideEls.push(line)
    }
  }

  clearGuides(): void {
    for (const e of this.guideEls) e.remove()
    this.guideEls = []
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag)
  e.className = className
  return e
}

function place(box: HTMLElement, r: ViewRect): void {
  box.style.display = 'block'
  box.style.left = `${r.x}px`
  box.style.top = `${r.y}px`
  box.style.width = `${r.w}px`
  box.style.height = `${r.h}px`
}
