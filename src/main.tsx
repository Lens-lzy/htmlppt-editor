import { render } from 'preact'
import { EditorCore } from './core/EditorCore'
import { setCore } from './ui/core-instance'
import { connectStore } from './ui/state'
import { App } from './ui/App'
import './ui/styles.css'

const core = new EditorCore()
setCore(core)
connectStore(core)

render(<App />, document.getElementById('app')!)
