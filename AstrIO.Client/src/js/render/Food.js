/**
 * Food — 食物(颗粒)渲染(原 `bN` 单例)。
 *
 * 注:ARCHITECTURE.md 原先猜测 bN 为"名字颜色模式",实际内容是食物渲染;
 * 名字颜色(rainbow/hsl)逻辑在 NameRenderer.nick(cell.nameColor)中。
 *
 * 行为:
 *  - settings.food:"off" 不绘制;"monoColored" 单色批量绘制(一个 path 一次
 *    fill,半径 = pellet.radius + theme.foodSize,填充 theme.foodColor);
 *    "rainbow" 逐颗绘制(各自 colorHex)。
 *  - eatAnimation === "on" 时逐颗 animate()(monoColored 分支仅此条件下才动画)。
 */

export default class Food {
  /**
   * @param {Object} systems
   * @param {Object} systems.settings 设置面板(原 bc = ui/SettingsPanel):food / eatAnimation
   * @param {Object} systems.theme 主题(原 bj):foodSize / foodColor
   * @param {{ food: Array }} systems.world 世界状态(原 bD):食物列表
   * @param {{ ctx: CanvasRenderingContext2D, pi2: number }} systems.canvas
   *   主画布(原 c4 = render/Canvas)
   */
  constructor({ settings, theme, world, canvas }) {
    this.settings = settings;
    this.theme = theme;
    this.world = world;
    this.canvas = canvas;
  }

  render() {
    if (this.settings.food === 'off') {
      return;
    } else if (this.settings.food === 'monoColored') {
      this.monoColored();
    } else if (this.settings.food === 'rainbow') {
      this.rainbow();
    }
  }

  monoColored() {
    const ctx = this.canvas.ctx;
    const sizeAdd = this.theme.foodSize;
    let i = this.world.food.length;
    const animate = this.settings.eatAnimation === 'on';
    ctx.fillStyle = this.theme.foodColor;
    ctx.beginPath();
    while (i--) {
      const pellet = this.world.food[i];
      if (animate) {
        pellet.animate();
      }
      const radius = pellet.radius + sizeAdd;
      ctx.moveTo(pellet.x + radius, pellet.y);
      ctx.arc(pellet.x, pellet.y, radius, 0, this.canvas.pi2, true);
    }
    ctx.closePath();
    ctx.fill();
  }

  rainbow() {
    const ctx = this.canvas.ctx;
    const sizeAdd = this.theme.foodSize;
    let i = this.world.food.length;
    const animate = this.settings.eatAnimation === 'on';
    while (i--) {
      const pellet = this.world.food[i];
      const radius = pellet.radius + sizeAdd;
      if (animate) {
        pellet.animate();
      }
      ctx.fillStyle = pellet.colorHex;
      ctx.beginPath();
      ctx.arc(pellet.x, pellet.y, radius, 0, this.canvas.pi2, true);
      ctx.closePath();
      ctx.fill();
    }
  }
}
