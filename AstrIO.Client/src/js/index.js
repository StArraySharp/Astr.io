/**
 * index.js — 组合根:实例化全部子系统并按原始顺序引导。
 *
 * 等效于原 bundle 的:
 *   const af..c5 = new class{...}();  // 47 个单例
 *   a6.onload = () => { ah.init(); c5.init(); if (!a6.REPLAY_MODE) bX.connect(bB.mode); };
 *
 * 各模块经 constructor(systems) 注入依赖;这里用一个按名字解析的注册表代理
 * 适配不同模块使用的键名风格(PascalCase/camelCase)。
 */
import jquery from '/js/vendor/jquery-esm.js';
import seedrandom from '/js/vendor/seedrandom-esm.js';

import App from './core/App.js';
import Store from './core/Store.js';
import FrameLimiter from './core/FrameLimiter.js';
import I18n from './core/I18n.js';
import { langEN, langJA, langZH, langKO, langES } from './core/langPacks.js';
import Codec from './net/Codec.js';
import ChatSocket from './net/ChatSocket.js';
import ChatService from './net/ChatService.js';
import ChatProtocol from './net/ChatProtocol.js';
import GameConnection from './net/GameConnection.js';
import PartySync from './net/PartySync.js';
import BinaryReader from './net/BinaryReader.js';
import PacketWriter, { writer as packetWriterInstance } from './net/PacketWriter.js';
import AdminPanel from './admin/AdminPanel.js';
import AuthSession from './auth/AuthSession.js';
import FacebookAuth from './auth/FacebookAuth.js';
import GoogleAuth from './auth/GoogleAuth.js';
import World from './game/World.js';
import Cell from './game/Cell.js';
import TeamPlayer from './game/TeamPlayer.js';
import PlayerList from './game/PlayerList.js';
import Targeting from './game/Targeting.js';
import Mouse from './input/Mouse.js';
import Keyboard from './input/Keyboard.js';
import KeyBindings from './input/KeyBindings.js';
import Commands from './input/Commands.js';
import Recorder from './replay/Recorder.js';
import Player from './replay/Player.js';
import InstantReplay from './replay/InstantReplay.js';
import Canvas from './render/Canvas.js';
import Grid from './render/Grid.js';
import NameRenderer from './render/NameRenderer.js';
import Food from './render/Food.js';
import OpponentRings from './render/OpponentRings.js';
import VirusRange from './render/VirusRange.js';
import ViewportRect from './render/ViewportRect.js';
import Snowflakes from './render/Snowflakes.js';
import Chat from './ui/Chat.js';
import ChatHud from './ui/ChatHud.js';
import Leaderboard from './ui/Leaderboard.js';
import TeamLeaderboard from './ui/TeamLeaderboard.js';
import Minimap from './ui/Minimap.js';
import TeamList from './ui/TeamList.js';
import StatsHud from './ui/StatsHud.js';
import TargetingHud from './ui/TargetingHud.js';
import Menu from './ui/Menu.js';
import MenuForm from './ui/MenuForm.js';
import Theme from './ui/Theme.js';
import ImportExport from './ui/ImportExport.js';
import ProfilesPanel from './ui/ProfilesPanel.js';
import SettingsPanel from './ui/SettingsPanel.js';
import HotkeysPanel from './ui/HotkeysPanel.js';
import TouchControls, { ACTIONS } from './ui/TouchControls.js';
import { TouchEditor } from './ui/TouchEditor.js';
import SpectatorTab from './ui/SpectatorTab.js';
import TournamentOverlay from './ui/TournamentOverlay.js';
import Sfx from './audio/Sfx.js';
import createColor from './util/color.js';
import { escapeHtml, formatMass } from './util/format.js';
import palette from './util/palette.js';

export function boot(view = globalThis.window, document = globalThis.document) {
  const $ = jquery;

  // 语言包挂到全局(原实现:50 个 const → window.lang_XX)
  const langPacks = { EN: langEN, JA: langJA, ZH: langZH, KO: langKO, ES: langES };
  for (const [code, pack] of Object.entries(langPacks)) view['lang_' + code] = pack;

  const codec = new Codec();

  // 实例化(顺序无关;init 顺序在 boot 序列中)
  const instances = {};
  const registry = new Map();
  const placeholderKeys = new Map(); // 构造期占位代理 → 注册键;flush 时按身份回换真实单例
  let instantiating = true; // 构造期:registry 尚不完整,先发占位

  // 构造期占位:模块在 constructor 里 this.x = systems.Y 缓存的是它。
  // flushPlaceholders() 在全部注册完成后,扫描每个实例的自有字段,
  // 把值等于占位符的字段直接改写为真实单例 —— 等效于原 bundle 的
  // "类体内引用友元全局,调用期才解引用"语义。
  function makePlaceholder(key) {
    const p = new Proxy({}, {
      get(target, k) {
        if (k === Symbol.toPrimitive) return undefined; // 不参与运算
        return target[k];
      },
      set(target, k, value) {
        target[k] = value;
        return true;
      },
    });
    placeholderKeys.set(p, key);
    return p;
  }

  const register = (obj) => {
    if (!obj) return obj;
    for (const key of Object.keys(obj)) registry.set(key.toLowerCase(), obj[key]);
    return obj;
  };

  const extras = {
    view, document, doc: document, window: view,
    $, jQuery: $,
    writer: packetWriterInstance, // 原 bW 全局实例
    PacketWriter, BinaryReader, Cell, TeamPlayer,
    SeedRandom: seedrandom, // 原 Math.seedrandom
    palette,
    // 聊天富文本过滤:原版页面全局 xssFilters(js-xss 库),仅用 inHTMLData;
    // escapeHtml(util/format)语义相同(DOM 文本节点转义)
    xssFilters: { inHTMLData: escapeHtml, escapeHtml },
    escapeHtml, formatMass,
    langPacks,
    codec,
    Codec: codec,
  };

  const systems = new Proxy({}, {
    get(_, key) {
      if (typeof key !== 'string') return undefined;
      if (key in extras) return extras[key];
      if (instantiating) {
        // 构造期:注册表尚未完整(实例互相引用),返回占位代理,
        // flushPlaceholders() 会把实例字段里的占位替换为真实单例。
        const lower = key.toLowerCase();
        const ph = makePlaceholder(lower);
        return ph;
      }
      const hit = registry.get(key.toLowerCase());
      if (hit !== undefined) return hit;
      return undefined;
    },
  });

  // 逐个实例化并登记(构造期只存引用,可乱序)
  const defs = {
    Store, I18n, SettingsPanel, HotkeysPanel, ProfilesPanel, KeyBindings,
    TouchControls, Mouse, Commands, Keyboard, Targeting,
    Recorder, InstantReplay, Player,
    Chat, Sfx, ChatHud, ChatProtocol, ChatService,
    Leaderboard, TeamLeaderboard, Minimap, TeamList, StatsHud, TargetingHud,
    ViewportRect, Snowflakes,
    Menu, MenuForm, Theme, ImportExport, SpectatorTab, TournamentOverlay,
    World, Canvas, Grid, NameRenderer, Food, OpponentRings, VirusRange,
    PlayerList,
    GameConnection, AdminPanel, PartySync, AuthSession, FacebookAuth, GoogleAuth,
  };
  for (const [name, Ctor] of Object.entries(defs)) {
    instances[name] = new Ctor(systems);
  }
  // 特殊构造
  instances.ChatSocket = new ChatSocket({
    onMessage: ev => instances.ChatProtocol && instances.ChatProtocol.parse(ev),
    onReady: () => instances.PartySync && instances.PartySync.init(),
    // 原版 onOpen: bm.alert("", ah.current.notif.hsloNetConn) —— 实时取当前语言文案
    notify: (title, text) => instances.Chat && instances.Chat.alert(title, text),
    notifText: () => (instances.I18n && instances.I18n.current && instances.I18n.current.notif
      ? instances.I18n.current.notif.hsloNetConn : ''),
  });
  instances.color = createColor({ App: instances.App ?? (instances.App = new App(systems)) });
  instances.App = instances.App || new App(systems);
  register(instances);
  instantiating = false; // 此后 get 直接走注册表

  // 把构造期缓存的占位代理换成真实单例:扫描每个实例的自有字段,
  // 值为占位符(按身份匹配)且其键已有真实值时直接改写该字段。
  function flushPlaceholders() {
    for (const inst of Object.values(instances)) {
      if (!inst || typeof inst !== 'object') continue;
      for (const field of Object.keys(inst)) {
        const v = inst[field];
        if (placeholderKeys.has(v)) {
          const key = placeholderKeys.get(v);
          const real = registry.get(key);
          if (real !== undefined) inst[field] = real;
        }
      }
    }
  }
  flushPlaceholders();

  // 原始友元全局的别名键(与原变量名一一对应):
  //   camera=bJ(观战镜头) worldbounds=bI(边界) packetwriter/writer=bW/bV
  //   replayplayer=bH(回放,AdminPanel 与 GameConnection 引用)
  //   playerlist=bC(玩家档案容器,AdminPanel 私服协议引用)
  //   tournamentbanner=bx(锦标赛横幅=TournamentOverlay)
  //   packetrouter=bY(协议分发器=AdminPanel,回放复用其解析器)
  //   canvasmanager=c4(=Canvas,回放读画布)
  //   bytereader=bU(BinaryReader 类,回放读档 new bU)
  registry.set('replayplayer', instances.Player);
  registry.set('playerlist', instances.PlayerList);
  registry.set('tournamentbanner', instances.TournamentOverlay);
  registry.set('packetrouter', instances.AdminPanel);
  registry.set('canvasmanager', instances.Canvas);
  registry.set('bytereader', BinaryReader);
  flushPlaceholders(); // 别名也可能被构造期引用过,再冲刷一次

  registry.set('app', instances.App);
  registry.set('camera', instances.SpectatorTab);
  registry.set('spectator', instances.SpectatorTab); // 原 bJ(渲染/UI 模块用 spectator 键名)
  registry.set('settings', instances.SettingsPanel); // 原 bc(渲染/UI 模块用 settings 键名)
  registry.set('worldbounds', instances.Grid);
  registry.set('packetwriter', packetWriterInstance); // 原版回放/发送均用全局实例 bW(非类)
  registry.set('writer', packetWriterInstance);
  registry.set('colorutil', instances.color);
  flushPlaceholders(); // 最后一组别名落地后冲刷

  // === 页面全局桥接（replay.html / play.html 内联 onclick 与 loadFile 依赖）===
  // 原混淆 bundle 是经典脚本,类都在全局作用域;重写版是 ES module,必须显式桥接。
  // HTML 里的 Recorder.* 实际是回放控制器 API —— 重写版全部在 replay/Player 实例上:
  //   readFile/togglePause/setSpeed/restart/stopReplay/playbackSpeed
  // stopReplay 原版语义 = 停止回放渲染并回菜单(Menu.recordHandlers 用 stopRendering+open 实现)。
  const playerInst = instances.Player;
  view.Recorder = {
    get playbackSpeed() { return playerInst.playbackSpeed; },
    readFile: ev => playerInst.readFile(ev),
    togglePause: () => playerInst.togglePause(),
    setSpeed: s => playerInst.setSpeed(s),
    restart: () => playerInst.restart(),
    stopReplay: () => playerInst.stopRendering(),
    zoomIn: () => playerInst.zoomIn(),
    zoomOut: () => playerInst.zoomOut(),
  };
  // 真正的热键命令执行器(原 bi):存回放入口等,菜单/热键面板可能引用。
  view.RecorderClass = instances.Recorder;
  view.ReplayPlayer = playerInst;

  // === 移动端触控(虚拟摇杆 + 自定义键位) ===
  // 摇杆向量直接写 Mouse.x/y(屏幕坐标),由 App 的 40ms 定时器自然发包。
  // ★ 回放页不启用:始终不显示触控键位(不建 DOM,update 有 layout 空保护不会炸)。
  const touch = instances.TouchControls;
  touch.attachMouse(instances.Mouse);
  touch.attachSettingsPanel(instances.SettingsPanel);
  touch.attachI18n(instances.I18n);
  touch.attachEditorModule({ TouchEditor, ACTIONS });
  if (!view.REPLAY_MODE) {
    touch.init();
  }

  // === 触控键位编辑器(#inputs 的 #touch 页签:启用开关 + 「打开键位编辑器」) ===
  view.addEventListener('load', () => {
    const $ = instances.$ || (view.jQuery ? view.jQuery : null);
    if (!$) return;
    const tc = touch;
    $('#touch-enabled').off('change').on('change', function () {
      if (this.checked) tc.enable(); else tc.disable();
    });
    $('#touch-open-editor').off('click').on('click', () => {
      tc.openEditor();
    });
    // 回放页未 init 触控(layout 为 null),面板同步无意义,跳过
    if (!view.REPLAY_MODE) {
      tc.syncPanel();
    }
  });

  // === 原始启动序列 ===
  codec.load(); // 原全局 Codec.load()

  // 全局注册表(原版类体 bE/bG 闭包引用友元全局的等效物;
  // Cell/TeamPlayer 无 systems 参数 new 出时从这里解引用)
  globalThis.__astrioSystems = systems;

  view.onload = () => {
    instances.I18n.init();
    instances.App.init(view); // 内部按原顺序:init 核心 8 系统 + 定时器
    if (!view.REPLAY_MODE) {
      instances.GameConnection.connect(instances.Menu.mode);
    }
  };

  return { systems, instances, codec, view };
}

// 浏览器直接引入时自动启动(等效于原 bundle 顶层执行)
if (typeof window !== 'undefined' && window.document) {
  // ★ 暴露实例给原生壳：Android 返回键需要调 Menu.closeSubMenus() / Menu.close()
  window.__astrio = boot(window, window.document);
  installAndroidBackBridge();
}

/**
 * Android 返回键桥（配合 MainActivity.onBackPressed）。
 * 返回 true = 已消费（关子面板 / 关主菜单）；false = 交回原生走「再按一次退出」。
 * 优先级：子面板 → 主菜单 → 退出。
 */
function installAndroidBackBridge() {
  window.__androidBack = function () {
    const inst = window.__astrio && window.__astrio.instances;
    if (!inst || !inst.Menu) return false;
    // 1) 任意子面板（设置/皮肤/快捷键/录屏…）可见 → 关掉它们，回主菜单
    const panels = document.querySelectorAll('.menu-panel');
    for (const p of panels) {
      const st = window.getComputedStyle(p);
      if (st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0') {
        inst.Menu.closeSubMenus();
        return true;
      }
    }
    // 2) 主菜单开着 → 关掉，回到游戏/观战视角
    if (inst.Menu.isOpened) { inst.Menu.close(); return true; }
    return false;
  };
}
