/**
 * NameRenderer — 昵称/质量文字渲染与缓存(原 `bK` 单例)。
 *
 * 行为:
 *  - nick(cell):昵称离屏 canvas 缓存。支持颜色模式 cell.nameColor:
 *    "rainbow"(每帧 hue=((time/20|0)*3)%360 的 hsl)、"rainbow-gradient"
 *    (7 色线性渐变)、任意 CSS 颜色;缓存键 = 文本 + "\0" + 颜色。
 *  - 按显示像素分成 8 级(level = min(px/40, 7)|0)分别缓存渲染结果。
 *  - mass(cell):按 cell.id 缓存的质量文字;cellMass !== "full" 且
 *    staticMass > 999 时显示 "k" 缩写(((m/100)|0)/10 + "k");
 *    字号变化带迟滞(<5 忽略;变化比例 > 0.8 忽略),每 500ms 才接受新数值。
 *  - cleaner():每帧回收超期缓存(彩虹名 60ms、其余 1000ms),canvas 进
 *    画布池复用(≤75 张;宽清 0)。
 *
 * 怪癖(均与原实现一致):
 *  - nickRenderCount / massRenderCount 只在 cleaner() 里清零、从不自增,
 *    "每帧最多渲染 2 张"的节流实际永不触发。
 *  - cleaner() 的 massCaches 循环中画布池满(≥50)时直接 return,
 *    跳过剩余缓存清理和两个计数器的清零。
 *  - 昵称含 "\u200B" 且后半为空串时,直接在其后拼接 "astr.io"(不替换)。
 */

/** 昵称缓存条目(原 `bM` 类):按 8 个像素级各存一张 canvas。 */
class NickCache {
  /** @param {number} time 当前时钟(原实现取 c5.time) */
  constructor(time) {
    this.lastUsedAt = time;
    this.level = [null, null, null, null, null, null, null, null];
  }
}

/** 质量缓存条目(原 `bL` 类):mass 赋值即置 needsRedraw;fontSize 带迟滞。 */
class MassCache {
  /** @param {number} time 当前时钟(原实现取 c5.time) */
  constructor(time) {
    this.lastUsedAt = time;
    this.lastUpdateAt = time;
    this.canvas = null;
    this.ctx = null;
    this._mass = 0;
    this._fontSize = 5;
    this.needsRedraw = true;
  }

  set mass(value) {
    this._mass = value;
    this.needsRedraw = true;
  }

  get mass() {
    return this._mass;
  }

  set fontSize(value) {
    if (value < 5 || (value | 0) === (this._fontSize | 0)) {
      return;
    }
    if (this._fontSize > value && value / this._fontSize > 0.8) {
      return;
    }
    if (value > this._fontSize && this._fontSize / value > 0.8) {
      return;
    }
    this._fontSize = value;
    this.needsRedraw = true;
  }

  get fontSize() {
    return this._fontSize;
  }
}

export default class NameRenderer {
  /**
   * @param {Object} systems
   * @param {Document} systems.document 文档对象(原 a8):创建测量/缓存 canvas
   * @param {Object} systems.settings 设置面板(原 bc = ui/SettingsPanel):
   *   teamTags / autoHideText / nickShadow / massShadow / cellMass
   * @param {Object} systems.theme 主题(原 bj):
   *   cellNickSize / cellMassSize / nickFont / massFont / nickColor / massColor /
   *   nickStrokeColor / massStrokeColor
   * @param {{ viewport: number }} systems.camera 相机(原 bJ)
   * @param {{ time: number }} systems.app 应用主循环(原 c5):当前帧时钟
   */
  constructor({ document, settings, theme, camera, app }) {
    this.document = document;
    this.settings = settings;
    this.theme = theme;
    this.camera = camera;
    this.app = app;
    this.nickCaches = new Map();
    this.massCaches = new Map();
    this.maxCacheLife = 1000;
    this.massUpdateInterval = 500;
    this.quality = 0.8;
    this.nickRenderCount = 0;
    this.maxNickRenderCount = 2;
    this.massRenderCount = 0;
    this.maxMassRenderCount = 2;
    this.nickShadowCtx = this.newShadowContext();
    this.massShadowCtx = this.newShadowContext();
    this.canvasPool = [];
  }

  /**
   * 取昵称离屏 canvas;不可见/节流时返回 false。
   * @param {{ nick: string, nameColor: ?string, radius: number }} cell
   * @returns {HTMLCanvasElement|false}
   */
  nick(cell) {
    let text = cell.nick || 'astr.io';
    if (text.includes('\u200B') && this.settings.teamTags === 'off') {
      text = text.split('\u200B')[1] || 'astr.io';
    } else if (text.includes('\u200B') && text.split('\u200B')[1] === '') {
      // 怪癖:零宽空格后为空时直接拼接,不替换
      text = text + 'astr.io';
    }
    const fontPx = cell.radius * this.camera.viewport * (this.theme.cellNickSize / 100) * 0.3;
    if (fontPx < 10 && this.settings.autoHideText === 'on') {
      return false;
    }
    let color = null;
    let gradient = false;
    if (cell.nameColor === 'rainbow') {
      const hue = ((this.app.time / 20 | 0) * 3) % 360;
      color = 'hsl(' + hue + ', 100%, 65%)';
    } else if (cell.nameColor === 'rainbow-gradient') {
      gradient = true;
      color = 'rainbow-gradient';
    } else if (cell.nameColor) {
      color = cell.nameColor;
    }
    const cacheKey = color ? text + '\0' + color : text;
    const cache = this.nickCaches.get(cacheKey) || this.newNickCache(cacheKey);
    cache.lastUsedAt = this.app.time;
    const level = Math.min(fontPx / 40, 7) | 0;
    const cached = cache.level[level];
    if (cached) {
      return cached;
    }
    // 怪癖:计数器从不自增,该节流条件实际永不成立
    if (this.nickRenderCount >= this.maxNickRenderCount) {
      return false;
    }
    const canvas = this.getNewCanvas();
    const ctx = canvas.getContext('2d');
    const renderPx = (level + 1) * 50 * this.quality;
    const strokeWidth = Math.max(3, Math.round(renderPx * 0.12));
    const RIGHT_PAD = 4;
    const metrics = this.nickShadowCtx.measureText(text);
    // 以 25px 基准测量,按渲染字号等比换算
    const width = metrics.width * renderPx / 25;
    const right = metrics.actualBoundingBoxRight != null ? metrics.actualBoundingBoxRight * renderPx / 25 : width;
    const overhang = Math.max(0, right - width);
    canvas.height = (renderPx + strokeWidth + 8) | 0;
    canvas.width = (width + overhang + strokeWidth + RIGHT_PAD) | 0;
    ctx.font = '700 ' + (renderPx | 0) + 'px ' + this.theme.nickFont;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const centerX = canvas.width >> 1;
    if (this.settings.nickShadow === 'normal') {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = this.theme.nickStrokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(text, centerX, canvas.height >> 1);
    } else if (this.settings.nickShadow === 'performance') {
      ctx.fillStyle = this.theme.nickStrokeColor;
      ctx.globalAlpha = 0.75;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
    if (gradient) {
      const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
      grad.addColorStop(0, '#ff0000');
      grad.addColorStop(0.17, '#ff8c00');
      grad.addColorStop(0.33, '#ffd700');
      grad.addColorStop(0.5, '#00c853');
      grad.addColorStop(0.67, '#00bfff');
      grad.addColorStop(0.83, '#8a2be2');
      grad.addColorStop(1, '#ff69b4');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = color || this.theme.nickColor;
    }
    ctx.fillText(text, centerX, canvas.height >> 1);
    cache.level[level] = canvas;
    return canvas;
  }

  /** @param {string} cacheKey */
  newNickCache(cacheKey) {
    const cache = new NickCache(this.app.time);
    this.nickCaches.set(cacheKey, cache);
    return cache;
  }

  /**
   * 测量昵称在指定字号下的宽度(25px 基准换算)。
   * @param {string} text
   * @param {number} fontPx
   */
  getNickWidth(text, fontPx) {
    const width = this.nickShadowCtx.measureText(text).width;
    return width * fontPx / 25;
  }

  /** 字体变更后调用:清空昵称缓存并更新测量上下文字体。 */
  setNickCtxFont() {
    this.nickCaches.clear();
    this.nickShadowCtx.font = '700 25px ' + this.theme.nickFont;
  }

  /**
   * 取质量离屏 canvas(按 cell.id 缓存);不可见时返回 false。
   * @param {{ id: number, radius: number, isVirus: boolean, staticMass: number }} cell
   * @returns {HTMLCanvasElement|false}
   */
  mass(cell) {
    const fontPx = cell.radius * this.camera.viewport * (this.theme.cellMassSize / 100) * 0.3;
    if (!cell.isVirus && fontPx < 10 && this.settings.autoHideText === 'on') {
      return false;
    }
    const cache = this.massCaches.get(cell.id) || this.newMassCache(cell.id);
    cache.lastUsedAt = this.app.time;
    const shortMode = this.settings.cellMass !== 'full';
    const massText = shortMode && cell.staticMass > 999
      ? ((cell.staticMass / 100 | 0) / 10) + 'k'
      : cell.staticMass;
    cache.fontSize = fontPx; // setter 带迟滞,变化太小不触发重绘
    const sinceUpdate = this.app.time - cache.lastUpdateAt;
    if (cache.needsRedraw || sinceUpdate > this.massUpdateInterval) {
      cache.mass = massText; // setter 顺带置 needsRedraw
    }
    if (!cache.canvas) {
      cache.canvas = this.getNewCanvas();
      cache.ctx = cache.canvas.getContext('2d');
    }
    if (cache.needsRedraw) {
      // 怪癖:计数器从不自增,该节流条件实际永不成立
      if (this.massRenderCount >= this.maxMassRenderCount) {
        return false;
      }
      cache.needsRedraw = false;
      const canvas = cache.canvas;
      const ctx = cache.ctx;
      const strokeWidth = Math.max(3, Math.round(cache.fontSize * 0.12));
      const padWidth = Math.max(2, Math.round(cache.fontSize * 0.05));
      const metrics = this.massShadowCtx.measureText(cache.mass);
      const width = metrics.width * cache.fontSize / 25;
      const right = metrics.actualBoundingBoxRight != null
        ? metrics.actualBoundingBoxRight * cache.fontSize / 25
        : width;
      const overhang = Math.max(0, right - width);
      canvas.height = (cache.fontSize + strokeWidth + padWidth * 2) | 0;
      canvas.width = (width + overhang + strokeWidth + padWidth) | 0;
      ctx.font = '700 ' + (cache.fontSize | 0) + 'px ' + this.theme.massFont;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      const centerX = canvas.width >> 1;
      if (this.settings.massShadow === 'normal') {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = this.theme.massStrokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.strokeText(cache.mass, centerX, canvas.height >> 1);
      } else if (this.settings.massShadow === 'performance') {
        ctx.fillStyle = this.theme.massStrokeColor;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = this.theme.massColor;
      ctx.fillText(cache.mass, centerX, canvas.height >> 1);
      cache.lastUpdateAt = this.app.time;
    }
    return cache.canvas;
  }

  /** @param {number} id */
  newMassCache(id) {
    const cache = new MassCache(this.app.time);
    this.massCaches.set(id, cache);
    return cache;
  }

  /**
   * 测量质量文字在指定字号下的宽度(25px 基准换算)。
   * @param {string} text
   * @param {number} fontPx
   */
  getMassWidth(text, fontPx) {
    const width = this.massShadowCtx.measureText(text).width;
    return width * fontPx / 25;
  }

  /** 字体变更后调用:清空质量缓存并更新测量上下文字体。 */
  setMassCtxFont() {
    this.massCaches.clear();
    this.massShadowCtx.font = '700 25px ' + this.theme.massFont;
  }

  /** @param {number} radius 世界半径 → 屏幕像素半径 */
  getScreenRadius(radius) {
    return radius * this.camera.viewport;
  }

  /** @param {{ radius: number }} cell */
  isSmall(cell) {
    return this.settings.autoHideText === 'on' && this.getScreenRadius(cell.radius) < 20;
  }

  getNewCanvas() {
    return this.canvasPool.shift() || this.document.createElement('canvas');
  }

  newShadowContext() {
    const canvas = this.document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '700 25px Geogrotesque Rg';
    return ctx;
  }

  /** 每帧调用:回收超期缓存、重置渲染计数。 */
  cleaner() {
    for (const [key, cache] of this.nickCaches) {
      // 彩虹名键含 "\0hsl",色相持续变化 → 更短的缓存寿命(60ms)
      const isRainbow = key.includes('\0hsl');
      const life = isRainbow ? 60 : this.maxCacheLife;
      if (this.app.time - cache.lastUsedAt < life) {
        continue;
      }
      this.nickCaches.delete(key);
      const levels = cache.level;
      for (let i = 0; i < levels.length; i++) {
        const canvas = levels[i];
        if (canvas) {
          this.addForRecycle(canvas);
        }
      }
    }
    for (const [id, cache] of this.massCaches) {
      if (this.app.time - cache.lastUsedAt < this.maxCacheLife) {
        continue;
      }
      this.massCaches.delete(id);
      // 怪癖:画布池满时直接 return,跳过剩余清理与下方计数器清零
      if (this.canvasPool.length >= 50) {
        return;
      }
      this.addForRecycle(cache.canvas);
    }
    this.nickRenderCount = 0;
    this.massRenderCount = 0;
  }

  /** @param {HTMLCanvasElement} canvas */
  addForRecycle(canvas) {
    if (!canvas || this.canvasPool.length >= 75) {
      return;
    }
    canvas.width = 0;
    this.canvasPool.push(canvas);
  }
}
