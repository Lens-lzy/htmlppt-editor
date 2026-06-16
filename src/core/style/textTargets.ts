// 文字样式作用目标解析。
// 选中的常是「文本框容器」(.el-sp)，真正的文字样式落在后代 run 上（PPTX 是 <span>，
// 新建文本框是内层 <div>），且这些 run 带显式 inline 样式 —— 直接改容器不会生效、
// 读容器 computed 也读不到真实文字色。所以：改文字样式要落到 run / 段落块，读快照也从
// 代表性 run 读。

const INLINE_TAGS = new Set([
  'SPAN', 'A', 'B', 'I', 'U', 'EM', 'STRONG', 'SMALL', 'SUB', 'SUP', 'MARK', 'FONT', 'CODE', 'LABEL', 'S', 'DEL', 'INS',
])

/** 段落级属性：作用到「段落块」而非行内 run（行内设 text-align 无效） */
const PARA_PROPS = new Set(['text-align', 'line-height'])

/** 文字相关属性集合（这些才需要落到文字 run；其余按选中元素本身处理） */
export const TEXT_PROPS = new Set([
  'color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration-line',
  'font-family',
  'letter-spacing',
  'text-align',
  'line-height',
])

/** 元素是否有自己的非空白直接文字节点 */
function hasDirectText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? '').trim()) return true
  }
  return false
}

/** 容器内承载文字的「文字 run」元素（深度优先）；都没有则回退容器自身 */
export function textRuns(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  const walk = (el: HTMLElement) => {
    if (hasDirectText(el)) out.push(el)
    for (const c of Array.from(el.children)) walk(c as HTMLElement)
  }
  walk(container)
  return out.length ? out : [container]
}

/** run 最近的块级祖先（限定 container 内）：行内 run 上移到承载它的段落块 */
function nearestBlock(run: HTMLElement, container: HTMLElement): HTMLElement {
  let el: HTMLElement = run
  while (el !== container && INLINE_TAGS.has(el.tagName)) {
    el = (el.parentElement as HTMLElement | null) || container
  }
  return el
}

/** 某条文字属性应作用到哪些元素：段落属性 -> 段落块；run 属性 -> 文字 run */
export function styleTargets(container: HTMLElement, prop: string): HTMLElement[] {
  const runs = textRuns(container)
  if (PARA_PROPS.has(prop)) {
    const blocks: HTMLElement[] = []
    for (const r of runs) {
      const b = nearestBlock(r, container)
      if (!blocks.includes(b)) blocks.push(b)
    }
    return blocks
  }
  return runs
}

/** 读快照用：代表性文字 run（第一个），否则容器自身 */
export function firstTextRun(container: HTMLElement): HTMLElement {
  return textRuns(container)[0] || container
}
