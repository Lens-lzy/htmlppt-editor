import { useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import JSZip from 'jszip'
import { getCore } from './core-instance'
import { activeTab } from './state'
import { importPptx } from '../core/pptx/import'

type Status = 'idle' | 'working' | 'done' | 'error'

const status = signal<Status>('idle')
const message = signal('')
const result = signal<{ name: string; slideCount: number; warnings: string[]; animated: boolean } | null>(
  null,
)
// 拆出的资产（相对路径 -> 字节）；导出/放映时用
let lastAssets = new Map<string, Uint8Array>()

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/** 转换并直接载入左侧编辑器（文件夹模式：图片拆成 assets/ 文件，相对引用） */
async function convert(file: File): Promise<void> {
  if (!/\.pptx$/i.test(file.name)) {
    status.value = 'error'
    message.value = '请选择 .pptx 文件（旧版 .ppt 暂不支持）。'
    return
  }
  status.value = 'working'
  message.value = `正在解析 ${file.name} …`
  result.value = null
  try {
    const buf = await file.arrayBuffer()
    const name = file.name.replace(/\.pptx$/i, '')
    const res = await importPptx(buf, name)
    lastAssets = res.assets
    result.value = { name, slideCount: res.slideCount, warnings: res.warnings, animated: res.animated }
    status.value = 'done'
    // 直接载入编辑器（文件夹模式）并切过去
    await getCore().openFromPptx(res.html, res.assets, name)
    activeTab.value = 'editor'
  } catch (e) {
    status.value = 'error'
    message.value = '转换失败：' + ((e as Error).message || String(e))
  }
}

/** 当前编辑器里的 HTML（含编辑 + 放映运行时；图片为 assets/ 相对引用） */
function currentHtml(): string {
  try {
    return getCore().getSourceHtml()
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
async function downloadZip(): Promise<void> {
  const r = result.value
  if (!r) return
  const zip = new JSZip()
  for (const [path, bytes] of lastAssets) zip.file(path, bytes)
  // 用户在编辑器里新插入的内联图片也一并拆到 assets/
  let i = lastAssets.size
  const seen = new Map<string, string>()
  const html = currentHtml().replace(
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
  downloadBlob(await zip.generateAsync({ type: 'blob' }), r.name + '.zip')
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)))
  }
  return btoa(bin)
}

/** 放映预览：把 assets/ 临时内联成 base64，开新窗口运行（仅查看，非保存） */
function present(): void {
  let html = currentHtml()
  if (!html) return
  for (const [path, bytes] of lastAssets) {
    const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
    const uri = `data:${MIME[ext] || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`
    html = html.split(path).join(uri)
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function reset(): void {
  status.value = 'idle'
  message.value = ''
  result.value = null
  lastAssets = new Map()
}

export function PptxPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const st = status.value
  const res = result.value

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (f) void convert(f)
  }
  const onPick = () => inputRef.current?.click()
  const onInput = (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]
    if (f) void convert(f)
  }

  return (
    <div class="ppx-root">
      <input ref={inputRef} type="file" accept=".pptx" style={{ display: 'none' }} onChange={onInput} />

      {(st === 'idle' || st === 'error' || st === 'working') && (
        <div
          class={'ppx-drop' + (st === 'working' ? ' is-busy' : '')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={st === 'working' ? undefined : onPick}
        >
          <div class="ppx-drop-icon">{st === 'working' ? '⏳' : '📊'}</div>
          <div class="ppx-drop-title">{st === 'working' ? '正在转换…' : '把 PPTX 文件拖到这里'}</div>
          <div class="ppx-drop-sub">
            {st === 'working' ? message.value : '或点击选择 .pptx 文件 —— 本地解析，不上传、不使用 AI'}
          </div>
          {st === 'error' && <div class="ppx-error">{message.value}</div>}
        </div>
      )}

      {st === 'done' && res && (
        <div class="ppx-done">
          <div class="ppx-done-icon">✅</div>
          <div class="ppx-done-title">
            已转换 {res.slideCount} 页并载入「HTML 编辑器」
            {res.animated && <span class="ppx-badge ppx-badge-ok">含动画</span>}
            {res.warnings.length > 0 && (
              <span class="ppx-badge ppx-badge-warn">{res.warnings.length} 条提示</span>
            )}
          </div>
          <div class="ppx-done-sub">
            {res.name} · 图片已拆为 {lastAssets.size} 个 assets 文件
          </div>
          <div class="ppx-done-actions">
            <button class="hve-primary" onClick={() => (activeTab.value = 'editor')}>
              ✏️ 去编辑器精修
            </button>
            <button onClick={() => void downloadZip()}>📦 下载 ZIP（HTML + assets 文件夹）</button>
            {res.animated && <button onClick={present}>▶ 放映预览</button>}
            <button onClick={reset}>↺ 转换其它文件</button>
          </div>
        </div>
      )}

      {(st === 'idle' || st === 'error') && (
        <div class="ppx-hint">
          确定性还原文字、图片、自定义形状、表格、连接线、渐变、主题配色与版式背景；动画/转场转成可放映效果。
          转换后图片会拆成独立的 assets/ 文件并以相对路径关联，直接载入左侧「HTML 编辑器」精修；导出为「ZIP（含
          assets 图片文件夹）」的完整网页结构。
        </div>
      )}
    </div>
  )
}
