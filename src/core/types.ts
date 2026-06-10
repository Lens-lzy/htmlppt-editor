// 共享类型定义 —— 编辑内核与 UI 壳都依赖它

export type ElementId = string

/** 父页面视口坐标系下的矩形（用于绘制选择框/手柄） */
export interface ViewRect {
  x: number
  y: number
  w: number
  h: number
}

/** 样式面板读取的、归一化后的当前元素样式快照 */
export interface StyleSnapshot {
  [prop: string]: string
}

/** 当前选中元素的信息（传给 UI） */
export interface SelectionInfo {
  id: ElementId
  tagName: string
  /** 我们覆盖过的 CSS 属性集合（用于「重置此项」小圆点） */
  overrides: string[]
}

/** 命令模式：所有 DOM 改动的唯一写入单元 */
export interface Command {
  do(): void
  undo(): void
  label: string
  /** 与上一条同类命令合并（连续拖动/连续输入），返回 true 表示已合并 */
  coalesceWith?(next: Command): boolean
}

/** 一页幻灯片 */
export interface SlideInfo {
  id: string
  index: number
  title: string
}

/** 多页识别方式 */
export type SlideDetectMode = 'auto' | 'section' | 'selector' | 'single'

/** 缩放/变换类型（决定缩放手柄改什么属性） */
export type ResizeKind = 'size' | 'font' | 'scale'
