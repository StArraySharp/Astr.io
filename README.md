# AstrIO — astr.io 逆向与本地生态

本仓库包含 astr.io 游戏的可玩本地生态:

- **`AstrIO.Client/`** — 混淆客户端的反混淆等效重写(62 个 ES 模块,纯 ESM 无需构建),
  支持直连原版服务器游玩、本地回放录制与播放,可打包 Android APK
- **`AstrIO.Server/`** — C# (ASP.NET Core) 自研"亚洲服",世界物理对齐 Ogar/MultiOgar,
  协议向 astrio 原版对齐,自带 Web 控制面板与 Bot AI
- **`AstrIO.Tests/`** — 服务端单元测试(Bot AI / 房间槽位)

## 快速开始

### 客户端(连原版服务器)

```bash
cd AstrIO.Client
npm install
npm start        # → http://localhost:8123/
```

- 默认浏览器直连 `wss://astr.io`(原版 EU 服)
- 纯 JS 编解码后端(`ASTRIO_CODEC_WASM=1` 切回 wasm)
- `ASTRIO_LOCAL_WS=1`:回退 localhost 端口表(配合本地服)

### 服务器(本地亚洲服)

```bash
cd AstrIO.Server
dotnet run       # 监听 3000/3001/3050(游戏) 3005(chat桩) 4002(HTTP 控制面板)
```

客户端菜单切 AS 区即连本地服;手机端在设置面板「亚洲服务器地址」填电脑局域网 IP。

### Android APK

```bash
cd AstrIO.Client
npx cap sync android                 # 同步 src/ 到 android 工程
cd android && ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

需 JDK 21 与 Android SDK(`android/local.properties` 配 `sdk.dir`)。

## 回放系统

- 游戏内 **REC** 按钮录制,存 IndexedDB,也可上传本地服(`/api/replay/*`)
- **replay.html** 回放查看器:拖放/本机列表/服务器列表三种入口(下载带进度条+内存缓存)
- 播放控制:0.25x–4x 变速、时间轴 seek、镜头缩放、双目标观战
- 底部操作栏 2s 无操作自动收缩,触摸唤醒,播完自动弹出
- 移动端:回放页不启用触控键位,游戏画布随回放加载/退出显隐

## 文档

| 文档 | 内容 |
|------|------|
| [docs/CLIENT-ARCHITECTURE.md](docs/CLIENT-ARCHITECTURE.md) | 62 模块架构、原版混淆名映射表、二进制协议 opcode 表 |
