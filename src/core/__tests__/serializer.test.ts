import { describe, it, expect } from 'vitest'
import { serialize } from '../io/Serializer'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('serialize 干净导出', () => {
  const html = `<!DOCTYPE html><html><head><title>t</title></head><body>` +
    `<h1 data-hve-id="hve-1" style="color: red;" class="title hve-selected">Hi</h1>` +
    `<p contenteditable="true">x</p>` +
    `<style id="hve-runtime">.x{}</style>` +
    `</body></html>`
  const out = serialize(parse(html))

  it('剥离 data-hve-id', () => expect(out).not.toContain('data-hve-id'))
  it('剥离 contenteditable', () => expect(out).not.toContain('contenteditable'))
  it('剥离编辑器注入的运行时 style', () => expect(out).not.toContain('hve-runtime'))
  it('剥离 hve- 临时类，保留原类', () => {
    expect(out).not.toContain('hve-selected')
    expect(out).toContain('class="title"')
  })
  it('保留用户的 inline 样式覆盖', () => expect(out).toContain('color: red'))
  it('保留原始结构与文本', () => {
    expect(out).toContain('<h1')
    expect(out).toContain('Hi')
    expect(out).toContain('<title>t</title>')
  })
  it('带 DOCTYPE 头', () => expect(out.startsWith('<!DOCTYPE html>')).toBe(true))

  it('keepIds=true 时保留 id', () => {
    expect(serialize(parse(html), { keepIds: true })).toContain('data-hve-id')
  })
})
