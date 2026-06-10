import type { ElementId } from '../types'

interface ElementEdit {
  /** 我们覆盖过的 CSS 属性集合（值不存在这里——真相在 el.style 上） */
  styleProps: Set<string>
  /** 是否改过文字 */
  textChanged: boolean
}

/**
 * 记录「我们改了哪些元素的哪些属性」。
 * 注意：样式的真实值存在 el.style（inline）上，这里只记账，用于：
 *  - 样式面板的「已覆盖」小圆点 + 「重置此项」
 *  - 序列化时知道哪些是编辑器加的覆盖
 */
export class EditModel {
  private edits = new Map<ElementId, ElementEdit>()

  private ensure(id: ElementId): ElementEdit {
    let e = this.edits.get(id)
    if (!e) {
      e = { styleProps: new Set(), textChanged: false }
      this.edits.set(id, e)
    }
    return e
  }

  recordStyle(id: ElementId, prop: string): void {
    this.ensure(id).styleProps.add(prop)
  }

  clearStyle(id: ElementId, prop: string): void {
    this.edits.get(id)?.styleProps.delete(prop)
  }

  recordText(id: ElementId): void {
    this.ensure(id).textChanged = true
  }

  overriddenProps(id: ElementId): string[] {
    return [...(this.edits.get(id)?.styleProps ?? [])]
  }

  isOverridden(id: ElementId, prop: string): boolean {
    return this.edits.get(id)?.styleProps.has(prop) ?? false
  }

  reset(): void {
    this.edits.clear()
  }
}
