// 解析 theme*.xml：色彩方案（12 槽位）+ 字体方案（major/minor 的拉丁/东亚字体）。

import { childPath, child, children, attr, firstDesc, localName } from './ooxml'
import type { ClrScheme } from './color'

export interface Theme {
  scheme: ClrScheme
  majorLatin: string
  minorLatin: string
  majorEa: string
  minorEa: string
}

const DEFAULT_SCHEME: ClrScheme = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '44546A',
  lt2: 'E7E6E6',
  accent1: '5B9BD5',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '4472C4',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
}

/** 从一个颜色槽位元素（如 a:dk1）里取出 hex（srgbClr.val 或 sysClr.lastClr） */
function slotHex(slot: Element | null, fallback: string): string {
  if (!slot) return fallback
  const srgb = child(slot, 'srgbClr')
  if (srgb) return attr(srgb, 'val') || fallback
  const sys = child(slot, 'sysClr')
  if (sys) return attr(sys, 'lastClr') || attr(sys, 'val') || fallback
  return fallback
}

export function parseTheme(doc: Document | null): Theme {
  if (!doc) return defaultTheme()
  const themeEl = doc.documentElement
  const elements = childPath(themeEl, 'themeElements')
  const clrScheme = child(elements, 'clrScheme')
  const scheme: ClrScheme = { ...DEFAULT_SCHEME }
  if (clrScheme) {
    const keys: (keyof ClrScheme)[] = [
      'dk1',
      'lt1',
      'dk2',
      'lt2',
      'accent1',
      'accent2',
      'accent3',
      'accent4',
      'accent5',
      'accent6',
      'hlink',
      'folHlink',
    ]
    for (const k of keys) scheme[k] = slotHex(child(clrScheme, k), DEFAULT_SCHEME[k])
  }

  const fontScheme = child(elements, 'fontScheme')
  const major = child(fontScheme, 'majorFont')
  const minor = child(fontScheme, 'minorFont')

  return {
    scheme,
    majorLatin: latinFace(major) || 'Calibri',
    minorLatin: latinFace(minor) || 'Calibri',
    majorEa: eaFace(major) || '',
    minorEa: eaFace(minor) || '',
  }
}

function latinFace(font: Element | null): string {
  return attr(child(font, 'latin'), 'typeface') || ''
}

/** 东亚字体：优先 <a:ea>，为空时回退到 Hans script 字体（简体中文常见） */
function eaFace(font: Element | null): string {
  const ea = attr(child(font, 'ea'), 'typeface')
  if (ea) return ea
  for (const f of children(font, 'font')) {
    if (attr(f, 'script') === 'Hans') return attr(f, 'typeface') || ''
  }
  return ''
}

function defaultTheme(): Theme {
  return {
    scheme: { ...DEFAULT_SCHEME },
    majorLatin: 'Calibri',
    minorLatin: 'Calibri',
    majorEa: '',
    minorEa: '',
  }
}

export { firstDesc, localName }
