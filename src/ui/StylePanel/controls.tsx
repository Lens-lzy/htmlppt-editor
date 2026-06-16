import type { ComponentChildren } from 'preact'
import { selection } from '../state'
import { getCore } from '../core-instance'

/** 一行控件：标签 + 「已覆盖」可重置小圆点 + 控件 */
export function Field(props: { label: string; prop?: string; children: ComponentChildren }) {
  const overridden = props.prop ? !!selection.value?.overrides.includes(props.prop) : false
  return (
    <div class="hve-field">
      <label class="hve-field-label">
        {props.label}
        {props.prop && (
          <span
            class={'hve-reset-dot' + (overridden ? ' on' : '')}
            title={overridden ? '重置此项' : ''}
            onClick={() => overridden && getCore().resetStyle(props.prop!)}
          />
        )}
      </label>
      <div class="hve-field-body">{props.children}</div>
    </div>
  )
}

export function NumberInput(props: {
  value: string
  unit?: string
  min?: number
  max?: number
  step?: number
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div class="hve-num">
      <input
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        placeholder={props.placeholder}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
      {props.unit && <span class="hve-unit">{props.unit}</span>}
    </div>
  )
}

export function ColorInput(props: { hex: string; onChange: (hex: string) => void }) {
  // 原生 type=color 弹出含 RGB/调色板；吸管用 EyeDropper API（Chromium 支持）从屏幕取色
  const hasEyeDropper = typeof (window as any).EyeDropper === 'function'
  const pick = async () => {
    try {
      const res = await new (window as any).EyeDropper().open()
      if (res?.sRGBHex) props.onChange(res.sRGBHex)
    } catch {
      /* 用户取消，忽略 */
    }
  }
  return (
    <div class="hve-color">
      <input
        type="color"
        value={props.hex}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
      <input
        type="text"
        class="hve-color-hex"
        value={props.hex}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
      {hasEyeDropper && (
        <button type="button" class="hve-eyedrop" title="吸管取色" onClick={pick}>
          🖉
        </button>
      )}
    </div>
  )
}

export function Slider(props: {
  value: string
  min: number
  max: number
  step: number
  onChange: (v: string) => void
}) {
  return (
    <div class="hve-slider">
      <input
        type="range"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step}
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
      <span class="hve-slider-val">{props.value}</span>
    </div>
  )
}

export function SelectInput(props: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <select
      class="hve-select"
      value={props.value}
      onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}
    >
      {props.options.map((o) => (
        <option value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function ButtonGroup(props: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div class="hve-btn-group">
      {props.options.map((o) => (
        <button
          class={'hve-seg' + (o.value === props.value ? ' on' : '')}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function TextInput(props: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      class="hve-text"
      value={props.value}
      onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
    />
  )
}

/** 解析 computed 的 box-shadow/text-shadow（color 在前）为 {color,x,y,blur} */
export function parseShadow(str: string): { color: string; x: string; y: string; blur: string } {
  const empty = { color: '#000000', x: '0', y: '0', blur: '0' }
  if (!str || str === 'none') return empty
  const colorMatch = str.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/i)
  const nums = str.replace(/rgba?\([^)]+\)/i, '').match(/-?[\d.]+px/g) || []
  return {
    color: colorMatch ? colorMatch[0] : '#000000',
    x: nums[0] ? nums[0].replace('px', '') : '0',
    y: nums[1] ? nums[1].replace('px', '') : '0',
    blur: nums[2] ? nums[2].replace('px', '') : '0',
  }
}
