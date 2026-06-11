import { render } from 'preact'
import { EditorCore } from './core/EditorCore'
import { setCore } from './ui/core-instance'
import { connectStore } from './ui/state'
import { App } from './ui/App'
import './ui/styles.css'

const core = new EditorCore()
setCore(core)
connectStore(core)

// 仅开发构建：暴露内核给 e2e 直接加载样例（生产构建不包含）
if (import.meta.env.DEV) (window as any).__hveCore = core

render(<App />, document.getElementById('app')!)
