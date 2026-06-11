import { useEffect, useRef, useState } from 'preact/hooks'
import { canUndo, canRedo, fileName, slidesState, codeOpen, loaded, snapOn } from './state'
import { getCore } from './core-instance'
import { snapConfig } from '../core/transform/snap'
import type { SlideDetectMode } from '../core/types'

// 平台相关快捷键展示：Mac 用 ⌘/⇧，其它用 Ctrl/Shift
const IS_MAC = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
const UNDO_KEY = IS_MAC ? '⌘Z' : 'Ctrl+Z'
const REDO_KEY = IS_MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z'

const MODES: { value: SlideDetectMode; label: string }[] = [
  { value: 'auto', label: '自动识别' },
  { value: 'section', label: '按 section' },
  { value: 'selector', label: '自定义选择器' },
  { value: 'single', label: '整篇单页' },
]

type SearchRes = { count: number; index: number }

export function Toolbar() {
  const core = getCore()
  const [msg, setMsg] = useState('')
  const [selector, setSelector] = useState('')
  const [openMenu, setOpenMenu] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<SearchRes>({ count: 0, index: 0 })
  const openWrap = useRef<HTMLDivElement>(null)
  const mode = slidesState.value.mode

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2200)
  }

  // 换文件后清空搜索框
  useEffect(() => {
    setQ('')
    setRes({ count: 0, index: 0 })
  }, [fileName.value])

  // 点击「打开」菜单外部时关闭
  useEffect(() => {
    if (!openMenu) return
    const onDoc = (e: MouseEvent) => {
      if (openWrap.current && !openWrap.current.contains(e.target as Node)) setOpenMenu(false)
    }
    window.addEventListener('mousedown', onDoc)
    return () => window.removeEventListener('mousedown', onDoc)
  }, [openMenu])

  const openHtml = async () => {
    setOpenMenu(false)
    try {
      await core.openHtmlInteractive()
    } catch (e) {
      const m = (e as Error).message
      if (!/abort/i.test(m)) flash(m)
    }
  }

  const openFolder = async () => {
    setOpenMenu(false)
    try {
      await core.openFolderInteractive()
    } catch (e) {
      const m = (e as Error).message
      if (!/abort/i.test(m)) flash(m)
    }
  }

  const toggleSnap = () => {
    snapConfig.enabled = !snapConfig.enabled
    snapOn.value = snapConfig.enabled
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

  const runSearch = (val: string) => {
    setQ(val)
    setRes(core.search(val))
  }
  const onSearchKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setRes(e.shiftKey ? core.searchPrev() : core.searchNext())
    }
  }

  return (
    <header class="hve-toolbar">
      <span class="hve-logo">HTMLPPT 编辑器</span>

      <div class="hve-tb-group">
        <div class="hve-open" ref={openWrap}>
          <button onClick={() => setOpenMenu((v) => !v)} title="打开 HTML 文件或整个文件夹">
            📂 打开 ▾
          </button>
          {openMenu && (
            <div class="hve-menu">
              <button class="hve-menu-item" onClick={openHtml}>📄 打开 HTML 文件</button>
              <button class="hve-menu-item" onClick={openFolder}>
                📁 打开文件夹（含图片/CSS）
              </button>
            </div>
          )}
        </div>
      </div>

      <div class="hve-tb-group">
        <button disabled={!canUndo.value} onClick={() => core.undo()} title={`撤销 ${UNDO_KEY}`}>
          ↶ 撤销 <span class="hve-kbd">{UNDO_KEY}</span>
        </button>
        <button disabled={!canRedo.value} onClick={() => core.redo()} title={`重做 ${REDO_KEY}`}>
          ↷ 重做 <span class="hve-kbd">{REDO_KEY}</span>
        </button>
        <button
          disabled={!loaded.value}
          onClick={() => (codeOpen.value = true)}
          title="查看/编辑 HTML 源码，并定位选中元素所在代码行"
        >
          {'</> 代码'}
        </button>
        <button
          class={'hve-toggle' + (snapOn.value ? ' on' : '')}
          onClick={toggleSnap}
          title="拖动/缩放时吸附对齐（按住 Alt 可临时关闭）"
        >
          🧲 吸附{snapOn.value ? '开' : '关'}
        </button>
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

      <div class="hve-tb-group hve-search">
        <input
          class="hve-text hve-search-input"
          placeholder="🔍 搜索页面内容"
          value={q}
          onInput={(e) => runSearch((e.target as HTMLInputElement).value)}
          onKeyDown={onSearchKey}
        />
        <span class="hve-search-count">
          {q ? (res.count ? `${res.index}/${res.count}` : '无结果') : ''}
        </span>
        <button disabled={!res.count} onClick={() => setRes(core.searchPrev())} title="上一个 Shift+Enter">↑</button>
        <button disabled={!res.count} onClick={() => setRes(core.searchNext())} title="下一个 Enter">↓</button>
      </div>

      <div class="hve-tb-spacer" />
      <span class="hve-filename">{fileName.value}</span>
      <button class="hve-primary" onClick={onSave} title="保存/导出">💾 保存</button>
      {msg && <span class="hve-toast">{msg}</span>}
    </header>
  )
}
