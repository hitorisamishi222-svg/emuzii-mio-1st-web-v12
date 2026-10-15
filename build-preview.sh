#!/usr/bin/env bash
set -euo pipefail

node --test --test-name-pattern='rejects malformed device session ID without revoking active sessions' security/mio-auth-flow.test.mjs

mkdir -p public/data
find . -maxdepth 1 -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.png' -o -name '*.jpg' \) ! -name 'index.html' ! -name 'gacha.html' ! -name 'api-*.js' ! -name 'bridge.js' ! -name '*.test.js' ! -name '*.test.mjs' -exec cp -t public/ {} +

if [ -d assets ]; then cp -R assets public/assets; fi
cp data/gacha-prizes-v2-preview.json public/data/gacha-prizes-v2-preview.json

test "$(find public -maxdepth 1 -type f -name 'gacha-mem-*.jpg' | wc -l | tr -d ' ')" -eq 16
test "$(find public -maxdepth 1 -type f -name 'gacha-lf-*.jpg' | wc -l | tr -d ' ')" -eq 11
node -e 'const fs=require("fs");const d=require("./public/data/gacha-prizes-v2-preview.json");const p=d.prizes;if(p.length!==27||p.filter(x=>x.mode==="通常").length!==16||p.filter(x=>x.mode==="ラキフェス").length!==11||p.some(x=>!fs.existsSync("public"+x.imagePath)))process.exit(1)'

test -s public/integrated-live-demo.html
test -s public/integrated-functional-test.html
test ! -e public/index.html
test ! -e public/gacha.html
test ! -e public/api-register.js
test ! -e public/bridge.js
