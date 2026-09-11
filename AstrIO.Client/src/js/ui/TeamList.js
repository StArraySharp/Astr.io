/**
 * TeamList — 战队成员列表 HUD(原 `bu`)。
 *
 * 行为:
 *  - `#teamlist-positions` 整表重建;每行 tl-player / tl-position /
 *    tl-player-mass / tl-player-location([坐标])/ tl-player-nick。
 *  - 取 World.teamPlayers 按质量降序前 5 名;自己活着时(MenuForm.isAlive)
 *    追加在末尾 — 怪癖:若自己已在 Top5 会重复显示一行,否则为第 6 行。
 *  - 质量 > 999 → "x.xk"(按 1/100 截断);昵称缺省 "astr.io",经 xssFilters 过滤。
 *  - `#teamlist-hud` 在 init 中缓存(本类不使用,外部契约)。
 */

export default class TeamList {
  /**
   * @param {Object} systems
   * @param {JQueryStatic} systems.$ jQuery(原 a7)
   * @param {import('../core/App').default} systems.app 原 c5(读取 time)
   * @param {import('../game/World').default} systems.world 原 bD(teamPlayers)
   * @param {import('./MenuForm').default} systems.menuForm 原 bF(isAlive,且自身具有 mass/nick/location)
   * @param {{ inHTMLData(text: string): string }} systems.xssFilters 全局 XSS 过滤库
   */
  constructor({ $, app, world, menuForm, xssFilters }) {
    this.$ = $;
    this.app = app;
    this.world = world;
    this.menuForm = menuForm;
    this.xssFilters = xssFilters;
  }

  init() {
    this.lastUpdateTime = 0;
    this.html = "";
    this.temporaryArray = [];
    this.div = {
      positions: this.$("#teamlist-positions")[0]
    };
    this.hud = this.$("#teamlist-hud")[0];
  }

  update() {
    this.lastUpdateTime = this.app.time;
    this.generateList();
    this.div.positions.innerHTML = this.html;
    this.reset();
  }

  get totalMass() {
    // 怪癖:this.totalmass(全小写)由外部模块写入,属性名保持原契约
    return this.totalmass > 999 ? (this.totalmass / 100 | 0) / 10 + "k" : this.totalmass;
  }

  generateList() {
    this.world.teamPlayers.forEach(player => {
      this.temporaryArray.push(player);
    });
    this.temporaryArray.sort((a, b) => b.mass - a.mass);
    this.temporaryArray.splice(5);
    if (this.menuForm.isAlive) {
      this.temporaryArray.push(this.menuForm);
    }
    for (let i = 0; i < this.temporaryArray.length; i++) {
      this.addPlayer(this.temporaryArray[i], i + 1);
    }
  }

  addPlayer(player, position) {
    const mass = player.mass > 999 ? (player.mass / 100 | 0) / 10 + "k" : player.mass;
    const nick = player.nick || "astr.io";
    this.html += "<div class=\"tl-player\">\n    <div class=\"tl-position\">\n    " + position + "\n    </div><div class=\"tl-player-mass\">" + mass + "</div>\n    <div class=\"tl-player-location\">[" + player.location + "]</div><div class=\"tl-player-nick\">" + this.cleanNick(nick) + "</div></div>";
  }

  reset() {
    this.temporaryArray = [];
    this.html = "";
  }

  cleanNick(nick) {
    return this.xssFilters.inHTMLData(nick);
  }
}
