/**
 * TeamLeaderboard — 战队(tag)排行榜(原 `bs`)。
 *
 * 行为:
 *  - `#team-leaderboard-positions` 整表重建 HTML,只显示前 5 行
 *    (team-lb-row / team-lb-position / team-lb-mass / team-lb-count / team-lb-nick)。
 *  - 行内颜色:仅当传入 color 且设置 lbColors === "on" 时加内联 style。
 *  - `#team-lb-stats`:online !== undefined 时更新 在线/观战/总质量 三个统计位。
 *  - 质量 ≥1e6 → "x.xm",≥1000 → "x.xk"(按 1/100 截断)。
 *  - tag 经 xssFilters.inHTMLData 过滤。
 */

export default class TeamLeaderboard {
  /**
   * @param {Object} systems
   * @param {JQueryStatic} systems.$ jQuery(原 a7)
   * @param {Document} systems.document 原 a8
   * @param {{ inHTMLData(text: string): string }} systems.xssFilters 全局 XSS 过滤库
   * @param {import('./SettingsPanel').default} systems.settings 原 bc(读取 lbColors)
   */
  constructor({ $, document, xssFilters, settings }) {
    this.$ = $;
    this.document = document;
    this.xssFilters = xssFilters;
    this.settings = settings;
  }

  init() {
    this.list = new Set();
    this.div = this.$("#team-leaderboard-positions")[0];
    this.statsDiv = this.document.getElementById("team-lb-stats");
  }

  add(tag, mass, teamSize, position, color) {
    this.list.add({ tag, mass, teamSize, position, color });
  }

  clear() {
    // ★ 防御:回放页(REPLAY_MODE)不 init 本模块,div/list 可能未定义;
    //   Player.readFile → GameConnection.disconnect 会无条件调到这里
    this.list.clear();
    this.div.innerHTML = "";
  }

  formatMass(mass) {
    if (mass >= 1000000) {
      return (mass / 100000 | 0) / 10 + "m";
    }
    if (mass >= 1000) {
      return (mass / 100 | 0) / 10 + "k";
    }
    return mass;
  }

  update(online, spectators, totalMass) {
    let html = "";
    let shown = 0;
    for (const row of this.list.values()) {
      if (++shown > 5) {
        break;
      }
      let style = "";
      if (row.color && this.settings.lbColors === "on") {
        style = "style=\"color: " + row.color + "\"";
      }
      html += "<div class=\"team-lb-row\"><span class=\"team-lb-position\">" + row.position + "</span><span class=\"team-lb-mass\" " + style + ">" + this.formatMass(row.mass) + "</span><span class=\"team-lb-count\" " + style + ">[" + row.teamSize + "]</span><span class=\"team-lb-nick\" " + style + ">" + this.clean(row.tag) + "</span></div>";
    }
    this.div.innerHTML = html;
    if (this.statsDiv && online !== undefined) {
      this.statsDiv.innerHTML = "<span><i class=\"fas fa-users\"></i> " + online + "</span><span><i class=\"fas fa-eye\"></i> " + spectators + "</span><span><i class=\"fas fa-weight-hanging\"></i> " + this.formatMass(totalMass) + "</span>";
    }
  }

  clean(text) {
    return this.xssFilters.inHTMLData(text);
  }
}
