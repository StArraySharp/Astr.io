/**
 * ViewportRect — 主菜单雪花飘落特效(原 `bQ`)。
 *
 * 注意:文件名沿用 ARCHITECTURE.md 的映射(bQ → ViewportRect),但实测 bQ 的
 * 实际行为是主菜单打开时的下雪特效,与小地图视口框无关(详见重写报告)。
 *
 * 行为:
 *  - 150 片雪花随机分布;仅在 Menu.isOpened(主菜单打开)时 animate()/render()。
 *  - 构造时即抓取 `.modal-content`(玩家表单)并在 init 时把 "\uF2DC" 雪花图标
 *    渲染进 20×20 离屏 canvas 缓存(字体 "600 20px Font Awesome\ 5 Pro"),
 *    10 秒后再缓存一次(等 Web 字体加载完成)。
 *  - animate():竖直速度 = (10 + (3 + r) × 6 + booster) px/s;2% 概率每帧
 *    换向,水平摆速 2px/s;落到画布外后从上方半屏高度重生。
 *  - 雪花落入表单上缘(offsetTop + 12)且 collected < 25 时被"收集"
 *    (冻结不动);透明度 = r / 6。
 */

export default class ViewportRect {
  /**
   * @param {Object} systems
   * @param {JQueryStatic} systems.$ jQuery(原 a7)
   * @param {Window} systems.window 原 a6(innerWidth/innerHeight)
   * @param {Document} systems.document 原 a8(createElement)
   * @param {import('../ui/Menu').default} systems.menu 原 bB(isOpened)
   * @param {import('./Canvas').default} systems.canvas 原 c4(canvas/ctx)
   */
  constructor({ $, window, document, menu, canvas }) {
    this.$ = $;
    this.window = window;
    this.document = document;
    this.menu = menu;
    this.canvas = canvas;
    this.flakeCount = 150;
    this.points = [];
    this.cachedSnow = null;
    this.divPlayerForm = this.$(".modal-content")[0];
    this.collected = 0;
    this.fillPoints();
  }

  init() {
    this.cacheSnow();
    setTimeout(() => {
      this.cacheSnow();
    }, 10000);
  }

  fillPoints() {
    const width = this.window.innerWidth;
    const height = this.window.innerHeight;
    const now = Date.now();
    for (let i = 0; i < this.flakeCount; i++) {
      this.points.push({
        x: Math.random() * width | 0,
        y: height * Math.random() | 0,
        r: 3 + (Math.random() * 3 | 0),
        turner: now,
        turner2: now,
        turn: true,
        collected: false,
        booster: 2 * Math.random()
      });
    }
  }

  animate() {
    if (!this.menu.isOpened) {
      return;
    }
    const canvasWidth = this.canvas.canvas.width;
    const canvasHeight = this.canvas.canvas.height;
    const now = Date.now();
    const formTop = this.divPlayerForm.offsetTop + 12;
    const formLeft = this.divPlayerForm.offsetLeft;
    const formRight = this.divPlayerForm.offsetLeft + this.divPlayerForm.offsetWidth;
    for (let i = 0; i < this.flakeCount; i++) {
      const flake = this.points[i];
      const hit = this.collected < 25 && this.menu.isOpened && Math.abs(formTop - flake.y) <= flake.r && formTop - flake.y > 0 && flake.x > formLeft && flake.x < formRight;
      if (flake.collected && !hit) {
        this.collected--;
      }
      if (!flake.collected && hit) {
        this.collected++;
      }
      flake.collected = hit;
      if (flake.collected) {
        flake.turner = now;
        flake.turner2 = now;
        continue;
      }
      if (flake.y > canvasHeight) {
        flake.x = Math.random() * canvasWidth | 0;
        flake.y = -(Math.random() * canvasHeight / 2);
        flake.r = 3 + (Math.random() * 3 | 0);
        flake.booster = 2 * Math.random();
      }
      flake.y += (now - flake.turner) / 1000 * (10 + (3 + flake.r) * 6 + flake.booster);
      flake.turner = now;
      if (Math.random() > 0.98) {
        flake.turn = !flake.turn;
      }
      const sway = (now - flake.turner2) / 1000 * 2;
      flake.x += flake.turn ? sway : -sway;
      flake.turner2 = now;
    }
  }

  render() {
    if (!this.menu.isOpened) {
      return;
    }
    const ctx = this.canvas.ctx;
    for (let i = 0; i < this.flakeCount; i++) {
      const flake = this.points[i];
      if (flake.y - flake.r < 0) {
        continue;
      }
      ctx.globalAlpha = flake.r / 6;
      // 怪癖:贴图不居中 — dx 偏右 r/2、dy 上移 r/2(保留原偏移)
      ctx.drawImage(this.cachedSnow, flake.x + flake.r / 2, flake.y - flake.r / 2, 2 * flake.r, 2 * flake.r);
    }
    ctx.globalAlpha = 1;
  }

  cacheSnow() {
    const size = 20;
    const snowCanvas = this.document.createElement("canvas");
    snowCanvas.width = size;
    snowCanvas.height = size;
    const ctx = snowCanvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 " + size + "px Font Awesome\\ 5 Pro";
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.fillText("\uF2DC", size / 2, 10);
    this.cachedSnow = snowCanvas;
  }
}
