/**
 * p9Interpreter — codec.wasm 导出 p9(挑战哈希)的忠实解释执行器(18/18 与 wasm 一致)。
 *
 * p9(a, b) 是无状态密钥化哈希:混合输入 a/b 与 k7 存入的 8 个种子全局(g8..g15)。
 * wasm 中该函数经 br_table/嵌套块混淆(2569 条指令),此处直接解释执行其指令序列,
 * 语义由构造保证,调用频率低(仅认证挑战),解释执行的性能足够。
 */
import OPS from './p9Ops.js';

const I32 = {
  'i32.add': (a, b) => (a + b) | 0,
  'i32.sub': (a, b) => (a - b) | 0,
  'i32.mul': (a, b) => Math.imul(a, b),
  'i32.and': (a, b) => a & b,
  'i32.or': (a, b) => a | b,
  'i32.xor': (a, b) => a ^ b,
  'i32.shl': (a, b) => a << b,
  'i32.shr_u': (a, b) => a >>> b,
  'i32.lt_u': (a, b) => ((a >>> 0) < (b >>> 0)) ? 1 : 0,
};

// 预扫描:块/循环/if 的配对 end 与 else 位置
const endOf = new Int32Array(OPS.length).fill(-1);
const elseOf = new Int32Array(OPS.length).fill(-1);
{
  const open = [];
  for (let i = 0; i < OPS.length; i++) {
    const o = OPS[i];
    if (o.op === 'block' || o.op === 'loop' || o.op === 'if') open.push(i);
    else if (o.op === 'else') elseOf[open[open.length - 1]] = i;
    else if (o.op === 'end') endOf[open.pop()] = i;
  }
}

/**
 * @param {number} a
 * @param {number} b
 * @param {Int32Array} globals 长度 ≥16;g8..g15 = k7 种子(每次 k7 后同步)
 * @returns {number} u32(以带符号形式返回,调用方 >>>0)
 */
export function p9(a, b, globals) {
  const locals = [a | 0, b | 0, 0, 0, 0, 0]; // 2 参数 + 4 局部
  const stack = [];
  const frames = [];
  let pc = 0;
  let steps = 0;

  const branch = (depth) => {
    const fi = frames.length - 1 - depth;
    const f = frames[fi];
    if (f.kind === 'loop') {
      stack.length = f.depth;
      frames.length = fi + 1;
      return f.start + 1;
    }
    const vals = [];
    for (let k = 0; k < f.arity; k++) vals.unshift(stack.pop());
    stack.length = f.depth;
    for (const v of vals) stack.push(v);
    frames.length = fi;
    return endOf[f.start] + 1;
  };

  while (pc < OPS.length) {
    if (++steps > 10_000_000) throw new Error('p9 interpreter runaway');
    const o = OPS[pc];
    switch (o.op) {
      case 'locals': pc++; break;
      case 'local.get': stack.push(locals[o.arg]); pc++; break;
      case 'local.set': locals[o.arg] = stack.pop(); pc++; break;
      case 'local.tee': locals[o.arg] = stack[stack.length - 1]; pc++; break;
      case 'global.get': stack.push(globals[o.arg] | 0); pc++; break;
      case 'global.set': globals[o.arg] = stack.pop(); pc++; break;
      case 'i32.const': stack.push(o.arg | 0); pc++; break;
      case 'block':
        frames.push({ kind: 'block', arity: o.result ? 1 : 0, depth: stack.length, start: pc });
        pc++;
        break;
      case 'loop':
        frames.push({ kind: 'loop', arity: 0, depth: stack.length, start: pc });
        pc++;
        break;
      case 'if': {
        const cond = stack.pop();
        frames.push({ kind: 'if', arity: o.result ? 1 : 0, depth: stack.length, start: pc });
        if (cond) pc++;
        else pc = (elseOf[pc] >= 0 ? elseOf[pc] : endOf[pc]) + 1;
        break;
      }
      case 'else': {
        const f = frames[frames.length - 1];
        pc = endOf[f.start] + 1;
        frames.pop();
        break;
      }
      case 'end': {
        const f = frames.pop();
        if (stack.length > f.depth + f.arity) stack.length = f.depth + f.arity;
        pc++;
        break;
      }
      case 'br': pc = branch(o.depth); break;
      case 'br_table': {
        const idx = stack.pop();
        const t = o.targets[idx] !== undefined ? o.targets[idx] : o.targets[o.targets.length - 1];
        pc = branch(t);
        break;
      }
      case 'return': return stack.length ? (stack[stack.length - 1] | 0) : 0;
      default: {
        const fn = I32[o.op];
        if (!fn) throw new Error('unknown op ' + o.op);
        const y = stack.pop(), x = stack.pop();
        stack.push(fn(x, y));
        pc++;
      }
    }
  }
  return stack.length ? (stack[stack.length - 1] | 0) : 0;
}
