import type { ElementId } from '../types'
import { EditModel } from '../model/EditModel'

/**
 * 把样式改动写成 inline style 覆盖，并在 EditModel 记账。
 * value === '' 表示清除该覆盖（恢复继承/原样式）。
 */
export class StyleApplier {
  constructor(private model: EditModel) {}

  set(el: HTMLElement, id: ElementId, prop: string, value: string): void {
    if (value === '') {
      el.style.removeProperty(prop)
      this.model.clearStyle(id, prop)
    } else {
      el.style.setProperty(prop, value)
      this.model.recordStyle(id, prop)
    }
  }

  /** 读取元素当前 inline 覆盖值（命令记录 oldValue 用） */
  get(el: HTMLElement, prop: string): string {
    return el.style.getPropertyValue(prop)
  }
}
