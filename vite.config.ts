import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

// 普通模式：常规多文件构建（开发用）。
// 单文件模式：BUILD_SINGLEFILE=1 时把整个应用打成一个 index.html，双击即用（计划 M6）。
const singlefile = process.env.BUILD_SINGLEFILE === '1'

// 部署路径：默认根 '/'（部署在域名/端口根目录）。
// 若部署在子路径下，构建时传 BASE_PATH，如：BASE_PATH=/ppt/ npm run build
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [
    preact(),
    ...(singlefile ? [(await import('vite-plugin-singlefile')).viteSingleFile()] : []),
  ],
  build: {
    target: 'es2020',
  },
})
