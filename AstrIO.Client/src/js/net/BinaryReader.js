/**
 * BinaryReader — 服务器下行包二进制读取器(原 `class bU`)。
 *
 * 行为:
 *  - init(buffer):持有 DataView,length(读指针)归零,maxLength 为缓冲长度。
 *  - 多字节读取(uint16/int16/uint32/int32/float/double)统一传
 *    isLittleEndian(默认 true)——小端协议。
 *  - end getter:length >= maxLength(读尽判定)。
 *  - string8():uint8 长度前缀 + 每字符 uint8(经 String.fromCharCode,>255
 *    不可能,实际是 Latin-1 风格字节串)。
 *  - string16():怪癖——长度前缀同样是 uint8(最长 255 字符),字符按 uint16
 *    逐个读取(可表示 BMP 内任意码元)。
 *  - readUInt8/readUInt16/readUInt32/readFloat/readString16 为消费方
 *    (Keyboard/协议处理器)使用的别名薄封装。
 *  - 越界读取未做防护(原样保留,越界时 DataView 抛 RangeError)。
 */

export default class BinaryReader {
  /** @param {ArrayBuffer} [buffer] 可选初始缓冲(传入则等价 init(buffer)) */
  constructor(buffer) {
    this.dataview = null;
    this.length = 0;
    this.isLittleEndian = true;
    this.maxLength = 0;
    if (buffer) {
      this.init(buffer);
    }
  }

  /** @param {ArrayBuffer} buffer */
  init(buffer) {
    this.dataview = new DataView(buffer);
    this.length = 0;
    this.maxLength = this.dataview.byteLength;
  }

  /** 读指针是否已达缓冲末尾。 */
  get end() {
    return this.length >= this.maxLength;
  }

  uint8() {
    const value = this.dataview.getUint8(this.length);
    this.length++;
    return value;
  }

  int8() {
    const value = this.dataview.getInt8(this.length);
    this.length++;
    return value;
  }

  uint16() {
    const value = this.dataview.getUint16(this.length, this.isLittleEndian);
    this.length += 2;
    return value;
  }

  int16() {
    const value = this.dataview.getInt16(this.length, this.isLittleEndian);
    this.length += 2;
    return value;
  }

  uint32() {
    const value = this.dataview.getUint32(this.length, this.isLittleEndian);
    this.length += 4;
    return value;
  }

  int32() {
    const value = this.dataview.getInt32(this.length, this.isLittleEndian);
    this.length += 4;
    return value;
  }

  float() {
    const value = this.dataview.getFloat32(this.length, this.isLittleEndian);
    this.length += 4;
    return value;
  }

  double() {
    const value = this.dataview.getFloat64(this.length, this.isLittleEndian);
    this.length += 8;
    return value;
  }

  /** 读指针前移 count 字节(无边界检查)。 */
  skipBytes(count) {
    this.length += count;
  }

  string8() {
    let result = '';
    const count = this.uint8();
    for (let i = 0; i < count; i++) {
      result += String.fromCharCode(this.uint8());
    }
    return result;
  }

  string16() {
    let result = '';
    const count = this.uint8();
    for (let i = 0; i < count; i++) {
      result += String.fromCharCode(this.uint16());
    }
    return result;
  }

  readUInt8() {
    return this.uint8();
  }

  readUInt16() {
    return this.uint16();
  }

  readUInt32() {
    return this.uint32();
  }

  readFloat() {
    return this.float();
  }

  readString16() {
    return this.string16();
  }
}
