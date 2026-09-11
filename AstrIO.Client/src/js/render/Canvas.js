/**
 * Canvas — 主画布与渲染编排(原 `c4` 单例)。
 *
 * 行为:
 *  - init():#canvas 2D 上下文、pi2、背景图(Theme.backgroundURL)、皮肤下载缓存、
 *    指挥官点集合、RGB 队友集合、队伍指示箭头离屏图、皇冠 SVG 图;
 *    监听 window resize/focus/blur 与 document visibilitychange(后三者统一 300ms
 *    后读 document.hasFocus());画布尺寸 = innerWidth|0 × innerHeight|0(无 DPR 处理)。
 *  - run():每帧渲染入口,顺序:
 *    clearRect → save → vanillaGrid → scale/translate(相机)→ ColorUtil.update →
 *    Snowflakes.render → border → backgroundImage → Food.render → VirusRange.render →
 *    mouseTracker → splitRings → OpponentRings.render → cells(细胞主绘制)→
 *    commands(指挥官点)→ NameRenderer.cleaner → restore。
 *
 * 怪癖(均与原实现一致):
 *  - commands() 末尾 globalAlpha 可能 < 1,依赖 run() 末尾的 restore() 复位。
 *  - 细胞圆弧一律逆时针(anticlockwise=true),半径 +5(描边余量)。
 *  - 病毒内圈:(r+5)*(mass-100)/200,mass ≤ 101 时不绘制。
 *  - 昵称宽于 1.25×细胞直径时整体缩放到 1.25×(shrink = 1.25/宽径比)。
 *  - 原方法名 SplitRings 首字母大写,此处保持。
 */

const CROWN_SVG_DATA_URL = 'data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M4%208L6%2020H18L20%208M4%208L5.71624%209.37299C6.83218%2010.2657%207.39014%2010.7121%207.95256%2010.7814C8.4453%2010.8421%208.94299%2010.7173%209.34885%2010.4314C9.81211%2010.1051%2010.0936%209.4483%2010.6565%208.13476L12%205M4%208C4.55228%208%205%207.55228%205%207C5%206.44772%204.55228%206%204%206C3.44772%206%203%206.44772%203%207C3%207.55228%203.44772%208%204%208ZM20%208L18.2838%209.373C17.1678%2010.2657%2016.6099%2010.7121%2016.0474%2010.7814C15.5547%2010.8421%2015.057%2010.7173%2014.6511%2010.4314C14.1879%2010.1051%2013.9064%209.4483%2013.3435%208.13476L12%205M20%208C20.5523%208%2021%207.55228%2021%207C21%206.44772%2020.5523%206%2020%206C19.4477%206%2019%206.44772%2019%207C19%207.55228%2019.4477%208%2020%208ZM12%205C12.5523%205%2013%204.55228%2013%204C13%203.44772%2012.5523%203%2012%203C11.4477%203%2011%203.44772%2011%204C11%204.55228%2011.4477%205%2012%205Z%22%20stroke%3D%22%23FFD700%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E';

export default class Canvas {
  /**
   * @param {Object} systems
   * @param {Window} systems.window 全局 window(原 a6)
   * @param {Document} systems.document 文档对象(原 a8)
   * @param {Object} systems.settings 设置面板(原 bc = ui/SettingsPanel):
   *   backgroundImage / vanillaGrid / cellMass / cellNick / hideOwnNick / hideOwnMass /
   *   urlSkins / ownSkin / teamIndicator / activeTurnMarker / commander / cursorLine /
   *   splitRings
   * @param {Object} systems.theme 主题(原 bj):backgroundURL / borderWidth / borderColor /
   *   gridColor / gridWidth / skinBorder / indicatorSize / indicatorColor / cellBorderSize /
   *   cellTransparency / cellNickSize / cellMassSize / lightenCellColor / virusColor /
   *   virusBorderColor / virusBorderWidth / multiboxActive / multiboxInactive /
   *   commanderColor
   * @param {{ skin: string, skin2: string, tab: number }} systems.menuForm
   *   菜单表单(原 bF):自己的皮肤与当前多盒页签
   * @param {{ time: number }} systems.app 应用主循环(原 c5)
   * @param {{ sortedCells: Array, myCells: Map }} systems.world 世界状态(原 bD)
   * @param {{ x: number, y: number, viewport: number }} systems.camera 相机(原 bJ)
   * @param {{ left: number, top: number, edge: number, center: {x,y}, circle: number }}
   *   systems.worldBounds 地图边界(原 bI = render/Grid)
   * @param {{ x: number, y: number }} systems.mouse 鼠标(原 bg)
   * @param {{ startedReplay: boolean, replayHasMouse: boolean, replayMouseX: number,
   *   replayMouseY: number }} systems.player 回放系统(原 bH = replay/Player)
   * @param {{ update(): void, getColor(obj, k): string, color: string }} systems.colorUtil
   *   颜色工具(原 bT = util/color,待重写)
   * @param {{ render(): void }} systems.snowflakes 特效(原 bR = render/Snowflakes,待重写)
   * @param {{ render(): void }} systems.food 食物渲染(原 bN = render/Food)
   * @param {{ render(): void }} systems.virusRange 病毒范围圈(原 bP = render/VirusRange)
   * @param {{ render(): void }} systems.opponentRings 对手光环(原 bO = render/OpponentRings)
   * @param {{ nick(cell): *, mass(cell): *, cleaner(): void }} systems.nameRenderer
   *   名字渲染(原 bK = render/NameRenderer)
   */
  constructor({ window, document, settings, theme, menuForm, app, world, camera, worldBounds,
                mouse, player, colorUtil, snowflakes, food, virusRange, opponentRings, nameRenderer }) {
    this.window = window;
    this.document = document;
    this.settings = settings;
    this.theme = theme;
    this.menuForm = menuForm;
    this.app = app;
    this.world = world;
    this.camera = camera;
    this.worldBounds = worldBounds;
    this.mouse = mouse;
    this.player = player;
    this.colorUtil = colorUtil;
    this.snowflakes = snowflakes;
    this.food = food;
    this.virusRange = virusRange;
    this.opponentRings = opponentRings;
    this.nameRenderer = nameRenderer;
  }

  init() {
    this.canvas = this.document.getElementById('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.pi2 = Math.PI * 2;
    this.hasFocus = true;
    this.bg = new Image();
    // crossOrigin:背景图来自第三方 CDN(imgur 等),不带 CORS 画进 canvas
    // 会污染画布 → captureStream()/toDataURL 全部 SecurityError,视频导出报废。
    this.bg.crossOrigin = "anonymous";
    this.bg.src = this.theme.backgroundURL;
    this.downloadedSkins = new Map();
    this.commanderPoints = new Set();
    this.rgbTeammates = new Set();
    this.indicator = this.cacheIndicator();
    this.crownImage = new Image();
    this.crownImage.src = CROWN_SVG_DATA_URL;
    if (this.menuForm.skin) {
      this.downloadSkin(this.menuForm.skin);
    }
    if (this.menuForm.skin2) {
      this.downloadSkin(this.menuForm.skin2);
    }
    // 怪癖:focus 与 blur 共用同一 handler(延迟读 hasFocus)
    this.window.addEventListener('resize', () => this.setScreenSize());
    this.window.addEventListener('focus', () => this.setFocus());
    this.window.addEventListener('blur', () => this.setFocus());
    this.document.addEventListener('visibilitychange', () => this.setFocus());
    this.setScreenSize();
  }

  setFocus() {
    setTimeout(() => {
      this.hasFocus = this.document.hasFocus();
    }, 300);
  }

  setScreenSize() {
    this.canvas.width = this.window.innerWidth | 0;
    this.canvas.height = this.window.innerHeight | 0;
  }

  /** 每帧渲染入口(由 App.run 调用)。 */
  run() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.save();
    this.vanillaGrid();
    const tx = (this.canvas.width >> 1) / this.camera.viewport - this.camera.x;
    const ty = (this.canvas.height >> 1) / this.camera.viewport - this.camera.y;
    this.ctx.scale(this.camera.viewport, this.camera.viewport);
    this.ctx.translate(tx, ty);
    this.colorUtil.update();
    this.snowflakes.render();
    this.border();
    this.backgroundImage();
    this.food.render();
    this.virusRange.render();
    this.mouseTracker();
    this.SplitRings(); // 原方法名首字母大写(bundle 220983 行 this.SplitRings())
    this.opponentRings.render();
    this.cells();
    this.commands();
    this.nameRenderer.cleaner();
    this.ctx.restore();
  }

  backgroundImage() {
    if (this.settings.backgroundImage === 'off') {
      return;
    }
    if (!this.bg.complete || !this.bg.naturalWidth) {
      return;
    }
    const halfBorder = this.theme.borderWidth >> 1;
    const ctx = this.ctx;
    ctx.drawImage(this.bg, this.worldBounds.left - halfBorder, this.worldBounds.top - halfBorder,
      this.worldBounds.edge + this.theme.borderWidth, this.worldBounds.edge + this.theme.borderWidth);
  }

  /** 原版风格网格线(屏幕空间绘制,再进入相机变换)。 */
  vanillaGrid() {
    if (this.settings.vanillaGrid === 'off') {
      return;
    }
    const ctx = this.ctx;
    const viewport = this.camera.viewport;
    const width = this.canvas.width / viewport;
    const height = this.canvas.height / viewport;
    let gx = (-this.camera.x + width / 2) % 50;
    let gy = (-this.camera.y + height / 2) % 50;
    ctx.strokeStyle = this.theme.gridColor;
    ctx.lineWidth = Math.min(this.theme.gridWidth, 20) * viewport | 0;
    ctx.globalAlpha = 0.2 * viewport;
    ctx.beginPath();
    while (gx < width) {
      ctx.moveTo(gx * viewport, 0);
      ctx.lineTo(gx * viewport, height * viewport);
      gx += 50;
    }
    while (gy < height) {
      ctx.moveTo(0, gy * viewport);
      ctx.lineTo(width * viewport, gy * viewport);
      gy += 50;
    }
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** 地图边框:圆形地图画圆,方形地图画矩形。 */
  border() {
    const ctx = this.ctx;
    const halfBorder = this.theme.borderWidth >> 1;
    ctx.strokeStyle = this.theme.borderColor;
    ctx.lineWidth = this.theme.borderWidth;
    if (this.worldBounds.circle) {
      ctx.beginPath();
      ctx.arc(this.worldBounds.center.x, this.worldBounds.center.y,
        this.worldBounds.edge / 2 + halfBorder, 0, this.pi2, true);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeRect(this.worldBounds.left - halfBorder, this.worldBounds.top - halfBorder,
        this.worldBounds.edge + this.theme.borderWidth, this.worldBounds.edge + this.theme.borderWidth);
    }
  }

  /** 细胞主绘制(遍历 World.sortedCells)。 */
  cells() {
    const ctx = this.ctx;
    const showMass = this.settings.cellMass !== 'off';
    const showNick = this.settings.cellNick !== 'off';
    const hideOwnNick = this.settings.hideOwnNick === 'on';
    const hideOwnMass = this.settings.hideOwnMass === 'on';
    const urlSkins = this.settings.urlSkins === 'on';
    const ownSkin = this.settings.ownSkin === 'on';
    const skinScale = this.theme.skinBorder / 100;
    const teamIndicator = this.settings.teamIndicator === 'on';
    const indicatorSize = this.theme.indicatorSize;
    const cellBorderSize = this.theme.cellBorderSize;
    const cellAlpha = this.theme.cellTransparency / 100;
    const nickScale = this.theme.cellNickSize / 100;
    const massScale = this.theme.cellMassSize / 100;
    const lighten = this.theme.lightenCellColor / 100;
    const turnMarker = this.settings.activeTurnMarker === 'on';
    ctx.strokeStyle = this.theme.virusBorderColor;
    ctx.lineWidth = this.theme.virusBorderWidth;
    for (const cell of this.world.sortedCells) {
      cell.animate();
      const friendly = cell.isFriend || cell.isMine;
      const fade = cell.isRemoved ? Math.max(1 - cell.dt, 0.01) : 1;
      ctx.beginPath();
      ctx.arc(cell.x, cell.y, cell.radius + 5, 0, this.pi2, true);
      ctx.closePath();
      if (cell.isVirus) {
        ctx.fillStyle = this.theme.virusColor;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.stroke();
        // 病毒内圈:质量越大颜色圈越大
        const innerRadius = (cell.radius + 5) * (cell.mass - 100) / 200;
        if (innerRadius > 1) {
          ctx.beginPath();
          ctx.arc(cell.x, cell.y, innerRadius, 0, this.pi2, true);
          ctx.closePath();
          ctx.fillStyle = this.theme.virusBorderColor;
          ctx.globalAlpha = fade;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      } else {
        const fill = lighten < 1 ? this.colorUtil.getColor(cell.colorObject, lighten) : cell.colorHex;
        // RGB 队友:整个世界共用 colorUtil 当前色
        ctx.fillStyle = friendly && this.rgbTeammates.has(cell.worldID)
          ? this.colorUtil.color
          : fill;
        const ghostAlpha = cell.isGhost ? 0.45 : 1;
        if (cellAlpha * fade * ghostAlpha < 1) {
          ctx.globalAlpha = cellAlpha * fade * ghostAlpha;
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          ctx.fill();
        }
      }
      if (cell.isEjected || cell.isVirus) {
        continue;
      }
      // 幽灵细胞(喂食残影):虚线描边
      if (cell.isGhost) {
        const dash = Math.max(2, (cell.radius + 5) / 15) | 0;
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, cell.radius + 5 - (dash >> 1), 0, this.pi2, true);
        ctx.setLineDash([dash * 3, dash * 2]);
        ctx.lineWidth = dash;
        ctx.strokeStyle = 'rgba(220, 220, 220, 0.65)';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = this.theme.virusBorderColor;
        ctx.lineWidth = this.theme.virusBorderWidth;
      }
      // 当前页签自己的细胞:头顶队伍指示箭头
      if (teamIndicator && cell.isMine && cell.tab === this.menuForm.tab) {
        ctx.drawImage(this.indicator, cell.x - indicatorSize / 2,
          cell.y - cell.radius - 10 - indicatorSize, indicatorSize, indicatorSize);
      }
      const urlSkinImage = urlSkins ? this.getCustomSkin(cell) : false;
      const ownSkinImage = ownSkin ? this.getCustomSkin(cell) : false;
      const skinRadius = (cell.radius + 5) * skinScale;
      if (urlSkinImage && !cell.isMine) {
        ctx.drawImage(urlSkinImage, cell.x - skinRadius, cell.y - skinRadius,
          2 * skinRadius, 2 * skinRadius);
      }
      if (ownSkinImage && cell.isMine) {
        ctx.drawImage(ownSkinImage, cell.x - skinRadius, cell.y - skinRadius,
          2 * skinRadius, 2 * skinRadius);
      }
      // 多盒激活页签标记环(tab > 0 时)
      if (turnMarker && cell.isMine && cell.tab > 0) {
        const ringWidth = (cell.radius + 5) / (11 - cellBorderSize);
        ctx.beginPath();
        ctx.arc(cell.x, cell.y, cell.radius + 5 - (ringWidth >> 1), 0, this.pi2, true);
        ctx.lineWidth = ringWidth | 0;
        ctx.strokeStyle = cell.tab === this.menuForm.tab
          ? this.theme.multiboxActive
          : this.theme.multiboxInactive;
        ctx.stroke();
        ctx.strokeStyle = this.theme.virusBorderColor;
        ctx.lineWidth = this.theme.virusBorderWidth;
      }
      let nickHeight = 0;
      if (fade === 1 && (cell.isMine && !hideOwnNick || !cell.isMine && showNick)) {
        const nick = this.nameRenderer.nick(cell);
        if (nick && nick.width && nick.height) {
          const scale = cell.radius / 3 / nick.height * nickScale;
          // 宽于 1.25×细胞直径时整体缩到 1.25×
          const widthRatio = nick.width * scale / (cell.radius * 2);
          const shrink = widthRatio > 1.25 ? 1.25 / widthRatio : 1;
          const w = nick.width * scale * shrink;
          const h = nick.height * scale * shrink;
          nickHeight = h;
          ctx.drawImage(nick, cell.x - (w >> 1), cell.y - (h >> 1), w, h);
        }
      }
      if (fade === 1 && (cell.isMine && !hideOwnMass || !cell.isMine && showMass)) {
        const mass = this.nameRenderer.mass(cell);
        if (mass && mass.width && mass.height) {
          const scale = cell.radius / 3 / mass.height * massScale;
          const w = mass.width * scale;
          const h = mass.height * scale;
          // 有昵称时质量贴其下方,否则居中
          const y = nickHeight > 0 ? cell.y + nickHeight * 0.5 : cell.y - h * 0.5;
          ctx.drawImage(mass, cell.x - (w >> 1), y, w, h);
        }
      }
      // 皇冠玩家:头顶金色皇冠
      if (cell.isCrowned && this.crownImage.complete && this.crownImage.naturalWidth) {
        const size = (cell.radius + 5) * 0.55;
        ctx.drawImage(this.crownImage, cell.x - size / 2,
          cell.y - (cell.radius + 5) - size * 0.85, size, size);
      }
    }
  }

  /**
   * 取细胞皮肤(圆形裁剪后的离屏 canvas);未就绪时返回 false。
   * @param {{ isMine: boolean, tab: number, skin: string }} cell
   */
  getCustomSkin(cell) {
    const skin = cell.isMine
      ? (cell.tab === 2 ? this.menuForm.skin2 : this.menuForm.skin)
      : cell.skin;
    if (!skin) {
      return false;
    }
    const cached = this.downloadedSkins.get(skin);
    if (cached === undefined) {
      this.downloadSkin(skin);
      return false;
    }
    return cached;
  }

  /** @param {string} skin 皮肤图片 URL(占位 false,成功后替换为裁剪 canvas) */
  downloadSkin(skin) {
    this.downloadedSkins.set(skin, false);
    const image = new Image();
    // 同 bg:皮肤图必须 CORS 加载,否则污染画布毁掉视频导出。
    image.crossOrigin = "anonymous";
    image.onload = () => this.clipAndStore(skin, image);
    image.onerror = () => {
      this.downloadedSkins.delete(skin);
    };
    image.src = skin;
  }

  /**
   * 512×512 圆形裁剪;getContext 失败时退回原图。
   * @param {string} skin
   * @param {HTMLImageElement} image
   */
  clipAndStore(skin, image) {
    try {
      const canvas = this.document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 512;
      canvas.height = 512;
      ctx.beginPath();
      ctx.arc(256, 256, 256, 0, this.pi2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(image, 0, 0, 512, 512);
      this.downloadedSkins.set(skin, canvas);
    } catch (err) {
      this.downloadedSkins.set(skin, image);
    }
  }

  /** 指挥官点扩散波纹(1250ms 生命期)。 */
  commands() {
    const ctx = this.ctx;
    const MAX_AGE = 1250;
    const GROW_TIME = 1000;
    const FADE_START = GROW_TIME / 3 | 0;
    const FADE_SPAN = GROW_TIME - FADE_START;
    const hidden = this.settings.commander === 'off';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 5;
    for (const point of this.commanderPoints.values()) {
      const x = point.x;
      const y = point.y;
      const age = this.app.time - point.time;
      if (age > MAX_AGE) {
        this.commanderPoints.delete(point);
        continue;
      }
      if (hidden || age < 1) {
        continue;
      }
      const radius = GROW_TIME * age / MAX_AGE;
      // 怪癖:最后三分之一生命期淡出,globalAlpha 不复位(靠 restore 兜底)
      ctx.globalAlpha = radius > FADE_START ? (GROW_TIME - radius) / FADE_SPAN : 1;
      const inner = radius * 0.7;
      const gradient = ctx.createRadialGradient(x, y, inner, x, y, radius);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, this.theme.commanderColor);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, this.pi2, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** 我方细胞到鼠标的瞄准线。 */
  mouseTracker() {
    if (this.settings.cursorLine === 'off') {
      return;
    }
    const ctx = this.ctx;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let mx;
    let my;
    // 回放中使用录制的鼠标坐标(原实现有 typeof bH !== 'undefined' 守卫)
    if (this.player && this.player.startedReplay && this.player.replayHasMouse) {
      mx = this.player.replayMouseX;
      my = this.player.replayMouseY;
    } else {
      mx = (this.mouse.x - this.canvas.width / 2) / this.camera.viewport + this.camera.x;
      my = (this.mouse.y - this.canvas.height / 2) / this.camera.viewport + this.camera.y;
    }
    ctx.beginPath();
    for (const cell of this.world.myCells.values()) {
      if (cell.tab !== this.menuForm.tab) {
        continue;
      }
      ctx.moveTo(cell.x, cell.y);
      ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.stroke();
  }

  /** 分裂可达圈:r ≥ 60 的我方细胞画半径 800 的圈。 */
  SplitRings() {
    if (this.settings.splitRings === 'off') {
      return;
    }
    const ctx = this.ctx;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#656565';
    ctx.beginPath();
    this.world.myCells.forEach(cell => {
      if (cell.radius < 60) {
        return;
      }
      ctx.moveTo(cell.x + 800, cell.y);
      ctx.arc(cell.x, cell.y, 800, 0, this.pi2, true);
    });
    ctx.closePath();
    ctx.stroke();
  }

  /** 队伍指示箭头离屏图(Font Awesome \uF107,150px)。 */
  cacheIndicator() {
    const SIZE = 150;
    const canvas = this.document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 ' + SIZE + 'px Font Awesome\\ 5 Pro';
    ctx.fillStyle = this.theme.indicatorColor;
    ctx.fillText('\uF107', SIZE / 2, 75);
    return canvas;
  }
}
