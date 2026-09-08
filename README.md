# AstIO — astrio.io 逆向与本地生态

本仓库包含 astrio.io 游戏的可玩本地生态:

- **`AstrIO.Client/`** — 混淆客户端的反混淆等效重写(62 个 ES 模块),可本地运行并直连原版服务器游玩
- **`AstrIO.Server/`** — C# (ASP.NET Core) 服务器,自研"亚洲服",世界物理对齐 Ogar/MultiOgar,协议向 astrio 原版对齐改造中

## 快速开始

### 客户端(连原版服务器)

```bash
cd AstrIO.Client
npm install
npm start        # http://localhost:8123/play.html
```

- 默认:浏览器直连 `wss://astrio.io`(原版 EU 服,Ping ~200ms)
- 默认:纯 JS 编解码后端(`ASTRIO_CODEC_WASM=1` 切回 wasm)
- `ASTRIO_LOCAL_WS=1`:回退 localhost 端口表(配合本地服)

### 服务器(本地亚洲服)

```bash
cd AstrIO.Server
dotnet run       # 监听 3000/3001/3050(游戏) 3005(chat桩) 4002(HTTP)
```

客户端菜单切 AS 区,或 `ASTRIO_LOCAL_WS=1 npm start` 后选区域即连本地服。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/会话总结.md](docs/会话总结.md) | 逆向全景:反混淆流水线、61→62 模块重写、WASM 编解码逆向、真实服联调与修复记录 |
| [docs/CLIENT-README.md](docs/CLIENT-README.md) | 客户端运行/协议/快捷键 |
| [docs/CLIENT-ARCHITECTURE.md](docs/CLIENT-ARCHITECTURE.md) | 62 模块架构、原版混淆名映射表、二进制协议 opcode 表 |
