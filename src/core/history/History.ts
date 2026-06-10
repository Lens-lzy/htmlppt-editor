import type { Command } from '../types'
import type { EventBus } from '../EventBus'

/**
 * 撤销/重做双栈。所有 DOM 改动的唯一写入路径。
 *
 * - exec(cmd): 执行并入栈（会调用 cmd.do()）
 * - pushApplied(cmd): 入栈但不执行（用于拖动/缩放——过程已实时预览，结束时只记账）
 * 两者都会尝试与栈顶命令合并（coalesceWith），把连续操作收敛成一条。
 */
export class History {
  private undoStack: Command[] = []
  private redoStack: Command[] = []

  constructor(private bus: EventBus) {}

  exec(cmd: Command): void {
    cmd.do()
    this.record(cmd)
  }

  /** 命令的最终态已经被实时预览应用，这里只入栈不再 do() */
  pushApplied(cmd: Command): void {
    this.record(cmd)
  }

  private record(cmd: Command): void {
    const top = this.undoStack[this.undoStack.length - 1]
    if (top && top.coalesceWith && top.coalesceWith(cmd)) {
      // 已合并进栈顶，不新增
    } else {
      this.undoStack.push(cmd)
    }
    this.redoStack.length = 0
    this.emit()
  }

  undo(): void {
    const cmd = this.undoStack.pop()
    if (!cmd) return
    cmd.undo()
    this.redoStack.push(cmd)
    this.emit()
  }

  redo(): void {
    const cmd = this.redoStack.pop()
    if (!cmd) return
    cmd.do()
    this.undoStack.push(cmd)
    this.emit()
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  reset(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.emit()
  }

  private emit(): void {
    this.bus.emit('history-changed', { canUndo: this.canUndo, canRedo: this.canRedo })
  }
}
