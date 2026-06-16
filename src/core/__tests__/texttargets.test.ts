import { describe, it, expect, beforeEach } from 'vitest'
import { textRuns, styleTargets, firstTextRun, TEXT_PROPS } from '../style/textTargets'
import { TextRunStyleCommand } from '../history/commands/StylePatchCommand'
import { EditModel } from '../model/EditModel'

/** 造一个 PPTX 式文本框：.el-sp > .el-tx > .pp > span(文字) */
function pptxBox(): HTMLElement {
  const box = document.createElement('div')
  box.className = 'el el-sp'
  box.innerHTML =
    '<div class="el-tx"><div class="pp" style="text-align:left"><span style="color:rgb(10,20,30);font-weight:400">你好</span></div></div>'
  return box
}

describe('textTargets', () => {
  it('textRuns 找到承载文字的 span，而非容器', () => {
    const box = pptxBox()
    const runs = textRuns(box)
    expect(runs).toHaveLength(1)
    expect(runs[0].tagName).toBe('SPAN')
  })

  it('run 属性落到 span，段落属性上移到段落块 .pp', () => {
    const box = pptxBox()
    expect(styleTargets(box, 'color')[0].tagName).toBe('SPAN')
    const alignTargets = styleTargets(box, 'text-align')
    expect(alignTargets).toHaveLength(1)
    expect((alignTargets[0] as HTMLElement).className).toBe('pp')
  })

  it('文字直接在元素上时回退元素自身', () => {
    const p = document.createElement('p')
    p.textContent = '直接文字'
    expect(textRuns(p)).toEqual([p])
    expect(firstTextRun(p)).toBe(p)
  })

  it('text-align / color 都属于文字属性', () => {
    expect(TEXT_PROPS.has('color')).toBe(true)
    expect(TEXT_PROPS.has('text-align')).toBe(true)
    expect(TEXT_PROPS.has('background-color')).toBe(false)
  })
})

describe('TextRunStyleCommand', () => {
  let model: EditModel
  beforeEach(() => {
    model = new EditModel()
  })

  it('改色作用到 span，可撤销恢复原值', () => {
    const box = pptxBox()
    const span = box.querySelector('span') as HTMLElement
    const cmd = new TextRunStyleCommand('id1', 'color', 'rgb(255,0,0)', [span], model)
    cmd.do()
    expect(span.style.color).toBe('rgb(255, 0, 0)')
    cmd.undo()
    expect(span.style.color).toBe('rgb(10, 20, 30)')
  })

  it('加粗作用到 span', () => {
    const box = pptxBox()
    const span = box.querySelector('span') as HTMLElement
    new (TextRunStyleCommand as any)('id1', 'font-weight', 'bold', [span], model).do()
    expect(span.style.fontWeight).toBe('bold')
  })

  it('对齐作用到段落块 .pp', () => {
    const box = pptxBox()
    const pp = box.querySelector('.pp') as HTMLElement
    const cmd = new TextRunStyleCommand('id1', 'text-align', 'center', [pp], model)
    cmd.do()
    expect(pp.style.textAlign).toBe('center')
    cmd.undo()
    expect(pp.style.textAlign).toBe('left')
  })
})
