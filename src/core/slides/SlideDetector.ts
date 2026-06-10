import type { SlideDetectMode } from '../types'

/**
 * 多页识别启发式（难点 5）。返回每页的根元素，命中即停；全失败则单页。
 */
export function detectSlides(
  doc: Document,
  mode: SlideDetectMode,
  selector?: string,
): HTMLElement[] {
  switch (mode) {
    case 'single':
      return [doc.body]
    case 'section': {
      const els = qa(doc, 'section')
      return els.length ? els : [doc.body]
    }
    case 'selector': {
      if (!selector) return [doc.body]
      try {
        const els = qa(doc, selector)
        return els.length ? els : [doc.body]
      } catch {
        return [doc.body]
      }
    }
    case 'auto':
    default:
      return autoDetect(doc)
  }
}

function autoDetect(doc: Document): HTMLElement[] {
  // 1) reveal.js 结构
  const reveal = qa(doc, '.reveal .slides > section')
  if (reveal.length) return reveal

  // 2) 显式 slide 类/属性，且彼此是兄弟
  for (const sel of ['section.slide', '.slide', '.page', '[data-slide]']) {
    const els = qa(doc, sel)
    if (els.length >= 1 && allSiblings(els)) return els
  }

  // 3) body 下多个 <section> 直接子元素
  const sections = Array.from(doc.body.children).filter(
    (c) => c.tagName === 'SECTION',
  ) as HTMLElement[]
  if (sections.length >= 2) return sections

  // 4) 兜底：整页单页
  return [doc.body]
}

function qa(root: Document, sel: string): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[]
}

function allSiblings(els: HTMLElement[]): boolean {
  const parent = els[0].parentElement
  return !!parent && els.every((e) => e.parentElement === parent)
}

/** 取一页的标题：第一个 h1~h3 文本，否则「第 N 页」 */
export function slideTitle(root: HTMLElement, index: number): string {
  if (root.tagName === 'BODY') return '整页'
  const h = root.querySelector('h1, h2, h3')
  const t = h?.textContent?.trim()
  return t && t.length ? t.slice(0, 24) : `第 ${index + 1} 页`
}
