import type { ViewRect } from '../types'
import { toContainerSpace } from '../frame/coords'

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

  /** 抓住选择框主体开始拖动 */
  onSelectionPointerDown?: (e: PointerEvent) => void
  /** 抓住手柄开始缩放 */
  onHandlePointerDown?: (dir: HandleDir, e: PointerEvent) => void
  /** 双击选择框 -> 进入文字编辑 */
  onSelectionDblClick?: (e: MouseEvent) => void

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

  /** 文字编辑期间：隐藏手柄、让选择框不拦截指针，便于直接操作 iframe 元素 */
  setEditing(on: boolean): void {
    this.selBox.classList.toggle('hve-editing', on)
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
