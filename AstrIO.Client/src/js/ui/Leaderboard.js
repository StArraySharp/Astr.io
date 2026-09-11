/**
 * Leaderboard — 玩家排行榜(原 `br`)。
 *
 * 行为:
 *  - `#leaderboard-positions` 整表重建 HTML(lb-row / lb-nick / lb-mass / lb-position)。
 *  - 名字颜色:nameColor 经 rgb()/rainbow/rainbow-gradient 白名单正则校验;
 *    rainbow → 注入的 CSS 动画类 lb-rainbow(-gradient);rgb() → 内联 style;
 *    否则回退 cell 颜色(需设置 lbColors === "on")。
 *  - 战队图表 `#leaderboard-chart`:team() 首次调用时显示并清空排行榜 DOM,
 *    之后只更新 .chart-bar.red/green/blue 的宽度样式;update() 再隐藏复位。
 *  - 质量 ≥1e6 → "x.xm",≥1000 → "x.xk"(均按 1/100 截断)。
 *  - 昵称经 xssFilters.inHTMLData 过滤。
 */

const NAME_COLOR_PATTERN = /^(rgb\(\d{1,3},\d{1,3},\d{1,3}\)|rainbow|rainbow-gradient)$/;

export default class Leaderboard {
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
    this.div = this.$("#leaderboard-positions")[0];
    this.teamLB = this.$("#leaderboard-chart");
    this.teamLBvisible = false;
    this.barsCss = this.document.createElement("style");
    this.$("head").append(this.barsCss);
    const rainbowCss = this.document.createElement("style");
    rainbowCss.textContent = "@keyframes lb-rainbow{0%{color:#ff0000}14%{color:#ff8c00}28%{color:#ffd700}42%{color:#44ff44}57%{color:#00bfff}71%{color:#8a2be2}85%{color:#ff69b4}100%{color:#ff0000}}.lb-rainbow{animation:lb-rainbow 3s linear infinite}.lb-rainbow-gradient{background:linear-gradient(90deg,#ff0000,#ff8c00,#ffd700,#00c853,#00bfff,#8a2be2,#ff69b4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}";
    this.$("head").append(rainbowCss);
  }

  add(tag, nick, mass, color, position, isSelf, isFriend, account, spec = false, crowned = false, nameColor = null) {
    this.list.add({ tag, nick, mass, color, position, isSelf, isFriend, account, spec, crowned, nameColor });
  }

  team(red, green, blue) {
    if (!this.teamLBvisible) {
      this.teamLB.show();
      this.div.innerHTML = "";
      this.teamLBvisible = true;
    }
    // 怪癖:blue 条宽用 |0 截断,red/green 用 Math.max(…, 0)
    this.barsCss.innerText = ".chart-bar.red { width: " + Math.max(150 * red, 0) + "px } .chart-bar.green { width: " + Math.max(150 * green, 0) + "px } .chart-bar.blue { width: " + (150 * blue | 0) + "px }";
  }

  clear() {
    this.list.clear();
  }

  update() {
    if (this.teamLBvisible) {
      this.teamLB.hide();
      this.teamLBvisible = false;
    }
    let html = "";
    for (const row of this.list.values()) {
      let inlineStyle = "";
      let extraClass = "";
      const nameColor = NAME_COLOR_PATTERN.test(row.nameColor) ? row.nameColor : "";
      if (nameColor === "rainbow") {
        extraClass = " lb-rainbow";
      } else if (nameColor === "rainbow-gradient") {
        extraClass = " lb-rainbow-gradient";
      } else if (nameColor) {
        inlineStyle = "style=\"color: " + nameColor + "\"";
      } else if (row.color && this.settings.lbColors === "on") {
        inlineStyle = "style=\"color: " + row.color + "\"";
      }
      const crown = row.crowned ? "<span class=\"lb-crown\">\u265B </span>" : "";
      const label = this.clean(row.tag.length ? "[" + row.tag + "] " + (row.nick || "astr.io") : row.nick || "astr.io");
      // 怪癖:row.spec 为真时 style 属性的位置直接输出 spec 字符串本身
      html += "<div class=\"lb-row\"><span class=\"lb-nick" + extraClass + " " + row.spec + "\" " + (row.spec || inlineStyle) + ">" + crown + label + "</span><span class=\"lb-mass" + extraClass + " " + row.spec + "\" " + (row.spec || inlineStyle) + ">" + this.formatMass(row.mass) + "</span><span class=\"lb-position\">" + row.position + "</span></div>";
    }
    this.div.innerHTML = html;
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

  clean(text) {
    return this.xssFilters.inHTMLData(text);
  }
}
