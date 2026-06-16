import { useEffect, useRef } from 'preact/hooks'
import { loaded, editing, codeOpen, activeTab } from './state'
import { getCore, getCoreByKey } from './core-instance'
import { Toolbar } from './Toolbar'
import { LayersPanel } from './LayersPanel'
import { StylePanel } from './StylePanel/StylePanel'
import { SlidesStrip } from './SlidesStrip'
import { CodePanel } from './CodePanel'
import { PptxDrop } from './PptxPanel'

const LS_LEFT = 'hve-left-w'
const LS_RIGHT = 'hve-right-w'

function loadW(key: string, def: number): number {
  try {
    const n = Number(localStorage.getItem(key))
    return Number.isFinite(n) && n > 0 ? n : def
  } catch {
    return def
  }
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function App() {
  const tab = activeTab.value
  const stageEditor = useRef<HTMLDivElement>(null)
  const stagePptx = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const leftW = useRef(loadW(LS_LEFT, 220))
  const rightW = useRef(loadW(LS_RIGHT, 280))

  const applyVars = () => {
    const m = mainRef.current
    if (!m) return
    m.style.setProperty('--left-w', leftW.current + 'px')
    m.style.setProperty('--right-w', rightW.current + 'px')
  }
  const persist = () => {
    try {
      localStorage.setItem(LS_LEFT, String(leftW.current))
      localStorage.setItem(LS_RIGHT, String(rightW.current))
    } catch {
      /* ignore */
    }
  }
  const dragLeft = (dx: number) => {
    leftW.current = clamp(leftW.current + dx, 140, 520)
    applyVars()
  }
  const dragRight = (dx: number) => {
    rightW.current = clamp(rightW.current - dx, 180, 560)
    applyVars()
  }

  useEffect(() => {
    // 两个编辑器各挂到自己的舞台（iframe + overlay 各自独立，互不影响）
    if (stageEditor.current) getCoreByKey('editor').mount(stageEditor.current)
    if (stagePptx.current) getCoreByKey('pptx').mount(stagePptx.current)
    applyVars()

    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void getCore().saveCache()
        return
      }
      if (meta && e.key === '0') {
        e.preventDefault()
        getCore().resetView()
        return
      }
      if (editing.value) return
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? getCore().redo() : getCore().undo()
      } else if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        getCore().redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDropHtml = (e: DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (f) getCoreByKey('editor').openFromFile(f)
  }

  return (
    <div class="hve-root">
      <div class="hve-tabbar">
        <button
          class={'hve-tab' + (tab === 'editor' ? ' is-active' : '')}
          onClick={() => (activeTab.value = 'editor')}
        >
          📝 HTML 编辑器
        </button>
        <button
          class={'hve-tab' + (tab === 'pptx' ? ' is-active' : '')}
          onClick={() => (activeTab.value = 'pptx')}
        >
          📊 PPTX 编辑器
        </button>
      </div>

      <Toolbar />

      <div
        class="hve-main"
        ref={mainRef}
        style={{ '--left-w': leftW.current + 'px', '--right-w': rightW.current + 'px' }}
      >
        <LayersPanel />
        <Splitter onDrag={dragLeft} onEnd={persist} />
        <div
          class="hve-canvas"
          onDragOver={(e) => e.preventDefault()}
          onDrop={tab === 'editor' ? onDropHtml : (e) => e.preventDefault()}
        >
          {/* 两个舞台常驻，按 tab 切换显示；未载入内容时隐藏舞台，让空态落地页可交互 */}
          <div
            class="hve-stage"
            ref={stageEditor}
            style={{ display: tab === 'editor' && loaded.value ? 'block' : 'none' }}
          />
          <div
            class="hve-stage"
            ref={stagePptx}
            style={{ display: tab === 'pptx' && loaded.value ? 'block' : 'none' }}
          />
          {tab === 'editor' && !loaded.value && <DropHint />}
          {tab === 'pptx' && !loaded.value && <PptxDrop />}
        </div>
        <Splitter onDrag={dragRight} onEnd={persist} />
        <StylePanel />
      </div>

      <SlidesStrip />
      {codeOpen.value && <CodePanel />}
    </div>
  )
}

/**
 * 可拖拽的分隔条。拖动时关闭所有 iframe 的 pointer-events，避免指针事件被沙箱 iframe 截走。
 */
function Splitter({ onDrag, onEnd }: { onDrag: (dx: number) => void; onEnd?: () => void }) {
  const start = (e: PointerEvent) => {
    e.preventDefault()
    const frames = Array.from(document.querySelectorAll<HTMLElement>('.hve-iframe'))
    frames.forEach((f) => (f.style.pointerEvents = 'none'))
    let last = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (ev: PointerEvent) => {
      onDrag(ev.clientX - last)
      last = ev.clientX
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      frames.forEach((f) => (f.style.pointerEvents = ''))
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      onEnd?.()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return <div class="hve-splitter" onPointerDown={start} title="拖动调整宽度" />
}

function DropHint() {
  const core = getCoreByKey('editor')
  return (
    <div class="hve-drophint">
      <div class="hve-drophint-box">
        <div class="hve-drophint-icon">🖼️</div>
        <div class="hve-drophint-title">把一个 HTML 文件拖到这里</div>
        <div class="hve-drophint-sub">或选择打开方式：</div>
        <div class="hve-drophint-actions">
          <button class="hve-primary" onClick={() => core.openHtmlInteractive().catch(() => {})}>
            📄 打开 HTML 文件
          </button>
          <button onClick={() => core.openFolderInteractive().catch(() => {})}>
            📁 打开文件夹（含图片/CSS）
          </button>
        </div>
        <div class="hve-drophint-tip">
          点选元素 · 拖动位置 · 角点缩放 · 双击改字 · 右栏调样式 · 保存回干净 HTML
        </div>
      </div>
    </div>
  )
}
