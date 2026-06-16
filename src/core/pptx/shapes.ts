// 形状树解析：sp / pic / cxnSp / grpSp / graphicFrame(表格)。
// 组合(grpSp)的子坐标空间(chOff/chExt)在解析时累乘进变换，最终所有叶子节点
// 都被「拍平」成幻灯片绝对坐标(px)的独立元素 —— 契合编辑器的绝对定位模型。

import { child, children, attr, numAttr, localName, firstDesc, descendants } from './ooxml'
import { emuToPx, angleToDeg, round } from './units'
import { colorFromContainer, resolveColorEl } from './color'
import { renderTextBody } from './text'
import type { TextCtx } from './text'
import type { PptxPackage, Rel } from './package'
import type { ClrScheme } from './color'
import type { Theme } from './theme'

export interface ShapeCtx extends TextCtx {
  scheme: ClrScheme
  theme: Theme
  pkg: PptxPackage
  rels: Map<string, Rel>
}

/** 累积变换：slideEMU = a + localEMU * s */
interface Transform {
  ax: number
  ay: number
  sx: number
  sy: number
}

const IDENTITY: Transform = { ax: 0, ay: 0, sx: 1, sy: 1 }

interface Box {
  left: number
  top: number
  width: number
  height: number
  rot: number
  flipH: boolean
  flipV: boolean
}

function getXfrm(spPr: Element | null): {
  x: number
  y: number
  cx: number
  cy: number
  rot: number
  flipH: boolean
  flipV: boolean
} | null {
  const xfrm = child(spPr, 'xfrm')
  if (!xfrm) return null
  const off = child(xfrm, 'off')
  const ext = child(xfrm, 'ext')
  return {
    x: numAttr(off, 'x', 0),
    y: numAttr(off, 'y', 0),
    cx: numAttr(ext, 'cx', 0),
    cy: numAttr(ext, 'cy', 0),
    rot: numAttr(xfrm, 'rot', 0),
    flipH: attr(xfrm, 'flipH') === '1',
    flipV: attr(xfrm, 'flipV') === '1',
  }
}

function place(spPr: Element | null, T: Transform): Box | null {
  const f = getXfrm(spPr)
  if (!f) return null
  return {
    left: round(emuToPx(T.ax + f.x * T.sx)),
    top: round(emuToPx(T.ay + f.y * T.sy)),
    width: round(emuToPx(f.cx * T.sx)),
    height: round(emuToPx(f.cy * T.sy)),
    rot: f.rot,
    flipH: f.flipH,
    flipV: f.flipV,
  }
}

/** 由 box 生成定位 + 旋转/翻转的样式片段 */
function boxStyle(b: Box): string {
  const decl = [
    `left:${b.left}px`,
    `top:${b.top}px`,
    `width:${b.width}px`,
    `height:${b.height}px`,
  ]
  const tf: string[] = []
  if (b.rot) tf.push(`rotate(${round(angleToDeg(b.rot))}deg)`)
  if (b.flipH) tf.push('scaleX(-1)')
  if (b.flipV) tf.push('scaleY(-1)')
  if (tf.length) decl.push(`transform:${tf.join(' ')}`)
  return decl.join(';')
}

// ---------- 填充 / 边框 / 几何 ----------

/** 解析一个填充元素（solidFill/gradFill/noFill）-> CSS background 值；blipFill 单独处理 */
function fillToCss(fill: Element | null, ctx: ShapeCtx, phClr?: string): string | null {
  if (!fill) return null
  const n = localName(fill)
  if (n === 'noFill') return 'transparent'
  if (n === 'solidFill') return colorFromContainer(fill, ctx.scheme, phClr)
  if (n === 'gradFill') return gradientToCss(fill, ctx, phClr)
  return null
}

function gradientToCss(grad: Element, ctx: ShapeCtx, phClr?: string): string | null {
  const gsLst = child(grad, 'gsLst')
  if (!gsLst) return null
  const stops: string[] = []
  for (const gs of children(gsLst, 'gs')) {
    const pos = round(numAttr(gs, 'pos', 0) / 1000, 1)
    const color = colorFromGsOrFirst(gs, ctx, phClr)
    if (color) stops.push(`${color} ${pos}%`)
  }
  if (stops.length < 2) return stops[0] ? stops[0].split(' ')[0] : null
  const lin = child(grad, 'lin')
  const ang = lin ? angleToDeg(numAttr(lin, 'ang', 0)) : 90
  // DrawingML：ang 自东向顺时针；CSS linear-gradient 自上向顺时针 -> +90°
  const cssAng = round((ang + 90) % 360)
  return `linear-gradient(${cssAng}deg, ${stops.join(', ')})`
}

function colorFromGsOrFirst(gs: Element, ctx: ShapeCtx, phClr?: string): string | null {
  for (const c of Array.from(gs.children)) {
    if (/Clr$/.test(localName(c))) return resolveColorEl(c, ctx.scheme, phClr)
  }
  return null
}

/** 取形状的有效填充（显式 fill 优先；否则用 style fillRef） */
function shapeFill(spPr: Element | null, style: Element | null, ctx: ShapeCtx): string | null {
  for (const c of Array.from(spPr?.children || [])) {
    const n = localName(c)
    if (n === 'noFill') return 'transparent'
    if (n === 'solidFill' || n === 'gradFill') return fillToCss(c, ctx)
    if (n === 'blipFill') return null // 图片填充：暂按无背景处理
  }
  // style fillRef
  const fillRef = child(style, 'fillRef')
  if (fillRef) {
    const phClr = firstColorHex(fillRef, ctx)
    return colorFromContainer(fillRef, ctx.scheme, phClr) || (phClr ? '#' + phClr : null)
  }
  return null
}

function firstColorHex(el: Element | null, ctx: ShapeCtx): string | undefined {
  for (const c of Array.from(el?.children || [])) {
    if (/Clr$/.test(localName(c))) {
      const css = resolveColorEl(c, ctx.scheme)
      if (css && css.startsWith('#')) return css.slice(1)
    }
  }
  return undefined
}

/** 边框 a:ln -> CSS border 片段（含圆角无关）；无边框返回 null */
function borderCss(spPr: Element | null, ctx: ShapeCtx): string | null {
  const ln = child(spPr, 'ln')
  if (!ln) return null
  if (child(ln, 'noFill')) return null
  const w = numAttr(ln, 'w', 0)
  const widthPx = w ? Math.max(1, round(emuToPx(w))) : 1
  const color = colorFromContainer(child(ln, 'solidFill'), ctx.scheme)
  if (!color) return null
  const dash = attr(child(ln, 'prstDash'), 'val') || 'solid'
  const styleName = /dash/i.test(dash) ? 'dashed' : /dot/i.test(dash) ? 'dotted' : 'solid'
  return `border:${widthPx}px ${styleName} ${color}`
}

/** prstGeom -> 圆角/裁剪 等几何样式片段 */
function geometryCss(spPr: Element | null, b: Box): string {
  const geom = child(spPr, 'prstGeom')
  const prst = attr(geom, 'prst') || 'rect'
  switch (prst) {
    case 'roundRect': {
      const gd = child(child(geom, 'avLst'), 'gd')
      const adj = gd ? numAttr(gd, 'fmla', 0) : 0
      const frac = adj ? adj / 100000 : 0.16667
      const r = round(Math.min(b.width, b.height) * frac)
      return `border-radius:${r}px`
    }
    case 'ellipse':
      return 'border-radius:50%'
    case 'triangle':
      return 'clip-path:polygon(50% 0,100% 100%,0 100%)'
    case 'rtTriangle':
      return 'clip-path:polygon(0 0,0 100%,100% 100%)'
    case 'diamond':
      return 'clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%)'
    default:
      return ''
  }
}

function isLineGeom(spPr: Element | null): boolean {
  const prst = attr(child(spPr, 'prstGeom'), 'prst') || ''
  return prst === 'line' || prst === 'straightConnector1' || /[cC]onnector/.test(prst)
}

// ---------- 自定义几何 custGeom ----------

/** 解析 custGeom 的路径命令为 SVG path（坐标保持 EMU，返回路径空间尺寸 w/h） */
function parseCustGeom(custGeom: Element): { d: string; w: number; h: number } | null {
  const pathLst = child(custGeom, 'pathLst')
  const paths = children(pathLst, 'path')
  if (!paths.length) return null
  let w = 0
  let h = 0
  const segs: string[] = []
  for (const p of paths) {
    w = Math.max(w, numAttr(p, 'w', 0))
    h = Math.max(h, numAttr(p, 'h', 0))
    for (const cmd of Array.from(p.children)) {
      const n = localName(cmd)
      const pts = children(cmd, 'pt').map((pt) => `${numAttr(pt, 'x', 0)} ${numAttr(pt, 'y', 0)}`)
      if (n === 'moveTo' && pts[0]) segs.push('M ' + pts[0])
      else if (n === 'lnTo' && pts[0]) segs.push('L ' + pts[0])
      else if (n === 'cubicBezTo' && pts.length >= 3) segs.push('C ' + pts.slice(0, 3).join(' '))
      else if (n === 'quadBezTo' && pts.length >= 2) segs.push('Q ' + pts.slice(0, 2).join(' '))
      else if (n === 'close') segs.push('Z')
    }
  }
  if (!segs.length || w <= 0 || h <= 0) return null
  return { d: segs.join(' '), w, h }
}

/** 把 EMU 坐标的 path 按 sx/sy 缩放成 px（坐标成对出现，全局交替 x/y） */
function scalePath(d: string, sx: number, sy: number): string {
  let isX = true
  return d.replace(/-?\d+(?:\.\d+)?/g, (num) => {
    const v = Number(num) * (isX ? sx : sy)
    isX = !isX
    return String(round(v))
  })
}

/** 边框描边参数（用于 SVG 自定义形状） */
function strokeOf(spPr: Element | null, ctx: ShapeCtx): { color: string; width: number } | null {
  const ln = child(spPr, 'ln')
  if (!ln || child(ln, 'noFill')) return null
  const color = colorFromContainer(child(ln, 'solidFill'), ctx.scheme)
  if (!color) return null
  const w = numAttr(ln, 'w', 0)
  return { color, width: w ? Math.max(1, round(emuToPx(w))) : 1 }
}

/** 渲染自定义几何形状：有填充用 clip-path 单 div；仅描边用 SVG path */
function renderCustGeom(
  custGeom: Element,
  spPr: Element | null,
  style: Element | null,
  ctx: ShapeCtx,
  box: Box,
  txBody: Element | null,
  spid = '',
): string {
  const geom = parseCustGeom(custGeom)
  if (!geom) {
    // 解析失败兜底成矩形
    const fb = shapeFill(spPr, style, ctx)
    return `<div class="el el-sp"${spid} style="${boxStyle(box)}${fb && fb !== 'transparent' ? `;background:${fb}` : ''}">${renderTextLayer(txBody, ctx)}</div>`
  }
  const sx = box.width / geom.w
  const sy = box.height / geom.h
  const pxPath = scalePath(geom.d, sx, sy)
  const fill = shapeFill(spPr, style, ctx)
  const stroke = strokeOf(spPr, ctx)
  const hasFill = !!fill && fill !== 'transparent'

  if (hasFill) {
    const decl = [boxStyle(box), `background:${fill}`, `clip-path:path('${pxPath}')`]
    return `<div class="el el-sp el-custom"${spid} style="${decl.join(';')}">${renderTextLayer(txBody, ctx)}</div>`
  }
  // 仅描边（或无填充）：SVG path
  const s = stroke || { color: '#888', width: 1 }
  return (
    `<svg class="el el-custom-svg"${spid} style="${boxStyle(box)}" width="${box.width}" height="${box.height}" preserveAspectRatio="none">` +
    `<path d="${pxPath}" fill="none" stroke="${s.color}" stroke-width="${s.width}"/></svg>`
  )
}

// ---------- 各类节点渲染 ----------

function renderTextLayer(txBody: Element | null, ctx: ShapeCtx): string {
  if (!txBody) return ''
  const fontRefColor = undefined // 文字默认色交由 run 自身/继承
  const res = renderTextBody(txBody, ctx, { color: fontRefColor })
  if (!res.hasText) return ''
  const pad = `padding:${round(res.insets.t)}px ${round(res.insets.r)}px ${round(res.insets.b)}px ${round(res.insets.l)}px`
  return `<div class="el-tx" style="justify-content:${res.anchor};${pad}">${res.html}</div>`
}

function renderSp(sp: Element, ctx: ShapeCtx, T: Transform): string {
  const spPr = child(sp, 'spPr')
  const box = place(spPr, T)
  if (!box) return ''
  const style = child(sp, 'style')
  const txBody = child(sp, 'txBody')
  const spid = spidAttr(sp)

  // 连接线/直线：用 SVG 画线
  if (isLineGeom(spPr) && box.width >= 0 && box.height >= 0) {
    return renderLine(spPr, ctx, box, spid)
  }

  // 自定义几何：clip-path / SVG path 精确还原
  const custGeom = child(spPr, 'custGeom')
  if (custGeom) {
    return renderCustGeom(custGeom, spPr, style, ctx, box, txBody, spid)
  }

  const decl: string[] = [boxStyle(box)]
  const fill = shapeFill(spPr, style, ctx)
  if (fill && fill !== 'transparent') decl.push(`background:${fill}`)
  const border = borderCss(spPr, ctx)
  if (border) decl.push(border)
  const geom = geometryCss(spPr, box)
  if (geom) decl.push(geom)

  const inner = renderTextLayer(txBody, ctx)
  return `<div class="el el-sp"${spid} style="${decl.join(';')}">${inner}</div>`
}

function renderLine(spPr: Element | null, ctx: ShapeCtx, box: Box, spid = ''): string {
  const ln = child(spPr, 'ln')
  const w = numAttr(ln, 'w', 0)
  const widthPx = w ? Math.max(1, round(emuToPx(w))) : 1
  const color = colorFromContainer(child(ln, 'solidFill'), ctx.scheme) || '#000'
  const W = Math.max(1, box.width)
  const H = Math.max(1, box.height)
  // 端点：默认左上->右下；flipV 时左下->右上
  const x1 = 0
  const y1 = box.flipV ? H : 0
  const x2 = W
  const y2 = box.flipV ? 0 : H
  const dash = attr(child(ln, 'prstDash'), 'val') || 'solid'
  const dashArr = /dash/i.test(dash) ? ` stroke-dasharray="${widthPx * 3} ${widthPx * 2}"` : ''
  const posStyle = `left:${box.left}px;top:${box.top}px;width:${W}px;height:${H}px;${box.rot ? `transform:rotate(${round(angleToDeg(box.rot))}deg);` : ''}`
  return (
    `<svg class="el el-line"${spid} style="${posStyle}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${widthPx}"${dashArr}/></svg>`
  )
}

async function renderPic(pic: Element, ctx: ShapeCtx, T: Transform): Promise<string> {
  const spPr = child(pic, 'spPr')
  const box = place(spPr, T)
  if (!box) return ''
  const blip = child(child(pic, 'blipFill'), 'blip')
  const embed = attr(blip, 'r:embed') || attr(blip, 'embed')
  let uri: string | null = null
  if (embed) {
    const rel = ctx.rels.get(embed)
    if (rel && rel.mode !== 'External') uri = await ctx.pkg.dataUri(rel.target)
    else if (rel) uri = rel.target
  }
  const decl: string[] = [boxStyle(box), 'object-fit:fill']
  const geom = geometryCss(spPr, box)
  if (geom) decl.push(geom)
  const alt = attr(child(child(pic, 'nvPicPr'), 'cNvPr'), 'name') || ''
  const spid = spidAttr(pic)
  if (!uri) {
    // 找不到图片时占位
    return `<div class="el el-sp"${spid} style="${boxStyle(box)};background:#eee;border:1px dashed #bbb"></div>`
  }
  return `<img class="el el-pic"${spid} src="${uri}" alt="${escAttr(alt)}" style="${decl.join(';')}">`
}

function renderCxn(cxn: Element, ctx: ShapeCtx, T: Transform): string {
  const spPr = child(cxn, 'spPr')
  const box = place(spPr, T)
  if (!box) return ''
  return renderLine(spPr, ctx, box, spidAttr(cxn))
}

function composeTransform(grpSpPr: Element | null, T: Transform): Transform {
  const f = getXfrm(grpSpPr)
  if (!f) return T
  const xfrm = child(grpSpPr, 'xfrm')!
  const chOff = child(xfrm, 'chOff')
  const chExt = child(xfrm, 'chExt')
  const cox = numAttr(chOff, 'x', 0)
  const coy = numAttr(chOff, 'y', 0)
  const ccx = numAttr(chExt, 'cx', 0) || f.cx || 1
  const ccy = numAttr(chExt, 'cy', 0) || f.cy || 1
  const csx = f.cx / ccx
  const csy = f.cy / ccy
  return {
    sx: T.sx * csx,
    sy: T.sy * csy,
    ax: T.ax + (f.x - cox * csx) * T.sx,
    ay: T.ay + (f.y - coy * csy) * T.sy,
  }
}

/** graphicFrame 的位置框（xfrm 是直接子元素，不在 spPr 内） */
function frameBox(gf: Element, T: Transform): { left: number; top: number; width: number; height: number } {
  const xfrm = child(gf, 'xfrm')
  const off = child(xfrm, 'off')
  const ext = child(xfrm, 'ext')
  return {
    left: round(emuToPx(T.ax + numAttr(off, 'x', 0) * T.sx)),
    top: round(emuToPx(T.ay + numAttr(off, 'y', 0) * T.sy)),
    width: round(emuToPx(numAttr(ext, 'cx', 0) * T.sx)),
    height: round(emuToPx(numAttr(ext, 'cy', 0) * T.sy)),
  }
}

/** graphicFrame 分派：表格 / 图表 / SmartArt */
async function renderGraphicFrame(gf: Element, ctx: ShapeCtx, T: Transform): Promise<string> {
  const gd = child(child(gf, 'graphic'), 'graphicData')
  if (!gd) return ''
  const uri = attr(gd, 'uri') || ''
  if (uri.includes('table')) return renderTable(gf, ctx, T)
  if (uri.includes('/chart')) return renderChart(gf, gd, ctx, T)
  if (uri.includes('diagram')) return renderDiagram(gf, gd, ctx, T)
  // 未知类型：占位，避免静默丢失
  const b = frameBox(gf, T)
  return `<div class="el el-sp"${spidAttr(gf)} style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;background:#f3f3f3;border:1px dashed #ccc"></div>`
}

async function renderTable(gf: Element, ctx: ShapeCtx, T: Transform): Promise<string> {
  const fb = frameBox(gf, T)
  const left = fb.left
  const top = fb.top
  const width = fb.width

  const tbl = child(child(child(gf, 'graphic'), 'graphicData'), 'tbl')
  if (!tbl) return ''
  const grid = child(tbl, 'tblGrid')
  const colW = children(grid, 'gridCol').map((c) => round(emuToPx(numAttr(c, 'w', 0) * T.sx)))

  const rowsHtml: string[] = []
  for (const tr of children(tbl, 'tr')) {
    const h = round(emuToPx(numAttr(tr, 'h', 0) * T.sy))
    const cellsHtml: string[] = []
    for (const tc of children(tr, 'tc')) {
      if (attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1') continue
      const gridSpan = numAttr(tc, 'gridSpan', 1)
      const rowSpan = numAttr(tc, 'rowSpan', 1)
      const tcPr = child(tc, 'tcPr')
      const bg = fillToCss(child(tcPr, 'solidFill'), ctx)
      const txBody = child(tc, 'txBody')
      const res = renderTextBody(txBody, ctx)
      const cstyle = [
        'border:1px solid #bbb',
        'padding:4px 6px',
        'vertical-align:middle',
        bg ? `background:${bg}` : '',
      ]
        .filter(Boolean)
        .join(';')
      const span =
        (gridSpan > 1 ? ` colspan="${gridSpan}"` : '') + (rowSpan > 1 ? ` rowspan="${rowSpan}"` : '')
      cellsHtml.push(`<td${span} style="${cstyle}">${res.html}</td>`)
    }
    rowsHtml.push(`<tr style="height:${h}px">${cellsHtml.join('')}</tr>`)
  }
  const cols = colW.map((w) => `<col style="width:${w}px">`).join('')
  const style = `left:${left}px;top:${top}px;width:${width}px;border-collapse:collapse;table-layout:fixed`
  return `<table class="el el-table"${spidAttr(gf)} style="${style}"><colgroup>${cols}</colgroup>${rowsHtml.join('')}</table>`
}

// ---------- SmartArt（复用形状渲染器渲染 dsp 回退绘图） ----------

async function renderDiagram(gf: Element, gd: Element, ctx: ShapeCtx, T: Transform): Promise<string> {
  const b = frameBox(gf, T)
  const placeholder = `<div class="el el-sp"${spidAttr(gf)} style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px;background:#f5f7fa;border:1px dashed #c5cdd8"></div>`
  // dgm:relIds 的 r:dm 指向 data 部件；data 的 rels 里 diagramDrawing -> drawing 部件
  const relIds = child(gd, 'relIds')
  const dm = attr(relIds, 'r:dm') || attr(relIds, 'dm')
  let drawingPath: string | null = null
  if (dm) {
    const dataRel = ctx.rels.get(dm)
    if (dataRel) {
      const dataRels = await ctx.pkg.rels(dataRel.target)
      for (const r of dataRels.values()) {
        if (/diagramDrawing$/.test(r.type) || /drawing/.test(r.target)) {
          drawingPath = r.target
          break
        }
      }
    }
  }
  if (!drawingPath) return placeholder
  const ddoc = await ctx.pkg.xml(drawingPath)
  const spTree = child(ddoc?.documentElement, 'spTree')
  if (!spTree) return placeholder
  const drels = await ctx.pkg.rels(drawingPath)
  // dsp 绘图内形状多为绝对坐标，沿用当前变换渲染
  const inner = await renderShapeContainer(spTree, { ...ctx, rels: drels }, T)
  return inner || placeholder
}

// ---------- 图表（chart XML -> SVG，支持柱/条/折线/饼） ----------

const CHART_COLORS = ['#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#4472C4', '#70AD47', '#264478', '#9E480E']

/** 读取一组 c:pt/c:v 的值（按 idx 排序） */
function cacheValues(container: Element | null): string[] {
  if (!container) return []
  const pts = descendants(container, 'pt')
  const arr: string[] = []
  for (const p of pts) {
    const idx = numAttr(p, 'idx', arr.length)
    const v = child(p, 'v')
    arr[idx] = v ? v.textContent || '' : ''
  }
  return arr
}

async function renderChart(gf: Element, gd: Element, ctx: ShapeCtx, T: Transform): Promise<string> {
  const b = frameBox(gf, T)
  const wrap = (svg: string) =>
    `<div class="el el-chart"${spidAttr(gf)} style="left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px">${svg}</div>`
  const placeholder = wrap(
    `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#f5f7fa;border:1px dashed #c5cdd8;color:#888;font-size:13px">图表</div>`,
  )

  const chartEl = child(gd, 'chart')
  const rid = attr(chartEl, 'r:id') || attr(chartEl, 'id')
  const rel = rid ? ctx.rels.get(rid) : null
  if (!rel) return placeholder
  const doc = await ctx.pkg.xml(rel.target)
  const plotArea = firstDesc(doc?.documentElement, 'plotArea')
  if (!plotArea) return placeholder

  // 找图表类型节点
  const types = ['barChart', 'lineChart', 'pieChart', 'doughnutChart', 'areaChart']
  let typeEl: Element | null = null
  let type = ''
  for (const t of types) {
    const e = child(plotArea, t)
    if (e) {
      typeEl = e
      type = t
      break
    }
  }
  if (!typeEl) return placeholder

  const sers = children(typeEl, 'ser')
  if (!sers.length) return placeholder
  const cats = cacheValues(firstDesc(sers[0], 'cat'))
  const series = sers.map((s) => ({
    name: (firstDesc(child(s, 'tx'), 'v')?.textContent || '').trim(),
    values: cacheValues(firstDesc(s, 'val')).map((v) => Number(v) || 0),
  }))

  const W = Math.max(40, b.width)
  const H = Math.max(40, b.height)
  let svg = ''
  if (type === 'pieChart' || type === 'doughnutChart') {
    svg = pieSvg(W, H, cats, series[0]?.values || [], type === 'doughnutChart')
  } else if (type === 'lineChart' || type === 'areaChart') {
    svg = lineSvg(W, H, cats, series, type === 'areaChart')
  } else {
    const barDir = attr(child(typeEl, 'barDir'), 'val') || 'col'
    svg = barSvg(W, H, cats, series, barDir === 'bar')
  }
  return wrap(`<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${svg}</svg>`)
}

function barSvg(W: number, H: number, cats: string[], series: { values: number[] }[], horizontal: boolean): string {
  const pad = 28
  const n = cats.length || Math.max(...series.map((s) => s.values.length), 1)
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const groups = series.length || 1
  const parts: string[] = []
  const plotW = W - pad * 2
  const plotH = H - pad * 2
  const slot = plotW / n
  for (let i = 0; i < n; i++) {
    const bw = (slot * 0.7) / groups
    for (let g = 0; g < groups; g++) {
      const v = series[g]?.values[i] || 0
      const bh = (v / max) * plotH
      const x = pad + i * slot + slot * 0.15 + g * bw
      const y = pad + plotH - bh
      parts.push(`<rect x="${round(x)}" y="${round(y)}" width="${round(bw)}" height="${round(bh)}" fill="${CHART_COLORS[g % CHART_COLORS.length]}"/>`)
    }
    if (cats[i]) parts.push(`<text x="${round(pad + i * slot + slot / 2)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#666">${escAttr(cats[i])}</text>`)
  }
  parts.push(`<line x1="${pad}" y1="${pad + plotH}" x2="${W - pad}" y2="${pad + plotH}" stroke="#ccc"/>`)
  return parts.join('')
}

function lineSvg(W: number, H: number, cats: string[], series: { values: number[] }[], area: boolean): string {
  const pad = 28
  const n = Math.max(cats.length, ...series.map((s) => s.values.length), 1)
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const plotW = W - pad * 2
  const plotH = H - pad * 2
  const px = (i: number) => pad + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const py = (v: number) => pad + plotH - (v / max) * plotH
  const parts: string[] = []
  series.forEach((s, g) => {
    const pts = s.values.map((v, i) => `${round(px(i))},${round(py(v))}`).join(' ')
    const color = CHART_COLORS[g % CHART_COLORS.length]
    if (area) parts.push(`<polygon points="${pad},${pad + plotH} ${pts} ${pad + plotW},${pad + plotH}" fill="${color}" opacity="0.25"/>`)
    parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"/>`)
  })
  parts.push(`<line x1="${pad}" y1="${pad + plotH}" x2="${W - pad}" y2="${pad + plotH}" stroke="#ccc"/>`)
  return parts.join('')
}

function pieSvg(W: number, H: number, cats: string[], values: number[], doughnut: boolean): string {
  const cx = W / 2
  const cy = H / 2
  const r = Math.min(W, H) / 2 - 10
  const total = values.reduce((a, b) => a + b, 0) || 1
  let ang = -Math.PI / 2
  const parts: string[] = []
  values.forEach((v, i) => {
    const slice = (v / total) * Math.PI * 2
    const x1 = cx + r * Math.cos(ang)
    const y1 = cy + r * Math.sin(ang)
    ang += slice
    const x2 = cx + r * Math.cos(ang)
    const y2 = cy + r * Math.sin(ang)
    const large = slice > Math.PI ? 1 : 0
    parts.push(`<path d="M ${round(cx)} ${round(cy)} L ${round(x1)} ${round(y1)} A ${round(r)} ${round(r)} 0 ${large} 1 ${round(x2)} ${round(y2)} Z" fill="${CHART_COLORS[i % CHART_COLORS.length]}"/>`)
  })
  if (doughnut) parts.push(`<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r * 0.55)}" fill="#fff"/>`)
  return parts.join('')
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** 取节点自身的形状 id（cNvPr@id），用于动画定位（仅在页内唯一） */
function spidAttr(node: Element): string {
  const id = attr(firstDesc(node, 'cNvPr'), 'id')
  return id ? ` data-spid="${id}"` : ''
}

/** 递归渲染形状树/组合，返回拍平后的元素 HTML 列表 */
export async function renderShapeContainer(
  container: Element,
  ctx: ShapeCtx,
  T: Transform = IDENTITY,
): Promise<string> {
  const parts: string[] = []
  for (const node of Array.from(container.children)) {
    const n = localName(node)
    switch (n) {
      case 'sp':
        parts.push(renderSp(node, ctx, T))
        break
      case 'pic':
        parts.push(await renderPic(node, ctx, T))
        break
      case 'cxnSp':
        parts.push(renderCxn(node, ctx, T))
        break
      case 'grpSp': {
        const childT = composeTransform(child(node, 'grpSpPr'), T)
        parts.push(await renderShapeContainer(node, ctx, childT))
        break
      }
      case 'graphicFrame':
        parts.push(await renderGraphicFrame(node, ctx, T))
        break
      default:
        break // nvGrpSpPr / grpSpPr / 其它非内容节点
    }
  }
  return parts.filter(Boolean).join('\n')
}

export { IDENTITY, fillToCss }
export type { Transform }
