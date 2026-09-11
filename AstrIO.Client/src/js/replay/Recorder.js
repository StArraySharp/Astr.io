/**
 * Recorder — 热键命令执行器与回放保存入口(原混淆名 `bi`)。
 *
 * 澄清(与架构表描述的差异):原 `bi` 并不持有录制缓冲——鼠标/命令流的
 * 环形缓冲、采样与落盘都在 replay/Player(原 `bH`)中。本模块是热键动作的
 * 分发器(eject/各类分裂/观战切换/显示开关),其中 `record()` 是"保存回放"
 * 的入口,委托 Player.saveReplay()。原文件因 Windows 大小写不敏感与
 * `bI.js`(Grid 边界)同名冲突,真实内容从 bundle 偏移 6351524–6358799 重新提取。
 */

export default class Recorder {
  /**
   * @param {Object} systems
   * @param {Object} systems.player      回放系统(原 bH,replay/Player)
   * @param {Object} systems.chatService 聊天/系统消息(原 c1,net/ChatService)
   * @param {Object} systems.camera      相机/视口状态(原 bJ:x/y/viewport/isSpectating)
   * @param {Object} systems.menuForm    菜单表单状态(原 bF,ui/MenuForm:tab/movementPaused)
   * @param {Object} systems.mouse       鼠标状态机(原 bg,input/Mouse)
   * @param {Object} systems.keyboard    键盘/发送通道(原 bZ,input/Keyboard:eject/split)
   * @param {Object} systems.gameConnection 游戏连接配置(原 bX,net/GameConnection)
   * @param {Object} systems.targeting   目标选择(原 bS,game/Targeting)
   * @param {Object} systems.targetingHud 目标 HUD(原 bA,ui/TargetingHud)
   * @param {Object} systems.chatHud     聊天消息 HUD(原 bv,ui/ChatHud)
   * @param {Object} systems.commands    自定义命令文本表(原 bh,input/Commands:command1…command0)
   * @param {Object} systems.worldBounds 世界边界(原 bI,render/Grid:getLocation)
   * @param {Object} systems.partySync   tag/战队聊天(原 c3,net/PartySync)
   * @param {Object} systems.settingsPanel 设置面板状态(原 bc,ui/SettingsPanel)
   * @param {Object} systems.store       localStorage 封装(原 af,core/Store)
   * @param {Object} systems.nameRenderer 名字渲染缓存(原 bK,render/NameRenderer)
   * @param {Window} systems.view        全局 window(原 a6)
   */
  constructor(systems) {
    this.player = systems.player;
    this.chatService = systems.chatService;
    this.camera = systems.camera;
    this.menuForm = systems.menuForm;
    this.mouse = systems.mouse;
    this.keyboard = systems.keyboard;
    this.gameConnection = systems.gameConnection;
    this.targeting = systems.targeting;
    this.targetingHud = systems.targetingHud;
    this.chatHud = systems.chatHud;
    this.commands = systems.commands;
    this.worldBounds = systems.worldBounds;
    this.partySync = systems.partySync;
    this.settingsPanel = systems.settingsPanel;
    this.store = systems.store;
    this.nameRenderer = systems.nameRenderer;
    this.view = systems.view;
    this.ejectInterval = false;
    this.connections = 0;
  }

  init() {
    this.ejectInterval = false;
    this.connections = 0;
    // 连接计数每 60 秒清零(供外部连接限流读取;定时器永不清理,随页面存活)。
    setInterval(() => {
      this.connections = 0;
    }, 60000);
  }

  record() {
    if (this.player.startedReplay) {
      this.chatService.chat(null, 2, "You can't save while replaying a recording!", "Recorder", 0);
      return;
    }
    this.player.saveReplay();
  }

  stopMovementToggle() {
    if (this.camera.isSpectating) {
      return;
    }
    this.menuForm.movementPaused = !this.menuForm.movementPaused;
    if (this.menuForm.movementPaused) {
      // 注:原实现此处有一行取 bg.canvas 的死代码(读取后未使用),未保留。
      this.mouse.frozenCanvasX = Math.min(65535, Math.max(0, (this.mouse.x - this.view.innerWidth / 2) / this.camera.viewport + this.camera.x));
      this.mouse.frozenCanvasY = Math.min(65535, Math.max(0, (this.mouse.y - this.view.innerHeight / 2) / this.camera.viewport + this.camera.y));
    }
  }

  feed() {
    const tab = this.menuForm.tab;
    this.mouse.send(tab);
    this.keyboard.eject(tab);
  }

  macroFeed(down) {
    if (down) {
      if (this.ejectInterval) {
        return;
      }
      this.feed();
      this.ejectInterval = setInterval(() => {
        this.feed();
      }, this.gameConnection.ejectSpeed);
    } else if (this.ejectInterval) {
      clearInterval(this.ejectInterval);
      this.ejectInterval = false;
    }
  }

  split() {
    const tab = this.menuForm.tab;
    this.mouse.send(tab);
    this.keyboard.split(tab);
  }

  doubleSplit() {
    const tab = this.menuForm.tab;
    if (!this.gameConnection.betterDoubleSplits) {
      this.mouse.send(tab);
      this.keyboard.split(tab);
      setTimeout(() => {
        this.mouse.send(tab);
        this.keyboard.split(tab);
      }, 40);
      return;
    }
    const gapMs = 40;
    const autoAimMs = 1000;
    const aim = this.mouse.captureDoubleSplitAim();
    this.mouse.setAutoAimOverride(tab, aim, autoAimMs);
    this.mouse.sendAim(tab, aim);
    this.keyboard.split(tab);
    setTimeout(() => {
      this.mouse.sendAim(tab, aim);
      this.keyboard.split(tab);
    }, gapMs);
  }

  tripleSplit() {
    const tab = this.menuForm.tab;
    this.mouse.send(tab);
    this.keyboard.split(tab);
    setTimeout(() => {
      this.mouse.send(tab);
      this.keyboard.split(tab);
    }, 40);
    setTimeout(() => {
      this.mouse.send(tab);
      this.keyboard.split(tab);
    }, 80);
  }

  /**
   * 16 分 = 4 轮。**一个包带轮数**:服务器把轮数排队、每 tick 只消化一轮,
   * 每轮之间球会被 boost 推开一段 → 出生点逐轮错开,列成一条直线。
   * (若服务器在同一 tick 内连分,分身会全叠在同一个点上。)
   */
  split16() {
    const tab = this.menuForm.tab;
    this.mouse.send(tab);
    this.keyboard.split(tab, 4);
  }

  /** 64 分 = 6 轮(同样一个包带轮数,由服务器逐 tick 消化)。 */
  split64() {
    const tab = this.menuForm.tab;
    this.mouse.send(tab);
    this.keyboard.split(tab, 6);
  }

  toggleSpectate() {
    if (this.player.startedReplay) {
      this.camera.centerLock = false;
      if (this.targeting.isTurnedOn) {
        this.targeting.target1.turnedOn = false;
        this.targeting.target2.turnedOn = false;
        this.player.setReplaySpectateMode("mouse");
        return;
      }
      if (this.camera.freeSpectate) {
        this.player.setReplaySpectateMode("top");
      } else {
        this.player.setReplaySpectateMode("mouse");
      }
      return;
    }
    if (this.targeting.isTurnedOn) {
      this.targeting.reset();
      this.targeting.target1.turnedOn = false;
      this.targeting.target2.turnedOn = false;
      this.targetingHud.mouseViewport();
      return;
    }
    this.keyboard.freeSpectate();
    if (this.camera.freeSpectate) {
      this.targetingHud.mouseViewport();
    } else {
      this.targetingHud.topViewport();
    }
    this.targeting.target1.turnedOn = false;
    this.targeting.target2.turnedOn = false;
  }

  chat() {
    this.chatHud.enter();
  }

  toggleChatScope() {
    this.chatHud.toggleScope();
  }

  command(index) {
    let text = this.commands["command" + index];
    // %sector% 占位符替换为当前相机所在扇区(如 "C3")。
    if (text.indexOf("%sector%") >= 0) {
      const sector = this.worldBounds.getLocation(this.camera.x, this.camera.y);
      text = text.replace("%sector%", sector);
    }
    this.partySync.chat(2, text, 0);
  }

  setZoom(viewport) {
    this.camera.targetViewport = viewport;
  }

  // 以下 toggle* 通用怪癖:开关从 localStorage 保存值(settings 命名空间)恢复,
  // 而非当前面板值;仅当保存值非 "off" 时用它,否则落到硬编码默认值。

  toggleCellNick() {
    const saved = this.store.get("settings", "cellNick");
    if (this.settingsPanel.cellNick === "off") {
      this.settingsPanel.cellNick = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.cellNick = "off";
    }
  }

  toggleCellMass() {
    const saved = this.store.get("settings", "cellMass");
    if (this.settingsPanel.cellMass === "off") {
      this.settingsPanel.cellMass = saved !== "off" && saved || "shortened";
    } else {
      this.settingsPanel.cellMass = "off";
    }
  }

  toggleTeamTags() {
    const saved = this.store.get("settings", "teamTags");
    if (this.settingsPanel.teamTags === "off") {
      this.settingsPanel.teamTags = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.teamTags = "off";
    }
    this.nameRenderer.nickCaches.clear();
  }

  toggleHud() {
    const saved = this.store.get("settings", "hideHud");
    if (this.settingsPanel.hideHud === "off") {
      this.settingsPanel.hideHud = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.hideHud = "off";
    }
    this.settingsPanel.toggleHud();
  }

  toggleLbColors() {
    const saved = this.store.get("settings", "toggleLbColors");
    if (this.settingsPanel.lbColors === "off") {
      this.settingsPanel.lbColors = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.lbColors = "off";
    }
  }

  toggleOwnNick() {
    const saved = this.store.get("settings", "hideOwnNick");
    if (this.settingsPanel.hideOwnNick === "off") {
      this.settingsPanel.hideOwnNick = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.hideOwnNick = "off";
    }
  }

  toggleOwnMass() {
    const saved = this.store.get("settings", "hideOwnMass");
    if (this.settingsPanel.hideOwnMass === "off") {
      this.settingsPanel.hideOwnMass = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.hideOwnMass = "off";
    }
  }

  toggleGameFood() {
    const saved = this.store.get("settings", "food");
    if (this.settingsPanel.food === "off") {
      this.settingsPanel.food = saved !== "off" && saved || "monoColored";
    } else {
      this.settingsPanel.food = "off";
    }
  }

  toggleBGsectors() {
    const saved = this.store.get("settings", "bgSectors");
    if (this.settingsPanel.bgSectors === "off") {
      this.settingsPanel.bgSectors = saved !== "off" && saved || "normal";
    } else {
      this.settingsPanel.bgSectors = "off";
    }
  }

  toggleSkin() {
    const saved = this.store.get("settings", "urlSkins");
    if (this.settingsPanel.urlSkins === "off") {
      this.settingsPanel.urlSkins = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.urlSkins = "off";
    }
  }

  toggleOwnSkin() {
    const saved = this.store.get("settings", "ownSkin");
    if (this.settingsPanel.ownSkin === "off") {
      this.settingsPanel.ownSkin = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.ownSkin = "off";
    }
  }

  toggleSplitRings() {
    const saved = this.store.get("settings", "splitRings");
    if (this.settingsPanel.splitRings === "off") {
      this.settingsPanel.splitRings = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.splitRings = "off";
    }
  }

  toggleOpponentRings() {
    const saved = this.store.get("settings", "opponentRings");
    if (this.settingsPanel.opponentRings === "off") {
      this.settingsPanel.opponentRings = saved !== "off" && saved || "on";
    } else {
      this.settingsPanel.opponentRings = "off";
    }
  }

  multiboxTab() {
    this.menuForm.tab = this.menuForm.tab === 1 ? 2 : 1;
  }
}
