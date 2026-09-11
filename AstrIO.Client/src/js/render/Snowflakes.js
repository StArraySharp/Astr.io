/**
 * Snowflakes — 世界扇区网格渲染器(原 `bR`)。
 *
 * 注意:文件名沿用 ARCHITECTURE.md 的映射(bR → Snowflakes);bR 实际绘制的是
 * 5×5 扇区网格(A1–E5)的分隔线条与坐标文字,其中"snowflakes"模式把坐标文字
 * 换成 Font Awesome 雪花图标 "\uF2DC"(这就是架构表中"雪花/线条"的出处)。
 *
 * 行为(受 SettingsPanel.bgSectors 控制:"off" | "onlyLines" | "snowflakes" | 其他):
 *  - 圆形地图时先按 Grid.center/edge 裁剪(clip);
 *  - edge = Grid.edge − Theme.gridWidth,扇区边长 = edge/5|0,
 *    用 5 个描边矩形(两条竖列、两条横行、外框)画出井字线;
 *  - "onlyLines" 只画线;其余模式在每扇区中心写坐标(字体
 *    "400 {gridTextSize}px {gridTextFont}"),只写视口内可见扇区(四周外扩 200);
 *  - 圆形地图时 A/E 两行(首末行)列号从 0 起算(怪癖);雪花模式无此修正。
 */

export default class Snowflakes {
  /**
   * @param {Object} systems
   * @param {import('../ui/SettingsPanel').default} systems.settings 原 bc(读取 bgSectors)
   * @param {import('./Canvas').default} systems.canvas 原 c4(ctx/pi2)
   * @param {import('../ui/Theme').default} systems.theme 原 bj(gridWidth/gridColor/gridTextColor/gridTextSize/gridTextFont)
   * @param {import('./Grid').default} systems.grid 原 bI(circle/center/edge/left/top/right/bottom)
   * @param {import('../ui/SpectatorTab').default} systems.spectator 原 bJ(viewBounds)
   */
  constructor({ settings, canvas, theme, grid, spectator }) {
    this.settings = settings;
    this.canvas = canvas;
    this.theme = theme;
    this.grid = grid;
    this.spectator = spectator;
    this.left = 0;
    this.top = 0;
    this.sectorEdge = 0;
    this.edge = 0;
    this.halfSectorEdge = 0;
    this.letters = ["A", "B", "C", "D", "E"];
    this.visible = new Set();
  }

  render() {
    const mode = this.settings.bgSectors;
    if (mode === "off") {
      return;
    }
    const ctx = this.canvas.ctx;
    const halfWidth = this.theme.gridWidth >> 1;
    ctx.save();
    if (this.grid.circle) {
      ctx.beginPath();
      ctx.arc(this.grid.center.x, this.grid.center.y, this.grid.edge / 2, 0, this.canvas.pi2, true);
      ctx.closePath();
      ctx.clip();
    }
    this.edge = this.grid.edge - this.theme.gridWidth;
    this.left = this.grid.left + halfWidth;
    this.top = this.grid.top + halfWidth;
    this.sectorEdge = this.edge / 5 | 0;
    this.halfSectorEdge = this.edge / 10 | 0;
    ctx.lineWidth = this.theme.gridWidth;
    ctx.strokeStyle = this.theme.gridColor;
    this.sectors();
    if (mode === "onlyLines") {
      ctx.restore();
      return;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = this.theme.gridTextColor;
    this.updateViewSectors();
    if (mode === "snowflakes") {
      this.snowflakes();
    } else {
      this.normal();
    }
    ctx.restore();
  }

  sectors() {
    const ctx = this.canvas.ctx;
    ctx.beginPath();
    // 怪癖:以"整扇区矩形"描边代替细线(内部线条会被描两次)
    ctx.rect(this.left + this.sectorEdge, this.top, this.sectorEdge, this.edge);
    ctx.rect(this.left + this.sectorEdge * 3, this.top, this.sectorEdge, this.edge);
    ctx.rect(this.left, this.top + this.sectorEdge, this.edge, this.sectorEdge);
    ctx.rect(this.left, this.top + this.sectorEdge * 3, this.edge, this.sectorEdge);
    ctx.rect(this.left, this.top, this.edge, this.edge);
    ctx.closePath();
    ctx.stroke();
  }

  updateViewSectors() {
    this.visible.clear();
    const bounds = this.spectator.viewBounds;
    const firstCol = Math.max((bounds.left - 200 - this.grid.left) / this.sectorEdge, 0);
    const firstRow = (bounds.top - 200 - this.grid.top) / this.sectorEdge | 0;
    const colCount = 5 - Math.max((this.grid.right - bounds.right - 200) / this.sectorEdge, 0) - firstCol;
    const rowCount = 5 - Math.max((this.grid.bottom - bounds.bottom - 200) / this.sectorEdge, 0) - firstRow;
    for (let col = 0; col < colCount; col++) {
      for (let row = 0; row < rowCount; row++) {
        this.visible.add(this.letters[firstRow + row] + (firstCol + col + 1));
      }
    }
  }

  normal() {
    const ctx = this.canvas.ctx;
    ctx.font = "400 " + this.theme.gridTextSize + "px " + this.theme.gridTextFont;
    for (let row = 0; row < 5; row++) {
      const y = this.top + this.halfSectorEdge + row * this.sectorEdge;
      for (let col = 0; col < 5; col++) {
        // 怪癖:圆形地图时首末行(A/E)列号从 0 起算
        const colLabel = this.grid.circle && (row === 0 || row === 4) ? col : col + 1;
        const label = this.letters[row] + colLabel;
        if (!this.visible.has(label)) {
          continue;
        }
        const x = this.left + this.halfSectorEdge + col * this.sectorEdge;
        ctx.fillText(label, x, y);
      }
    }
  }

  snowflakes() {
    const ctx = this.canvas.ctx;
    ctx.font = "400 " + this.theme.gridTextSize + "px Font Awesome\\ 5 Pro";
    for (let row = 0; row < 5; row++) {
      const y = this.top + this.halfSectorEdge + row * this.sectorEdge;
      for (let col = 0; col < 5; col++) {
        const label = this.letters[row] + (col + 1);
        if (!this.visible.has(label)) {
          continue;
        }
        const x = this.left + this.halfSectorEdge + col * this.sectorEdge;
        ctx.fillText("\uF2DC", x, y);
      }
    }
  }
}
