/**
 * Keyboard — 游戏服上行包发送器(原 `bZ` 单例,映射表名 input/Keyboard)。
 *
 * 职责实为协议编码 + 发送(键盘/鼠标状态入口),所有方法先检查
 * GameConnection.connected。协议 opcode:
 *   mouse 60 / key 89 / spawn 30 / nick 10 / room 20(v4)/ skin 90 /
 *   split 50 / eject 40 / ping 80 / multiboxSwitch 100 / spectate 70 /
 *   challengeAnswer 161 / sendToken 162 / useLockedColor 163 / authResponse 222
 *
 * 怪癖(与原实现对齐):
 *  - init() 仅重置观战标志并强行置 connected = true。
 *  - mouse()/ping():窗口无焦点且已死(Canvas.hasFocus=false 且 MenuForm.isAlive=false)
 *    时不发送。
 *  - room():解构 region/mode 但未使用;tag 为空串或零宽空格("\u200B")时清空 pin;
 *    tag() 为空实现(保留)。
 *  - sendToken():原实现有 typeof bq === "undefined" 运行时守护(声明顺序问题),
 *    此处以 auth 依赖的真值检查等价替代;发送后附带 useLockedColor。
 *  - Codec 未就绪(未 seed)时明文发送。
 *  - challengeAnswer/sendToken 按 charCodeAt 逐字节写(>255 由 writer 决定截断行为)。
 */

export default class Keyboard {
  /**
   * @param {Object} systems
   * @param {Object} systems.SpectatorTab — 摄像机 x/y/viewport/freeSpectate/isSpectating(原 bJ)
   * @param {Object} systems.GameConnection — connected/send/lastPingAt(原 bX)
   * @param {Object} systems.writer — 全局二进制写入器 bV 共享实例(原 bW,未列入映射表)
   * @param {Object} systems.Codec — WASM 编解码器 { ready, _seeded, encode }(net/Codec)
   * @param {Object} systems.Canvas — hasFocus(原 c4)
   * @param {Object} systems.MenuForm — isAlive/tab/nick/skin/skin2/tag/pin(原 bF)
   * @param {Object} systems.Mouse — x/y(自由观战出生点,原 bg)
   * @param {Object} systems.ChatService — isSpectator(原 c1)
   * @param {Object} systems.Chat — alert()(原 bm)
   * @param {Object} systems.I18n — current.notif.cantPlay2Tag(原 ah)
   * @param {Object} systems.AuthSession — loggedIn/token/useLockedColor(原 bq,未列入映射表)
   * @param {Window} systems.view — 原 a6
   */
  constructor(systems) {
    this.spectatorTab = systems.SpectatorTab;
    this.connection = systems.GameConnection;
    this.writer = systems.writer;
    this.codec = systems.Codec;
    this.canvas = systems.Canvas;
    this.menuForm = systems.MenuForm;
    this.mouseState = systems.Mouse; // 原 bg 全局引用(改名避免遮蔽本类 mouse() 方法)
    this.chatService = systems.ChatService;
    this.chat = systems.Chat;
    this.i18n = systems.I18n;
    this.auth = systems.AuthSession;
    this.view = systems.view;
  }

  init() {
    this.spectatorTab.isSpectating = false;
    this.spectatorTab.freeSpectate = false;
    this.connection.connected = true;
  }

  /** 编码(Codec 就绪时)并通过 GameConnection 发送 writer 缓冲。 */
  sendPacket(writer) {
    let buffer = writer.buffer;
    if (this.codec.ready && this.codec._seeded) {
      buffer = this.codec.encode(buffer);
    }
    this.connection.send(buffer);
  }

  /** 60 号鼠标包:tab(缺省回落 MenuForm.tab)、世界坐标、frozen 标志。 */
  mouse(tab, x, y, frozen) {
    if (!this.connection.connected) {
      return;
    }
    if (!this.canvas.hasFocus && !this.menuForm.isAlive) {
      return;
    }
    if (x > 65535) {
      x = 65535;
    }
    if (x < 0) {
      x = 0;
    }
    if (y > 65535) {
      y = 65535;
    }
    if (y < 0) {
      y = 0;
    }
    this.writer.init();
    this.writer.writeUInt8(60);
    this.writer.writeUInt8(tab || this.menuForm.tab);
    this.writer.writeUInt16(x);
    this.writer.writeUInt16(y);
    this.writer.writeUInt8(frozen ? 1 : 0);
    this.sendPacket(this.writer);
  }

  /** 89 号按键包(键码)。 */
  key(code) {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(89);
    this.writer.writeUInt32(code);
    this.sendPacket(this.writer);
  }

  /** 30 号出生包:自由观战时以鼠标世界坐标为出生点。 */
  spawn() {
    if (!this.connection.connected) {
      return;
    }
    if (this.menuForm.isAlive) {
      return;
    }
    if (this.menuForm.bannerDisabled) {
      return;
    }
    if (this.chatService.isSpectator) {
      this.chat.alert('', this.i18n.current.notif.cantPlay2Tag);
      return;
    }
    this.spectatorTab.isSpectating = false;
    this.spectatorTab.targetViewport = 0.2;
    let x;
    let y;
    if (this.spectatorTab.freeSpectate) {
      x = (this.mouseState.x - this.view.innerWidth / 2) / this.spectatorTab.viewport + this.spectatorTab.x;
      y = (this.mouseState.y - this.view.innerHeight / 2) / this.spectatorTab.viewport + this.spectatorTab.y;
    } else {
      x = this.spectatorTab.x;
      y = this.spectatorTab.y;
    }
    this.writer.init();
    this.writer.writeUInt8(30);
    this.writer.writeUInt16(x);
    this.writer.writeUInt16(y);
    this.writer.writeUInt8(this.spectatorTab.freeSpectate ? 1 : 0);
    this.sendPacket(this.writer);
  }

  /** 10 号昵称包。 */
  nick() {
    if (!this.connection.connected) {
      return;
    }
    const nick = this.menuForm.nick;
    this.writer.init();
    this.writer.writeUInt8(10);
    this.writer.writeString16(nick);
    this.sendPacket(this.writer);
  }

  /** 20 号房间包(v4):tag + pin;无 tag 时 pin 置空,随后调用空 tag()。 */
  room() {
    if (!this.connection.connected) {
      return;
    }
    const { region, mode, tag, pin } = this.menuForm;
    const pinOut = tag === '' || tag === '\u200B' ? '' : pin; // 原:对 const pin 重新赋值(JS 严格模式必炸,此处以局部变量等效)
    this.writer.init();
    this.writer.writeUInt8(20);
    this.writer.writeUInt8(4);
    this.writer.writeString16(tag);
    this.writer.writeString16(pinOut);
    this.sendPacket(this.writer);
    this.tag(tag);
  }

  /** 空实现(原样保留)。 */
  tag(tag) {}

  /**
   * 90 号皮肤包:imgur 7 字符 ID → code 1;hizliresim 6 字符 ID.扩展名 → code 2;
   * 其他 URL 原样 → code 0。皮肤与皮肤2各一组。
   */
  skin() {
    if (!this.connection.connected) {
      return;
    }
    const parseSkin = url => {
      const result = { code: 0, url: url };
      const imgur = url.match(/https?:\/\/i\.imgur\.com\/([\w0-9]{7})\.(png|jpg|gif)/i);
      const hizli = url.match(/https?:\/\/i\.hizliresim\.com\/([\w0-9]{6})\.(png|jpg|gif)/i);
      if (imgur) {
        result.code = 1;
        result.url = imgur[1];
      } else if (hizli) {
        result.code = 2;
        result.url = hizli[1] + '.' + hizli[2];
      }
      return result;
    };
    const skin = parseSkin(this.menuForm.skin || '');
    const skin2 = parseSkin(this.menuForm.skin2 || '');
    this.writer.init();
    this.writer.writeUInt8(90);
    this.writer.writeUInt8(skin.code);
    this.writer.writeString16(skin.url);
    this.writer.writeUInt8(skin2.code);
    this.writer.writeString16(skin2.url);
    this.sendPacket(this.writer);
  }

  /**
   * 50 号分裂包。count = 分裂轮数(最终 2^count 片),缺省 1。
   * 服务器会在同一 tick 内连分 count 轮,所以一次发包就得到一条沿鼠标方向的直线。
   */
  split(tab, count) {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(50);
    this.writer.writeUInt8(tab || this.menuForm.tab);
    this.writer.writeUInt8((count || 1) & 0xff);
    this.sendPacket(this.writer);
  }

  /** 40 号喷射包。 */
  eject(tab) {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(40);
    this.writer.writeUInt8(tab || this.menuForm.tab);
    this.sendPacket(this.writer);
  }

  /** 80 号 ping 包(App 5s 定时器);记录 lastPingAt。 */
  ping() {
    if (!this.connection.connected) {
      return;
    }
    if (!this.canvas.hasFocus && !this.menuForm.isAlive) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(80);
    this.sendPacket(this.writer);
    this.connection.lastPingAt = Date.now();
  }

  /** 100 号多盒页签切换包。 */
  multiboxSwitch() {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(100);
    this.writer.writeUInt8(this.menuForm.tab);
    this.sendPacket(this.writer);
  }

  /** 70 号观战包(设置 freeSpectate)。 */
  spectate(flag) {
    if (!this.connection.connected) {
      return;
    }
    this.spectatorTab.freeSpectate = !!flag;
    this.writer.init();
    this.writer.writeUInt8(70);
    this.writer.writeUInt8(flag ? 1 : 0);
    this.sendPacket(this.writer);
  }

  /** 70 号观战包(翻转 freeSpectate)。 */
  freeSpectate() {
    if (!this.connection.connected) {
      return;
    }
    this.spectatorTab.freeSpectate = !this.spectatorTab.freeSpectate;
    this.writer.init();
    this.writer.writeUInt8(70);
    this.writer.writeUInt8(this.spectatorTab.freeSpectate ? 1 : 0);
    this.sendPacket(this.writer);
  }

  /** 161 号挑战应答:截断 8192 字符后逐 charCode 写入。 */
  challengeAnswer(answer) {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(161);
    const text = String(answer).substring(0, 8192);
    this.writer.writeUInt16(text.length);
    for (let i = 0; i < text.length; i++) {
      this.writer.writeUInt8(text.charCodeAt(i));
    }
    this.sendPacket(this.writer);
  }

  /** 222 号 auth 应答(原 bZ.authResponse,220104 行)。 */
  authResponse(value) {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(222);
    this.writer.writeUInt32(value);
    this.sendPacket(this.writer);
  }

  /** 162 号登录 token 包(截断 4096),随后附带 163 号 useLockedColor。 */
  sendToken() {
    if (!this.connection.connected) {
      return;
    }
    if (!this.auth || !this.auth.loggedIn || !this.auth.token) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(162);
    const token = String(this.auth.token).substring(0, 4096);
    this.writer.writeUInt16(token.length);
    for (let i = 0; i < token.length; i++) {
      this.writer.writeUInt8(token.charCodeAt(i));
    }
    this.sendPacket(this.writer);
    this.useLockedColor(this.auth.useLockedColor);
  }

  /** 163 号锁定颜色开关包。 */
  useLockedColor(flag) {
    if (!this.connection.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(163);
    this.writer.writeUInt8(flag ? 1 : 0);
    this.sendPacket(this.writer);
  }
}
