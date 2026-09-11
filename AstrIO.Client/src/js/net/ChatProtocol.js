/**
 * ChatProtocol — 聊天服二进制协议解析(原 `c2` 单例)。
 *
 * 消息格式:小端 DataView;首字节 opcode:
 *   1 update    增量玩家表(移除列表 + 玩家字段位标志)
 *   2 chat      聊天消息
 *   3 commander 指挥官标记点
 *   4 selfID    自身玩家 id
 *   5 prePlayers 全量玩家表(进场快照)
 *
 * 位标志(update,flags):
 *   &1  昵称(string16,"[tag]\u200Bnick" 零宽空格分隔;isNew 状态机驱动
 *       "joined the room." / "changed nickname to …." 系统通知)
 *   &2  颜色(3×uint8 → #RRGGBB,借 16777216 前导补位)
 *   &4  皮肤(string16)
 *   &16 坐标质量(x,y uint16;mass uint32)
 *   &32 存活(uint8)
 *   &64 RGB 名(uint8)
 *
 * 怪癖:
 *  - update() 中 isNew===2 分支后的 nick/tag 赋值与分支内重复(无条件再赋一次)。
 *  - "joined the room." 等通知只在本地有 tag(MenuForm.tag !== "")时发出。
 *  - chat type===3 时消息以 \x02 分隔 "nick\x02message",前段作显式昵称。
 *  - commander 只在自己有 tag 时生效。
 */

export default class ChatProtocol {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   BinaryReader — 原 bU(DataView 读取器:init/uint8/uint16/int16/uint32/string16)
   *   MenuForm(ui/MenuForm,bF)— .isAlive / .tag
   *   PartySync(net/PartySync,c3)— positionMass() / biggest()
   *   SpectatorTab(ui/SpectatorTab,bJ)— .isSpectating / .freeSpectate
   *   ChatService(net/ChatService,c1)— 玩家表 / selfID / biggest / teamData
   *   Chat(ui/Chat,bm)— alert()(joined/changednickname 通知)
   *   Canvas(render/Canvas,c4)— .commanderPoints Set
   *   App(core/App,c5)— .time(commander 点时间戳)
   *   xssFilters — XSS 过滤库(需 inHTMLData)
   */
  constructor(systems) {
    this.systems = systems;
    this.reader = new systems.BinaryReader();
  }

  /** WebSocket onmessage 入口。 */
  parse(ev) {
    this.reader.init(ev.data);
    const opcode = this.reader.uint8();
    switch (opcode) {
      case 1:
        this.update();
        break;
      case 2:
        this.chat();
        break;
      case 3:
        this.commander();
        break;
      case 4:
        this.selfID();
        break;
      case 5:
        this.prePlayers();
        break;
    }
  }

  update() {
    const { MenuForm, ChatService, PartySync, SpectatorTab, Chat } = this.systems;
    if (MenuForm.isAlive && !ChatService.isSpectator) {
      PartySync.positionMass();
    }
    if (!MenuForm.isAlive && SpectatorTab.isSpectating && !SpectatorTab.freeSpectate) {
      PartySync.biggest();
    }
    const teamId = ChatService.teamAlternator ? 1 : 2;
    const stats = ChatService.teamData[teamId];
    stats.totalMass = 0;
    stats.alive = 0;
    stats.spectate = 0;
    let count = this.reader.uint8();
    for (let i = 0; i < count; ++i) {
      ChatService.remove(this.reader.uint32());
    }
    count = this.reader.uint8();
    for (let i = 0; i < count; ++i) {
      const player = ChatService.getPlayer(this.reader.uint32());
      const flags = this.reader.uint8();
      if (flags & 1) {
        let nick = this.reader.string16() || 'astr.io';
        let tag = '';
        if (nick.includes('\u200B')) {
          const parts = nick.split('\u200B');
          const head = parts[0].trim();
          if (head.startsWith('[') && head.endsWith(']')) {
            tag = head.slice(1, -1);
          }
          nick = parts[1] || 'astr.io';
        }
        if (player.isNew === 2 && MenuForm.tag !== '') {
          Chat.alert(nick, 'joined the room.');
          player.nick = nick || 'astr.io';
          player.tag = tag;
          player.isNew = 1;
        } else if (player.isNew === 1 && MenuForm.tag !== '') {
          Chat.alert(player.nick, 'changed nickname to ' + nick + '.');
        }
        player.nick = nick || 'astr.io';
        player.tag = tag;
      }
      if (flags & 2) {
        const r = this.reader.uint8();
        const g = this.reader.uint8();
        const b = this.reader.uint8();
        player.colorHex = '#' + (16777216 + (r << 16) + (g << 8) + b).toString(16).slice(1);
      }
      if (flags & 4) {
        player.skin = this.reader.string16();
      }
      if (flags & 16) {
        player.x = this.reader.uint16();
        player.y = this.reader.uint16();
        player.mass = this.reader.uint32();
      }
      if (flags & 32) {
        player.isAlive = this.reader.uint8();
      }
      if (flags & 64) {
        player.isRGB = this.reader.uint8();
      }
      player.team = teamId;
      if (player.isAlive) {
        stats.totalMass += player.mass;
        stats.alive++;
      } else {
        stats.spectate++;
      }
    }
    ChatService.teamAlternator = !ChatService.teamAlternator;
    const biggestIsOn = this.reader.uint8();
    ChatService.biggestIsOn = biggestIsOn;
    if (biggestIsOn) {
      ChatService.biggest.x = this.reader.uint16();
      ChatService.biggest.y = this.reader.uint16();
    }
  }

  prePlayers() {
    const ChatService = this.systems.ChatService;
    ChatService.clear();
    const count = this.reader.uint8();
    for (let i = 0; i < count; ++i) {
      const player = ChatService.newPlayer(this.reader.uint32());
      let nick = this.reader.string16();
      let tag = '';
      if (nick.includes('\u200B')) {
        const parts = nick.split('\u200B');
        const head = parts[0].trim();
        if (head.startsWith('[') && head.endsWith(']')) {
          tag = head.slice(1, -1);
        }
        nick = parts[1] || 'astr.io';
      }
      player.nick = nick || 'astr.io';
      player.tag = tag;
      const r = this.reader.uint8();
      const g = this.reader.uint8();
      const b = this.reader.uint8();
      player.colorHex = '#' + (16777216 + (r << 16) + (g << 8) + b).toString(16).slice(1);
      player.skin = this.reader.string16();
      player.x = this.reader.int16();
      player.y = this.reader.int16();
      player.mass = this.reader.uint32();
      player.isAlive = this.reader.uint8();
      player.isRGB = this.reader.uint8();
    }
    ChatService.teamAlternator = true;
  }

  chat() {
    const ChatService = this.systems.ChatService;
    const id = this.reader.uint32();
    const type = this.reader.uint8();
    const scope = this.reader.uint8();
    const rawNick = this.reader.string16();
    const message = this.systems.xssFilters.inHTMLData(this.reader.string16());
    if (type === 3) {
      // "nick\x02message":前段作显式昵称,后段作消息
      const parts = message.split('\x02');
      ChatService.chat(id, type, parts[1], parts[0], scope, rawNick);
    } else {
      ChatService.chat(id, type, message, null, scope, rawNick);
    }
  }

  commander() {
    const x = this.reader.uint16();
    const y = this.reader.uint16();
    if (this.systems.MenuForm.tag === '') {
      return;
    }
    this.systems.Canvas.commanderPoints.add({
      x,
      y,
      time: this.systems.App.time,
    });
  }

  selfID() {
    this.systems.ChatService.selfID = this.reader.uint32();
  }
}
