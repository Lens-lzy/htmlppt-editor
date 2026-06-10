import type { Command, ElementId } from '../../types'
import type { StyleApplier } from '../../style/StyleApplier'

const COALESCE_WINDOW_MS = 700

/** 单属性样式改动（面板调色/字号等）。连续同属性改动在时间窗内合并为一条撤销。 */
export class StylePatchCommand implements Command {
  label: string
  private newVal: string
  private stamp: number

  constructor(
    private el: HTMLElement,
    private id: ElementId,
    private prop: string,
    private oldVal: string,
    newVal: string,
    private applier: StyleApplier,
  ) {
    this.newVal = newVal
    this.label = `修改 ${prop}`
    this.stamp = Date.now()
  }

  do(): void {
    this.applier.set(this.el, this.id, this.prop, this.newVal)
  }
  undo(): void {
    this.applier.set(this.el, this.id, this.prop, this.oldVal)
  }

  coalesceWith(next: Command): boolean {
    if (!(next instanceof StylePatchCommand)) return false
    if (next.id !== this.id || next.prop !== this.prop) return false
    if (next.stamp - this.stamp > COALESCE_WINDOW_MS) return false
    // 合并：保留原始 oldVal，吸收最新 newVal 与时间戳
    this.newVal = next.newVal
    this.stamp = next.stamp
    return true
  }
}

interface Change {
  prop: string
  oldVal: string
  newVal: string
}

/** 多属性一次性改动（拖动改 translate、缩放改 width+height 等），不参与合并。 */
export class MultiStylePatchCommand implements Command {
  constructor(
    private el: HTMLElement,
    private id: ElementId,
    private changes: Change[],
    private applier: StyleApplier,
    public label: string,
  ) {}

  do(): void {
    for (const c of this.changes) this.applier.set(this.el, this.id, c.prop, c.newVal)
  }
  undo(): void {
    for (const c of this.changes) this.applier.set(this.el, this.id, c.prop, c.oldVal)
  }
}
