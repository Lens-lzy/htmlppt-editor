# HTMLPPT 可视化编辑器

本地运行的 HTML 可视化精修台 —— 加载一个**已经做好的 HTML**（说明页 / 幻灯片），在画布上
**点选、拖动、缩放、双击改字、调样式**，再**导出干净的 HTML**。不写一行代码，**不接入任何 AI**。

> 适用场景：工程师用 HTML 写说明页/slides，交给不懂代码的同事，他们用本工具可视化微调后导出。

## 快速开始

```bash
npm install
npm run dev        # 打开终端里的 http://localhost:5173
```

打开后把任意 `.html` 拖进画布，或点**中间主窗口**／左上角「📂 打开」选择 HTML 文件 / 文件夹。
推荐用 Chrome/Edge（支持 File System Access API，可直接存回原文件）。

**HTML 引用了外部图片 / CSS / 字体**（如 `<img src="images/x.png">`、`<link href="css/style.css">`）时，
单独拖一个 `.html` 进来这些资源会缺失——改用工具栏的「📁 打开文件夹」选中 **HTML 所在的整个文件夹**，
编辑器会把同目录下被引用的资源一并读入并正确渲染。选中图片或带背景图的元素后，右侧「引用文件」
面板可在文件夹资源里换图，或选一张本地图片内嵌。导出时引用会还原成原始相对路径，存回去照常可用。

## 怎么用

| 操作 | 方法 |
|---|---|
| 选中元素 | 在画布上点一下；或点侧栏「内容」树（按 标题/文字/图片/视频 等归类，不显示 div 等结构标签；点击自动滚动定位） |
| 搜索定位 | 工具栏搜索框输入文字，回车 / ↑↓ 在命中间跳转并选中（Shift+Enter 上一个） |
| 看/改源码 | 工具栏「</> 代码」打开源码面板：查看干净 HTML、自动定位选中元素所在行、可直接编辑后「应用更改」重新渲染 |
| 调整栏宽 | 拖动左右侧栏与画布之间的分隔条；宽度会记住 |
| 移动 | 抓住选中框拖动（用 CSS `translate`，不破坏原布局）；靠近其它元素的边/中线时**自动吸附对齐**并显示洋红辅助线，按住 **Alt** 临时关闭、工具栏「🧲 吸附」可整体开关 |
| 缩放 | 拖动选中框四周的 8 个手柄；图片/盒子改尺寸（**边缘也会吸附对齐**），纯文本改字号，按住 Shift 锁比例 |
| 改文字 | 双击元素进入编辑，点别处或 Esc 退出 |
| 调样式 | 右侧面板：字体/字号/颜色/对齐/行距、背景/圆角/描边、阴影/透明度/旋转、内外边距 |
| 换引用图片 | 选中 `<img>` 或带背景图的元素，右侧「引用文件」下拉选文件夹里的图，或选本地图片内嵌 |
| 撤销/重做 | ⌘Z / ⇧⌘Z（Windows：Ctrl+Z / Ctrl+Shift+Z）；按钮上也标注了对应快捷键 |
| 多页幻灯片 | 底部缩略图切换；可复制/删除/重排；工具栏可选分页识别方式 |
| 保存 | 「保存」：有文件句柄则存回原文件，否则下载导出 |

导出的 HTML **保留原始结构**，只多出被改元素的 inline 样式覆盖；剥离一切编辑器痕迹
（`data-hve-id`、`contenteditable`、`hve-*` 类等）。

## 架构

- **编辑内核** `src/core/` —— 纯 TypeScript，零框架依赖，直接操作 iframe DOM。
  目标 HTML 渲染在 `sandbox="allow-same-origin"` 的 iframe 里（禁脚本、静态渲染），
  选择框/手柄画在父页面的 overlay 上，iframe 文档保持干净。
- **UI 壳** `src/ui/` —— Preact + signals，订阅内核的 EventBus 广播。
- **核心原则**：所有 DOM 改动只经 `History.exec(command)` 一条路径 → 撤销/重做天然完备。

详见实现计划：`~/.claude/plans/ai-html-velvety-lemur.md`。

## 测试

```bash
npm test          # 单元测试：坐标换算 / 颜色 / 序列化 / 多页识别
npm run test:e2e  # 端到端：需先 npm run dev（默认连 http://localhost:5191，可改 BASE 环境变量）
npm run build     # 类型检查 + 生产构建
npm run build:single  # 打成单文件 dist/index.html（双击即用）
```

> e2e 用 Playwright 驱动无头 Chromium，覆盖 加载→选中→改色/字号→撤销重做→改字→
> 导出校验干净 HTML→多页识别→拖动→缩放 全链路。

## 部署到自己的服务器

这是个纯静态站点（构建产物在 `dist/`），用 nginx 直接托管。
默认部署到 **https://web.bonjor.fun/html-editor/**（即 `/var/www/html/html-editor/`）。

**首次部署（在 Ubuntu 服务器上）：**

```bash
cd /var/www/html                      # 或任意你放代码的目录
git clone https://github.com/Lens-lzy/htmlppt-editor.git
cd htmlppt-editor
# 需要 Node.js（建议 18+）。没装的话：
#   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
./deploy.sh                           # 默认构建并同步到 /var/www/html/html-editor
```

由于已有 `web.bonjor.fun` 的 nginx 站点把 `root` 指向 `/var/www/html`，
子目录 `html-editor/` 会被自动当成静态资源服务，**无需改 nginx**，
访问 `https://web.bonjor.fun/html-editor/` 即可。

**后续更新：** 本地改完 `git push`，服务器上重跑一行：

```bash
cd htmlppt-editor && ./deploy.sh
```

`deploy.sh` 会 `git pull` → 装依赖 → 用 `base=/html-editor/` 构建 → `rsync` 到 `/var/www/html/html-editor`。
想换路径临时覆盖即可，如 `BASE_PATH=/ppt/ WEB_ROOT=/var/www/html/ppt ./deploy.sh`
（`base` 必须等于访问子路径，首尾都带 `/`，否则页面资源会 404）。
