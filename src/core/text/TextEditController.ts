import type { EventBus } from '../EventBus'
import type { FrameHost } from '../frame/FrameHost'
import type { Overlay } from '../selection/Overlay'
import type { SelectionController } from '../selection/SelectionController'
import type { EditModel } from '../model/EditModel'
import type { History } from '../history/History'
import { ensureId } from '../model/idattr'
import { TextEditCommand } from '../history/commands/TextEditCommand'

/**
 * 双击进入 contentEditable 行内编辑。编辑期间禁用选择/拖动；
 * blur 提交、Esc 取消。提交时记一条 TextEditCommand。
 */
export class TextEditController {
  private el: HTMLElement | null = null
  private id = ''
  private oldHTML = ''

  constructor(
    private bus: EventBus,
    private host: FrameHost,
    private overlay: Overlay,
    private selection: SelectionController,
    private model: EditModel,
    private history: History,
  ) {}

  get editing(): boolean {
    return this.el !== null
  }

  begin(el: HTMLElement): void {
    if (this.editing) return
    if (el.tagName === 'HTML' || el.tagName === 'BODY') return
    this.el = el
    this.id = ensureId(el)
    this.oldHTML = el.innerHTML

    el.setAttribute('contenteditable', 'true')
    this.host.setInteractive(false)
    this.overlay.setEditing(true)
    this.bus.emit('edit-mode-changed', true)

    el.addEventListener('keydown', this.onKeydown, true)
    el.addEventListener('blur', this.onBlur, true)
    // 让焦点落到元素上以便输入
    setTimeout(() => el.focus(), 0)
  }

  private onKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.cancel()
    }
  }

  private onBlur = (): void => {
    this.commit()
  }

  private commit(): void {
    const el = this.el
    if (!el) return
    const newHTML = el.innerHTML
    this.cleanup(el)
    if (newHTML !== this.oldHTML) {
      this.history.exec(new TextEditCommand(el, this.id, this.oldHTML, newHTML, this.model))
    }
    this.selection.refresh()
    this.selection.reposition()
  }

  private cancel(): void {
    const el = this.el
    if (!el) return
    el.innerHTML = this.oldHTML
    this.cleanup(el)
    this.selection.refresh()
    this.selection.reposition()
  }

  private cleanup(el: HTMLElement): void {
    el.removeAttribute('contenteditable')
    el.removeEventListener('keydown', this.onKeydown, true)
    el.removeEventListener('blur', this.onBlur, true)
    this.host.setInteractive(true)
    this.overlay.setEditing(false)
    this.bus.emit('edit-mode-changed', false)
    this.el = null
  }
}
