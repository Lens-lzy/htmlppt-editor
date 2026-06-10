import { selection } from '../state'
import { getCore } from '../core-instance'
import { Field } from './controls'
import type { RefSlot } from '../../core/EditorCore'

/** 「引用文件」面板：选中图片/带背景图的元素时，可在文件夹资源里换引用，或选本地图片内嵌。 */
export function ReferenceSection() {
  selection.value // 订阅：选中变化时重渲染
  const core = getCore()
  const refs = core.getReferences()
  if (!refs.length) return null

  const assets = core.listImageAssets()

  const onPickAsset = (kind: RefSlot['kind'], e: Event) => {
    const sel = e.target as HTMLSelectElement
    const v = sel.value
    sel.value = ''
    if (v) core.setReferenceToAsset(kind, v)
  }

  return (
    <div class="hve-section">
      <div class="hve-section-title">引用文件</div>
      {refs.map((r) => (
        <Field label={r.label}>
          <div class="hve-ref">
            <div class="hve-ref-current" title={r.current ?? ''}>
              {r.current ?? '（无）'}
            </div>
            <div class="hve-ref-actions">
              {assets.length > 0 && (
                <select class="hve-select" value="" onChange={(e) => onPickAsset(r.kind, e)}>
                  <option value="">从文件夹选择…</option>
                  {assets.map((a) => (
                    <option value={a.path}>{a.label}</option>
                  ))}
                </select>
              )}
              <button onClick={() => core.setReferenceToLocalFile(r.kind)} title="选一张本地图片内嵌">
                本地图片…
              </button>
            </div>
          </div>
        </Field>
      ))}
    </div>
  )
}
