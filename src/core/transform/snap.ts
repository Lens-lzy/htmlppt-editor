// 拖动吸附对齐：采集其它元素的对齐线（左/中/右、上/中/下），
// 计算被拖元素到最近对齐线的吸附偏移，并给出要画的纵向/横向辅助线。
// 所有坐标都在「iframe 视口」坐标系（即 getBoundingClientRect 的值）下。

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/** 一条候选对齐线：pos = 线坐标；a,b = 该元素在垂直方向上的延展（用于辅助线长度） */
export interface Cand {
  pos: number
  a: number
  b: number
}

export interface SnapSet {
  xs: Cand[] // 纵向线（按 x 对齐）
  ys: Cand[] // 横向线（按 y 对齐）
}

/** 要绘制的辅助线（iframe 坐标）：纵向线给 x=pos、y 从 from 到 to；横向线反之 */
export interface Guide {
  orient: 'v' | 'h'
  pos: number
  from: number
  to: number
}

export interface SnapOut {
  dx: number
  dy: number
  guides: Guide[]
}

/** 吸附配置（可调）：开关 / 阈值(屏幕像素) / 辅助线颜色。UI 与控制器共享同一份。 */
export const snapConfig = {
  enabled: true,
  threshold: 6,
  color: '#ff3b6b',
}

/** 采集文档里其它元素的对齐线（排除被拖元素及其子孙）。 */
export function collectSnapTargets(doc: Document, dragged: HTMLElement): SnapSet {
  const xs: Cand[] = []
  const ys: Cand[] = []
  const body = doc.body
  if (!body) return { xs, ys }
  let n = 0
  for (const el of Array.from(body.querySelectorAll<HTMLElement>('*'))) {
    if (n++ > 800) break
    if (dragged.contains(el)) continue
    const t = el.tagName
    if (t === 'SCRIPT' || t === 'STYLE' || t === 'BR') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const mx = (r.left + r.right) / 2
    const my = (r.top + r.bottom) / 2
    xs.push(
      { pos: r.left, a: r.top, b: r.bottom },
      { pos: mx, a: r.top, b: r.bottom },
      { pos: r.right, a: r.top, b: r.bottom },
    )
    ys.push(
      { pos: r.top, a: r.left, b: r.right },
      { pos: my, a: r.left, b: r.right },
      { pos: r.bottom, a: r.left, b: r.right },
    )
  }
  return { xs, ys }
}

/**
 * 计算被拖元素当前矩形 r 对候选线的吸附结果。
 * 返回需要叠加到 translate 的偏移 (dx,dy) 与要画的辅助线（最多一纵一横）。
 */
export function computeSnap(
  r: Rect,
  set: SnapSet,
  zoom: number,
  thresholdPx: number = snapConfig.threshold,
): SnapOut {
  const thr = thresholdPx / Math.max(zoom, 1e-4)
  const cx = (r.left + r.right) / 2
  const cy = (r.top + r.bottom) / 2
  const bx = best([r.left, cx, r.right], set.xs, thr)
  const by = best([r.top, cy, r.bottom], set.ys, thr)
  const dx = bx ? bx.adjust : 0
  const dy = by ? by.adjust : 0
  const guides: Guide[] = []
  if (bx) {
    guides.push({
      orient: 'v',
      pos: bx.cand.pos,
      from: Math.min(r.top + dy, bx.cand.a),
      to: Math.max(r.bottom + dy, bx.cand.b),
    })
  }
  if (by) {
    guides.push({
      orient: 'h',
      pos: by.cand.pos,
      from: Math.min(r.left + dx, by.cand.a),
      to: Math.max(r.right + dx, by.cand.b),
    })
  }
  return { dx, dy, guides }
}

/** 缩放用：某条边 value 找最近的候选对齐线（在阈值内），返回该候选线或 null */
export function snapEdge(
  value: number,
  cands: Cand[],
  zoom: number,
  thresholdPx: number = snapConfig.threshold,
): Cand | null {
  const thr = thresholdPx / Math.max(zoom, 1e-4)
  let best: Cand | null = null
  let bestD = Infinity
  for (const c of cands) {
    const d = Math.abs(value - c.pos)
    if (d <= thr && d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/** 在若干被拖线里，找与候选线距离最近且在阈值内的一对 */
function best(
  lines: number[],
  cands: Cand[],
  thr: number,
): { diff: number; adjust: number; cand: Cand } | null {
  let b: { diff: number; adjust: number; cand: Cand } | null = null
  for (const l of lines) {
    for (const c of cands) {
      const d = Math.abs(l - c.pos)
      if (d <= thr && (!b || d < b.diff)) b = { diff: d, adjust: c.pos - l, cand: c }
    }
  }
  return b
}
