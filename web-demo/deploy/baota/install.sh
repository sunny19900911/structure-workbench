#!/usr/bin/env bash
set -euo pipefail
umask 022
cd "$(dirname "$0")/../.."
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<12))throw Error("需要Node.js 22.12或更高版本")'
for tool in python3 libreoffice pdftoppm pdfinfo pdftotext pdfunite; do
 command -v "$tool" >/dev/null || { echo "缺少依赖：$tool，请先按部署说明安装"; exit 1; }
done
command -v pnpm >/dev/null || { echo '请先执行 npm install -g pnpm@10'; exit 1; }
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/pip install -r deploy/baota/requirements.txt
if [ ! -f .env ]; then cp deploy/baota/.env.example .env; chmod 600 .env; fi
for runtime_dir in outputs .tmp; do
 if [ ! -d "$runtime_dir" ]; then
  if [ "$(id -u)" = 0 ] && id www >/dev/null 2>&1; then
   install -d -m 700 -o www -g www "$runtime_dir"
  else
   mkdir -m 700 "$runtime_dir"
  fi
 fi
done
echo '安装完成。请填写 .env 的用户名、至少16位密码及实际目录，再由宝塔启动 deploy/baota/start.mjs。'
