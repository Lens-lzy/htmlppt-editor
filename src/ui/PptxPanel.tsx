import { useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import { getCore } from './core-instance'
import { activeTab } from './state'
import { importPptx } from '../core/pptx/import'

type Status = 'idle' | 'working' | 'done' | 'error'

const status = signal<Status>('idle')
const message = signal('')
const result = signal<{
  html: string
  name: string
  slideCount: number
  warnings: string[]
  animated: boolean
} | null>(null)

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
    result.value = res
    status.value = 'done'
    message.value = `已转换 ${res.slideCount} 页。`
  } catch (e) {
    status.value = 'error'
    message.value = '转换失败：' + ((e as Error).message || String(e))
  }
}

function openInEditor(): void {
  const r = result.value
  if (!r) return
  void getCore().openFromHtml(r.html, r.name + '.html')
  activeTab.value = 'editor'
}

function downloadHtml(): void {
  const r = result.value
  if (!r) return
  const blob = new Blob([r.html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = r.name + '.html'
  a.click()
  URL.revokeObjectURL(url)
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
      <input
        ref={inputRef}
        type="file"
        accept=".pptx"
        style={{ display: 'none' }}
        onChange={onInput}
      />

      {st !== 'done' && (
        <div
          class={'ppx-drop' + (st === 'working' ? ' is-busy' : '')}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={st === 'working' ? undefined : onPick}
        >
          <div class="ppx-drop-icon">{st === 'working' ? '⏳' : '📊'}</div>
          <div class="ppx-drop-title">
            {st === 'working' ? '正在转换…' : '把 PPTX 文件拖到这里'}
          </div>
          <div class="ppx-drop-sub">
            {st === 'working' ? message.value : '或点击选择 .pptx 文件 —— 本地解析，不上传、不使用 AI'}
          </div>
          {st === 'error' && <div class="ppx-error">{message.value}</div>}
        </div>
      )}

      {st === 'done' && res && (
        <div class="ppx-result">
          <div class="ppx-result-bar">
            <div class="ppx-result-info">
              <strong>{res.name}</strong>
              <span class="ppx-badge">{res.slideCount} 页</span>
              {res.animated && <span class="ppx-badge ppx-badge-ok">含动画 · 可放映</span>}
              {res.warnings.length > 0 && (
                <span class="ppx-badge ppx-badge-warn">{res.warnings.length} 条提示</span>
              )}
            </div>
            <div class="ppx-result-actions">
              <button class="hve-primary" onClick={openInEditor}>
                ✏️ 在编辑器中打开
              </button>
              <button onClick={downloadHtml}>⬇️ 下载 HTML</button>
              <button onClick={reset}>↺ 转换其它文件</button>
            </div>
          </div>
          <div class="ppx-preview">
            <iframe class="ppx-preview-frame" srcdoc={res.html} title="预览" />
          </div>
          {res.warnings.length > 0 && (
            <details class="ppx-warnings">
              <summary>转换提示（{res.warnings.length}）</summary>
              <ul>
                {res.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {st === 'idle' && (
        <div class="ppx-hint">
          确定性还原文字、图片、自定义形状、表格、连接线、渐变、主题配色与版式背景；动画/转场会转成可放映效果
          （结果预览右下角「▶ 放映」，单击/方向键推进）。转换结果可直接进入左侧「HTML 编辑器」精修。
        </div>
      )}
    </div>
  )
}
