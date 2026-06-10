import { styleSnapshot } from '../state'
import { getCore } from '../core-instance'
import { parseColor } from '../../core/model/computed'
import { Field, NumberInput, ColorInput, Slider, parseShadow } from './controls'

/** 阴影编辑器：x/y/blur/color 拆开编辑，合成一条 CSS */
function ShadowEditor(props: { prop: 'box-shadow' | 'text-shadow'; raw: string }) {
  const core = getCore()
  const cur = parseShadow(props.raw)
  const hex = parseColor(cur.color).hex
  const apply = (patch: Partial<typeof cur>) => {
    const v = { ...cur, ...patch }
    core.applyStyle(props.prop, `${v.x}px ${v.y}px ${v.blur}px ${v.color}`)
  }
  return (
    <div class="hve-shadow">
      <div class="hve-shadow-row">
        <NumberInput value={cur.x} unit="x" onChange={(x) => apply({ x })} />
        <NumberInput value={cur.y} unit="y" onChange={(y) => apply({ y })} />
        <NumberInput value={cur.blur} unit="模糊" min={0} onChange={(blur) => apply({ blur })} />
      </div>
      <ColorInput hex={hex} onChange={(color) => apply({ color })} />
    </div>
  )
}

export function EffectsSection() {
  const s = styleSnapshot.value
  const core = getCore()
  return (
    <div class="hve-section">
      <div class="hve-section-title">效果</div>
      <Field label="不透明度" prop="opacity">
        <Slider
          value={s.opacity ?? '1'}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => core.applyStyle('opacity', v)}
        />
      </Field>
      <Field label="旋转" prop="rotate">
        <NumberInput
          value={s.rotate ?? '0'}
          unit="°"
          step={1}
          onChange={(v) => core.applyStyle('rotate', v && v !== '0' ? v + 'deg' : '')}
        />
      </Field>
      <Field label="投影" prop="box-shadow">
        <ShadowEditor prop="box-shadow" raw={s.boxShadow ?? ''} />
      </Field>
      <Field label="文字阴影" prop="text-shadow">
        <ShadowEditor prop="text-shadow" raw={s.textShadow ?? ''} />
      </Field>
    </div>
  )
}
