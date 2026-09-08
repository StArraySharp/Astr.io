/**
 * GameConnection — 游戏服 WebSocket 连接(原 `bX` 单例)。
 *
 * 行为:
 *  - 连接目标推导(按优先级):
 *      1. 服务器串包含 "localhost"/"127.0.0.1" → `ws://<服务器串>`;
 *      2. 以 "private-" 开头 → 取页面 host(或一次性 privateHost)连
 *         `ws(s)://<host>/ws/<服务器串>`;无 host 时回落 `ws://localhost:<port>`
 *         (port 为 "private-<port>" 中拆出的第二段);
 *      3. 普通房间名 → 目标 = regionHosts[region] || 页面 host;
 *         region 默认 "europe"(null → 页面 host,如 astrio.io),
 *         "america" → "na.astrio.io";路径 `/ws/<房间名>`;
 *      4. 页面本身是本地打开(host 为 null)且房间名命中 localPorts 表
 *         (domination:3000 … extreme:3050)→ `ws://localhost:<端口>`;
 *      5. 否则放弃连接(静默 return)。
 *  - 连接前等待 Codec(WASM 编解码器)就绪;未定义/已就绪则直连,
 *    否则挂到 _readyPromise,失败时打开主菜单并弹出错误信息。
 *  - 服务器串先过白名单校验 /^[a-zA-Z0-9.\-:]+$/,不合法直接放弃。
 *  - localhost 模式模拟 20ms 往返延迟:发送延迟 fakeDelay>>1 = 10ms,
 *    收包延迟 fakeDelay>>1 = 10ms(本地调试用)。
 *
 * 怪癖(与原实现对齐):
 *  - 原代码在挂事件处理器前有 `ws !== 0 && ws !== ""` 的混淆器噪声判断
 *    (恒真),此处直接挂接。
 *  - resetData() 不清 dualMode/ejectSpeed,重连后沿用上次服务器的值。
 *  - onclose 时打开主菜单(bB.open);connected 只在 open 路径
 *    (由 Keyboard.init 置位)后为真。
 */

export default class GameConnection {
  /**
   * @param {Object} systems
   * @param {Object} systems.Codec — WASM 编解码器 { ready, _readyPromise, _seeded, reset }(net/Codec)
   * @param {Object} systems.Menu — open()(原 bB)
   * @param {Object} systems.Chat — alert(title, text)(原 bm)
   * @param {Object} systems.Grid — reset()(原 bI)
   * @param {Object} systems.ReplayPlayer — divManager/startedReplay/stopRendering(原 bH)
   * @param {Object} systems.World — cells/myCells/teamPlayers(原 bD)
   * @param {Object} systems.PlayerList — list: Map(原 bC)
   * @param {Object} systems.MenuForm — isAlive(原 bF)
   * @param {Object} systems.TeamLeaderboard — clear()(原 bs)
   * @param {Object} systems.Keyboard — init()(原 bZ)
   * @param {Object} systems.AdminPanel — getBuffer(ev)(原 bY)
   * @param {Window} systems.view — 原 a6
   */
  constructor(systems) {
    this.codec = systems.Codec;
    this.menu = systems.Menu;
    this.chat = systems.Chat;
    this.grid = systems.Grid;
    this.replayPlayer = systems.ReplayPlayer;
    this.world = systems.World;
    this.playerList = systems.PlayerList;
    this.menuForm = systems.MenuForm;
    this.teamLeaderboard = systems.TeamLeaderboard;
    this.keyboard = systems.Keyboard;
    this.adminPanel = systems.AdminPanel;
    this.view = systems.view;
  }

  init() {
    this.ip = null;
    this.ws = null;
    this.connected = false;
    this.ejectSpeed = 80;
    this.lastPingAt = 0;
    this.latency = 0;
    this.localhost = false;
    this.fakeDelay = 20;
    this.packetCount = { in: 0, out: 0 };
    this.isAdmin = false;
    this.betterDoubleSplits = false;
    const loc = this.view.location;
    this.isSecure = loc.protocol === 'https:';
    // 页面在本地打开时 host 置 null(原版行为:走 localhost 端口表)。
    // 本地开发变体:__ASTRIO_LIVE_WS=1 时沿用原版线上地址(WebSocket 地址使用原版)。
    // 原版页面 origin 是裸域 astrio.io(bX.host = loc.host = "astrio.io"),
    // 实测裸域 RTT ~210ms,www 子域 ~600ms(Cloudflare 边缘/回源不同),必须用裸域。
    this.host = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1'
      ? (loc.search.includes('__ASTRIO_LIVE_WS') || window.__ASTRIO_LIVE_WS ? 'astrio.io' : null)
      : loc.host;
    // 本地开发端口表:房间名 → 端口。
    this.localPorts = {
      domination: 3000,
      megasplit: 3001,
      novirus: 3002,
      instamerge: 3003,
      ffa: 3004,
      extreme: 3050,
    };
    this.region = 'europe';
    this.regionHosts = {
      europe: null,
      america: 'na.astrio.io',
      // 亚洲服:本地 C# 服(AstrIO.Server,端口表与原版 localPorts 一致)
      // http 页面下强制 ws://(本地服无 TLS);port 由 _doConnect 的 localPorts 分支处理
      asia: 'localhost',
    };
    this.privateHost = null;
  }

  /**
   * 连接游戏服。等待 Codec 就绪后执行实际连接。
   * @param {string} serverArg 房间名 / 服务器串(Menu.mode)
   */
  connect(serverArg) {
    if (!serverArg) {
      return;
    }
    const proceed = () => this._doConnect(serverArg);
    // 原实现:typeof Codec === "undefined" 时直接连接(无编解码);DI 下等价于未注入。
    if (!this.codec) {
      proceed();
      return;
    }
    if (this.codec.ready) {
      proceed();
    } else {
      this.codec._readyPromise.then(proceed).catch(err => {
        this.menu.open();
        if (err && err.message) {
          this.chat.alert('', err.message);
        }
      });
    }
  }

  _doConnect(serverArg) {
    // 服务器串白名单:字母/数字/点/连字符/冒号。
    if (!/^[a-zA-Z0-9.\-:]+$/.test(serverArg)) {
      return;
    }
    this.disconnect();
    this.resetData();
    this.grid.reset();
    this.ip = serverArg;
    this.replayPlayer.divManager.style.display = 'none';
    this.replayPlayer.startedReplay = false;
    this.replayPlayer.stopRendering();
    if (serverArg.includes('localhost') || serverArg.includes('127.0.0.1')) {
      this.localhost = true;
      this.ws = new WebSocket('ws://' + serverArg);
    } else if (serverArg.startsWith('private-')) {
      const port = serverArg.split('-')[1];
      const host = this.privateHost || this.host;
      this.privateHost = null;
      if (host) {
        this.localhost = false;
        const scheme = this.isSecure ? 'wss' : 'ws';
        this.ws = new WebSocket(scheme + '://' + host + '/ws/' + serverArg);
      } else {
        this.localhost = true;
        this.ws = new WebSocket('ws://localhost:' + port);
      }
    } else {
      const target = this.regionHosts[this.region] || this.host;
      if (target) {
        this.localhost = false;
        // WebSocket 地址使用原版:原站是 https 页面 + wss 端点;
        // 本地 http 页面注入 __ASTRIO_LIVE_WS 时也强制 wss(http 下 ws:// 会 301 到 https)。
        // 亚洲服(region=asia → localhost)走本地 C# 服,始终 ws://(无 TLS)。
        const isAsia = this.region === 'asia' && target === 'localhost';
        const scheme = isAsia ? 'ws' : (this.view.__ASTRIO_LIVE_WS ? 'wss' : (this.isSecure ? 'wss' : 'ws'));
        const portPart = isAsia && this.localPorts[serverArg] ? ':' + this.localPorts[serverArg] : '';
        this.ws = new WebSocket(scheme + '://' + target + portPart + (isAsia ? '/' : '/ws/') + serverArg);
      } else if (this.localPorts[serverArg]) {
        this.localhost = true;
        this.ws = new WebSocket('ws://localhost:' + this.localPorts[serverArg]);
      } else {
        return;
      }
    }
    this.ws.binaryType = 'arraybuffer';
    // 原实现此处有恒真的混淆器噪声判断(ws !== 0 && ws !== ""),直接挂接。
    this.ws.onopen = () => this.onOpen();
    this.ws.onmessage = ev => this.onMessage(ev);
    this.ws.onclose = () => this.onClose();
    this.ws.onerror = () => this.onError();
  }

  disconnect() {
    this.connected = false;
    if (this.codec && this.codec.reset) {
      this.codec.reset();
    }
    if (this.ws) {
      try {
        this.ws.close(1000);
      } catch (err) {}
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
    }
    this.ws = null;
    this.ip = null;
    this.teamLeaderboard.clear();
    this.resetData();
  }

  resetData() {
    this.world.cells.clear();
    this.world.myCells.clear();
    this.world.teamPlayers.clear();
    this.playerList.list.clear();
    this.menuForm.isAlive = false;
    this.lastPingAt = 0;
    this.latency = 0;
    this.isAdmin = false;
    this.betterDoubleSplits = false;
  }

  /**
   * 发送二进制包。localhost 模式下延迟 fakeDelay>>1(10ms)发送,
   * 且发送时再次校验连接仍为 OPEN。
   * @param {ArrayBuffer} data 已(可选)经 Codec 编码的缓冲
   */
  send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.packetCount.out++;
    if (this.localhost) {
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(data);
        }
      }, this.fakeDelay >> 1);
    } else {
      this.ws.send(data);
    }
  }

  onOpen() {
    this.keyboard.init();
  }

  onMessage(ev) {
    this.packetCount.in++;
    if (this.localhost) {
      setTimeout(() => {
        this.adminPanel.getBuffer(ev);
      }, this.fakeDelay >> 1);
    } else {
      this.adminPanel.getBuffer(ev);
    }
  }

  onClose() {
    this.menu.open();
    this.connected = false;
  }

  onError() {
    this.connected = false;
  }
}
