import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { codeOpen } from './state'
import { getCore } from './core-instance'

/**
 * HTML 源码面板：查看当前文档源码、定位选中元素所在行、在线编辑后应用。
 * 打开时自动定位到当前选中元素；「应用」会用编辑后的源码重新渲染（重置撤销栈）。
 */
export function CodePanel() {
  const core = getCore()
  const taRef = useRef<HTMLTextAreaElement>(null)
  // 同步取源码+定位行（首帧即有内容，避免空白闪烁/读取竞态）
  const [snap] = useState(() => core.getSourceWithLocation())
  const [text, setText] = useState(snap.html)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const gotoLine = (line: number) => {
    const ta = taRef.current
    if (!ta || line <= 0) return
    const lines = ta.value.split('\n')
    const start = lines.slice(0, line - 1).reduce((s, l) => s + l.length + 1, 0)
    const end = start + (lines[line - 1]?.length ?? 0)
    ta.focus()
    ta.setSelectionRange(start, end)
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20
    ta.scrollTop = Math.max(0, (line - 1) * lh - ta.clientHeight / 2)
  }

  // 打开后同步定位到当前选中元素所在行（布局已就绪，选区/滚动立即生效）
  useLayoutEffect(() => {
    gotoLine(snap.line)
  }, [])

  const relocate = () => {
    const { html, line } = core.getSourceWithLocation()
    setText(html)
    requestAnimationFrame(() => gotoLine(line))
    flash(line > 0 ? `已定位到第 ${line} 行` : '未选中元素')
  }

  const apply = async () => {
    setBusy(true)
    try {
      await core.applySource(taRef.current?.value ?? text)
      flash('✓ 已应用并重新渲染')
    } catch (e) {
      flash('应用失败：' + (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div class="hve-code-overlay" onClick={() => (codeOpen.value = false)}>
      <div class="hve-code-panel" onClick={(e) => e.stopPropagation()}>
        <div class="hve-code-head">
          <span class="hve-code-title">HTML 源码</span>
          <button onClick={relocate} title="跳到当前选中元素所在行">📍 定位选中</button>
          <button class="hve-primary" disabled={busy} onClick={apply} title="用编辑后的源码重新渲染">
            ✓ 应用更改
          </button>
          <div class="hve-tb-spacer" />
          {msg && <span class="hve-toast">{msg}</span>}
          <button onClick={() => (codeOpen.value = false)}>✕ 关闭</button>
        </div>
        <textarea
          ref={taRef}
          class="hve-code-area"
          spellcheck={false}
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="hve-code-foot">
          源码即当前文档的干净 HTML；编辑后点「应用更改」生效。注意：应用会重新载入，撤销历史会清空。
        </div>
      </div>
    </div>
  )
}
