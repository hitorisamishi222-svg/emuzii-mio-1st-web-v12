#!/usr/bin/env bash
set -euo pipefail

node --test mio-auth-rules-v21.test.mjs security/mio-auth-crypto.test.mjs security/mio-session-store.test.mjs security/mio-gacha-transaction.test.mjs security/mio-postgres-session-store.test.mjs security/mio-postgres-identifier-store.test.mjs security/mio-integration-flow.test.mjs security/mio-postgres-registration.test.mjs security/mio-postgres-login.test.mjs security/mio-session-cookie.test.mjs security/mio-auth-flow.test.mjs security/mio-auth-api-adapter.test.mjs security/mio-auth-request-guard.test.mjs

mkdir -p public
find . -maxdepth 1 -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.png' \) ! -name 'index.html' ! -name 'gacha.html' ! -name 'api-*.js' ! -name 'bridge.js' ! -name '*.test.js' ! -name '*.test.mjs' -exec cp -t public/ {} +

if [ -d assets ]; then cp -R assets public/assets; fi

test -s public/integrated-live-demo.html
test -s public/integrated-functional-test.html
test ! -e public/index.html
test ! -e public/gacha.html
test ! -e public/api-register.js
test ! -e public/bridge.js
