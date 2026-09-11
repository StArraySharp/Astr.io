/**
 * Player — 回放系统:录制环形缓冲 + 回放 HUD/时间轴/速度控制(原混淆名 `bH`)。
 *
 * 行为:
 *  - 录制:外部(bF)在 `started`(instantReplay=on 且存活且未在回放)时把服务器
 *    包经 pushBytes() 压入环形缓冲;内置 4ms 鼠标采样器(操作码 251)与 1s 周期的
 *    世界/自身细胞关键帧快照(操作码 252/250);窗口长度 = replayDuration(默认 30s)。
 *  - 保存:saveReplay() 以版本 3 头(时长/边界/tag/nick/skin/skin2/eatAnimation/
 *    ejectSpeed)+ 每包 [u16 delta|u16 len|payload] 拼 Blob,下载 recording-<ts>.astr.io。
 *  - 回放:readFile() 解析 .astr.io,预载至首个关键帧后启动 RAF 主循环
 *    (帧步进上限 50ms,速度倍率),支持暂停/变速/拖动时间轴(基于关键帧索引 seek)。
 *  - 观战模式:top(最大细胞)/mouse(自由视角,点击 canvas 定位)/target。
 */

export default class Player {
  /**
   * @param {Object} systems
   * @param {Object} systems.settingsPanel  设置状态(原 bc,ui/SettingsPanel:instantReplay/replayDuration/hideHud/teamTags)
   * @param {Object} systems.menuForm       菜单表单状态(原 bF,ui/MenuForm:isAlive/tag/nick/skin/skin2/tab/_tab)
   * @param {Object} systems.packetWriter   共享二进制写缓冲(原 bW:init/writeUInt8/writeUInt16/writeUInt32/writeString16/buffer)
   * @param {Object} systems.chatService    聊天/系统消息(原 c1,net/ChatService:chat)
   * @param {Object} systems.worldBounds    世界边界(原 bI,render/Grid:left/top/right/bottom/center/update)
   * @param {Object} systems.gameConnection 游戏连接(原 bX,net/GameConnection:disconnect/resetData/eatAnimation/ejectSpeed)
   * @param {Object} systems.canvasManager  画布管理(原 c4,render/Canvas:canvas)
   * @param {Object} systems.mouse          鼠标状态机(原 bg,input/Mouse:x/y/worldX/worldY)
   * @param {Object} systems.world          游戏世界状态(原 bD,game/World:cells/myCells/sortedCells/getCell/addCell)
   * @param {Object} systems.camera         相机/视口状态(原 bJ:x/y/viewport/targetViewport/isSpectating/
   *                                         centerLock/freeSpectate/spectatePoint/autoZoomViewport)
   * @param {Object} systems.leaderboard    排行榜(原 br,ui/Leaderboard:clear/div)
   * @param {Object} systems.menu           主菜单(原 bB,ui/Menu:open/close)
   * @param {Class}  systems.ByteReader     二进制读取器类(原 bU:uint8/uint16/uint32/float/string16/length/maxLength/end)
   * @param {Object} systems.packetRouter   游戏协议分发器(原 bY:teamUpdate/worldUpdate/borderUpdate/
   *                                         getLeaderboard/teamLeaderboard;架构表记 admin/AdminPanel)
   * @param {Object} systems.targeting      目标选择(原 bS,game/Targeting:isTurnedOn/update/center/target1/target2)
   * @param {Object} systems.targetingHud   目标 HUD(原 bA,ui/TargetingHud:topViewport/mouseViewport/targetMode)
   * @param {Object} systems.app            应用引导(原 c5,core/App:time)
   * @param {Window} systems.view           全局 window(原 a6;REPLAY_MODE/_showReplayDropZone)
   * @param {Function} systems.$            jQuery(原 a7)
   * @param {Document} systems.doc          document(原 a8)
   */
  constructor(systems) {
    this.settingsPanel = systems.settingsPanel;
    this.menuForm = systems.menuForm;
    this.packetWriter = systems.packetWriter;
    this.chatService = systems.chatService;
    this.worldBounds = systems.worldBounds;
    this.gameConnection = systems.gameConnection;
    this.canvasManager = systems.canvasManager;
    this.mouse = systems.mouse;
    this.world = systems.world;
    this.camera = systems.camera;
    this.leaderboard = systems.leaderboard;
    this.menu = systems.menu;
    this.ByteReader = systems.ByteReader;
    this.packetRouter = systems.packetRouter;
    this.targeting = systems.targeting;
    this.targetingHud = systems.targetingHud;
    this.app = systems.app;
    this.view = systems.view;
    this.$ = systems.$;
    this.doc = systems.doc;

    this.ringBuffer = [];
    this.lastPacketTime = 0;
    this.lastSnapshotTime = 0;
    this.startedReplay = false;
    this.isPaused = false;
    this.playbackSpeed = 1;
    this.replayTimeout = null;
    this.replayRaf = null;
    this.replayClockMs = 0;
    this.replayLastFrameAt = 0;
    this.replaySeeking = false;
    this.replayBuffer = null;
    this.replayDataExhausted = false;
    this.totalDuration = 0;
    this.currentTime = 0;
    this.replayMouseX = 0;
    this.replayMouseY = 0;
    this.replayHasMouse = false;
    this.replayIndex = [];
    this.replaySpectateMode = "top";
    this.mouseSampleRateMs = 4;
    this.mouseSampleTimer = null;
    this.lastMouseSampleTime = 0;
    this.divManager = this.doc.getElementById("replay-hud");
    this.divReplay = this.doc.querySelector('.field > input[type="file"]');
    this.divRecorder = this.doc.getElementById("record-hud"); // 怪癖:取了该元素但整个模块从未使用。
    this.divTimeline = this.doc.getElementById("replay-timeline");
    this.divTimeDisplay = this.doc.getElementById("replay-time");
    this.divSpeedDisplay = this.doc.getElementById("replay-speed");
    this.oldSkin = "";
    this.oldSkin2 = "";
    this.newSkin = "";
    this.newSkin2 = "";
    // 底部操作栏自动收缩(2s 无操作藏起,唤醒即弹出)
    this.hudHideTimer = null;
    this.hudWakeBound = () => this.showReplayHud();
  }

  /** 录制是否应处于活跃状态。 */
  get started() {
    return this.settingsPanel.instantReplay === "on" && !this.startedReplay && this.menuForm.isAlive;
  }

  clearBuffer() {
    this.ringBuffer = [];
    this.lastPacketTime = 0;
    this.lastSnapshotTime = 0;
    this.lastMouseSampleTime = 0;
    this.stopMouseSampler();
  }

  cloneBuffer(buffer) {
    const bytes = new Uint8Array(buffer);
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  }

  pushPacket(deltaMs, data, time) {
    const clonedData = this.cloneBuffer(data);
    const header = new ArrayBuffer(4);
    const headerView = new DataView(header);
    headerView.setUint16(0, Math.min(deltaMs, 65535), true);
    headerView.setUint16(2, clonedData.byteLength, true);
    this.ringBuffer.push({ header, data: clonedData, time });
  }

  pruneRingBuffer(now) {
    const windowMs = (this.settingsPanel.replayDuration || 30) * 1000;
    const cutoff = now - windowMs;
    while (this.ringBuffer.length > 0 && this.ringBuffer[0].time < cutoff) {
      this.ringBuffer.shift();
    }
  }

  startMouseSampler() {
    if (this.mouseSampleTimer) {
      return;
    }
    this.mouseSampleTimer = setInterval(() => {
      if (!this.started) {
        this.stopMouseSampler();
        return;
      }
      this.pushMouseSample(Date.now());
    }, this.mouseSampleRateMs);
  }

  stopMouseSampler() {
    if (!this.mouseSampleTimer) {
      return;
    }
    clearInterval(this.mouseSampleTimer);
    this.mouseSampleTimer = null;
  }

  pushMouseSample(now, force = false) {
    if (!force && !this.started) {
      return false;
    }
    const canvas = this.canvasManager.canvas;
    if (!canvas) {
      return false;
    }
    if (!force && this.lastMouseSampleTime && now - this.lastMouseSampleTime < this.mouseSampleRateMs) {
      return false;
    }
    const worldX = (this.mouse.x - this.view.innerWidth / 2) / this.camera.viewport + this.camera.x;
    const worldY = (this.mouse.y - this.view.innerHeight / 2) / this.camera.viewport + this.camera.y;
    // 怪癖:采样顺带把世界坐标写回鼠标单例(bg.worldX/worldY)。
    this.mouse.worldX = worldX;
    this.mouse.worldY = worldY;
    const w = this.packetWriter;
    w.init();
    w.writeUInt8(251);
    w.writeUInt16(Math.round(worldX) & 65535);
    w.writeUInt16(Math.round(worldY) & 65535);
    const delta = this.lastPacketTime ? now - this.lastPacketTime : 0;
    this.lastPacketTime = now;
    this.lastMouseSampleTime = now;
    this.pushPacket(delta, w.buffer, now);
    this.pruneRingBuffer(now);
    return true;
  }

  pushBytes(data) {
    this.startMouseSampler();
    const now = Date.now();
    this.pushMouseSample(now);
    if (this.world.cells.size > 0 && now - this.lastSnapshotTime > 1000) {
      this.lastSnapshotTime = now;
      const worldState = this.snapshotWorldState();
      if (worldState) {
        this.pushPacket(0, worldState, now);
      }
      const myCells = this.snapshotMyCells();
      if (myCells) {
        this.pushPacket(0, myCells, now);
      }
    }
    const delta = this.lastPacketTime ? now - this.lastPacketTime : 0;
    this.lastPacketTime = now;
    this.pushPacket(delta, data, now);
    this.pruneRingBuffer(now);
  }

  saveReplay() {
    if (this.startedReplay) {
      this.chatService.chat(null, 2, "Can't save while replaying!", "Recorder");
      return;
    }
    if (this.ringBuffer.length === 0) {
      this.chatService.chat(null, 2, "No replay data! Play for a bit first.", "Recorder");
      return;
    }
    return this._doSaveReplay();
  }

  async _doSaveReplay() {
    const firstTime = this.ringBuffer[0].time;
    const lastTime = this.ringBuffer[this.ringBuffer.length - 1].time;
    const durationMs = lastTime - firstTime;
    const mmss = this.time(durationMs);
    const parts = [];
    const w = this.packetWriter;
    w.init();
    w.writeUInt8(3); // 录制格式版本 3
    w.writeUInt8(mmss[0]); // 分钟(怪癖:超过 255 分钟时 writeUInt8 截断)
    w.writeUInt8(mmss[1]); // 秒(两位字符串)
    w.writeUInt16(this.worldBounds.left);
    w.writeUInt16(this.worldBounds.top);
    w.writeUInt16(this.worldBounds.right);
    w.writeUInt16(this.worldBounds.bottom);
    w.writeString16(this.menuForm.tag || "");
    w.writeString16(this.menuForm.nick || "");
    w.writeString16(this.menuForm.skin || "");
    w.writeString16(this.menuForm.skin2 || "");
    w.writeUInt8(this.gameConnection.eatAnimation ? 1 : 0);
    w.writeUInt8(this.gameConnection.ejectSpeed || 0);
    parts.push(w.buffer);
    for (const entry of this.ringBuffer) {
      parts.push(entry.header);
      parts.push(entry.data);
    }
    const blob = new Blob(parts, { type: "application/octet-stream" });
    // ★ 存入应用私有存储(IndexedDB;Android 上等价 /data/data/<包名>/app_webview/),
    //   文件名 yyyymmdd_hhmmss.astr.io。浏览器端回放页同源可读,列出供用户选播。
    //   桌面端额外保留原 <a download> 下载(老习惯);WebView 里下载不稳定,不弹。
    let name;
    try {
      const mod = await import('./ReplayStore.js');
      name = await mod.saveReplay(blob);
    } catch (e) {
      // IndexedDB 不可用(隐私模式等):退化为时间戳名,仅聊天提示
      name = this.replayFileName();
      console.warn("[replay] IndexedDB save failed:", e);
    }
    if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
      // 仅浏览器端弹下载;APK 里已存私有目录,由回放页列表读取
      this.download("recording-" + Date.now() + ".astr.io", blob);
    }
    this.chatService.chat(null, 2, "已保存为 " + name + "（" + this.formatTime(durationMs) + "）", "Recorder");
    // ★ 异步上传到服务器(不阻塞保存流程;失败静默,本地副本仍在)。
    //   游戏页与回放页不同端口(8123 vs 4002),用「亚洲服务器地址」或同 host 的 4002。
    this.uploadReplay(blob, name);
  }

  /**
   * 上传回放到游戏服(/api/replay/upload,multipart 字段 file)。
   * 目标服地址:与游戏 WebSocket 同 host 的 4002 端口(面板/静态服)。
   * 结果走聊天条:成功 = 已上传,失败 = 上传失败(本地仍可播)。
   */
  uploadReplay(blob, name) {
    // 从 GameConnection 拿 ws 地址推导 HTTP 基址;拿不到就用同源
    let base = "";
    try {
      const gc = this.gameConnection;
      if (gc && gc.ws && gc.ws.url) {
        const u = new URL(gc.ws.url);
        base = u.protocol === "wss:" ? "https://" + u.hostname : "http://" + u.hostname + ":4002";
      }
    } catch (e) { /* 同源兜底 */ }
    const fd = new FormData();
    fd.append("file", blob, name);
    fetch(base + "/api/replay/upload", { method: "POST", body: fd })
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          this.chatService.chat(null, 2, "已上传到服务器: " + j.name + "（回放页可下载）", "Recorder");
        } else {
          this.chatService.chat(null, 2, "上传失败: " + (j.error || r.status), "Recorder");
        }
      })
      .catch(e => this.chatService.chat(null, 2, "上传失败（本地副本已保存）", "Recorder"));
  }

  /** yyyymmdd_hhmmss.astr.io（IndexedDB 不可用时的退化文件名）。 */
  replayFileName(d = new Date()) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.astr.io`;
  }

  /** 毫秒 → [分钟, 两位秒字符串](小时被丢弃)。 */
  time(ms) {
    let totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    totalSeconds -= hours * 3600;
    const minutes = Math.floor(totalSeconds / 60);
    totalSeconds -= minutes * 60;
    totalSeconds = "" + totalSeconds;
    totalSeconds = ("00" + totalSeconds).substring(totalSeconds.length);
    return [minutes, totalSeconds];
  }

  formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
  }

  stopRendering() {
    this.gameConnection.resetData();
    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
    // 操作栏收尾:停止计时/摘监听,保证弹出
    this.stopHudAutoHide();
    this.stopReplayLoop();
    this.disableFreeCam();
    this.replaySpectateMode = "top";
    this.stopMouseSampler();
    this.replayHasMouse = false;
    this.replayIndex = [];
    if (this.startedReplay) {
      this.menuForm.skin = this.oldSkin;
      this.menuForm.skin2 = this.oldSkin2;
      this.camera.isSpectating = false;
      this.world.cells.clear();
      this.world.myCells.clear();
      this.world.sortedCells = [];
      this.chatService.chat(null, 2, "Finished the replay!", "Recorder");
      this.startedReplay = false;
      this.$("#chatroom").show();
      this.$("#message-hud").show();
      if (this.view.REPLAY_MODE) {
        // REPLAY_MODE 独立页面模式:结束后重新显示拖放区(全局注入的钩子)。
        if (this.view._showReplayDropZone) {
          this.view._showReplayDropZone();
        }
      } else {
        this.menu.open();
      }
    }
    if (this.divManager) {
      this.divManager.style.display = "none";
    }
    if (this.divTimeline) {
      this.divTimeline.oninput = null;
    }
  }

  snapshotMyCells() {
    if (this.world.myCells.size === 0) {
      return null;
    }
    const w = this.packetWriter;
    w.init();
    w.writeUInt8(250);
    w.writeUInt16(this.world.myCells.size);
    for (const cell of this.world.myCells.values()) {
      w.writeUInt32(cell.id);
      w.writeUInt16(cell.newX);
      w.writeUInt16(cell.newY);
      w.writeUInt16(cell.newRadius);
      w.writeUInt8(cell.tab || 0);
      w.writeUInt8(cell.colorObject ? cell.colorObject.r : 0);
      w.writeUInt8(cell.colorObject ? cell.colorObject.g : 0);
      w.writeUInt8(cell.colorObject ? cell.colorObject.b : 0);
      w.writeString16(cell.nick || "");
      w.writeString16(cell.skin || "");
    }
    return w.buffer;
  }

  writeSkinPacket(skin) {
    const w = this.packetWriter;
    if (!skin) {
      w.writeUInt8(0);
      w.writeString16("");
      return;
    }
    const imgur = /^https:\/\/i\.imgur\.com\/([a-zA-Z0-9]+)\.jpg(?:\?.*)?$/i.exec(skin);
    if (imgur) {
      w.writeUInt8(1);
      w.writeString16(imgur[1]);
      return;
    }
    const hizliPrefix = "https://i.hizliresim.com/";
    if (skin.indexOf(hizliPrefix) === 0) {
      w.writeUInt8(2);
      w.writeString16(skin.substring(hizliPrefix.length));
      return;
    }
    w.writeUInt8(0);
    w.writeString16(skin);
  }

  snapshotWorldState() {
    const cells = this.world.cells;
    if (!cells || cells.size < 1) {
      return null;
    }
    const valid = [];
    for (const cell of cells.values()) {
      if (!cell || cell.isRemoved) {
        continue;
      }
      if (!Number.isFinite(cell.newX) || !Number.isFinite(cell.newY)) {
        continue;
      }
      if (!Number.isFinite(cell.newRadius) || cell.newRadius <= 0) {
        continue;
      }
      valid.push(cell);
    }
    if (valid.length < 1) {
      return null;
    }
    const w = this.packetWriter;
    w.init();
    w.writeUInt8(252);
    w.writeUInt16(valid.length);
    for (const cell of valid) {
      w.writeUInt32(cell.id);
      w.writeUInt16(cell.newX);
      w.writeUInt16(cell.newY);
      w.writeUInt16(cell.newRadius);
      let flags = 0;
      if (cell.isVirus) flags |= 1;
      if (cell.isEjected) flags |= 2;
      if (cell.isFood) flags |= 4;
      if (cell.colorObject) flags |= 8;
      if (cell.nick) flags |= 16;
      if (cell.skin) flags |= 32;
      if (cell.isMine) flags |= 64;
      if (cell.friendID) flags |= 128;
      if (cell.tab) flags |= 256;
      if (cell.isGhost) flags |= 512;
      if (cell.isCrowned) flags |= 1024;
      if (cell.nameColor) flags |= 2048;
      w.writeUInt16(flags);
      if (flags & 8) {
        w.writeUInt8(cell.colorObject.r);
        w.writeUInt8(cell.colorObject.g);
        w.writeUInt8(cell.colorObject.b);
      }
      if (flags & 16) {
        w.writeString16(cell.nick);
      }
      if (flags & 32) {
        this.writeSkinPacket(cell.skin);
      }
      if (flags & 128) {
        w.writeUInt32(cell.friendID);
      }
      if (flags & 256) {
        w.writeUInt8(cell.tab);
      }
      if (flags & 2048) {
        if (cell.nameColor === "rainbow") {
          w.writeUInt8(1);
        } else if (cell.nameColor === "rainbow-gradient") {
          w.writeUInt8(3);
        } else {
          w.writeUInt8(2);
          const rgb = cell.nameColor.match(/(\d+),(\d+),(\d+)/);
          w.writeUInt8(rgb ? parseInt(rgb[1], 10) : 255);
          w.writeUInt8(rgb ? parseInt(rgb[2], 10) : 255);
          w.writeUInt8(rgb ? parseInt(rgb[3], 10) : 255);
        }
      }
    }
    return w.buffer;
  }

  // 原名拼写如此("preliminar"),未在任何调用点出现,保留以防外部引用。
  preliminarWorldUpdate() {
    const cells = this.world.cells;
    const w = this.packetWriter;
    w.init();
    w.writeUInt8(50);
    w.writeUInt16(cells.size);
    for (const cell of cells.values()) {
      w.writeUInt32(cell.id);
      w.writeUInt16(cell.newX);
      w.writeUInt16(cell.newY);
      w.writeUInt16(cell.newRadius);
      let flags = 0;
      if (cell.isVirus) flags |= 1;
      if (cell.isEjected) flags |= 2;
      if (cell.isFood) flags |= 4;
      if (cell.colorObject) flags |= 8;
      if (cell.nick) flags |= 16;
      if (cell.skin) flags |= 32;
      if (cell.isMine) flags |= 64;
      if (cell.friendID) flags |= 128;
      if (cell.tab) flags |= 256;
      if (cell.isGhost) flags |= 512;
      if (cell.isCrowned) flags |= 1024;
      if (cell.nameColor) flags |= 2048;
      w.writeUInt16(flags);
      if (flags & 8) {
        w.writeUInt8(cell.colorObject.r);
        w.writeUInt8(cell.colorObject.g);
        w.writeUInt8(cell.colorObject.b);
      }
      if (flags & 16) {
        w.writeString16(cell.nick);
      }
      // 怪癖:此变体皮肤恒按 imgur 类型 1 写出(剥离前后缀),不支持 hizliresim。
      if (flags & 32) {
        w.writeUInt8(1);
        w.writeString16(cell.skin.replace("https://i.imgur.com/", "").replace(".jpg", ""));
      }
      if (flags & 128) {
        w.writeUInt32(cell.friendID);
      }
      if (flags & 256) {
        w.writeUInt8(cell.tab);
      }
      if (flags & 2048) {
        if (cell.nameColor === "rainbow") {
          w.writeUInt8(1);
        } else if (cell.nameColor === "rainbow-gradient") {
          w.writeUInt8(3);
        } else {
          w.writeUInt8(2);
          const rgb = cell.nameColor.match(/(\d+),(\d+),(\d+)/);
          // 怪癖:此变体 parseInt 不带 radix(与 snapshotWorldState 不同)。
          w.writeUInt8(rgb ? parseInt(rgb[1]) : 255);
          w.writeUInt8(rgb ? parseInt(rgb[2]) : 255);
          w.writeUInt8(rgb ? parseInt(rgb[3]) : 255);
        }
      }
    }
    w.writeUInt16(0);
    w.writeUInt16(0);
    w.writeUInt16(0);
    return w.buffer;
  }

  download(filename, blob) {
    const a = this.doc.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.setAttribute("download", filename);
    a.style.display = "none";
    this.doc.body.appendChild(a);
    a.click();
    this.doc.body.removeChild(a);
    // 怪癖:原实现不 revokeObjectURL。
  }

  readFile(ev) {
    if (!(this.view.File && this.view.FileReader && this.view.FileList && this.view.Blob)) {
      this.chatService.chat(null, 2, "The File API isn't supported in this browser!", "Recorder");
      return;
    }
    if (this.replayTimeout) {
      this.stopRendering();
    }
    this.startedReplay = true;
    this.menu.close();
    this.$("#chatroom").hide();
    this.$("#message-hud").hide();
    const file = ev.target.files[0];
    const fileName = file && file.name ? file.name.toLowerCase() : "";
    if (!fileName.endsWith(".astr.io")) {
      this.chatService.chat(null, 2, "Invalid file!", "Recorder");
      this.startedReplay = false;
      return;
    }
    this.gameConnection.disconnect();
    this.gameConnection.resetData();
    this.leaderboard.clear();
    this.leaderboard.div.innerText = "Replay: ON";
    const fileReader = new FileReader();
    fileReader.onload = e => {
      // 怪癖:仅当 result 为 object(ArrayBuffer)时继续,文本文件静默返回。
      if (typeof e.target.result !== "object") {
        return;
      }
      this.chatService.chat(null, 2, "Started the replay!", "Recorder");
      const buf = new this.ByteReader(e.target.result);
      const version = buf.uint8();
      if (version !== 2 && version !== 3) {
        this.chatService.chat(null, 2, "Unsupported recording format! Re-record with latest version.", "Recorder");
        this.startedReplay = false;
        return;
      }
      const minutes = buf.uint8();
      const seconds = buf.uint8();
      const left = buf.uint16();
      const top = buf.uint16();
      const right = buf.uint16();
      const bottom = buf.uint16();
      const tag = buf.string16();
      const nick = buf.string16();
      const skin = buf.string16();
      const skin2 = buf.string16();
      if (version >= 3) {
        buf.uint8(); // eatAnimation 标志,读取后丢弃(原实现如此)
        this.gameConnection.ejectSpeed = buf.uint8();
      }
      this.oldSkin = this.menuForm.skin;
      this.oldSkin2 = this.menuForm.skin2;
      this.newSkin = skin;
      this.newSkin2 = skin2;
      this.menuForm.tag = tag;
      this.menuForm.nick = nick;
      this.menuForm.skin = skin;
      this.menuForm.skin2 = skin2;
      this.worldBounds.update(left, top, right, bottom);
      this.camera.x = (left + right) / 2;
      this.camera.y = (top + bottom) / 2;
      this.totalDuration = (minutes * 60 + parseInt(seconds)) * 1000; // 怪癖:parseInt 无 radix
      this.currentTime = 0;
      this.playbackSpeed = 1;
      this.isPaused = false;
      this.freeCam = false;
      this.replaySpectateMode = "top";
      this.replayHasMouse = false;
      this.camera.isSpectating = true;
      this.camera.targetViewport = 0.06;
      if (this.divManager) {
        // 原实现为 `typeof bc !== "undefined" && bc && bc.hideHud === "on"`,
        // 依赖注入后保留对注入对象的等价判断。
        const hideHud = this.settingsPanel && this.settingsPanel.hideHud === "on";
        this.divManager.style.display = hideHud ? "none" : "flex";
      }
      this.updateSpeedDisplay();
      this.updateTimeDisplay();
      this.updateTimeline();
      this.enableFreeCam();
      this.setReplaySpectateMode("top");
      if (this.divTimeline) {
        this.divTimeline.oninput = ev2 => {
          const pct = parseFloat(ev2.target.value);
          this.seekTo(pct / 100 * this.totalDuration);
        };
      }
      this.replayBuffer = buf;
      this.replayDataExhausted = false; // 新文件,清上个回放的耗尽标志
      this.packetDataStart = buf.length;
      this.buildReplayIndex();
      this.world.cells.clear();
      this.world.myCells.clear();
      this.world.sortedCells = [];
      // 预载:直读到首个 (250|50|252) 关键帧之后的首个带 delta 的包为止。
      this.replayPreloading = true;
      let sawKeyframe = false;
      while (!this.replayBuffer.end) {
        let packet = null;
        try {
          packet = this.readNextReplayPacket();
        } catch (err) {
          console.warn("[Replay] preload packet error:", err);
          break;
        }
        if (!packet) {
          break;
        }
        if (packet.opcode === 250 || packet.opcode === 50 || packet.opcode === 252) {
          sawKeyframe = true;
        }
        if (packet.opcode !== null) {
          this.processReplayPacket(packet.opcode);
        }
        this.replayBuffer.length = packet.packetEnd;
        this.currentTime += packet.delta;
        if (sawKeyframe && packet.delta > 0) {
          break;
        }
      }
      this.replayPreloading = false;
      this.updateTimeDisplay();
      this.updateTimeline();
      this.replayClockMs = this.currentTime;
      this.startReplayLoop();
      if (this.divReplay) {
        this.divReplay.value = "";
      }
    };
    fileReader.readAsArrayBuffer(file);
  }

  // 兼容垫片:外部旧调用点直接转发到 startReplayLoop。
  playNextPacket() {
    this.startReplayLoop();
  }

  startReplayLoop() {
    if (this.replayRaf || this.isPaused || !this.replayBuffer) {
      return;
    }
    // 底部操作栏:任何触摸/滑动唤醒弹出,2s 无操作自动收缩
    this.doc.addEventListener("pointerdown", this.hudWakeBound, { passive: true });
    this.doc.addEventListener("pointermove", this.hudWakeBound, { passive: true });
    this.showReplayHud();
    this.replayLastFrameAt = performance.now();
    const frame = timestamp => {
      if (this.isPaused || !this.replayBuffer || !this.startedReplay) {
        this.replayRaf = null;
        return;
      }
      const deltaMs = Math.min(50, timestamp - this.replayLastFrameAt); // 单帧最多推进 50ms
      this.replayLastFrameAt = timestamp;
      this.replayClockMs += deltaMs * this.playbackSpeed;
      if (this.replayClockMs < this.currentTime) {
        this.replayClockMs = this.currentTime;
      }
      try {
        this.advanceReplayTo(this.replayClockMs);
        this.updateReplaySpectatePoint();
      } catch (err) {
        console.error("[Replay] frame playback error, stopping:", err);
        this.world.cells.clear();
        this.world.myCells.clear();
        this.world.sortedCells = [];
        this.stopRendering();
        this.replayRaf = null;
        return;
      }
      this.updateTimeDisplay();
      this.updateTimeline();
      if (this.replayBuffer.end || this.replayDataExhausted) {
        this.isPaused = true;
        this.currentTime = this.totalDuration;
        this.replayClockMs = this.totalDuration;
        this.updateTimeDisplay();
        this.updateTimeline();
        this.replayRaf = null;
        // 播放结束:操作栏自动弹出(暂停态不会被收缩定时器藏起)
        this.showReplayHud();
        return;
      }
      this.replayRaf = this.view.requestAnimationFrame(frame);
    };
    this.replayRaf = this.view.requestAnimationFrame(frame);
  }

  stopReplayLoop() {
    if (!this.replayRaf) {
      return;
    }
    this.view.cancelAnimationFrame(this.replayRaf);
    this.replayRaf = null;
  }

  advanceReplayTo(targetMs) {
    if (!this.replayBuffer) {
      return;
    }
    const capped = Math.min(targetMs, this.totalDuration || targetMs);
    let processed = 0;
    while (!this.replayBuffer.end && this.currentTime <= capped && processed < 4096) {
      const rewindTo = this.replayBuffer.length;
      const packet = this.readNextReplayPacket();
      if (!packet) {
        // 真读到底:数据耗尽
        this.replayDataExhausted = true;
        break;
      }
      const nextTime = this.currentTime + packet.delta;
      if (nextTime > capped) {
        this.replayBuffer.length = rewindTo;
        // capped 已封顶 totalDuration 仍容不下下一包 → 数据实际耗尽
        // (header 时长按整秒写入,常小于真实数据尾,否则此处永久回退死锁:
        //  end 永不为真,播放"结束"永不触发,操作栏永不弹出)
        if (this.totalDuration > 0 && capped >= this.totalDuration) {
          this.replayDataExhausted = true;
        }
        break;
      }
      if (packet.opcode !== null) {
        // 怪癖:常速播放时跳过关键帧(252)不应用,避免整帧重建;预载/seek 时应用。
        if (packet.opcode !== 252 || this.replayPreloading || this.replaySeeking) {
          this.processReplayPacket(packet.opcode);
        }
      }
      this.replayBuffer.length = packet.packetEnd;
      this.currentTime = nextTime;
      processed++;
    }
  }

  processReplayPacket(opcode) {
    const buf = this.replayBuffer;
    switch (opcode) {
      case 30:
        this.packetRouter.teamUpdate(buf);
        break;
      case 40:
        this.world.cells.clear();
        this.world.myCells.clear();
        break;
      case 50:
        this.packetRouter.worldUpdate(buf);
        break;
      case 60:
        this.packetRouter.borderUpdate(buf);
        break;
      case 90:
        this.packetRouter.getLeaderboard(buf);
        break;
      case 100:
        buf.uint16();
        buf.uint16();
        this.camera.autoZoomViewport = buf.float();
        this.camera.isSpectating = true;
        break;
      case 120:
        this.menuForm._tab = buf.uint8();
        break;
      case 130:
        this.packetRouter.teamLeaderboard(buf);
        break;
      case 200:
        this.menuForm.tab = buf.uint8();
        break;
      case 250: {
        const count = buf.uint16();
        for (let i = 0; i < count; i++) {
          const id = buf.uint32();
          const x = buf.uint16();
          const y = buf.uint16();
          const radius = buf.uint16();
          const tab = buf.uint8();
          const r = buf.uint8();
          const g = buf.uint8();
          const b = buf.uint8();
          const nick = buf.string16();
          const skin = buf.string16();
          let cell = this.world.getCell(id);
          if (!cell) {
            cell = this.world.addCell(id, x, y, radius);
          }
          cell.isMine = true;
          cell.tab = tab;
          cell.setColor(r, g, b);
          cell.nick = nick || this.menuForm.nick || "astr.io";
          cell.skin = skin || this.menuForm.skin || "";
          if (!nick && this.menuForm.tag !== "" && this.settingsPanel.teamTags === "on") {
            // \u200B 为零宽空格,原样保留。
            cell.nick = "[" + this.menuForm.tag + "] \u200B" + this.menuForm.nick;
          }
          this.world.myCells.set(id, cell);
        }
        break;
      }
      case 251:
        this.replayMouseX = buf.uint16();
        this.replayMouseY = buf.uint16();
        this.replayHasMouse = true;
        break;
      case 252:
        this.applyKeyframeState(buf);
        break;
    }
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.stopReplayLoop();
      // 暂停时操作栏保持弹出(收缩定时器回调会跳过暂停态)
      this.showReplayHud();
      return;
    }
    this.replayClockMs = this.currentTime;
    this.startReplayLoop();
  }

  /** 回放镜头缩放:targetViewport 缓动跟随(viewport 向 target 收敛)。 */
  zoomIn() {
    if (!this.camera) {
      return;
    }
    this.camera.targetViewport = Math.max(0.02, this.camera.targetViewport * 0.8);
  }

  zoomOut() {
    if (!this.camera) {
      return;
    }
    this.camera.targetViewport = Math.min(2, this.camera.targetViewport / 0.8);
  }

  /** 显示底部操作栏并重新计时 2s 自动收缩(暂停态不收缩)。 */
  showReplayHud() {
    if (this.divManager) {
      this.divManager.classList.remove("hud-hidden");
    }
    if (this.hudHideTimer) {
      clearTimeout(this.hudHideTimer);
    }
    this.hudHideTimer = setTimeout(() => {
      this.hudHideTimer = null;
      if (this.startedReplay && !this.isPaused && this.divManager) {
        this.divManager.classList.add("hud-hidden");
      }
    }, 2000);
  }

  stopHudAutoHide() {
    if (this.hudHideTimer) {
      clearTimeout(this.hudHideTimer);
      this.hudHideTimer = null;
    }
    this.doc.removeEventListener("pointerdown", this.hudWakeBound);
    this.doc.removeEventListener("pointermove", this.hudWakeBound);
    if (this.divManager) {
      this.divManager.classList.remove("hud-hidden");
    }
  }

  setSpeed(speed) {
    this.playbackSpeed = speed;
    this.replayLastFrameAt = performance.now();
    this.updateSpeedDisplay();
  }

  seekTo(targetMs) {
    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
    this.stopReplayLoop();
    if (!this.replayBuffer) {
      return;
    }
    this.replayDataExhausted = false; // 新的数据窗口,清耗尽标志
    this.world.cells.clear();
    this.world.myCells.clear();
    this.world.sortedCells = [];
    this.replayHasMouse = false;
    this.replayMouseX = 0;
    this.replayMouseY = 0;
    let seekPos = this.packetDataStart;
    let seekTime = 0;
    if (this.replayIndex && this.replayIndex.length) {
      for (let i = 0; i < this.replayIndex.length; i++) {
        const entry = this.replayIndex[i];
        if (entry.time <= targetMs) {
          seekPos = entry.pos;
          seekTime = entry.time;
        } else {
          break;
        }
      }
    }
    this.replayBuffer.length = seekPos;
    this.currentTime = seekTime;
    this.replaySeeking = true;
    try {
      while (!this.replayBuffer.end && this.currentTime < targetMs) {
        try {
          const packet = this.readNextReplayPacket();
          if (!packet) {
            break;
          }
          if (packet.opcode !== null) {
            this.processReplayPacket(packet.opcode);
          }
          this.replayBuffer.length = packet.packetEnd;
          this.currentTime += packet.delta;
        } catch (err) {
          break;
        }
      }
    } finally {
      this.replaySeeking = false;
    }
    this.updateTimeDisplay();
    this.updateTimeline();
    this.replayClockMs = this.currentTime;
    this.updateReplaySpectatePoint();
    if (!this.isPaused && !this.replayBuffer.end) {
      this.startReplayLoop();
    }
  }

  restart() {
    if (this.replayTimeout) {
      clearTimeout(this.replayTimeout);
      this.replayTimeout = null;
    }
    this.stopReplayLoop();
    if (!this.replayBuffer) {
      return;
    }
    this.world.cells.clear();
    this.world.myCells.clear();
    this.world.sortedCells = [];
    if (this.packetDataStart !== undefined) {
      this.isPaused = false;
      this.menuForm.skin = this.newSkin;
      this.menuForm.skin2 = this.newSkin2;
      this.seekTo(0);
    }
  }

  stopReplay() {
    this.stopRendering();
  }

  enableFreeCam() {
    this._onReplayClick = ev => {
      if (!this.startedReplay) {
        return;
      }
      const worldX = (ev.clientX - this.view.innerWidth / 2) / this.camera.viewport + this.camera.x;
      const worldY = (ev.clientY - this.view.innerHeight / 2) / this.camera.viewport + this.camera.y;
      const point = this.clampReplayPointToBorder(worldX, worldY);
      this.camera.spectatePoint.x = point.x;
      this.camera.spectatePoint.y = point.y;
      this.setReplaySpectateMode("mouse");
    };
    this.doc.getElementById("canvas").addEventListener("click", this._onReplayClick);
  }

  disableFreeCam() {
    if (this._onReplayClick) {
      this.doc.getElementById("canvas").removeEventListener("click", this._onReplayClick);
      this._onReplayClick = null;
    }
    this.freeCam = false;
  }

  setReplaySpectateMode(mode) {
    if (!this.startedReplay) {
      return;
    }
    if (mode === "top") {
      this.replaySpectateMode = "top";
      this.freeCam = false;
      this.camera.centerLock = false;
      this.camera.freeSpectate = false;
      this.targeting.target1.turnedOn = false;
      this.targeting.target2.turnedOn = false;
      this.targetingHud.topViewport();
      this.updateReplaySpectatePoint();
      return;
    }
    if (mode === "mouse") {
      this.replaySpectateMode = "mouse";
      this.freeCam = true;
      this.camera.centerLock = false;
      this.camera.freeSpectate = true;
      this.targeting.target1.turnedOn = false;
      this.targeting.target2.turnedOn = false;
      this.targetingHud.mouseViewport();
      this.updateReplaySpectatePoint();
      return;
    }
    if (mode === "target") {
      this.replaySpectateMode = "target";
      this.freeCam = true;
      this.camera.centerLock = false;
      this.camera.freeSpectate = true;
      this.targetingHud.targetMode();
      this.updateReplaySpectatePoint();
    }
  }

  updateReplaySpectatePoint() {
    if (!this.startedReplay || !this.camera.isSpectating) {
      return;
    }
    if (this.camera.centerLock) {
      return;
    }
    if (this.targeting.isTurnedOn) {
      this.replaySpectateMode = "target";
      this.targeting.update();
      if (Number.isFinite(this.targeting.center.x) && Number.isFinite(this.targeting.center.y)) {
        this.camera.spectatePoint.x = this.targeting.center.x;
        this.camera.spectatePoint.y = this.targeting.center.y;
      }
      return;
    }
    if (this.replaySpectateMode === "target") {
      this.replaySpectateMode = "mouse";
      this.camera.freeSpectate = true;
      this.targetingHud.mouseViewport();
    }
    if (this.replaySpectateMode === "mouse" || this.camera.freeSpectate) {
      // 怪癖:自由视角锚点用"当前真实鼠标位"(bg.x/y),而非录制回放的
      // replayMouseX/replayMouseY(后者只录不读)。
      const worldX = (this.mouse.x - this.view.innerWidth / 2) / this.camera.viewport + this.camera.x;
      const worldY = (this.mouse.y - this.view.innerHeight / 2) / this.camera.viewport + this.camera.y;
      const point = this.clampReplayPointToBorder(worldX, worldY);
      this.camera.spectatePoint.x = point.x;
      this.camera.spectatePoint.y = point.y;
      return;
    }
    // top 模式:跟随最大的非食物/病毒/弹射/幽灵细胞。
    let biggest = null;
    for (const cell of this.world.cells.values()) {
      if (!cell || cell.isFood || cell.isVirus || cell.isEjected || cell.isGhost) {
        continue;
      }
      if (!biggest || cell.radius > biggest.radius) {
        biggest = cell;
      }
    }
    if (biggest) {
      this.camera.spectatePoint.x = biggest.x;
      this.camera.spectatePoint.y = biggest.y;
    } else {
      this.camera.spectatePoint.x = this.worldBounds.center.x;
      this.camera.spectatePoint.y = this.worldBounds.center.y;
    }
  }

  clampReplayPointToBorder(x, y) {
    const minX = Math.min(this.worldBounds.left, this.worldBounds.right);
    const maxX = Math.max(this.worldBounds.left, this.worldBounds.right);
    const minY = Math.min(this.worldBounds.top, this.worldBounds.bottom);
    const maxY = Math.max(this.worldBounds.top, this.worldBounds.bottom);
    const clampedX = Math.min(maxX, Math.max(minX, x));
    const clampedY = Math.min(maxY, Math.max(minY, y));
    return { x: clampedX, y: clampedY };
  }

  updateTimeline() {
    if (!this.divTimeline) {
      return;
    }
    const pct = this.totalDuration > 0 ? this.currentTime / this.totalDuration * 100 : 0;
    this.divTimeline.value = Math.min(pct, 100);
  }

  updateTimeDisplay() {
    if (!this.divTimeDisplay) {
      return;
    }
    this.divTimeDisplay.textContent = this.formatTime(this.currentTime) + " / " + this.formatTime(this.totalDuration);
  }

  updateSpeedDisplay() {
    if (!this.divSpeedDisplay) {
      return;
    }
    this.divSpeedDisplay.textContent = this.playbackSpeed + "x";
  }

  readNextReplayPacket() {
    if (!this.replayBuffer || this.replayBuffer.end) {
      return null;
    }
    if (this.replayBuffer.length + 4 > this.replayBuffer.maxLength) {
      throw new Error("Replay packet header overflow");
    }
    const delta = this.replayBuffer.uint16();
    const size = this.replayBuffer.uint16();
    const packetStart = this.replayBuffer.length;
    const packetEnd = packetStart + size;
    if (packetEnd > this.replayBuffer.maxLength) {
      throw new Error("Replay packet size overflow");
    }
    if (size < 1) {
      // 纯计时包:无操作码。
      return { delta, packetSize: size, packetStart, packetEnd, opcode: null };
    }
    const opcode = this.replayBuffer.uint8();
    return { delta, packetSize: size, packetStart, packetEnd, opcode };
  }

  buildReplayIndex() {
    this.replayIndex = [{ time: 0, pos: this.packetDataStart }];
    if (!this.replayBuffer) {
      return;
    }
    const savedLength = this.replayBuffer.length;
    this.replayBuffer.length = this.packetDataStart;
    let time = 0;
    while (!this.replayBuffer.end) {
      let packet = null;
      try {
        packet = this.readNextReplayPacket();
      } catch (err) {
        break;
      }
      if (!packet) {
        break;
      }
      if (packet.opcode === 252) {
        // 索引项回退 4 字节,指向关键帧包头起点。
        this.replayIndex.push({ time, pos: packet.packetStart - 4 });
      }
      this.replayBuffer.length = packet.packetEnd;
      time += packet.delta;
    }
    this.replayBuffer.length = savedLength;
  }

  applyKeyframeState(buf) {
    this.app.time = Date.now();
    this.world.cells.clear();
    this.world.myCells.clear();
    this.world.sortedCells = [];
    const count = buf.uint16();
    for (let i = 0; i < count; i++) {
      const id = buf.uint32();
      const x = buf.uint16();
      const y = buf.uint16();
      const radius = buf.uint16();
      const flags = buf.uint16();
      const cell = this.world.addCell(id, x, y, radius);
      if (flags & 1) {
        cell.isVirus = true;
      }
      if (flags & 2) {
        cell.isEjected = true;
      }
      if (flags & 4) {
        cell.isFood = true;
      }
      if (flags & 8) {
        const r = buf.uint8();
        const g = buf.uint8();
        const b = buf.uint8();
        cell.setColor(r, g, b);
      }
      if (flags & 16) {
        cell.nick = buf.string16();
      }
      if (flags & 32) {
        const skinKind = buf.uint8();
        const skinBody = buf.string16();
        if (skinKind === 1) {
          cell.skin = "https://i.imgur.com/" + skinBody + ".jpg";
        } else if (skinKind === 2) {
          cell.skin = "https://i.hizliresim.com/" + skinBody;
        } else if (skinKind === 0 && skinBody) {
          cell.skin = skinBody;
        }
      }
      if (flags & 64) {
        cell.isMine = true;
        this.world.myCells.set(id, cell);
      }
      if (flags & 128) {
        cell.isFriend = true;
        cell.friendID = buf.uint32();
      }
      if (flags & 256) {
        cell.tab = buf.uint8();
      }
      if (flags & 512) {
        cell.isGhost = true;
      }
      if (flags & 1024) {
        cell.isCrowned = true;
      }
      if (flags & 2048) {
        const colorKind = buf.uint8();
        if (colorKind === 1) {
          cell.nameColor = "rainbow";
        } else if (colorKind === 3) {
          cell.nameColor = "rainbow-gradient";
        } else {
          const r = buf.uint8();
          const g = buf.uint8();
          const b = buf.uint8();
          cell.nameColor = "rgb(" + r + "," + g + "," + b + ")";
        }
      }
      cell.updateTime = this.app.time;
    }
  }
}
