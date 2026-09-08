/**
 * App — 应用引导与主循环(原 `c5` 单例)。
 *
 * 行为(与原实现对齐):
 *  init():
 *    1. window.onbeforeunload → "Do you really want to leave the game?"
 *    2. 依序初始化各子系统(见 inject 的引导表)。
 *    3. FrameLimiter 驱动 run()(RAF 每帧)。
 *    4. 40ms 定时器:Mouse.send() / betterDoubleSplits 时 sendAuto()。
 *    5. 5s 定时器:Keyboard.ping()。
 *    6. 60s 定时器:PartySync.ping()。
 *
 *  run()(每帧):
 *    World.update → MenuForm.update → SpectatorTab.update
 *    → Canvas.run → Minimap.run → StatsHud.update → TargetingHud.update
 *
 *  启动(window.onload):
 *    I18n.init → App.init → 非回放模式时 GameConnection.connect(Menu.mode)
 */
import FrameLimiter from './FrameLimiter.js';

export default class App {
  /**
   * @param {{ [name: string]: { init(): void; update?(): void; run?(): void } }} systems
   *   按原名注入的子系统集合(见注入示例):
   *   GameConnection(bX), Store(af), Menu(bB), World(bD), MenuForm(bF),
   *   SpectatorTab(bJ), ChatService(c1), Canvas(c4), Minimap(bt),
   *   StatsHud(bw), TargetingHud(bA), Mouse(bg), Keyboard(bZ), PartySync(c3)
   */
  constructor(systems) {
    this.systems = systems;
    this.time = 0;
    this.loop = null;
  }

  init(view) {
    this.time = Date.now();
    view.onbeforeunload = function () {
      return 'Do you really want to leave the game?';
    };

    const boot = [
      this.systems.GameConnection, // bX.init()
      this.systems.Store,          // af.init()
      this.systems.Menu,           // bB.init()
      this.systems.World,          // bD.init()
      this.systems.MenuForm,       // bF.init()
      this.systems.SpectatorTab,   // bJ.init()
      this.systems.ChatService,    // c1.init()
      this.systems.Canvas,         // c4.init()
    ];
    for (const sys of boot) sys.init();

    this.loop = new FrameLimiter(() => this.run(), view);

    setInterval(() => {
      if (this.systems.GameConnection.betterDoubleSplits) {
        this.systems.Mouse.sendAuto();
      } else {
        this.systems.Mouse.send();
      }
    }, 40);

    setInterval(() => this.systems.Keyboard.ping(), 5000);
    setInterval(() => this.systems.PartySync.ping(), 60000);
  }

  run() {
    this.time = Date.now();
    this.systems.World.update();        // bD.update()
    this.systems.MenuForm.update();     // bF.update()
    this.systems.SpectatorTab.update(); // bJ.update()
    this.systems.Canvas.run();          // c4.run()
    this.systems.Minimap.run();         // bt.run()
    this.systems.StatsHud.update();     // bw.update()
    this.systems.TargetingHud.update(); // bA.update()
  }
}

/**
 * 启动入口 — 等价于原 `a6.onload = () => { ... }`。
 * @param {App} app
 * @param {object} env { view, I18n, GameConnection, Menu, replayMode }
 */
export function bootstrap(app, env) {
  env.view.onload = () => {
    env.I18n.init();
    app.init(env.view);
    if (!env.view.REPLAY_MODE) {
      env.GameConnection.connect(env.Menu.mode);
    }
  };
}
