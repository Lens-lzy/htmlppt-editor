import type { EditorCore } from '../core/EditorCore'

let _core: EditorCore | null = null

export function setCore(c: EditorCore): void {
  _core = c
}
export function getCore(): EditorCore {
  if (!_core) throw new Error('EditorCore 尚未初始化')
  return _core
}
