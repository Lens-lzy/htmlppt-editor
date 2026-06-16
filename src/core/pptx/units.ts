// PPTX 单位换算。
// EMU：914400 EMU = 1 英寸；PowerPoint 以 96 DPI 渲染 → 9525 EMU = 1px。
// 这样 16:9 幻灯片 12192000×6858000 EMU 正好换算成 1280×720 px。

export const EMU_PER_PX = 9525

export function emuToPx(emu: number): number {
  return emu / EMU_PER_PX
}

/** 字号 sz 以「百分之一磅」存储；1pt = 96/72 px */
export function fontSzToPx(sz: number): number {
  return (sz / 100) * (96 / 72)
}

/** 磅 → px（行距等用） */
export function ptToPx(pt: number): number {
  return pt * (96 / 72)
}

/** 角度以「六万分之一度」存储 */
export function angleToDeg(a: number): number {
  return a / 60000
}

/** 千分比（lumMod/alpha 等以十万分比存储 -> 0..1） */
export function pctToRatio(v: number): number {
  return v / 100000
}

export function round(n: number, p = 2): number {
  const f = Math.pow(10, p)
  return Math.round(n * f) / f
}
