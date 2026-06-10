import { styleSnapshot } from '../state'
import { getCore } from '../core-instance'
import { colorToCss } from '../../core/model/computed'
import { Field, NumberInput, ColorInput, Slider, SelectInput } from './controls'

const BORDER_STYLES = [
  { value: 'none', label: '无' },
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
]

export function FillBorderSection() {
  const s = styleSnapshot.value
  const core = getCore()
  const bgHex = s.backgroundColor ?? '#ffffff'
  const bgAlpha = parseFloat(s.backgroundAlpha ?? '1')

  return (
    <div class="hve-section">
      <div class="hve-section-title">填充与描边</div>
      <Field label="背景色" prop="background-color">
        <ColorInput
          hex={bgHex}
          onChange={(hex) => core.applyStyle('background-color', colorToCss(hex, bgAlpha))}
        />
      </Field>
      <Field label="背景透明">
        <Slider
          value={String(bgAlpha)}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => core.applyStyle('background-color', colorToCss(bgHex, parseFloat(v)))}
        />
      </Field>
      <Field label="圆角" prop="border-radius">
        <NumberInput
          value={s.borderRadius ?? '0'}
          unit="px"
          min={0}
          onChange={(v) => core.applyStyle('border-radius', v ? v + 'px' : '')}
        />
      </Field>
      <Field label="描边样式" prop="border-style">
        <SelectInput
          value={s.borderStyle ?? 'none'}
          options={BORDER_STYLES}
          onChange={(v) => core.applyStyle('border-style', v)}
        />
      </Field>
      <Field label="描边宽" prop="border-width">
        <NumberInput
          value={s.borderWidth ?? '0'}
          unit="px"
          min={0}
          onChange={(v) => core.applyStyle('border-width', v ? v + 'px' : '')}
        />
      </Field>
      <Field label="描边色" prop="border-color">
        <ColorInput
          hex={s.borderColor ?? '#000000'}
          onChange={(v) => core.applyStyle('border-color', v)}
        />
      </Field>
    </div>
  )
}
