import { describe, it, expect } from 'vitest'
import { parseColor, colorToCss } from '../model/computed'

describe('parseColor', () => {
  it('解析 rgb', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ hex: '#ff0000', alpha: 1 })
  })
  it('解析 rgba 带透明度', () => {
    const r = parseColor('rgba(0, 128, 255, 0.5)')
    expect(r.hex).toBe('#0080ff')
    expect(r.alpha).toBeCloseTo(0.5)
  })
  it('transparent -> alpha 0', () => {
    expect(parseColor('transparent')).toEqual({ hex: '#000000', alpha: 0 })
  })
  it('保留已有 hex', () => {
    expect(parseColor('#ABCDEF').hex).toBe('#abcdef')
  })
})

describe('colorToCss', () => {
  it('alpha=1 输出 hex', () => {
    expect(colorToCss('#ff0000', 1)).toBe('#ff0000')
  })
  it('alpha<1 输出 rgba', () => {
    expect(colorToCss('#0080ff', 0.5)).toBe('rgba(0, 128, 255, 0.5)')
  })
})
