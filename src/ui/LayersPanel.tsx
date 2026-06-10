import { layerVersion, selectedEl } from './state'
import { getCore } from './core-instance'
import type { LayerNode } from '../core/EditorCore'

export function LayersPanel() {
  // 订阅：结构变化时重建
  layerVersion.value
  const tree = getCore().buildLayerTree()
  return (
    <aside class="hve-leftbar">
      <div class="hve-panel-head">图层</div>
      <div class="hve-layers">
        {tree.length === 0 ? (
          <div class="hve-empty-hint">未加载内容</div>
        ) : (
          tree.map((n) => <LayerRow node={n} depth={0} />)
        )}
      </div>
    </aside>
  )
}

function LayerRow({ node, depth }: { node: LayerNode; depth: number }) {
  const core = getCore()
  const active = selectedEl.value === node.el
  return (
    <>
      <div
        class={'hve-layer-row' + (active ? ' on' : '')}
        style={{ paddingLeft: 8 + depth * 12 + 'px' }}
        onClick={() => core.selectByEl(node.el)}
        title={node.label}
      >
        <span class="hve-layer-label">{node.label}</span>
      </div>
      {node.children.map((c) => (
        <LayerRow node={c} depth={depth + 1} />
      ))}
    </>
  )
}
