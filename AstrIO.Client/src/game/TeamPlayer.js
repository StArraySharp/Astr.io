/**
 * TeamPlayer — 战队成员(小地图/战队列表用玩家实体,原 `class bG`)。
 *
 * 行为:
 *  - 构造:(id);出生位置取 Grid.center,isNew=2(供战队列表 HUD 标记
 *    新条目),timeStamp=App.time,team=1。
 *  - worldID:Menu.gMode === ':party' 时 nick+colorHex,否则 nick。
 *    ⚠ 怪癖:全 bundle 中 bB.gMode 仅此一处出现、从未赋值,恒为
 *    undefined,故该分支实际恒走 nick(party 下同名玩家无法区分)。
 *  - location:Grid.getLocation(x, y) → "A1"…"E5" 分区名。
 *  - animate():t = (App.time − timeStamp)/1000,夹取 [0,1];
 *    animX/animY 向 x/y 以比例 t 追赶(1 秒内到位的指数趋近)。
 *  - mapX/mapY:世界坐标 → 小地图像素((anim − left/top)/edge × Minimap.size)。
 */

export default class TeamPlayer {
  /**
   * @param {number} id 玩家 ID
   * @param {Object} systems
   * @param {Object} systems.App — time(原 c5)
   * @param {Object} systems.Grid — center/left/top/edge/getLocation(原 bI)
   * @param {Object} systems.Menu — gMode(原 bB;见上文怪癖,实际恒 undefined)
   * @param {Object} systems.Minimap — size 小地图边长像素(原 bt)
   */
  constructor(id, systems) {
    // 原版 bG 闭包引用全局 bI/c5/bt/bB;无显式 systems 时(World/ChatService
    // 的 new TeamPlayer(id) 调用形态)从全局注册表解引用,等效闭包语义。
    const sys = systems || globalThis.__astrioSystems;
    this.app = sys.App;
    this.grid = sys.Grid;
    this.menu = sys.Menu;
    this.minimap = sys.Minimap;
    this.id = id;
    this.isNew = 2;
    this.x = this.grid.center.x;
    this.y = this.grid.center.y;
    this.isAlive = 0;
    this.mass = 0;
    this.nick = '';
    this.tag = '';
    this.skin = '';
    this.colorHex = '#000';
    this.isRGB = false;
    this.animX = this.grid.center.x;
    this.animY = this.grid.center.y;
    this.timeStamp = this.app.time;
    this.team = 1;
  }

  get worldID() {
    return this.menu.gMode === ':party' ? this.nick + this.colorHex : this.nick;
  }

  /** 当前所在分区名("A1"…"E5")。 */
  get location() {
    return this.grid.getLocation(this.x, this.y);
  }

  /** animX/animY 向最新 x/y 追赶(每秒完全收敛的时间比例插值)。 */
  animate() {
    let t = (this.app.time - this.timeStamp) / 1000;
    t = t > 1 ? 1 : t < 0 ? 0 : t;
    this.animX += (this.x - this.animX) * t;
    this.animY += (this.y - this.animY) * t;
    this.timeStamp = this.app.time;
  }

  /** 小地图 X 像素坐标。 */
  get mapX() {
    return (this.animX - this.grid.left) / this.grid.edge * this.minimap.size;
  }

  /** 小地图 Y 像素坐标。 */
  get mapY() {
    return (this.animY - this.grid.top) / this.grid.edge * this.minimap.size;
  }
}
