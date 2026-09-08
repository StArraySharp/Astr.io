# astrio 客户端重写版

对 `www.astrio.io` 混淆客户端 bundle 的等效实现(纯 ES 模块,无需构建)。
逆向过程与完整架构见 [ARCHITECTURE.md](./ARCHITECTURE.md)。

## 运行

```bash
npm install
npm start          # → http://localhost:8123/play.html
```

`npm start` 启动 `scripts/serve.mjs`:提供原站静态页面(含 DOM/CSS/字体),
并把混淆 `bundle.js` 拦截替换为本工程 `src/index.js`(61 个原生 ESM 模块)。
游戏会连接**真实的 astrio.io 服务器**(wss,二进制协议 + 已逆向的 WASM 编解码)。

### 端口

```bash
PORT=3000 npm start
```

### 已知边界

- Google Analytics / AdSense / hCaptcha / Facebook / Google 登录在 localhost 上
  会因域名白名单失败或不生效(原版行为也是如此依赖第三方)。
- `codec.wasm` 由本地服务器提供;若获取失败,`src/net/Codec.js` 自动回退到
  与 wasm 逐字节一致的纯 JS 实现(codecCipher + p9Interpreter)。

## 命令

| 命令 | 作用 |
|------|------|
| `npm start` | 本地运行(serve.mjs) |
| `npm run check` | 语法检查全部模块 + 编解码冒烟测试 |
| `npm run wat` | 由 wasm/codec.wasm 重新生成 wat/codec.wat(需 devDep wabt) |

## 目录

```
src/        62 个模块(core/ui/input/render/game/net/replay/admin/auth/audio/util)
wasm/       codec.wasm 原件
wat/        反汇编文本
vendor/     ESM 垫片(jquery / seedrandom)
public/     bundle 替换加载器
scripts/    serve / check / check-deps / wasm2wat / gen-p9-ops
```
