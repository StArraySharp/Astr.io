/**
 * Codec — 网络编解码器(原站点全局 `Codec`,对照反混淆版 Codec.js)。
 *
 * 双后端,同一 API:
 *  - WASM 后端:fetch codec.wasm(原始行为,流式状态在 wasm 全局中)。
 *  - 纯 JS 后端:codecCipher.js(双向 xorshift128 流,与 wasm 差分验证 96/96)
 *    + p9Interpreter.js(挑战哈希指令级解释,18/18 一致)。
 *
 * API(与原实现一致):
 *  - load():加载(仅 WASM 后端需要;失败回退纯 JS)
 *  - initFromSeed(view):32 字节种子(DataView,小端 8×u32)初始化双向流
 *  - encode(buf) → ArrayBuffer / decode(buf) → 原 buffer(就地解密)
 *  - challenge(algo, seed) → u32
 *  - reset():清 _seeded 标志
 */
import { initEncryptor, initDecryptor } from './codecCipher.js';
import { p9 } from './p9Interpreter.js';

const WASM_URL = '/js/connection/astrio/codec.wasm?v=3';
const EXPECTED_VERSION = 3;
const DATA_OFFSET = 256; // wasm d0()

export default class Codec {
  constructor() {
    this.ready = false;
    this._seeded = false;
    this.wasm = null;
    this.memory = null;
    this.dataOffset = DATA_OFFSET;
    this._readyPromise = null;
    this._enc = null; // 纯 JS 加密流
    this._dec = null; // 纯 JS 解密流
    this._globals = new Int32Array(16); // p9 用:g8..g15 = k7 种子
    this.usingWasm = false;
  }

  /** 加载 wasm;任何失败回退纯 JS(原实现在 wasm 失败时抛错,这里按等效行为优先保留 wasm 路径,注释说明差异)。
   *  性能对照:页面设 window.__ASTRIO_FORCE_JS_CODEC = true 可跳过 wasm,强制纯 JS 通信。 */
  load() {
    if (this._readyPromise) return this._readyPromise;
    if (typeof window !== 'undefined' && window.__ASTRIO_FORCE_JS_CODEC) {
      this._useJsFallback();
      return (this._readyPromise = Promise.resolve());
    }
    this._readyPromise = fetch(WASM_URL)
      .then(res => WebAssembly.instantiateStreaming(res, { env: { abort: () => {} } }))
      .then(({ instance }) => {
        this.wasm = instance.exports;
        if (!this.wasm.v1 || this.wasm.v1() !== EXPECTED_VERSION) {
          throw new Error('codec outdated — please hard refresh (Ctrl+Shift+R)');
        }
        this.memory = this.wasm.memory;
        this.dataOffset = this.wasm.d0();
        this.usingWasm = true;
        this.ready = true;
      })
      .catch(err => {
        // 回退:纯 JS 实现与 wasm 逐字节一致(见 codecCipher/p9Interpreter)
        this._useJsFallback();
        if (typeof console !== 'undefined' && console.warn) console.warn('Codec: wasm unavailable, using verified JS fallback', err);
      });
    return this._readyPromise;
  }

  /** 切到纯 JS 后端(与 wasm 逐字节一致)。 */
  _useJsFallback() {
    this.wasm = null;
    this.usingWasm = false;
    this.ready = true;
  }

  /** 32 字节种子初始化(view 为 DataView,小端读 8×u32)。 */
  initFromSeed(view) {
    const w = [];
    for (let i = 0; i < 8; i++) w.push(view.getUint32(i * 4, true));
    if (this.usingWasm) {
      this.wasm.k7(...w);
      this.wasm.q1(w[0], w[1], w[2], w[3]);
      this.wasm.q2(w[4], w[5], w[6], w[7]);
    } else {
      this._globals.set([0, 0, 0, 0, 0, 0, 0, 0, ...w]);
      this._enc = initEncryptor(w.slice(0, 4));
      this._dec = initDecryptor(w.slice(4, 8));
    }
    this._seeded = true;
  }

  /** 就地加密,返回新 ArrayBuffer(与原实现一致)。 */
  encode(buffer) {
    const src = new Uint8Array(buffer);
    if (this.usingWasm) {
      const mem = new Uint8Array(this.memory.buffer);
      mem.set(src, this.dataOffset);
      this.wasm.p5(src.length);
      const out = new ArrayBuffer(src.length);
      new Uint8Array(out).set(new Uint8Array(this.memory.buffer, this.dataOffset, src.length));
      return out;
    }
    return this._enc.apply(Uint8Array.from(src)).buffer;
  }

  /** 就地解密,返回原 buffer(与原实现一致,含“修改入参”这一行为)。 */
  decode(buffer) {
    const src = new Uint8Array(buffer);
    if (this.usingWasm) {
      const mem = new Uint8Array(this.memory.buffer);
      mem.set(src, this.dataOffset);
      this.wasm.p6(src.length);
      src.set(new Uint8Array(this.memory.buffer, this.dataOffset, src.length));
      return buffer;
    }
    this._dec.apply(src);
    return buffer;
  }

  reset() {
    this._seeded = false;
  }

  /** 认证挑战哈希,返回 u32。 */
  challenge(algo, seed) {
    if (!this.ready) return 0;
    if (this.usingWasm) {
      if (!this.wasm.p9) return 0;
      return this.wasm.p9(algo, seed) >>> 0;
    }
    return p9(algo, seed, this._globals) >>> 0;
  }
}
