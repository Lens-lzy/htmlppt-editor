import { signal } from '@preact/signals'
import JSZip from 'jszip'
import { getCoreByKey } from './core-instance'
import { importPptx } from '../core/pptx/import'

type Status = 'idle' | 'working' | 'error'
const status = signal<Status>('idle')
const message = signal('')

// PPTX 编辑器的导出素材（供工具栏导出 ZIP / 放映用）
let pptxAssets = new Map<string, Uint8Array>()
let pptxName = 'presentation'
export const pptxAnimated = signal(false)

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/** 转换并载入 PPTX 编辑器（文件夹模式）；停留在 PPTX tab */
export async function importPptxFile(file: File): Promise<void> {
  if (!/\.pptx$/i.test(file.name)) {
    status.value = 'error'
    message.value = '请选择 .pptx 文件（旧版 .ppt 暂不支持）。'
    return
  }
  status.value = 'working'
  message.value = `正在解析 ${file.name} …`
  try {
    const buf = await file.arrayBuffer()
    pptxName = file.name.replace(/\.pptx$/i, '')
    const res = await importPptx(buf, pptxName)
    pptxAssets = res.assets
    pptxAnimated.value = res.animated
    await getCoreByKey('pptx').openFromPptx(res.html, res.assets, pptxName)
    status.value = 'idle'
    message.value = ''
  } catch (e) {
    status.value = 'error'
    message.value = '转换失败：' + ((e as Error).message || String(e))
  }
}

/** 弹出文件选择器导入（工具栏「导入 PPTX」用） */
export function pickAndImportPptx(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pptx'
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) void importPptxFile(f)
  }
  input.click()
}

function pptxHtml(): string {
  try {
    return getCoreByKey('pptx').getSourceHtml()
  } catch {
    return ''
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function extFromMime(mime: string): string {
  return mime.split('/')[1].replace('svg+xml', 'svg').replace('+xml', '').replace('jpeg', 'jpg')
}

/** 导出文件夹结构 ZIP：index.html + assets/ 图片 */
export async function downloadPptxZip(): Promise<void> {
  const zip = new JSZip()
  for (const [path, bytes] of pptxAssets) zip.file(path, bytes)
  let i = pptxAssets.size
  const seen = new Map<string, string>()
  const html = pptxHtml().replace(
    /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi,
    (m, mime: string, b64: string) => {
      const cached = seen.get(m)
      if (cached) return cached
      const rel = `assets/image${++i}.${extFromMime(mime)}`
      zip.file(rel, b64, { base64: true })
      seen.set(m, rel)
      return rel
    },
  )
  zip.file('index.html', html)
  downloadBlob(await zip.generateAsync({ type: 'blob' }), pptxName + '.zip')
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

/** 放映预览：把 assets/ 临时内联后开新窗口运行 */
export function presentPptx(): void {
  let html = pptxHtml()
  if (!html) return
  for (const [path, bytes] of pptxAssets) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    const uri = `data:${MIME[ext] || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`
    html = html.split(path).join(uri)
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

/** PPTX 编辑器的空态：导入落地页（载入后由 App 隐藏、显示编辑画布） */
export function PptxDrop() {
  const st = status.value
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (f) void importPptxFile(f)
  }
  return (
    <div class="ppx-root">
      <div
        class={'ppx-drop' + (st === 'working' ? ' is-busy' : '')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={st === 'working' ? undefined : pickAndImportPptx}
      >
        <div class="ppx-drop-icon">{st === 'working' ? '⏳' : '📊'}</div>
        <div class="ppx-drop-title">{st === 'working' ? '正在转换…' : '把 PPTX 文件拖到这里'}</div>
        <div class="ppx-drop-sub">
          {st === 'working' ? message.value : '或点击选择 .pptx —— 本地解析，不上传、不使用 AI'}
        </div>
        {st === 'error' && <div class="ppx-error">{message.value}</div>}
      </div>
      <div class="ppx-hint">
        转换后图片拆成独立 assets/ 文件并以相对路径关联，直接在本编辑器里点选、拖动、改字、调样式；
        工具栏可「下载 ZIP（含 assets 图片文件夹）」或「放映」。
      </div>
    </div>
  )
}
