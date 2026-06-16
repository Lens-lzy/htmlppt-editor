import { useEffect, useRef } from 'preact/hooks'
import { slidesState } from './state'
import { getCore } from './core-instance'

export function SlidesStrip() {
  const { slides, current } = slidesState.value
  const core = getCore()
  const stripRef = useRef<HTMLDivElement>(null)

  // 当前页随滚动变化时，把激活缩略图滚进可视区（20 页时高亮不会跑到栏外看不见）
  useEffect(() => {
    const strip = stripRef.current
    const active = strip?.children[current] as HTMLElement | undefined
    active?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [current])

  if (slides.length <= 1) return null // 单页时不显示

  return (
    <footer class="hve-slides">
      <div class="hve-slides-ops">
        <button title="复制当前页" onClick={() => core.duplicateSlide(current)}>＋</button>
        <button title="删除当前页" onClick={() => core.deleteSlide(current)}>🗑</button>
        <button title="上移" onClick={() => core.moveSlide(current, -1)}>↑</button>
        <button title="下移" onClick={() => core.moveSlide(current, 1)}>↓</button>
      </div>
      <div class="hve-slides-strip" ref={stripRef}>
        {slides.map((s) => (
          <div
            class={'hve-thumb' + (s.index === current ? ' on' : '')}
            onClick={() => core.switchSlide(s.index)}
          >
            <div class="hve-thumb-num">{s.index + 1}</div>
            <div class="hve-thumb-title">{s.title}</div>
          </div>
        ))}
      </div>
    </footer>
  )
}
