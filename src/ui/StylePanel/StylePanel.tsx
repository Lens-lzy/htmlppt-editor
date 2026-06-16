import { selection } from '../state'
import { getCore } from '../core-instance'
import { ReferenceSection } from './ReferenceSection'
import { TypographySection } from './TypographySection'
import { FillBorderSection } from './FillBorderSection'
import { EffectsSection } from './EffectsSection'
import { SpacingSection } from './SpacingSection'

// 媒体元素（无文字）：不显示「文字」相关编辑项，保持面板清爽
const MEDIA = new Set(['img', 'picture', 'svg', 'video', 'audio', 'iframe', 'canvas', 'object', 'embed'])

const KIND_LABEL: Record<string, string> = {
  img: '图片',
  picture: '图片',
  svg: '图片',
  video: '视频',
  audio: '音频',
  table: '表格',
}

export function StylePanel() {
  const sel = selection.value
  const tag = (sel?.tagName || '').toLowerCase()
  const isMedia = MEDIA.has(tag)
  const kindLabel = KIND_LABEL[tag] || '元素'
  const core = getCore()
  const locked = sel ? core.isLocked() : false
  return (
    <aside class="hve-rightbar">
      <div class="hve-panel-head">样式</div>
      {!sel ? (
        <div class="hve-empty-hint">在画布中点选一个元素开始编辑</div>
      ) : (
        <div class="hve-panel-scroll">
          <div class="hve-sel-tag">
            <span>
              已选中 <b>{kindLabel}</b>
            </span>
            <button
              type="button"
              class={'hve-lock' + (locked ? ' on' : '')}
              title={locked ? '已锁定位置/大小，点击解锁' : '锁定位置/大小'}
              onClick={() => core.toggleLock()}
            >
              {locked ? '🔒 已锁定' : '🔓 锁定'}
            </button>
          </div>
          <ReferenceSection />
          {!isMedia && <TypographySection />}
          <FillBorderSection />
          <EffectsSection isText={!isMedia} />
          <SpacingSection />
        </div>
      )}
    </aside>
  )
}
