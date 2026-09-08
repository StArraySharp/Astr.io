/**
 * Grid — 世界地图边界与分区(原 `bI` 单例)。
 *
 * 注意:虽名为 Grid,本单例不绘制网格线(原版风格网格线在 Canvas.vanillaGrid
 * 中绘制)。它保存地图矩形(left/top/right/bottom/edge)、圆形地图的圆心
 * center 与 circle 标志,以及 5×5 分区命名 getLocation()("A1"…"E5",
 * 行字母=纵向、列数字=横向,供排行榜/小地图显示位置)。
 *
 * update() 首次调用时把相机一次性定位到地图中心,此后每次都通知
 * Minimap.setShape() 同步圆形/方形外观。
 *
 * 怪癖:edge = right - left(非绝对值,假定 right > left);circle 初始为数字 0
 * (仅作布尔标志使用)。
 */

export default class Grid {
  /**
   * @param {Object} systems
   * @param {{ x: number, y: number, viewport: number, targetViewport: number }} systems.camera
   *   相机(原 bJ):首次 update 时定位到地图中心
   * @param {{ setShape(): void }} systems.minimap 小地图(原 bt = ui/Minimap):
   *   地图形状变化时刷新外观
   */
  constructor({ camera, minimap }) {
    this.camera = camera;
    this.minimap = minimap;
    this.left = 0;
    this.top = 0;
    this.right = 15000;
    this.bottom = 15000;
    this.edge = 15000;
    this.center = { x: 0, y: 0 };
    this.circle = 0;
    this._initialized = false;
  }

  reset() {
    this.left = 0;
    this.top = 0;
    this.right = 15000;
    this.bottom = 15000;
    this.edge = 15000;
    this.center.x = 0;
    this.center.y = 0;
    this._initialized = false;
  }

  /**
   * @param {number} left
   * @param {number} top
   * @param {number} right
   * @param {number} bottom
   */
  update(left, top, right, bottom) {
    this.left = left;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    this.edge = right - left;
    this.center.x = (right + left) >> 1;
    this.center.y = (bottom + top) >> 1;
    if (!this._initialized) {
      // 首次收到地图边界:相机直接对准地图中心(无过渡)
      this.camera.x = this.center.x;
      this.camera.y = this.center.y;
      this.camera.viewport = this.camera.targetViewport;
      this._initialized = true;
    }
    this.minimap.setShape();
  }

  /**
   * 5×5 分区坐标:"A1"…"E5"(字母来自 y,数字来自 x,均裁剪到 0…4)。
   * @param {number} x
   * @param {number} y
   * @returns {string}
   */
  getLocation(x, y) {
    let col = (x - this.left) / (this.edge / 5) | 0;
    let row = (y - this.top) / (this.edge / 5) | 0;
    col = col < 0 ? 0 : col > 4 ? 4 : col;
    row = row < 0 ? 0 : row > 4 ? 4 : row;
    return String.fromCharCode(65 + row) + (col + 1);
  }
}
