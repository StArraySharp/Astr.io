/**
 * Minimap — 小地图(原 `bt`)。
 *
 * 行为:
 *  - `#minimap-nodes` canvas,边长取 Theme.minimapSize,字体 "300 12px Geogrotesque Rg"。
 *  - run():清除画布 → 画死亡位置 X(#0D47A1)→ 画自身视点圆点
 *    (存活 5px / 死亡 6px,填充 #fff,描边 rgba(51, 51, 51, 0.5))→ teamPlayers()。
 *  - teamPlayers():World.teamPlayers 每人 5px 圆点(#0D47A1)+ 昵称(底部对齐,y-6);
 *    含 "] " 的昵称按零宽空格 "\u200B" 切掉 tag 前缀。
 *  - setShape():圆形地图时 `#minimap-hud`/`#minimap-nodes` 加 border-radius 50% +
 *    clip-path circle,并重标 `.minimap-sector` 网格坐标文字(方形分支的编号 +1)。
 */

export default class Minimap {
  /**
   * @param {Object} systems
   * @param {JQueryStatic} systems.$ jQuery(原 a7)
   * @param {import('./Theme').default} systems.theme 原 bj(读取 minimapSize)
   * @param {import('../render/Grid').default} systems.grid 原 bI(edge/left/top/circle)
   * @param {import('./SpectatorTab').default} systems.spectator 原 bJ(viewBounds/x/y)
   * @param {import('./MenuForm').default} systems.menuForm 原 bF(isAlive/deathLocation)
   * @param {import('../game/World').default} systems.world 原 bD(teamPlayers)
   */
  constructor({ $, theme, grid, spectator, menuForm, world }) {
    this.$ = $;
    this.theme = theme;
    this.grid = grid;
    this.spectator = spectator;
    this.menuForm = menuForm;
    this.world = world;
  }

  init() {
    this.initted = true;
    this.canvas = this.$("#minimap-nodes")[0];
    this.size = this.theme.minimapSize;
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.pi2 = Math.PI * 2;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "bottom";
    this.ctx.font = "300 12px Geogrotesque Rg";
    this.ctx.lineWidth = 2;
    this.selector = 0;
  }

  run() {
    const ctx = this.ctx;
    const scale = this.size / this.grid.edge;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.strokeStyle = "#0D47A1";
    // 怪癖:死亡 X 的 x 不减 grid.left(y 却减了 grid.top)
    const deathX = this.menuForm.deathLocation.x * scale;
    const deathY = (this.menuForm.deathLocation.y - this.grid.top) * scale;
    ctx.beginPath();
    ctx.moveTo(deathX - 4, deathY - 4);
    ctx.lineTo(deathX + 4, deathY + 4);
    ctx.moveTo(deathX + 4, deathY - 4);
    ctx.lineTo(deathX - 4, deathY + 4);
    ctx.closePath();
    ctx.stroke();
    ctx.strokeStyle = "rgba(51, 51, 51, 0.5)";
    const selfX = (this.spectator.x - this.grid.left) * scale;
    const selfY = (this.spectator.y - this.grid.top) * scale;
    const selfRadius = this.menuForm.isAlive ? 5 : 6;
    ctx.beginPath();
    ctx.arc(selfX, selfY, selfRadius, 0, this.pi2, false);
    ctx.closePath();
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    this.teamPlayers();
  }

  teamPlayers() {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.beginPath();
    for (const player of this.world.teamPlayers.values()) {
      player.animate();
      const x = player.mapX;
      const y = player.mapY;
      ctx.moveTo(x + 5, y);
      ctx.arc(x, y, 5, 0, this.pi2, false);
      let nick = player.nick || "astr.io";
      // 怪癖:含 "] " 的昵称按零宽空格取后半;若无零宽空格则 [1] 为 undefined,
      // 下一行取 .length 会抛错(与原实现一致,数据源保证带 "\u200B")
      if (nick.includes("] ")) {
        nick = nick.split("\u200B")[1];
      }
      if (nick.length > 0) {
        ctx.fillText(nick, x, y - 6);
      }
    }
    ctx.closePath();
    ctx.fillStyle = "#0D47A1";
    ctx.fill();
  }

  setShape() {
    const hud = this.$("#minimap-hud");
    const nodes = this.$("#minimap-nodes");
    if (this.grid.circle) {
      hud.css({
        "border-radius": "50%",
        "clip-path": "circle(" + ((this.size >> 1) + 3) + "px at center)"
      });
      nodes.css({ "border-radius": "50%" });
      const sectors = this.$(".minimap-row").find(".minimap-sector");
      for (let i = 1; i <= 3; i++) {
        sectors[i].innerText = "A" + i;
      }
      // 怪癖:此处上界是 < 23(只重标 21、22 两个),方形分支是 <= 23
      for (let i = 21; i < 23; i++) {
        sectors[i].innerText = "E" + (i - 20);
      }
    } else {
      hud.css({
        "border-radius": "0%",
        "clip-path": "none"
      });
      nodes.css({ "border-radius": "0%" });
      const sectors = this.$(".minimap-row").find(".minimap-sector");
      for (let i = 1; i <= 3; i++) {
        sectors[i].innerText = "A" + (i + 1);
      }
      for (let i = 21; i <= 23; i++) {
        sectors[i].innerText = "E" + (i - 19);
      }
    }
  }
}
