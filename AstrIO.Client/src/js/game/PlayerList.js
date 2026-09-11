/**
 * PlayerList — 玩家档案 Map 容器(原 `bC`,80 字节空单例)。
 *
 * 原实现只有一个 `list: Map` 字段,由 AdminPanel(原 `bY` 私服协议层)在
 * 123(playerList)/124(playerAdd)/125(playerRemove)号包时写入,
 * 全 bundle 无其他读取方(疑似私服面板半成品)。等效保留容器语义。
 */
export default class PlayerList {
  constructor() {
    this.list = new Map();
  }
}
