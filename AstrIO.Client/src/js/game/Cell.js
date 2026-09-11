/**
 * Cell — 细胞实体(原 `class bE`)。
 *
 * 行为:
 *  - 构造:(id, x, y, radius);位置同时初始化 current/new/old 三份,
 *    配合 updateTime/dt 供 animate() 插值。
 *  - mass = radius²/100|0;staticMass = newRadius²/100|0(下一帧目标质量)。
 *  - setColor(r,g,b):同时维护 colorObject{r,g,b} 与 colorHex =
 *    "#" + (0x1000000 + (r<<16) + (g<<8) + b).toString(16).slice(1)。
 *  - setRandomColor():怪癖——调色板 [255, 7, random|0] 以
 *    sort(() => 0.5 - Math.random()) 乱序(非均匀分布),恒含纯红/近黑绿
 *    通道各一(与 util/color 的 newTargetRGB 同款怪癖)。
 *  - animate():t = (App.time − updateTime) / SettingsPanel.CellAnimation
 *    (默认 140ms),夹取 [0,1];x/y/radius 从 old* 向 new* 线性插值,
 *    dt 记录本帧 t。
 *  - update(x,y,radius):先 animate() 落定当前位置,再把当前值存入 old*、
 *    接收新目标、刷新 updateTime。
 *  - worldID: nick + colorHex;isUnnamed: nick.length < 1。
 */

export default class Cell {
  /**
   * @param {number} id 服务器分配的细胞 ID
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {Object} systems
   * @param {Object} systems.App — time(每帧 Date.now(),原 c5)
   * @param {Object} systems.SettingsPanel — CellAnimation 动画时长 ms(原 bc)
   */
  constructor(id, x, y, radius, systems) {
    // 原版 bE 闭包引用全局 c5/bc;无显式 systems 时从全局注册表解引用。
    const sys = systems || globalThis.__astrioSystems;
    this.app = sys.App;
    this.settings = sys.SettingsPanel;
    this.id = id;
    this.ownerId = 0;
    this.colorObject = { r: 0, g: 0, b: 0 };
    this.colorHex = '#555';
    this.hasColor = false;
    this.skin = '';
    this.nick = '';
    this.isMine = false;
    this.isFood = false;
    this.isEjected = false;
    this.isVirus = false;
    this.isFriend = false;
    this.isRemoved = false;
    this.isGhost = false;
    this.isCrowned = false;
    this.nameColor = null;
    this.friendID = 0;
    this.tab = 0;
    this.newX = x;
    this.newY = y;
    this.newRadius = radius;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.oldX = x;
    this.oldY = y;
    this.oldRadius = radius;
    this.updateTime = 0;
    this.dt = 0;
  }

  /** 当前帧插值质量(radius²/100)。 */
  get mass() {
    return this.radius * this.radius / 100 | 0;
  }

  /** 下一帧目标质量(newRadius²/100)。 */
  get staticMass() {
    return this.newRadius * this.newRadius / 100 | 0;
  }

  setColor(r, g, b) {
    this.hasColor = true;
    this.colorObject.r = r;
    this.colorObject.g = g;
    this.colorObject.b = b;
    this.colorHex = '#' + (16777216 + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  setRandomColor() {
    const channels = [255, 7, Math.random() * 255 | 0];
    // 怪癖:比较器恒随机,并非均匀洗牌(原样保留)。
    channels.sort(() => 0.5 - Math.random());
    this.setColor(channels[0], channels[1], channels[2]);
  }

  /** 按 App.time 与 CellAnimation 时长,从 old* 向 new* 插值。 */
  animate() {
    let t = (this.app.time - this.updateTime) / this.settings.CellAnimation;
    t = 0 > t ? 0 : 1 < t ? 1 : t;
    this.x = t * (this.newX - this.oldX) + this.oldX;
    this.y = t * (this.newY - this.oldY) + this.oldY;
    this.radius = t * (this.newRadius - this.oldRadius) + this.oldRadius;
    this.dt = t;
  }

  /** 接收服务器新目标;先 animate() 把当前位置落进 old*。 */
  update(x, y, radius) {
    this.animate();
    this.oldX = this.x;
    this.oldY = this.y;
    this.oldRadius = this.radius;
    this.newX = x;
    this.newY = y;
    this.newRadius = radius;
    this.updateTime = this.app.time;
  }

  get worldID() {
    return this.nick + this.colorHex;
  }

  get isUnnamed() {
    return this.nick.length < 1;
  }
}
