/**
 * OpponentRings — 对手威胁等级光环(原 `bO` 单例)。
 *
 * 行为:
 *  - 每帧由 World.update() 调 reset() + segregator(cell):按
 *    cell.mass / menuForm.biggestPieceMass 比值把非病毒细胞分级:
 *    isMine → same;> 2.5 → biggerSTE;> 1.25 → bigger;> 0.75 → same;
 *    > 0.35/0.38(最大块 >1000 时 0.38)→ smaller;否则 STE。
 *  - render()(观战时不绘制):对每组画同心圆环(半径 = cell.radius + 15 +
 *    lineWidth/2),颜色:STE 绿 #76FF03 / smaller 蓝 #2196F3 / same 灰 #555555 /
 *    bigger 橙 #FF9800 / biggerSTE 红 #FD0000。
 *    线宽 = min(3/viewport, 14)|0,随缩放保持屏幕感知粗细。
 *
 * 注:STE 组在原实现中即可被"分裂吃掉"的细胞(比值极小)。
 */

export default class OpponentRings {
  /**
   * @param {Object} systems
   * @param {Object} systems.settings 设置面板(原 bc = ui/SettingsPanel):opponentRings
   * @param {{ biggestPieceMass: number }} systems.menuForm 菜单表单(原 bF):
   *   自己最大细胞质量(分级基准)
   * @param {{ isSpectating: boolean }} systems.camera 相机(原 bJ)
   * @param {{ ctx: CanvasRenderingContext2D, pi2: number }} systems.canvas
   *   主画布(原 c4 = render/Canvas)
   */
  constructor({ settings, menuForm, camera, canvas }) {
    this.settings = settings;
    this.menuForm = menuForm;
    this.camera = camera;
    this.canvas = canvas;
  }

  init() {
    this.STE = [];
    this.smaller = [];
    this.same = [];
    this.bigger = [];
    this.biggerSTE = [];
    this.lineWidth = 10;
  }

  /** @param {{ mass: number, isMine: boolean }} cell */
  segregator(cell) {
    const ratio = cell.mass / this.menuForm.biggestPieceMass;
    const steThreshold = this.menuForm.biggestPieceMass > 1000 ? 0.38 : 0.35;
    if (cell.isMine) {
      this.same.push(cell);
    } else if (ratio > 2.5) {
      this.biggerSTE.push(cell);
    } else if (ratio > 1.25) {
      this.bigger.push(cell);
    } else if (ratio > 0.75) {
      this.same.push(cell);
    } else if (ratio > steThreshold) {
      this.smaller.push(cell);
    } else {
      this.STE.push(cell);
    }
  }

  reset() {
    this.STE = [];
    this.smaller = [];
    this.same = [];
    this.bigger = [];
    this.biggerSTE = [];
  }

  render() {
    const mode = this.settings.opponentRings;
    if (mode === 'off' || this.camera.isSpectating) {
      return;
    }
    const ctx = this.canvas.ctx;
    this.lineWidth = Math.min(3 / this.camera.viewport, 14) | 0;
    ctx.lineWidth = this.lineWidth;
    this.renderGroup(this.STE, '#76FF03');
    this.renderGroup(this.smaller, '#2196F3');
    this.renderGroup(this.same, '#555555');
    this.renderGroup(this.bigger, '#FF9800');
    this.renderGroup(this.biggerSTE, '#FD0000');
  }

  /**
   * @param {Array} cells
   * @param {string} color
   */
  renderGroup(cells, color) {
    const ctx = this.canvas.ctx;
    ctx.strokeStyle = color;
    ctx.beginPath();
    let i = cells.length;
    while (i--) {
      const cell = cells[i];
      ctx.moveTo(cell.x + cell.radius + 15 + (this.lineWidth >> 1), cell.y);
      ctx.arc(cell.x, cell.y, cell.radius + 15 + (this.lineWidth >> 1), 0, this.canvas.pi2, true);
    }
    ctx.closePath();
    ctx.stroke();
  }
}
