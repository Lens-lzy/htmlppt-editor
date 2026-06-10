// File System Access API 封装 + 下载兜底

import type { RawBundle } from './AssetBundle'

export interface OpenedFile {
  html: string
  name: string
  handle?: FileSystemFileHandle
}

export function supportsFS(): boolean {
  return 'showOpenFilePicker' in window
}

export function supportsDirPicker(): boolean {
  return 'showDirectoryPicker' in window
}

export async function openViaPicker(): Promise<OpenedFile | null> {
  const w = window as any
  if (!w.showOpenFilePicker) {
    throw new Error('当前浏览器不支持文件选择器，请改用「拖拽文件」打开。')
  }
  const [handle] = await w.showOpenFilePicker({
    types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }],
  })
  const file = await handle.getFile()
  return { html: await file.text(), name: file.name, handle }
}

/** 通过 File System Access 目录选择器打开文件夹（可回写） */
export async function openFolderViaPicker(): Promise<RawBundle | null> {
  const w = window as any
  if (!w.showDirectoryPicker) {
    throw new Error('当前浏览器不支持文件夹选择器，请改用「选择文件夹」按钮。')
  }
  const dirHandle: FileSystemDirectoryHandle = await w.showDirectoryPicker()
  const files = new Map<string, File>()
  const handles = new Map<string, FileSystemFileHandle>()
  await walkDir(dirHandle, '', files, handles)
  const entryPath = pickEntry(files)
  if (!entryPath) throw new Error('该文件夹里没有找到 HTML 文件。')
  return {
    files,
    entryPath,
    entryName: entryPath.split('/').pop() || entryPath,
    dirHandle,
    entryHandle: handles.get(entryPath),
  }
}

async function walkDir(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  files: Map<string, File>,
  handles: Map<string, FileSystemFileHandle>,
): Promise<void> {
  for await (const [name, handle] of (dir as any).entries() as AsyncIterable<
    [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  >) {
    if (name.startsWith('.')) continue
    const path = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'file') {
      const fh = handle as FileSystemFileHandle
      files.set(path, await fh.getFile())
      handles.set(path, fh)
    } else {
      await walkDir(handle as FileSystemDirectoryHandle, path, files, handles)
    }
  }
}

/** webkitdirectory 兜底：从 <input> 的 FileList 构建资源包（不可回写，保存走下载） */
export function readFolderFromInput(list: FileList): RawBundle {
  const files = new Map<string, File>()
  for (const f of Array.from(list)) {
    const rel: string = (f as any).webkitRelativePath || f.name
    // 去掉顶层文件夹名，得到文件夹根相对路径
    const path = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel
    if (path.split('/').some((seg) => seg.startsWith('.'))) continue
    files.set(path, f)
  }
  const entryPath = pickEntry(files)
  if (!entryPath) throw new Error('该文件夹里没有找到 HTML 文件。')
  return { files, entryPath, entryName: entryPath.split('/').pop() || entryPath }
}

/** 选入口 HTML：优先根目录 index.html，否则层级最浅、字典序最前的那个 */
function pickEntry(files: Map<string, File>): string | null {
  const htmls = Array.from(files.keys()).filter((p) => /\.html?$/i.test(p))
  if (!htmls.length) return null
  if (files.has('index.html')) return 'index.html'
  const rootIndex = htmls.find((p) => /^index\.html?$/i.test(p))
  if (rootIndex) return rootIndex
  return htmls.sort((a, b) => {
    const da = a.split('/').length
    const db = b.split('/').length
    return da !== db ? da - db : a.localeCompare(b)
  })[0]
}

export async function saveToHandle(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await (handle as any).createWritable()
  await writable.write(text)
  await writable.close()
}

export function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}
