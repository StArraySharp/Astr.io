// gen-p9-ops.mjs — extract func0 (p9) instruction list from codec.wat into JSON
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lines = readFileSync(new URL('../wat/codec.wat', import.meta.url), 'utf8').split('\n');
const f0 = lines.slice(9 - 1, 2579 - 1).map(l => l.trim()).filter(Boolean)
  .map(l => l.replace(/;;.*$/, '').trim())
  .filter(Boolean);

const ops = [];
for (const raw of f0) {
  if (raw.startsWith('(func') || raw.startsWith('(local')) {
    const m = raw.match(/\(local (.+?)\)?$/);
    if (m) ops.push({ op: 'locals', count: m[1].trim().split(/\s+/).filter(Boolean).length });
    continue;
  }
  if (raw === 'end') { ops.push({ op: 'end' }); continue; }
  if (raw.startsWith('block')) { ops.push({ op: 'block', result: raw.includes('result') }); continue; }
  if (raw.startsWith('loop')) { ops.push({ op: 'loop' }); continue; }
  if (raw.startsWith('if')) {
    // 'if' or 'if (result i32)'
    ops.push({ op: 'if', result: raw.includes('result') });
    continue;
  }
  if (raw.startsWith('br_table')) {
    const targets = [...raw.matchAll(/(\d+) \(;/g)].map(m2 => +m2[1]);
    ops.push({ op: 'br_table', targets });
    continue;
  }
  if (raw.startsWith('br ')) {
    ops.push({ op: 'br', depth: +raw.match(/br (\d+)/)[1] });
    continue;
  }
  if (raw === 'return') { ops.push({ op: 'return' }); continue; }
  const parts = raw.split(/\s+/);
  const op = parts[0];
  if (op === 'local.get' || op === 'local.set' || op === 'local.tee' || op === 'global.get' || op === 'global.set') {
    ops.push({ op, arg: +parts[1] });
    continue;
  }
  if (op === 'i32.const') {
    let v = parts[1];
    let num = v.startsWith('-') ? -((+v.slice(1)) | 0) : (+v | 0);
    ops.push({ op: 'i32.const', arg: num });
    continue;
  }
  if (/^i32\./.test(op)) { ops.push({ op }); continue; }
  if (op === 'else') { ops.push({ op: 'else' }); continue; }
  throw new Error('unhandled op: ' + raw);
}

writeFileSync(new URL('../src/net/p9Ops.js', import.meta.url), '// 由 scripts/gen-p9-ops.mjs 从 wat/codec.wat 机械生成' + '\n' + 'export default ' + JSON.stringify(ops) + ';\n');
console.log('ops:', ops.length,
  'locals decl:', JSON.stringify(ops.find(o => o.op === 'locals')));
// block structure sanity
let depth = 0, maxDepth = 0;
for (const o of ops) {
  if (o.op === 'block' || o.op === 'loop' || o.op === 'if') { depth++; maxDepth = Math.max(maxDepth, depth); }
  else if (o.op === 'end') depth--;
}
console.log('final depth (should be 0):', depth, 'max nesting:', maxDepth);
