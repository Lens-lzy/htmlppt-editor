import type { Command } from '../../types'

/**
 * 通用回调命令：用于幻灯片增删/重排等结构性 DOM 操作。
 * 由调用方提供已捕获上下文的 do/undo 闭包。
 */
export class CallbackCommand implements Command {
  constructor(
    public label: string,
    private _do: () => void,
    private _undo: () => void,
  ) {}

  do(): void {
    this._do()
  }
  undo(): void {
    this._undo()
  }
}
