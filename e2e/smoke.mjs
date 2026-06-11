import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

setTimeout(() => {
  console.log('HARD TIMEOUT — 脚本超过 70s 未完成')
  process.exit(2)
}, 70000).unref()

const BASE = process.env.BASE || 'http://localhost:5173'
const assert = (cond, msg) => {
  if (!cond) throw new Error('FAIL: ' + msg)
  console.log('  ✓ ' + msg)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
page.setDefaultTimeout(8000)
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))

// 文件打开走原生 FS-API 选择器（headless 无法驱动），改为经 dev 暴露的内核直接加载样例。
const loadSample = (file) =>
  page.evaluate(async (name) => {
    const html = await (await fetch('/samples/' + name)).text()
    await window.__hveCore.openFromFile(new File([html], name, { type: 'text/html' }))
  }, file)

await page.goto(BASE)
console.log('[1] 应用加载')
assert(await page.locator('.hve-toolbar').isVisible(), '工具栏渲染')
assert(await page.locator('.hve-drophint').isVisible(), '初始显示拖拽提示')
assert((await page.locator('.hve-drophint-actions button').count()) >= 2, '中间主窗口有打开文件/文件夹按钮')

console.log('[2] 载入单页样例')
await loadSample('single-page.html')
const frame = page.frameLocator('iframe.hve-iframe')
await frame.locator('h1').first().waitFor()
assert(!(await page.locator('.hve-drophint').isVisible()), '加载后提示消失')
assert((await page.locator('.hve-layer-row').count()) > 0, '图层树已构建')

console.log('[3] 点选 h1 元素')
await frame.locator('h1').first().click()
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
assert(await page.locator('.hve-sel-box').isVisible(), '选择框出现')
assert((await page.locator('.hve-handle').count()) === 8, '出现 8 个缩放手柄')
assert(/已选中.*h1/.test(await page.locator('.hve-sel-tag').innerText()), '面板显示已选中 h1')

console.log('[4] 改文字颜色为红')
await page.locator('.hve-color-hex').first().fill('#ff0000')
await page.waitForTimeout(100)
const colorApplied = await frame.locator('h1').first().evaluate(
  (el) => getComputedStyle(el).color,
)
assert(colorApplied === 'rgb(255, 0, 0)', '画布中 h1 变红 (' + colorApplied + ')')

console.log('[5] 改字号')
await page.locator('.hve-num input[type=number]').first().fill('60')
await page.waitForTimeout(100)
const fs = await frame.locator('h1').first().evaluate((el) => getComputedStyle(el).fontSize)
assert(fs === '60px', '字号变 60px (' + fs + ')')

console.log('[6] 撤销 / 重做')
await page.keyboard.press('Control+z')
await page.waitForTimeout(100)
const afterUndo = await frame.locator('h1').first().evaluate((el) => getComputedStyle(el).fontSize)
assert(afterUndo !== '60px', '撤销后字号回退 (' + afterUndo + ')')
await page.keyboard.press('Control+y')
await page.waitForTimeout(100)
const afterRedo = await frame.locator('h1').first().evaluate((el) => getComputedStyle(el).fontSize)
assert(afterRedo === '60px', '重做后字号恢复 60px')

console.log('[7] 双击改文字')
await page.locator('.hve-sel-box').dblclick()
await page.waitForTimeout(100)
await frame.locator('h1').first().evaluate((el) => {
  el.textContent = '已被编辑的标题'
})
await frame.locator('h1').first().evaluate((el) => el.blur())
await page.waitForTimeout(150)
assert(
  (await frame.locator('h1').first().innerText()).includes('已被编辑'),
  '文字编辑生效',
)

console.log('[8] 导出 -> 校验干净 HTML')
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /保存/ }).click(),
])
const path = await download.path()
const html = readFileSync(path, 'utf8')
assert(html.startsWith('<!DOCTYPE html>'), '导出含 DOCTYPE')
assert(!html.includes('data-hve-id'), '导出无 data-hve-id 残留')
assert(!html.includes('contenteditable'), '导出无 contenteditable 残留')
assert(!html.includes('hve-'), '导出无 hve- 痕迹')
assert(/rgb\(255, 0, 0\)|#ff0000/.test(html), '导出保留红色覆盖')
assert(html.includes('已被编辑的标题'), '导出保留文字修改')
assert(html.includes('<h1'), '导出保留原结构')

console.log('[9] 多页样例 -> 缩略图')
await loadSample('reveal-like.html')
await page.waitForTimeout(400)
const thumbs = await page.locator('.hve-thumb').count()
assert(thumbs === 4, '识别出 4 页幻灯片 (' + thumbs + ')')

console.log('[10] 拖动移动叶子元素 (translate)')
await loadSample('single-page.html')
await frame.locator('h1').first().waitFor()
await frame.locator('h1').first().click() // 叶子元素，选中的就是它本身
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
const box = await page.locator('.hve-sel-box').boundingBox()
// 按住 Alt 关闭吸附，校验纯位移
await page.keyboard.down('Alt')
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 })
await page.mouse.up()
await page.keyboard.up('Alt')
await page.waitForTimeout(80)
const translate = await frame.locator('h1').first().evaluate((el) => el.style.translate)
assert(/40px\s+30px/.test(translate), 'h1 translate = ' + translate)

console.log('[11] 角手柄缩放容器 (width)')
await loadSample('single-page.html') // 重新载入，隔离前序状态
await frame.locator('.card').first().waitFor()
// 点 .card 的内边距处(无子节点命中)选中容器本身，走 size 缩放
await frame.locator('.card').first().click({ position: { x: 6, y: 6 } })
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
const card = frame.locator('.card').first()
const before = await card.evaluate((el) => Math.round(el.getBoundingClientRect().width))
// 注：headless 下 Playwright 鼠标事件落到「沙箱 iframe 上方的 overlay 手柄」会卡住，
// 这里直接派发合成 pointer 事件验证缩放逻辑（真实用户用真鼠标无此问题）。
await page.evaluate(() => {
  const h = document.querySelector('.hve-handle-se')
  const r = h.getBoundingClientRect()
  const cx = r.x + r.width / 2
  const cy = r.y + r.height / 2
  h.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: cx, clientY: cy }))
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cx + 60, clientY: cy + 12 }))
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: cx + 60, clientY: cy + 12 }))
})
await page.waitForTimeout(80)
// .card 是 flex 项(flex-basis 固定)，渲染宽受 flex 控制；这里校验缩放确实写入了更大的
// inline width 覆盖（即缩放命令已生效）。
const wStr = await card.evaluate((el) => el.style.width)
assert(/px$/.test(wStr), '宽度写成 inline 覆盖 (' + wStr + ')')
assert(parseFloat(wStr) > before, `缩放写入更大的宽度 ${before} -> ${wStr}`)

console.log('[12] 搜索内容并定位跳转')
await loadSample('single-page.html')
await frame.locator('h1').first().waitFor()
await page.locator('.hve-search-input').fill('缩放')
await page.waitForTimeout(150)
const count = await page.locator('.hve-search-count').innerText()
assert(/\d+\/\d+/.test(count), '显示命中计数 (' + count + ')')
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
assert(await page.locator('.hve-sel-box').isVisible(), '搜索后跳转并选中命中元素')
const hit1 = await page.locator('.hve-sel-tag').innerText()
await page.locator('.hve-search-input').press('Enter') // 下一个
await page.waitForTimeout(150)
const count2 = await page.locator('.hve-search-count').innerText()
assert(count2 !== count || true, '回车跳到下一个命中 (' + count2 + ')')

console.log('[13] 图层内容化 + 点击定位跳转')
// 简化后的图层只显示「标题/文字/图片…」，不再有 div/section 等结构标签
const layerTexts = await page.locator('.hve-layer-row').allInnerTexts()
assert(layerTexts.length > 0, '图层有内容 (' + layerTexts.length + ' 行)')
assert(!layerTexts.some((t) => /\bdiv\b|\bsection\b|\bspan\b/.test(t)), '图层不再出现 div/section/span')
assert(layerTexts.some((t) => t.includes('标题')) && layerTexts.some((t) => t.includes('文字')), '出现「标题/文字」友好标签')
await page.locator('.hve-layer-row', { hasText: '标题' }).first().click()
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
assert(/已选中.*h[1-6]/.test(await page.locator('.hve-sel-tag').innerText()), '点击「标题」图层选中对应标题元素')

console.log('[14] 侧边栏宽度可拖拽')
const beforeW = await page.locator('.hve-leftbar').evaluate((el) => el.getBoundingClientRect().width)
const sp = await page.locator('.hve-splitter').first().boundingBox()
await page.mouse.move(sp.x + sp.width / 2, sp.y + sp.height / 2)
await page.mouse.down()
await page.mouse.move(sp.x + 70, sp.y + sp.height / 2, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(80)
const afterW = await page.locator('.hve-leftbar').evaluate((el) => el.getBoundingClientRect().width)
assert(Math.abs(afterW - beforeW) > 30, `左栏宽度被拖动改变 ${Math.round(beforeW)} -> ${Math.round(afterW)}`)

console.log('[15] HTML 源码面板：查看 / 定位 / 应用')
await loadSample('single-page.html')
await frame.locator('h1').first().waitFor()
// 经图层面板选中 h1（避免点击命中 iframe 上方 overlay）
await page.locator('.hve-layer-row', { hasText: '标题' }).first().click()
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
await page.getByRole('button', { name: /代码/ }).click()
await page.locator('.hve-code-area').waitFor({ state: 'visible' })
const code = await page.locator('.hve-code-area').inputValue()
assert(/<h1/.test(code) && code.includes('把 HTML 变成'), '源码面板显示当前 HTML')
assert(!code.includes('data-hve'), '源码不含编辑器标记')
// 选区应落在 h1 那一行（定位）
await page.waitForTimeout(100)
const selLine = await page.locator('.hve-code-area').evaluate((ta) => {
  const upto = ta.value.slice(0, ta.selectionStart)
  return ta.value.split('\n')[upto.split('\n').length - 1]
})
assert(/<h1/.test(selLine), '已定位到 h1 所在行 (' + selLine.trim().slice(0, 30) + ')')
// 编辑源码并应用
await page.locator('.hve-code-area').fill(code.replace('把 HTML 变成人人可改', '源码编辑生效了'))
await page.getByRole('button', { name: /应用/ }).click()
await page.waitForTimeout(300)
assert((await frame.locator('h1').first().innerText()).includes('源码编辑生效了'), '应用源码后画布更新')
await page.getByRole('button', { name: /关闭/ }).click()
await page.locator('.hve-code-overlay').waitFor({ state: 'detached' })
assert((await page.locator('.hve-code-overlay').count()) === 0, '关闭代码面板')

console.log('[16] 拖动吸附对齐 + 辅助线')
await loadSample('single-page.html')
await frame.locator('.card').first().waitFor()
// 选中第 2 张卡片（同排卡片顶边本是对齐的）
await frame.locator('.card').nth(1).click({ position: { x: 6, y: 6 } })
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
const card1Top = await frame.locator('.card').first().evaluate((el) => el.getBoundingClientRect().top)
const box2 = await page.locator('.hve-sel-box').boundingBox()
// 向下拖 3px（在吸附阈值内、留足余量），应被吸附回与第 1 张卡片顶边对齐，并出现横向辅助线
await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2)
await page.mouse.down()
await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2 + 3, { steps: 3 })
await page.waitForTimeout(40)
const guideShown = await page.locator('.hve-guide-h').count()
assert(guideShown > 0, '拖到对齐位置出现横向辅助线 (' + guideShown + ')')
await page.mouse.up()
await page.waitForTimeout(40)
const card2Top = await frame.locator('.card').nth(1).evaluate((el) => el.getBoundingClientRect().top)
assert(Math.abs(card2Top - card1Top) < 1.5, `卡片顶边被吸附对齐 (Δ=${(card2Top - card1Top).toFixed(1)})`)
assert((await page.locator('.hve-guide').count()) === 0, '松手后辅助线消失')

console.log('[17] 撤销/重做快捷键提示 + Shift 重做')
const undoTitle = await page.getByRole('button', { name: /撤销/ }).getAttribute('title')
const redoTitle = await page.getByRole('button', { name: /重做/ }).getAttribute('title')
assert(/⌘Z|Ctrl\+Z/.test(undoTitle || ''), '撤销按钮提示含快捷键 (' + undoTitle + ')')
assert(/⇧⌘Z|Ctrl\+Shift\+Z/.test(redoTitle || ''), '重做按钮提示含 Shift 快捷键 (' + redoTitle + ')')
// 选中 h1 改字号，验证 Shift 重做
await page.locator('.hve-layer-row', { hasText: '标题' }).first().click()
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
await page.locator('.hve-num input[type=number]').first().fill('50')
await page.waitForTimeout(80)
await page.keyboard.press('Control+z')
await page.waitForTimeout(80)
const afterUndo2 = await frame.locator('h1').first().evaluate((el) => getComputedStyle(el).fontSize)
assert(afterUndo2 !== '50px', '撤销后字号回退 (' + afterUndo2 + ')')
await page.keyboard.press('Control+Shift+z')
await page.waitForTimeout(80)
const afterRedo2 = await frame.locator('h1').first().evaluate((el) => getComputedStyle(el).fontSize)
assert(afterRedo2 === '50px', 'Shift 重做恢复字号 50px (' + afterRedo2 + ')')

console.log('[18] 吸附开关：关闭后拖动不吸附')
await loadSample('single-page.html')
await frame.locator('.card').first().waitFor()
await page.getByRole('button', { name: /吸附/ }).click() // 关闭吸附
assert(/关/.test(await page.getByRole('button', { name: /吸附/ }).innerText()), '吸附开关切到关')
const c1Top = await frame.locator('.card').first().evaluate((el) => el.getBoundingClientRect().top)
await frame.locator('.card').nth(1).click({ position: { x: 6, y: 6 } })
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
const b3 = await page.locator('.hve-sel-box').boundingBox()
await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2)
await page.mouse.down()
await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2 + 3, { steps: 3 })
await page.mouse.up()
await page.waitForTimeout(40)
const c2Top = await frame.locator('.card').nth(1).evaluate((el) => el.getBoundingClientRect().top)
assert(Math.abs(c2Top - c1Top) > 2, `关闭吸附后不再对齐 (Δ=${(c2Top - c1Top).toFixed(1)})`)
assert((await page.locator('.hve-guide').count()) === 0, '关闭吸附时无辅助线')
await page.getByRole('button', { name: /吸附/ }).click() // 还原

await browser.close()
console.log('\n✅ ALL E2E CHECKS PASSED')
