/**
 * Store — localStorage 持久化封装(原 `af`)。
 *
 * 行为(与原实现对齐):
 *  - 桶键格式 `astrio-<name>`,值为 JSON。
 *  - `get(name, key)`:桶或字段不存在 → false;JSON.parse 无异常保护(与原一致)。
 *  - `set(name, key, value)`:读-合并-写回。
 *  - `reset()`:一次性标记 `extras.resetted = true`。
 *    原实现中还有一个遍历删除 `key.substring(0, 5) === "astrio"` 的循环,
 *    但 5 字符子串永远不等于 6 字符的 "astrio",是死分支——实际从未删除任何键,
 *    此处按可观察行为保留等价语义(不删除)。
 */

const PREFIX = 'astrio-';

export default class Store {
  constructor() {
    this.prefix = PREFIX;
    this.oldPrefix = 'astrio';
  }

  init() {
    this.reset();
  }

  /** 读取 `astrio-<name>` 桶中的 `<key>`;桶或字段缺失返回 false。 */
  get(name, key) {
    const bucket = JSON.parse(localStorage.getItem(this.prefix + name));
    if (bucket === null || bucket[key] === undefined) {
      return false;
    }
    return bucket[key];
  }

  /** 合并写入 `astrio-<name>` 桶。 */
  set(name, key, value) {
    let bucket = JSON.parse(localStorage.getItem(this.prefix + name));
    if (bucket === null) {
      bucket = {};
    }
    bucket[key] = value;
    localStorage.setItem(this.prefix + name, JSON.stringify(bucket));
  }

  /** 首次运行标记;此后为空操作(原实现的删除循环为死代码)。 */
  reset() {
    if (this.get('extras', 'resetted')) {
      return;
    }
    this.set('extras', 'resetted', true);
  }
}
