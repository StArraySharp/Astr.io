/**
 * SettingsPanel — 设置面板(原 `bc`,容器 #settings)。
 *
 * 行为:
 *  - init() 从 Store 的 "settings" 桶读取约 36 项设置(字符串开关 on/off、
 *    数值 range),缺省时用内置默认值,随后 setDomValues() + addEvents()。
 *  - 控件两种:`type="options"`(b 选项组,左右箭头切换)与 `type="range"`
 *    (span 滑条:bar/fill/label + min/max/step/value 属性)。
 *  - handleOptions/handleRange 的 action 参数:0=上一个,1=下一个,
 *    2=从内存状态刷新 DOM,3=点击滑条定位(offsetX,按 step 取整吸附)。
 *  - saveSettings() 写内存 + Store;chat/language/hideHud 触发即时 UI 更新;
 *    teamTags/nickShadow/massShadow 清空 NameRenderer 缓存;任何修改都会把
 *    Theme 的预设重置为 "custom"。
 *  - 打开/关闭:fadeIn/fadeOut 250ms。
 */

export default class SettingsPanel {
  /**
   * @param {object} systems
   * @param {import('jquery')} systems.$ jQuery(原 a7)
   * @param {{ get(name: string, key: string): *, set(name: string, key: string, value: *): void }} systems.Store
   *   持久化(原 af)
   * @param {{ browser: string, change(): void }} systems.I18n 语言系统(原 ah,默认语言与重扫)
   * @param {{ refresh(): void }} systems.Commands 自定义命令(原 bh,语言切换后刷新)
   * @param {{ nickCaches: Map, massCaches: Map }} systems.NameRenderer
   *   名字/质量渲染缓存(原 bK,设置变更时清缓存)
   * @param {{ selectedPreset: string, setDomValues(): void }} systems.Theme
   *   主题系统(原 bj,设置变更时预设退回 custom)
   * @param {{ startedReplay: boolean }} systems.Player
   *   回放系统(原 bH,toggleHud 判断回放 HUD 可见性)
   */
  constructor(systems) {
    this.$ = systems.$;
    this.store = systems.Store;
    this.i18n = systems.I18n;
    this.commands = systems.Commands;
    this.nameRenderer = systems.NameRenderer;
    this.theme = systems.Theme;
    this.player = systems.Player;
    this.isOpened = false;
    this.div = null;
  }

  init() {
    this.isOpened = false;
    this.div = this.$('#settings');
    this.loadSettings();
    this.setDomValues();
    this.addEvents();
  }

  /** 从 Store 重新读取全部设置并刷新 DOM(原 init/reinitializateData 共用的读取块)。 */
  reinitializateData() {
    this.loadSettings();
    this.setDomValues();
  }

  /** 读取 "settings" 桶;~~ 表示数值项(布尔/缺省 false 取整为 0 后走默认值)。 */
  loadSettings() {
    this.language = this.store.get('settings', 'language') || this.i18n.browser;
    this.CellAnimation = ~~this.store.get('settings', 'CellAnimation') || 140;
    this.eatAnimation = this.store.get('settings', 'eatAnimation') || 'on';
    this.zoomSpeed = ~~this.store.get('settings', 'zoomSpeed') || 92;
    this.cameraSpeed = ~~this.store.get('settings', 'cameraSpeed') || 10;
    this.autoZoom = this.store.get('settings', 'autoZoom') || 'off';
    this.autoSwitch = this.store.get('settings', 'autoSwitch') || 'on';
    this.autoHideText = this.store.get('settings', 'autoHideText') || 'on';
    this.cellNick = this.store.get('settings', 'cellNick') || 'on';
    this.nickShadow = this.store.get('settings', 'nickShadow') || 'off';
    this.cellMass = this.store.get('settings', 'cellMass') || 'shortened';
    this.massShadow = this.store.get('settings', 'massShadow') || 'off';
    this.hideHud = this.store.get('settings', 'hideHud') || 'off';
    this.teamTags = this.store.get('settings', 'teamTags') || 'on';
    this.lbColors = this.store.get('settings', 'lbColors') || 'on';
    this.hideOwnNick = this.store.get('settings', 'hideOwnNick') || 'off';
    this.hideOwnMass = this.store.get('settings', 'hideOwnMass') || 'off';
    this.urlSkins = this.store.get('settings', 'urlSkins') || 'on';
    this.ownSkin = this.store.get('settings', 'ownSkin') || 'on';
    this.hsloSkins = this.store.get('settings', 'hsloSkins') || 'on';
    this.food = this.store.get('settings', 'food') || 'monoColored';
    this.bgSectors = this.store.get('settings', 'bgSectors') || 'off';
    this.vanillaGrid = this.store.get('settings', 'vanillaGrid') || 'off';
    this.backgroundImage = this.store.get('settings', 'backgroundImage') || 'on';
    this.activeTurnMarker = this.store.get('settings', 'activeTurnMarker') || 'on';
    this.cursorLine = this.store.get('settings', 'cursorLine') || 'off';
    this.teamIndicator = this.store.get('settings', 'teamIndicator') || 'on';
    this.opponentRings = this.store.get('settings', 'opponentRings') || 'off';
    this.splitRings = this.store.get('settings', 'splitRings') || 'off';
    this.virusRange = this.store.get('settings', 'virusRange') || 'off';
    this.commander = this.store.get('settings', 'commander') || 'on';
    this.sounds = this.store.get('settings', 'sounds') || 'off';
    this.targeting = this.store.get('settings', 'targeting') || 'on';
    this.chat = this.store.get('settings', 'chat') || 'on';
    this.instantReplay = this.store.get('settings', 'instantReplay') || 'on';
    this.replayDuration = ~~this.store.get('settings', 'replayDuration') || 30;
  }

  /** 按内存状态刷新所有 .settings-options 控件(action=2),再同步 HUD/聊天/语言。 */
  setDomValues() {
    this.$('.settings-options').each((index, element) => {
      const type = this.$(element).attr('type');
      if (type === 'range') {
        this.handleRange(element, 2);
      } else if (type === 'options') {
        this.handleOptions(element, 2);
      }
    });
    this.toggleHud();
    this.toggleChat();
    this.changeLanguage();
  }

  addEvents() {
    this.$('.settings-container').perfectScrollbar();
    this.$('.settings-container .fa-chevron-left').each((index, element) => {
      this.$(element).click(() => {
        const $option = this.$(element).parent();
        const type = this.$($option).attr('type');
        if (type === 'options') {
          this.handleOptions($option, 0);
        } else if (type === 'range') {
          this.handleRange($option, 0);
        }
      });
    });
    this.$('.settings-container span.outer').each((index, element) => {
      this.$(element).click(event => {
        const $option = this.$(element).parent();
        this.handleRange($option, 3, event.offsetX);
      });
    });
    this.$('.settings-container .fa-chevron-right').each((index, element) => {
      this.$(element).click(() => {
        const $option = this.$(element).parent();
        const type = this.$($option).attr('type');
        if (type === 'options') {
          this.handleOptions($option, 1);
        } else if (type === 'range') {
          this.handleRange($option, 1);
        }
      });
    });
    this.$('.settings-close').click(() => this.close());
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

  /**
   * 选项组(b 元素列表)切换。
   * @param {Element|import('jquery')} element 选项组容器(DOM 元素或 jQuery 对象,与原实现一致混用)
   * @param {number} action 0=上一项(环绕) 1=下一项(环绕) 2=按 this[name] 刷新
   */
  handleOptions(element, action) {
    const name = this.$(element).attr('name');
    const $options = this.$(element).find('b');
    const count = $options.length;
    let i = count;
    let activeIndex = 0;
    while (i--) {
      const option = $options[i];
      if (this.$(option).attr('class') === 'active') {
        activeIndex = i;
      }
    }
    if (action === 1) {
      const next = activeIndex + 1 < count ? activeIndex + 1 : 0;
      this.$($options[activeIndex]).removeAttr('class');
      this.$($options[next]).attr('class', 'active');
      const value = this.$($options[next]).attr('value');
      this.saveSettings(name, value);
    } else if (action === 0) {
      const prev = activeIndex > 0 ? activeIndex - 1 : count - 1;
      this.$($options[activeIndex]).removeAttr('class');
      this.$($options[prev]).attr('class', 'active');
      const value = this.$($options[prev]).attr('value');
      this.saveSettings(name, value);
    } else if (action === 2) {
      // 怪癖:先无条件清掉当前 active;若内存值不匹配任何选项,则所有选项都无 active。
      this.$($options[activeIndex]).removeAttr('class');
      let j = count;
      while (j--) {
        const option = $options[j];
        if (this.$(option).attr('value') === this[name]) {
          this.$(option).attr('class', 'active');
          break;
        }
      }
    }
  }

  /**
   * 滑条(range)控制。结构:span[0]=bar(min/max/step/value 属性)、
   * span[1]=fill(宽度百分比)、span[2]=label(数值文本)。
   * @param {Element|import('jquery')} element 行容器
   * @param {number} action 0=减一步 1=加一步 2=按 this[name] 刷新 3=点击定位
   * @param {number} [offsetX] action=3 时点击位置(px,滑条宽度按 100px 计)
   */
  handleRange(element, action, offsetX = 0) {
    const name = this.$(element).attr('name');
    const spans = this.$(element).find('span');
    const bar = spans[0];
    const fill = spans[1];
    const $label = this.$(spans[2]);
    const min = ~~this.$(bar).attr('min');
    const max = ~~this.$(bar).attr('max');
    const step = ~~this.$(bar).attr('step');
    const value = ~~this.$(bar).attr('value');
    if (action === 1 && value + step <= max) {
      const next = step + value;
      const percent = (next - min) * 100 / (max - min);
      this.$(bar).attr('value', next);
      this.$(fill).css('width', ~~percent + 'px');
      $label.text('' + next);
      this.saveSettings(name, ~~next);
    } else if (action === 0 && value - step >= min) {
      const prev = value - step;
      const percent = (prev - min) * 100 / (max - min);
      this.$(bar).attr('value', prev);
      this.$(fill).css('width', ~~percent + 'px');
      $label.text('' + prev);
      this.saveSettings(name, ~~prev);
    } else if (action === 2) {
      const current = this[name];
      const percent = (current - min) * 100 / (max - min);
      this.$(bar).attr('value', current);
      this.$(fill).css('width', ~~percent + 'px');
      $label.text('' + current);
    } else if (action === 3) {
      // 点击定位:offsetX 按 100px 满量程换算,截断取整后按 step 吸附(原实现用 |0)。
      let snapped = (offsetX / 100 * (max - min)) | 0;
      snapped = ((snapped / step) | 0) * step;
      snapped += min;
      const percent = ((snapped - min) * 100) / (max - min);
      this.$(bar).attr('value', snapped);
      this.$(fill).css('width', ~~percent + 'px');
      $label.text('' + snapped);
      this.saveSettings(name, ~~snapped);
    }
  }

  /** 写内存 + Store,并按设置项触发联动 UI。 */
  saveSettings(name, value) {
    this[name] = value;
    if (name === 'chat') {
      this.toggleChat();
    }
    if (name === 'language') {
      this.changeLanguage();
    }
    if (name === 'hideHud') {
      this.toggleHud();
    }
    if (name === 'teamTags') {
      this.nameRenderer.nickCaches.clear();
    }
    if (name === 'nickShadow') {
      this.nameRenderer.nickCaches.clear();
    }
    if (name === 'massShadow') {
      this.nameRenderer.massCaches.clear();
    }
    this.store.set('settings', name, value);
    if (this.theme.selectedPreset !== 'custom') {
      this.theme.selectedPreset = 'custom';
      this.store.set('theme', 'selectedPreset', 'custom');
      this.theme.setDomValues();
    }
  }

  changeLanguage() {
    this.i18n.change();
    this.commands.refresh();
  }

  toggleChat() {
    if (this.chat === 'on') {
      this.$('#chatroom').show();
    } else {
      this.$('#chatroom').hide();
    }
  }

  toggleHud() {
    // 原实现为 `typeof bH !== "undefined" && bH && bH.startedReplay`
    // (打包顺序导致的前置防护),此处等价保留注入对象判空。
    const inReplay = this.player && this.player.startedReplay;
    if (this.hideHud === 'off') {
      this.$('#team-leaderboard-hud').show();
      this.$('#teamlist-hud').show();
      this.$('#minimap-hud').show();
      this.$('#leaderboard-hud').show();
      this.$('#stats-hud').show();
      this.$('#targeting-hud').show();
      this.$('#time').show();
      if (inReplay) {
        this.$('#replay-hud').show();
      } else {
        this.$('#replay-hud').hide();
      }
    } else {
      this.$('#team-leaderboard-hud').hide();
      this.$('#teamlist-hud').hide();
      this.$('#minimap-hud').hide();
      this.$('#leaderboard-hud').hide();
      this.$('#stats-hud').hide();
      this.$('#targeting-hud').hide();
      this.$('#time').hide();
      this.$('#replay-hud').hide();
    }
  }
}
