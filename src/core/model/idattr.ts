import type { ElementId } from '../types'

export const HVE_ID_ATTR = 'data-hve-id'

let counter = 0

/** 重置 id 计数器（加载新文档时调用） */
export function resetIds(): void {
  counter = 0
}

/** 惰性分配 id：元素第一次被改动时才打 data-hve-id，保证未改元素导出最干净 */
export function ensureId(el: HTMLElement): ElementId {
  let id = el.getAttribute(HVE_ID_ATTR)
  if (!id) {
    id = 'hve-' + ++counter
    el.setAttribute(HVE_ID_ATTR, id)
  }
  return id
}

export function findById(doc: Document, id: ElementId): HTMLElement | null {
  return doc.querySelector<HTMLElement>(`[${HVE_ID_ATTR}="${CSS.escape(id)}"]`)
}
