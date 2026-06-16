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

/** 转换并直接载入左侧编辑器（与「HTML 编辑器」同一套侧栏/画布/样式面板） */
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
    result.value = { name, slideCount: res.slideCount, warnings: res.warnings, animated: res.animated }
    status.value = 'done'
    // 直接载入编辑器并切过去——无需再点「打开」
    await getCore().openFromHtml(res.html, name + '.html')
    activeTab.value = 'editor'
  } catch (e) {
    status.value = 'error'
    message.value = '转换失败：' + ((e as Error).message || String(e))
  }
}

/** 取当前编辑器里的 HTML（含用户编辑 + 放映运行时） */
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

function downloadHtml(): void {
  const r = result.value
  if (!r) return
  downloadBlob(new Blob([currentHtml()], { type: 'text/html' }), r.name + '.html')
}

/** 导出为文件夹结构的 ZIP：index.html + assets/ 图片（把内联 base64 拆出来） */
async function downloadZip(): Promise<void> {
  const r = result.value
  if (!r) return
  const zip = new JSZip()
  const assets = zip.folder('assets')!
  let i = 0
  const seen = new Map<string, string>()
  const html = currentHtml().replace(
    /data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi,
    (m, mime: string, b64: string) => {
      const cached = seen.get(m)
      if (cached) return cached
      const ext = mime.split('/')[1].replace('+xml', '').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
      const file = `image${++i}.${ext}`
      assets.file(file, b64, { base64: true })
      const rel = 'assets/' + file
      seen.set(m, rel)
      return rel
    },
  )
  zip.file('index.html', html)
  downloadBlob(await zip.generateAsync({ type: 'blob' }), r.name + '.zip')
}

/** 在新窗口放映（运行时脚本只在独立打开时执行） */
function present(): void {
  const html = currentHtml()
  if (!html) return
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function reset(): void {
  status.value = 'idle'
  message.value = ''
  result.value = null
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
          <div class="ppx-done-sub">{res.name}</div>
          <div class="ppx-done-actions">
            <button class="hve-primary" onClick={() => (activeTab.value = 'editor')}>
              ✏️ 去编辑器精修
            </button>
            <button onClick={() => void downloadZip()}>📦 下载 ZIP（HTML + 图片文件夹）</button>
            <button onClick={downloadHtml}>📄 下载单个 HTML</button>
            {res.animated && <button onClick={present}>▶ 放映预览</button>}
            <button onClick={reset}>↺ 转换其它文件</button>
          </div>
        </div>
      )}

      {(st === 'idle' || st === 'error') && (
        <div class="ppx-hint">
          确定性还原文字、图片、自定义形状、表格、连接线、渐变、主题配色与版式背景；动画/转场转成可放映效果。
          转换后会直接载入左侧「HTML 编辑器」，可像编辑 HTML 一样点选、拖动、改字、调样式；导出可选「单个
          HTML」或「ZIP（含 assets 图片文件夹）」。
        </div>
      )}
    </div>
  )
}
