/**
 * Targeting — 目标锁定逻辑 target1/target2(原 `bS` 单例)。
 *
 * 行为(与原实现对齐):
 *  - update():对 World.cells 按 worldID 聚合两目标的质心位置、总质量(|0)、
 *    细胞数;目标不在视野(无匹配细胞)时 outOfView = true;
 *    center = 各"已开启且在视野内"目标质心的平均值(两轴 |0)。
 *  - lockTarget(x, y, slot):最近邻搜索(跳过食物/病毒/喷出物;距离平方比较,
 *    初始哨兵 199996164 ≈ 14142²);未命名目标仅弹提示不改状态;
 *    命中后写入目标槽并 TargetingHud.targetMode()。
 *    注:非自由观战时先 Recorder.toggleSpectate() 切入观战。
 *  - reset():关闭两目标;未开启时先 Recorder.toggleSpectate();
 *    按 freeSpectate 切 TargetingHud 鼠标/顶部视口。
 *  - getMass(radius) = radius² / 100。
 */

export default class Targeting {
  /**
   * @param {Object} systems
   * @param {Object} systems.World — cells(Map,按 worldID 聚合)(原 bD)
   * @param {Object} systems.SpectatorTab — freeSpectate(原 bJ)
   * @param {Object} systems.Recorder — toggleSpectate()(原 bi)
   * @param {Object} systems.Chat — alert()(原 bm)
   * @param {Object} systems.I18n — current.notif.target_unnamed(原 ah)
   * @param {Object} systems.TargetingHud — targetMode()/mouseViewport()/topViewport()(原 bA)
   */
  constructor(systems) {
    this.world = systems.World;
    this.spectatorTab = systems.SpectatorTab;
    this.recorder = systems.Recorder;
    this.chat = systems.Chat;
    this.i18n = systems.I18n;
    this.targetingHud = systems.TargetingHud;
  }

  init() {
    this.target1 = {
      turnedOn: false,
      nick: '',
      worldID: '',
      mass: 0,
      cellCount: 0,
      position: { x: 0, y: 0 },
      outOfView: false,
    };
    this.target2 = {
      turnedOn: false,
      nick: '',
      worldID: '',
      mass: 0,
      cellCount: 0,
      position: { x: 0, y: 0 },
      outOfView: false,
    };
    this.center = { x: 0, y: 0 };
  }

  /** 每帧重算两目标质心与总质量,及两者平均中心。 */
  update() {
    if (!this.target1.turnedOn && !this.target2.turnedOn) {
      return;
    }
    const target1 = this.target1;
    const target2 = this.target2;
    target1.mass = 0;
    target1.position.x = 0;
    target1.position.y = 0;
    target1.cellCount = 0;
    target2.mass = 0;
    target2.position.x = 0;
    target2.position.y = 0;
    target2.cellCount = 0;
    this.world.cells.forEach(cell => {
      if (target1.turnedOn && target1.worldID === cell.worldID) {
        target1.position.x += cell.x;
        target1.position.y += cell.y;
        target1.mass += cell.mass;
        target1.cellCount++;
      } else if (target2.turnedOn && target2.worldID === cell.worldID) {
        target2.position.x += cell.x;
        target2.position.y += cell.y;
        target2.mass += cell.mass;
        target2.cellCount++;
      }
    });
    target1.mass = target1.mass | 0;
    target2.mass = target2.mass | 0;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    if (target1.turnedOn) {
      if (target1.cellCount > 0) {
        target1.position.x /= target1.cellCount;
        target1.position.y /= target1.cellCount;
        target1.outOfView = false;
        sumX += target1.position.x;
        sumY += target1.position.y;
        count++;
      } else {
        target1.outOfView = true;
      }
    }
    if (target2.turnedOn) {
      if (target2.cellCount > 0) {
        target2.position.x /= target2.cellCount;
        target2.position.y /= target2.cellCount;
        target2.outOfView = false;
        sumX += target2.position.x;
        sumY += target2.position.y;
        count++;
      } else {
        target2.outOfView = true;
      }
    }
    if (count > 0) {
      this.center.x = (sumX / count) | 0;
      this.center.y = (sumY / count) | 0;
    }
  }

  /**
   * 在世界坐标 (x, y) 附近锁定最近细胞到 target1(slot 1)或 target2(slot 2)。
   */
  lockTarget(x, y, slot) {
    if (!this.spectatorTab.freeSpectate) {
      this.recorder.toggleSpectate();
    }
    let bestDistance = 199996164;
    let bestCell = false;
    this.world.cells.forEach(cell => {
      if (cell.isFood || cell.isVirus || cell.isEjected) {
        return;
      }
      const distance = this.getDistanceSquare(x, y, cell.x, cell.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCell = cell;
      }
    });
    if (bestCell) {
      if (bestCell.isUnnamed) {
        this.chat.alert('', this.i18n.current.notif.target_unnamed);
      } else {
        const target = this[slot === 1 ? 'target1' : 'target2'];
        target.turnedOn = true;
        target.nick = bestCell.nick;
        target.worldID = bestCell.worldID;
        target.outOfView = false;
        this.targetingHud.targetMode();
      }
    }
  }

  getDistanceSquare(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  /** 关闭两目标并复位视口;未开启目标时先切换观战状态。 */
  reset() {
    if (!this.isTurnedOn) {
      this.recorder.toggleSpectate();
    }
    if (this.spectatorTab.freeSpectate) {
      this.targetingHud.mouseViewport();
    } else {
      this.targetingHud.topViewport();
    }
    this.target1.turnedOn = false;
    this.target2.turnedOn = false;
  }

  /** 由半径估算质量:r² / 100。 */
  getMass(radius) {
    return radius * radius / 100;
  }

  get isTurnedOn() {
    return this.target1.turnedOn || this.target2.turnedOn;
  }
}
