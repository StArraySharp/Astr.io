/**
 * AdminPanel — 游戏协议下行包路由器 + HUD 计时器(原 `bY` 单例,映射表名
 * admin/AdminPanel;24KB)。名字源于其携带的内置 bot 名单(实际从未被读取,
 * 见 constructor)。
 *
 * 职责:接收 GameConnection 的 WebSocket 二进制帧 → 解种子帧 → Codec 解码
 * → 按 opcode 分发到各子系统;并管理 #timer-hud 的出生/比赛/私服计时器。
 *
 * 协议(opcode → 处理器 → 帧字段推断):
 *   34  spawnTimer      : u16 剩余出生秒数(<=0 时解锁 Play 按钮)
 *   35  matchDuration   : u16 比赛剩余秒数(0 → matchEnd,赛后显示 Winner)
 *   40  clearCells      : 无字段;清空世界全部细胞
 *   30  teamUpdate      : u8 新增数{u32 id,u16 x,u16 y,u32 mass,u8 flags
 *                         [1: str16 昵称][2: u8 皮肤源+str16 皮肤ID]}
 *                         u8 更新数{u32 id,u16 x,u16 y,u32 mass}
 *                         u8 移除数{u32 id}
 *   90  getLeaderboard  : u8 条数{str16 昵称,str16 tag,u32 质量,u8 纪录位,
 *                         u8 名字颜色模式[1: r,g,b][2: rainbow][3: gradient]}
 *   200 forcedSwitcher  : u8 强制切换到的多盒页签
 *   50  worldUpdate     : u16 新增数{u32 id,u16 x,u16 y,u16 半径,u16 flags,
 *                         flags 位域见 worldUpdate()}
 *                         u16 更新数{u32 id,u16 x,u16 y,u16 半径,u8 幽灵位}
 *                         u16 吃掉数{u32 被吃id, u32 捕食者id}
 *                         u16 移除数{u32 id}
 *   60  borderUpdate    : u8 圆形标志 [圆形: u16 cx,cy,r | 矩形: u16 l,t,r,b]
 *                         u8 喷射速度, u8 吃动画, u8 保留
 *   80  pong            : 无字段;latency = now - lastPingAt(>60s 丢弃)
 *   100 spectateData    : u16 x, u16 y, f32 观战缩放
 *   110 dualMode        : 无字段;置 GameConnection.dualMode
 *   120 tabChange       : u8 推荐页签(仅 autoSwitch="on" 时写入 MenuForm._tab)
 *   130 teamLeaderboard : u8 条数{str16 "tag ~质量", u16 战队人数}
 *                         u16 在线玩家, u16 观战数, u32 全服总质量
 *   160 hCaptcha 状态    : u8 子类型(1=验证通过,清除验证码 UI;否则弹验证码)
 *   123 playerList      : u16 条数{u32 id,str16 昵称,str16 tag,str16 皮肤1,str16 皮肤2}
 *   124 playerAdd       : 同上单条
 *   125 playerRemove    : u32 id
 *   170 版本不同步       : 显示 #version-sync-overlay 或 location.reload()
 *   171 playerMeta      : str16 昵称, u8 flags[1: 皇冠][2: u8 颜色模式[1:rainbow
 *                         3:gradient 其余: r,g,b]]
 *   172 announcement    : u8 类型[0: str16 系统消息 | 1: str16 横幅
 *                         2: u32 热身倒计时 | 3: u32 私服比赛时长(+可选 u32 检查点)]
 *   173 管理员标志       : u8(===1 → GameConnection.isAdmin)
 *   174 betterDoubleSplits: u8(===1 → 开启)
 *   175 服务器认证状态    : u8 位域[1/2/4] → AuthSession.onServerAuthStatus
 *   176 tournamentData  : u8 类型[0: 检查点横幅 | 1: 最终结果]
 *   222 auth 挑战        : u8 子类型(0:忽略), u8 算法, u32 种子
 *                         → Codec.challenge → Keyboard.authResponse + sendToken
 *
 * 种子帧:未 seed 时首字节 253 → DataView(data, 1, 32) 32 字节种子 →
 * Codec.initFromSeed。之后所有帧经 Codec.decode。
 *
 * 怪癖(与原实现对齐):
 *  - 150 号包触发上行握手:收到即回发 room/nick/skin(Keyboard)。
 *  - 颜色模式枚举不一致:getLeaderboard 用 1=rgb/2=rainbow/3=gradient,
 *    worldUpdate/playerMeta 用 1=rainbow/3=gradient/其余(含 2)=rgb。
 *  - worldUpdate 中 1024(皇冠)取昵称用 split("\u200B").pop(),
 *    playerMeta 中用 split("\u200B")[1]。
 *  - worldUpdate 里 64(自己的细胞)会把昵称改写为本地 MenuForm 昵称
 *    (tag 开启时 "[tag] \u200B nick"),即昵称由客户端本地渲染。
 *  - tabChange 写的是 MenuForm._tab(带下划线),与 tab 是两个属性。
 *  - 回放录制中(bH.started)会把原始帧 pushBytes 进录制流
 *    (仅对带 reader 参数可复用的解析器,即大多数)。
 *  - 吃掉列表读取顺序为 [被吃者id, 捕食者id],eatCell(捕食者, 被吃者)。
 *  - nicks/tags 内置名单为死数据:全 bundle 无任何读取。
 */

export default class AdminPanel {
  /**
   * @param {Object} systems
   * @param {Object} systems.BinaryReader — 二进制读取器构造器(原 bU,未列入映射表)
   * @param {Object} systems.Codec — WASM 编解码器 { _seeded, ready, decode, initFromSeed, challenge }
   * @param {Object} systems.GameConnection — isAdmin/betterDoubleSplits/dualMode/ejectSpeed/eatAnimation/lastPingAt/latency(原 bX)
   * @param {Object} systems.Keyboard — room/nick/skin/authResponse/sendToken/challengeAnswer(原 bZ)
   * @param {Object} systems.ReplayPlayer — started/pushBytes(原 bH)
   * @param {Object} systems.MenuForm — tab/_tab/nick/tag/isAlive/movementPaused(原 bF)
   * @param {Object} systems.World — cells/myCells/playerMeta/addCell/getCell/eatCell/removeCell/newTeamPlayer/getTeamPlayer/removeTeamPlayer(原 bD)
   * @param {Object} systems.PlayerList — 玩家档案容器{list: Map}(原 bC 全局,类体内直引)
   * @param {Object} systems.Leaderboard — clear/add/update(原 br)
   * @param {Object} systems.TeamLeaderboard — clear/add/update(原 bs)
   * @param {Object} systems.TeamList — update()(原 bu)
   * @param {Object} systems.TournamentBanner — showCheckpoint/showFinalResults(原 bx,未列入映射表)
   * @param {Object} systems.Chat — warmupCountdown/serverTimer/system/banner(原 bm)
   * @param {Object} systems.Recorder — macroFeed(bool)(原 bi)
   * @param {Object} systems.SettingsPanel — autoSwitch/teamTags(原 bc)
   * @param {Object} systems.Grid — circle/update(原 bI)
   * @param {Object} systems.SpectatorTab — spectatePoint/autoZoomViewport/serverZoomOverride/serverZoomTime/centerLock/isSpectating(原 bJ)
   * @param {Object} systems.Canvas — commanderPoints(原 c4)
   * @param {Object} systems.App — time(原 c5)
   * @param {Object} systems.AuthSession — onServerAuthStatus(原 bq,未列入映射表)
   * @param {Function} systems.SeedRandom — 种子随机数构造器(原 Math.seedrandom,seedrandom 库)
   * @param {string[]} systems.palette — 排行榜昵称调色板(原 ag,38 色)
   * @param {Window} systems.view — 原 a6
   * @param {Document} systems.document — 原 a8
   * @param {Function} systems.jQuery — 原 a7($)
   */
  constructor(systems) {
    this.BinaryReader = systems.BinaryReader;
    this.codec = systems.Codec;
    this.connection = systems.GameConnection;
    this.keyboard = systems.Keyboard;
    this.replayPlayer = systems.ReplayPlayer;
    this.menuForm = systems.MenuForm;
    this.world = systems.World;
    // 原 bC 容器。注意:不得命名为 playerList —— 会遮蔽同名原型方法 playerList()
    //(123 号包处理器,原 bundle 中 bY 直引全局 bC,无此冲突;重写引入字段名时踩中)。
    this.players = systems.PlayerList;
    this.leaderboard = systems.Leaderboard;
    this.teamLb = systems.TeamLeaderboard; // 字段改名避免遮蔽 teamLeaderboard() 解析方法(原 bY 体内直接用全局 bs)
    this.teamList = systems.TeamList;
    this.tournamentBanner = systems.TournamentBanner;
    this.chat = systems.Chat;
    this.recorder = systems.Recorder;
    this.settings = systems.SettingsPanel;
    this.grid = systems.Grid;
    this.spectatorTab = systems.SpectatorTab;
    this.canvas = systems.Canvas;
    this.app = systems.App;
    this.auth = systems.AuthSession;
    this.SeedRandom = systems.SeedRandom;
    this.palette = systems.palette;
    this.view = systems.view;
    this.document = systems.document;
    this.jQuery = systems.jQuery;

    this.reader = new this.BinaryReader();
    this.matchEnd = false;
    this.serverTimerInterval = null;
    this.serverTimerEndsAt = 0;
    this.nextCheckpointEndsAt = 0;
    // 内置 bot 名单/内置 tag 名单 — 死数据,原实现从未读取(疑似遗留)。
    this.nicks = ['Champ', 'Titan', 'Doe', 'Darwin', 'Chief', 'John', 'Clement', 'Warden', 'Astra'];
    this.tags = ['F\u200AaZe', '+\u200A18', 'M\u200AWTB', 'T\u200ADW', ':\u200Av', '1\u200A337', 'a\u200Agar', 'U\u200ASA', 'F\u200ABI'];
  }

  /** WebSocket onmessage 入口(GameConnection 调用)。 */
  getBuffer(ev) {
    const data = ev.data;
    if (!this.codec._seeded) {
      const firstByte = new Uint8Array(data)[0];
      if (firstByte === 253) {
        // 种子帧:[253][32 字节种子]
        const seedView = new DataView(data, 1, 32);
        this.codec.initFromSeed(seedView);
        this.codec._seeded = true;
        return;
      }
    }
    const payload = this.codec.ready && this.codec._seeded ? this.codec.decode(data) : data;
    this.parse(payload);
  }

  /** 帧分发:首字节 opcode。 */
  parse(buffer) {
    this.reader.init(buffer);
    const opcode = this.reader.uint8();
    switch (opcode) {
      case 150:
        this.data();
        break;
      case 34:
        this.spawnTimer();
        break;
      case 35:
        this.matchDuration();
        break;
      case 40:
        this.clearCells();
        break;
      case 30:
        this.teamUpdate();
        break;
      case 90:
        this.getLeaderboard();
        break;
      case 200:
        this.forcedSwitcher();
        break;
      case 50:
        this.worldUpdate();
        break;
      case 60:
        this.borderUpdate();
        break;
      case 80:
        this.pong();
        break;
      case 100:
        this.spectateData();
        break;
      case 110:
        this.dualMode();
        break;
      case 120:
        this.tabChange();
        break;
      case 130:
        this.teamLeaderboard();
        break;
      case 160: {
        const subtype = this.reader.uint8();
        if (subtype === 1) {
          const status = this.document.getElementById('h-captcha-status');
          if (status) {
            status.textContent = '';
          }
          const widget = this.document.getElementById('h-captcha-widget');
          if (widget) {
            widget.innerHTML = '';
          }
          this.jQuery('#challenge-overlay').removeClass('visible');
        } else {
          this.botChallenge();
        }
        break;
      }
      case 123:
        this.playerList();
        break;
      case 124:
        this.playerAdd();
        break;
      case 125:
        this.playerRemove();
        break;
      case 170:
        {
          // 版本不同步:显示遮罩;无遮罩元素则直接刷新页面。
          const overlay = this.document.getElementById('version-sync-overlay');
          if (overlay) {
            overlay.style.display = 'flex';
          } else {
            this.view.location.reload();
          }
          break;
        }
      case 171:
        this.playerMeta();
        break;
      case 172:
        this.announcement();
        break;
      case 173:
        this.connection.isAdmin = this.reader.uint8() === 1;
        break;
      case 174:
        this.connection.betterDoubleSplits = this.reader.uint8() === 1;
        break;
      case 175: {
        const flags = this.reader.uint8();
        this.auth.onServerAuthStatus(!!(flags & 1), !!(flags & 2), !!(flags & 4));
        break;
      }
      case 176:
        this.tournamentData();
        break;
      case 222: {
        const subtype = this.reader.uint8();
        if (!subtype) {
          break;
        }
        const algorithm = this.reader.uint8();
        const seed = this.reader.uint32();
        const response = this.codec.challenge(algorithm, seed);
        this.keyboard.authResponse(response);
        this.keyboard.sendToken();
        break;
      }
    }
  }

  /** 150 号:连接握手完成 → 回发 room/nick/skin 上行包。 */
  data() {
    this.keyboard.room();
    this.keyboard.nick();
    this.keyboard.skin();
  }

  /** 200 号:强制多盒页签切换。 */
  forcedSwitcher(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    this.menuForm.tab = r.uint8();
  }

  /** 40 号:清空世界。 */
  clearCells(reader) {
    this.pushReplayBytes(reader);
    this.world.cells.clear();
    this.world.myCells.clear();
  }

  /** 回放录制中则把原始帧写入录制流。 */
  pushReplayBytes(reader) {
    if (!reader && this.replayPlayer.started) {
      this.replayPlayer.pushBytes(this.reader.dataview.buffer);
    }
  }

  /** 由昵称哈希出确定的调色板颜色(seedrandom + int32 取模)。 */
  getColor(nick) {
    const rng = new this.SeedRandom(nick);
    let value = rng.int32();
    value = ((value % this.palette.length) + this.palette.length) % this.palette.length;
    return this.palette[value];
  }

  /** 90 号:世界排行榜。 */
  getLeaderboard(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    this.leaderboard.clear();
    const count = r.uint8();
    for (let i = 0; i < count; ++i) {
      const nick = r.string16();
      const tag = r.string16();
      const mass = r.uint32();
      const isRecord = r.uint8() === 1;
      const colorMode = r.uint8();
      let nameColor = null;
      if (colorMode === 2) {
        nameColor = 'rainbow';
      } else if (colorMode === 3) {
        nameColor = 'rainbow-gradient';
      } else if (colorMode === 1) {
        const red = r.uint8();
        const green = r.uint8();
        const blue = r.uint8();
        nameColor = 'rgb(' + red + ',' + green + ',' + blue + ')';
      }
      this.leaderboard.add(
        nick, tag, mass,
        nick ? this.getColor(nick) : '',
        i + 1, false, false, false, '',
        isRecord, nameColor
      );
    }
    this.leaderboard.update();
  }

  /** 50 号:世界状态增量更新。 */
  worldUpdate(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    this.app.time = Date.now();
    // —— 新增/补全细胞 ——
    let count = r.uint16();
    for (let i = 0; i < count; ++i) {
      const id = r.uint32();
      const x = r.uint16();
      const y = r.uint16();
      const radius = r.uint16();
      const cell = this.world.addCell(id, x, y, radius);
      const flags = r.uint16();
      // flags 位域:1 病毒 / 2 喷出物 / 4 食物 / 8 颜色(r,g,b) / 16 昵称 /
      // 32 皮肤(provider,id) / 64 自己的 / 128 好友(+u32 id) / 256 页签 /
      // 512 幽灵 / 1024 皇冠 / 2048 名字颜色
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
        const red = r.uint8();
        const green = r.uint8();
        const blue = r.uint8();
        cell.setColor(red, green, blue);
      }
      if (flags & 16) {
        cell.nick = r.string16();
      }
      if (flags & 32) {
        const provider = r.uint8();
        const skinId = r.string16();
        if (provider === 1) {
          cell.skin = 'https://i.imgur.com/' + skinId + '.jpg';
        } else if (provider === 2) {
          cell.skin = 'https://i.hizliresim.com/' + skinId;
        } else if (provider === 0 && skinId) {
          cell.skin = skinId;
        }
      }
      if (flags & 64) {
        // 自己的细胞:昵称在客户端本地覆盖渲染。
        cell.nick = this.menuForm.nick || 'astr.io';
        if (this.menuForm.tag !== '' && this.settings.teamTags === 'on') {
          cell.nick = '[' + this.menuForm.tag + '] \u200B' + this.menuForm.nick;
        }
        this.world.myCells.set(id, cell);
        cell.isMine = true;
      }
      if (flags & 128) {
        cell.isFriend = true;
        cell.friendID = r.uint32();
      }
      if (flags & 256) {
        cell.tab = r.uint8();
      }
      if (flags & 512) {
        cell.isGhost = true;
      }
      if (flags & 1024) {
        cell.isCrowned = true;
        if (cell.nick) {
          const baseNick = cell.nick.includes('\u200B') ? cell.nick.split('\u200B').pop() : cell.nick;
          const meta = this.world.playerMeta.get(baseNick) || {};
          meta.crowned = true;
          meta.isMine = cell.isMine;
          this.world.playerMeta.set(baseNick, meta);
        }
      }
      if (flags & 2048) {
        const colorMode = r.uint8();
        if (colorMode === 1) {
          cell.nameColor = 'rainbow';
        } else if (colorMode === 3) {
          cell.nameColor = 'rainbow-gradient';
        } else {
          const red = r.uint8();
          const green = r.uint8();
          const blue = r.uint8();
          cell.nameColor = 'rgb(' + red + ',' + green + ',' + blue + ')';
        }
        if (cell.nick) {
          const baseNick = cell.nick.includes('\u200B') ? cell.nick.split('\u200B').pop() : cell.nick;
          const meta = this.world.playerMeta.get(baseNick) || {};
          meta.nameColor = cell.nameColor;
          meta.isMine = cell.isMine;
          this.world.playerMeta.set(baseNick, meta);
        }
      }
      cell.updateTime = this.app.time;
    }
    // —— 位置/半径更新 ——
    count = r.uint16();
    for (let i = 0; i < count; ++i) {
      const id = r.uint32();
      const cell = this.world.getCell(id);
      const x = r.uint16();
      const y = r.uint16();
      const radius = r.uint16();
      const ghostFlag = r.uint8();
      if (!cell && this.replayPlayer.startedReplay) {
        continue;
      }
      if (cell) {
        cell.update(x, y, radius);
        if (ghostFlag) {
          cell.isGhost = true;
        }
      }
    }
    // —— 吃掉事件(先读被吃者 id,再读捕食者 id)——
    count = r.uint16();
    for (let i = 0; i < count; ++i) {
      const preyId = r.uint32();
      const predatorId = r.uint32();
      this.world.eatCell(predatorId, preyId);
    }
    // —— 移除 ——
    count = r.uint16();
    for (let i = 0; i < count; ++i) {
      const id = r.uint32();
      this.world.removeCell(id);
    }
  }

  /** 30 号:战队成员(teamPlayers)同步。 */
  teamUpdate(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    // —— 新增 ——
    const addCount = r.uint8();
    for (let i = 0; i < addCount; ++i) {
      const id = r.uint32();
      const player = this.world.newTeamPlayer(id);
      player.x = r.uint16();
      player.y = r.uint16();
      player.mass = r.uint32();
      const flags = r.uint8();
      // flags:1 昵称 / 2 皮肤(u8 provider + str16 id)
      if (flags & 1) {
        player.nick = r.string16();
      }
      if (flags & 2) {
        const provider = r.uint8();
        const skinId = r.string16();
        if (provider === 1) {
          player.skin = 'https://i.imgur.com/' + skinId + '.jpg';
        } else if (provider === 2) {
          player.skin = 'https://i.hizliresim.com/' + skinId;
        } else if (provider === 0 && skinId) {
          player.skin = skinId;
        }
      }
    }
    // —— 更新 ——
    const updateCount = r.uint8();
    for (let i = 0; i < updateCount; ++i) {
      const id = r.uint32();
      const player = this.world.getTeamPlayer(id);
      player.x = r.uint16();
      player.y = r.uint16();
      player.mass = r.uint32();
    }
    // —— 移除 ——
    const removeCount = r.uint8();
    for (let i = 0; i < removeCount; ++i) {
      const id = r.uint32();
      this.world.removeTeamPlayer(id);
    }
    this.teamList.update();
  }

  /** 80 号:延迟测量(配对 Keyboard 80 号 ping)。 */
  pong() {
    const now = Date.now();
    if (!this.connection.lastPingAt) {
      return;
    }
    const delta = now - this.connection.lastPingAt;
    if (delta < 0 || delta > 60000) {
      return;
    }
    this.connection.latency = delta;
    this.connection.lastPingAt = 0;
  }

  /** 100 号:观战镜头数据。 */
  spectateData(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    if (!this.menuForm.movementPaused && !this.spectatorTab.centerLock) {
      this.spectatorTab.spectatePoint.x = r.uint16();
      this.spectatorTab.spectatePoint.y = r.uint16();
      this.spectatorTab.autoZoomViewport = r.float();
      this.spectatorTab.serverZoomOverride = this.menuForm.isAlive;
      this.spectatorTab.serverZoomTime = this.app.time;
    } else {
      r.uint16();
      r.uint16();
      r.float();
    }
  }

  /** 60 号:世界边界 + 物理参数。 */
  borderUpdate(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    this.grid.circle = r.uint8();
    if (this.grid.circle) {
      const cx = r.uint16();
      const cy = r.uint16();
      const radius = r.uint16();
      this.grid.update(cx - radius, cy - radius, cx + radius, cy + radius);
    } else {
      const left = r.uint16();
      const top = r.uint16();
      const right = r.uint16();
      const bottom = r.uint16();
      this.grid.update(left, top, right, bottom);
    }
    this.connection.ejectSpeed = r.uint8();
    this.connection.eatAnimation = !!r.uint8();
    r.uint8();
  }

  /** 120 号:服务器推荐页签(怪癖:写入 _tab 而非 tab)。 */
  tabChange(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    if (this.settings.autoSwitch === 'on') {
      this.menuForm._tab = r.uint8();
    }
  }

  /** 34 号:出生倒计时(#timer-hud / #button-play)。 */
  spawnTimer() {
    this.jQuery('#button-play').attr('disabled', true);
    const seconds = this.reader.uint16();
    this.jQuery('#timer-hud').removeClass('timer-private-server');
    if (this.jQuery('#timer-hud').not(':visible')) {
      this.jQuery('#timer-hud').show();
    }
    this.jQuery('#timer-hud').text('Spawn In: ' + this.formatClock(seconds));
    this.updateTimerHudPlacement();
    if (seconds <= 0) {
      this.jQuery('#button-play').attr('disabled', false);
      this.jQuery('#timer-hud').hide();
    }
  }

  /** 35 号:比赛时长;0 时置 matchEnd(由 teamLeaderboard 显示胜者)。 */
  matchDuration() {
    this.matchTimer = this.reader.uint16();
    this.jQuery('#timer-hud').removeClass('timer-private-server');
    if (this.jQuery('#timer-hud').not(':visible')) {
      this.jQuery('#timer-hud').show();
    }
    if (this.matchTimer !== 0) {
      this.jQuery('#timer-hud').text('Time remaining: ' + this.formatClock(this.matchTimer));
    } else {
      this.matchEnd = true;
    }
    this.updateTimerHudPlacement();
  }

  /** 130 号:战队排行榜("tag ~质量" 混合串 + 全服统计)。 */
  teamLeaderboard(reader) {
    const r = reader || this.reader;
    this.pushReplayBytes(reader);
    this.teamLb.clear();
    const count = r.uint8();
    for (let i = 0; i < count; ++i) {
      const entry = r.string16();
      const teamSize = r.uint16();
      const [tag, massText] = entry.split(' ~');
      if (!tag || !massText) {
        continue;
      }
      const mass = parseInt(massText);
      if (isNaN(mass)) {
        continue;
      }
      const color = this.getColor(tag);
      this.teamLb.add(tag, mass, teamSize, i + 1, color);
    }
    const onlinePlayers = r.uint16();
    const spectators = r.uint16();
    const totalMass = r.uint32();
    this.teamLb.update(onlinePlayers, spectators, totalMass);
    if (this.matchEnd) {
      const winner = this.teamLb.list.values().next().value;
      if (winner) {
        this.jQuery('#timer-hud').empty()
          .append(this.jQuery('<span>').text('Winner: '))
          .append(this.jQuery('<span>').css({
            'font-size': '110%',
            'font-weight': 'bold',
            color: '#1E88E5',
          }).text(winner.tag))
          .append(this.jQuery('<br>'))
          .append(this.jQuery('<span>').css({
            color: '#B0BEC5',
            'font-size': '90%',
          }).text('with ' + winner.mass + ' mass'));
      }
    }
  }

  /** 123 号:全量玩家档案列表(私服面板)。 */
  playerList() {
    const count = this.reader.uint16();
    for (let i = 0; i < count; ++i) {
      const player = {
        id: this.reader.uint32(),
        nick: this.reader.string16(),
        tag: this.reader.string16(),
        skin1: this.reader.string16(),
        skin2: this.reader.string16(),
      };
      this.players.list.set(player.id, player);
    }
  }

  /** 124 号:单个玩家档案新增。 */
  playerAdd() {
    const player = {
      id: this.reader.uint32(),
      nick: this.reader.string16(),
      tag: this.reader.string16(),
      skin1: this.reader.string16(),
      skin2: this.reader.string16(),
    };
    this.players.list.set(player.id, player);
  }

  /** 125 号:玩家档案移除。 */
  playerRemove() {
    const id = this.reader.uint32();
    this.players.list.get(id);
    this.players.list.delete(id);
  }

  /** 110 号:双模式标志。 */
  dualMode() {
    this.connection.dualMode = true;
  }

  /** 160 号(非通过):弹出 hCaptcha 人机验证。 */
  botChallenge() {
    const overlay = this.jQuery('#challenge-overlay');
    overlay.addClass('visible');
    this.recorder.macroFeed(false);
    const status = this.document.getElementById('h-captcha-status');
    if (!this.document.getElementById('h-captcha-widget')) {
      return;
    }
    const sitekey = '511ea864-1bb8-4cc8-911c-c138eb68a9f0';
    if (status) {
      status.textContent = 'Loading captcha...';
    }
    // 反检测还原:若验证码脚本替换过 Function.prototype.call,恢复原始引用。
    if (this.view.__fc) {
      Function.prototype.call = this.view.__fc;
    }
    const renderCaptcha = () => {
      setTimeout(() => {
        const widget = this.document.getElementById('h-captcha-widget');
        if (status) {
          status.textContent = '';
        }
        if (typeof this.view._hcWidgetId !== 'undefined') {
          try {
            hcaptcha.remove(this.view._hcWidgetId);
          } catch (err) {}
          this.view._hcWidgetId = undefined;
        }
        widget.innerHTML = '';
        try {
          this.view._hcWidgetId = hcaptcha.render('h-captcha-widget', {
            sitekey: sitekey,
            callback: token => {
              this.keyboard.challengeAnswer(token);
              if (status) {
                status.textContent = 'Verifying...';
              }
            },
            'expired-callback': () => {
              renderCaptcha();
            },
            'error-callback': () => {
              if (status) {
                status.textContent = 'Captcha error. Retrying...';
              }
              setTimeout(renderCaptcha, 3000);
            },
          });
        } catch (err) {
          if (status) {
            status.textContent = 'Captcha render failed: ' + err.message;
          }
        }
      }, 150);
    };
    if (!this.document.getElementById('hcaptcha-api')) {
      const script = this.document.createElement('script');
      script.id = 'hcaptcha-api';
      script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
      script.onload = () => {
        renderCaptcha();
      };
      script.onerror = () => {
        if (status) {
          status.textContent = 'Could not load captcha script.';
        }
      };
      this.document.head.appendChild(script);
    } else if (this.view.hcaptcha) {
      renderCaptcha();
    } else {
      let waited = 0;
      const poll = setInterval(() => {
        waited += 200;
        if (this.view.hcaptcha) {
          clearInterval(poll);
          renderCaptcha();
        } else if (waited >= 15000) {
          clearInterval(poll);
          if (status) {
            status.textContent = 'Could not load captcha script.';
          }
        }
      }, 200);
    }
  }

  /** 171 号:玩家元数据(皇冠/名字颜色)补丁,同步到已有细胞。 */
  playerMeta() {
    const nick = this.reader.string16();
    const flags = this.reader.uint8();
    const crowned = (flags & 1) !== 0;
    let nameColor = null;
    if (flags & 2) {
      const colorMode = this.reader.uint8();
      if (colorMode === 1) {
        nameColor = 'rainbow';
      } else if (colorMode === 3) {
        nameColor = 'rainbow-gradient';
      } else {
        const red = this.reader.uint8();
        const green = this.reader.uint8();
        const blue = this.reader.uint8();
        nameColor = 'rgb(' + red + ',' + green + ',' + blue + ')';
      }
    }
    const meta = this.world.playerMeta.get(nick) || {};
    meta.crowned = crowned;
    if (nameColor !== null) {
      meta.nameColor = nameColor;
    }
    this.world.playerMeta.set(nick, meta);
    for (const cell of this.world.cells.values()) {
      let baseNick = cell.nick;
      if (baseNick.includes('\u200B')) {
        baseNick = baseNick.split('\u200B')[1];
      }
      if (baseNick === nick || cell.nick === nick) {
        cell.isCrowned = crowned;
        cell.nameColor = nameColor;
      }
    }
  }

  /** 172 号:公告(系统消息/横幅/热身倒计时/私服比赛计时)。 */
  announcement() {
    const type = this.reader.uint8();
    if (type === 2) {
      const seconds = this.reader.uint32();
      this.chat.warmupCountdown(seconds);
      return;
    }
    if (type === 3) {
      const duration = this.reader.uint32();
      let checkpoint = null;
      // 可选字段:剩余 >= 4 字节时读检查点间隔;0xFFFFFFFF 表示无。
      if (this.reader.maxLength - this.reader.length >= 4) {
        const value = this.reader.uint32();
        if (value !== 4294967295) {
          checkpoint = value;
        }
      }
      this.chat.serverTimer(0);
      this.startServerTimer(duration, checkpoint);
      return;
    }
    const text = this.reader.string16();
    if (type === 0) {
      this.chat.system(text);
    } else if (type === 1) {
      this.chat.banner(text);
    }
  }

  /** 176 号:锦标赛检查点横幅 / 最终结果。 */
  tournamentData() {
    const kind = this.reader.uint8();
    if (kind === 0) {
      const num = this.reader.uint8();
      const total = this.reader.uint8();
      const entryCount = this.reader.uint8();
      const entries = [];
      for (let i = 0; i < entryCount; i++) {
        entries.push({
          position: this.reader.uint8(),
          name: this.reader.string16(),
          roundPoints: this.reader.uint16(),
          totalPoints: this.reader.uint16(),
          mass: this.reader.uint32(),
        });
      }
      this.tournamentBanner.showCheckpoint({
        num: num,
        total: total,
        entries: entries,
      });
    } else if (kind === 1) {
      const mode = this.reader.uint8();
      const entryCount = this.reader.uint8();
      const checkpointCount = this.reader.uint8();
      const entries = [];
      for (let i = 0; i < entryCount; i++) {
        const entry = {
          position: this.reader.uint8(),
          name: this.reader.string16(),
          totalPoints: this.reader.uint16(),
          checkpoints: [],
        };
        for (let j = 0; j < checkpointCount; j++) {
          entry.checkpoints.push(this.reader.uint8());
        }
        entries.push(entry);
      }
      this.tournamentBanner.showFinalResults({
        mode: mode,
        entries: entries,
        checkpointCount: checkpointCount,
      });
      this.stopServerTimer();
    }
  }

  /** 私服比赛计时器(带可选的检查点倒计时)。 */
  startServerTimer(durationSec, checkpointSec) {
    this.stopServerTimer(false);
    if (!Number.isFinite(durationSec) || durationSec <= 0) {
      this.jQuery('#timer-hud').hide();
      return;
    }
    this.jQuery('#timer-hud').addClass('timer-private-server');
    const now = Date.now();
    this.serverTimerEndsAt = now + durationSec * 1000;
    if (Number.isFinite(checkpointSec) && checkpointSec > 0) {
      this.nextCheckpointEndsAt = now + checkpointSec * 1000;
    } else {
      this.nextCheckpointEndsAt = 0;
    }
    this.renderServerTimer();
    this.serverTimerInterval = setInterval(() => this.renderServerTimer(), 250);
  }

  stopServerTimer(hideHud = true) {
    if (this.serverTimerInterval) {
      clearInterval(this.serverTimerInterval);
      this.serverTimerInterval = null;
    }
    this.serverTimerEndsAt = 0;
    this.nextCheckpointEndsAt = 0;
    this.jQuery('#timer-hud').removeClass('timer-private-server');
    if (hideHud) {
      this.jQuery('#timer-hud').hide();
    }
  }

  renderServerTimer() {
    if (!this.serverTimerEndsAt) {
      return;
    }
    const now = Date.now();
    const remaining = Math.max(0, Math.ceil((this.serverTimerEndsAt - now) / 1000));
    let checkpointClock = '--:--:--';
    if (this.nextCheckpointEndsAt > 0) {
      const checkpointRemaining = Math.max(0, Math.ceil((this.nextCheckpointEndsAt - now) / 1000));
      checkpointClock = this.formatClock(checkpointRemaining);
      if (checkpointRemaining <= 0) {
        this.nextCheckpointEndsAt = 0;
      }
    }
    this.jQuery('#timer-hud').text('Time remaining: ' + this.formatClock(remaining) + ' Next checkpoint: ' + checkpointClock).show();
    this.updateTimerHudPlacement();
    if (remaining <= 0) {
      this.stopServerTimer();
    }
  }

  /** 秒 → "HH:MM:SS"。 */
  formatClock(seconds) {
    const total = Math.max(0, seconds | 0);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  /** #timer-hud 摆位:观战时避让目标 HUD。 */
  updateTimerHudPlacement() {
    const hud = this.document.getElementById('timer-hud');
    if (!hud) {
      return;
    }
    if (this.view.getComputedStyle(hud).display === 'none') {
      return;
    }
    let top = 8;
    if (!this.menuForm.isAlive && this.spectatorTab.isSpectating) {
      const targetingHud = this.document.getElementById('targeting-hud');
      if (targetingHud && this.view.getComputedStyle(targetingHud).display !== 'none') {
        const rect = targetingHud.getBoundingClientRect();
        top = Math.round(rect.bottom + 8);
      } else {
        top = 56;
      }
      hud.classList.remove('timer-player');
      hud.classList.add('timer-spectator');
    } else {
      hud.classList.remove('timer-spectator');
      hud.classList.add('timer-player');
    }
    hud.style.top = top + 'px';
  }
}
