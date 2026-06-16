import { styleSnapshot, selection } from '../state'
import { getCore } from '../core-instance'
import { Field, NumberInput, ColorInput, ButtonGroup, TextInput } from './controls'

const ALIGNS = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
  { value: 'justify', label: '两端' },
]

function isBoldWeight(w: string): boolean {
  if (w === 'bold' || w === 'bolder') return true
  const n = Number(w)
  return Number.isFinite(n) && n >= 600
}

export function TypographySection() {
  const s = styleSnapshot.value
  const core = getCore()
  const px = (prop: string, v: string) => core.applyStyle(prop, v ? v + 'px' : '')
  const bold = isBoldWeight(s.fontWeight ?? '400')
  const italic = s.fontStyle === 'italic'
  const underline = (selection.value?.overrides.includes('text-decoration-line') ?? false)
    ? true
    : /underline/.test(s.textDecorationLine ?? '')
  return (
    <div class="hve-section">
      <div class="hve-section-title">文字</div>
      <Field label="字号" prop="font-size">
        <NumberInput value={s.fontSize ?? ''} unit="px" min={1} onChange={(v) => px('font-size', v)} />
      </Field>
      <Field label="颜色" prop="color">
        <ColorInput hex={s.color ?? '#000000'} onChange={(v) => core.applyStyle('color', v)} />
      </Field>
      {/* PowerPoint 式：加粗 / 斜体 / 下划线 切换，不再暴露字重数值 */}
      <Field label="样式">
        <div class="hve-btn-group">
          <button
            class={'hve-seg hve-seg-icon' + (bold ? ' on' : '')}
            style={{ fontWeight: 700 }}
            title="加粗"
            onClick={() => core.applyStyle('font-weight', bold ? 'normal' : 'bold')}
          >
            B
          </button>
          <button
            class={'hve-seg hve-seg-icon' + (italic ? ' on' : '')}
            style={{ fontStyle: 'italic' }}
            title="斜体"
            onClick={() => core.applyStyle('font-style', italic ? 'normal' : 'italic')}
          >
            I
          </button>
          <button
            class={'hve-seg hve-seg-icon' + (underline ? ' on' : '')}
            style={{ textDecoration: 'underline' }}
            title="下划线"
            onClick={() => core.applyStyle('text-decoration-line', underline ? 'none' : 'underline')}
          >
            U
          </button>
        </div>
      </Field>
      <Field label="对齐" prop="text-align">
        <ButtonGroup
          value={s.textAlign ?? 'left'}
          options={ALIGNS}
          onChange={(v) => core.applyStyle('text-align', v)}
        />
      </Field>
      <Field label="行距" prop="line-height">
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
      <Field label="字体" prop="font-family">
        <TextInput value={s.fontFamily ?? ''} onChange={(v) => core.applyStyle('font-family', v)} />
      </Field>
    </div>
  )
}
