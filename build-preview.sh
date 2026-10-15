#!/usr/bin/env bash
set -euo pipefail

mkdir -p public
find . -maxdepth 1 -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.png' \) ! -name 'index.html' ! -name 'gacha.html' ! -name 'api-*.js' ! -name 'bridge.js' ! -name '*.test.js' ! -name '*.test.mjs' -exec cp -t public/ {} +

if [ -d assets ]; then cp -R assets public/assets; fi

test -s public/integrated-live-demo.html
test -s public/integrated-functional-test.html
test ! -e public/index.html
test ! -e public/gacha.html
test ! -e public/api-register.js
test ! -e public/bridge.js
