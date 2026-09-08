/**
 * HotkeysPanel — 热键/命令输入面板(原 `bd`,容器 #inputs)。
 *
 * 行为:
 *  - 三个页签:#hotkeys(热键表)/ #mouse(鼠标)/ #commands(命令),
 *    由 .inputs-tab[target="#..."] 按钮切换,target 记录当前页签。
 *  - init() 绑定事件后依序初始化 Recorder(bi)、KeyBindings(bf)、Mouse(bg)、Commands(bh)。
 *  - 打开/关闭:fadeIn/fadeOut 250ms。
 */

export default class HotkeysPanel {
  /**
   * @param {object} systems
   * @param {import('jquery')} systems.$ jQuery(原 a7)
   * @param {{ init(): void }} systems.Recorder 回放录制器(原 bi)
   * @param {{ init(): void }} systems.KeyBindings 热键绑定表(原 bf)
   * @param {{ init(): void }} systems.Mouse 鼠标状态机(原 bg)
   * @param {{ init(): void }} systems.Commands 自定义命令(原 bh)
   */
  constructor(systems) {
    this.$ = systems.$;
    this.recorder = systems.Recorder;
    this.keyBindings = systems.KeyBindings;
    this.mouse = systems.Mouse;
    this.commands = systems.Commands;
    this.isOpened = false;
    this.target = null;
    this.div = null;
  }

  init() {
    this.isOpened = false;
    this.target = 'hotkeys';
    this.div = this.$('#inputs');
    this.addEvents();
    this.recorder.init();
    this.keyBindings.init();
    this.mouse.init();
    this.commands.init();
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

  addEvents() {
    this.$('.inputs-tab').each((index, element) => {
      this.$(element).click(() => {
        const target = this.$(element).attr('target');
        if (target === '#hotkeys') {
          this.$('#hotkeys').addClass('active');
          this.$('#commands').removeClass('active');
          this.$('#mouse').removeClass('active');
          this.$('.inputs-tab[target="#hotkeys"]').addClass('active');
          this.$('.inputs-tab[target="#mouse"]').removeClass('active');
          this.$('.inputs-tab[target="#commands"]').removeClass('active');
          this.target = 'hotkeys';
        } else if (target === '#mouse') {
          this.$('#mouse').addClass('active');
          this.$('#hotkeys').removeClass('active');
          this.$('#commands').removeClass('active');
          this.$('.inputs-tab[target="#hotkeys"]').removeClass('active');
          this.$('.inputs-tab[target="#commands"]').removeClass('active');
          this.$('.inputs-tab[target="#mouse"]').addClass('active');
          this.target = 'mouse';
        } else if (target === '#commands') {
          this.$('#commands').addClass('active');
          this.$('#hotkeys').removeClass('active');
          this.$('#mouse').removeClass('active');
          this.$('.inputs-tab[target="#commands"]').addClass('active');
          this.$('.inputs-tab[target="#hotkeys"]').removeClass('active');
          this.$('.inputs-tab[target="#mouse"]').removeClass('active');
          this.target = 'commands';
        }
      });
    });
    this.$('.inputs-tab.close').click(() => {
      this.close();
    });
  }
}
