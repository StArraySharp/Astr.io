/**
 * KeyBindings — 热键绑定表与全局键盘分发(原 `bf`,UI 位于 #hotkeys)。
 *
 * 行为:
 *  - init() 从 Store "hotkeys" 桶读取全部绑定(默认值见 DEFAULT_BINDINGS),
 *    维护 pressedKeys 去重表,绑定 UI 事件。
 *  - keydown 捕获阶段监听 document:焦点在 input.key(绑定框)上时进入改键流程,
 *    否则进入全局按键分发 onKeyDown。
 *  - getKey():字母(A-Z,大写)/数字/命名键(ENTER/ESC/SPACE/SHIFT/CAPSLOCK/
 *    TAB/DEL/TILDE),支持 CTRL+/ALT+ 前缀(怪癖:加修饰键时仅允许字母/数字,
 *    如 CTRL+ENTER 无法绑定)。
 *  - 改键时 alreadyBinded() 按固定顺序解绑旧键;freeSpectateKey 例外,
 *    允许与其他键重复。
 *  - 每个绑定行的 .key 输入框旁自动注入 .key-clear 清除按钮。
 *  - 管理员附加键:数字 1-7 硬编码(不可自定义),映射到 Keyboard.key(...),
 *    映射表为 1→1、2→2、3→8、4→9、5→3、6→4、7→5(原样保留)。
 */

/** [属性名, Store 键, 默认键] — 属性名同时是 #hotkeys .row 的 name 属性。 */
const DEFAULT_BINDINGS = [
  ['record', 'P'],
  ['multiboxTab', 'TAB'],
  ['toggleMenuKey', 'ESC'],
  ['feedKey', 'W'],
  ['macroFeedKey', 'E'],
  ['splitKey', 'SPACE'],
  ['doubleSplitKey', 'R'],
  ['tripleSplitKey', 'H'],
  ['split16Key', 'G'],
  ['split64Key', 'T'],
  ['stopKey', 'S'],
  ['chatKey', 'ENTER'],
  ['toggleChatScope', 'TAB'],
  ['freeSpectateKey', 'Q'],
  ['toggleSplitRings', 'U'],
  ['toggleOpponentRings', 'I'],
  ['toggleNick', 'N'],
  ['toggleMass', 'M'],
  ['toggleTeamTags', 'Y'],
  ['toggleHud', 'L'],
  ['toggleLbColors', 'C'],
  ['toggleOwnNick', 'Z'],
  ['toggleOwnMass', 'X'],
  ['toggleBGsectors', 'B'],
  ['toggleFood', 'F'],
  ['toggleSkin', 'A'],
  ['toggleOwnSkin', 'V'],
  ['command0Key', '0'],
  ['command1Key', '1'],
  ['command2Key', '2'],
  ['command3Key', '3'],
  ['command4Key', '4'],
  ['command5Key', '5'],
  ['command6Key', '6'],
  ['command7Key', '7'],
  ['command8Key', '8'],
  ['command9Key', '9'],
  ['zoom1key', 'ALT+1'],
  ['zoom2key', 'ALT+2'],
  ['zoom3key', 'ALT+3'],
  ['zoom4key', 'ALT+4'],
  ['zoom5key', 'ALT+5'],
];

/**
 * alreadyBinded() 检查顺序(不含 freeSpectate)。
 * 原实现为同序 if/else 链,此处以等价数组循环表达。
 */
const BINDABLE_KEYS = [
  'toggleMenuKey', 'feedKey', 'macroFeedKey', 'splitKey', 'doubleSplitKey',
  'tripleSplitKey', 'split16Key', 'split64Key', 'record', 'stopKey', 'chatKey',
  'toggleChatScope', 'multiboxTab', 'toggleSplitRings', 'toggleOpponentRings',
  'toggleNick', 'toggleMass', 'toggleTeamTags', 'toggleHud', 'toggleLbColors',
  'toggleOwnNick', 'toggleOwnMass', 'toggleBGsectors', 'toggleFood',
  'toggleSkin', 'toggleOwnSkin', 'command0Key', 'command1Key', 'command2Key',
  'command3Key', 'command4Key', 'command5Key', 'command6Key', 'command7Key',
  'command8Key', 'command9Key', 'zoom1key', 'zoom2key', 'zoom3key',
  'zoom4key', 'zoom5key',
];

export default class KeyBindings {
  /**
   * @param {object} systems
   * @param {import('jquery')} systems.$ jQuery(原 a7)
   * @param {Document} systems.document 文档对象(原 a8;键盘监听与 getElementById)
   * @param {{ get(name: string, key: string): *, set(name: string, key: string, value: *): void }} systems.Store
   *   持久化(原 af)
   * @param {{ chat(): void, toggleChatScope(): void, record(): void, toggleSpectate(): void,
   *   macroFeed(down: boolean): void, feed(): void, split(): void, doubleSplit(): void,
   *   tripleSplit(): void, split16(): void, split64(): void, multiboxTab(): void,
   *   stopMovementToggle(): void, toggleSplitRings(): void, toggleOpponentRings(): void,
   *   toggleCellNick(): void, toggleCellMass(): void, toggleTeamTags(): void, toggleHud(): void,
   *   toggleLbColors(): void, toggleOwnNick(): void, toggleOwnMass(): void, toggleBGsectors(): void,
   *   toggleGameFood(): void, toggleSkin(): void, toggleOwnSkin(): void, command(n: number): void,
   *   setZoom(z: number): void }} systems.Recorder
   *   回放/动作路由器(原 bi;除录制外还承担全部游戏动作触发)
   * @param {{ isOpened: boolean, isFocused: boolean }} systems.ChatHud
   *   聊天 HUD(原 bv;聚焦时抑制快捷键)
   * @param {{ isOpened: boolean, target: string }} systems.HotkeysPanel
   *   热键面板(原 bd;热键页签打开时抑制快捷键)
   * @param {{ toggle(): void, isOpened: boolean }} systems.Menu
   *   主菜单(原 bB;ESC 切换,菜单打开时抑制其余快捷键)
   * @param {{ isAlive: boolean }} systems.MenuForm
   *   菜单表单(原 bF;存活状态决定哪些键生效)
   * @param {{ isAdmin: boolean }} systems.GameConnection
   *   游戏服连接(原 bX;管理员附加键)
   * @param {{ key(n: number): void }} systems.Keyboard
   *   键盘状态(原 bZ;管理员按键转发)
   */
  constructor(systems) {
    this.$ = systems.$;
    this.document = systems.document;
    this.store = systems.Store;
    this.recorder = systems.Recorder;
    this.chatHud = systems.ChatHud;
    this.hotkeysPanel = systems.HotkeysPanel;
    this.menu = systems.Menu;
    this.menuForm = systems.MenuForm;
    this.gameConnection = systems.GameConnection;
    this.keyboard = systems.Keyboard;
    this.pressedKeys = new Map();
  }

  init() {
    this.loadBindings();
    this.pressedKeys = new Map();
    this.setDomKeys();
    this.addEvents();
  }

  /** 从 Store 重读全部绑定并刷新 DOM(不重新绑事件);原实现的字段顺序与本表不一致但无读取依赖。 */
  reinitializateData() {
    this.loadBindings();
    this.pressedKeys.clear();
    this.setDomKeys();
  }

  loadBindings() {
    for (const [name, def] of DEFAULT_BINDINGS) {
      this[name] = this.store.get('hotkeys', name) || def;
    }
  }

  /** 把内存中的绑定写回各行的 .key 输入框。 */
  setDomKeys() {
    this.$('#hotkeys .row').each((index, row) => {
      const name = this.$(row).attr('name');
      const input = this.$(row).find('.key')[0];
      this.$(input).val(this[name]);
    });
  }

  addEvents() {
    this.$('#hotkeys').perfectScrollbar();
    // 捕获阶段监听:改键输入框优先于全局快捷键。
    this.document.addEventListener('keydown', event => {
      const target = event.target;
      if (target.tagName === 'INPUT' && target.classList.contains('key')) {
        event.preventDefault();
        const row = this.$(target).parent();
        this.setKey(row, event, target);
        return;
      }
      this.onKeyDown(event);
    }, true);
    this.document.addEventListener('keyup', event => this.onKeyUp(event));
    this.$('#hotkeys .row .key').each((index, input) => {
      let $clear = this.$(input).siblings('.key-clear');
      if (!$clear.length) {
        $clear = this.$('<span class="key-clear" title="Remove hotkey">&times;</span>');
        this.$(input).after($clear);
      }
      $clear.click(() => {
        const row = this.$(input).parent();
        this.clearKey(row, input);
      });
    });
  }

  /** 全局按键分发。 */
  onKeyDown(event) {
    // 怪癖:TAB 无条件 preventDefault(先于验证码遮罩判断,输入框内按 TAB 也被吞)。
    if (event.keyCode === 9) {
      event.preventDefault();
    }
    const challenge = this.document.getElementById('challenge-overlay');
    if (challenge && challenge.classList.contains('visible')) {
      return;
    }
    const key = this.getKey(event);
    if (!key || this.pressedKeys.has(key)) {
      return;
    }
    this.pressedKeys.set(key, true);
    if (key === this.chatKey) {
      return void this.recorder.chat();
    }
    if (key === this.toggleChatScope && this.chatHud.isOpened) {
      event.preventDefault();
      return void this.recorder.toggleChatScope();
    }
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      return;
    }
    if (this.hotkeysPanel.isOpened && this.hotkeysPanel.target === 'hotkeys') {
      return;
    }
    if (this.chatHud.isFocused) {
      return;
    }
    if (key === this.toggleMenuKey) {
      return void this.menu.toggle();
    }
    if (this.menu.isOpened) {
      return;
    }
    event.preventDefault();
    if (key === this.record) {
      return void this.recorder.record();
    }
    if (key === this.freeSpectateKey && !this.menuForm.isAlive) {
      return void this.recorder.toggleSpectate();
    }
    if (this.menuForm.isAlive) {
      if (key === this.macroFeedKey) {
        return void this.recorder.macroFeed(true);
      }
      if (key === this.feedKey) {
        return void this.recorder.feed();
      }
      if (key === this.splitKey) {
        return void this.recorder.split();
      }
      if (key === this.doubleSplitKey) {
        return void this.recorder.doubleSplit();
      }
      if (key === this.tripleSplitKey) {
        return void this.recorder.tripleSplit();
      }
      if (key === this.split16Key) {
        return void this.recorder.split16();
      }
      if (key === this.split64Key) {
        return void this.recorder.split64();
      }
      if (key === this.multiboxTab) {
        return void this.recorder.multiboxTab();
      }
      // 管理员附加键:数字 1-7 硬编码,映射 1→1、2→2、3→8、4→9、5→3、6→4、7→5。
      if (this.gameConnection.isAdmin && key === '1') {
        return void this.keyboard.key(1);
      }
      if (this.gameConnection.isAdmin && key === '2') {
        return void this.keyboard.key(2);
      }
      if (this.gameConnection.isAdmin && key === '3') {
        return void this.keyboard.key(8);
      }
      if (this.gameConnection.isAdmin && key === '4') {
        return void this.keyboard.key(9);
      }
      if (this.gameConnection.isAdmin && key === '5') {
        return void this.keyboard.key(3);
      }
      if (this.gameConnection.isAdmin && key === '6') {
        return void this.keyboard.key(4);
      }
      if (this.gameConnection.isAdmin && key === '7') {
        return void this.keyboard.key(5);
      }
    }
    if (key === this.stopKey) {
      return void this.recorder.stopMovementToggle();
    }
    if (key === this.toggleSplitRings) {
      return void this.recorder.toggleSplitRings();
    }
    if (key === this.toggleOpponentRings) {
      return void this.recorder.toggleOpponentRings();
    }
    if (key === this.toggleNick) {
      return void this.recorder.toggleCellNick();
    }
    if (key === this.toggleMass) {
      return void this.recorder.toggleCellMass();
    }
    if (key === this.toggleTeamTags) {
      return void this.recorder.toggleTeamTags();
    }
    if (key === this.toggleHud) {
      return void this.recorder.toggleHud();
    }
    if (key === this.toggleLbColors) {
      return void this.recorder.toggleLbColors();
    }
    if (key === this.toggleOwnNick) {
      return void this.recorder.toggleOwnNick();
    }
    if (key === this.toggleOwnMass) {
      return void this.recorder.toggleOwnMass();
    }
    if (key === this.toggleBGsectors) {
      return void this.recorder.toggleBGsectors();
    }
    if (key === this.toggleFood) {
      return void this.recorder.toggleGameFood();
    }
    if (key === this.toggleSkin) {
      return void this.recorder.toggleSkin();
    }
    if (key === this.toggleOwnSkin) {
      return void this.recorder.toggleOwnSkin();
    }
    if (key === this.command0Key) {
      return void this.recorder.command(0);
    }
    if (key === this.command1Key) {
      return void this.recorder.command(1);
    }
    if (key === this.command2Key) {
      return void this.recorder.command(2);
    }
    if (key === this.command3Key) {
      return void this.recorder.command(3);
    }
    if (key === this.command4Key) {
      return void this.recorder.command(4);
    }
    if (key === this.command5Key) {
      return void this.recorder.command(5);
    }
    if (key === this.command6Key) {
      return void this.recorder.command(6);
    }
    if (key === this.command7Key) {
      return void this.recorder.command(7);
    }
    if (key === this.command8Key) {
      return void this.recorder.command(8);
    }
    if (key === this.command9Key) {
      return void this.recorder.command(9);
    }
    if (key === this.zoom1key) {
      return void this.recorder.setZoom(0.5);
    }
    if (key === this.zoom2key) {
      return void this.recorder.setZoom(0.25);
    }
    if (key === this.zoom3key) {
      return void this.recorder.setZoom(0.125);
    }
    if (key === this.zoom4key) {
      return void this.recorder.setZoom(0.075);
    }
    if (key === this.zoom5key) {
      return void this.recorder.setZoom(0.05);
    }
  }

  onKeyUp(event) {
    const key = this.getKey(event);
    if (!key) {
      return;
    }
    this.pressedKeys.delete(key);
    if (key === this.macroFeedKey) {
      this.recorder.macroFeed(false);
      return;
    }
  }

  /**
   * 改键:row 为绑定行,event 为原始键盘事件,input 为 .key 输入框。
   * DEL 视为清除;freeSpectateKey 不参与重复键解绑(允许与其他键重复)。
   */
  setKey(row, event, input) {
    let key = this.getKey(event);
    const name = this.$(row).attr('name');
    if (key === false) {
      return;
    }
    if (name !== 'freeSpectateKey') {
      this.alreadyBinded(key);
    }
    if (key === 'DEL') {
      key = '';
    }
    this.$(input).val(key);
    this[name] = key;
    this.store.set('hotkeys', name, key);
  }

  /** 清除某行绑定。 */
  clearKey(row, input) {
    const name = this.$(row).attr('name');
    this.$(input).val('');
    this[name] = '';
    this.store.set('hotkeys', name, '');
  }

  /**
   * 若该键已绑定到其他行,按 BINDABLE_KEYS 顺序找到第一个匹配并解绑
   * (DOM + 内存 + Store;选择器属性值未加引号,原样保留)。
   */
  alreadyBinded(key) {
    for (const name of BINDABLE_KEYS) {
      if (key === this[name]) {
        this[name] = '';
        this.store.set('hotkeys', name, '');
        this.$('#hotkeys .row[name=' + name + '] input').val('');
        return;
      }
    }
  }

  /** 可绑定键判断:A-Z / 0-9 / ENTER / ESC / SPACE / SHIFT / CAPSLOCK / DEL / TILDE / TAB。 */
  isValidKey(event) {
    const code = event.keyCode || event.which;
    return code > 64 && code < 91 || code > 47 && code < 58 || code === 13 || code === 27 ||
      code === 32 || code === 16 || code === 20 || code === 46 || code === 192 || code === 9;
  }

  /**
   * 归一化键名:大写字母 / 数字 / 命名键,可带 CTRL+ / ALT+ 前缀。
   * 不可识别返回 false。
   */
  getKey(event) {
    if (!this.isValidKey(event)) {
      return false;
    }
    const code = event.keyCode || event.which;
    let modifier = false;
    let name = false;
    if (event.ctrlKey) {
      modifier = 'CTRL+';
    } else if (event.altKey) {
      modifier = 'ALT+';
    }
    if (code > 64 && code < 91) {
      name = String.fromCharCode(code);
    } else if (code > 47 && code < 58) {
      name = '' + (code - 48);
    } else if (!modifier) {
      // 怪癖:命名键仅在无修饰键时生成 —— CTRL+ENTER 之类无法绑定(返回 false)。
      switch (code) {
        case 13:
          name = 'ENTER';
          break;
        case 27:
          name = 'ESC';
          break;
        case 32:
          name = 'SPACE';
          break;
        case 16:
          name = 'SHIFT';
          break;
        case 20:
          name = 'CAPSLOCK';
          break;
        case 9:
          name = 'TAB';
          break;
        case 46:
          name = 'DEL';
          break;
        case 192:
          name = 'TILDE';
          break;
      }
    }
    if (!name) {
      return false;
    }
    if (modifier) {
      return modifier + name;
    }
    return name;
  }
}
