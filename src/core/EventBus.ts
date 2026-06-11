// 极简 typed pub/sub —— 编辑内核向 UI 广播状态变化的唯一通道

export type BusEvent =
  | 'loaded' // HTML 已加载进 iframe
  | 'selection-changed' // 选中元素变化（payload: SelectionInfo | null）
  | 'style-snapshot' // 当前选中元素的样式快照刷新（payload: StyleSnapshot）
  | 'hover-changed' // 悬停元素变化
  | 'reposition' // 需要重算 overlay 位置
  | 'history-changed' // undo/redo 可用性变化（payload: {canUndo, canRedo}）
  | 'slides-changed' // 幻灯片列表/当前页变化
  | 'edit-mode-changed' // 进入/退出文字编辑（payload: boolean）
  | 'cache-saved' // 自动/手动保存了缓存（payload: 时间戳 number）
  | 'cache-available' // 打开文件时发现可恢复的缓存（payload: {ts} | null）

type Handler = (payload?: any) => void

export class EventBus {
  private map = new Map<BusEvent, Set<Handler>>()

  on(event: BusEvent, handler: Handler): () => void {
    let set = this.map.get(event)
    if (!set) {
      set = new Set()
      this.map.set(event, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  emit(event: BusEvent, payload?: any): void {
    this.map.get(event)?.forEach((h) => h(payload))
  }
}
