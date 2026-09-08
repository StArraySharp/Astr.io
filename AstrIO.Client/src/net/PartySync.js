/**
 * PartySync — 聊天/战队频道上行协议包发送器(原 `c3` 单例)。
 *
 * 职责:通过 ChatSocket(c0,JSON/二进制聊天服)发送战队同步、
 * 身份、观战、指挥官点等上行包。所有包为明文二进制(不经 Codec),
 * 由 PacketWriter(bW)拼帧后 sendPacket 直接发送。
 *
 * 协议(opcode → 字段):
 *   0/1  spectator     : [0, int8 1, int8 flag, str16 #tag, str16 #tag2]
 *                        (flag=0 分支不发 str;见下方怪癖)
 *   0/8  rgbMode       : [0, 8, u8 isRGB]
 *   0/16 biggest       : [0, 16, u16 x, u16 y](观战焦点)
 *   0/32 ping          : [0, 32](App 60s 定时器)
 *   1    nick          : str16 昵称(有 tag 时 "[tag] \u200B nick")
 *   2    color         : u8 r, u8 g, u8 b
 *   4    skin          : str16 皮肤 URL
 *   8    room          : str16 region+mode+tag+pin, str16 region+mode
 *   16   positionMass  : u16 x, u16 y, u32 mass
 *   32   aliveStatus   : u8 isAlive
 *   64   chat          : u8 频道, u8 未知标志(arg3||0), str16 文本
 *   128  commander     : u16 x, u16 y(指挥官标记点)
 *   162  sendToken     : str16 登录 token(截断 4096)
 *
 * 怪癖(与原实现对齐):
 *  - init() 由 ChatSocket.onopen 触发,强行置 ChatSocket.connected = true,
 *    随后依次 sendToken/nick/skin/room/color/aliveStatus。
 *  - spectator(flag=false) 分支缺少 writer.init():包内容会拼接在上一个
 *    包的残留缓冲之后(原样保留的 bug)。
 *  - room():tag 为空串时 pin 置空(注意:与 Keyboard.room 不同,
 *    这里不处理 "\u200B" 零宽空格)。
 *  - sendToken() 原实现有 typeof bq === "undefined" 运行时守护
 *    (声明顺序问题),此处以 auth 真值检查等价替代。
 */

export default class PartySync {
  /**
   * @param {Object} systems
   * @param {Object} systems.ChatSocket — connected/send(原 c0)
   * @param {Object} systems.writer — 全局二进制写入器 bV 共享实例(原 bW,未列入映射表)
   * @param {Object} systems.AuthSession — loggedIn/token(原 bq,未列入映射表)
   * @param {Object} systems.MenuForm — nick/tag/pin/colorObject/skin/x/y/mass/isAlive/isRGB/region/mode(原 bF)
   * @param {Object} systems.Mouse — canvasX/canvasY(原 bg)
   * @param {Object} systems.Canvas — commanderPoints.add(原 c4)
   * @param {Object} systems.App — time(原 c5)
   * @param {Object} systems.SpectatorTab — spectatePoint.x/y(原 bJ)
   * @param {Object} systems.ChatService — isSpectator(原 c1)
   * @param {Function} systems.jQuery — 原 a7($,读 #tag/#tag2 输入框)
   */
  constructor(systems) {
    this.chatSocket = systems.ChatSocket;
    this.writer = systems.writer;
    this.auth = systems.AuthSession;
    this.menuForm = systems.MenuForm;
    this.mouse = systems.Mouse;
    this.canvas = systems.Canvas;
    this.app = systems.App;
    this.spectatorTab = systems.SpectatorTab;
    this.chatService = systems.ChatService;
    this.jQuery = systems.jQuery;
  }

  /** ChatSocket onopen 入口:宣告连接并同步全套身份信息。 */
  init() {
    this.chatSocket.connected = true;
    this.sendToken();
    this.nick();
    this.skin();
    this.room();
    this.color();
    this.aliveStatus();
  }

  /** 直接经 ChatSocket 发送 writer 缓冲(明文,不编码)。 */
  sendPacket(writer) {
    this.chatSocket.send(writer.buffer);
  }

  /** 162 号:登录 token(与 Keyboard.sendToken 同构,走聊天服)。 */
  sendToken() {
    if (!this.chatSocket.connected) {
      return;
    }
    if (!this.auth || !this.auth.loggedIn || !this.auth.token) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(162);
    this.writer.writeString16(String(this.auth.token).substring(0, 4096));
    this.sendPacket(this.writer);
  }

  /** 1 号:昵称(有 tag 时前缀 "[tag] \u200B")。 */
  nick() {
    if (!this.chatSocket.connected) {
      return;
    }
    let nick = this.menuForm.nick;
    if (this.menuForm.tag !== '') {
      nick = '[' + this.menuForm.tag + '] \u200B' + this.menuForm.nick;
    }
    this.writer.init();
    this.writer.writeUInt8(1);
    this.writer.writeString16(nick);
    this.sendPacket(this.writer);
  }

  /** 2 号:颜色 RGB。 */
  color() {
    if (!this.chatSocket.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(2);
    this.writer.writeUInt8(this.menuForm.colorObject.r);
    this.writer.writeUInt8(this.menuForm.colorObject.g);
    this.writer.writeUInt8(this.menuForm.colorObject.b);
    this.sendPacket(this.writer);
  }

  /** 4 号:皮肤 URL(原始,不解析 imgur/hizliresim)。 */
  skin() {
    if (!this.chatSocket.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(4);
    this.writer.writeString16(this.menuForm.skin || '');
    this.sendPacket(this.writer);
  }

  /** 8 号:房间(tag 模式):tag+pin 与 region+mode 两个串。 */
  room() {
    if (!this.chatSocket.connected) {
      return;
    }
    let { region, mode, tag, pin } = this.menuForm;
    if (tag === '') {
      pin = '';
    }
    this.writer.init();
    this.writer.writeUInt8(8);
    this.writer.writeString16(region + mode + tag + pin);
    this.writer.writeString16(region + mode);
    this.sendPacket(this.writer);
  }

  /** 16 号:自己位置与质量(供战队 HUD)。 */
  positionMass() {
    if (!this.chatSocket.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(16);
    this.writer.writeUInt16(this.menuForm.x | 0);
    this.writer.writeUInt16(this.menuForm.y | 0);
    this.writer.writeUInt32(this.menuForm.mass);
    this.sendPacket(this.writer);
  }

  /** 32 号:存活状态。 */
  aliveStatus() {
    if (!this.chatSocket.connected) {
      return;
    }
    const flag = this.menuForm.isAlive ? 1 : 0;
    this.writer.init();
    this.writer.writeUInt8(32);
    this.writer.writeUInt8(flag);
    this.sendPacket(this.writer);
  }

  /** 64 号:聊天消息(频道,文本,未知标志)。 */
  chat(channel, text, flag) {
    if (!this.chatSocket.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(64);
    this.writer.writeUInt8(channel);
    this.writer.writeUInt8(flag || 0);
    this.writer.writeString16(text);
    this.sendPacket(this.writer);
  }

  /** 128 号:指挥官标记点(发送 + 本地画点)。 */
  commander() {
    if (!this.chatSocket.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(128);
    this.writer.writeUInt16(this.mouse.canvasX | 0);
    this.writer.writeUInt16(this.mouse.canvasY | 0);
    this.sendPacket(this.writer);
    this.canvas.commanderPoints.add({
      x: this.mouse.canvasX | 0,
      y: this.mouse.canvasY | 0,
      time: this.app.time,
    });
  }

  /**
   * 0/1 号:观战 tag 订阅(读取 #tag/#tag2 输入框)。
   * 怪癖:flag=false 分支不调用 writer.init(),包拼接在上个包残留之后。
   */
  spectator(flag) {
    if (!this.chatSocket.connected || !this.chatService.isSpectator) {
      return;
    }
    if (flag) {
      const tag = this.jQuery('#tag').val();
      const tag2 = this.jQuery('#tag2').val();
      this.writer.init();
      this.writer.writeUInt8(0);
      this.writer.writeInt8(1);
      this.writer.writeInt8(1);
      this.writer.writeString16(tag);
      this.writer.writeString16(tag2);
      this.sendPacket(this.writer);
    } else {
      // 原样保留:此处缺少 writer.init()。
      this.writer.writeUInt8(0);
      this.writer.writeInt8(1);
      this.writer.writeInt8(0);
      this.sendPacket(this.writer);
    }
  }

  /** 0/8 号:RGB 昵称模式开关。 */
  rgbMode() {
    if (!this.chatSocket.connected) {
      return;
    }
    const flag = this.menuForm.isRGB ? 1 : 0;
    this.writer.init();
    this.writer.writeUInt8(0);
    this.writer.writeUInt8(8);
    this.writer.writeUInt8(flag);
    this.sendPacket(this.writer);
  }

  /** 0/16 号:观战焦点(最大细胞坐标)。 */
  biggest() {
    if (!this.chatSocket.connected) {
      return;
    }
    const x = this.spectatorTab.spectatePoint.x;
    const y = this.spectatorTab.spectatePoint.y;
    this.writer.init();
    this.writer.writeUInt8(0);
    this.writer.writeUInt8(16);
    this.writer.writeUInt16(x | 0);
    this.writer.writeUInt16(y | 0);
    this.sendPacket(this.writer);
  }

  /** 0/32 号:保活 ping(App 60s 定时器)。 */
  ping() {
    if (!this.chatSocket.connected) {
      return;
    }
    this.writer.init();
    this.writer.writeUInt8(0);
    this.writer.writeUInt8(32);
    this.sendPacket(this.writer);
  }
}
