/**
 * I18n — 语言包系统(原 `ah`)。
 *
 * 行为:
 *  - 语言包以内嵌全局变量形式存在(window.lang_EN / lang_JA / lang_ZH / lang_KO / lang_ES)。
 *  - DOM 元素以属性 `Hstr="<attr>.<section>.<key>"` 声明翻译条目;attr 为
 *    "html"(写 innerHTML)或 "placeholder"(写占位符属性)。
 *  - change() 重扫所有 [Hstr] 元素并逐个 update();当前语言缺词时回退默认语言(EN)。
 *  - 当前语言由 SettingsPanel.language 单向决定(见 selected getter)。
 */

export default class I18n {
  /**
   * @param {object} systems
   * @param {Window} systems.view 全局 window(原 a6;语言包挂在 window.lang_XX 上)
   * @param {import('jquery')} systems.$ jQuery(原 a7)
   * @param {{ language: string }} systems.SettingsPanel 设置面板(原 bc,当前语言来源)
   */
  constructor(systems) {
    this.view = systems.view;
    this.$ = systems.$;
    this.settingsPanel = systems.SettingsPanel;
    this.default = null;
    this.supported = null;
  }

  init() {
    this.default = 'EN';
    this.supported = ['EN', 'JA', 'ZH', 'KO', 'ES'];
  }

  /** 对页面上所有 [Hstr] 元素重新应用翻译。 */
  change() {
    const nodes = this.$('[Hstr]');
    for (let i = 0; i < nodes.length; i++) {
      this.update(this.$(nodes[i]));
    }
  }

  /**
   * 应用单个元素的翻译;当前语言包缺词时回退默认语言包。
   * @param {import('jquery')} $el 带 Hstr 属性的元素
   */
  update($el) {
    const [attr, section, key] = $el.attr('Hstr').split('.');
    let pack = this.view['lang_' + this.selected] || this.view.lang_EN;
    if (!pack[section] || !pack[section][key]) {
      pack = this.view['lang_' + this.default];
    }
    if (attr === 'html') {
      $el.html(pack[section][key]);
    } else if (attr === 'placeholder') {
      $el.attr(attr, pack[section][key]);
    }
  }

  /** 当前语言代码(由 SettingsPanel.language 决定)。 */
  get selected() {
    return this.settingsPanel.language;
  }

  /** 当前语言包对象(可能为 undefined,与原实现一致)。 */
  get current() {
    return this.view['lang_' + this.selected];
  }

  /** 浏览器首选语言的主标签;不在支持列表时回退默认语言。 */
  get browser() {
    const raw = this.view.navigator.language.toUpperCase();
    // 怪癖:原实现为 `raw.indexOf("-") ? raw.split("-")[0] : raw`。
    // 不含 "-" 时 indexOf 返回 -1(真值),同样走 split 分支且结果等于整串,
    // 因此两个分支结果恒等,此处直接等价简化为 split("-")[0]。
    const main = raw.split('-')[0];
    return this.supported.indexOf(main) >= 0 ? main : this.default;
  }
}
