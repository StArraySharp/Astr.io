/**
 * SpectatorTab — 观战镜头/视口状态机(原 `bJ` 单例)。
 *
 * 行为(与原实现对齐):
 *  - init():镜头坐标 (0,0),targetViewport 0.065,视口边界 ±960/±540,
 *    观战点 (32767, 32767),并引导 Targeting(bS.init)。
 *  - isSpectating setter:开启时显示 TargetingHud 并展示 #spectator-ad
 *    (首次向 window.adsbygoogle push 一次 AdSense 广告);关闭时隐藏。
 *  - freeSpectate setter:镜像到 _lastFreeSpectate,并切换 TargetingHud
 *    的 mouse/top 视口模式。
 *  - update():观战中先更新 Targeting,再 move() 平滑追踪 + updateView()。
 *  - move():帧时长按 16.667ms 归一(0.8/0.2 平滑,上限 2):
 *      存活 → 追踪玩家质心(距离²>9000000 时瞬移,否则按
 *      max(0.1,min(1,δ))/SettingsPanel.cameraSpeed 插值);
 *      观战 → 朝 spectatePoint 带惯性渐进(速度上限系数 0.2/0.3)。
 *  - updateView():viewport 向 target(×autoZoomViewport,若
 *    SettingsPanel.autoZoom==="on")按 1/8 缓动,随后用
 *    (canvas 尺寸/2)/viewport 计算 viewBounds 并夹紧到 Grid 边界。
 */

export default class SpectatorTab {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   window — 全局 window(原 a6,adsbygoogle)
   *   document — 文档对象(原 a8,#spectator-ad)
   *   MenuForm(ui/MenuForm,bF)— isAlive/x/y(镜头追踪目标)
   *   SettingsPanel(ui/SettingsPanel,bc)— cameraSpeed/autoZoom
   *   Canvas(render/Canvas,c4)— canvas.width/height
   *   Grid(render/Grid,bI)— left/right/top/bottom 世界边界
   *   TargetingHud(ui/TargetingHud,bA)— show/hide/mouseViewport/topViewport
   *   Targeting(game/Targeting,bS)— init/update
   */
  constructor(systems) {
    this.systems = systems;
  }

  init() {
    this.x = 0;
    this.y = 0;
    this.targetViewport = 0.065;
    this.autoZoomViewport = 1;
    this.viewport = this.targetViewport;
    this.viewBounds = { left: -960, right: 960, top: -540, bottom: 540 };
    this.spectatePoint = { x: 32767, y: 32767 };
    this.centerLock = false;
    this._isSpectating = false;
    this._freeSpectate = false;
    this._lastFreeSpectate = false;
    this.serverZoomOverride = false;
    this.serverZoomTime = 0;
    this.lastTime = performance.now();
    this.lastDelta = 1;
    this.velocityX = 0;
    this.velocityY = 0;
    this.systems.targeting.init();
  }

  get isSpectating() {
    return this._isSpectating;
  }

  get freeSpectate() {
    return this._freeSpectate;
  }

  set isSpectating(value) {
    const { document, window: view, targetingHud } = this.systems;
    this._isSpectating = value;
    if (value) {
      targetingHud.show();
      const adEl = document.getElementById('spectator-ad');
      if (adEl) {
        adEl.style.display = '';
        if (!adEl.dataset.loaded) {
          // 首次展示时向 AdSense 推送一次
          adEl.dataset.loaded = '1';
          (view.adsbygoogle = view.adsbygoogle || []).push({});
        }
      }
    } else {
      targetingHud.hide();
      const adEl = document.getElementById('spectator-ad');
      if (adEl) {
        adEl.style.display = 'none';
      }
    }
  }

  set freeSpectate(value) {
    const { targetingHud } = this.systems;
    this._freeSpectate = value;
    this._lastFreeSpectate = value;
    if (value) {
      targetingHud.mouseViewport();
    } else {
      targetingHud.topViewport();
    }
  }

  update() {
    if (this.isSpectating) {
      this.systems.targeting.update();
    }
    this.move();
    this.updateView();
  }

  move() {
    const { menuForm, settingsPanel } = this.systems;
    const now = performance.now();
    // 帧时长归一到 60fps,指数平滑(0.8 旧值 + 0.2 新值),上限 2 帧
    const normalizedDelta = (now - this.lastTime) / 16.667;
    this.lastDelta = this.lastDelta * 0.8 + normalizedDelta * 0.2;
    const delta = Math.min(this.lastDelta, 2);
    this.lastTime = now;
    if (menuForm.isAlive) {
      const deltaX = menuForm.x - this.x;
      const deltaY = menuForm.y - this.y;
      // 距离平方超过 9000000(≈3000 单位)直接瞬移
      if (deltaX * deltaX + deltaY * deltaY > 9000000) {
        this.x = menuForm.x;
        this.y = menuForm.y;
      } else {
        const lerp = Math.max(0.1, Math.min(1, delta)) / settingsPanel.cameraSpeed;
        this.x += deltaX * lerp;
        this.y += deltaY * lerp;
      }
    } else if (this.isSpectating) {
      const deltaX = this.spectatePoint.x - this.x;
      const deltaY = this.spectatePoint.y - this.y;
      const distance = Math.hypot(deltaX, deltaY);
      const distanceFactor = Math.min(1, distance / 1000);
      const baseSpeed = this._freeSpectate ? 0.3 : 0.2;
      const speed = baseSpeed * distanceFactor * delta;
      const stepX = deltaX * speed;
      const stepY = deltaY * speed;
      const ease = Math.min(1, delta * 0.15);
      this.velocityX += (stepX - this.velocityX) * ease;
      this.velocityY += (stepY - this.velocityY) * ease;
      const moveScale = Math.max(0.1, Math.min(0.4, distance / 2000));
      this.x += this.velocityX * moveScale;
      this.y += this.velocityY * moveScale;
    }
  }

  updateView() {
    const { settingsPanel, canvas, grid } = this.systems;
    let target = this.targetViewport;
    if (settingsPanel.autoZoom === 'on') {
      target *= this.autoZoomViewport;
    }
    this.viewport += (target - this.viewport) / 8;
    const halfWidth = canvas.canvas.width / 2 / this.viewport;
    const halfHeight = canvas.canvas.height / 2 / this.viewport;
    this.viewBounds.left = Math.max(-halfWidth + this.x, grid.left);
    this.viewBounds.right = Math.min(halfWidth + this.x, grid.right);
    this.viewBounds.top = Math.max(-halfHeight + this.y, grid.top);
    this.viewBounds.bottom = Math.min(halfHeight + this.y, grid.bottom);
  }
}
