import { styleSnapshot } from '../state'
import { getCore } from '../core-instance'
import { Field, NumberInput, ColorInput, SelectInput, ButtonGroup, TextInput } from './controls'

const WEIGHTS = [
  { value: '300', label: '细 300' },
  { value: '400', label: '常规 400' },
  { value: '500', label: '中 500' },
  { value: '600', label: '半粗 600' },
  { value: '700', label: '粗 700' },
  { value: '800', label: '特粗 800' },
]
const ALIGNS = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
  { value: 'justify', label: '两端' },
]

function normWeight(w: string): string {
  if (w === 'normal') return '400'
  if (w === 'bold') return '700'
  return WEIGHTS.some((x) => x.value === w) ? w : '400'
}

export function TypographySection() {
  const s = styleSnapshot.value
  const core = getCore()
  const px = (prop: string, v: string) => core.applyStyle(prop, v ? v + 'px' : '')
  return (
    <div class="hve-section">
      <div class="hve-section-title">文字</div>
      <Field label="字号" prop="font-size">
        <NumberInput value={s.fontSize ?? ''} unit="px" min={1} onChange={(v) => px('font-size', v)} />
      </Field>
      <Field label="颜色" prop="color">
        <ColorInput hex={s.color ?? '#000000'} onChange={(v) => core.applyStyle('color', v)} />
      </Field>
      <Field label="字重" prop="font-weight">
        <SelectInput
          value={normWeight(s.fontWeight ?? '400')}
          options={WEIGHTS}
          onChange={(v) => core.applyStyle('font-weight', v)}
        />
      </Field>
      <Field label="对齐" prop="text-align">
        <ButtonGroup
          value={s.textAlign ?? 'left'}
          options={ALIGNS}
          onChange={(v) => core.applyStyle('text-align', v)}
        />
      </Field>
      <Field label="行高" prop="line-height">
        <NumberInput value={s.lineHeight ?? ''} unit="px" min={0} onChange={(v) => px('line-height', v)} />
      </Field>
      <Field label="字间距" prop="letter-spacing">
        <NumberInput
          value={s.letterSpacing ?? '0'}
          unit="px"
          step={0.5}
          onChange={(v) => px('letter-spacing', v)}
        />
      </Field>
      <Field label="字形" prop="font-style">
        <ButtonGroup
          value={s.fontStyle ?? 'normal'}
          options={[
            { value: 'normal', label: '正常' },
            { value: 'italic', label: '斜体' },
          ]}
          onChange={(v) => core.applyStyle('font-style', v)}
        />
      </Field>
      <Field label="字体" prop="font-family">
        <TextInput value={s.fontFamily ?? ''} onChange={(v) => core.applyStyle('font-family', v)} />
      </Field>
    </div>
  )
}
