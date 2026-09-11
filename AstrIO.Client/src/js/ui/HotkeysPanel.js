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
    // ★ 事件委托绑定在 #inputs 容器上(容器恒存在,不受内部节点替换影响)。
    // 旧版 this.$(element).click(...) 直接绑在页签元素上,若绑定时 this.$ 还是
    // 构造期占位代理(flushPlaceholders 之前),事件会绑到代理内部目标上而失效,
    // 导致 Commands/Touch 页签点不动。委托到容器后与节点替换/时序完全解耦。
    const activate = (element) => {
      const target = this.$(element).attr('target');
      if (target === '#close') {
        return; // 关闭按钮单独处理
      }
      this.$('#hotkeys').removeClass('active');
      this.$('#commands').removeClass('active');
      this.$('#mouse').removeClass('active');
      this.$('#touch').removeClass('active');
      this.$('.inputs-tab').removeClass('active');
      // 各页签按钮的 target 与内容容器 id 一一对应(#hotkeys/#mouse/#commands/#touch)
      this.$(target).addClass('active');
      this.$(element).addClass('active');
      this.target = target.substring(1);
    };
    this.div.off('click', '.inputs-tab').on('click', '.inputs-tab', function () {
      activate(this);
    });
    this.div.on('click', '.inputs-tab.close', () => {
      this.close();
    });
  }
}
