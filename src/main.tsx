import { render } from 'preact'
import { EditorCore } from './core/EditorCore'
import { setCore, getCore } from './ui/core-instance'
import { connectCore, activeTab } from './ui/state'
import { App } from './ui/App'
import './ui/styles.css'

// 两个完全独立的编辑器实例：各自文档/图层/撤销栈/缩放，互不影响
const coreEditor = new EditorCore()
const corePptx = new EditorCore()
setCore('editor', coreEditor)
setCore('pptx', corePptx)

// 始终只把「当前激活」的编辑器绑定到全局 signals；切 tab 时解绑旧的、绑新的并 resync。
// 用 subscribe（非 effect）以免 resync 内的 signal 读写被当成依赖而触发 Cycle。
let dispose: (() => void) | null = null
activeTab.subscribe(() => {
  const core = getCore()
  dispose?.()
  dispose = connectCore(core)
  core.resync()
})

if (import.meta.env.DEV) {
  ;(window as any).__hveCore = coreEditor
  ;(window as any).__hvePptx = corePptx
}

render(<App />, document.getElementById('app')!)
