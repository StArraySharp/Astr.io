/**
 * palette — 确定性玩家颜色调色板(原 `ag` 常量数组)。
 *
 * 消费方:游戏协议处理器 getColor(name)——`new Math.seedrandom(name)` 取
 * int32,对数组长度取模(先加长度再取模以容纳负数)后索引本数组,
 * 得到与昵称一一对应的稳定颜色。
 *
 * 38 个颜色均为字符串字面量,原样保留(含大小写不一致,如 "#ff5252"
 * 与 "#FF4081" 混排)。
 */

const palette = [
  '#ff5252',
  '#FF4081',
  '#E040FB',
  '#7C4DFF',
  '#536DFE',
  '#448AFF',
  '#40C4FF',
  '#FFFF00',
  '#FFD740',
  '#FFAB40',
  '#FF6E40',
  '#ff1744',
  '#F50057',
  '#D500F9',
  '#651FFF',
  '#3D5AFE',
  '#2979FF',
  '#00B0FF',
  '#00E5FF',
  '#1DE9B6',
  '#00E676',
  '#FFEA00',
  '#FFC400',
  '#FF9100',
  '#FF3D00',
  '#AA00FF',
  '#304FFE',
  '#2962FF',
  '#0091EA',
  '#00B8D4',
  '#00BFA5',
  '#00C853',
  '#64DD17',
  '#AEEA00',
  '#FFD600',
  '#FFAB00',
  '#FF6D00',
  '#DD2C00',
];

export default palette;
