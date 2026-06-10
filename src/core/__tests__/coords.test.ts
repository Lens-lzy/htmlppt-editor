import { describe, it, expect } from 'vitest'
import { elementViewRect, unscaleDelta } from '../frame/coords'

function fakeRect(left: number, top: number, width: number, height: number) {
  return { getBoundingClientRect: () => ({ left, top, width, height }) } as any
}

describe('elementViewRect', () => {
  it('zoom=1：iframe 偏移 + 元素内部坐标相加', () => {
    const iframe = fakeRect(100, 50, 800, 600)
    const el = fakeRect(20, 10, 200, 40)
    expect(elementViewRect(iframe, el, 1)).toEqual({ x: 120, y: 60, w: 200, h: 40 })
  })
  it('zoom=0.5：内部坐标与尺寸乘以缩放', () => {
    const iframe = fakeRect(100, 50, 400, 300)
    const el = fakeRect(20, 10, 200, 40)
    expect(elementViewRect(iframe, el, 0.5)).toEqual({ x: 110, y: 55, w: 100, h: 20 })
  })
})

describe('unscaleDelta', () => {
  it('父页面位移除以缩放得到 iframe 内位移', () => {
    expect(unscaleDelta(50, 20, 0.5)).toEqual({ dx: 100, dy: 40 })
  })
})
