// 文件夹资源包：把入口 HTML 同目录下被引用的图片/CSS/字体读进内存，
// 改写成 blob: URL 后再喂给 iframe.srcdoc 渲染（相对路径在 srcdoc 里本来无法解析）。
// 导出时再把 blob: URL 还原回原始相对路径，保证存回去的 HTML 干净可用。

export interface RawBundle {
  /** 以文件夹根为基准、归一化（正斜杠、无 ./）的相对路径 -> File */
  files: Map<string, File>
  /** 入口 HTML 的相对路径，如 'index.html' 或 'slides/deck.html' */
  entryPath: string
  /** 入口 HTML 文件名（展示用） */
  entryName: string
  /** File System Access 目录句柄（可回写时才有） */
  dirHandle?: FileSystemDirectoryHandle
  /** 入口 HTML 的文件句柄（可回写时才有） */
  entryHandle?: FileSystemFileHandle
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i
const EXTERNAL = /^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i

/** 需要改写 URL 的「元素 + 属性」清单 */
const ATTR_TARGETS: { sel: string; attr: string }[] = [
  { sel: 'img[src]', attr: 'src' },
  { sel: 'source[src]', attr: 'src' },
  { sel: 'video[src]', attr: 'src' },
  { sel: 'audio[src]', attr: 'src' },
  { sel: 'track[src]', attr: 'src' },
  { sel: 'video[poster]', attr: 'poster' },
  { sel: 'script[src]', attr: 'src' },
  { sel: 'image[href]', attr: 'href' },
  { sel: 'use[href]', attr: 'href' },
]

export class AssetBundle {
  private files: Map<string, File>
  readonly entryPath: string
  readonly entryName: string
  readonly entryHandle?: FileSystemFileHandle
  readonly dirHandle?: FileSystemDirectoryHandle

  /** 归一化路径 -> 已创建的 blob URL（原样文件，去重复用） */
  private pathToBlob = new Map<string, string>()
  /** blob URL -> 归一化路径（导出还原 + 面板展示） */
  private blobToPath = new Map<string, string>()
  private created: string[] = []

  constructor(raw: RawBundle) {
    this.files = raw.files
    this.entryPath = raw.entryPath
    this.entryName = raw.entryName
    this.entryHandle = raw.entryHandle
    this.dirHandle = raw.dirHandle
  }

  // ---------- 加载：改写入口 HTML ----------

  async loadEntryHtml(): Promise<string> {
    const entry = this.files.get(this.entryPath)
    if (!entry) throw new Error('找不到入口 HTML：' + this.entryPath)
    return this.rewriteHtml(await entry.text())
  }

  /** 把任意 HTML 字符串里的相对引用改写成 blob（在线编辑后重新载入时用） */
  async rewriteHtmlString(html: string): Promise<string> {
    return this.rewriteHtml(html)
  }

  private async rewriteHtml(html: string): Promise<string> {
    const dir = dirname(this.entryPath)
    const doc = new DOMParser().parseFromString(html, 'text/html')

    for (const { sel, attr } of ATTR_TARGETS) {
      doc.querySelectorAll(sel).forEach((el) => {
        const ref = el.getAttribute(attr)
        const blob = ref && this.resolveRef(ref, dir)
        if (blob) el.setAttribute(attr, blob)
      })
    }
    // SVG 旧式 xlink:href
    doc.querySelectorAll('image, use').forEach((el) => {
      const ref = el.getAttribute('xlink:href')
      const blob = ref && this.resolveRef(ref, dir)
      if (blob) el.setAttribute('xlink:href', blob)
    })
    // srcset
    doc.querySelectorAll('img[srcset], source[srcset]').forEach((el) => {
      const v = el.getAttribute('srcset')
      if (v) el.setAttribute('srcset', this.rewriteSrcset(v, dir))
    })
    // 行内 style 里的 url()
    doc.querySelectorAll('[style]').forEach((el) => {
      const v = el.getAttribute('style')
      if (v && v.includes('url(')) el.setAttribute('style', this.rewriteCssUrls(v, dir))
    })
    // <style> 块（含 @import / url()）
    for (const st of Array.from(doc.querySelectorAll('style'))) {
      const css = st.textContent || ''
      if (css.includes('url(') || css.includes('@import')) {
        st.textContent = await this.rewriteCss(css, dir)
      }
    }
    // <link>：stylesheet 读文本改写后做成 css blob；icon/preload 当普通资源
    for (const link of Array.from(doc.querySelectorAll('link[href]'))) {
      const rel = (link.getAttribute('rel') || '').toLowerCase()
      const href = link.getAttribute('href')
      if (!href || EXTERNAL.test(href)) continue
      if (rel.includes('stylesheet')) {
        const p = normalizeJoin(dir, href)
        const f = p && this.files.get(p)
        if (!f) continue
        const css = await this.rewriteCss(await f.text(), dirname(p!))
        const blob = URL.createObjectURL(new Blob([css], { type: 'text/css' }))
        this.track(blob, p!)
        link.setAttribute('href', blob)
      } else if (rel.includes('icon') || rel.includes('preload') || rel.includes('apple-touch')) {
        const blob = this.resolveRef(href, dir)
        if (blob) link.setAttribute('href', blob)
      }
    }

    const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '<!DOCTYPE html>'
    return `${doctype}\n${doc.documentElement.outerHTML}`
  }

  /** CSS 文本：内联 @import + 改写 url()，递归处理 */
  private async rewriteCss(css: string, cssDir: string, depth = 0): Promise<string> {
    if (depth > 6) return css
    const importRe =
      /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)\s*([^;]*);/g
    const imports: { full: string; target: string; media: string }[] = []
    let m: RegExpExecArray | null
    while ((m = importRe.exec(css))) {
      imports.push({ full: m[0], target: m[2] || m[4], media: (m[5] || '').trim() })
    }
    for (const imp of imports) {
      if (EXTERNAL.test(imp.target)) continue
      const p = normalizeJoin(cssDir, imp.target)
      const f = p && this.files.get(p)
      if (!f) continue
      let inner = await this.rewriteCss(await f.text(), dirname(p!), depth + 1)
      if (imp.media) inner = `@media ${imp.media}{\n${inner}\n}`
      css = css.split(imp.full).join(inner)
    }
    return this.rewriteCssUrls(css, cssDir)
  }

  private rewriteCssUrls(css: string, baseDir: string): string {
    return css.replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g, (whole, _q, ref: string) => {
      const blob = this.resolveRef(ref, baseDir)
      return blob ? `url("${blob}")` : whole
    })
  }

  private rewriteSrcset(srcset: string, baseDir: string): string {
    return srcset
      .split(',')
      .map((part) => {
        const seg = part.trim()
        if (!seg) return ''
        const sp = seg.indexOf(' ')
        const url = sp < 0 ? seg : seg.slice(0, sp)
        const desc = sp < 0 ? '' : seg.slice(sp)
        const blob = this.resolveRef(url, baseDir)
        return (blob || url) + desc
      })
      .filter(Boolean)
      .join(', ')
  }

  /** 把相对引用解析成 blob URL；外链/data/找不到则返回 null（保持原样） */
  private resolveRef(ref: string, baseDir: string): string | null {
    if (!ref || EXTERNAL.test(ref)) return null
    const p = normalizeJoin(baseDir, ref)
    return p ? this.blobUrlFor(p) : null
  }

  private blobUrlFor(path: string): string | null {
    const cached = this.pathToBlob.get(path)
    if (cached) return cached
    const file = this.files.get(path)
    if (!file) return null
    const type = file.type || mimeFromExt(path)
    const blob = !file.type && type ? new Blob([file], { type }) : file
    const url = URL.createObjectURL(blob)
    this.pathToBlob.set(path, url)
    this.track(url, path)
    return url
  }

  private track(blob: string, path: string): void {
    this.blobToPath.set(blob, path)
    this.created.push(blob)
  }

  // ---------- 导出：还原 blob -> 相对路径 ----------

  restore(html: string): string {
    let out = html
    for (const [blob, path] of this.blobToPath) {
      if (out.includes(blob)) out = out.split(blob).join(this.relFromEntry(path))
    }
    return out
  }

  // ---------- 面板：引用文件读写 ----------

  /** 文件夹里所有图片资源，供右侧下拉选择 */
  listImageAssets(): { path: string; label: string }[] {
    return Array.from(this.files.keys())
      .filter((p) => IMAGE_EXT.test(p))
      .sort()
      .map((p) => ({ path: p, label: p }))
  }

  /** 把某个文件夹资源（根相对路径）变成 blob URL 以供引用 */
  urlForAsset(path: string): string | null {
    return this.blobUrlFor(path)
  }

  /** blob URL -> 根相对路径 */
  pathForBlob(blob: string): string | null {
    return this.blobToPath.get(blob) ?? null
  }

  /** 根相对路径 -> 相对入口 HTML 的路径（导出/展示用） */
  relFromEntry(path: string): string {
    return relativePath(dirname(this.entryPath), path)
  }

  dispose(): void {
    for (const url of this.created) URL.revokeObjectURL(url)
    this.created = []
    this.pathToBlob.clear()
    this.blobToPath.clear()
  }
}

// ---------- 路径工具 ----------

function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** 把 baseDir 下的相对引用归一化成「文件夹根相对」路径；外链返回 null */
function normalizeJoin(baseDir: string, ref: string): string | null {
  if (EXTERNAL.test(ref)) return null
  try {
    const base = 'http://h/' + (baseDir ? baseDir + '/' : '')
    const u = new URL(ref, base)
    if (u.origin !== 'http://h') return null
    return decodeURIComponent(u.pathname.replace(/^\//, ''))
  } catch {
    return null
  }
}

/** 计算 toPath（文件）相对于 fromDir（目录）的路径 */
function relativePath(fromDir: string, toPath: string): string {
  const a = fromDir ? fromDir.split('/') : []
  const b = toPath.split('/')
  const file = b.pop() ?? ''
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const up = a.slice(i).map(() => '..')
  const parts = [...up, ...b.slice(i), file]
  return parts.join('/') || file
}

function mimeFromExt(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    css: 'text/css',
    js: 'text/javascript',
    html: 'text/html',
    htm: 'text/html',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
  }
  return map[ext] || ''
}
