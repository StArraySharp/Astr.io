/**
 * ChatService — 聊天服初始化 + 战队玩家表(原 `c1` 单例)。
 *
 * 行为(与原实现对齐):
 *  - init():启动 ChatSocket(自动重连),初始化 teamPlayers Map、selfID(-1)、
 *    mutedIds Set、teamAlternator、双队统计 teamData{1,2}、biggest 玩家占位。
 *  - 玩家表:clear/remove/getPlayer/newPlayer;getPlayer 对自身 id 返回全新空对象
 *    (怪癖:协议对自身的增量更新会被丢弃)。
 *  - mute/unmute:右键菜单驱动的按玩家 id 静音。
 *  - chat():昵称/tag 解析(显式昵称 > \u200B 零宽串 > 自身/玩家表),
 *    颜色与皇冠从 World.playerMeta 或扫描 World.cells 同名细胞推导
 *    (rainbow → hsl(((now/20|0)*3)%360, 100%, 65%)),
 *    按 type 分发到 Chat.normal(1/3)或 Chat.command(2)。
 */

export default class ChatService {
  /**
   * @param {object} systems 依赖集合(重写名):
   *   ChatSocket(net/ChatSocket,c0实例)— init() 建立聊天 WebSocket
   *   TeamPlayer — 原 bG 类(战队玩家数据,建议 game/TeamPlayer,待重写)
   *   MenuForm(ui/MenuForm,bF)— .nick / .tag
   *   World(game/World,bD)— .playerMeta Map / .cells Map
   *   Chat(ui/Chat,bm)— normal() / command()
   */
  constructor(systems) {
    this.systems = systems;
    this.TeamPlayer = systems.TeamPlayer; // 构造期占位,flush 后为真实类(extras 已注册)
    this.teamPlayers = null;
    this.selfID = -1;
    this.isSpectator = false;
    this.mutedIds = null;
    this.teamAlternator = true;
    this.teamData = null;
    this.biggestIsOn = false;
    this.biggest = null;
  }

  init() {
    this.systems.ChatSocket.init();
    this.teamPlayers = new Map();
    this.selfID = -1;
    this.isSpectator = false;
    this.mutedIds = new Set();
    this.teamAlternator = true;
    this.teamData = {
      1: { totalMass: 0, alive: 0, spectate: 0 },
      2: { totalMass: 0, alive: 0, spectate: 0 },
    };
    this.biggestIsOn = false;
    this.biggest = new this.TeamPlayer(0);
  }

  clear() {
    this.teamPlayers.clear();
  }

  remove(id) {
    this.teamPlayers.delete(id);
  }

  /** 怪癖:id === selfID 时返回全新 {} — 协议对自身字段的更新不会落地。 */
  getPlayer(id) {
    if (id === this.selfID) {
      return {};
    }
    let player = this.teamPlayers.get(id);
    if (player === undefined) {
      player = this.newPlayer(id);
    }
    return player;
  }

  newPlayer(id) {
    const player = new this.TeamPlayer(id);
    this.teamPlayers.set(id, player);
    return player;
  }

  mute(id) {
    this.mutedIds.add(id);
  }

  unmute(id) {
    this.mutedIds.delete(id);
  }

  /**
   * 聊天消息分发(ChatProtocol.chat 调用)。
   * @param {number} id 玩家 id
   * @param {number} type 1/3 → normal;2 → command
   * @param {string} message 消息(已 XSS 转义)
   * @param {string|null} explicitNick 显式昵称(type 3 的 \x02 前段)
   * @param {number} scope 频道标志(1 → [G] 前缀)
   * @param {string|null} rawNick 协议原始昵称(可含 "[tag]\u200B")
   */
  chat(id, type, message, explicitNick, scope, rawNick) {
    const { MenuForm, World, Chat } = this.systems;
    if (this.mutedIds.has(id)) {
      return;
    }
    let nick = explicitNick || 'astr.io';
    let tag = '';
    if (explicitNick) {
      nick = explicitNick;
    } else if (rawNick) {
      nick = rawNick;
      if (nick.includes('\u200B')) {
        const parts = nick.split('\u200B');
        const head = parts[0].trim();
        if (head.startsWith('[') && head.endsWith(']')) {
          tag = head.slice(1, -1);
        }
        nick = parts[1] || 'astr.io';
      }
    }
    if (!explicitNick && !rawNick) {
      if (id === this.selfID) {
        nick = MenuForm.nick || 'astr.io';
        tag = MenuForm.tag || '';
      } else {
        const known = this.teamPlayers.get(id);
        if (known !== undefined) {
          nick = known.nick || 'astr.io';
          tag = known.tag || '';
        }
      }
    }
    if (!tag) {
      if (id === this.selfID) {
        tag = MenuForm.tag || '';
      } else {
        const known = this.teamPlayers.get(id);
        if (known && known.tag) {
          tag = known.tag;
        }
      }
    }
    let color = null;
    let crowned = false;
    const isSelf = id === this.selfID;
    const meta = World.playerMeta.get(nick);
    if (meta) {
      if (isSelf || !meta.isMine) {
        if (meta.nameColor) {
          if (meta.nameColor === 'rainbow') {
            const hue = ((Date.now() / 20 | 0) * 3) % 360;
            color = 'hsl(' + hue + ', 100%, 65%)';
          } else {
            color = meta.nameColor;
          }
        }
        if (meta.crowned) {
          crowned = true;
        }
      }
    }
    if (!color && !crowned) {
      for (const [, cell] of World.cells) {
        if (cell.isFood || cell.isEjected || cell.isVirus) {
          continue;
        }
        if (cell.isMine && !isSelf) {
          continue;
        }
        let cellNick = cell.nick;
        if (cellNick && cellNick.includes('\u200B')) {
          cellNick = cellNick.split('\u200B').pop();
        }
        if (cellNick !== nick) {
          continue;
        }
        if (cell.nameColor) {
          if (cell.nameColor === 'rainbow') {
            const hue = ((Date.now() / 20 | 0) * 3) % 360;
            color = 'hsl(' + hue + ', 100%, 65%)';
          } else {
            color = cell.nameColor;
          }
        }
        if (cell.isCrowned) {
          crowned = true;
        }
        break;
      }
    }
    if (type === 1 || type === 3) {
      Chat.normal(nick, message, scope, tag, color, crowned, id);
    } else if (type === 2) {
      Chat.command(nick, message, scope, tag, color, crowned, id);
    }
  }
}
