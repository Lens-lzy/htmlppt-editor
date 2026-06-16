import { EventBus } from './EventBus'
import { History } from './history/History'
import { EditModel } from './model/EditModel'
import { StyleApplier } from './style/StyleApplier'
import { FrameHost } from './frame/FrameHost'
import { Overlay } from './selection/Overlay'
import { SelectionController } from './selection/SelectionController'
import { DragController } from './transform/DragController'
import { ResizeController } from './transform/ResizeController'
import { TextEditController } from './text/TextEditController'
import { SlideController } from './slides/SlideController'
import { StylePatchCommand, TextRunStyleCommand } from './history/commands/StylePatchCommand'
import { CallbackCommand } from './history/commands/CallbackCommand'
import { TEXT_PROPS, styleTargets } from './style/textTargets'
import { resetIds, ensureId } from './model/idattr'
import { serialize } from './io/Serializer'
import { readFile } from './io/Loader'
import {
  openViaPicker,
  openFolderViaPicker,
  readFolderFromInput,
  download,
  supportsFS,
  supportsDirPicker,
} from './io/FileSystem'
import { AssetBundle } from './io/AssetBundle'
import type { SlideDetectMode } from './types'

/** 图层节点的内容类型（面向用户，不暴露 div/section 等结构标签） */
export type ContentKind =
  | 'heading'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'link'
  | 'button'
  | 'list'
  | 'table'
  | 'quote'
  | 'embed'

export interface LayerNode {
  el: HTMLElement
  kind: ContentKind
  label: string
  children: LayerNode[]
}

/** 右侧「引用文件」面板的一个可编辑槽位 */
export interface RefSlot {
  kind: 'src' | 'background'
  label: string
  /** 展示用的当前引用（原始相对路径 / 外链 / 「嵌入图片」），无则 null */
  current: string | null
}

const MAX_LAYER_NODES = 4000
const AUTO_SAVE_MS = 5 * 60 * 1000

export class EditorCore {
  readonly bus = new EventBus()
  private model = new EditModel()
  private history = new History(this.bus)
  private applier = new StyleApplier(this.model)

  private host!: FrameHost
  private overlay!: Overlay
  private selection!: SelectionController
  private drag!: DragController
  private resize!: ResizeController
  private textEdit!: TextEditController
  private slides!: SlideController

  private zoom = 1
  private panX = 0
  private panY = 0
  private mounted = false
  private fileName = 'edited.html'
  private handle?: FileSystemFileHandle
  private bundle: AssetBundle | null = null
  private nodeCount = 0
  private searchMatches: HTMLElement[] = []
  private searchIdx = -1
  private hasContent = false
  private dirty = false
  private lastSavedTs: number | null = null
  private autoSaveTimer?: number

  /** allowScripts：是否允许目标 iframe 运行脚本（PPTX 编辑器为 true，运行滚动 deck/动画） */
  constructor(private allowScripts = false) {}

  mount(container: HTMLElement): void {
    const getZoom = () => this.zoom
    this.host = new FrameHost(container, this.bus, getZoom, this.allowScripts)
    this.overlay = new Overlay(container)
    this.selection = new SelectionController(this.bus, this.host, this.overlay, this.model)
    this.drag = new DragController(
      this.selection,
      this.applier,
      this.history,
      this.host,
      this.overlay,
      getZoom,
    )
    this.resize = new ResizeController(
      this.selection,
      this.applier,
      this.history,
      this.host,
      this.overlay,
      getZoom,
    )
    this.textEdit = new TextEditController(
      this.bus,
      this.host,
      this.overlay,
      this.selection,
      this.model,
      this.history,
    )
    this.slides = new SlideController(this.bus, this.host, this.history)

    // iframe 内交互 -> 控制器
    this.host.onHover = (el, x, y) => !this.textEdit.editing && this.selection.handleHover(el, x, y)
    this.host.onClick = (el, e) => this.selection.handleClick(el, e.clientX, e.clientY)
    this.host.onDblClick = (el) => {
      this.selection.select(el)
      this.textEdit.begin(el)
    }

    // overlay 手势
    this.overlay.onSelectionPointerDown = (e) => this.drag.begin(e)
    // 选择框上「点击未拖动」：把屏幕坐标换算到 iframe 内容坐标，穿透选中下方更小的元素
    this.drag.onClickNoMove = (clientX, clientY) => {
      const f = this.host.iframe.getBoundingClientRect()
      this.selection.selectAtPoint((clientX - f.left) / this.zoom, (clientY - f.top) / this.zoom)
    }
    this.overlay.onHandlePointerDown = (dir, e) => this.resize.begin(dir, e)
    this.overlay.onSelectionDblClick = () => {
      if (this.selection.selected) this.textEdit.begin(this.selection.selected)
    }

    // 滚轮落在选择框上（pointer-events:auto）会被吞掉，转发给 iframe 内容滚动
    this.overlay.onWheel = (e) => {
      e.preventDefault()
      const se = this.host.doc.scrollingElement || this.host.doc.documentElement
      // behavior:auto 抵消 deck 的 scroll-behavior:smooth，逐格滚动跟手不拖泥
      se.scrollBy({ left: e.deltaX, top: e.deltaY, behavior: 'auto' })
    }

    // overlay 跟随滚动/尺寸变化；同时把底部页码栏同步到当前滚到的那一页
    this.bus.on('reposition', () => {
      this.selection.reposition()
      this.slides.syncCurrentToScroll()
    })

    // 编辑即标脏；每 5 分钟自动保存缓存
    this.bus.on('history-changed', () => {
      this.dirty = true
    })
    this.autoSaveTimer = window.setInterval(() => {
      if (this.hasContent && this.dirty) void this.saveCache()
    }, AUTO_SAVE_MS)
    this.mounted = true
  }

  // ---------- 文件 ----------

  async openFromFile(file: File): Promise<void> {
    this.resetSource()
    const f = await readFile(file)
    await this.loadHtml(f.html, f.name, true)
  }

  /** 直接载入一段已生成好的自包含 HTML（如 PPTX 转换结果）。 */
  async openFromHtml(html: string, name: string): Promise<void> {
    this.resetSource()
    await this.loadHtml(html, name, true)
  }

  /**
   * 载入 PPTX 转换结果（文件夹模式）：HTML 用相对引用 assets/，图片为独立文件。
   * 走 AssetBundle —— 渲染时相对路径改写为 blob，导出时还原为相对路径。
   */
  async openFromPptx(html: string, assets: Map<string, Uint8Array>, name: string): Promise<void> {
    this.resetSource()
    // 标记「编辑器模式」：deck 运行时据此跳过 per-slide 缩放（导出时此属性被序列化剥离）
    const editHtml = html.replace(/<html(\s|>)/i, '<html data-hve-edit="1"$1')
    const files = new Map<string, File>()
    files.set('index.html', new File([editHtml], 'index.html', { type: 'text/html' }))
    for (const [path, bytes] of assets) {
      files.set(path, new File([bytes as BlobPart], path.slice(path.lastIndexOf('/') + 1)))
    }
    this.bundle = new AssetBundle({ files, entryPath: 'index.html', entryName: name + '.html' })
    await this.loadHtml(await this.bundle.loadEntryHtml(), name + '.html', true)
    this.fitToWidth()
  }

  /** 把画布整体缩放到适配幻灯片宽度（用已校准的 frameZoom，不影响拖拽精度） */
  fitToWidth(): void {
    const slide = this.host.doc.querySelector<HTMLElement>('.slide')
    const sw = slide ? slide.getBoundingClientRect().width / (this.zoom || 1) : 0
    const avail = this.host.iframe.clientWidth - 40
    if (sw > 0 && avail > 0) {
      this.zoom = Math.min(1, Math.max(0.1, avail / sw))
      this.panX = 0
      this.panY = 0
      this.applyView()
    }
  }

  async loadFromUrl(url: string, name: string): Promise<void> {
    this.resetSource()
    const html = await (await fetch(url)).text()
    await this.loadHtml(html, name, true)
  }

  async openViaPicker(): Promise<void> {
    const f = await openViaPicker()
    if (!f) return
    this.resetSource()
    this.handle = f.handle
    await this.loadHtml(f.html, f.name, true)
  }

  /** 打开整个文件夹：入口 HTML + 同目录图片/CSS/字体一并读入并渲染 */
  async openFolder(): Promise<void> {
    const raw = await openFolderViaPicker()
    if (!raw) return
    this.resetSource()
    this.bundle = new AssetBundle(raw)
    this.handle = raw.entryHandle
    await this.loadHtml(await this.bundle.loadEntryHtml(), raw.entryName, true)
  }

  /** webkitdirectory 兜底（不支持 showDirectoryPicker 的浏览器） */
  async openFolderFromInput(list: FileList): Promise<void> {
    const raw = readFolderFromInput(list)
    this.resetSource()
    this.bundle = new AssetBundle(raw)
    await this.loadHtml(await this.bundle.loadEntryHtml(), raw.entryName, true)
  }

  get canPickDir(): boolean {
    return supportsDirPicker()
  }

  /** 打开 HTML 文件：优先 File System Access，不支持则用隐藏 input 兜底 */
  async openHtmlInteractive(): Promise<void> {
    if (supportsFS()) {
      await this.openViaPicker()
      return
    }
    const f = await pickFileViaInput('.html,.htm,text/html')
    if (f) await this.openFromFile(f)
  }

  /** 打开文件夹：优先 showDirectoryPicker，不支持则用 webkitdirectory 兜底 */
  async openFolderInteractive(): Promise<void> {
    if (supportsDirPicker()) {
      await this.openFolder()
      return
    }
    const files = await pickFolderViaInput()
    if (files) await this.openFolderFromInput(files)
  }

  private resetSource(): void {
    this.handle = undefined
    this.bundle?.dispose()
    this.bundle = null
  }

  private async loadHtml(html: string, name: string, announce = false): Promise<void> {
    resetIds()
    this.model.reset()
    this.history.reset()
    this.selection.deselect()
    this.searchMatches = []
    this.searchIdx = -1
    this.fileName = name || 'edited.html'
    await this.host.load(html)
    this.resetView() // 新内容重置缩放/平移
    this.nodeCount = this.host.doc.querySelectorAll('*').length
    this.slides.detect('auto')
    this.hasContent = true
    this.dirty = false
    this.lastSavedTs = null
    if (announce) this.announceCache()
  }

  // ---------- 保存缓存 / 自动保存 / 导出 ----------

  private cacheKey(): string {
    return 'hve-cache:' + this.fileName
  }
  private cacheFileName(): string {
    return this.fileName.replace(/\.html?$/i, '') + '.cache.html'
  }

  /** 保存缓存（手动 Ctrl/Cmd+S 与每 5 分钟自动调用）：写 localStorage，文件夹模式再写一份 .cache.html */
  async saveCache(): Promise<number | null> {
    if (!this.hasContent) return null
    const html = this.exportHtml()
    const ts = Date.now()
    try {
      localStorage.setItem(this.cacheKey(), JSON.stringify({ html, ts, name: this.fileName }))
    } catch {
      /* localStorage 不可用时忽略，仍尝试写文件 */
    }
    const dir = this.bundle?.dirHandle as any
    if (dir) {
      try {
        const fh = await dir.getFileHandle(this.cacheFileName(), { create: true })
        const w = await fh.createWritable()
        await w.write(html)
        await w.close()
      } catch {
        /* 无写权限等：忽略，localStorage 已兜底 */
      }
    }
    this.lastSavedTs = ts
    this.dirty = false
    this.bus.emit('cache-saved', ts)
    return ts
  }

  /** 打开文件时，若发现同名缓存则广播，UI 提示可恢复 */
  private announceCache(): void {
    let info: { ts: number } | null = null
    try {
      const raw = localStorage.getItem(this.cacheKey())
      if (raw) {
        const o = JSON.parse(raw)
        if (o && typeof o.ts === 'number') info = { ts: o.ts }
      }
    } catch {
      /* ignore */
    }
    this.bus.emit('cache-available', info)
  }

  /** 用上次自动保存的缓存覆盖当前内容 */
  async restoreCache(): Promise<boolean> {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(this.cacheKey())
    } catch {
      /* ignore */
    }
    if (!raw) return false
    let html: string
    try {
      html = JSON.parse(raw).html
    } catch {
      return false
    }
    if (this.bundle) html = await this.bundle.rewriteHtmlString(html)
    await this.loadHtml(html, this.fileName)
    this.bus.emit('cache-available', null)
    return true
  }

  /** 导出（另存为）：优先 showSaveFilePicker 选位置，不支持/失败则下载 */
  async exportSaveAs(): Promise<'saved' | 'downloaded' | 'canceled'> {
    const html = this.exportHtml()
    const name = this.fileName.replace(/\.html?$/i, '') + '.html'
    const w = window as any
    if (w.showSaveFilePicker) {
      try {
        const handle = await w.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }],
        })
        const ws = await handle.createWritable()
        await ws.write(html)
        await ws.close()
        return 'saved'
      } catch (e) {
        if (/abort/i.test((e as Error).message)) return 'canceled'
        // 其它错误（如无头环境）退回下载
      }
    }
    download(name, html)
    return 'downloaded'
  }

  exportDownload(): void {
    download(this.fileName.replace(/\.html?$/i, '') + '.html', this.exportHtml())
  }

  /** 序列化后把 blob: URL 还原回原始相对路径（文件夹模式） */
  private exportHtml(): string {
    const text = serialize(this.host.doc)
    return this.bundle ? this.bundle.restore(text) : text
  }

  get canUseFS(): boolean {
    return supportsFS()
  }
  get hasHandle(): boolean {
    return !!this.handle
  }

  /**
   * 重新向 UI 广播本编辑器的当前状态（多编辑器切换激活时调用）。
   * 让刚绑定的全局 signals 立刻反映这个编辑器，而非停留在另一个编辑器的旧状态。
   */
  resync(): void {
    this.bus.emit('content-state', this.hasContent)
    this.bus.emit('history-changed', { canUndo: this.history.canUndo, canRedo: this.history.canRedo })
    if (!this.mounted) return // 尚未挂载（首帧）：仅同步空态，控制器还没就绪
    this.slides.broadcast()
    if (this.selection.selected) this.selection.refresh()
    else this.bus.emit('selection-changed', null)
    if (this.hasContent) this.announceCache()
    else this.bus.emit('cache-available', null)
  }

  /** 当前是否已载入内容 */
  get contentLoaded(): boolean {
    return this.hasContent
  }

  // ---------- 画布视图：仅自动适配宽度（无交互缩放/平移） ----------

  private applyView(): void {
    this.host.setView(this.zoom, this.panX, this.panY)
    this.selection.reposition()
  }

  /** 复位视图：回到 1:1 后按内容重新适配宽度（Cmd/Ctrl+0） */
  resetView(): void {
    this.zoom = 1
    this.panX = 0
    this.panY = 0
    this.applyView()
    this.fitToWidth()
  }

  // ---------- 编辑 ----------

  undo(): void {
    this.history.undo()
    this.selection.refresh()
    this.selection.reposition()
  }
  redo(): void {
    this.history.redo()
    this.selection.refresh()
    this.selection.reposition()
  }

  applyStyle(prop: string, value: string): void {
    const el = this.selection.selected
    const id = this.selection.selectedId
    if (!el || !id) return
    // 文字属性：落到承载文字的后代 run / 段落块（容器上设无效），否则改字色/加粗/对齐都不生效
    if (TEXT_PROPS.has(prop)) {
      const targets = styleTargets(el, prop)
      if (targets.every((t) => t.style.getPropertyValue(prop) === value)) return
      this.history.exec(new TextRunStyleCommand(id, prop, value, targets, this.model))
      this.selection.refresh()
      return
    }
    const oldVal = this.applier.get(el, prop)
    if (oldVal === value) return
    this.history.exec(new StylePatchCommand(el, id, prop, oldVal, value, this.applier))
    this.selection.refresh()
  }

  resetStyle(prop: string): void {
    this.applyStyle(prop, '')
  }

  /** 选中元素是否锁定（锁定后不可拖动/缩放，仍可选中以解锁） */
  isLocked(): boolean {
    return !!this.selection.selected?.hasAttribute('data-hve-lock')
  }

  /** 切换锁定。data-hve-lock 为编辑器元数据，导出时由 Serializer 剥离 */
  toggleLock(): void {
    const el = this.selection.selected
    if (!el) return
    if (el.hasAttribute('data-hve-lock')) el.removeAttribute('data-hve-lock')
    else el.setAttribute('data-hve-lock', '1')
    this.dirty = true
    this.selection.refresh()
  }

  selectByEl(el: HTMLElement, reveal = false): void {
    this.selection.select(el)
    if (reveal) this.revealEl(el)
  }

  /** 把元素滚动到 iframe 视口中央（图层点击 / 搜索跳转用） */
  private revealEl(el: HTMLElement): void {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    } catch {
      el.scrollIntoView()
    }
  }

  getSelectedEl(): HTMLElement | null {
    return this.selection.selected
  }

  // ---------- 搜索定位 ----------

  /** 搜索页面文本，定位到第一个命中。返回 {命中数, 当前序号(1基)} */
  search(query: string): { count: number; index: number } {
    this.searchMatches = []
    this.searchIdx = -1
    const q = query.trim().toLowerCase()
    if (!q || !this.host?.doc?.body) return this.searchStatus()
    const doc = this.host.doc
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const seen = new Set<HTMLElement>()
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = node.textContent
      if (!text || !text.toLowerCase().includes(q)) continue
      const el = node.parentElement
      if (!el || seen.has(el) || el.closest('script, style')) continue
      seen.add(el)
      this.searchMatches.push(el)
    }
    if (this.searchMatches.length) {
      this.searchIdx = 0
      this.gotoMatch()
    }
    return this.searchStatus()
  }

  searchNext(): { count: number; index: number } {
    if (this.searchMatches.length) {
      this.searchIdx = (this.searchIdx + 1) % this.searchMatches.length
      this.gotoMatch()
    }
    return this.searchStatus()
  }

  searchPrev(): { count: number; index: number } {
    if (this.searchMatches.length) {
      const n = this.searchMatches.length
      this.searchIdx = (this.searchIdx - 1 + n) % n
      this.gotoMatch()
    }
    return this.searchStatus()
  }

  private gotoMatch(): void {
    const el = this.searchMatches[this.searchIdx]
    if (el && el.isConnected) this.selectByEl(el, true)
  }

  private searchStatus(): { count: number; index: number } {
    const count = this.searchMatches.length
    return { count, index: count ? this.searchIdx + 1 : 0 }
  }

  // ---------- 引用文件（图片来源 / 背景图） ----------

  /** 当前选中元素可编辑的引用槽位 */
  getReferences(): RefSlot[] {
    const el = this.selection.selected
    if (!el) return []
    const slots: RefSlot[] = []
    const tag = el.tagName.toLowerCase()
    if (tag === 'img' || tag === 'video' || tag === 'audio' || tag === 'source') {
      slots.push({ kind: 'src', label: '图片来源', current: this.displayRef(el.getAttribute('src')) })
    }
    const bg = this.host.win.getComputedStyle(el).backgroundImage
    const bgUrl = bg && bg !== 'none' ? bg.match(/url\(\s*["']?([^"')]+)["']?\s*\)/) : null
    if (bgUrl) {
      slots.push({ kind: 'background', label: '背景图', current: this.displayRef(bgUrl[1]) })
    }
    return slots
  }

  /** 文件夹里的图片清单（无文件夹则空） */
  listImageAssets(): { path: string; label: string }[] {
    return this.bundle?.listImageAssets() ?? []
  }

  /** 把引用指向文件夹里的某个资源 */
  setReferenceToAsset(kind: RefSlot['kind'], path: string): void {
    const url = this.bundle?.urlForAsset(path)
    if (url) this.applyReference(kind, url)
  }

  /** 把引用指向本地任意图片（读成 data URL 内嵌，无文件夹也可用） */
  async setReferenceToLocalFile(kind: RefSlot['kind']): Promise<void> {
    const w = window as any
    let file: File | null = null
    if (w.showOpenFilePicker) {
      const [h] = await w.showOpenFilePicker({
        types: [{ description: '图片', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'] } }],
      })
      file = await h.getFile()
    } else {
      file = await pickFileViaInput()
    }
    if (!file) return
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = rej
      r.readAsDataURL(file!)
    })
    this.applyReference(kind, dataUrl)
  }

  /** 当前元素是否值得展示「引用文件」面板 */
  hasReferences(): boolean {
    return this.getReferences().length > 0
  }

  private displayRef(value: string | null): string | null {
    if (!value) return null
    if (value.startsWith('data:')) return '（已嵌入图片）'
    if (value.startsWith('blob:')) {
      const p = this.bundle?.pathForBlob(value)
      return p ? this.bundle!.relFromEntry(p) : '（文件夹资源）'
    }
    return value
  }

  private applyReference(kind: RefSlot['kind'], value: string): void {
    const el = this.selection.selected
    if (!el) return
    ensureId(el)
    if (kind === 'src') {
      const old = el.getAttribute('src')
      this.history.exec(
        new CallbackCommand(
          '改图片来源',
          () => el.setAttribute('src', value),
          () => (old === null ? el.removeAttribute('src') : el.setAttribute('src', old)),
        ),
      )
    } else {
      const old = el.style.backgroundImage
      const next = `url("${value}")`
      this.history.exec(
        new CallbackCommand(
          '改背景图',
          () => {
            el.style.backgroundImage = next
          },
          () => {
            el.style.backgroundImage = old
          },
        ),
      )
    }
    this.selection.refresh()
  }

  // ---------- 新增元素（文本框 / 图片，居中插入当前页） ----------

  /** 在当前页中央新增一个默认文本框（双击编辑文字，四周缩放控制换行） */
  addTextBox(): void {
    const root = this.slides.currentRoot
    if (!root) return
    const doc = this.host.doc
    const rw = root.clientWidth || 1280
    const rh = root.clientHeight || 720
    const W = Math.round(Math.min(420, rw * 0.5))
    const H = Math.round(Math.min(120, rh * 0.2))
    const left = Math.round((rw - W) / 2)
    const top = Math.round((rh - H) / 2)
    const box = doc.createElement('div')
    box.className = 'el el-sp'
    // 内联自包含样式：不依赖生成 deck 的 .el-tx/.pp（HTML 编辑器里也能用）
    box.setAttribute(
      'style',
      `position:absolute;left:${left}px;top:${top}px;width:${W}px;height:${H}px;` +
        `display:flex;align-items:center;justify-content:center;padding:8px;box-sizing:border-box`,
    )
    // 包一层子元素：让缩放走 size 模式（改 width/height 让文字换行），而非缩放字号
    const inner = doc.createElement('div')
    inner.setAttribute('style', 'width:100%;font-size:28px;line-height:1.3;color:#000;text-align:center')
    inner.textContent = '双击编辑文字'
    box.appendChild(inner)
    this.insertElement(root, box, '新增文本框')
  }

  /** 选本地图片，在当前页中央新增一张图片（按页面 ~50% 适配尺寸，可拖动/缩放） */
  async addImage(): Promise<void> {
    const file = await pickFileViaInput('image/*')
    if (!file) return
    const dataUrl = await fileToDataUrl(file)
    const dim = await imageSize(dataUrl)
    const root = this.slides.currentRoot
    if (!root) return
    const doc = this.host.doc
    const rw = root.clientWidth || 1280
    const rh = root.clientHeight || 720
    const scale = Math.min(1, (rw * 0.5) / dim.w, (rh * 0.6) / dim.h) || 1
    const W = Math.max(16, Math.round(dim.w * scale))
    const H = Math.max(16, Math.round(dim.h * scale))
    const left = Math.round((rw - W) / 2)
    const top = Math.round((rh - H) / 2)
    const img = doc.createElement('img')
    img.className = 'el el-pic'
    img.src = dataUrl
    img.setAttribute(
      'style',
      `position:absolute;left:${left}px;top:${top}px;width:${W}px;height:${H}px;object-fit:contain`,
    )
    this.insertElement(root, img, '新增图片')
  }

  /** 把新元素插入根节点（可撤销），并选中它 */
  private insertElement(root: HTMLElement, el: HTMLElement, label: string): void {
    ensureId(el)
    this.history.exec(
      new CallbackCommand(
        label,
        () => root.appendChild(el),
        () => {
          if (this.selection.selected === el) this.selection.deselect()
          el.remove()
        },
      ),
    )
    this.dirty = true
    this.selection.select(el)
  }

  // ---------- 幻灯片 ----------

  detectSlides(mode: SlideDetectMode, selector?: string): void {
    this.slides.detect(mode, selector)
  }
  switchSlide(i: number): void {
    this.slides.switchTo(i)
  }
  duplicateSlide(i: number): void {
    this.slides.duplicate(i)
  }
  deleteSlide(i: number): void {
    this.slides.remove(i)
  }
  moveSlide(i: number, dir: -1 | 1): void {
    this.slides.move(i, dir)
  }

  // ---------- 图层树（内容导向：只列文字/图片/视频等，隐藏 div/section 等纯结构容器）----------

  buildLayerTree(): LayerNode[] {
    if (!this.host?.doc?.body) return []
    this.nodeCount = 0
    return this.collectContent(this.host.doc.body)
  }

  private collectContent(parent: HTMLElement): LayerNode[] {
    const out: LayerNode[] = []
    for (const c of Array.from(parent.children)) {
      if (this.nodeCount++ > MAX_LAYER_NODES) break
      const el = c as HTMLElement
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BR') continue
      const kind = classifyContent(el)
      if (kind) {
        // 内容元素：作为一个图层，递归收集其内部的内容元素作为子层
        out.push({ el, kind, label: friendlyLabel(el, kind), children: this.collectContent(el) })
      } else {
        // 纯结构容器（div/section/...）：本身不展示，把内部内容上提到当前层
        out.push(...this.collectContent(el))
      }
    }
    return out
  }

  // ---------- 源码查看 / 定位 / 在线编辑 ----------

  /** 当前文档的干净 HTML（文件夹模式会还原相对路径） */
  getSourceHtml(): string {
    return this.exportHtml()
  }

  /**
   * 取干净 HTML，并定位当前选中元素在其中的行号。
   * 做法：给选中元素临时打一个标记属性，序列化后找标记所在行，再把标记移除。
   */
  getSourceWithLocation(): { html: string; line: number } {
    const el = this.selection.selected
    const MARK = 'data-hve-loc'
    if (el) el.setAttribute(MARK, '')
    let html = this.exportHtml()
    if (el) el.removeAttribute(MARK)
    let line = 0
    const idx = html.indexOf(MARK)
    if (idx >= 0) {
      line = html.slice(0, idx).split('\n').length
      html = html.replace(/\s*data-hve-loc(?:="")?/, '')
    }
    return { html, line }
  }

  /** 应用在线编辑的 HTML 源码：重新载入渲染（会重置撤销栈与选中） */
  async applySource(html: string): Promise<void> {
    if (this.bundle) html = await this.bundle.rewriteHtmlString(html)
    await this.loadHtml(html, this.fileName)
  }
}

/** File -> dataURL（内嵌图片用） */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result as string)
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

/** 读取图片原始像素尺寸 */
function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.onerror = () => res({ w: 320, h: 240 })
    img.src = url
  })
}

/** 没有 File System Access API 时，用隐藏 <input> 选单个文件 */
function pickFileViaInput(accept = 'image/*'): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/** webkitdirectory 兜底：用隐藏 <input> 选一个文件夹 */
function pickFolderViaInput(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.setAttribute('webkitdirectory', '')
    input.setAttribute('directory', '')
    input.onchange = () => resolve(input.files && input.files.length ? input.files : null)
    input.click()
  })
}

/** 元素是否有自己的（非空白）直接文字节点 */
function hasOwnText(el: HTMLElement): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? '').trim()) return true
  }
  return false
}

/** 把元素归类为面向用户的内容类型；纯结构容器返回 null（不进图层树） */
function classifyContent(el: HTMLElement): ContentKind | null {
  const tag = el.tagName
  if (tag === 'IMG' || tag === 'PICTURE' || tag === 'SVG') return 'image'
  if (tag === 'VIDEO') return 'video'
  if (tag === 'AUDIO') return 'audio'
  if (tag === 'IFRAME' || tag === 'CANVAS' || tag === 'OBJECT' || tag === 'EMBED') return 'embed'
  if (/^H[1-6]$/.test(tag)) return 'heading'
  if (tag === 'BLOCKQUOTE') return 'quote'
  if (tag === 'TABLE') return 'table'
  if (tag === 'UL' || tag === 'OL') return 'list'
  if (tag === 'A') return 'link'
  if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'button'
  // 普通含文字元素：p / li / td / span / figcaption / 直接写了文字的 div 等
  if (hasOwnText(el)) return 'text'
  return null
}

const KIND_CN: Record<ContentKind, string> = {
  heading: '标题',
  text: '文字',
  image: '图片',
  video: '视频',
  audio: '音频',
  link: '链接',
  button: '按钮',
  list: '列表',
  table: '表格',
  quote: '引用',
  embed: '嵌入内容',
}

/** 生成「类型 · 文字预览」的友好标签 */
function friendlyLabel(el: HTMLElement, kind: ContentKind): string {
  const name = KIND_CN[kind]
  if (kind === 'image') {
    const src = el.getAttribute('alt') || el.getAttribute('src') || ''
    const file = src.split(/[\\/]/).pop() || ''
    return file ? `${name} · ${file.slice(0, 22)}` : name
  }
  if (kind === 'video' || kind === 'audio' || kind === 'embed') return name
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return name
  return `${name} · ${text.slice(0, 18)}${text.length > 18 ? '…' : ''}`
}
