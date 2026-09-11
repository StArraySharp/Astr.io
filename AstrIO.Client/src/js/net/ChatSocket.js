/**
 * ChatSocket — 聊天服务器 WebSocket 连接(原 `c0`)。
 *
 * 行为:
 *  - 地址:本地(localhost/127.0.0.1)→ `ws://localhost:3005`;
 *    否则按页面协议推导 `ws(s)://<host>/chat`。
 *  - 二进制模式 arraybuffer(与原一致,尽管消息按 JSON 文本处理)。
 *  - onopen → 上层初始化(PartySync.init)+ 通知文案。
 *  - onclose → 2 秒后自动重连。
 *  - onmessage → ChatProtocol.parse。
 */

export default class ChatSocket {
  /**
   * @param {() => string} notifText 连接成功通知文案(原: ah.current.notif.hsloNetConn;传函数以实时取当前语言)
   * @param {(text: string, kind?: string) => void} notify 通知回调(原: bm.alert)
   */
  constructor({ onMessage, onReady, notifText, notify }) {
    this.onMessage = onMessage;
    this.onReady = onReady;
    this.notifText = notifText;
    this.notify = notify;
    this.ws = null;
    this.connected = false;
  }

  init() {
    this.ws = null;
    this.connected = false;
    this.connect();
  }

  connect() {
    const loc = window.location;
    const isLocal = loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
    const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
    // 本地开发变体:__ASTRIO_LIVE_WS=1 → 使用原版聊天服地址(浏览器直连,带真实指纹)
    const live = window.__ASTRIO_LIVE_WS || loc.search.includes('__ASTRIO_LIVE_WS');
    // 原版页面 origin 是裸域 astrio.io(实测 RTT ~210ms,www 子域 ~600ms),必须用裸域。
    const url = isLocal
      ? (live ? 'wss://astrio.io/chat' : 'ws://localhost:3005')
      : `${scheme}://${loc.host}/chat`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.handleOpen();
    this.ws.onmessage = ev => this.onMessage(ev);
    this.ws.onclose = () => this.handleClose();
    this.ws.onerror = () => this.handleError();
  }

  send(data) {
    this.ws.send(data);
  }

  handleOpen() {
    // 注:原实现不在 onopen 置位 connected(仅在 close/error 清位),此处保持一致。
    this.onReady();
    const text = typeof this.notifText === 'function' ? this.notifText() : this.notifText;
    this.notify('', text);
  }

  handleClose() {
    this.connected = false;
    setTimeout(() => this.connect(), 2000);
  }

  handleError() {
    this.connected = false;
  }
}
