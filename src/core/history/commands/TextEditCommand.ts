import type { Command, ElementId } from '../../types'
import type { EditModel } from '../../model/EditModel'

/** 文字行内编辑提交。记录改前/改后的 innerHTML。 */
export class TextEditCommand implements Command {
  label = '编辑文字'

  constructor(
    private el: HTMLElement,
    private id: ElementId,
    private oldHTML: string,
    private newHTML: string,
    private model: EditModel,
  ) {}

  do(): void {
    this.el.innerHTML = this.newHTML
    this.model.recordText(this.id)
  }
  undo(): void {
    this.el.innerHTML = this.oldHTML
  }
}
