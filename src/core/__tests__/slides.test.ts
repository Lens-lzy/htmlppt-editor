import { describe, it, expect } from 'vitest'
import { detectSlides, slideTitle } from '../slides/SlideDetector'

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('detectSlides 多页识别', () => {
  it('reveal.js 结构', () => {
    const doc = parse(
      `<body><div class="reveal"><div class="slides"><section>a</section><section>b</section></div></div></body>`,
    )
    expect(detectSlides(doc, 'auto')).toHaveLength(2)
  })

  it('.slide 兄弟元素', () => {
    const doc = parse(
      `<body><section class="slide">a</section><section class="slide">b</section><section class="slide">c</section></body>`,
    )
    expect(detectSlides(doc, 'auto')).toHaveLength(3)
  })

  it('普通单页 -> 整篇 body 单页', () => {
    const doc = parse(`<body><h1>hi</h1><p>x</p></body>`)
    const slides = detectSlides(doc, 'auto')
    expect(slides).toHaveLength(1)
    expect(slides[0].tagName).toBe('BODY')
  })

  it('selector 模式自定义', () => {
    const doc = parse(`<body><div class="pg">a</div><div class="pg">b</div></body>`)
    expect(detectSlides(doc, 'selector', '.pg')).toHaveLength(2)
  })

  it('single 模式强制单页', () => {
    const doc = parse(`<body><section>a</section><section>b</section></body>`)
    expect(detectSlides(doc, 'single')).toHaveLength(1)
  })
})

describe('slideTitle', () => {
  it('取首个标题文本', () => {
    const doc = parse(`<body><section><h2>关于产品</h2></section></body>`)
    const root = doc.querySelector('section') as HTMLElement
    expect(slideTitle(root, 0)).toBe('关于产品')
  })
  it('无标题用序号', () => {
    const doc = parse(`<body><section><p>x</p></section></body>`)
    const root = doc.querySelector('section') as HTMLElement
    expect(slideTitle(root, 2)).toBe('第 3 页')
  })
})
