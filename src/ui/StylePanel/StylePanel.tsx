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
  const multi = (sel?.count ?? 1) > 1
  return (
    <aside class="hve-rightbar">
      <div class="hve-panel-head">样式</div>
      {!sel ? (
        <div class="hve-empty-hint">在画布中点选一个元素开始编辑（Shift/⌘ 点击可多选）</div>
      ) : (
        <div class="hve-panel-scroll">
          <div class="hve-sel-tag">
            <span>
              {multi ? (
                <>
                  已选中 <b>{sel!.count} 个元素</b>
                </>
              ) : (
                <>
                  已选中 <b>{kindLabel}</b>
                </>
              )}
            </span>
            {!multi && (
              <button
                type="button"
                class={'hve-lock' + (locked ? ' on' : '')}
                title={locked ? '已锁定位置/大小，点击解锁' : '锁定位置/大小'}
                onClick={() => core.toggleLock()}
              >
                {locked ? '🔒 已锁定' : '🔓 锁定'}
              </button>
            )}
          </div>
          {/* 多选时隐藏「引用文件」（按单个图片换源），其余样式批量作用于所有选中元素 */}
          {!multi && <ReferenceSection />}
          {!isMedia && <TypographySection />}
          <FillBorderSection />
          <EffectsSection isText={!isMedia} />
          <SpacingSection />
        </div>
      )}
    </aside>
  )
}
