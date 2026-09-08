/**
 * StatsHud — 状态栏 HUD(原 `bw`)。
 *
 * 行为:
 *  - `#stats-hud` 每秒刷新一次(App.time 差 ≥ 1000):
 *    存活时 "Score: x | " + "FPS: n" + " | Ping: nms" (+ 暂停标记)。
 *  - score:质量 > 999 → "x.xk"(按 1/100 截断),文案取 I18n(huds.score,缺省 "Score")。
 *  - STE(Split-To-Escape 估算):最大细胞质量 > 35 时
 *    "STE: (m × 0.35 | 0.38)|0"(质量 > 1000 取 0.35)。
 *  - speed:读取后清零 MenuForm.speed,animSpeed 按 1/3 插值(取值有副作用)。
 *  - PIO:读取并清零 GameConnection.packetCount.in/out(取值有副作用)。
 *  - 其余 getter(n16/zoomLock/speed/PIO/STE)供其他子系统使用,不在 refresh 内输出。
 */

export default class StatsHud {
  /**
   * @param {Object} systems
   * @param {JQueryStatic} systems.$ jQuery(原 a7)
   * @param {import('../core/App').default} systems.app 原 c5(读取 time)
   * @param {import('./MenuForm').default} systems.menuForm 原 bF(isAlive/score/pieceCount/biggestPieceMass/speed/animSpeed/movementPaused)
   * @param {import('./SettingsPanel').default} systems.settings 原 bc(读取 autoZoom)
   * @param {import('../core/I18n').default} systems.i18n 原 ah(current.huds.*)
   * @param {import('../net/GameConnection').default} systems.gameConnection 原 bX(latency/packetCount)
   */
  constructor({ $, app, menuForm, settings, i18n, gameConnection }) {
    this.$ = $;
    this.app = app;
    this.menuForm = menuForm;
    this.settings = settings;
    this.i18n = i18n;
    this.gameConnection = gameConnection;
  }

  init() {
    this.fpsCount = 0;
    this.lastUpdateTime = 0;
    this.div = this.$("#stats-hud")[0];
    this.lockClosed = "<i class=\"fas fa-lock\"></i>";
    this.lockOpened = "<i class=\"fas fa-lock-open\"></i>";
    this.speedometer = "<i class=\"fas fa-tachometer\"></i>";
    this.iconPause = "<i class=\"fas fa-pause-circle\"></i>";
  }

  update() {
    this.fpsCount++;
    if (this.app.time - this.lastUpdateTime >= 1000) {
      this.lastUpdateTime = this.app.time;
      this.refresh();
    }
  }

  refresh() {
    let html = "";
    if (this.menuForm.isAlive) {
      html += this.score;
    }
    html += this.FPS + this.latency + this.paused;
    this.div.innerHTML = html;
    this.fpsCount = 0;
  }

  get zoomLock() {
    return this.settings.autoZoom === "on" ? this.lockClosed : this.lockOpened;
  }

  get score() {
    const value = this.menuForm.score > 999 ? (this.menuForm.score / 100 | 0) / 10 + "k" : this.menuForm.score;
    return (this.i18n.current.huds.score || "Score") + ": " + value + " | ";
  }

  get n16() {
    return "[" + this.menuForm.pieceCount + "/16]   ";
  }

  get STE() {
    const mass = this.menuForm.biggestPieceMass;
    if (mass > 35) {
      return "STE: " + (mass * (mass > 1000 ? 0.35 : 0.38) | 0) + "   ";
    }
    return "";
  }

  get FPS() {
    return "FPS: " + this.fpsCount;
  }

  get speed() {
    this.menuForm.animSpeed += (this.menuForm.speed - this.menuForm.animSpeed) / 3;
    this.menuForm.speed = 0;
    return this.speedometer + " " + (this.menuForm.animSpeed | 0) + "px/s   ";
  }

  get PIO() {
    const inCount = this.gameConnection.packetCount.in;
    const outCount = this.gameConnection.packetCount.out;
    this.gameConnection.packetCount.in = 0;
    this.gameConnection.packetCount.out = 0;
    return " | PIO: " + inCount + "|" + outCount;
  }

  get paused() {
    if (this.menuForm.movementPaused) {
      return " | " + this.iconPause + " " + (this.i18n.current.huds.paused || "Paused");
    }
    return "";
  }

  get latency() {
    return " | Ping: " + this.gameConnection.latency + "ms";
  }
}
