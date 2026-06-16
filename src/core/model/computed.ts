import type { StyleSnapshot } from '../types'

/** 把 '12px' -> '12'，'normal' 等保持原样由调用方处理 */
function stripPx(v: string): string {
  return v.endsWith('px') ? v.slice(0, -2) : v
}

/** 解析 rgb()/rgba()/颜色关键字 -> { hex, alpha } */
export function parseColor(input: string): { hex: string; alpha: number } {
  const s = (input || '').trim()
  if (!s || s === 'transparent') return { hex: '#000000', alpha: 0 }
  const m = s.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(',').map((p) => p.trim())
    const r = clamp255(parseFloat(parts[0]))
    const g = clamp255(parseFloat(parts[1]))
    const b = clamp255(parseFloat(parts[2]))
    const a = parts[3] !== undefined ? clampUnit(parseFloat(parts[3])) : 1
    return { hex: '#' + toHex(r) + toHex(g) + toHex(b), alpha: a }
  }
  // 已经是 #rrggbb 或其它，尽量原样返回
  if (/^#[0-9a-f]{6}$/i.test(s)) return { hex: s.toLowerCase(), alpha: 1 }
  return { hex: '#000000', alpha: 1 }
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(isNaN(n) ? 0 : n)))
}
function clampUnit(n: number): number {
  return Math.max(0, Math.min(1, isNaN(n) ? 1 : n))
}
function toHex(n: number): string {
  return n.toString(16).padStart(2, '0')
}

/** 把 hex + alpha 合成 CSS 颜色字符串（alpha<1 用 rgba） */
export function colorToCss(hex: string, alpha: number): string {
  if (alpha >= 1) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${round2(alpha)})`
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** 读取元素的旋转角度（来自 CSS `rotate` 长属性） */
export function readRotateDeg(cs: CSSStyleDeclaration): string {
  const r = (cs as any).rotate as string | undefined
  if (!r || r === 'none') return '0'
  const m = r.match(/(-?[\d.]+)deg/)
  return m ? m[1] : '0'
}

/**
 * 读取选中元素的 computed style，归一化成样式面板用的快照。
 */
export function readSnapshot(el: HTMLElement, win: Window): StyleSnapshot {
  const cs = win.getComputedStyle(el)
  const snap: StyleSnapshot = {}

  const color = parseColor(cs.color)
  snap.color = color.hex

  const bg = parseColor(cs.backgroundColor)
  snap.backgroundColor = bg.hex
  snap.backgroundAlpha = String(bg.alpha)

  snap.fontSize = stripPx(cs.fontSize)
  snap.fontFamily = cs.fontFamily
  snap.fontWeight = cs.fontWeight
  snap.fontStyle = cs.fontStyle
  snap.textDecorationLine = cs.textDecorationLine
  snap.textAlign = cs.textAlign
  snap.lineHeight = cs.lineHeight === 'normal' ? '' : stripPx(cs.lineHeight)
  snap.letterSpacing = cs.letterSpacing === 'normal' ? '0' : stripPx(cs.letterSpacing)

  snap.borderRadius = stripPx(cs.borderTopLeftRadius)
  snap.borderWidth = stripPx(cs.borderTopWidth)
  snap.borderStyle = cs.borderTopStyle
  snap.borderColor = parseColor(cs.borderTopColor).hex

  snap.opacity = cs.opacity
  snap.rotate = readRotateDeg(cs)
  snap.boxShadow = cs.boxShadow === 'none' ? '' : cs.boxShadow
  snap.textShadow = cs.textShadow === 'none' ? '' : cs.textShadow

  for (const side of ['Top', 'Right', 'Bottom', 'Left'] as const) {
    snap['padding' + side] = stripPx((cs as any)['padding' + side])
    snap['margin' + side] = stripPx((cs as any)['margin' + side])
  }

  return snap
}
