/**
 * TouchEditor — 键位自定义独立全屏窗口(原创扩展)。
 *
 * 打开时覆盖整个屏幕(半透明遮罩 + 画布实时预览),左边是控件操作面板:
 *   - 键位列表:每行 = 动作下拉(改绑定)+ 大小滑条(改直径)+ 删除按钮
 *   - 「添加键位」按钮:追加一个新键,默认 SPLIT,随机错开位置
 *   - 摇杆大小滑条
 *   - 完成 / 重置 / 导出 / 导入
 * 右侧(全屏区域)直接拖动控件定位、拖右下角缩放 —— 所见即所得。
 * 所有修改即时写回 TouchControls.layout 并持久化;「完成」关闭窗口。
 */

export class TouchEditor {
  /** @param {import('./TouchControls.js').default} tc */
  constructor(tc) {
    this.tc = tc;
    this.doc = tc.doc;
    this.view = tc.view;
    this.$ = tc.$;
    this.root = null;
    this._selId = null;
    this._collapsed = false;   // 面板展开状态
    this._ACTIONS = (tc._editorModule && tc._editorModule.ACTIONS) || [];
    // 运行时取词:systems.i18n 由 index.js 组合根注入;缺省时回退中文
    this._i18n = tc.systemsI18n || null;
  }

  /** 取词:走 I18n 语言包,包不可用时回退中文硬编码。 */
  t(key, fallback) {
    return this._i18n ? this._i18n.t('touchMenu', key, fallback) : fallback;
  }

  /** 取动作描述(ACTIONS.desc 的语言包版,回退内置中文)。 */
  actDesc(actionId, fallback) {
    return this.t('act_' + actionId, fallback);
  }

  open() {
    const doc = this.doc;
    this.root = doc.createElement('div');
    this.root.id = 'touch-editor';
    this.root.style.cssText = 'position:fixed;inset:0;z-index:9998;'
      + 'font-family:inherit;color:#e0e5ec;';

    // ---- 全屏画布背景(铺满视口;触控层保持 fixed 定位,坐标不被面板偏移) ----
    const stage = doc.createElement('div');
    stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;'
      + 'background:radial-gradient(ellipse at center,rgba(66,165,245,.12),rgba(10,12,18,.92));';
    this._stage = stage;

    // ---- 顶部操作面板(可收缩;展开时按逻辑分组,最大宽度限制不撑满宽屏) ----
    const panel = doc.createElement('div');
    panel.style.cssText = 'position:absolute;left:50%;top:0;transform:translateX(-50%);'
      + 'width:min(760px, 100%);box-sizing:border-box;'
      + 'background:rgba(30,33,46,.96);padding:8px 12px;'
      + 'border-radius:0 0 12px 12px;'
      + 'user-select:none;z-index:10;box-shadow:0 4px 24px rgba(0,0,0,.55);';
    // 通用按钮样式
    const btn = 'padding:6px 12px;border:0;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap;';
    panel.innerHTML = [
      /* 行 1:标题 + 展开/收起 + 主操作(完成/重置/删除) */
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">',
      '  <span style="font-size:14px;font-weight:700;letter-spacing:1px;flex-shrink:0;">', this.t('editorTitle', '触屏键位编辑器'), '</span>',
      '  <button data-act="toggle" style="' + btn + 'background:#33374d;color:#e0e5ec;">▲ ', this.t('collapse', '收起'), '</button>',
      '  <span style="flex:1 1 auto;"></span>',
      '  <button data-act="done" style="' + btn + 'background:#a6bff5;color:#1e212e;font-weight:700;">✓ ', this.t('done', '完成'), '</button>',
      '</div>',
      /* 行 2a:添加组(新增控件) */
      '<div data-group="add" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">',
      '  <span style="font-size:11px;color:#8590a6;min-width:32px;">', this.t('groupAdd', '添加'), '</span>',
      '  <select id="te-addtype" style="flex:1 1 150px;min-width:130px;background:#161d21;color:#e0e5ec;border:1px solid #33374d;border-radius:4px;padding:6px;font-size:12px;"></select>',
      '  <button data-act="add" style="' + btn + 'background:#4c6cad;color:#fff;font-weight:600;">', this.t('add', '+ 添加'), '</button>',
      '  <button data-act="addstick" style="' + btn + 'background:#2d4a75;color:#fff;">', this.t('resetStick', '重置摇杆'), '</button>',
      '</div>',
      /* 行 2b:编辑组(选中键位的属性) */
      '<div data-group="edit" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">',
      '  <span style="font-size:11px;color:#8590a6;min-width:32px;">', this.t('groupSelected', '选中'), '</span>',
      '  <select id="te-action" style="flex:1 1 170px;min-width:150px;background:#161d21;color:#e0e5ec;border:1px solid #33374d;border-radius:4px;padding:6px;font-size:12px;"></select>',
      '  <span style="font-size:11px;color:#8590a6;">', this.t('size', '大小'), '</span>',
      '  <input type="range" id="te-size" min="40" max="200" step="2" value="60" style="flex:1 1 110px;min-width:90px;">',
      '  <b id="te-sizeval" style="font-size:12px;min-width:28px;text-align:center;">60</b>',
      '  <button data-act="delete" style="' + btn + 'background:#e74c3c;color:#fff;">', this.t('delete', '删除'), '</button>',
      '</div>',
      /* 行 2c:摇杆组 + 导入导出 */
      '<div data-group="misc" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;">',
      '  <span style="font-size:11px;color:#8590a6;min-width:32px;">', this.t('groupStick', '摇杆'), '</span>',
      '  <button data-act="stickminus" style="width:26px;height:26px;background:#33374d;color:#e0e5ec;border:0;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;">−</button>',
      '  <b id="te-sticksize" style="font-size:12px;min-width:28px;text-align:center;"></b>',
      '  <button data-act="stickplus" style="width:26px;height:26px;background:#33374d;color:#e0e5ec;border:0;border-radius:4px;cursor:pointer;font-size:14px;line-height:1;">+</button>',
      '  <span style="flex:1 1 auto;"></span>',
      '  <button data-act="export" style="' + btn + 'background:#27ae60;color:#fff;">', this.t('export', '导出'), '</button>',
      '  <button data-act="import" style="' + btn + 'background:#e67e22;color:#fff;">', this.t('import', '导入'), '</button>',
      '  <button data-act="reset" style="' + btn + 'background:#e74c3c;color:#fff;">', this.t('reset', '重置'), '</button>',
      '</div>',
    ].join('');

    this._panel = panel;
    this.root.appendChild(stage);
    this.root.appendChild(panel);
    doc.body.appendChild(this.root);

    // 迁移触控层:保持 position:fixed 铺满视口,坐标系统与游戏模式一致
    this._tcRootParent = tc_root_parent(this.tc);
    stage.appendChild(this.tc.root);
    this.tc.root.style.display = 'block';
    this.tc.root.style.position = 'fixed';
    this.tc.root.style.zIndex = '9';
    this.tc.applyLayout();

    this.refresh(); // refresh 内统一绑定 panel 委托(带 _tcBound 防重复绑定)

    // 阻断触控层与游戏的交互(编辑器内只允许编辑)
    this.tc.setEditMode(true);
  }

  close() {
    // 触控层移回 body
    const tc = this.tc;
    if (tc.root && tc.root.parentElement === this._stage) {
      this.doc.body.appendChild(tc.root);
    }
    tc.root.style.position = 'fixed';
    tc.root.style.zIndex = '5';
    tc.root.style.display = tc.layout.enabled ? 'block' : 'none';
    tc.setEditMode(false);
    tc.saveLayout();
    if (this.root) this.root.remove();
    this.root = null;
  }

  refresh() {
    const tc = this.tc;
    // 选中项失效时回落第一个
    if (!tc.layout.buttons.some(b => b.id === this._selId)) {
      this._selId = tc.layout.buttons.length ? tc.layout.buttons[0].id : null;
    }

    // 摇杆大小
    const ss = this.root.querySelector('#te-sticksize');
    if (ss) ss.textContent = tc.layout.stick.size;

    // 共用大小滑条(反映当前选中键位)
    const sizeInput = this.root.querySelector('#te-size');
    const sizeVal = this.root.querySelector('#te-sizeval');
    if (sizeInput && sizeVal) {
      const cur = tc.layout.buttons.find(b => b.id === this._selId);
      sizeInput.value = cur ? cur.size : 60;
      sizeVal.textContent = cur ? cur.size : 60;
    }

    // 共用动作下拉(反映当前选中键位)
    const actionSel = this.root.querySelector('#te-action');
    if (actionSel) {
      if (!actionSel.options.length) {
        actionSel.innerHTML = (this._ACTIONS || []).map(a =>
          '<option value="' + a.id + '">' + a.label + ' — ' + this.actDesc(a.id, a.desc) + '</option>').join('');
      }
      const cur = tc.layout.buttons.find(b => b.id === this._selId);
      if (cur) actionSel.value = cur.action;
    }


    // 添加类型下拉:仅列出未使用的动作(已添加的自动隐藏)
    const addSel = this.root.querySelector('#te-addtype');
    if (addSel) {
      const used = new Set(tc.layout.buttons.map(b => b.action));
      const free = (this._ACTIONS || []).filter(a => !used.has(a.id));
      addSel.innerHTML = free.length
        ? free.map(a => '<option value="' + a.id + '">' + a.label + ' — ' + this.actDesc(a.id, a.desc) + '</option>').join('')
        : '<option value="">— ' + this.t('noActions', '无可用动作') + ' —</option>';
    }

    // 高亮当前选中的触控按钮(画布上直接点选)
    tc.highlightSelected(this._selId);

    // 面板级按钮(委托一次)
    const panel = this._panel;
    if (panel && !panel._tcBound) {
      panel._tcBound = true;
      panel.addEventListener('click', ev => this._onPanelClick(ev));
    }
    // 面板级 input(共用大小滑条 + 快捷指令文本)
    if (panel && !panel._tcInputBound) {
      panel._tcInputBound = true;
      panel.addEventListener('input', ev => {
        if (ev.target && ev.target.id === 'te-size') this._onSharedSize(ev);
      });
    }
    // 面板级 change(共用动作下拉)
    if (panel && !panel._tcChangeBound) {
      panel._tcChangeBound = true;
      panel.addEventListener('change', ev => {
        if (ev.target && ev.target.id === 'te-action') this._onSharedAction(ev);
      });
    }
  }

  /** 画布上点击触控按钮时选中(由 TouchControls 编辑模式调用)。 */
  selectButton(bid) {
    this._selId = bid;
    this.refresh();
  }

  _onPanelClick(ev) {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const tc = this.tc;
    const act = btn.getAttribute('data-act');
    if (act === 'toggle') {
      this._collapsed = !this._collapsed;
      this._applyCollapsed();
      return;
    }
    // 收起状态下:完成仍可用（它在常驻栏上）,其余编辑动作全部忽略
    if (this._collapsed && act !== 'done') return;
    if (act === 'add') {
      const sel = this.root.querySelector('#te-addtype');
      const actionId = sel && sel.value;
      if (!actionId) return;
      const a = (this._ACTIONS || []).find(x => x.id === actionId);
      const nb = {
        id: 'b' + Date.now().toString(36) + Math.floor(Math.random() * 99),
        action: actionId, label: a ? a.label : actionId.toUpperCase(),
        x: 40 + Math.random() * 25, y: 35 + Math.random() * 30, size: 60,
      };
      tc.layout.buttons.push(nb);
      this._selId = nb.id;
      tc.rebuildButtons(); tc.saveLayout(); this.refresh();
    } else if (act === 'stickminus') {
      tc.layout.stick.size = Math.max(60, tc.layout.stick.size - 10);
      tc.applyLayout(); tc.saveLayout(); this.refresh();
    } else if (act === 'stickplus') {
      tc.layout.stick.size = Math.min(260, tc.layout.stick.size + 10);
      tc.applyLayout(); tc.saveLayout(); this.refresh();
    } else if (act === 'addstick') {
      tc.layout.stick = { x: 12, y: 72, size: 130 };
      tc.applyLayout(); tc.saveLayout(); this.refresh();
    } else if (act === 'export') {
      const json = tc.exportLayout();
      try { navigator.clipboard.writeText(json); } catch (e) { /* 忽略 */ }
      btn.textContent = this.t('copied', '✓ 已复制');
      setTimeout(() => { if (btn.isConnected) btn.textContent = this.t('export', '导出'); }, 1200);
    } else if (act === 'import') {
      let json = null;
      try { json = prompt(this.t('pasteJson', '粘贴布局 JSON:')); } catch (e) { /* 忽略 */ }
      if (!json) return;
      const err = tc.importLayout(json);
      btn.textContent = err ? '✗ 无效' : '✓ 已导入';
      setTimeout(() => { if (btn.isConnected) btn.textContent = '导入'; }, 1200);
    } else if (act === 'delete') {
      if (this._selId) this._remove(this._selId);
    } else if (act === 'reset') {
      tc.resetLayout();
      this.refresh();
    } else if (act === 'done') {
      tc.closeEditor();
    }
  }

  _onField(ev) {
    const el = ev.target;
    const bid = el.getAttribute && el.getAttribute('data-bid');
    if (!bid) return;
    const tc = this.tc;
    const b = tc.layout.buttons.find(x => x.id === bid);
    if (!b) return;
    if (el.getAttribute('data-field') === 'action') {
      b.action = el.value;
      const a = (this._ACTIONS || []).find(x => x.id === b.action);
      b.label = a ? a.label : b.label;
    } else if (el.getAttribute('data-field') === 'size') {
      b.size = parseInt(el.value, 10) || 60;
    }
    tc.applyLayout();
    tc.saveLayout();
    this.refresh();
  }

  /** 共用大小滑条:改当前选中键位的直径。 */
  /** 收起/展开面板:收起时只留标题栏,给画布让出全部空间。 */
  _applyCollapsed() {
    if (!this._panel) return;
    const groups = this._panel.querySelectorAll('[data-group]');
    groups.forEach(g => { g.style.display = this._collapsed ? 'none' : 'flex'; });
    const t = this._panel.querySelector('[data-act="toggle"]');
    if (t) t.textContent = this._collapsed ? '▼ 展开' : '▲ 收起';
  }

  _onSharedSize(ev) {
    const tc = this.tc;
    const b = tc.layout.buttons.find(x => x.id === this._selId);
    if (!b) return;
    b.size = parseInt(ev.target.value, 10) || 60;
    tc.applyLayout();
    tc.saveLayout();
    const val = this.root.querySelector('#te-sizeval');
    if (val) val.textContent = b.size;
  }

  /** 共用动作下拉:改当前选中键位的绑定动作。 */
  _onSharedAction(ev) {
    const tc = this.tc;
    const b = tc.layout.buttons.find(x => x.id === this._selId);
    if (!b) return;
    b.action = ev.target.value;
    const a = (this._ACTIONS || []).find(x => x.id === b.action);
    b.label = a ? a.label : b.label;
    tc.applyLayout();
    tc.saveLayout();
    this.refresh(); // 卡片标签与「添加类型」的已用集合需重建
  }

  _remove(bid) {
    const tc = this.tc;
    tc.layout.buttons = tc.layout.buttons.filter(b => b.id !== bid);
    tc.rebuildButtons();
    tc.saveLayout();
    this.refresh();
  }

  _actionOptions(selected) {
    const acts = this._ACTIONS || [];
    return acts.map(a =>
      '<option value="' + a.id + '"' + (a.id === selected ? ' selected' : '') + '>' +
      a.label + ' — ' + this.actDesc(a.id, a.desc) + '</option>').join('');
  }

  _desc(actionId) {
    const a = (this._ACTIONS || []).find(x => x.id === actionId);
    return a ? a.desc : '';
  }

  /** 注入动作表(TouchControls 的 ACTIONS,index.js 组合根传入)。 */
  setActions(actions) {
    this._ACTIONS = actions;
  }
}

function tc_root_parent(tc) {
  return tc.root ? tc.root.parentElement : null;
}
