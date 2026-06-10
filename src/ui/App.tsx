import { useEffect, useRef } from 'preact/hooks'
import { loaded, editing } from './state'
import { getCore } from './core-instance'
import { Toolbar } from './Toolbar'
import { LayersPanel } from './LayersPanel'
import { StylePanel } from './StylePanel/StylePanel'
import { SlidesStrip } from './SlidesStrip'

export function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const core = getCore()

  useEffect(() => {
    if (stageRef.current) core.mount(stageRef.current)

    const onKey = (e: KeyboardEvent) => {
      if (editing.value) return // 文字编辑时让浏览器处理原生撤销
      const meta = e.ctrlKey || e.metaKey
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
      <div class="hve-main">
        <LayersPanel />
        <div class="hve-canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          {/* core 在此挂载 iframe + overlay；Preact 不在 stage 内放任何子节点 */}
          <div class="hve-stage" ref={stageRef} />
          {!loaded.value && <DropHint />}
        </div>
        <StylePanel />
      </div>
      <SlidesStrip />
    </div>
  )
}

function DropHint() {
  return (
    <div class="hve-drophint">
      <div class="hve-drophint-box">
        <div class="hve-drophint-icon">🖼️</div>
        <div class="hve-drophint-title">把一个 HTML 文件拖到这里</div>
        <div class="hve-drophint-sub">
          或点击左上角「打开 / 选择文件」；HTML 引用了图片/CSS 时用「📁 打开文件夹」
        </div>
        <div class="hve-drophint-tip">
          点选元素 · 拖动位置 · 角点缩放 · 双击改字 · 右栏调样式 · 保存回干净 HTML
        </div>
      </div>
    </div>
  )
}
