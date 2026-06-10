import { useRef, useState } from 'preact/hooks'
import { canUndo, canRedo, fileName, slidesState } from './state'
import { getCore } from './core-instance'
import type { SlideDetectMode } from '../core/types'

// 部署 base 路径（Vite 注入），保证示例资源在任意部署路径下都能取到
const BASE = import.meta.env.BASE_URL

const MODES: { value: SlideDetectMode; label: string }[] = [
  { value: 'auto', label: '自动识别' },
  { value: 'section', label: '按 section' },
  { value: 'selector', label: '自定义选择器' },
  { value: 'single', label: '整篇单页' },
]

export function Toolbar() {
  const core = getCore()
  const [msg, setMsg] = useState('')
  const [selector, setSelector] = useState('')
  const dirInput = useRef<HTMLInputElement>(null)
  const mode = slidesState.value.mode

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2200)
  }

  const onOpen = async () => {
    try {
      await core.openViaPicker()
    } catch (e) {
      flash((e as Error).message)
    }
  }

  const onOpenFolder = async () => {
    if (core.canPickDir) {
      try {
        await core.openFolder()
      } catch (e) {
        const m = (e as Error).message
        if (!/abort/i.test(m)) flash(m)
      }
    } else {
      dirInput.current?.click()
    }
  }

  const onDirInput = async (e: Event) => {
    const list = (e.target as HTMLInputElement).files
    if (list && list.length) {
      try {
        await core.openFolderFromInput(list)
      } catch (err) {
        flash((err as Error).message)
      }
    }
  }

  const onSave = async () => {
    const r = await core.save()
    flash(r === 'saved' ? '✓ 已存回原文件' : '✓ 已下载导出文件')
  }

  const onModeChange = (m: SlideDetectMode) => {
    if (m === 'selector') {
      core.detectSlides('selector', selector)
    } else {
      core.detectSlides(m)
    }
  }

  return (
    <header class="hve-toolbar">
      <span class="hve-logo">HTMLPPT 编辑器</span>

      <div class="hve-tb-group">
        <button onClick={onOpen} title="打开本地 HTML 文件">📂 打开</button>
        <button onClick={onOpenFolder} title="打开整个文件夹：HTML 连同它引用的图片/CSS 一起加载">
          📁 打开文件夹
        </button>
        <label class="hve-file-btn" title="拖拽或选择文件">
          选择文件
          <input
            type="file"
            accept=".html,.htm,text/html"
            onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0]
              if (f) core.openFromFile(f)
            }}
          />
        </label>
        <input
          ref={(el) => {
            dirInput.current = el
            if (el) {
              el.setAttribute('webkitdirectory', '')
              el.setAttribute('directory', '')
            }
          }}
          type="file"
          multiple
          style="display:none"
          onChange={onDirInput}
        />
      </div>

      <div class="hve-tb-group">
        <span class="hve-tb-label">示例</span>
        <button onClick={() => core.loadFromUrl(`${BASE}samples/single-page.html`, 'single-page.html')}>单页</button>
        <button onClick={() => core.loadFromUrl(`${BASE}samples/reveal-like.html`, 'reveal-like.html')}>多页</button>
      </div>

      <div class="hve-tb-group">
        <button disabled={!canUndo.value} onClick={() => core.undo()} title="撤销 Ctrl+Z">↶ 撤销</button>
        <button disabled={!canRedo.value} onClick={() => core.redo()} title="重做 Ctrl+Y">↷ 重做</button>
      </div>

      <div class="hve-tb-group">
        <span class="hve-tb-label">分页</span>
        <select
          class="hve-select"
          value={mode}
          onChange={(e) => onModeChange((e.target as HTMLSelectElement).value as SlideDetectMode)}
        >
          {MODES.map((m) => (
            <option value={m.value}>{m.label}</option>
          ))}
        </select>
        {mode === 'selector' && (
          <input
            class="hve-text hve-selector-input"
            placeholder=".slide"
            value={selector}
            onInput={(e) => setSelector((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && core.detectSlides('selector', selector)}
          />
        )}
      </div>

      <div class="hve-tb-spacer" />
      <span class="hve-filename">{fileName.value}</span>
      <button class="hve-primary" onClick={onSave} title="保存/导出">💾 保存</button>
      {msg && <span class="hve-toast">{msg}</span>}
    </header>
  )
}
