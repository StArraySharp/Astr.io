# astr.io 客户端 — 架构分析与重写工程

目标:将 `../deobfuscated/bundle.deob.js`(22 万行,行为等效但保留混淆短名)重建为
干净、命名清晰、模块化的等效实现。

## 运行时形态

- 单一 IIFE `(function(window, $, document){...})(window, $, document)`,依赖全局 jQuery。
- 入口:`window.onload → ah.init(); c5.init(); if (!REPLAY_MODE) bX.connect(mode)`。
- 渲染:2D canvas(`c4.ctx`),RAF 主循环 + 固定 25Hz 网络发送定时器。
- 网络:游戏服 WebSocket(二进制,WASM 编解码,见 `Codec.js`/`codec.wasm`)+
  聊天服 WebSocket(`c0`,JSON,自动重连)。
- 持久化:`localStorage`,键前缀 `astrio-`。

## 子系统映射表(混淆名 → 职责 → 重写名)

| 原名 | 职责(由字符串/调用分析确定) | 重写名 | 状态 |
|------|------------------------------|--------|------|
| ae | RAF 帧率限制器(自动识别 30/60/75/100/120/144Hz 显示器) | `core/FrameLimiter` | ✅ |
| af | localStorage 封装(前缀 `astrio-`,JSON,默认值) | `core/Store` | ✅ |
| ah | i18n 语言包(`lang_*`) | `core/I18n` | ✅ |
| bc | 设置面板(#settings:动画/缩放速度等) | `ui/SettingsPanel` | ✅ |
| bd | 热键/命令 UI(#inputs #hotkeys) | `ui/HotkeysPanel` | ✅ |
| be | 皮肤档案选择 UI(#profile-left/right) | `ui/ProfilesPanel` | ✅ |
| bf | 热键绑定表(feed/macroFeed/multiboxTab…,17KB) | `input/KeyBindings` | ✅ |
| bg | 鼠标状态机(左右中键/双分裂宏,14KB) | `input/Mouse` | ✅ |
| bh | 自定义命令 command0-9(实际为 command0-9 共 10 槽) | `input/Commands` | ✅ |
| bi | 回放录制器(Recorder:鼠标+命令流) | `replay/Recorder` | |
| bj | 主题系统(预设/背景图/颜色,33KB) | `ui/Theme` | |
| bk | 设置导入/导出 | `ui/ImportExport` | |
| bl | 即时回放面板 | `replay/InstantReplay` | |
| bm | 聊天/通知(#chatroom,表情包) | `ui/Chat` | |
| bn | 音效(chat.mp3/bellalert/wasted) | `audio/Sfx` | |
| bo/bp | Facebook / Google 登录 | `auth/*` | |
| br | 排行榜(#leaderboard-positions,图表) | `ui/Leaderboard` | |
| bs | 战队排行榜 | `ui/TeamLeaderboard` | |
| bt | 小地图(#minimap-nodes) | `ui/Minimap` | |
| bu | 战队列表 HUD | `ui/TeamList` | |
| bv | 聊天消息 HUD(Party/Global 频道) | `ui/ChatHud` | |
| bw | 状态 HUD(Score/STE/FPS) | `ui/StatsHud` | |
| bA | 目标 HUD(第一名/鼠标目标/玩家质量) | `ui/TargetingHud` | |
| bB | 主菜单(昵称/皮肤/tag/区服:eu/na,29KB) | `ui/Menu` | |
| bC | (空,80B) | — | |
| bD | 游戏世界状态(cells/myCells/food/sortedCells,`":removed"` 残影) | `game/World` | ✅ |
| bF | 菜单表单(#nick #skin #tag #pin 倒计时) | `ui/MenuForm` | |
| bH | 回放系统(HUD/时间轴/速度,34KB) | `replay/Player` | ✅ |
| bI | 世界地图边界与 5×5 分区坐标(不画网格线,网格线在 Canvas.vanillaGrid) | `render/Grid` | ✅ |
| bJ | 观战页签(兼相机:x/y/viewport/viewBounds/isSpectating) | `ui/SpectatorTab` | |
| bK | 昵称/质量文字离屏缓存(rainbow/hsl/渐变,canvas 池) | `render/NameRenderer` | ✅ |
| bN | 食物渲染(monoColored 单色批量 / rainbow 逐颗) | `render/Food` | ✅ |
| bO | 对手威胁等级光环(STE/smaller/same/bigger/biggerSTE) | `render/OpponentRings` | ✅ |
| bP | 病毒弹出范围圈(radius+760,10% 白,随病毒淡出) | `render/VirusRange` | ✅ |
| bQ | 小地图视口框 | `render/ViewportRect` | |
| bR | 特效(雪花/线条) | `render/Snowflakes` | |
| bS | 目标选择逻辑(target1/2) | `game/Targeting` | ✅ |
| bT | 颜色工具 rgb() | `util/color` | ✅ |
| bX | 游戏服连接配置与状态(eu/na.astrio.io) | `net/GameConnection` | |
| bY | 管理面板(内置 bot 名单等,24KB) | `admin/AdminPanel` | |
| bZ | 键盘状态/ ping | `input/Keyboard` | ✅ |
| c0 | 聊天 WebSocket(自动重连) | `net/ChatSocket` | ✅ |
| c1 | 聊天初始化 + 战队玩家表 | `net/ChatService` | |
| c2 | 聊天协议解析(系统消息) | `net/ChatProtocol` | |
| c3 | tag/战队网络同步(#tag #tag2) | `net/PartySync` | |
| c4 | 主画布与渲染编排(cells/皮肤/网格线/边框/背景图/指挥官点/瞄准线/分裂圈) | `render/Canvas` | ✅ |
| c5 | 应用引导与主循环 | `core/App` | ✅ |
| ad | 内嵌加密库(RC4/ArrayBuffer,协议用) | `net/crypto` | |
| — | WASM 编解码器(外部文件 Codec.js) | `net/Codec` | |

## 主循环(已验证逻辑)

```
onload:
  I18n.init()
  App.init()
  if (!REPLAY_MODE) GameConnection.connect(Menu.mode)

App.init():
  1. 订阅 onbeforeunload("Do you really want to leave the game?")
  2. 依次初始化: GameConnection, Store, Menu, World, MenuForm,
     SpectatorTab, ChatService, Canvas
  3. RAF 循环(FrameLimiter) → App.run()
  4. setInterval 40ms  → Mouse.send() / sendAuto()(betterDoubleSplits)
  5. setInterval 5s   → Keyboard.ping()
  6. setInterval 60s  → PartySync.ping()

App.run()(每帧):
  World.update() → MenuForm.update() → SpectatorTab.update()
  → Canvas.run() → Minimap.run() → StatsHud.update() → TargetingHud.update()
```

## 重写进度

- [x] `core/FrameLimiter.js`(ae)
- [x] `core/Store.js`(af)
- [x] `core/App.js`(c5)
- [x] `net/ChatSocket.js`(c0)
- [x] `core/I18n.js`(ah)
- [x] `ui/SettingsPanel.js`(bc)
- [x] `ui/HotkeysPanel.js`(bd)
- [x] `ui/ProfilesPanel.js`(be)
- [x] `input/KeyBindings.js`(bf)
- [x] `input/Mouse.js`(bg)
- [x] `input/Commands.js`(bh)
- [x] `input/Keyboard.js`(bZ)
- [x] `game/Targeting.js`(bS)
- [x] `util/color.js`(bT)
- [x] `ui/Menu.js`(bB)
- [x] `ui/MenuForm.js`(bF)
- [x] `ui/Theme.js`(bj)
- [x] `ui/ImportExport.js`(bk)
- [x] `ui/SpectatorTab.js`(bJ)
- [x] `game/World.js`(bD)
- [x] `render/Canvas.js`(c4)
- [x] `render/Grid.js`(bI — 实为世界地图边界/分区坐标,网格线在 Canvas.vanillaGrid)
- [x] `render/NameRenderer.js`(bK,内嵌原 bL/bM 缓存条目类)
- [x] `render/Food.js`(bN — 食物渲染,初版表格误记为"名字颜色模式")
- [x] `render/OpponentRings.js`(bO — 对手威胁等级光环)
- [x] `render/VirusRange.js`(bP — 病毒弹出范围圈)
- [ ] 其余子系统:按上表逐个进行,方法:先读 `bundle.deob.js` 对应区段 →
      提取行为 → 以语义命名重写 → 与原实现比对输出。

> ⚠ 源文件注意:`D:\Softwares\msys2\tmp\opencode\deob\singletons\` 中的单例提取
> 文件在 Windows 大小写不敏感文件系统上发生了覆盖——`bj.js` 实际含 bJ
> (SpectatorTab)、`bk.js` 实际含 bK(NameRenderer)、`bc.js` 含 bC、`bd.js` 含
> bD、`bf.js` 含 bF、`bh.js` 含 bH、`bi.js` 含 bI、`bn/bp/br/bt.js` 同理含
> bN/bP/bR/bT(下划线前缀 `_bc/_bd/_bf.src.js` 为小写原件备份)。真正的
> bj(Theme)、bk(ImportExport)已按 `_index.json` 偏移从 `bundle.deob.js`
> 重新提取为 `_bj.src.js`、`_bk.src.js`。使用任何 `singletons/*.js` 前先核对
> 文件内 `const <name>` 与预期一致。

---

## 最终完成报告(全量重写)

### 进度:61/61 模块 ✅(`npm run check` 全部通过)

### 关键发现汇总

1. **`ad`(bundle 内 6MB,约占全文件 90%)是死代码**:Emscripten/asm.js 编译的 UMD 模块
   (`noInitialRun`/`preInit`/`ready` 特征),仅在 Node(`module.exports`)或 AMD 环境导出,
   浏览器执行路径从不调用。浏览器等效实现已整体剔除。真实活代码仅约 380KB。
2. **`ai..bb`(50 个空对象)是 5 个内嵌语言包**(EN/JA/ZH/KO/ES,各 9 分区+1 聚合根),
   挂载为 `window.lang_XX`,由 I18n 消费,缺词回退 EN → `core/langPacks.js`(962 键逐条比对一致)。
3. **映射表勘误**(以实际重写内容为准):
   - `bQ`=菜单雪花特效(非视口框)、`bR`=扇区网格线、`bN`=食物渲染(非名字颜色)、
     `bO`=对手威胁环、`bP`=病毒弹出范围圈、`bi`=热键命令执行器(录制缓冲在 bH)、
     `bJ`=观战镜头、`bx`=锦标赛 UI、`bC`=玩家档案 Map 容器。
   - 未列入原表:`bU`=BinaryReader、`bV/bW`=PacketWriter(+全局实例)、`bE`=Cell、
     `bG`=TeamPlayer、`bq`=Discord AuthSession、`ag`=38 色调色板、`by/bz`=escapeHtml/formatMass。

### WASM 编解码器(完整逆向)

- **v1()=3**(版本)、**d0()=256**(数据区偏移)、内存 1 页。
- **双向异或流密码**(与 wasm 差分验证 96/96,`src/net/codecCipher.js`):
  - 核心:xorshift128 变体 `t=d^(d<<11); [a,b,c,d]←[a^t^(t>>>8)^(a>>>19), a, b, c]`;
  - 密钥流字:`m = imul(newA, 0x5BD1E995)`(MurmurHash 乘数),4 字节小端异或;
  - 加密方向 q1:种子 ⊕ `[0xA5A5A5A5, 0x5A5A5A5A, 0xF0F0F0F0, 0x0F0F0F0F]` 后预热 16 步;
  - 解密方向 q2:种子 ⊕ `[0x12345678, 0x9ABCDEF0, 0xDEADBEEF, 0xCAFEBABE]` 后预热 16 步;
  - 状态跨调用持续(流式);尾部(非 4 倍数)单步补齐按 `(m>>>shift)&255`。
- **p9 挑战哈希**:br_table 混淆的 2569 指令函数,`src/net/p9Interpreter.js` 指令级解释执行
  (18/18 与 wasm 一致),混合 (a, b, k7 种子 g8..g15)。
- 其余导出(m1..m6/h1..h3/x0/z0/z1/r3/c9/w2)未被游戏调用(h3 含 SHA-256 IV,疑为库残留)。
- `src/net/Codec.js` 双后端:优先 wasm,失败回退纯 JS(行为逐字节一致)。

### 游戏二进制协议(见 src/admin/AdminPanel.js 注释内的完整 opcode 表)

下行 26 个 opcode(50=世界更新、60=边界、90=排行榜、130=战队榜、176=锦标赛、
222=认证挑战…),上行经 Keyboard(60/89/30/… 号包)与 PartySync(0/1/2/4/8/16/32/64/128/162)。

### 目录结构

```
rewrite/
├── package.json          # 标准 Node 项目(jquery/seedrandom 依赖,wabt devDep)
├── wasm/codec.wasm       # 原始 wasm(已内嵌)
├── wat/codec.wat         # 反汇编(npm run wat 重新生成)
├── scripts/              # check.mjs / wasm2wat.mjs / gen-p9-ops.mjs
└── src/                  # 61 个模块:core/ui/input/render/game/net/replay/admin/auth/audio/util
    └── index.js          # 组合根:实例化+按原始顺序引导
```
