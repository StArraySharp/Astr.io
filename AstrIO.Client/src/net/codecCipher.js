/**
 * codecCipher — codec.wasm 流密码的纯 JS 等效实现(已与 wasm 差分验证 96/96)。
 *
 * 算法(逆向自 codec.wat):
 *  - 双向独立 xorshift128 流:
 *      step: t = d ^ (d << 11);[a,b,c,d] = [a ^ t ^ (t>>>8) ^ (a>>>19), a, b, c]
 *      输出字:m = imul(newA, 0x5BD1E995)(MurmurHash 乘数),取 4 个小端字节异或数据。
 *  - q1(加密方向)初始化:state[i] = key[i] ^ [0xA5A5A5A5, 0x5A5A5A5A, 0xF0F0F0F0, 0x0F0F0F0F][i],再预热 16 步。
 *  - q2(解密方向)初始化:state[i] = key[i] ^ [0x12345678, 0x9ABCDEF0, 0xDEADBEEF, 0xCAFEBABE][i],再预热 16 步。
 *  - 与 wasm 一致:状态跨调用持续(流式);长度非 4 倍数时补一步并对尾部按 (m>>>shift)&255 逐字节异或。
 */

const MUL = 0x5BD1E995;
const Q1_CONSTANTS = [0xA5A5A5A5, 0x5A5A5A5A, 0xF0F0F0F0, 0x0F0F0F0F];
const Q2_CONSTANTS = [0x12345678, 0x9ABCDEF0, 0xDEADBEEF, 0xCAFEBABE];

export class XorShiftCipher {
  /** @param {number[]} words 4 个 u32 种子 @param {number[]} constants 异或常量 */
  constructor(words, constants) {
    this.s = words.map((x, i) => ((x >>> 0) ^ constants[i]) >>> 0);
  }

  /** 单步;返回更新后的 a(输出字)。 */
  step() {
    const [a0, b0, c0, d0] = this.s;
    const t = (d0 ^ (d0 << 11)) >>> 0;
    const a = ((a0 ^ t ^ (t >>> 8) ^ (a0 >>> 19)) >>> 0);
    this.s = [a, a0, b0, c0];
    return a;
  }

  /** 就地加/解密(与 wasm p5/p6 相同的字节布局与尾部处理)。 */
  apply(bytes) {
    const n = bytes.length;
    let i = 0;
    for (; i + 3 < n; i += 4) {
      const m = Math.imul(this.step(), MUL) >>> 0;
      bytes[i] ^= m & 255;
      bytes[i + 1] ^= (m >>> 8) & 255;
      bytes[i + 2] ^= (m >>> 16) & 255;
      bytes[i + 3] ^= (m >>> 24) & 255;
    }
    if (n > i) {
      const m = Math.imul(this.step(), MUL) >>> 0;
      let sh = 0;
      for (; i < n; i++, sh += 8) bytes[i] ^= (m >>> sh) & 255;
    }
    return bytes;
  }
}

/** q1 预热(加密方向状态)。 */
export function initEncryptor(words) {
  const c = new XorShiftCipher(words, Q1_CONSTANTS);
  for (let i = 0; i < 16; i++) c.step();
  return c;
}

/** q2 预热(解密方向状态)。 */
export function initDecryptor(words) {
  const c = new XorShiftCipher(words, Q2_CONSTANTS);
  for (let i = 0; i < 16; i++) c.step();
  return c;
}
