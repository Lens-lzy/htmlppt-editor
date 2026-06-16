// PPTX -> HTML 编排器：解包 -> 逐页解析（主题/背景/形状树）-> 生成自包含 HTML。
// 输出多页纵向堆叠的 <section class="slide">，图片内联为 data URI，
// 命中编辑器 SlideDetector 的 ".slide 兄弟" 识别，可直接载入精修。

import { PptxPackage, AssetRegistry } from './package'
import type { Rel } from './package'
import { child, children, attr, numAttr } from './ooxml'
import { emuToPx, round } from './units'
import { parseTheme } from './theme'
import type { Theme } from './theme'
import { colorFromContainer } from './color'
import { renderShapeContainer, fillToCss, IDENTITY } from './shapes'
import type { ShapeCtx } from './shapes'
import { parseSlideAnim, hasAnimations, ANIM_CSS, ANIM_RUNTIME } from './anim'
import type { SlideAnim } from './anim'
import { DECK_CSS, DECK_RUNTIME } from './deck'

export interface PptxImportResult {
  html: string
  name: string
  slideCount: number
  warnings: string[]
  animated: boolean
  /** 拆出的资产：相对路径(assets/imageN.ext) -> 字节 */
  assets: Map<string, Uint8Array>
}

const REL = {
  slideLayout: /slideLayout$/,
  slideMaster: /slideMaster$/,
  theme: /theme$/,
}

function findRel(rels: Map<string, Rel>, re: RegExp): Rel | null {
  for (const r of rels.values()) if (re.test(r.type)) return r
  return null
}

/** 沿 slide -> layout -> master -> theme 链解析该页的主题与版式/母版路径 */
async function resolveChain(
  pkg: PptxPackage,
  slidePath: string,
): Promise<{ theme: Theme; layoutPath: string | null; masterPath: string | null }> {
  const slideRels = await pkg.rels(slidePath)
  const layoutRel = findRel(slideRels, REL.slideLayout)
  const layoutPath = layoutRel?.target || null
  let masterPath: string | null = null
  let themePath: string | null = null
  if (layoutPath) {
    const layoutRels = await pkg.rels(layoutPath)
    masterPath = findRel(layoutRels, REL.slideMaster)?.target || null
    if (masterPath) {
      const masterRels = await pkg.rels(masterPath)
      themePath = findRel(masterRels, REL.theme)?.target || null
    }
  }
  const themeDoc = themePath ? await pkg.xml(themePath) : null
  return { theme: parseTheme(themeDoc), layoutPath, masterPath }
}

/** 取某个部件文档的背景填充元素（cSld>bg） */
function bgOf(doc: Document | null): Element | null {
  if (!doc) return null
  return child(child(doc.documentElement, 'cSld'), 'bg')
}

/** 解析背景 -> CSS background 值（slide -> layout -> master 逐级回退） */
function resolveBackground(bg: Element | null, ctx: ShapeCtx): string | null {
  if (!bg) return null
  const bgPr = child(bg, 'bgPr')
  if (bgPr) {
    for (const c of Array.from(bgPr.children)) {
      const n = c.localName
      if (n === 'solidFill' || n === 'gradFill' || n === 'noFill') return fillToCss(c, ctx)
    }
  }
  const bgRef = child(bg, 'bgRef')
  if (bgRef) {
    const color = colorFromContainer(bgRef, ctx.scheme)
    if (color) return color
  }
  return null
}

async function renderSlide(
  pkg: PptxPackage,
  slidePath: string,
  warnings: string[],
  assets: AssetRegistry,
): Promise<{ section: string; anim: SlideAnim }> {
  const doc = await pkg.xml(slidePath)
  if (!doc) return { section: '', anim: { transition: null, steps: [] } }
  const { theme, layoutPath, masterPath } = await resolveChain(pkg, slidePath)
  const rels = await pkg.rels(slidePath)
  const ctx: ShapeCtx = { scheme: theme.scheme, theme, pkg, rels, assets }

  // 背景：slide -> layout -> master
  let bgCss = resolveBackground(bgOf(doc), ctx)
  if (!bgCss && layoutPath) bgCss = resolveBackground(bgOf(await pkg.xml(layoutPath)), ctx)
  if (!bgCss && masterPath) {
    const masterDoc = await pkg.xml(masterPath)
    const masterRels = await pkg.rels(masterPath)
    const masterCtx: ShapeCtx = { ...ctx, rels: masterRels }
    bgCss = resolveBackground(bgOf(masterDoc), masterCtx)
  }

  const spTree = child(child(doc.documentElement, 'cSld'), 'spTree')
  let elements = ''
  if (spTree) {
    try {
      elements = await renderShapeContainer(spTree, ctx, IDENTITY)
    } catch (e) {
      warnings.push(`解析 ${slidePath} 出错：${(e as Error).message}`)
    }
  }
  // 半透明填充需叠在白纸上（否则透出编辑器深色画布）：统一用 background-image 叠加白底
  let bg = ''
  if (bgCss && bgCss !== 'transparent') {
    const img = bgCss.startsWith('linear-gradient') ? bgCss : `linear-gradient(${bgCss},${bgCss})`
    bg = `;background-color:#fff;background-image:${img}`
  }
  const section = `<section class="slide" style="width:var(--sw);height:var(--sh)${bg}">\n${elements}\n</section>`
  return { section, anim: parseSlideAnim(doc) }
}

const BASE_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:#3a3a3a;font-family:"Microsoft YaHei","微软雅黑","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
.deck{padding:28px 0}
.slide{position:relative;margin:0 auto 28px;overflow:hidden;background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.45)}
.el{position:absolute}
/* 形状不裁剪文字（PowerPoint 文本框默认允许溢出）；纯色/圆角填充仍按 border-radius 裁切 */
.el-sp{}
.el-tx{position:absolute;inset:0;display:flex;flex-direction:column}
.pp{margin:0;line-height:1.2;word-break:break-word}
.pp-bu{opacity:.85}
.el-pic{display:block}
.el-line{position:absolute;overflow:visible}
.el-table{position:absolute;font-size:14px}
.el-table td{word-break:break-word}
.el-chart{position:absolute}
.el-chart svg{display:block;overflow:visible}
`

export async function importPptx(file: File | ArrayBuffer, name = 'presentation'): Promise<PptxImportResult> {
  const warnings: string[] = []
  const pkg = await PptxPackage.load(file)

  const presDoc = await pkg.xml('ppt/presentation.xml')
  if (!presDoc) throw new Error('无效的 PPTX：缺少 ppt/presentation.xml')

  // 幻灯片尺寸
  const sldSz = child(presDoc.documentElement, 'sldSz')
  const slideW = round(emuToPx(numAttr(sldSz, 'cx', 12192000)))
  const slideH = round(emuToPx(numAttr(sldSz, 'cy', 6858000)))

  // 幻灯片顺序：sldIdLst > sldId(r:id) -> presentation.xml.rels
  const presRels = await pkg.rels('ppt/presentation.xml')
  const sldIdLst = child(presDoc.documentElement, 'sldIdLst')
  const slidePaths: string[] = []
  for (const sldId of children(sldIdLst, 'sldId')) {
    const rid = attr(sldId, 'r:id') || attr(sldId, 'id')
    const rel = rid ? presRels.get(rid) : null
    if (rel) slidePaths.push(rel.target)
  }

  const assets = new AssetRegistry(pkg)
  const sections: string[] = []
  const anims: SlideAnim[] = []
  for (const path of slidePaths) {
    const r = await renderSlide(pkg, path, warnings, assets)
    sections.push(r.section)
    anims.push(r.anim)
  }

  const animated = hasAnimations(anims)
  const css = `:root{--sw:${slideW}px;--sh:${slideH}px}\n${BASE_CSS}${DECK_CSS}${animated ? ANIM_CSS : ''}`

  // 动画清单（仅有动画时）
  let animBlock = ''
  if (animated) {
    const manifest = JSON.stringify({ slides: anims }).replace(/</g, '\\u003c')
    animBlock =
      `\n<script id="pptx-anim" type="application/json">${manifest}</script>\n` +
      `<script>${ANIM_RUNTIME}</script>`
  }
  // 滚动 deck 运行时（始终注入：一屏一页 + 右侧圆点 + 滚动吸附）
  const deckBlock = `\n<script>${DECK_RUNTIME}</script>`

  const html =
    `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>${escHtml(name)}</title>\n<style>${css}</style>\n</head>\n` +
    `<body>\n<div class="deck">\n${sections.join('\n')}\n</div>${animBlock}${deckBlock}\n</body>\n</html>`

  return { html, name, slideCount: slidePaths.length, warnings, animated, assets: assets.files }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
