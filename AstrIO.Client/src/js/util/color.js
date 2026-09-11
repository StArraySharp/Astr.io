/**
 * color — RGB 颜色工具(原 `bT` 单例)。
 *
 * 按任务要求输出为"函数集合对象":`createColor(systems)` 返回带状态字段
 * (r/g/b/targetR/targetG/targetB/color/lastTime)与函数成员(update/newTargetRGB/
 * getColor)的对象,供渲染器直接读写 —— 等价于原单例实例。
 *
 * 行为(与原实现对齐):
 *  - update():每帧 r/g/b 向目标通道缓动 (target − current) / 80;
 *    color = "#" + (0x1000000 + (r<<16) + (g<<8) + (b|0)).toString(16).slice(1)。
 *    目标色节流:credit = min(App.time − lastTime − 2000, 33),
 *    credit < 0 时本轮跳过;否则 lastTime = App.time + credit 并随机重选目标
 *    (调色板 [255, 7, random|0] 以 sort(() => 0.5 − random) 乱序)。
 *    怪癖:lastTime 会前移至 time + credit(最多超前 33ms),
 *    因此实际换色周期 ≈ 2000ms + 每次最多 33ms 结转。
 *  - newTargetRGB():随机重选目标三通道。
 *  - getColor(colorObject, factor):"rgb((r·k)|0, (g·k)|0, (b·k)|0)"。
 */

export default function createColor(systems) {
  /**
   * @param {Object} systems
   * @param {Object} systems.App — time(每帧由 App.run 更新的 Date.now(),原 c5)
   */
  const app = systems.App;

  const state = {
    r: 0,
    g: 0,
    b: 0,
    targetR: 0,
    targetG: 0,
    targetB: 0,
    color: '#000000',
    lastTime: 0,

    update() {
      state.r += (state.targetR - state.r) / 80;
      state.g += (state.targetG - state.g) / 80;
      state.b += (state.targetB - state.b) / 80;
      state.color = '#' + (16777216 + (state.r << 16) + (state.g << 8) + (state.b | 0)).toString(16).slice(1);
      const credit = Math.min(app.time - state.lastTime - 2000, 33);
      if (credit < 0) {
        return;
      }
      state.lastTime = app.time + credit;
      state.newTargetRGB();
    },

    newTargetRGB() {
      const palette = [255, 7, Math.random() * 255 | 0];
      palette.sort(() => 0.5 - Math.random());
      state.targetR = palette[0];
      state.targetG = palette[1];
      state.targetB = palette[2];
    },

    getColor(colorObject, factor) {
      return 'rgb(' + (colorObject.r * factor | 0) + ',' + (colorObject.g * factor | 0) + ',' + (colorObject.b * factor | 0) + ')';
    },
  };

  return state;
}
