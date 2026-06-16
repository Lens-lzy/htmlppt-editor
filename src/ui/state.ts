import { signal } from '@preact/signals'
import type { EditorCore } from '../core/EditorCore'
import type { SelectionInfo, StyleSnapshot, SlideInfo, SlideDetectMode } from '../core/types'

// 全局 UI 状态：始终反映「当前激活编辑器」。切换 tab 时由 main 重新绑定到对应编辑器。
export const loaded = signal(false)
export const fileName = signal('')
export const selection = signal<SelectionInfo | null>(null)
export const styleSnapshot = signal<StyleSnapshot>({})
export const canUndo = signal(false)
export const canRedo = signal(false)
export const editing = signal(false)
export const selectedEl = signal<HTMLElement | null>(null)
export const layerVersion = signal(0)
export const codeOpen = signal(false)
export const lastSaved = signal<number | null>(null)
export const cacheAvailable = signal<{ ts: number } | null>(null)

export const slidesState = signal<{
  slides: SlideInfo[]
  current: number
  mode: SlideDetectMode
}>({ slides: [], current: 0, mode: 'auto' })

// 全局（跨编辑器共享）：当前 tab 与吸附开关
export const activeTab = signal<'editor' | 'pptx'>('editor')
export const snapOn = signal(true)

/**
 * 把一个编辑器的事件绑定到全局 signals，返回解绑函数。
 * 多编辑器时只绑定「当前激活」的那个；切换 tab 时先解绑旧的、再绑新的并 resync。
 */
export function connectCore(core: EditorCore): () => void {
  const bus = core.bus
  const offs: Array<() => void> = []
  offs.push(
    bus.on('content-state', (on: boolean) => {
      loaded.value = on
      if (!on) {
        selectedEl.value = null
        selection.value = null
      }
    }),
  )
  offs.push(
    bus.on('loaded', () => {
      loaded.value = true
      selectedEl.value = null
      layerVersion.value++
      lastSaved.value = null
    }),
  )
  offs.push(bus.on('cache-saved', (ts: number) => (lastSaved.value = ts)))
  offs.push(bus.on('cache-available', (info: { ts: number } | null) => (cacheAvailable.value = info)))
  offs.push(
    bus.on('selection-changed', (info: SelectionInfo | null) => {
      selection.value = info
      selectedEl.value = core.getSelectedEl()
    }),
  )
  offs.push(bus.on('style-snapshot', (snap: StyleSnapshot) => (styleSnapshot.value = { ...snap })))
  offs.push(
    bus.on('history-changed', (s: { canUndo: boolean; canRedo: boolean }) => {
      canUndo.value = s.canUndo
      canRedo.value = s.canRedo
    }),
  )
  offs.push(bus.on('edit-mode-changed', (on: boolean) => (editing.value = on)))
  offs.push(
    bus.on('slides-changed', (s: any) => {
      slidesState.value = s
      layerVersion.value++
    }),
  )
  return () => offs.forEach((off) => off())
}
