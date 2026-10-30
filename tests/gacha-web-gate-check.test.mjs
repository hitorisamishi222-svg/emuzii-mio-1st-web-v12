import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code = readFileSync(new URL('../GAS_WebGateOnly_20261030.gs', import.meta.url), 'utf8');
test('gate module is syntactically valid',()=>assert.doesNotThrow(()=>new Function(code)));
test('two-switch API does not accept arbitrary actions',()=>{assert.match(code,/webGateRead/);assert.match(code,/webGateSet/);assert.match(code,/管理シートの接続/)});
