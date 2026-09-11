/**
 * ChatHud — 聊天输入 HUD(原 `bv` 单例)。
 *
 * 行为(与原实现对齐):
 *  - init():缓存 #message-hud / #message / #chat-scope / #chatroom,
 *    跟踪聚焦状态,#chat-scope 点击切换 Party(0)/Global(1) 频道,
 *    #chatroom 应用 perfectScrollbar(jQuery 插件,页面需已加载)。
 *  - enter():Enter 键入口(由键盘子系统调用)——
 *      未打开 → 显示容器并聚焦;
 *      已打开未聚焦 → 聚焦;
 *      已打开已聚焦 → 发送:>0 字截断到 100 字符后 PartySync.chat(1, msg, scope),
 *      清空输入、blur、隐藏容器。
 */

export default class ChatHud {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   $ — jQuery
   *   PartySync(net/PartySync,c3)— chat(channel, message, scope) 发送
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    const $ = this.systems.$;
    this.container = $('#message-hud');
    this.input = $('#message');
    this.scopeBtn = $('#chat-scope');
    this.isOpened = false;
    this.isFocused = false;
    this.scope = 0;
    this.input.blur(() => {
      this.isFocused = false;
    });
    this.input.focus(() => {
      this.isFocused = true;
    });
    this.scopeBtn.click(() => {
      this.toggleScope();
    });
    this.chatroom = $('#chatroom');
    this.chatroom.perfectScrollbar();
  }

  /** 切换 Party(0)/Global(1),同步按钮文案与样式类。 */
  toggleScope() {
    this.scope = this.scope === 0 ? 1 : 0;
    this.scopeBtn.text(this.scope === 0 ? 'Party' : 'Global');
    this.scopeBtn.toggleClass('chat-scope-global', this.scope === 1);
    this.scopeBtn.toggleClass('chat-scope-party', this.scope === 0);
  }

  enter() {
    if (this.isOpened) {
      if (this.isFocused) {
        let text = this.input.val();
        if (text.length > 0) {
          if (text.length > 100) {
            text = text.substring(0, 100);
          }
          this.systems.PartySync.chat(1, text, this.scope);
          this.input.val('');
        }
        this.input.blur();
        this.container.hide();
        this.isOpened = false;
      } else {
        this.input.focus();
      }
    } else {
      this.container.show();
      this.isOpened = true;
      this.input.focus();
    }
  }
}
