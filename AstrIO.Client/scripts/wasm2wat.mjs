// wasm2wat.mjs — regenerate WAT from the shipped codec.wasm (requires devDependency `wabt`)
import wabtFactory from 'wabt';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [,, inPath = 'wasm/codec.wasm', outPath = 'wat/codec.wat'] = process.argv;

const w = await wabtFactory();
const buf = readFileSync(inPath);
const mod = w.readWasm(new Uint8Array(buf), { readDebugNames: true });
mod.applyNames();
const text = mod.toText({ foldExprs: false, inlineExport: false });
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, text);
console.log(`wrote ${outPath} (${text.length} chars)`);
