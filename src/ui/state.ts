import { signal } from '@preact/signals'
import type { EditorCore } from '../core/EditorCore'
import type { SelectionInfo, StyleSnapshot, SlideInfo, SlideDetectMode } from '../core/types'

// UI 响应式状态：内核通过 EventBus 广播，这里订阅并写入 signals，Preact 自动重渲染。
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
export const snapOn = signal(true)

export const slidesState = signal<{
  slides: SlideInfo[]
  current: number
  mode: SlideDetectMode
}>({ slides: [], current: 0, mode: 'auto' })

export function connectStore(core: EditorCore): void {
  const bus = core.bus
  bus.on('loaded', () => {
    loaded.value = true
    selectedEl.value = null
    layerVersion.value++
  })
  bus.on('selection-changed', (info: SelectionInfo | null) => {
    selection.value = info
    selectedEl.value = core.getSelectedEl()
  })
  bus.on('style-snapshot', (snap: StyleSnapshot) => {
    styleSnapshot.value = { ...snap }
  })
  bus.on('history-changed', (s: { canUndo: boolean; canRedo: boolean }) => {
    canUndo.value = s.canUndo
    canRedo.value = s.canRedo
  })
  bus.on('edit-mode-changed', (on: boolean) => {
    editing.value = on
  })
  bus.on('slides-changed', (s: any) => {
    slidesState.value = s
    layerVersion.value++
  })
}
