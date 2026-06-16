import type { EditorCore } from '../core/EditorCore'
import { activeTab } from './state'

// 两个独立编辑器：'editor' = HTML 编辑器，'pptx' = PPTX 编辑器
export type CoreKey = 'editor' | 'pptx'

const cores: Partial<Record<CoreKey, EditorCore>> = {}

export function setCore(key: CoreKey, core: EditorCore): void {
  cores[key] = core
}

export function getCoreByKey(key: CoreKey): EditorCore {
  const c = cores[key]
  if (!c) throw new Error('EditorCore 尚未初始化：' + key)
  return c
}

/** 返回当前激活 tab 对应的编辑器 */
export function getCore(): EditorCore {
  return getCoreByKey(activeTab.value)
}
