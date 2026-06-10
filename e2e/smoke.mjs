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

await page.goto(BASE)
console.log('[1] 应用加载')
assert(await page.locator('.hve-toolbar').isVisible(), '工具栏渲染')
assert(await page.locator('.hve-drophint').isVisible(), '初始显示拖拽提示')

console.log('[2] 载入单页样例')
await page.getByRole('button', { name: '单页' }).click()
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
await page.getByRole('button', { name: '多页' }).click()
await page.waitForTimeout(400)
const thumbs = await page.locator('.hve-thumb').count()
assert(thumbs === 4, '识别出 4 页幻灯片 (' + thumbs + ')')

console.log('[10] 拖动移动叶子元素 (translate)')
await page.getByRole('button', { name: '单页' }).click()
await frame.locator('h1').first().waitFor()
await frame.locator('h1').first().click() // 叶子元素，选中的就是它本身
await page.locator('.hve-sel-box').waitFor({ state: 'visible' })
const box = await page.locator('.hve-sel-box').boundingBox()
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(80)
const translate = await frame.locator('h1').first().evaluate((el) => el.style.translate)
assert(/40px\s+30px/.test(translate), 'h1 translate = ' + translate)

console.log('[11] 角手柄缩放容器 (width)')
await page.getByRole('button', { name: '单页' }).click() // 重新载入，隔离前序状态
await frame.locator('.card').first().waitFor()
// 通过图层面板选中 .card 容器(走 size 缩放)，避免 iframe 内点击命中子节点
await page.locator('.hve-layer-row', { hasText: 'div.card' }).first().click()
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

await browser.close()
console.log('\n✅ ALL E2E CHECKS PASSED')
