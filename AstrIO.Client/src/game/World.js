/**
 * World — 游戏世界状态(原 `bD` 单例)。
 *
 * 行为:
 *  - 持有全部细胞 `cells`(Map<id, Cell>)与我方细胞 `myCells`,
 *    每帧分拣产物 `food` / `sortedCells`(按 radius 升序,同半径按 id 降序),
 *    战队玩家表 `teamPlayers`、玩家元数据 `playerMeta`、视口区域 `viewArea`。
 *  - update():驱动每帧动画 → 删除移除动画已播完(dt === 1)或 60 秒未更新
 *    (回放模式中除外)的细胞 → 把非食物细胞按设置分拣给
 *    OpponentRings(bO,非病毒)与 VirusRange(bP,病毒)。
 *  - eatCell(eaterId, eatenId) / removeCell(id):eatAnimation 为 "on" 时,
 *    被吃细胞先吸附到吃者位置,再以 `"<id>:removed"` 为键保留为残影继续播
 *    淡出动画;否则直接从表中删除。
 */

export default class World {
  /**
   * @param {Object} systems
   * @param {Object} systems.settings 设置面板(原 bc = ui/SettingsPanel):
   *   opponentRings / virusRange / eatAnimation
   * @param {{ isAlive: boolean }} systems.menuForm 菜单表单(原 bF)
   * @param {{ startedReplay: boolean }} systems.player 回放系统(原 bH = replay/Player)
   * @param {{ time: number }} systems.app 应用主循环(原 c5):当前帧时钟(Date.now())
   * @param {{ viewBounds: {left,top,right,bottom} }} systems.camera 相机(原 bJ):
   *   isInView() 视口剔除用
   * @param {{ init(): void, reset(): void, segregator(cell): void }} systems.opponentRings
   *   对手光环(原 bO = render/OpponentRings)
   * @param {{ init(): void, reset(): void, add(virus): void }} systems.virusRange
   *   病毒范围圈(原 bP = render/VirusRange)
   * @param {Function} systems.Cell 细胞类(原 bE,建议 game/Cell,待重写):
   *   new Cell(id, x, y, radius)
   * @param {Function} systems.TeamPlayer 战队玩家类(原 bG,建议 game/TeamPlayer,待重写):
   *   new TeamPlayer(id)
   */
  constructor({ settings, menuForm, player, app, camera, opponentRings, virusRange, Cell, TeamPlayer }) {
    this.settings = settings;
    this.menuForm = menuForm;
    this.player = player;
    this.app = app;
    this.camera = camera;
    this.opponentRings = opponentRings;
    this.virusRange = virusRange;
    this.Cell = Cell;
    this.TeamPlayer = TeamPlayer;
  }

  init() {
    this.cells = new Map();
    this.myCells = new Map();
    this.viewArea = { left: 0, top: 0, right: 0, bottom: 0 };
    this.sortedCells = [];
    this.food = [];
    this.teamPlayers = new Map();
    this.playerMeta = new Map();
    this.opponentRings.init();
    this.virusRange.init();
  }

  update() {
    const ringsOn = this.settings.opponentRings === 'on' && this.menuForm.isAlive;
    const virusRangeOn = this.settings.virusRange === 'on' && this.menuForm.isAlive;
    this.food = [];
    this.sortedCells = [];
    this.opponentRings.reset();
    this.virusRange.reset();
    for (const [id, cell] of this.cells) {
      cell.animate();
      // 移除动画播完(dt 到 1)→ 真正删除
      if (cell.isRemoved && cell.dt === 1) {
        this.cells.delete(id);
        continue;
      }
      // 60 秒没有网络更新的细胞丢弃(回放中不丢弃)
      if (!cell.isFood && !this.player.startedReplay && this.app.time - cell.updateTime > 60000) {
        this.cells.delete(id);
        continue;
      }
      if (cell.isFood) {
        this.food.push(cell);
      } else {
        this.sortedCells.push(cell);
        if (ringsOn && !cell.isVirus) {
          this.opponentRings.segregator(cell);
        }
        if (virusRangeOn && cell.isVirus) {
          this.virusRange.add(cell);
        }
      }
    }
    this.sortedCells.sort((a, b) => {
      return a.radius === b.radius ? b.id - a.id : a.radius - b.radius;
    });
  }

  /** @param {number} id */
  getCell(id) {
    return this.cells.get(id);
  }

  /**
   * @param {number} id
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   */
  addCell(id, x, y, radius) {
    const cell = new this.Cell(id, x, y, radius);
    this.cells.set(id, cell);
    return cell;
  }

  /**
   * eaten 被 eater 吃掉:开启动画时保留 "<id>:removed" 残影(先吸附到吃者位置)。
   * @param {number} eaterId
   * @param {number} eatenId
   */
  eatCell(eaterId, eatenId) {
    const eaten = this.cells.get(eatenId);
    const eater = this.cells.get(eaterId);
    if (!eaten) {
      return;
    }
    if (this.settings.eatAnimation !== 'on' || !eater) {
      this.myCells.delete(eatenId);
      this.cells.delete(eatenId);
      eaten.isRemoved = true;
      return;
    }
    // 残影从吃者当前位置开始淡出
    eaten.update(eater.x, eater.y, eaten.radius);
    eaten.isRemoved = true;
    if (eaten.isMine) {
      this.myCells.delete(eatenId);
    }
    this.cells.delete(eatenId);
    this.cells.set(eatenId + ':removed', eaten);
  }

  /** @param {number} id */
  removeCell(id) {
    const cell = this.cells.get(id);
    if (!cell) {
      return;
    }
    if (cell.isMine) {
      this.myCells.delete(id);
    }
    this.cells.delete(id);
    cell.isRemoved = true;
    if (this.settings.eatAnimation !== 'on') {
      return;
    }
    this.cells.set(id + ':removed', cell);
  }

  /** 视口剔除:完全在 bJ.viewBounds 之外则不可见。 @param {{x,y,radius}} cell */
  isInView(cell) {
    const bounds = this.camera.viewBounds;
    if (cell.x + cell.radius < bounds.left) {
      return false;
    }
    if (cell.x - cell.radius > bounds.right) {
      return false;
    }
    if (cell.y + cell.radius < bounds.top) {
      return false;
    }
    if (cell.y - cell.radius > bounds.bottom) {
      return false;
    }
    return true;
  }

  /** @param {number} id */
  newTeamPlayer(id) {
    const teamPlayer = new this.TeamPlayer(id);
    this.teamPlayers.set(id, teamPlayer);
    return teamPlayer;
  }

  /** @param {number} id */
  getTeamPlayer(id) {
    return this.teamPlayers.get(id) || {};
  }

  /** @param {number} id */
  removeTeamPlayer(id) {
    this.teamPlayers.delete(id);
  }
}
