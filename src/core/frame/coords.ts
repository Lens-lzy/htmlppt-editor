import type { ViewRect } from '../types'

/**
 * 把 iframe 内某元素的位置换算到「父页面视口」坐标系（用于绘制 overlay）。
 *
 * 关键点（难点 2）：
 *  - el.getBoundingClientRect() 返回的是相对 iframe 视口的坐标，已经包含了
 *    iframe 内部的滚动，所以**不要再手动加 scrollTop**。
 *  - 若用 transform:scale(zoom) 给 iframe wrapper 做画布缩放，则 iframe 内部
 *    rect 是未缩放的，需要乘 zoom；而 iframeRect 本身已是缩放后的视觉位置。
 */
export function elementViewRect(
  iframeEl: HTMLIFrameElement,
  el: HTMLElement,
  zoom: number,
): ViewRect {
  const f = iframeEl.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return {
    x: f.left + r.left * zoom,
    y: f.top + r.top * zoom,
    w: r.width * zoom,
    h: r.height * zoom,
  }
}

/** 把父页面视口坐标转成相对某容器（overlay 层）的坐标 */
export function toContainerSpace(rect: ViewRect, container: HTMLElement): ViewRect {
  const c = container.getBoundingClientRect()
  return { x: rect.x - c.left, y: rect.y - c.top, w: rect.w, h: rect.h }
}

/** 父页面鼠标位移 -> iframe 内位移（除以缩放） */
export function unscaleDelta(dx: number, dy: number, zoom: number): { dx: number; dy: number } {
  return { dx: dx / zoom, dy: dy / zoom }
}
