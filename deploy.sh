#!/usr/bin/env bash
#
# 服务器更新脚本（在 Ubuntu 服务器上跑）
#   拉取最新代码 -> 安装依赖 -> 构建 -> （可选）同步到 web 根目录
#
# 用法：
#   ./deploy.sh                                   # 构建到 ./dist
#   WEB_ROOT=/var/www/htmlppt ./deploy.sh         # 构建后同步到 /var/www/htmlppt
#   BASE_PATH=/ppt/ WEB_ROOT=/var/www/x ./deploy.sh   # 部署到子路径 /ppt/
#
set -euo pipefail
cd "$(dirname "$0")"

echo "==> [1/4] 拉取最新代码"
git pull --ff-only

echo "==> [2/4] 安装依赖"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> [3/4] 构建（base=${BASE_PATH:-/}）"
npm run build

if [ -n "${WEB_ROOT:-}" ]; then
  echo "==> [4/4] 同步 dist/ 到 $WEB_ROOT"
  mkdir -p "$WEB_ROOT"
  rsync -a --delete dist/ "$WEB_ROOT"/
  echo "==> 已部署到 $WEB_ROOT"
else
  echo "==> [4/4] 未设置 WEB_ROOT，跳过同步。静态文件已生成在 ./dist"
  echo "    把 nginx 的 root 指到这个 dist 目录，或设置 WEB_ROOT 重跑。"
fi

echo "==> 完成 ✅"
