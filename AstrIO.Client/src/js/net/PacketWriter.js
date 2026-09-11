/**
 * PacketWriter — 客户端上行包二进制写入器(原 `class bV`,全局实例原 `bW`)。
 *
 * 行为(怪癖如实保留):
 *  - 不是流式写入:每个 write* 先记录一条 {method, value, offset} 操作
 *    (method 为 DataView setter 名),length 累加字节数;
 *    `buffer` getter 才物化 ArrayBuffer——按记录顺序逐条调用
 *    dataview[method](offset, value, true),统一小端。
 *  - 因此 value 由 DataView 语义决定:uint8 写入 300 会被截断(mod 256),
 *    负数按 Two's-Complement 回绕;消费方(Keyboard.challengeAnswer 等)
 *    逐 charCodeAt 写入时,>255 的码元即被静默截断。
 *  - writeString8/writeString16 的长度前缀均为 writeUInt8(最长 255 字符);
 *    字符分别按 uint8 / uint16 逐个写入(charCodeAt,代理对按两个码元写)。
 *  - init() 仅重置 data/length,可在发送后复用实例(原 bW 即全局复用)。
 *
 * `writer` 导出对应原全局实例 bW,供 Keyboard(input/Keyboard,原 bZ)
 * 等发送器装配使用。
 */

export default class PacketWriter {
  constructor() {
    this.data = [];
    this.length = 0;
  }

  init() {
    this.data = [];
    this.length = 0;
  }

  writeUInt8(value) {
    this.data.push({ method: 'setUint8', value: value, offset: 1 });
    this.length++;
  }

  writeUInt16(value) {
    this.data.push({ method: 'setUint16', value: value, offset: 2 });
    this.length += 2;
  }

  writeUInt32(value) {
    this.data.push({ method: 'setUint32', value: value, offset: 4 });
    this.length += 4;
  }

  writeInt8(value) {
    this.data.push({ method: 'setInt8', value: value, offset: 1 });
    this.length++;
  }

  writeInt16(value) {
    this.data.push({ method: 'setInt16', value: value, offset: 2 });
    this.length += 2;
  }

  writeInt32(value) {
    this.data.push({ method: 'setInt32', value: value, offset: 4 });
    this.length += 4;
  }

  writeFloat32(value) {
    this.data.push({ method: 'setFloat32', value: value, offset: 4 });
    this.length += 4;
  }

  writeString8(str) {
    const count = str.length;
    this.writeUInt8(count);
    for (let i = 0; i < count; ++i) {
      this.writeUInt8(str.charCodeAt(i));
    }
  }

  writeString16(str) {
    const count = str.length;
    this.writeUInt8(count);
    for (let i = 0; i < count; ++i) {
      this.writeUInt16(str.charCodeAt(i));
    }
  }

  /** 物化并返回本次写入的 ArrayBuffer(操作记录不清空,可重复取)。 */
  get buffer() {
    const buffer = new ArrayBuffer(this.length);
    const view = new DataView(buffer);
    let offset = 0;
    const count = this.data.length;
    for (let i = 0; i < count; ++i) {
      const op = this.data[i];
      view[op.method](offset, op.value, true);
      offset += op.offset;
    }
    return view.buffer;
  }
}

/** 原全局复用实例 bW。 */
export const writer = new PacketWriter();
