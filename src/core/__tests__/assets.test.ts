import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { AssetBundle } from '../io/AssetBundle'

// 用确定性的假 blob URL，便于断言 rewrite / restore 往返
let counter = 0
const origCreate = URL.createObjectURL
const origRevoke = URL.revokeObjectURL
beforeEach(() => {
  counter = 0
  URL.createObjectURL = () => `blob:test/${counter++}`
  URL.revokeObjectURL = () => {}
})
afterEach(() => {
  URL.createObjectURL = origCreate
  URL.revokeObjectURL = origRevoke
})

function file(content: string, type = ''): File {
  return new File([content], 'f', { type })
}

function bundleWith(entryPath: string, entryHtml: string, extra: Record<string, File>) {
  const files = new Map<string, File>([[entryPath, file(entryHtml, 'text/html')], ...Object.entries(extra)])
  return new AssetBundle({ files, entryPath, entryName: entryPath.split('/').pop()! })
}

describe('AssetBundle 相对引用改写与还原', () => {
  // 注：测试刻意只用 img / srcset / 行内 style —— happy-dom 会对 <link>/<style> 即时发起
  // 子资源加载产生噪音，而真实浏览器的 DOMParser 文档是惰性的。<link> 的 CSS 改写复用
  // 与行内 url() 相同的 rewriteCss + 还原逻辑，这里以行内 url() 覆盖。
  it('入口在子目录时，按 HTML 所在目录解析 ../ 引用', async () => {
    const b = bundleWith(
      'slides/deck.html',
      `<!DOCTYPE html><html><body>` +
        `<img src="../img/logo.png">` +
        `<div style="background: url(../img/bg.jpg)"></div>` +
        `</body></html>`,
      {
        'img/logo.png': file('PNG', 'image/png'),
        'img/bg.jpg': file('JPG', 'image/jpeg'),
      },
    )
    const rewritten = await b.loadEntryHtml()

    // 引用都被换成了 blob: URL
    expect(rewritten).toContain('blob:test/')
    expect(rewritten).not.toContain('../img/logo.png')

    // 导出还原回原始相对路径
    const restored = b.restore(rewritten)
    expect(restored).toContain('../img/logo.png')
    expect(restored).toContain('../img/bg.jpg')
  })

  it('找不到的资源 / 外链 保持原样', async () => {
    const b = bundleWith(
      'index.html',
      `<img src="missing.png"><img src="https://x.com/a.png">`,
      {},
    )
    const out = await b.loadEntryHtml()
    expect(out).toContain('missing.png')
    expect(out).toContain('https://x.com/a.png')
    expect(out).not.toContain('blob:')
  })

  it('srcset 多候选逐个改写', async () => {
    const b = bundleWith('index.html', `<img srcset="a.png 1x, b.png 2x">`, {
      'a.png': file('A', 'image/png'),
      'b.png': file('B', 'image/png'),
    })
    const rewritten = await b.loadEntryHtml()
    expect(rewritten).toContain('1x')
    expect(rewritten).toContain('2x')
    const restored = b.restore(rewritten)
    expect(restored).toContain('a.png 1x')
    expect(restored).toContain('b.png 2x')
  })

  it('listImageAssets 只列图片、相对入口给出可用路径', () => {
    const b = bundleWith('index.html', `<body></body>`, {
      'img/a.png': file('A', 'image/png'),
      'img/b.jpg': file('B', 'image/jpeg'),
      'css/main.css': file('x', 'text/css'),
    })
    const assets = b.listImageAssets().map((a) => a.path)
    expect(assets).toEqual(['img/a.png', 'img/b.jpg'])

    // 换引用：拿到 blob，再还原应得到相对入口的路径
    const url = b.urlForAsset('img/a.png')!
    expect(b.pathForBlob(url)).toBe('img/a.png')
    expect(b.relFromEntry('img/a.png')).toBe('img/a.png')
  })
})
