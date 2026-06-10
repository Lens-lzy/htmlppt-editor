import { styleSnapshot } from '../state'
import { getCore } from '../core-instance'
import { Field, NumberInput } from './controls'

const SIDES = [
  { key: 'Top', label: '上' },
  { key: 'Right', label: '右' },
  { key: 'Bottom', label: '下' },
  { key: 'Left', label: '左' },
] as const

export function SpacingSection() {
  const s = styleSnapshot.value
  const core = getCore()
  const box = (kind: 'padding' | 'margin') => (
    <div class="hve-spacing-grid">
      {SIDES.map((side) => {
        const prop = `${kind}-${side.label === '上' ? 'top' : side.label === '右' ? 'right' : side.label === '下' ? 'bottom' : 'left'}`
        const snapKey = kind + side.key
        return (
          <Field label={side.label} prop={prop}>
            <NumberInput
              value={s[snapKey] ?? '0'}
              unit="px"
              onChange={(v) => core.applyStyle(prop, v ? v + 'px' : '0px')}
            />
          </Field>
        )
      })}
    </div>
  )
  return (
    <div class="hve-section">
      <div class="hve-section-title">内边距 Padding</div>
      {box('padding')}
      <div class="hve-section-title">外边距 Margin</div>
      {box('margin')}
    </div>
  )
}
