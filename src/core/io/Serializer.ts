export interface ExportOptions {
  /** 是否保留 data-hve-id（便于二次编辑，默认 false 最干净） */
  keepIds?: boolean
}

/**
 * 干净导出（难点 4）：克隆文档 -> 剥离编辑器注入物 -> 保留 inline 覆盖 -> 序列化。
 * 保证：原结构 100% 保留，只多出被改元素的 inline 样式覆盖。
 */
export function serialize(doc: Document, opts: ExportOptions = {}): string {
  const root = doc.documentElement.cloneNode(true) as HTMLElement

  if (!opts.keepIds) {
    root.querySelectorAll('[data-hve-id]').forEach((e) => e.removeAttribute('data-hve-id'))
  }
  // 文字编辑残留 / 编辑器注入的运行时
  root.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'))
  root.querySelectorAll('#hve-runtime, [data-hve]').forEach((e) => e.remove())
  // 编辑器模式标记（在 <html> 根上，querySelectorAll 不含根，需显式剥离）：导出后恢复为独立 deck
  root.removeAttribute('data-hve-edit')
  root.querySelectorAll('[data-hve-edit]').forEach((e) => e.removeAttribute('data-hve-edit'))
  // 以防万一：清掉所有以 hve- 开头的临时类
  root.querySelectorAll('[class]').forEach((e) => {
    const kept = e.className
      .toString()
      .split(/\s+/)
      .filter((c) => c && !c.startsWith('hve-'))
    if (kept.length) e.setAttribute('class', kept.join(' '))
    else e.removeAttribute('class')
  })

  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>'
  return `${doctype}\n${root.outerHTML}\n`
}
