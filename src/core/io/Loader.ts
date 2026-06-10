import type { OpenedFile } from './FileSystem'

/** 从拖拽/文件输入得到的 File 读出 HTML 文本 */
export async function readFile(file: File): Promise<OpenedFile> {
  const html = await file.text()
  return { html, name: file.name }
}
