/**
 * Sfx — 游戏音效(原 `bn` 单例;注意与渲染侧 `bN`(NameColors)同名异体,
 * 反混淆抽取文件 singletons/bn.js 内容实为 bN,本文件依据 final-clean.js:214200 还原)。
 *
 * 行为:init() 预创建三个 Audio 对象:
 *   chat     → /resources/sounds/chat.mp3
 *   bellAlert→ /resources/sounds/bellalert.mp3
 *   wasted   → /resources/sounds/wasted.mp3
 *
 * 怪癖:原实现写作 `new Audio(...) || { play: () => {} }`,`new Audio()` 永远为真,
 * 回退哑对象是死代码——此处等价简化,行为一致。
 */

export default class Sfx {
  /** @param {object} systems 依赖集合(本子系统无依赖,仅为统一接线保留) */
  constructor(systems) {
    this.systems = systems;
    this.chat = null;
    this.bellAlert = null;
    this.wasted = null;
  }

  init() {
    this.chat = new Audio('/resources/sounds/chat.mp3');
    this.bellAlert = new Audio('/resources/sounds/bellalert.mp3');
    this.wasted = new Audio('/resources/sounds/wasted.mp3');
  }
}
