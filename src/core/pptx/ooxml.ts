// OOXML 解析小工具：DrawingML/PresentationML 用固定前缀（a:/p:/r:），
// 但为稳妥起见一律按 localName 匹配，避免命名空间差异导致查询落空。

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

function local(el: Element): string {
  return el.localName || el.tagName.replace(/^.*:/, '')
}

/** 第一个 localName 匹配的直接子元素 */
export function child(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null
  for (const c of Array.from(el.children)) if (local(c) === name) return c
  return null
}

/** 所有 localName 匹配的直接子元素 */
export function children(el: Element | null | undefined, name: string): Element[] {
  if (!el) return []
  return Array.from(el.children).filter((c) => local(c) === name)
}

/** 沿 localName 链逐层取子元素 */
export function childPath(el: Element | null | undefined, ...names: string[]): Element | null {
  let cur: Element | null = el ?? null
  for (const n of names) {
    cur = child(cur, n)
    if (!cur) return null
  }
  return cur
}

/** 深度优先收集所有 localName 匹配的后代 */
export function descendants(el: Element | null | undefined, name: string): Element[] {
  if (!el) return []
  const out: Element[] = []
  const walk = (e: Element) => {
    for (const c of Array.from(e.children)) {
      if (local(c) === name) out.push(c)
      walk(c)
    }
  }
  walk(el)
  return out
}

/** 第一个 localName 匹配的后代 */
export function firstDesc(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null
  for (const c of Array.from(el.children)) {
    if (local(c) === name) return c
    const deep = firstDesc(c, name)
    if (deep) return deep
  }
  return null
}

/** 取属性（按限定名字符串匹配，含 r:embed / xml:lang 这类带前缀属性） */
export function attr(el: Element | null | undefined, name: string): string | null {
  return el ? el.getAttribute(name) : null
}

/** 取属性并转数字，缺失/非法返回默认值 */
export function numAttr(el: Element | null | undefined, name: string, def = 0): number {
  const v = attr(el, name)
  if (v == null) return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

export function localName(el: Element): string {
  return local(el)
}
