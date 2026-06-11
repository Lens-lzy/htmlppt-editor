import { describe, it, expect } from 'vitest'
import { computeSnap, type SnapSet, type Rect } from '../transform/snap'

// 一个候选元素：left=100,right=200,top=50,bottom=150 -> 中心 x=150,y=100
const set: SnapSet = {
  xs: [
    { pos: 100, a: 50, b: 150 }, // 左
    { pos: 150, a: 50, b: 150 }, // 中
    { pos: 200, a: 50, b: 150 }, // 右
  ],
  ys: [
    { pos: 50, a: 100, b: 200 }, // 上
    { pos: 100, a: 100, b: 200 }, // 中
    { pos: 150, a: 100, b: 200 }, // 下
  ],
}

describe('computeSnap 吸附对齐', () => {
  it('左边缘在阈值内 -> 吸附到候选左线，给出纵向辅助线', () => {
    const r: Rect = { left: 104, top: 300, right: 154, bottom: 340 } // 左 104，距 100 差 4 (<6)
    const out = computeSnap(r, { xs: set.xs, ys: [] }, 1)
    expect(out.dx).toBe(-4) // 104 -> 100
    expect(out.dy).toBe(0)
    expect(out.guides).toHaveLength(1)
    expect(out.guides[0]).toMatchObject({ orient: 'v', pos: 100 })
  })

  it('超出阈值 -> 不吸附', () => {
    const r: Rect = { left: 110, top: 300, right: 160, bottom: 340 } // 距 100 差 10 (>6)
    const out = computeSnap(r, { xs: set.xs, ys: [] }, 1)
    expect(out.dx).toBe(0)
    expect(out.guides).toHaveLength(0)
  })

  it('中心对齐优先取最近的线', () => {
    // 元素宽 50，中心在 148 -> 距中线 150 差 2，比左边缘距左线更近
    const r: Rect = { left: 123, top: 300, right: 173, bottom: 340 }
    const out = computeSnap(r, { xs: set.xs, ys: [] }, 1)
    expect(out.dx).toBe(2) // 中心 148 -> 150
    expect(out.guides[0].pos).toBe(150)
  })

  it('两轴同时吸附 -> 一纵一横两条辅助线', () => {
    const r: Rect = { left: 102, top: 47, right: 152, bottom: 87 } // 左距100=2，上距50=3
    const out = computeSnap(r, set, 1)
    expect(out.dx).toBe(-2)
    expect(out.dy).toBe(3)
    const orients = out.guides.map((g) => g.orient).sort()
    expect(orients).toEqual(['h', 'v'])
  })

  it('缩放会放大屏幕阈值（iframe 坐标阈值变小）', () => {
    // zoom=2 时屏幕 6px = iframe 3px；左距 4 应不再吸附
    const r: Rect = { left: 104, top: 300, right: 154, bottom: 340 }
    expect(computeSnap(r, { xs: set.xs, ys: [] }, 2).dx).toBe(0)
    // 左距 2 仍吸附
    const r2: Rect = { left: 102, top: 300, right: 152, bottom: 340 }
    expect(computeSnap(r2, { xs: set.xs, ys: [] }, 2).dx).toBe(-2)
  })

  it('纵向辅助线长度覆盖被拖元素与候选元素的并集', () => {
    const r: Rect = { left: 104, top: 300, right: 154, bottom: 340 } // 吸附左线，y=[300,340]
    const out = computeSnap(r, { xs: set.xs, ys: [] }, 1)
    // 候选 y=[50,150]，并集应为 [50,340]
    expect(out.guides[0].from).toBe(50)
    expect(out.guides[0].to).toBe(340)
  })
})
