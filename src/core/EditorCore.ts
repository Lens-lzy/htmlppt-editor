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
import { StylePatchCommand } from './history/commands/StylePatchCommand'
import { CallbackCommand } from './history/commands/CallbackCommand'
import { resetIds, ensureId } from './model/idattr'
import { serialize } from './io/Serializer'
import { readFile } from './io/Loader'
import {
  openViaPicker,
  openFolderViaPicker,
  readFolderFromInput,
  saveToHandle,
  download,
  supportsFS,
  supportsDirPicker,
} from './io/FileSystem'
import { AssetBundle } from './io/AssetBundle'
import type { SlideDetectMode } from './types'

export interface LayerNode {
  el: HTMLElement
  tag: string
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
  private fileName = 'edited.html'
  private handle?: FileSystemFileHandle
  private bundle: AssetBundle | null = null
  private nodeCount = 0
  private searchMatches: HTMLElement[] = []
  private searchIdx = -1

  mount(container: HTMLElement): void {
    const getZoom = () => this.zoom
    this.host = new FrameHost(container, this.bus, getZoom)
    this.overlay = new Overlay(container)
    this.selection = new SelectionController(this.bus, this.host, this.overlay, this.model)
    this.drag = new DragController(this.selection, this.applier, this.history, getZoom)
    this.resize = new ResizeController(this.selection, this.applier, this.history, this.host, getZoom)
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
    this.host.onHover = (el) => !this.textEdit.editing && this.selection.handleHover(el)
    this.host.onClick = (el) => this.selection.handleClick(el)
    this.host.onDblClick = (el) => {
      this.selection.select(el)
      this.textEdit.begin(el)
    }

    // overlay 手势
    this.overlay.onSelectionPointerDown = (e) => this.drag.begin(e)
    this.overlay.onHandlePointerDown = (dir, e) => this.resize.begin(dir, e)
    this.overlay.onSelectionDblClick = () => {
      if (this.selection.selected) this.textEdit.begin(this.selection.selected)
    }

    // overlay 跟随滚动/尺寸变化
    this.bus.on('reposition', () => this.selection.reposition())
  }

  // ---------- 文件 ----------

  async openFromFile(file: File): Promise<void> {
    this.resetSource()
    const f = await readFile(file)
    await this.loadHtml(f.html, f.name)
  }

  async loadFromUrl(url: string, name: string): Promise<void> {
    this.resetSource()
    const html = await (await fetch(url)).text()
    await this.loadHtml(html, name)
  }

  async openViaPicker(): Promise<void> {
    const f = await openViaPicker()
    if (!f) return
    this.resetSource()
    this.handle = f.handle
    await this.loadHtml(f.html, f.name)
  }

  /** 打开整个文件夹：入口 HTML + 同目录图片/CSS/字体一并读入并渲染 */
  async openFolder(): Promise<void> {
    const raw = await openFolderViaPicker()
    if (!raw) return
    this.resetSource()
    this.bundle = new AssetBundle(raw)
    this.handle = raw.entryHandle
    await this.loadHtml(await this.bundle.loadEntryHtml(), raw.entryName)
  }

  /** webkitdirectory 兜底（不支持 showDirectoryPicker 的浏览器） */
  async openFolderFromInput(list: FileList): Promise<void> {
    const raw = readFolderFromInput(list)
    this.resetSource()
    this.bundle = new AssetBundle(raw)
    await this.loadHtml(await this.bundle.loadEntryHtml(), raw.entryName)
  }

  get canPickDir(): boolean {
    return supportsDirPicker()
  }

  private resetSource(): void {
    this.handle = undefined
    this.bundle?.dispose()
    this.bundle = null
  }

  private async loadHtml(html: string, name: string): Promise<void> {
    resetIds()
    this.model.reset()
    this.history.reset()
    this.selection.deselect()
    this.searchMatches = []
    this.searchIdx = -1
    this.fileName = name || 'edited.html'
    await this.host.load(html)
    this.nodeCount = this.host.doc.querySelectorAll('*').length
    this.slides.detect('auto')
  }

  async save(): Promise<'saved' | 'downloaded'> {
    const text = this.exportHtml()
    if (this.handle) {
      try {
        await saveToHandle(this.handle, text)
        return 'saved'
      } catch {
        download(this.fileName, text)
        return 'downloaded'
      }
    }
    download(this.fileName, text)
    return 'downloaded'
  }

  exportDownload(): void {
    download(this.fileName.replace(/\.html?$/i, '') + '.edited.html', this.exportHtml())
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
    const oldVal = this.applier.get(el, prop)
    if (oldVal === value) return
    this.history.exec(new StylePatchCommand(el, id, prop, oldVal, value, this.applier))
    this.selection.refresh()
  }

  resetStyle(prop: string): void {
    this.applyStyle(prop, '')
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

  // ---------- 图层树 ----------

  buildLayerTree(): LayerNode[] {
    if (!this.host?.doc?.body) return []
    this.nodeCount = 0
    return Array.from(this.host.doc.body.children)
      .map((c) => this.toLayerNode(c as HTMLElement))
      .filter((n): n is LayerNode => n !== null)
  }

  private toLayerNode(el: HTMLElement): LayerNode | null {
    if (this.nodeCount++ > MAX_LAYER_NODES) return null
    const children: LayerNode[] = []
    for (const c of Array.from(el.children)) {
      const node = this.toLayerNode(c as HTMLElement)
      if (node) children.push(node)
    }
    return { el, tag: el.tagName.toLowerCase(), label: labelFor(el), children }
  }
}

/** 没有 File System Access API 时，用隐藏 <input> 选单个图片 */
function pickFileViaInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

function labelFor(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase()
  const cls = el.classList[0] ? '.' + el.classList[0] : ''
  let text = ''
  if (!el.children.length) {
    const t = (el.textContent ?? '').trim()
    if (t) text = ` 「${t.slice(0, 16)}${t.length > 16 ? '…' : ''}」`
  }
  return `${tag}${cls}${text}`
}
