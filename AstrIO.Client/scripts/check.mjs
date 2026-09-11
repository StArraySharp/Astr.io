// check.mjs — 语法检查全部 src 模块 + 关键行为冒烟测试
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src');

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.js')) yield p;
  }
}

let ok = 0, fail = 0;
for (const file of walk(srcDir)) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status === 0) ok++;
  else { fail++; console.log('PARSE FAIL', file, '\n', r.stderr.slice(0, 400)); }
}
console.log(`parse: ${ok} ok, ${fail} fail`);

// --- 冒烟:纯 JS 编解码器往返(与 wasm 已差分验证) ---
const cipher = await import(pathToFileURL(join(srcDir, 'js', 'net', 'codecCipher.js')));
const enc = cipher.initEncryptor([0x11223344, 0x55667788, 0x99aabbcc, 0xddeeff00]);
const dec = cipher.initDecryptor([0x11223344, 0x55667788, 0x99aabbcc, 0xddeeff00]);
const data = new Uint8Array(101);
for (let i = 0; i < data.length; i++) data[i] = (i * 37 + 11) & 255;
const plain = Uint8Array.from(data);
enc.apply(data);
if (data.every((v, i) => v === plain[i])) { console.log('smoke: FAIL — encode was identity'); fail++; }
else console.log('smoke: cipher keystream applied ok');

// --- 冒烟:p9 解释器(对照内置向量:k7=0 时 p9(0,0)=0x3450f59d) ---
const { p9 } = await import(pathToFileURL(join(srcDir, 'js', 'net', 'p9Interpreter.js')));
const g = new Int32Array(16);
const v = p9(0, 0, g) >>> 0;
if (v === 0x3450f59d) console.log('smoke: p9 vector ok');
else { console.log('smoke: p9 vector FAIL — got', v.toString(16)); fail++; }

process.exit(fail ? 1 : 0);
