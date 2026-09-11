/**
 * Mouse — 鼠标状态机 + 双分裂瞄准宏(原 `bg` 单例)。
 *
 * 行为(与原实现对齐):
 *  - 五个物理键(左/中/右/后退/前进)可绑定动作,持久化于 Store("mouse");
 *    默认 middleClick="commander",其余 "off"。
 *  - App 的 40ms 定时器调用 send()/sendAuto():屏幕坐标 → 世界坐标
 *    world = (screen − canvas 尺寸/2) / viewport + camera,夹紧 [0, 65535],
 *    经 Keyboard.mouse() 发送。
 *  - 观战且 Targeting 开启时,直接瞄准 Targeting.center(两轴 |0),不更新 lastCanvas*。
 *  - 普通 send() 会清掉 autoAimOverride(除非 keepOverride=true)。
 *  - movementPaused(停止移动):从玩家位置沿"冻结点"方向射线投射到地图边缘,
 *    以 frozen=true 发包(不更新 lastCanvas*)。
 *  - 双分裂宏(betterDoubleSplits):sendAuto() 在 override 有效期内
 *    (Date.now() <= expiresAt)持续发送锁定的瞄准点;
 *    setAutoAimOverride 默认 TTL 为 52ms(怪癖:实际调用方 Recorder.doubleSplit 传 1000ms)。
 *  - 滚轮:targetViewport 向下 *= zoomSpeed/100、向上 /=,夹紧 [0.02, 2]。
 *  - 观战 + SettingsPanel.targeting="on":左/右键 Targeting.lockTarget(slot 1/2)、
 *    中键 Targeting.reset();否则按绑定的动作分发(feed/macroFeed/split/doubleSplit/
 *    tripleSplit/split16/split64/commander/tabSwitch/stopMovement)。
 *  - 鼠标选项 UI:#mouse 面板内 .mouse-options 元素("options"=循环选项,
 *    "range"=步进滑条);#hotkeys .fa-chevron-left/right 点击循环;
 *    mode 0=上一个、1=下一个、2=同步到当前存储值(init 时)。
 *  - 怪癖:contextmenu 一律 preventDefault(菜单打开时也阻止);
 *    前进/后退键(which 4/5)mousedown/mouseup 一律 preventDefault;
 *    菜单(Menu.isOpened)打开时忽略 mousemove/mousedown/mouseup/wheel。
 */

export default class Mouse {
  /**
   * @param {Object} systems
   * @param {import('../core/Store.js').default} systems.Store — 持久化(原 af)
   * @param {Object} systems.SettingsPanel — zoomSpeed/targeting(原 bc)
   * @param {Object} systems.Menu — isOpened,菜单打开时忽略鼠标(原 bB)
   * @param {Object} systems.MenuForm — movementPaused/x/y/tab(原 bF)
   * @param {Object} systems.SpectatorTab — 摄像机 x/y/viewport/targetViewport/isSpectating(原 bJ)
   * @param {Object} systems.Keyboard — mouse() 发包通道(原 bZ)
   * @param {Object} systems.Targeting — center/isTurnedOn/lockTarget/reset(原 bS)
   * @param {Object} systems.Recorder — feed/split 等动作分发(原 bi)
   * @param {Object} systems.PartySync — commander()(原 c3)
   * @param {Document} systems.doc — 原 a8
   * @param {Window} systems.view — 原 a6
   * @param {Function} systems.$ — jQuery(原 a7/$)
   */
  constructor(systems) {
    this.store = systems.Store;
    this.settings = systems.SettingsPanel;
    this.menu = systems.Menu;
    this.menuForm = systems.MenuForm;
    this.spectatorTab = systems.SpectatorTab;
    this.keyboard = systems.Keyboard;
    this.targeting = systems.Targeting;
    this.recorder = systems.Recorder;
    this.partySync = systems.PartySync;
    this.doc = systems.doc;
    this.view = systems.view;
    this.$ = systems.$;
  }

  init() {
    this.leftClick = this.store.get('mouse', 'leftClick') || 'off';
    this.middleClick = this.store.get('mouse', 'middleClick') || 'commander';
    this.rightClick = this.store.get('mouse', 'rightClick') || 'off';
    this.backButton = this.store.get('mouse', 'backButton') || 'off';
    this.forwardButton = this.store.get('mouse', 'forwardButton') || 'off';
    this.x = 0;
    this.y = 0;
    this.canvas = this.doc.getElementById('canvas');
    this.canvasX = 0;
    this.canvasY = 0;
    this.lastCanvasX = 0;
    this.lastCanvasY = 0;
    this.holdUntil = 0;
    this.overrideX = 0;
    this.overrideY = 0;
    this.frozenCanvasX = 0;
    this.frozenCanvasY = 0;
    this.autoAimOverride = null;
    this.autoAimOverrideToken = 0;
    this.setDomValues();
    this.addEvents();
  }

  /**
   * 把当前鼠标位置作为 60 号鼠标包发出(40ms 定时器驱动)。
   * @param {number} tab 多盒页签(缺省由 Keyboard 回落到 MenuForm.tab)
   * @param {boolean} [keepOverride=false] true 时保留 autoAimOverride(sendAuto 用)
   */
  send(tab, keepOverride = false) {
    const overlay = this.doc.getElementById('challenge-overlay');
    if (overlay && overlay.classList.contains('visible')) {
      return;
    }
    this.canvasX = Math.min(65535, Math.max(0, (this.x - this.canvas.width / 2) / this.spectatorTab.viewport + this.spectatorTab.x));
    this.canvasY = Math.min(65535, Math.max(0, (this.y - this.canvas.height / 2) / this.spectatorTab.viewport + this.spectatorTab.y));
    if (this.spectatorTab.isSpectating && this.targeting.isTurnedOn) {
      this.keyboard.mouse(tab, this.targeting.center.x | 0, this.targeting.center.y | 0);
      return;
    }
    if (!keepOverride && this.autoAimOverride) {
      this.autoAimOverride = null;
    }
    if (this.menuForm.movementPaused) {
      const originX = this.menuForm.x || this.spectatorTab.x;
      const originY = this.menuForm.y || this.spectatorTab.y;
      const dx = this.frozenCanvasX - originX;
      const dy = this.frozenCanvasY - originY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      let t = 65535;
      if (ux > 0) {
        t = Math.min(t, (65535 - originX) / ux);
      } else if (ux < 0) {
        t = Math.min(t, -originX / ux);
      }
      if (uy > 0) {
        t = Math.min(t, (65535 - originY) / uy);
      } else if (uy < 0) {
        t = Math.min(t, -originY / uy);
      }
      this.keyboard.mouse(tab, (originX + ux * t) | 0, (originY + uy * t) | 0, true);
      return;
    }
    this.lastCanvasX = this.canvasX;
    this.lastCanvasY = this.canvasY;
    this.keyboard.mouse(tab, this.canvasX, this.canvasY, false);
  }

  /** 40ms 定时器入口(betterDoubleSplits):override 有效期内持续瞄准锁定点。 */
  sendAuto(tab) {
    const override = this.autoAimOverride;
    if (override) {
      if (Date.now() <= override.expiresAt) {
        this.sendAim(override.tab || tab || this.menuForm.tab, override.aim);
        return;
      }
      this.autoAimOverride = null;
    }
    this.send(tab, true);
  }

  /**
   * 安装自动瞄准覆盖(双分裂宏)。
   * @return {number|null} 令牌(clearAutoAimOverride 用),aim 无效时返回 null
   */
  setAutoAimOverride(tab, aim, ttl = 52) {
    if (!aim || aim.paused) {
      return null;
    }
    const token = ++this.autoAimOverrideToken;
    this.autoAimOverride = {
      token: token,
      tab: tab || this.menuForm.tab,
      aim: aim,
      expiresAt: Date.now() + ttl,
    };
    return token;
  }

  /** 清除覆盖;传入令牌时不匹配则忽略。 */
  clearAutoAimOverride(token) {
    if (!this.autoAimOverride) {
      return;
    }
    if (!token || this.autoAimOverride.token === token) {
      this.autoAimOverride = null;
    }
  }

  /** 发送指定瞄准点(aim.paused 时回落到普通 send)。 */
  sendAim(tab, aim) {
    if (!aim || aim.paused) {
      this.send(tab);
      return;
    }
    this.keyboard.mouse(tab, aim.x, aim.y, false);
  }

  /** 捕获双分裂瞄准点:鼠标世界点距离 <1 时投射到地图边缘。 */
  captureDoubleSplitAim() {
    if (this.menuForm.movementPaused) {
      return { paused: true };
    }
    const point = this.getMouseWorldPoint();
    const originX = this.menuForm.x || this.spectatorTab.x;
    const originY = this.menuForm.y || this.spectatorTab.y;
    const dx = point.x - originX;
    const dy = point.y - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= 1) {
      return { x: point.x | 0, y: point.y | 0, paused: false };
    }
    const projected = this.getProjectedAimPoint(originX, originY, point.x, point.y);
    return { x: projected.x, y: projected.y, paused: false };
  }

  /** 初始化时把存储值同步到 #mouse 面板控件(mode 2)。 */
  setDomValues() {
    this.$('.mouse-options').each((_, el) => {
      const type = this.$(el).attr('type');
      if (type === 'range') {
        this.handleRange(el, 2);
      } else if (type === 'options') {
        this.handleOptions(el, 2);
      }
    });
  }

  addEvents() {
    this.$('#mouse').perfectScrollbar();
    this.$('#hotkeys .fa-chevron-left').each((_, el) => {
      this.$(el).click(() => {
        const $parent = this.$(el).parent();
        const type = $parent.attr('type');
        if (type === 'options') {
          this.handleOptions($parent, 0);
        } else if (type === 'range') {
          this.handleRange($parent, 0);
        }
      });
    });
    this.$('#hotkeys .fa-chevron-right').each((_, el) => {
      this.$(el).click(() => {
        const $parent = this.$(el).parent();
        const type = $parent.attr('type');
        if (type === 'options') {
          this.handleOptions($parent, 1);
        } else if (type === 'range') {
          this.handleRange($parent, 1);
        }
      });
    });
    this.doc.addEventListener('mousemove', ev => {
      if (this.menu.isOpened) {
        return;
      }
      this.x = ev.clientX;
      this.y = ev.clientY;
    });
    this.doc.addEventListener('mousedown', ev => {
      if (ev.which === 4 || ev.which === 5) {
        ev.preventDefault();
      }
      if (this.menu.isOpened) {
        return;
      }
      this.onMouseClick(ev);
    });
    this.doc.addEventListener('mouseup', ev => {
      if (ev.which === 4 || ev.which === 5) {
        ev.preventDefault();
      }
      if (this.menu.isOpened) {
        return;
      }
      this.onMouseRelease(ev);
    });
    this.doc.addEventListener('wheel', ev => {
      if (this.menu.isOpened) {
        return;
      }
      this.onMouseWheel(ev);
    });
    this.doc.addEventListener('contextmenu', ev => {
      ev.preventDefault();
    });
  }

  onMouseWheel(ev) {
    let viewport = this.spectatorTab.targetViewport;
    if (ev.deltaY > 0) {
      viewport *= this.settings.zoomSpeed / 100;
    } else {
      viewport /= this.settings.zoomSpeed / 100;
    }
    viewport = viewport > 2 ? 2 : viewport < 0.02 ? 0.02 : viewport;
    this.spectatorTab.targetViewport = viewport;
  }

  onMouseClick(ev) {
    let button = false;
    switch (ev.which) {
      case 1:
        button = 'leftClick';
        break;
      case 2:
        button = 'middleClick';
        break;
      case 3:
        button = 'rightClick';
        break;
      case 4:
        button = 'backButton';
        break;
      case 5:
        button = 'forwardButton';
        break;
    }
    if (!button) {
      return;
    }
    const overlay = this.doc.getElementById('challenge-overlay');
    if (overlay && overlay.classList.contains('visible')) {
      return;
    }
    if (this.spectatorTab.isSpectating && this.settings.targeting === 'on') {
      const worldX = (ev.clientX - (this.view.innerWidth >> 1)) / this.spectatorTab.viewport + this.spectatorTab.x;
      const worldY = (ev.clientY - (this.view.innerHeight >> 1)) / this.spectatorTab.viewport + this.spectatorTab.y;
      if (button === 'leftClick') {
        this.targeting.lockTarget(worldX, worldY, 1);
      } else if (button === 'middleClick') {
        this.targeting.reset();
      } else if (button === 'rightClick') {
        this.targeting.lockTarget(worldX, worldY, 2);
      }
      return;
    }
    const action = this[button];
    if (action === 'off') {
      return;
    }
    if (action === 'feed') {
      return void this.recorder.feed();
    }
    if (action === 'macroFeed') {
      return void this.recorder.macroFeed(true);
    }
    if (action === 'split') {
      return void this.recorder.split();
    }
    if (action === 'doubleSplit') {
      return void this.recorder.doubleSplit();
    }
    if (action === 'tripleSplit') {
      return void this.recorder.tripleSplit();
    }
    if (action === 'split16') {
      return void this.recorder.split16();
    }
    if (action === 'split64') {
      return void this.recorder.split64();
    }
    if (action === 'commander') {
      return void this.partySync.commander();
    }
    if (action === 'tabSwitch') {
      return void this.recorder.multiboxTab();
    }
    if (action === 'stopMovement') {
      return void this.recorder.stopMovementToggle();
    }
  }

  onMouseRelease(ev) {
    let button = false;
    switch (ev.which) {
      case 1:
        button = 'leftClick';
        break;
      case 2:
        button = 'middleClick';
        break;
      case 3:
        button = 'rightClick';
        break;
      case 4:
        button = 'backButton';
        break;
      case 5:
        button = 'forwardButton';
        break;
    }
    if (!button) {
      return;
    }
    const action = this[button];
    if (action === 'macroFeed') {
      this.recorder.macroFeed(false);
      return;
    }
  }

  /**
   * options 型控件循环切换。mode:0=上一个、1=下一个、2=同步存储值。
   * "active" 判定为 attr("class") === "active";取值后 removeAttr("class")。
   * @param {Element|jQuery} el 控件容器
   */
  handleOptions(el, mode) {
    const name = this.$(el).attr('name');
    const $items = this.$(el).find('b');
    const count = $items.length;
    let current = 0;
    for (let i = count - 1; i >= 0; i--) {
      if (this.$($items[i]).attr('class') === 'active') {
        current = i;
      }
    }
    if (mode === 1) {
      const next = current + 1 < count ? current + 1 : 0;
      this.$($items[current]).removeAttr('class');
      this.$($items[next]).attr('class', 'active');
      const value = this.$($items[next]).attr('value');
      this.saveMouseOptions(name, value);
    } else if (mode === 0) {
      const prev = current > 0 ? current - 1 : count - 1;
      this.$($items[current]).removeAttr('class');
      this.$($items[prev]).attr('class', 'active');
      const value = this.$($items[prev]).attr('value');
      this.saveMouseOptions(name, value);
    } else if (mode === 2) {
      this.$($items[current]).removeAttr('class');
      for (let i = count - 1; i >= 0; i--) {
        if (this.$($items[i]).attr('value') === this[name]) {
          this.$($items[i]).attr('class', 'active');
          break;
        }
      }
    }
  }

  /**
   * range 型控件步进。mode:0=减 step、1=加 step、2=同步存储值。
   * 填充条宽度 pct = (value−min)·100/(max−min),取整后拼 "px"。
   */
  handleRange(el, mode) {
    const name = this.$(el).attr('name');
    const $spans = this.$(el).find('span');
    const track = $spans[0];
    const fill = $spans[1];
    const min = ~~this.$(track).attr('min');
    const max = ~~this.$(track).attr('max');
    const step = ~~this.$(track).attr('step');
    const value = ~~this.$(track).attr('value');
    if (mode === 1 && value + step <= max) {
      const next = step + value;
      const pct = (next - min) * 100 / (max - min);
      this.$(track).attr('value', next);
      this.$(fill).css('width', ~~pct + 'px');
      this.saveMouseOptions(name, next);
    } else if (mode === 0 && value - step >= min) {
      const prev = value - step;
      const pct = (prev - min) * 100 / (max - min);
      this.$(track).attr('value', prev);
      this.$(fill).css('width', ~~pct + 'px');
      this.saveMouseOptions(name, prev);
    } else if (mode === 2) {
      const stored = this[name];
      const pct = (stored - min) * 100 / (max - min);
      this.$(track).attr('value', stored);
      this.$(fill).css('width', ~~pct + 'px');
    }
  }

  /**
   * 沿 lastCanvas* 方向把目标点投到地图边缘并记住(holdUntil = now + duration)。
   * 怪癖:overrideX/Y 与 holdUntil 在本模块内未被消费,供外部(键绑定等)读取。
   */
  holdLast(duration = 250) {
    const originX = this.menuForm.x || this.spectatorTab.x;
    const originY = this.menuForm.y || this.spectatorTab.y;
    const dx = this.lastCanvasX - originX;
    const dy = this.lastCanvasY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this.overrideX = Math.min(65535, Math.max(0, (originX + dx / dist * 65535) | 0));
    this.overrideY = Math.min(65535, Math.max(0, (originY + dy / dist * 65535) | 0));
    this.holdUntil = Date.now() + duration;
  }

  /** 当前鼠标的世界坐标(各轴夹紧 [0, 65535])。 */
  getMouseWorldPoint() {
    const x = Math.min(65535, Math.max(0, (this.x - this.canvas.width / 2) / this.spectatorTab.viewport + this.spectatorTab.x));
    const y = Math.min(65535, Math.max(0, (this.y - this.canvas.height / 2) / this.spectatorTab.viewport + this.spectatorTab.y));
    return { x: x, y: y };
  }

  /**
   * 从 (originX, originY) 指向 (pointX, pointY) 的射线与地图边界 [0, 65535] 的交点。
   * 距离 <= 0.0001 时方向回落为 (1, 0);结果坐标 |0。
   */
  getProjectedAimPoint(originX, originY, pointX, pointY) {
    const dx = pointX - originX;
    const dy = pointY - originY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const EPSILON = 0.0001;
    const ux = dist > EPSILON ? dx / dist : 1;
    const uy = dist > EPSILON ? dy / dist : 0;
    let t = 65535;
    if (ux > 0) {
      t = Math.min(t, (65535 - originX) / ux);
    } else if (ux < 0) {
      t = Math.min(t, -originX / ux);
    }
    if (uy > 0) {
      t = Math.min(t, (65535 - originY) / uy);
    } else if (uy < 0) {
      t = Math.min(t, -originY / uy);
    }
    return {
      x: (originX + ux * t) | 0,
      y: (originY + uy * t) | 0,
    };
  }

  saveMouseOptions(name, value) {
    this[name] = value;
    this.store.set('mouse', name, value);
  }
}
