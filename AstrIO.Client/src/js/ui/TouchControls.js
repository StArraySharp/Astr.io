/**
 * TouchControls — 移动端虚拟摇杆 + 自定义键位(原创扩展,原版无此模块)。
 *
 * 行为:
 *  - 摇杆(默认左下):触摸驱动,输出归一化向量 → Mouse.x/y(屏幕坐标),
 *    由 Mouse.send() 的 40ms 定时器自然转化为 60 号鼠标包 = 移动/瞄准。
 *  - 动作按钮:每个键绑定一个动作,与 Mouse.onMouseClick 完全同一分发通道。
 *    动作表 ACTIONS:feed=单喂 macroFeed=连喂 split=单分 doubleSplit=双分
 *    tripleSplit=三分 split16=16分 split64=64分 commander=指挥 tabSwitch=多盒切换
 *    stopMovement=停移 —— 标签/行为一一对应。
 *  - 键位编辑器:独立全屏窗口(TouchEditor,openEditor() 打开),
 *    拖动定位、滑条调大小、下拉改动作、±增删键位,所见即所得。
 *  - 布局持久化于 Store("touch"),支持导出/导入 JSON。
 */

export const ACTIONS = [
  { id: 'feed', label: 'FEED', desc: '单次喂食(吐一个孢子)' },
  { id: 'macroFeed', label: 'MACRO', desc: '持续喂食(按住连吐)' },
  { id: 'split', label: 'SPLIT', desc: '分裂(1→2)' },
  { id: 'doubleSplit', label: '×2', desc: '双连分(1→4)' },
  { id: 'tripleSplit', label: '×3', desc: '三连分(1→8)' },
  { id: 'split16', label: '×16', desc: '16 分' },
  { id: 'split64', label: '×64', desc: '64 分(2^6 片)' },
  { id: 'commander', label: 'CMD', desc: '指挥标记(拖动瞄准,松手标记)' },
  { id: 'menu', label: 'ESC', desc: '显示/隐藏菜单' },
  { id: 'quickChat', label: 'MSG', desc: '快捷指令(单点输入,拖动发预设)' },
  { id: 'tabSwitch', label: 'TAB', desc: '多盒切换(tab1/tab2)' },
  { id: 'stopMovement', label: 'STOP', desc: '停止移动(S 键等价)' },
  { id: 'zoomIn', label: 'Z+', desc: '镜头拉近(视野缩小)' },
  { id: 'zoomOut', label: 'Z-', desc: '镜头拉远(视野放大)' },
  { id: 'saveReplay', label: 'REC', desc: '保存回放(存为 yyyymmdd_hhmmss.astr.io)' },
];

export const ACTION_MAP = Object.fromEntries(ACTIONS.map(a => [a.id, a]));

const DEFAULT_LAYOUT = () => ({
  enabled: false,
  editMode: false,
  stick: { x: 12, y: 72, size: 130 },
  buttons: [
    { id: 'b1', action: 'feed', label: 'FEED', x: 86, y: 72, size: 64 },
    { id: 'b2', action: 'split', label: 'SPLIT', x: 73, y: 84, size: 72 },
    { id: 'b3', action: 'doubleSplit', label: '×2', x: 60, y: 70, size: 60 },
    { id: 'b4', action: 'macroFeed', label: 'MACRO', x: 88, y: 50, size: 58 },
    { id: 'b5', action: 'split16', label: '×16', x: 74, y: 55, size: 60 },
    { id: 'b6', action: 'zoomIn', label: 'Z+', x: 50, y: 88, size: 52 },
    { id: 'b7', action: 'zoomOut', label: 'Z-', x: 38, y: 88, size: 52 },
    { id: 'b8', action: 'menu', label: 'ESC', x: 95, y: 8, size: 52 },
    { id: 'b9', action: 'saveReplay', label: 'REC', x: 12, y: 50, size: 52 },
  ],
});

export default class TouchControls {
  constructor(systems) {
    this.store = systems.Store;
    this.menu = systems.Menu;
    this.recorder = systems.Recorder;
    this.commands = systems.Commands;
    this.partySync = systems.PartySync;
    this.chatHud = systems.ChatHud;
    this.doc = systems.doc;
    this.view = systems.view;
    this.$ = systems.$;
    this.root = null;
    this.stickEl = null;
    this.nubEl = null;
    this.buttonEls = new Map();   // id -> element
    this.layout = null;
    this.editor = null;           // 独立编辑器窗口引用
    this.stickActive = false;
    this.stickCenterX = 0;
    this.stickCenterY = 0;
    this.moveX = 0;
    this.moveY = 0;
    this.systemsMouse = null;
    this.systemsSettingsPanel = null;   // zoomSpeed（镜头缩放步长）
    this.selId = null;          // 编辑器当前选中的键位 id
    this.cmdAiming = null;      // commander 拖动瞄准状态 {bid}
    this.cmdLineEl = null;      // commander 瞄准线元素
    this.quickMenu = null;      // quickChat 径向菜单 {bid,el,items,cx,cy}
    this._quickMenuTimer = null; // 径向菜单卡住看门狗定时器
    this._editorModule = null;
    this.systemsI18n = null;   // I18n 引用(编辑器运行时取词用)
  }

  init() {
    this.loadLayout();
    this.buildDom();
    this.applyLayout();
    this.bindEvents();
    if (this.layout.enabled) {
      this.enable();
    }
  }

  // ---------- 布局持久化 ----------

  loadLayout() {
    const saved = this.store.get('touch', 'layout');
    this.layout = saved && typeof saved === 'object' && Array.isArray(saved.buttons)
      ? saved
      : DEFAULT_LAYOUT();
    if (!this.layout.stick) this.layout.stick = { x: 12, y: 72, size: 130 };
    // 兼容修补:action 缺失时按 label 回推;非法 action 回落 feed;保证有唯一 id
    for (const b of this.layout.buttons) {
      if (!b.action) {
        const hit = ACTIONS.find(a => a.label === b.label);
        b.action = hit ? hit.id : 'feed';
      }
      if (!ACTION_MAP[b.action]) b.action = 'feed';
      if (!b.id) b.id = 'b' + Math.random().toString(36).slice(2, 8);
    }
    // ★ 首次访问（用户从未手动开关过）→ 按平台自动决定:
    //   移动端/触屏设备自动开启键位,桌面端自动禁用。
    //   手动 toggle 过一次后 autoEnabled 永久为 false,完全听用户的。
    if (typeof this.layout.autoEnabled !== 'boolean') {
      this.layout.autoEnabled = true;
      this.layout.enabled = TouchControls.isTouchDevice();
    }
  }

  /** 触屏设备检测:指针粗糙(手机/平板)或无悬停能力,或带 Touch 支持的 Android/iOS UA。 */
  static isTouchDevice() {
    if (typeof window === 'undefined') return false;
    const hasCoarse = window.matchMedia
      && window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia
      && window.matchMedia('(hover: none)').matches;
    const touchApi = 'ontouchstart' in window
      || (navigator.maxTouchPoints || 0) > 0;
    const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    return !!(hasCoarse || noHover || (touchApi && mobileUa));
  }

  saveLayout() {
    this.store.set('touch', 'layout', this.layout);
  }

  resetLayout() {
    // 保留 enabled/editMode:否则编辑器里重置后 editMode 变 false,
    // 按钮 pointerdown 走「触发动作」分支,拖动失效。
    const prevEnabled = this.layout.enabled;
    const prevEdit = this.layout.editMode;
    this.layout = DEFAULT_LAYOUT();
    this.layout.enabled = prevEnabled;
    this.layout.editMode = prevEdit;
    this.rebuildButtons();
    this.saveLayout();
    if (this.editor) this.editor.refresh();
  }

  exportLayout() {
    return JSON.stringify({ touch: this.layout });
  }

  importLayout(json) {
    try {
      const data = JSON.parse(json);
      const layout = data && data.touch ? data.touch : data;
      if (!layout || typeof layout !== 'object' || !layout.stick || !Array.isArray(layout.buttons)) {
        return 'invalid layout json';
      }
      this.layout = layout;
      this.loadLayout();
      this.rebuildButtons();
      this.saveLayout();
      if (this.editor) this.editor.refresh();
      return null;
    } catch (e) {
      return 'json parse error';
    }
  }

  // ---------- DOM 构建 ----------

  buildDom() {
    const doc = this.doc;
    this.root = doc.createElement('div');
    this.root.id = 'touch-controls';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:5;pointer-events:none;display:none;'
      + 'touch-action:none;-webkit-user-select:none;user-select:none;';
    doc.body.appendChild(this.root);

    this.stickEl = doc.createElement('div');
    this.stickEl.className = 'tc-stick';
    this.nubEl = doc.createElement('div');
    this.nubEl.className = 'tc-nub';
    this.stickEl.appendChild(this.nubEl);
    this.root.appendChild(this.stickEl);

    for (const cfg of this.layout.buttons) {
      this.addButtonEl(cfg);
    }

    if (!doc.getElementById('touch-controls-style')) {
      const st = doc.createElement('style');
      st.id = 'touch-controls-style';
      st.textContent = [
        '.tc-stick{position:absolute;border-radius:50%;background:rgba(30,33,46,.35);',
        '  border:2px solid rgba(166,191,245,.45);pointer-events:auto;}',
        '.tc-nub{position:absolute;border-radius:50%;background:rgba(76,108,173,.65);',
        '  box-shadow:0 0 12px rgba(76,108,173,.8);pointer-events:none;}',
        '.tc-btn{position:absolute;border-radius:50%;background:rgba(30,33,46,.45);',
        '  border:2px solid rgba(166,191,245,.45);color:#e0e5ec;display:flex;flex-direction:column;',
        '  align-items:center;justify-content:center;font-weight:600;overflow:hidden;',
        '  letter-spacing:1px;pointer-events:auto;-webkit-user-select:none;user-select:none;}',
        '.tc-btn small{font-size:9px;font-weight:300;opacity:.75;letter-spacing:0;}',
        '.tc-btn:active,.tc-btn.pressed{background:rgba(76,108,173,.75);}',
        '#touch-controls.edit .tc-stick,#touch-controls.edit .tc-btn{',
        '  border-style:dashed;opacity:.75;}',
        '.tc-resize{position:absolute;right:-4px;bottom:-4px;width:18px;height:18px;',
        '  background:#a6bff5;border-radius:3px;display:none;cursor:nwse-resize;}',
        '#touch-controls.edit .tc-resize{display:block;}',
        '.tc-cmdline{position:absolute;height:3px;transform-origin:0 50%;',
        '  background:linear-gradient(90deg,rgba(166,191,245,.95),rgba(255,255,255,.25));',
        '  pointer-events:none;border-radius:2px;box-shadow:0 0 8px rgba(166,191,245,.9);',
        '  display:none;z-index:8;}',
        '#touch-controls.edit .tc-btn.selected{outline:3px solid #4c6cad;opacity:1;}',
        '.tc-quickmenu{position:absolute;left:0;top:0;width:0;height:0;z-index:9;pointer-events:none;}',
        '.tc-quickchip{position:absolute;width:80px;height:36px;margin-left:-40px;margin-top:-18px;',
        '  background:rgba(30,33,46,.92);border:2px solid rgba(166,191,245,.45);border-radius:18px;',
        '  color:#e0e5ec;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;',
        '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.tc-quickchip.active{background:rgba(76,108,173,.92);border-color:#a6bff5;',
        '  box-shadow:0 0 12px rgba(166,191,245,.9);}',
        '.tc-quickdot{position:absolute;width:22px;height:22px;margin-left:-11px;margin-top:-11px;',
        '  border-radius:50%;background:#a6bff5;border:3px solid #fff;',
        '  box-shadow:0 0 16px rgba(166,191,245,.95);}',
      ].join('');
      doc.head.appendChild(st);
    }
  }

  addButtonEl(cfg) {
    if (this.buttonEls.has(cfg.id)) return;
    const el = this.doc.createElement('div');
    el.className = 'tc-btn';
    el.dataset.bid = cfg.id;
    this.renderBtnContent(el, cfg);
    const rz = this.doc.createElement('div');
    rz.className = 'tc-resize';
    el.appendChild(rz);
    this.root.appendChild(el);
    this.buttonEls.set(cfg.id, el);
  }

  /** 渲染按钮内容:主标签 + (尺寸够大时)动作提示。 */
  renderBtnContent(el, cfg) {
    const a = ACTION_MAP[cfg.action] || ACTIONS[0];
    // 只清文本节点,保留 .tc-resize 缩放手柄(innerHTML='' 会把手柄一起清掉)
    for (const child of Array.from(el.children)) {
      if (!child.classList.contains('tc-resize')) child.remove();
    }
    let main = el.querySelector('span[data-main]');
    if (!main) {
      main = this.doc.createElement('span');
      main.setAttribute('data-main', '1');
      el.insertBefore(main, el.firstChild);
    }
    main.textContent = cfg.label || a.label;
    let sub = el.querySelector('small[data-sub]');
    const wantSub = cfg.size >= 56 && a.label !== main.textContent;
    if (wantSub) {
      if (!sub) {
        sub = this.doc.createElement('small');
        sub.setAttribute('data-sub', '1');
        el.appendChild(sub);
      }
      sub.textContent = a.label;
    } else if (sub) {
      sub.remove();
    }
  }

  /** 删除全部按钮 DOM 并按 layout 重建(添加/删除键位后调用)。 */
  rebuildButtons() {
    for (const [, el] of this.buttonEls) el.remove();
    this.buttonEls.clear();
    for (const cfg of this.layout.buttons) this.addButtonEl(cfg);
    this.applyLayout();
    this.bindButtonEvents();
  }

  // ---------- 布局应用 ----------

  applyLayout() {
    const v = this.view;
    this.placeEl(this.stickEl, this.layout.stick, v);
    for (const cfg of this.layout.buttons) {
      this.addButtonEl(cfg);
      const el = this.buttonEls.get(cfg.id);
      this.renderBtnContent(el, cfg);
      this.placeEl(el, cfg, v);
      el.classList.toggle('selected', !!this.layout.editMode && cfg.id === this.selId);
    }
    this.root.classList.toggle('edit', !!this.layout.editMode);
  }

  /** 高亮当前选中的键位按钮(编辑器用)。 */
  highlightSelected(bid) {
    this.selId = bid;
    for (const [id, el] of this.buttonEls) {
      el.classList.toggle('selected', !!this.layout.editMode && id === bid);
    }
  }

  placeEl(el, cfg, view) {
    const px = Math.round(cfg.x / 100 * view.innerWidth);
    const py = Math.round(cfg.y / 100 * view.innerHeight);
    el.style.width = cfg.size + 'px';
    el.style.height = cfg.size + 'px';
    el.style.left = (px - cfg.size / 2) + 'px';
    el.style.top = (py - cfg.size / 2) + 'px';
    if (el === this.stickEl) {
      this.nubEl.style.width = Math.round(cfg.size * 0.42) + 'px';
      this.nubEl.style.height = Math.round(cfg.size * 0.42) + 'px';
      this.nubEl.style.left = Math.round(cfg.size * 0.29) + 'px';
      this.nubEl.style.top = Math.round(cfg.size * 0.29) + 'px';
    }
  }

  enable() {
    this.layout.enabled = true;
    this.layout.autoEnabled = false;   // ★ 手动开 → 之后不再自动切换
    this.root.style.display = 'block';
    this.saveLayout();
  }

  disable() {
    this.layout.enabled = false;
    this.layout.autoEnabled = false;   // ★ 手动关 → 之后不再自动切换
    this.root.style.display = 'none';
    this.stickActive = false;
    this.saveLayout();
  }

  setEditMode(on) {
    this.layout.editMode = !!on;
    this.root.classList.toggle('edit', this.layout.editMode);
    this.saveLayout();
  }

  // ---------- 键位编辑器(独立全屏窗口) ----------

  openEditor() {
    if (this.editor) return;
    const mod = this._editorModule;
    if (!mod || !mod.TouchEditor) return;
    this.editor = new mod.TouchEditor(this);
    this.editor.open();
  }

  closeEditor() {
    if (this.editor) {
      this.editor.close();
      this.editor = null;
    }
  }

  /** 注入编辑器模块(index.js 组合根调用,避免循环依赖)。 */
  attachEditorModule(mod) {
    this._editorModule = mod;
  }

  // ---------- 事件 ----------

  bindEvents() {
    this.bindStickEvents();
    this.bindButtonEvents();
    this.view.addEventListener('resize', () => this.applyLayout());
  }

  bindStickEvents() {
    const v = this.view;
    this.stickEl.addEventListener('pointerdown', ev => {
      if (this.layout.editMode && ev.target === this.stickEl) {
        this.dragEl = this.stickEl;
        const r = this.stickEl.getBoundingClientRect();
        this.dragOffX = ev.clientX - r.left;
        this.dragOffY = ev.clientY - r.top;
        this.stickEl.setPointerCapture(ev.pointerId);
        return;
      }
      ev.preventDefault();
      this.stickActive = true;
      const r = this.stickEl.getBoundingClientRect();
      this.stickCenterX = r.left + r.width / 2;
      this.stickCenterY = r.top + r.height / 2;
      this.stickEl.setPointerCapture(ev.pointerId);
      this.moveStick(ev);
    });
    this.stickEl.addEventListener('pointermove', ev => {
      if (this.dragEl === this.stickEl) return this.dragTo(ev);
      if (this.stickActive) this.moveStick(ev);
    });
    const endStick = () => {
      if (this.dragEl === this.stickEl) { this.dragEl = null; this.saveLayout(); return; }
      this.stickActive = false;
      this.moveX = 0;
      this.moveY = 0;
      this.placeEl(this.stickEl, this.layout.stick, v);
    };
    this.stickEl.addEventListener('pointerup', endStick);
    this.stickEl.addEventListener('pointercancel', endStick);

    const rzStick = this.stickEl.querySelector('.tc-resize');
    if (rzStick) {
      rzStick.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        this.resizeEl = this.stickEl;
        this.stickEl.setPointerCapture(ev.pointerId);
      });
      rzStick.addEventListener('pointermove', ev => {
        if (this.resizeEl === this.stickEl) this.resizeTo(ev);
      });
      rzStick.addEventListener('pointerup', () => { this.resizeEl = null; this.saveLayout(); });
    }
  }

  /** 摇杆拖动:更新 nub 位置并输出目标屏幕坐标(原实现缺失,导致摇杆无反应)。 */
  moveStick(ev) {
    const cfg = this.layout.stick;
    const r = this.stickEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = ev.clientX - cx;
    let dy = ev.clientY - cy;
    const max = r.width / 2;
    const dist = Math.hypot(dx, dy);   // 原始距离(截断前)
    if (dist > max) {
      dx = dx / dist * max;
      dy = dy / dist * max;
    }
    // nub 复位到中心 + 位移
    this.nubEl.style.left = Math.round(cfg.size * 0.29 + dx) + 'px';
    this.nubEl.style.top = Math.round(cfg.size * 0.29 + dy) + 'px';
    // ★ 目标屏幕坐标 = 「Mouse.send 的同一基准」+ 归一化摇杆向量 × 半对角线。
    //   两个坑：
    //   ① 老实现「摇杆中心 + 位移×5」：摇杆在左下角,往右拉到头目标点仍在屏心左侧
    //     → 世界坐标在玩家身后 → 导引线极短且永远够不到右半屏。
    //   ② 原点必须用 mouse.canvas.width/2 而非 view.innerWidth/2 ——
    //     APK WebView 里 canvas 快照尺寸与实时 innerWidth 会错位(黑边场景),
    //     双基准差值直接把目标点推到玩家身后甚至地图(0,0)角。
    //   拉满 = 指向屏幕边缘之外(约屏心到角距离),任意方向都能满幅表示。
    const m = this.systemsMouse;
    const baseW = m && m.canvas ? m.canvas.width : v.innerWidth;
    const baseH = m && m.canvas ? m.canvas.height : v.innerHeight;
    // ★ 归一化必须用「截断后的 dx/dy」除「截断后的长度(=min(rawDist,max))」——
    //   老代码 nx = dx/(dist||1) 在超半径时,dx 已被截成 dx/dist*max,
    //   再除以原 dist → 方向向量被缩小 max/dist 倍
    //   → 鼠标拖得越远(超出摇杆半径越多)导引线越短(×0.5、×0.25…)。
    const len = Math.min(dist, max) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const mag = Math.min(dist / max, 1);          // 0~1:拉满=1
    const reach = Math.hypot(baseW, baseH) / 2;   // 半对角线
    this.moveX = baseW / 2 + nx * reach * mag;
    this.moveY = baseH / 2 + ny * reach * mag;
  }

  /** 绑定所有按钮事件(rebuild 后也要重调;_tcBound 防重复)。 */
  bindButtonEvents() {
    for (const [, el] of this.buttonEls) {
      if (el._tcBound) continue;
      el._tcBound = true;
      const bid = el.dataset.bid;
      const cfgOf = () => this.layout.buttons.find(b => b.id === bid);

      el.addEventListener('pointerdown', ev => {
        if (ev.target.classList.contains('tc-resize')) return;
        ev.preventDefault();
        if (this.layout.editMode) {
          // 点按触控按钮 = 选中该键位(供顶部动作/大小控件编辑),拖动则移动位置
          if (this.editor) this.editor.selectButton(bid);
          else this.selId = bid;
          this.dragEl = el;
          const r = el.getBoundingClientRect();
          this.dragOffX = ev.clientX - r.left;
          this.dragOffY = ev.clientY - r.top;
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
          return;
        }
        const cfg = cfgOf();
        if (!cfg) return;
        if (cfg.action === 'menu') {
          this.menu.toggle();
          return;
        }
        if (cfg.action === 'commander') {
          // 按住拖动瞄准,松手在手指位置发指挥标记
          this.cmdAiming = { bid };
          el.classList.add('pressed');
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
          this.showCmdLine(el, ev.clientX, ev.clientY);
          return;
        }
        if (cfg.action === 'quickChat') {
          // 按住弹出指令径向菜单,拖动选择,松开发送;未选择则开聊天面板
          this.openQuickMenu(el);
          el.classList.add('pressed');
          try { el.setPointerCapture(ev.pointerId); } catch (e) {}
          return;
        }
        el.classList.add('pressed');
        this.fireAction(bid, true);
      });

      el.addEventListener('pointermove', ev => {
        if (this.layout.editMode && this.dragEl === el) return this.dragTo(ev);
        if (this.cmdAiming && this.cmdAiming.bid === bid) {
          this.showCmdLine(el, ev.clientX, ev.clientY);
          return;
        }
        if (this.quickMenu && this.quickMenu.bid === bid) {
          this.highlightQuickMenu(ev.clientX, ev.clientY);
        }
      });

      el.addEventListener('pointerup', ev => {
        el.classList.remove('pressed');
        if (!this.layout.editMode) {
          const cfg = cfgOf();
          if (this.cmdAiming && this.cmdAiming.bid === bid) {
            this.cmdAiming = null;
            this.hideCmdLine();
            this.fireCommanderAt(ev.clientX, ev.clientY);
            return;
          }
          if (this.quickMenu && this.quickMenu.bid === bid) {
            this.closeQuickMenu(ev.clientX, ev.clientY);
            return;
          }
          if (cfg && cfg.action === 'macroFeed') this.fireAction(bid, false);
        }
        if (this.dragEl === el) { this.dragEl = null; this.saveLayout(); }
      });

      const rz = el.querySelector('.tc-resize');
      rz.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation();
        this.resizeEl = el;
        try { el.setPointerCapture(ev.pointerId); } catch (e) {}
      });
      rz.addEventListener('pointermove', ev => {
        if (this.resizeEl === el) this.resizeTo(ev);
      });
      rz.addEventListener('pointerup', () => { this.resizeEl = null; this.saveLayout(); });
    }
  }

  dragTo(ev) {
    if (!this.dragEl) return;
    const cfg = this.dragEl === this.stickEl ? this.layout.stick
      : this.layout.buttons.find(b => b.id === this.dragEl.dataset.bid);
    if (!cfg) return;
    cfg.x = Math.round(ev.clientX - this.dragOffX + cfg.size / 2) / this.view.innerWidth * 100;
    cfg.y = Math.round(ev.clientY - this.dragOffY + cfg.size / 2) / this.view.innerHeight * 100;
    cfg.x = Math.max(2, Math.min(98, cfg.x));
    cfg.y = Math.max(2, Math.min(98, cfg.y));
    this.placeEl(this.dragEl, cfg, this.view);
  }

  resizeTo(ev) {
    const el = this.resizeEl;
    if (!el) return;
    const cfg = el === this.stickEl ? this.layout.stick
      : this.layout.buttons.find(b => b.id === el.dataset.bid);
    if (!cfg) return;
    const r = el.getBoundingClientRect();
    const d = Math.max(ev.clientX - r.left, ev.clientY - r.top);
    cfg.size = Math.round(Math.max(40, Math.min(260, cfg.size + d * 0.15)));
    this.placeEl(el, cfg, this.view);
    if (el !== this.stickEl) this.renderBtnContent(el, cfg);
  }

  /** 按键 id 分发动作(与 Mouse.onMouseClick 同一动作通道)。 */
  fireAction(bid, isDown) {
    if (this.menu.isOpened) return;
    const cfg = this.layout.buttons.find(b => b.id === bid);
    if (!cfg) return;
    const r = this.recorder;
    switch (cfg.action) {
      case 'feed': return void r.feed();
      case 'macroFeed': return void r.macroFeed(isDown);
      case 'split': return void r.split();
      case 'doubleSplit': return void r.doubleSplit();
      case 'tripleSplit': return void r.tripleSplit();
      case 'split16': return void r.split16();
      case 'split64': return void r.split64();
      case 'commander': return void this.partySync.commander();
      case 'tabSwitch': return void r.multiboxTab();
      case 'stopMovement': return void r.stopMovementToggle();
      case 'zoomIn': return void this.cameraZoom(+1);
      case 'zoomOut': return void this.cameraZoom(-1);
      case 'saveReplay': return void r.record();
    }
  }

  /**
   * 镜头缩放（与 Mouse.onMouseWheel 同一通道：改 spectatorTab.targetViewport）。
   * dir=+1 拉近(视野变小)，dir=-1 拉远(视野变大)。每按一次乘/除一步 zoomSpeed。
   */
  cameraZoom(dir) {
    const m = this.systemsMouse;
    if (!m || !m.spectatorTab) return;
    const step = (this.systemsSettingsPanel?.zoomSpeed || 92) / 100;
    let v = m.spectatorTab.targetViewport;
    v = dir > 0 ? v / step : v * step;
    m.spectatorTab.targetViewport = v > 2 ? 2 : v < 0.02 ? 0.02 : v;
  }

  /** commander:把手指位置换算成世界坐标并发送指挥标记(拖动瞄准松手执行)。 */
  fireCommanderAt(clientX, clientY) {
    const m = this.systemsMouse;
    if (!m || !m.canvas || !m.spectatorTab) {
      this.partySync.commander();
      return;
    }
    const wx = Math.min(65535, Math.max(0, (clientX - m.canvas.width / 2) / m.spectatorTab.viewport + m.spectatorTab.x));
    const wy = Math.min(65535, Math.max(0, (clientY - m.canvas.height / 2) / m.spectatorTab.viewport + m.spectatorTab.y));
    this.partySync.commander(wx | 0, wy | 0);
  }

  /** commander 瞄准线:从按钮中心指向手指。 */
  showCmdLine(btnEl, clientX, clientY) {
    const r = btnEl.getBoundingClientRect();
    const x1 = r.left + r.width / 2;
    const y1 = r.top + r.height / 2;
    const dx = clientX - x1;
    const dy = clientY - y1;
    const len = Math.hypot(dx, dy);
    if (!this.cmdLineEl) {
      this.cmdLineEl = this.doc.createElement('div');
      this.cmdLineEl.className = 'tc-cmdline';
      this.root.appendChild(this.cmdLineEl);
    }
    this.cmdLineEl.style.left = x1 + 'px';
    this.cmdLineEl.style.top = y1 + 'px';
    this.cmdLineEl.style.width = len + 'px';
    this.cmdLineEl.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
    this.cmdLineEl.style.display = 'block';
  }

  hideCmdLine() {
    if (this.cmdLineEl) this.cmdLineEl.style.display = 'none';
  }

  /** quickChat:按住弹出径向菜单(项 =「指令」面板的 command0-9 非空项),固定屏幕中心显示,
   *  手指相对按钮的位移映射到轮盘圆点(按住不动 = 圆点在中心)。 */
  openQuickMenu(btnEl) {
    const src = [];
    for (let i = 0; i <= 9 && src.length < 8; i++) {
      const text = this.commands ? this.commands['command' + i] : null;
      if (text && String(text).trim()) src.push({ index: i, text: String(text).trim() });
    }
    // 轮盘固定显示在屏幕中心,避免被边缘排行榜/菜单遮挡
    const cx = this.view.innerWidth / 2;
    const cy = this.view.innerHeight / 2;
    // 原点 = 按钮中心(手指位移的参照)
    const br = btnEl.getBoundingClientRect();
    const bx = br.left + br.width / 2;
    const by = br.top + br.height / 2;
    const menu = this.doc.createElement('div');
    menu.className = 'tc-quickmenu';
    this.root.appendChild(menu);
    const R = 110;
    const items = src.map((it, i) => {
      const angle = (i / src.length) * Math.PI * 2 - Math.PI / 2;
      const chip = this.doc.createElement('div');
      chip.className = 'tc-quickchip';
      chip.textContent = it.text;
      chip.style.left = (cx + Math.cos(angle) * R) + 'px';
      chip.style.top = (cy + Math.sin(angle) * R) + 'px';
      menu.appendChild(chip);
      return { index: it.index, text: it.text, chip };
    });
    // 屏幕中心圆点(手指操控指示器)
    const dot = this.doc.createElement('div');
    dot.className = 'tc-quickdot';
    dot.style.left = cx + 'px';
    dot.style.top = cy + 'px';
    menu.appendChild(dot);
    this.quickMenu = { bid: btnEl.dataset.bid, el: menu, items, cx, cy, R, bx, by, dot, lastActivity: Date.now() };
    // 卡住兜底:1 秒无活动自动关闭
    clearTimeout(this._quickMenuTimer);
    this._quickMenuTimer = setTimeout(() => this._quickMenuWatchdog(), 1000);
  }

  /** 手指位移(相对按钮)→ 轮盘圆点偏移,夹紧在半径内。 */
  _quickOffset(q, clientX, clientY) {
    let dx = clientX - q.bx;
    let dy = clientY - q.by;
    const dist = Math.hypot(dx, dy);
    if (dist > q.R) {
      dx = dx / dist * q.R;
      dy = dy / dist * q.R;
    }
    return { dx, dy };
  }

  /** 由手指位移(相对按钮)求选中的指令下标;位移死区内返回 -1(未选择)。 */
  _quickIndexAt(q, clientX, clientY) {
    if (!q.items.length) return -1;
    const dx = clientX - q.bx;
    const dy = clientY - q.by;
    const dist = Math.hypot(dx, dy);
    if (dist < 40) return -1;
    let ang = Math.atan2(dy, dx) + Math.PI / 2;
    if (ang < 0) ang += Math.PI * 2;
    return Math.floor(ang / (Math.PI * 2 / q.items.length)) % q.items.length;
  }

  highlightQuickMenu(clientX, clientY) {
    const q = this.quickMenu;
    if (!q) return;
    q.lastActivity = Date.now();
    // 手指位移映射到屏幕中心轮盘的圆点
    const { dx, dy } = this._quickOffset(q, clientX, clientY);
    if (q.dot) {
      q.dot.style.left = (q.cx + dx) + 'px';
      q.dot.style.top = (q.cy + dy) + 'px';
    }
    const idx = this._quickIndexAt(q, clientX, clientY);
    q.items.forEach((it, i) => it.chip.classList.toggle('active', i === idx));
  }

  closeQuickMenu(clientX, clientY) {
    const q = this.quickMenu;
    this.quickMenu = null;
    clearTimeout(this._quickMenuTimer);
    if (!q) return;
    const idx = this._quickIndexAt(q, clientX, clientY);
    if (q.el) q.el.remove();
    if (idx >= 0 && q.items[idx]) {
      // 走 Recorder.command:带 %sector% 占位符替换
      this.recorder.command(q.items[idx].index);
    } else {
      // 未选择 → 打开聊天面板
      if (this.chatHud) this.chatHud.enter();
    }
  }

  /** 轮盘卡住兜底:1 秒无活动则自动关闭(不发指令)。 */
  _quickMenuWatchdog() {
    const q = this.quickMenu;
    if (!q) return;
    if (Date.now() - q.lastActivity >= 1000) {
      this.quickMenu = null;
      if (q.el) q.el.remove();
    } else {
      this._quickMenuTimer = setTimeout(() => this._quickMenuWatchdog(), 1000);
    }
  }

  /** 每帧由 App 主循环调用:摇杆向量 → Mouse.x/y。 */
  update() {
    if (!this.layout || !this.layout.enabled || !this.stickActive) return;
    if (this.systemsMouse) {
      this.systemsMouse.x = this.moveX;
      this.systemsMouse.y = this.moveY;
    }
  }

  /** 注入 Mouse 引用(index.js 组合根调用,避免构造顺序问题)。 */
  attachMouse(mouse) {
    this.systemsMouse = mouse;
  }

  /** 注入 SettingsPanel 引用（镜头缩放步长 zoomSpeed）。 */
  attachSettingsPanel(sp) {
    this.systemsSettingsPanel = sp;
  }

  /** 注入 I18n 引用（编辑器运行时取词）。 */
  attachI18n(i18n) {
    this.systemsI18n = i18n;
  }

  /** 同步 #inputs 里旧面板控件(保留兼容)。 */
  syncPanel() {
    const $ = this.$;
    if (!$) return;
    $('#touch-enabled').prop('checked', !!this.layout.enabled);
    $('#touch-edit').prop('checked', !!this.layout.editMode);
  }
}
