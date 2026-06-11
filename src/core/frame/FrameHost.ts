import type { EventBus } from '../EventBus'
import type { ViewRect } from '../types'
import { elementViewRect } from './coords'

/**
 * 管理渲染目标 HTML 的 iframe。
 *
 * 设计要点：
 *  - sandbox="allow-same-origin"（不含 allow-scripts）：页面自身脚本不执行，
 *    保证静态、可预测的渲染；同时父页面仍能访问 contentDocument 做编辑。
 *  - 选择框/手柄绘制在父页面的 overlay 上，iframe 文档保持干净（导出无残留）。
 *  - 交互（hover/click/dblclick）由父页面监听 contentDocument 完成。
 */
export class FrameHost {
  readonly iframe: HTMLIFrameElement
  private interactive = true
  private rafPending = false

  onHover?: (el: HTMLElement | null) => void
  onClick?: (el: HTMLElement, e: MouseEvent) => void
  onDblClick?: (el: HTMLElement, e: MouseEvent) => void

  constructor(
    private container: HTMLElement,
    private bus: EventBus,
    private getZoom: () => number,
  ) {
    this.iframe = document.createElement('iframe')
    this.iframe.className = 'hve-iframe'
    this.iframe.setAttribute('sandbox', 'allow-same-origin')
    // 未加载内容前隐藏 iframe，避免空白白底突兀（画布暗色 + 提示更协调）
    this.iframe.style.cssText =
      'width:100%;height:100%;border:none;background:#fff;display:block;visibility:hidden;'
    container.appendChild(this.iframe)
  }

  load(html: string): Promise<void> {
    return new Promise((resolve) => {
      const onLoad = () => {
        this.iframe.removeEventListener('load', onLoad)
        this.iframe.style.visibility = 'visible'
        this.attachListeners()
        this.bus.emit('loaded')
        resolve()
      }
      this.iframe.addEventListener('load', onLoad)
      this.iframe.srcdoc = html
    })
  }

  get doc(): Document {
    return this.iframe.contentDocument!
  }
  get win(): Window {
    return this.iframe.contentWindow!
  }

  viewRect(el: HTMLElement): ViewRect {
    return elementViewRect(this.iframe, el, this.getZoom())
  }

  setInteractive(on: boolean): void {
    this.interactive = on
  }

  private attachListeners(): void {
    const doc = this.doc

    doc.addEventListener(
      'mousemove',
      (e) => {
        if (!this.interactive) return
        this.onHover?.(e.target as HTMLElement)
      },
      true,
    )
    doc.addEventListener('mouseleave', () => this.onHover?.(null), true)

    doc.addEventListener(
      'click',
      (e) => {
        if (!this.interactive) return
        e.preventDefault()
        e.stopPropagation()
        this.onClick?.(e.target as HTMLElement, e)
      },
      true,
    )

    doc.addEventListener(
      'dblclick',
      (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.onDblClick?.(e.target as HTMLElement, e)
      },
      true,
    )

    // overlay 需要跟随的所有情况：iframe 内滚动、尺寸变化、DOM 变化
    this.win.addEventListener('scroll', () => this.scheduleReposition(), true)
    new ResizeObserver(() => this.scheduleReposition()).observe(doc.documentElement)
    new MutationObserver(() => this.scheduleReposition()).observe(doc.body, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    })
    window.addEventListener('resize', () => this.scheduleReposition())
  }

  private scheduleReposition(): void {
    if (this.rafPending) return
    this.rafPending = true
    requestAnimationFrame(() => {
      this.rafPending = false
      this.bus.emit('reposition')
    })
  }
}
