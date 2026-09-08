/**
 * InstantReplay — 即时回放设置面板(原混淆名 `bl`)。
 *
 * 行为:#instant-replay-panel 面板的开关(fadeIn/fadeOut 250ms)与
 * "instant-replay-container" 内 range/options 控件的初始化和左右步进/点击
 * 定位,委托 SettingsPanel.handleRange/handleOptions(模式 0=左移,1=右移,
 * 2=初始化,3=按 offsetX 点击定位);同步显示回放时长与保存热键。
 */

export default class InstantReplay {
  /**
   * @param {Object} systems
   * @param {Object} systems.settingsPanel 设置面板控件逻辑(原 bc,ui/SettingsPanel:
   *                                        handleRange/handleOptions/replayDuration/hideHud 等)
   * @param {Object} systems.keyBindings   热键绑定表(原 bf,input/KeyBindings:record)
   * @param {Function} systems.$           jQuery(原 a7)
   * @param {Document} systems.doc         document(原 a8)
   */
  constructor({ settingsPanel, keyBindings, $, doc }) {
    this.settingsPanel = settingsPanel;
    this.keyBindings = keyBindings;
    this.$ = $;
    this.doc = doc;
    this.isOpened = false;
    this.div = null;
  }

  init() {
    this.isOpened = false;
    this.div = this.$("#instant-replay-panel");
    this.setDomValues();
    this.addEvents();
  }

  setDomValues() {
    const $ = this.$;
    const settings = this.settingsPanel;
    $(".instant-replay-container .settings-options").each(function () {
      const type = $(this).attr("type");
      if (type === "range") {
        settings.handleRange(this, 2);
      } else if (type === "options") {
        settings.handleOptions(this, 2);
      }
    });
    this.updateDurationDisplay();
  }

  addEvents() {
    const $ = this.$;
    const settings = this.settingsPanel;
    const self = this;
    $(".irp-close").click(() => this.close());
    $(".instant-replay-container .fa-chevron-left").each(function () {
      $(this).click(() => {
        const parent = $(this).parent();
        const type = $(parent).attr("type");
        if (type === "options") {
          settings.handleOptions(parent, 0);
        } else if (type === "range") {
          settings.handleRange(parent, 0);
        }
        self.updateDurationDisplay();
      });
    });
    $(".instant-replay-container .fa-chevron-right").each(function () {
      $(this).click(() => {
        const parent = $(this).parent();
        const type = $(parent).attr("type");
        if (type === "options") {
          settings.handleOptions(parent, 1);
        } else if (type === "range") {
          settings.handleRange(parent, 1);
        }
        self.updateDurationDisplay();
      });
    });
    $(".instant-replay-container span.outer").each(function () {
      $(this).click(ev => {
        const parent = $(this).parent();
        settings.handleRange(parent, 3, ev.offsetX);
        self.updateDurationDisplay();
      });
    });
  }

  updateDurationDisplay() {
    const duration = this.doc.getElementById("irp-duration-display");
    if (duration) {
      duration.textContent = this.settingsPanel.replayDuration || 30;
    }
    const saveKey = this.doc.getElementById("irp-save-key");
    if (saveKey) {
      saveKey.textContent = this.keyBindings.record || "P";
    }
  }

  toggle() {
    if (this.isOpened) {
      this.close();
    } else {
      this.open();
    }
  }

  close() {
    this.isOpened = false;
    this.div.fadeOut(250);
  }

  open() {
    this.isOpened = true;
    this.div.fadeIn(250);
  }
}
