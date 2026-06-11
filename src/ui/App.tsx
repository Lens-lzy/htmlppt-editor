import { useEffect, useRef } from 'preact/hooks'
import { loaded, editing, codeOpen } from './state'
import { getCore } from './core-instance'
import { Toolbar } from './Toolbar'
import { LayersPanel } from './LayersPanel'
import { StylePanel } from './StylePanel/StylePanel'
import { SlidesStrip } from './SlidesStrip'
import { CodePanel } from './CodePanel'

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
  const stageRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  const leftW = useRef(loadW(LS_LEFT, 220))
  const rightW = useRef(loadW(LS_RIGHT, 280))
  const core = getCore()

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
      /* localStorage 不可用时忽略 */
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
    if (stageRef.current) core.mount(stageRef.current)
    applyVars()

    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey
      // 保存缓存：Ctrl/Cmd+S（文字编辑时也生效，拦截浏览器默认保存）
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void core.saveCache()
        return
      }
      if (editing.value) return // 文字编辑时让浏览器处理原生撤销
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        e.shiftKey ? core.redo() : core.undo()
      } else if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        core.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (f) core.openFromFile(f)
  }

  return (
    <div class="hve-app">
      <Toolbar />
      <div
        class="hve-main"
        ref={mainRef}
        style={{ '--left-w': leftW.current + 'px', '--right-w': rightW.current + 'px' }}
      >
        <LayersPanel />
        <Splitter onDrag={dragLeft} onEnd={persist} />
        <div class="hve-canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {/* core 在此挂载 iframe + overlay；Preact 不在 stage 内放任何子节点 */}
          <div class="hve-stage" ref={stageRef} />
          {!loaded.value && <DropHint />}
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
 * 可拖拽的分隔条：拖动时回传水平位移，松手时回调一次。
 * 拖动期间把 iframe 的 pointer-events 关掉——否则光标划过下方的沙箱 iframe 时，
 * 指针事件会被 iframe 截走，父页面收不到 pointermove，拖动会在画布区域中途卡住。
 */
function Splitter({ onDrag, onEnd }: { onDrag: (dx: number) => void; onEnd?: () => void }) {
  const start = (e: PointerEvent) => {
    e.preventDefault()
    const frame = document.querySelector<HTMLElement>('.hve-iframe')
    if (frame) frame.style.pointerEvents = 'none'
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
      if (frame) frame.style.pointerEvents = ''
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
  const core = getCore()
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
