/**
 * VirusRange — 病毒弹出范围圈(原 `bP` 单例)。
 *
 * 行为:render() 对 World 分拣出的病毒逐个画半径 = virus.radius + 760 的
 * 白色 10% 透明圆(病毒弹出/喷射最大距离);病毒淡出中(fadeStartTime > 0)
 * 时透明度按 (1 - 经过时间/settings.CellAnimation) 收缩到 0。
 *
 * 怪癖:
 *  - 设置键名为 `CellAnimation`(大写 C,与其余小写开头设置键不同),保持原样。
 *  - forEach 前有一次 globalAlpha = 0.1 的死赋值(循环内立即覆盖),保持原样。
 */

export default class VirusRange {
  /**
   * @param {Object} systems
   * @param {Object} systems.settings 设置面板(原 bc = ui/SettingsPanel):
   *   virusRange(开关)、CellAnimation(淡出时长,怪癖大写)
   * @param {{ ctx: CanvasRenderingContext2D, pi2: number }} systems.canvas
   *   主画布(原 c4 = render/Canvas)
   * @param {{ time: number }} systems.app 应用主循环(原 c5):当前帧时钟
   */
  constructor({ settings, canvas, app }) {
    this.settings = settings;
    this.canvas = canvas;
    this.app = app;
  }

  init() {
    this.viruses = new Set();
  }

  /** @param {{ x: number, y: number, radius: number, fadeStartTime: number }} virus */
  add(virus) {
    this.viruses.add(virus);
  }

  render() {
    if (this.settings.virusRange !== 'on') {
      return;
    }
    const ctx = this.canvas.ctx;
    ctx.globalAlpha = 0.1; // 死赋值,与原实现一致
    ctx.fillStyle = '#ffffff';
    this.viruses.forEach(virus => {
      const fade = virus.fadeStartTime > 0
        ? Math.max(1 - (this.app.time - virus.fadeStartTime) / this.settings.CellAnimation, 0)
        : 1;
      ctx.globalAlpha = 0.1 * fade;
      ctx.beginPath();
      ctx.arc(virus.x, virus.y, virus.radius + 760, 0, this.canvas.pi2, true);
      ctx.closePath();
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  reset() {
    this.viruses.clear();
  }
}
