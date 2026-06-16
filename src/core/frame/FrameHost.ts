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
  /** Ctrl/Cmd+滚轮缩放：factor>1 放大；cx/cy 为 iframe 内容坐标系下的指针位置 */
  onWheelZoom?: (factor: number, cx: number, cy: number) => void
  /** 鼠标中键拖动平移：dx/dy 为屏幕像素位移 */
  onPan?: (dx: number, dy: number) => void

  constructor(
    private container: HTMLElement,
    private bus: EventBus,
    private getZoom: () => number,
    allowScripts = false,
  ) {
    this.iframe = document.createElement('iframe')
    this.iframe.className = 'hve-iframe'
    // PPTX 编辑器只加载本工具生成的可信 HTML，允许脚本以运行滚动 deck/动画运行时；
    // HTML 编辑器加载任意 HTML，保持禁脚本。
    this.iframe.setAttribute('sandbox', allowScripts ? 'allow-same-origin allow-scripts' : 'allow-same-origin')
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

  /** 应用缩放/平移：用 transform（translate+scale，原点左上）；overlay 坐标读 getBoundingClientRect 天然跟随 */
  setView(zoom: number, panX: number, panY: number): void {
    this.iframe.style.transformOrigin = '0 0'
    this.iframe.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
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
        // 放行 deck 自身的控件（右侧圆点 / 放映按钮等），让它们的点击处理器正常运行
        const t = e.target as HTMLElement
        if (t.closest?.('.pptx-dots, .pptx-play-btn, .pptx-present-overlay, .pptx-present-hint')) return
        e.preventDefault()
        e.stopPropagation()
        this.onClick?.(t, e)
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

    // Ctrl/Cmd + 滚轮：缩放（围绕指针）
    doc.addEventListener(
      'wheel',
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        this.onWheelZoom?.(factor, e.clientX, e.clientY)
      },
      { passive: false, capture: true },
    )

    // 鼠标中键拖动：抓取滚动内容（如滚动 deck 翻页），内容某轴不可滚动时才回退到 transform 平移（缩放态拖看边缘）
    let panning = false
    let snapPrev = ''
    doc.addEventListener(
      'mousedown',
      (e) => {
        if (e.button === 1) {
          e.preventDefault()
          panning = true
          doc.body.style.cursor = 'grabbing'
          // 关掉强制吸附，否则拖动滚动会被中途吸附点不停拉回，体验割裂；松手再恢复
          const root = doc.documentElement
          snapPrev = root.style.scrollSnapType
          root.style.scrollSnapType = 'none'
        }
      },
      true,
    )
    doc.addEventListener(
      'mousemove',
      (e) => {
        if (!panning) return
        const se = (doc.scrollingElement || doc.documentElement) as HTMLElement
        const canY = se.scrollHeight > se.clientHeight + 1
        const canX = se.scrollWidth > se.clientWidth + 1
        // 抓取手势：拖动方向与内容移动方向一致 -> scrollTop 反向
        if (canY) se.scrollTop -= e.movementY
        if (canX) se.scrollLeft -= e.movementX
        const restX = canX ? 0 : e.movementX
        const restY = canY ? 0 : e.movementY
        if (restX || restY) this.onPan?.(restX, restY)
      },
      true,
    )
    const endPan = () => {
      if (panning) {
        panning = false
        doc.body.style.cursor = ''
        // 恢复吸附：强制吸附会自动把最近的幻灯片吸到位
        doc.documentElement.style.scrollSnapType = snapPrev || ''
      }
    }
    doc.addEventListener('mouseup', endPan, true)
    doc.addEventListener('mouseleave', endPan, true)

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
