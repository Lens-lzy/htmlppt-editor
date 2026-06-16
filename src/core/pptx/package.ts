// PPTX 包：基于 JSZip 解包，提供 XML 解析、关系（.rels）解析、媒体转 dataURI。

import JSZip from 'jszip'
import { parseXml } from './ooxml'

export interface Rel {
  id: string
  type: string
  target: string // 已解析为「包根相对」的绝对路径（无前导斜杠）
  mode?: string
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/emf',
  wmf: 'image/wmf',
}

export class PptxPackage {
  private zip: JSZip
  private xmlCache = new Map<string, Document | null>()
  private relsCache = new Map<string, Map<string, Rel>>()
  private uriCache = new Map<string, string>()

  private constructor(zip: JSZip) {
    this.zip = zip
  }

  static async load(file: File | ArrayBuffer): Promise<PptxPackage> {
    const zip = await JSZip.loadAsync(file)
    return new PptxPackage(zip)
  }

  has(path: string): boolean {
    return !!this.zip.file(norm(path))
  }

  async text(path: string): Promise<string | null> {
    const f = this.zip.file(norm(path))
    return f ? await f.async('string') : null
  }

  async xml(path: string): Promise<Document | null> {
    const p = norm(path)
    if (this.xmlCache.has(p)) return this.xmlCache.get(p)!
    const t = await this.text(p)
    const doc = t ? parseXml(t) : null
    this.xmlCache.set(p, doc)
    return doc
  }

  /** 解析某个部件的关系表：part 形如 ppt/slides/slide1.xml */
  async rels(partPath: string): Promise<Map<string, Rel>> {
    const part = norm(partPath)
    if (this.relsCache.has(part)) return this.relsCache.get(part)!
    const dir = dirname(part)
    const base = part.slice(dir.length + 1)
    const relsPath = (dir ? dir + '/' : '') + '_rels/' + base + '.rels'
    const map = new Map<string, Rel>()
    const doc = await this.xml(relsPath)
    if (doc) {
      for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
        const id = r.getAttribute('Id') || ''
        const type = r.getAttribute('Type') || ''
        const tgt = r.getAttribute('Target') || ''
        const mode = r.getAttribute('TargetMode') || undefined
        const target = mode === 'External' ? tgt : joinPath(dir, tgt)
        map.set(id, { id, type, target, mode })
      }
    }
    this.relsCache.set(part, map)
    return map
  }

  /** 媒体文件 → data URI（缓存复用，同图只编码一次） */
  async dataUri(path: string): Promise<string | null> {
    const p = norm(path)
    if (this.uriCache.has(p)) return this.uriCache.get(p)!
    const f = this.zip.file(p)
    if (!f) return null
    const b64 = await f.async('base64')
    const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase()
    const mime = MIME[ext] || 'application/octet-stream'
    const uri = `data:${mime};base64,${b64}`
    this.uriCache.set(p, uri)
    return uri
  }

  /** 媒体文件 → 原始字节 */
  async bytes(path: string): Promise<Uint8Array | null> {
    const f = this.zip.file(norm(path))
    return f ? await f.async('uint8array') : null
  }
}

/**
 * 资产登记器：把 pptx 内的媒体拆成 assets/ 下的独立文件并做去重，
 * 返回相对入口 HTML 的引用路径（assets/imageN.ext）。
 */
export class AssetRegistry {
  private map = new Map<string, string>() // 包内媒体路径 -> assets/imageN.ext
  readonly files = new Map<string, Uint8Array>() // assets/imageN.ext -> 字节
  private n = 0

  constructor(private pkg: PptxPackage) {}

  /** 登记一个媒体，返回相对引用路径；同一媒体复用同一文件（去重） */
  async ref(mediaPath: string): Promise<string | null> {
    const existing = this.map.get(mediaPath)
    if (existing) return existing
    const bytes = await this.pkg.bytes(mediaPath)
    if (!bytes) return null
    const ext = (mediaPath.slice(mediaPath.lastIndexOf('.') + 1) || 'png').toLowerCase()
    const name = `assets/image${++this.n}.${ext}`
    this.map.set(mediaPath, name)
    this.files.set(name, bytes)
    return name
  }
}

function norm(p: string): string {
  return p.replace(/^\//, '').replace(/\\/g, '/')
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

/** 把相对 target（可能含 ../）针对所在目录归一化为包根相对路径 */
function joinPath(dir: string, target: string): string {
  if (/^https?:|^data:/.test(target)) return target
  const t = target.replace(/^\//, '')
  const parts = (dir ? dir.split('/') : []).concat(t.split('/'))
  const out: string[] = []
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') out.pop()
    else out.push(seg)
  }
  return out.join('/')
}
