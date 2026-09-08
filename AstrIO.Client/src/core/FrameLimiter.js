/**
 * FrameLimiter — RAF 主循环帧率探测(原 `class ae`)。
 *
 * 行为:每次 requestAnimationFrame 回调先预约下一帧,再根据本次与上次
 * 时间戳的差值识别显示器刷新率(30/60/75/100/120/144Hz,
 * 容差 0.05ms),供外部读取 `rafLoopTime`(每帧预算毫秒数)。
 */

const KNOWN_REFRESH_RATES = [
  { fps: 30, frameTime: 33.333333333333336 },
  { fps: 60, frameTime: 16.666666666666668 },
  { fps: 75, frameTime: 13.333333333333334 },
  { fps: 100, frameTime: 10 },
  { fps: 120, frameTime: 8.333333333333334 },
  { fps: 144, frameTime: 6.944444444444445 },
];

const TOLERANCE_MS = 0.05;

export default class FrameLimiter {
  /**
   * @param {() => void} event 每帧回调(在 RAF 时序中同步调用)
   * @param {Window} view 全局 window(原实现依赖注入的 a6)
   */
  constructor(event, view) {
    this.event = event;
    this.view = view;
    this.maxFps = 30;
    this.lastFrameTime = 0;
    this.view.requestAnimationFrame(t => this.run(t));
  }

  run(timestamp) {
    this.view.requestAnimationFrame(t => this.run(t));
    this.updateRafTime(timestamp);
    this.event();
  }

  updateRafTime(timestamp) {
    const delta = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;
    for (const { fps, frameTime } of KNOWN_REFRESH_RATES) {
      if (Math.abs(frameTime - delta) < TOLERANCE_MS) {
        this.maxFps = fps;
        break;
      }
    }
  }

  /** 每帧时间预算(ms)。 */
  get rafLoopTime() {
    return 1000 / this.maxFps;
  }
}
