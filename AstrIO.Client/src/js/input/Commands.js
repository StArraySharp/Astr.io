/**
 * Commands — 自定义聊天命令槽(原 `bh` 单例)。
 *
 * 行为(与原实现对齐):
 *  - 共 10 个槽 command0..command9(任务描述"命令 1-5",实际为 0-9)。
 *  - load():Store.get("commands", "commandN") || I18n.current.commandsMenu.commandN
 *    (原实现按 command1..command9、command0 顺序加载,顺序无行为影响)。
 *  - addEvents():#commands 面板挂 perfectScrollbar;#commandN 输入框 blur 时
 *    读取当前值写回 Store。原循环为 while(n--),覆盖 command9..command0。
 *  - setDomValues():把存储值回填到各输入框。
 *  - refresh():重新 load + setDomValues(语言切换后召回默认文案)。
 *  - 命令的发送与 %sector% 替换在 Recorder.command(n)(原 bi)中完成。
 */

export default class Commands {
  /**
   * @param {Object} systems
   * @param {import('../core/Store.js').default} systems.Store — 持久化(原 af)
   * @param {Object} systems.I18n — current.commandsMenu.commandN 默认文案(原 ah)
   * @param {Function} systems.$ — jQuery(原 a7/$)
   */
  constructor(systems) {
    this.store = systems.Store;
    this.i18n = systems.I18n;
    this.$ = systems.$;
  }

  init() {
    this.load();
    this.setDomValues();
    this.addEvents();
  }

  load() {
    for (let i = 1; i <= 9; i++) {
      const name = 'command' + i;
      this[name] = this.store.get('commands', name) || this.i18n.current.commandsMenu[name];
    }
    this.command0 = this.store.get('commands', 'command0') || this.i18n.current.commandsMenu.command0;
  }

  addEvents() {
    this.$('#commands').perfectScrollbar();
    // 原实现:let i = 10; while (i--) → 覆盖 command9..command0
    for (let i = 9; i >= 0; i--) {
      const name = 'command' + i;
      this.$('#' + name).blur(() => {
        this.setCommand(name, this.$('#' + name).val());
      });
    }
  }

  setCommand(name, value) {
    this[name] = value;
    this.store.set('commands', name, value);
  }

  setDomValues() {
    for (let i = 9; i >= 0; i--) {
      const name = 'command' + i;
      this.$('#' + name).val(this[name]);
    }
  }

  refresh() {
    this.load();
    this.setDomValues();
  }
}
