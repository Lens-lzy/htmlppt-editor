// 颜色解析：把 DrawingML 的 srgbClr/schemeClr/sysClr/prstClr/scrgbClr + 修饰符
// （lumMod/lumOff/shade/tint/alpha/satMod...）解析为 CSS 颜色字符串。

import { children, attr, numAttr, localName } from './ooxml'
import { pctToRatio } from './units'

/** 主题 12 槽位解析后的十六进制值（不含 # 前缀的别名映射，存原始 6 位 hex） */
export interface ClrScheme {
  dk1: string
  lt1: string
  dk2: string
  lt2: string
  accent1: string
  accent2: string
  accent3: string
  accent4: string
  accent5: string
  accent6: string
  hlink: string
  folHlink: string
}

interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

const PRESET: Record<string, string> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  gray: '808080',
  grey: '808080',
}

/** schemeClr 槽位名 -> 主题键（默认色彩映射 bg1=lt1 tx1=dk1 bg2=lt2 tx2=dk2） */
function schemeKey(val: string): keyof ClrScheme | null {
  switch (val) {
    case 'tx1':
    case 'dk1':
      return 'dk1'
    case 'bg1':
    case 'lt1':
      return 'lt1'
    case 'tx2':
    case 'dk2':
      return 'dk2'
    case 'bg2':
    case 'lt2':
      return 'lt2'
    case 'accent1':
    case 'accent2':
    case 'accent3':
    case 'accent4':
    case 'accent5':
    case 'accent6':
    case 'hlink':
    case 'folHlink':
      return val
    default:
      return null
  }
}

function hexToRgb(hex: string): RGBA {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
    a: 1,
  }
}

function rgbToCss({ r, g, b, a }: RGBA): string {
  const ri = clamp255(r)
  const gi = clamp255(g)
  const bi = clamp255(b)
  if (a >= 0.999) {
    return '#' + [ri, gi, bi].map((n) => n.toString(16).padStart(2, '0')).join('')
  }
  return `rgba(${ri}, ${gi}, ${bi}, ${round3(a)})`
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = l * 255
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2rgb(p, q, h + 1 / 3) * 255, hue2rgb(p, q, h) * 255, hue2rgb(p, q, h - 1 / 3) * 255]
}

/** 按文档顺序应用颜色修饰符 */
function applyMods(base: RGBA, el: Element): RGBA {
  let { r, g, b, a } = base
  for (const mod of Array.from(el.children)) {
    const name = localName(mod)
    const v = pctToRatio(numAttr(mod, 'val', 0))
    switch (name) {
      case 'alpha':
        a *= v
        break
      case 'lumMod': {
        const [h, s, l] = rgbToHsl(r, g, b)
        ;[r, g, b] = hslToRgb(h, s, l * v)
        break
      }
      case 'lumOff': {
        const [h, s, l] = rgbToHsl(r, g, b)
        ;[r, g, b] = hslToRgb(h, s, Math.min(1, l + v))
        break
      }
      case 'shade':
        r *= v
        g *= v
        b *= v
        break
      case 'tint':
        r = r * v + 255 * (1 - v)
        g = g * v + 255 * (1 - v)
        b = b * v + 255 * (1 - v)
        break
      case 'satMod': {
        const [h, s, l] = rgbToHsl(r, g, b)
        ;[r, g, b] = hslToRgb(h, Math.min(1, s * v), l)
        break
      }
      default:
        break
    }
  }
  return { r, g, b, a }
}

/** 取颜色基色（不含修饰）。phClr 用上下文传入的占位色。 */
function baseColor(el: Element, scheme: ClrScheme, phClr?: string): RGBA | null {
  const name = localName(el)
  switch (name) {
    case 'srgbClr':
      return hexToRgb(attr(el, 'val') || '000000')
    case 'sysClr':
      return hexToRgb(attr(el, 'lastClr') || attr(el, 'val') || '000000')
    case 'schemeClr': {
      const val = attr(el, 'val') || ''
      if (val === 'phClr' && phClr) return hexToRgb(phClr)
      const key = schemeKey(val)
      return key ? hexToRgb(scheme[key]) : null
    }
    case 'prstClr':
      return hexToRgb(PRESET[attr(el, 'val') || ''] || '000000')
    case 'scrgbClr': {
      const r = (numAttr(el, 'r', 0) / 100000) * 255
      const g = (numAttr(el, 'g', 0) / 100000) * 255
      const b = (numAttr(el, 'b', 0) / 100000) * 255
      return { r, g, b, a: 1 }
    }
    default:
      return null
  }
}

/**
 * 解析一个颜色容器元素（如 a:solidFill 的子元素，或直接传入颜色元素）。
 * 传入的应是颜色元素本身（srgbClr/schemeClr/...）。
 */
export function resolveColorEl(
  colorEl: Element | null,
  scheme: ClrScheme,
  phClr?: string,
): string | null {
  if (!colorEl) return null
  const base = baseColor(colorEl, scheme, phClr)
  if (!base) return null
  return rgbToCss(applyMods(base, colorEl))
}

/** 取一个 fill/容器元素里的第一个颜色子元素并解析 */
export function colorFromContainer(
  container: Element | null,
  scheme: ClrScheme,
  phClr?: string,
): string | null {
  if (!container) return null
  for (const c of Array.from(container.children)) {
    const n = localName(c)
    if (/Clr$/.test(n)) return resolveColorEl(c, scheme, phClr)
  }
  return null
}

export { children }
