import { selection } from '../state'
import { ReferenceSection } from './ReferenceSection'
import { TypographySection } from './TypographySection'
import { FillBorderSection } from './FillBorderSection'
import { EffectsSection } from './EffectsSection'
import { SpacingSection } from './SpacingSection'

export function StylePanel() {
  const sel = selection.value
  return (
    <aside class="hve-rightbar">
      <div class="hve-panel-head">样式</div>
      {!sel ? (
        <div class="hve-empty-hint">在画布中点选一个元素开始编辑</div>
      ) : (
        <div class="hve-panel-scroll">
          <div class="hve-sel-tag">
            已选中 <b>&lt;{sel.tagName}&gt;</b>
          </div>
          <ReferenceSection />
          <TypographySection />
          <FillBorderSection />
          <EffectsSection />
          <SpacingSection />
        </div>
      )}
    </aside>
  )
}
