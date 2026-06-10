#!/usr/bin/env bash
#
# 服务器更新脚本（在 Ubuntu 服务器上跑）
#   拉取最新代码 -> 安装依赖 -> 构建 -> 同步到 nginx web 目录
#
# 默认部署到 https://web.bonjor.fun/html-editor/
# 直接运行即可：  ./deploy.sh
# 想改路径/目录可临时覆盖，如：  BASE_PATH=/ppt/ WEB_ROOT=/var/www/html/ppt ./deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")"

# 部署在子路径下，base 必须等于该子路径（首尾都带 /），否则页面资源会 404
export BASE_PATH="${BASE_PATH:-/html-editor/}"
WEB_ROOT="${WEB_ROOT:-/var/www/html/html-editor}"

echo "==> [1/4] 拉取最新代码"
git pull --ff-only

echo "==> [2/4] 安装依赖"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

echo "==> [3/4] 构建（base=$BASE_PATH）"
npm run build

echo "==> [4/4] 同步 dist/ 到 $WEB_ROOT"
mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT"/

echo "==> 完成 ✅  访问：https://web.bonjor.fun${BASE_PATH}"
