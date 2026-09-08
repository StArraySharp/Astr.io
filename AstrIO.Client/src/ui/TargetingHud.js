/**
 * TargetingHud — 目标观战 HUD(原 `bA`)。
 *
 * 行为:
 *  - update() 每 1000(App.time 单位)最多刷新一次;仅当
 *    SpectatorTab.freeSpectate 且 Targeting.isTurnedOn 时输出:
 *    target1/target2 的昵称与质量("OUT OF VIEW" / "NOT SELECTED"),
 *    以及两者质量合计到 `#targeting-playersMass span.mass`。
 *  - topViewport/mouseViewport/targetMode/centerViewport 四种观战模式:
 *    切换 #targeting-no-1 / #targeting-mouse / #targeting-players 显隐,
 *    并同步 #spectate-mode-top/-mouse/-target 与 #spectate-center 的 active 类。
 */

export default class TargetingHud {
  /**
   * @param {Object} systems
   * @param {JQueryStatic} systems.$ jQuery(原 a7)
   * @param {import('../core/App').default} systems.app 原 c5(读取 time)
   * @param {import('./SpectatorTab').default} systems.spectator 原 bJ(freeSpectate)
   * @param {import('../game/Targeting').default} systems.targeting 原 bS(target1/target2/isTurnedOn)
   */
  constructor({ $, app, spectator, targeting }) {
    this.$ = $;
    this.app = app;
    this.spectator = spectator;
    this.targeting = targeting;
  }

  init() {
    this.container = this.$("#targeting-hud");
    this.DIVno1viewport = this.$("#targeting-no-1");
    this.DIVmouse = this.$("#targeting-mouse");
    this.DIVplayers = this.$("#targeting-players");
    this.DIVtotalMass = this.$("#targeting-playersMass span.mass")[0];
    this.DIVplayer1 = {
      nick: this.$("#targeting-player1 span.nick")[0],
      mass: this.$("#targeting-player1 span.mass")[0]
    };
    this.DIVplayer2 = {
      nick: this.$("#targeting-player2 span.nick")[0],
      mass: this.$("#targeting-player2 span.mass")[0]
    };
    this.lastTime = this.app.time;
  }

  update() {
    if (this.app.time - this.lastTime < 1000) {
      return;
    }
    this.lastTime = this.app.time;
    if (!this.spectator.freeSpectate || !this.targeting.isTurnedOn) {
      return;
    }
    let totalMass = 0;
    if (this.targeting.target1.turnedOn) {
      this.DIVplayer1.nick.textContent = this.targeting.target1.nick;
      this.DIVplayer1.mass.textContent = this.targeting.target1.outOfView ? "OUT OF VIEW" : this.targeting.target1.mass;
      totalMass += this.targeting.target1.outOfView ? 0 : this.targeting.target1.mass;
    } else {
      this.DIVplayer1.nick.textContent = "Target 1";
      this.DIVplayer1.mass.textContent = "NOT SELECTED";
    }
    if (this.targeting.target2.turnedOn) {
      this.DIVplayer2.nick.textContent = this.targeting.target2.nick;
      this.DIVplayer2.mass.textContent = this.targeting.target2.outOfView ? "OUT OF VIEW" : this.targeting.target2.mass;
      totalMass += this.targeting.target2.outOfView ? 0 : this.targeting.target2.mass;
    } else {
      this.DIVplayer2.nick.textContent = "Target 2";
      this.DIVplayer2.mass.textContent = "NOT SELECTED";
    }
    this.DIVtotalMass.textContent = totalMass;
  }

  show() {
    this.container.show();
  }

  hide() {
    this.container.hide();
  }

  topViewport() {
    this.DIVno1viewport.show();
    this.DIVmouse.hide();
    this.DIVplayers.hide();
    this.$("#spectate-mode-top").addClass("active");
    this.$("#spectate-mode-mouse").removeClass("active");
    this.$("#spectate-mode-target").removeClass("active");
    this.$("#spectate-center").removeClass("active");
  }

  mouseViewport() {
    this.DIVmouse.show();
    this.DIVno1viewport.hide();
    this.DIVplayers.hide();
    this.$("#spectate-mode-top").removeClass("active");
    this.$("#spectate-mode-mouse").addClass("active");
    this.$("#spectate-mode-target").removeClass("active");
    this.$("#spectate-center").removeClass("active");
  }

  targetMode() {
    this.DIVplayers.show();
    this.DIVmouse.hide();
    this.DIVno1viewport.hide();
    this.$("#spectate-mode-top").removeClass("active");
    this.$("#spectate-mode-mouse").removeClass("active");
    this.$("#spectate-mode-target").addClass("active");
    this.$("#spectate-center").removeClass("active");
  }

  centerViewport() {
    this.DIVno1viewport.hide();
    this.DIVmouse.hide();
    this.DIVplayers.hide();
    this.$("#spectate-mode-top").removeClass("active");
    this.$("#spectate-mode-mouse").removeClass("active");
    this.$("#spectate-mode-target").removeClass("active");
    this.$("#spectate-center").addClass("active");
  }
}
