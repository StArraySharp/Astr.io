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
    this.gameConnection = systems.GameConnection; // 亚洲服务器地址同步(net/GameConnection)
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
    // 整体 UI 缩放（百分比，100 = 原始大小）
    this.uiScale = ~~this.store.get('settings', 'uiScale') || 100;
    this.instantReplay = this.store.get('settings', 'instantReplay') || 'on';
    this.replayDuration = ~~this.store.get('settings', 'replayDuration') || 30;
    this.asiaServer = this.store.get('settings', 'asiaServer') || '';
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
    this.applyUiScale();
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
        // ★ 排除来自两端箭头的冒泡：否则点箭头时 offsetX 是相对 <i> 的乱值，
        //   会再触发一次 action=3 点击定位，与 action=0/1 互相打架 → 值乱跳
        if (this.$(event.target).closest('i').length) return;
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
    // 亚洲服务器地址:回填 + 保存(同步 GameConnection.regionHosts.asia)
    const asiaInput = this.$('#asia-server');
    if (asiaInput && asiaInput.length) {
      asiaInput.val(this.asiaServer);
      const saveAsia = () => {
        let value = String(asiaInput.val() || '').trim();
        // 白名单同 GameConnection 服务器串:host 或 host:port
        if (value && !/^[a-zA-Z0-9.\-:]+$/.test(value)) {
          asiaInput.css('border-color', '#e74c3c');
          return;
        }
        asiaInput.css('border-color', '#33374d');
        this.asiaServer = value;
        this.store.set('settings', 'asiaServer', value);
        if (this.gameConnection && this.gameConnection.regionHosts) {
          this.gameConnection.regionHosts.asia = value || 'localhost';
        }
      };
      this.$('#asia-server-save').click(saveAsia);
      asiaInput.on('keydown', ev => {
        if (ev.key === 'Enter') saveAsia();
      });
      asiaInput.on('blur', saveAsia);
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
    let value = ~~this.$(bar).attr('value');
    // 值域合法性钳制（首次刷新时内存值可能不在 [min,max] 内）
    value = Math.min(max, Math.max(min, value));
    // fill 宽度 = 百分比 × 轨道实际宽度（CSS 里 .outer 宽 100px,历史实现直接把
    // 百分比数当 px 写 → 量程 80~150 时 100% 位置只有 10px,进度条与值完全对不上）
    const trackW = this.$(fill).parent().width() || 100;
    const apply = v => {
      const percent = (v - min) * 100 / (max - min);
      this.$(bar).attr('value', v);
      this.$(fill).css('width', (trackW * percent / 100) + 'px');
      $label.text('' + v);
    };
    if (action === 1 && value + step <= max) {
      apply(value + step);
      this.saveSettings(name, value + step);
    } else if (action === 0 && value - step >= min) {
      apply(value - step);
      this.saveSettings(name, value - step);
    } else if (action === 2) {
      const current = Math.min(max, Math.max(min, ~~this[name] || min));
      apply(current);
    } else if (action === 3) {
      // 点击定位:offsetX 按轨道实际宽度换算，再按 step 自 min 吸附。
      // (原实现按死 100px 满量程 + 先截断再吸附，step>1 时永远点不到 max)
      const ratio = Math.min(1, Math.max(0, offsetX / trackW));
      const snapped = Math.min(max, min + Math.round((max - min) * ratio / step) * step);
      apply(snapped);
      this.saveSettings(name, snapped);
    }
  }

  /** 写内存 + Store,并按设置项触发联动 UI。 */
  saveSettings(name, value) {
    this[name] = value;
    if (name === 'uiScale') {
      this.applyUiScale();
    }
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

  /**
   * 应用整体 UI 缩放：写 CSS 变量 --ui-scale。
   * ① 游戏 canvas 不缩放（zoom<1 会出黑边；zoom/transform 都会让
   *    Mouse.js 的 innerWidth/2 世界换算偏移 → 导引线不指鼠标）；
   * ② 各 HUD / 触控按钮是 position:fixed 锚在视口上 ——
   *    用 transform:scale 缩放（不改布局坐标系，元素仍贴原锚点）。
   *
   * transform-origin 用 getBoundingClientRect 判定：元素中心离哪条屏幕边近，
   * origin 就定在哪一角。**不能用 computedStyle 的 left/right 是否为 'auto' 判断** ——
   * 解析后的 computed 值永远是像素，那个判定恒为同一角 → 缩放后布局整体飞出屏幕。
   * 已有 translateX(-50%) 居中的元素（timer/targeting-hud）：translate 保留在前，
   * scale 追加在后（translateX 百分比基于元素自身宽度，与 scale 顺序无关）。
   */
  applyUiScale() {
    const scale = Math.min(1.5, Math.max(0.2, (~~this.uiScale || 100) / 100));
    document.documentElement.style.setProperty('--ui-scale', String(scale));

    const targets = [
      ...document.querySelectorAll('#huds > *'),
      ...document.querySelectorAll('#touch .tc-btn, #touch .tc-stick'),
    ];
    const vw = window.innerWidth, vh = window.innerHeight;
    // CSS 类里自带 translate 的居中元素（内联 transform 会覆盖类,必须手动拼回去）
    const CSS_TRANSLATE = new Map([
      ['timer-hud', 'translateX(-50%)'],
      ['targeting-hud', 'translateX(-50%)'],
    ]);
    for (const el of targets) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;   // display:none 等
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hor = cx > vw * 0.66 ? 'right' : cx < vw * 0.34 ? 'left' : 'center';
      const ver = cy > vh * 0.66 ? 'bottom' : cy < vh * 0.34 ? 'top' : 'center';
      el.style.transformOrigin = `${ver} ${hor}`;
      // ★ 内联 transform 完全由本函数接管（直接重写,丢弃历史残留 ——
      //   之前把 computed transform 追加在后面,matrix 里叠着旧 scale 越乘越大）;
      //   CSS 类里自带的 translate（居中）手动拼回。
      const pre = CSS_TRANSLATE.get(el.id) || '';
      el.style.transform = scale === 1 ? pre : `${pre} scale(${scale})`.trim();
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
