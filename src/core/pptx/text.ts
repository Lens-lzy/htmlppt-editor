// txBody（文本框正文）解析为 HTML。
// 结构：txBody > (bodyPr 锚定/内边距) + a:p 段落 > a:r 文字段(rPr 样式 + a:t 文本) / a:br 换行。

import { child, children, attr, numAttr, localName } from './ooxml'
import { fontSzToPx, emuToPx, round } from './units'
import { colorFromContainer } from './color'
import type { ClrScheme } from './color'
import type { Theme } from './theme'

export interface TextDefaults {
  /** 缺省字号(px)、颜色、字体——用于占位符/继承缺失时兜底 */
  sizePx?: number
  color?: string
  bold?: boolean
  align?: string
  latin?: string
  ea?: string
}

export interface TextCtx {
  scheme: ClrScheme
  theme: Theme
}

export interface TextResult {
  html: string
  anchor: 'flex-start' | 'center' | 'flex-end'
  insets: { l: number; t: number; r: number; b: number }
  hasText: boolean
}

const ALIGN: Record<string, string> = {
  l: 'left',
  ctr: 'center',
  r: 'right',
  just: 'justify',
  dist: 'justify',
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 已知字体的跨平台等价/回退（专有字体退到形近开源或系统字体）
const FONT_ALIASES: Record<string, string[]> = {
  微软雅黑: ['Microsoft YaHei', 'PingFang SC', 'Noto Sans SC'],
  'Microsoft YaHei': ['PingFang SC', 'Noto Sans SC'],
  等线: ['DengXian', 'PingFang SC', 'Noto Sans SC'],
  宋体: ['SimSun', 'Songti SC', 'Noto Serif SC'],
  黑体: ['SimHei', 'PingFang SC', 'Noto Sans SC'],
  '思源黑体 Medium': ['Source Han Sans SC', 'Noto Sans SC'],
  思源黑体: ['Source Han Sans SC', 'Noto Sans SC'],
  思源宋体: ['Source Han Serif SC', 'Noto Serif SC'],
  Calibri: ['Carlito'],
  Cambria: ['Caladea'],
  Verdana: ['DejaVu Sans'],
}
// 通用回退尾：保证中英文都有好字形来源
const FALLBACK_TAIL = ['PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif']

function fontFamily(latin: string, ea: string, def: TextDefaults): string {
  const names: string[] = []
  const push = (n?: string) => {
    if (!n || /^\+m[nj]-(lt|ea|cs)$/.test(n) || names.includes(n)) return
    names.push(n)
    for (const alias of FONT_ALIASES[n] || []) if (!names.includes(alias)) names.push(alias)
  }
  push(latin)
  push(ea)
  push(def.latin)
  push(def.ea)
  if (!names.length) return ''
  for (const f of FALLBACK_TAIL) if (!names.includes(f)) names.push(f)
  return names.map((n) => (n === 'sans-serif' ? n : `"${n}"`)).join(', ')
}

/** 解析 run 的 rPr -> 内联样式串 + 字体族 */
function runStyle(rPr: Element | null, ctx: TextCtx, def: TextDefaults, scale = 1): string {
  const decl: string[] = []
  const sz = numAttr(rPr, 'sz', 0)
  if (sz) decl.push(`font-size:${round(fontSzToPx(sz) * scale)}px`)
  else if (def.sizePx) decl.push(`font-size:${round(def.sizePx * scale)}px`)

  const b = attr(rPr, 'b')
  if (b === '1') decl.push('font-weight:700')
  else if (b === '0') decl.push('font-weight:400')
  else if (def.bold) decl.push('font-weight:700')

  if (attr(rPr, 'i') === '1') decl.push('font-style:italic')

  const deco: string[] = []
  const u = attr(rPr, 'u')
  if (u && u !== 'none') deco.push('underline')
  const strike = attr(rPr, 'strike')
  if (strike && strike !== 'noStrike') deco.push('line-through')
  if (deco.length) decl.push(`text-decoration:${deco.join(' ')}`)

  const fill = child(rPr, 'solidFill')
  const color = colorFromContainer(fill, ctx.scheme) || def.color
  if (color) decl.push(`color:${color}`)

  const hl = child(rPr, 'highlight')
  const hlColor = colorFromContainer(hl, ctx.scheme)
  if (hlColor) decl.push(`background-color:${hlColor}`)

  const spc = numAttr(rPr, 'spc', 0)
  if (spc) decl.push(`letter-spacing:${round(fontSzToPx(spc))}px`)

  const caps = attr(rPr, 'cap')
  if (caps === 'all') decl.push('text-transform:uppercase')
  else if (caps === 'small') decl.push('font-variant:small-caps')

  const latin = attr(child(rPr, 'latin'), 'typeface') || ''
  const ea = attr(child(rPr, 'ea'), 'typeface') || ''
  const ff = fontFamily(latin, ea, def)
  if (ff) decl.push(`font-family:${ff}`)

  return decl.join(';')
}

/** 段落 pPr -> 段落容器样式 + 项目符号信息 */
function paraStyle(
  pPr: Element | null,
  def: TextDefaults,
): { style: string; bullet: string | null; align: string } {
  const decl: string[] = ['margin:0']
  const algn = attr(pPr, 'algn') || ''
  const align = ALIGN[algn] || def.align || 'left'
  decl.push(`text-align:${align}`)

  const marL = numAttr(pPr, 'marL', 0)
  const indent = numAttr(pPr, 'indent', 0)
  if (marL) decl.push(`padding-left:${round(emuToPx(marL))}px`)
  if (indent) decl.push(`text-indent:${round(emuToPx(indent))}px`)

  // 行距
  const lnSpc = child(pPr, 'lnSpc')
  if (lnSpc) {
    const pct = child(lnSpc, 'spcPct')
    const pts = child(lnSpc, 'spcPts')
    if (pct) decl.push(`line-height:${round(numAttr(pct, 'val', 100000) / 100000, 3)}`)
    else if (pts) decl.push(`line-height:${round(fontSzToPx(numAttr(pts, 'val', 0)))}px`)
  }
  // 段前/段后
  const spcBef = child(child(pPr, 'spcBef'), 'spcPts')
  if (spcBef) decl.push(`margin-top:${round(fontSzToPx(numAttr(spcBef, 'val', 0)))}px`)
  const spcAft = child(child(pPr, 'spcAft'), 'spcPts')
  if (spcAft) decl.push(`margin-bottom:${round(fontSzToPx(numAttr(spcAft, 'val', 0)))}px`)

  // 项目符号
  let bullet: string | null = null
  if (pPr) {
    if (child(pPr, 'buNone')) bullet = null
    else {
      const buChar = child(pPr, 'buChar')
      const buAuto = child(pPr, 'buAutoNum')
      if (buChar) bullet = attr(buChar, 'char') || '•'
      else if (buAuto) bullet = '•'
    }
  }
  return { style: decl.join(';'), bullet, align }
}

function renderRun(r: Element, ctx: TextCtx, def: TextDefaults, scale: number): string {
  const t = child(r, 't')
  const text = t ? t.textContent || '' : ''
  if (!text) return ''
  const style = runStyle(child(r, 'rPr'), ctx, def, scale)
  const safe = esc(text).replace(/\n/g, '<br>')
  return `<span${style ? ` style="${style}"` : ''}>${safe}</span>`
}

export function renderTextBody(txBody: Element | null, ctx: TextCtx, def: TextDefaults = {}): TextResult {
  const bodyPr = child(txBody, 'bodyPr')
  const anchorAttr = attr(bodyPr, 'anchor') || 't'
  const anchor =
    anchorAttr === 'ctr' ? 'center' : anchorAttr === 'b' ? 'flex-end' : 'flex-start'

  // 自动缩放（shrink text on overflow）：normAutofit fontScale（十万分比）
  const normAutofit = child(bodyPr, 'normAutofit')
  const scale = normAutofit ? numAttr(normAutofit, 'fontScale', 100000) / 100000 : 1
  const noWrap = attr(bodyPr, 'wrap') === 'none'

  // 内边距：默认 lIns/rIns=91440EMU(9.6px), tIns/bIns=45720EMU(4.8px)
  const insets = {
    l: emuToPx(numAttr(bodyPr, 'lIns', 91440)),
    t: emuToPx(numAttr(bodyPr, 'tIns', 45720)),
    r: emuToPx(numAttr(bodyPr, 'rIns', 91440)),
    b: emuToPx(numAttr(bodyPr, 'bIns', 45720)),
  }

  const paras = children(txBody, 'p')
  let hasText = false
  const out: string[] = []

  for (const p of paras) {
    const pPr = child(p, 'pPr')
    const { style, bullet } = paraStyle(pPr, def)
    const inner: string[] = []
    for (const node of Array.from(p.children)) {
      const n = localName(node)
      if (n === 'r' || n === 'fld') {
        const h = renderRun(node, ctx, def, scale)
        if (h) {
          inner.push(h)
          hasText = true
        }
      } else if (n === 'br') {
        inner.push('<br>')
      }
    }
    const wrapStyle = noWrap ? `${style};white-space:nowrap` : style
    const bulletHtml = bullet && inner.length ? `<span class="pp-bu">${esc(bullet)} </span>` : ''
    if (inner.length) {
      out.push(`<div class="pp" style="${wrapStyle}">${bulletHtml}${inner.join('')}</div>`)
    } else {
      // 空段落：保留一行高度（用 endParaRPr 字号估算）
      const endPr = child(p, 'endParaRPr')
      const sz = numAttr(endPr, 'sz', 0)
      const minH = sz ? round(fontSzToPx(sz) * scale) : def.sizePx ? round(def.sizePx) : 16
      out.push(`<div class="pp" style="${style};min-height:${minH}px"><br></div>`)
    }
  }

  return { html: out.join(''), anchor, insets, hasText }
}
