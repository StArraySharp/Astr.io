# AstrIO Server JSON API 文档

> 服务端：`AstrIO.Server`(ASP.NET Core Minimal API, net10.0, AOT-ready)
> HTTP 端口：**4002**(唯一非 WebSocket 端口)
> 版本：2026-09-13

---

## 目录

- [快速开始](#快速开始)
- [认证机制](#认证机制)
- [通用约定](#通用约定)
- [API 索引](#api-索引)
- [公开端点](#公开端点)
- [面板认证](#面板认证)
- [面板数据](#面板数据)
- [回放管理](#回放管理)
- [页面路由](#页面路由)
- [错误响应](#错误响应)
- [WebSocket 端口对照](#websocket-端口对照)
- [世界常量与保底机制](#世界常量与保底机制)
- [实现说明](#实现说明)

---

## 快速开始

# 1. 查看认证状态
curl http://localhost:4002/api/panel/auth
# {"needSetup":false,"authed":false}

# 2. 登录(首次访问则是设置密码)
curl -c cookies.txt -X POST http://localhost:4002/api/panel/auth \
     -H "Content-Type: application/json" \
     -d '{"password":"your-password"}'
# {"ok":true}

# 3. 带 Cookie 访问面板数据
curl -b cookies.txt http://localhost:4002/api/panel/state


---

## 认证机制

### 密码存储

- 密码以 **SHA256 十六进制(64 字符小写)** 存于 `config.json` 的 `panelPasswordHash` 字段
- **明文不落盘**
- 存储值为空或非 64 位十六进制 → 视为「从未设置密码」

### 两种状态

| `panelPasswordHash` | `needSetup` | 前端行为 |
|---|---|---|
| 空 / 非法 | `true` | 弹「设置密码」框(两个输入框，≥4 位，需二次确认) |
| 合法 64 位十六进制 | `false` | 弹「登录」框(单输入框) |

### Token

- 登录成功后服务端生成随机 token(`Guid.N`)，存于**内存** `HashSet<string>`
- 通过 `Set-Cookie: panel_auth=<token>` 下发(`HttpOnly`, `SameSite=Lax`, `Path=/`)
- **服务重启即失效**，需重新登录

### 门禁规则

// /api/panel/* 段(/api/panel/auth 本身除外)未认证一律 401
if (path.StartsWith("/api/panel")
    && !path.StartsWith("/api/panel/auth")
    && !PanelAuthed(ctx))
{
    ctx.Response.StatusCode = 401;
    await ctx.Response.WriteAsJsonAsync(new ApiErrorDto("unauthorized"), ...);
    return;
}


**豁免清单**：`/api/panel/auth`、`/api/mass`、`/server-info/*`、`/api/diag/*`、`/api/replay/*`、`/`、`/panel`

---

## 通用约定

| 项 | 约定 |
|---|---|
| 基地址 | `http://<host>:4002` |
| 请求体编码 | `application/json`(除回放上传用 `multipart/form-data`) |
| 响应编码 | `application/json; charset=utf-8`(页面为 `text/html`) |
| 字段命名 | **camelCase**(`JsonKnownNamingPolicy.CamelCase`) |
| `null` 字段 | 序列化时**省略**(`DefaultIgnoreCondition = WhenWritingNull`) |
| 时间格式 | ISO 8601(`ReplayRowDto.at`) |

---

## API 索引

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/mass` | 否 | 读取出生质量 |
| POST | `/api/mass` | 否 | 设置出生质量 |
| GET | `/server-info/{mode}` | 否 | 人数统计(带 CORS) |
| GET | `/api/diag/linesplit` | 否 | 分裂几何诊断探针 |
| GET | `/api/panel/auth` | 否 | 认证状态 |
| POST | `/api/panel/auth` | 否 | 登录 / 首次设密码 |
| POST | `/api/panel/logout` | 否 | 登出 |
| GET | `/api/panel/state` | **是** | 实时世界统计 |
| POST | `/api/panel/set` | **是** | 批量修改运行参数 |
| GET | `/api/panel/players` | **是** | 玩家/bot 列表 |
| GET | `/api/panel/ai` | **是** | bot AI 诊断快照 |
| POST | `/api/replay/upload` | 否 | 上传回放 |
| GET | `/api/replay/list` | 否 | 回放列表 |
| GET | `/api/replay/download/{name}` | 否 | 下载回放 |
| GET | `/` | 否 | 控制面板页面 |
| GET | `/panel` | 否 | 控制面板页面(别名) |

---

## 公开端点

### GET /api/mass

读取当前出生质量。

**响应** `200 application/json`

{ "mass": 500 }


| 字段 | 类型 | 说明 |
|---|---|---|
| `mass` | number | 出生质量，范围 `10 ~ 50000` |

---

### POST /api/mass

设置出生质量。值会被 `Math.Clamp(m, 10f, 50000f)` 夹取。

**请求体**

{ "mass": 5000 }


**响应** `200 application/json` —— 返回夹取后的实际值

{ "mass": 5000 }


> **注意**：此端点**不写** `config.json`，重启后丢失。持久化请用 `POST /api/panel/set`。

**curl 示例**

curl -X POST http://localhost:4002/api/mass \
     -H "Content-Type: application/json" \
     -d '{"mass":5000}'


---

### GET /server-info/{mode}

按模式返回在线人数。用于大厅人数轮询，**已配置 CORS** 允许 `http://localhost:8123` / `http://127.0.0.1:8123`。

**路径参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `mode` | string | `domination` / `megasplit` / `extreme` / `novirus` / `instamerge` / `ffa` |

**人数口径**

| `mode` | 计算方式 |
|---|---|
| `ffa` | 仅 bot 数 |
| `extreme` | 真人 + bot |
| `domination` / `megasplit` | 仅真人 |
| 其他 | 仅 bot 数 |

**响应** `200 application/json`

{ "players": 20, "spectators": 0 }


| 字段 | 类型 | 说明 |
|---|---|---|
| `players` | number | 该模式在线人数 |
| `spectators` | number | 旁观数(**恒为 0**，预留字段) |

---

## 面板认证

### GET /api/panel/auth

查询当前认证状态。**前端根据此端点决定弹「设置密码」还是「登录」框。**

**响应** `200 application/json`

{ "needSetup": false, "authed": false }


| 字段 | 类型 | 说明 |
|---|---|---|
| `needSetup` | bool | `true` = 从未设置密码，需首次设置 |
| `authed` | bool | `true` = 当前 Cookie 有效已登录 |

> `authed` 仅在 `needSetup == false` 时才可能为 `true`(`!needSetup && PanelAuthed(ctx)`)。

---

### POST /api/panel/auth

登录，或首次设置密码。**同一端点承担两种职责**，行为由服务端 `panelPasswordHash` 状态决定。

**请求体**

{ "password": "test1234" }


**行为分支**

| 条件 | 结果 |
|---|---|
| `password` 为空 | `400` `{"ok":false,"error":"密码不能为空"}` |
| 首次设置 且 `password.Length < 4` | `400` `{"ok":false,"error":"密码至少 4 位"}` |
| 首次设置 且 长度合法 | `200` `{"ok":true,"setup":true}` + 写 hash + 下发 Cookie |
| 已设置 且 hash 匹配 | `200` `{"ok":true}` + 下发 Cookie |
| 已设置 且 hash 不匹配 | `401` `{"ok":false,"error":"密码错误"}` |

**成功响应** `200 application/json`

{ "ok": true }


首次设置时额外带 `setup`：

{ "ok": true, "setup": true }


**响应头**

Set-Cookie: panel_auth=<32位hex>; HttpOnly; SameSite=Lax; Path=/


> **安全细节**
> - 密码比较使用 `CryptographicOperations.FixedTimeEquals` **固定时间比较**，防时序侧信道攻击
> - 比较的是两侧 SHA256 十六进制**字节串**，长度不等直接短路

---

### POST /api/panel/logout

登出：从内存 `panelTokens` 移除 token，并删除 Cookie。

**响应** `200 application/json`

{ "ok": true }


**响应头**

Set-Cookie: panel_auth=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/


---

## 面板数据

> 以下端点全部受门禁保护，未认证返回 `401 {"error":"unauthorized"}`。

### GET /api/panel/state

实时世界统计快照。**面板顶部卡片的数据源。**

**响应** `200 application/json`

{
  "tick": 1602,
  "bots": 20,
  "botTarget": 20,
  "real": 0,
  "viruses": 10,
  "virusTarget": 10,
  "food": 1000,
  "ejected": 0,
  "cells": 1348,
  "spawnMass": 500,
  "autoSplitMass": 20000,
  "autoSplitEnabled": true,
  "subSpawnEnabled": true,
  "decayScale": 0.3,
  "ejectSize": 38,
  "ejectSizeLoss": 38,
  "ejectDistance": 1400,
  "botDifficulty": "Impossible",
  "top": [
    { "nick": "Bot1 🤖", "mass": 500, "cells": 1 }
  ],
  "dominanceNick": "Nova",
  "dominanceRatio": 0.903,
  "dominanceRemainingTicks": 122,
  "dominanceWipes": 1
}


| 字段 | 类型 | 说明 |
|---|---|---|
| `tick` | int | 世界主循环帧计数 |
| `bots` | int | 当前 bot 数 |
| `botTarget` | int | bot 目标数(配置值) |
| `real` | int | 真人玩家数(**仅统计有细胞的**) |
| `viruses` | int | 当前刺球数 |
| `virusTarget` | int | 刺球目标数 |
| `food` | int | 食物数 |
| `ejected` | int | 场上孢子数 |
| `cells` | int | 细胞总数(含食物/刺球/孢子) |
| `spawnMass` | number | 出生质量 |
| `autoSplitMass` | number | 自动分裂阈值 |
| `autoSplitEnabled` | bool | 是否启用 20k 自动分裂 |
| `subSpawnEnabled` | bool | 是否允许创建子球 |
| `decayScale` | number | 质量衰减倍率(`0 ~ 5`) |
| `ejectSize` | number | 孢子质量(`10 ~ 100`) |
| `ejectSizeLoss` | number | 吐球损耗(`10 ~ 100`) |
| `ejectDistance` | number | 吐球射程/速度(`200 ~ 5000`) |
| `botDifficulty` | string | `Easy` / `Medium` / `Hard` / `Impossible` |
| `top` | array | 质量前 8 名 |
| `dominanceNick` | string | 当前霸屏者昵称(空 = 无) |
| `dominanceRatio` | number | 霸屏者质量占比(`0 ~ 1`) |
| `dominanceRemainingTicks` | int | 距清场剩余 tick(`-1` = 未进入倒计时) |
| `dominanceWipes` | int | 服务启动以来累计清场次数 |

**`top[]` 元素结构**

| 字段 | 类型 | 说明 |
|---|---|---|
| `nick` | string | 昵称 + 类型后缀(` 🤖` = bot，` 👤` = 真人) |
| `mass` | int | 总质量 |
| `cells` | int | 细胞数(分身数) |

---

### POST /api/panel/set

**批量修改运行参数**。请求体为宽松 JSON——只处理出现的字段，未出现的保持不变。可持久化参数会写入 `config.json`。

**请求体**(所有字段可选)

{
  "bots": 100,
  "viruses": 10,
  "spawnMass": 500,
  "autoSplitMass": 20000,
  "difficulty": "impossible",
  "decayScale": 0.3,
  "ejectSize": 38,
  "ejectSizeLoss": 38,
  "ejectDistance": 1400,
  "autoSplitEnabled": true,
  "subSpawnEnabled": true,
  "killId": 12345,
  "killNick": "Bot1",
  "massId": 12345,
  "massNick": "Bot1",
  "mass": 50000
}


#### 参数表

| 字段 | 类型 | 夹取范围 | 持久化 | 说明 |
|---|---|---|---|---|
| `bots` | int | `0 ~ 500` | ✅ | bot 数量 |
| `viruses` | int | `0 ~ 200` | ✅ | 刺球数量 |
| `spawnMass` | number | `10 ~ 50000` | ✅ | 出生质量 |
| `autoSplitMass` | number | `≥ 100` | ✅ | 自动分裂阈值 |
| `difficulty` | string | 枚举 | ✅ | `easy`/`medium`/`hard`/`impossible`(大小写不敏感) |
| `decayScale` | number | `0 ~ 5` | ✅ | 质量衰减倍率 |
| `ejectSize` | number | `10 ~ 100` | ✅ | 孢子质量 |
| `ejectSizeLoss` | number | `10 ~ 100` | ✅ | 吐球损耗 |
| `ejectDistance` | number | `200 ~ 5000` | ✅ | 吐球射程/速度 |
| `autoSplitEnabled` | bool | — | ✅ | 自动分裂开关 |
| `subSpawnEnabled` | bool | — | ✅ | 允许创建子球开关 |
| `killId` | uint | — | ❌ | 按 ID 击杀玩家 |
| `killNick` | string | — | ❌ | 按昵称击杀玩家 |
| `massId` | uint | — | ❌ | 按 ID 设置质量(**需搭 `mass`**) |
| `massNick` | string | — | ❌ | 按昵称设置质量(**需搭 `mass`**) |
| `mass` | number | — | ❌ | 目标质量值 |

#### 逻辑要点

- **击杀优先按 ID**：`killId` 存在则用 ID，否则回落到 `killNick`(`else if` 分支)
- **质量修改同理**：`massId` + `mass` 同时存在才生效，否则尝试 `massNick` + `mass`
- **持久化触发**：任一带 ✅ 的字段变更 → 整份 `SaveConfig()` 写 `config.json`
- **全程持 `WorldLock`**：与世界主循环互斥，避免字典并发修改

**响应** `200 application/json`

{
  "ok": true,
  "results": [
    "bots=100 (added 80, removed 0)",
    "viruses=10 (removed 0, added 0)",
    "spawnMass=500",
    "autoSplitMass=20000",
    "bot difficulty = Impossible BotParams{...}",
    "killed bot [Bot1] id=12345 mass=500 cells=1 (by id)"
  ]
}


**`results[]` 说明**：每处理一个字段追加一条**人类可读**的结果字符串，内容由对应 `GameWorld` 方法返回。

| 操作 | 结果字符串格式 |
|---|---|
| `bots` | `bots=N (added X, removed Y)` |
| `viruses` | `viruses=N (removed X, added Y)` |
| `spawnMass` | `spawnMass=<值>` |
| `autoSplitMass` | `autoSplitMass=<值>` |
| `difficulty` | `bot difficulty = <枚举> <参数表>` 或 `unknown difficulty '<输入>' (easy\|medium\|hard\|impossible)` |
| `decayScale` | `decayScale=<值>` |
| `ejectSize` | `ejectSize=<值>` |
| `ejectSizeLoss` | `ejectSizeLoss=<值>` |
| `ejectDistance` | `ejectDistance=<值>` |
| `autoSplitEnabled` | `autoSplitEnabled=<true\|false>` |
| `subSpawnEnabled` | `subSpawnEnabled=<true\|false>` |
| `killId`/`killNick` | `killed <bot\|player> [<昵称>] id=<id> mass=<质量> cells=<细胞数> (<方式>)` 或 `id=N not found` / `nick not found` |
| `massId`/`massNick` | 成功返回 `SetPlayerMass` 说明，失败 `id=N not found` / `nick not found` |

**curl 示例**

# 设置 100 个 bot + IMPOSSIBLE 难度(带 Cookie)
curl -b cookies.txt -X POST http://localhost:4002/api/panel/set \
     -H "Content-Type: application/json" \
     -d '{"bots":100,"difficulty":"impossible"}'

# 击杀指定昵称的玩家
curl -b cookies.txt -X POST http://localhost:4002/api/panel/set \
     -H "Content-Type: application/json" \
     -d '{"killNick":"Bot1"}'

# 把自己的质量改成 100000
curl -b cookies.txt -X POST http://localhost:4002/api/panel/set \
     -H "Content-Type: application/json" \
     -d '{"massNick":"MyName","mass":100000}'


---

### GET /api/panel/players

全部在线玩家 / bot 列表，**按质量降序**(与排行榜顺序一致)。

**响应** `200 application/json` —— **数组**

[
  {
    "id": 12345,
    "nick": "Bot1",
    "isBot": true,
    "mass": 500,
    "cells": 1,
    "alive": true,
    "x": 7000,
    "y": 7000
  }
]


| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uint | 玩家唯一 ID |
| `nick` | string | 昵称 |
| `isBot` | bool | 是否 AI |
| `mass` | int | 总质量 |
| `cells` | int | 细胞数(分身数) |
| `alive` | bool | 是否有存活细胞 |
| `x` | int | 细胞质心 X(无细胞时为 `0`) |
| `y` | int | 细胞质心 Y(无细胞时为 `0`) |

> **过滤规则**：跳过「无细胞的真人」(断线残留)，但保留无细胞的 bot(显示为死亡)。

---

### GET /api/panel/ai

**bot AI 诊断快照** —— 调试与自动化测试专用。含状态机档位、威胁/猎物来源、分组、位置。

**响应** `200 application/json` —— **数组**

**存活 bot**

{
  "nick": "Bot1",
  "alive": true,
  "mass": 500,
  "cells": 2,
  "tab1": 1,
  "tab2": 1,
  "mass1": 300,
  "mass2": 200,
  "state": 3,
  "stateTicks": 42,
  "farming": false,
  "x": 7000,
  "y": 7000,
  "maxR": 30,
  "threat": "Bot5",
  "threatIsBot": true,
  "threatD": 450,
  "prey": "Bot7",
  "huntD": 820,
  "difficulty": "Impossible"
}


**死亡 bot**

{ "nick": "Bot2", "alive": false }


| 字段 | 类型 | 说明 |
|---|---|---|
| `nick` | string | bot 昵称 |
| `alive` | bool | 是否有存活细胞(`false` 时其余字段全缺省) |
| `mass` | int | 总质量 |
| `cells` | int | 细胞总数 |
| `tab1` / `tab2` | int | 各分页组细胞数 |
| `mass1` / `mass2` | int | 各分页组质量 |
| `state` | int | AI 状态机档位(**整数枚举**，非字符串) |
| `stateTicks` | int | 当前状态已持续 tick 数 |
| `farming` | bool | 是否处于「刷食」模式(`FarmUntilTick > Tick`) |
| `x` / `y` | int | 细胞质心坐标 |
| `maxR` | int | 最大细胞半径 |
| `threat` | string? | 当前威胁来源昵称(无则省略) |
| `threatIsBot` | bool? | 威胁是否 bot |
| `threatD` | int | 到威胁的距离(`-1` = 无威胁) |
| `prey` | string? | 当前猎物昵称(无则省略) |
| `huntD` | int | 到猎物距离(`-1` = 无猎物) |
| `difficulty` | string? | 该 bot 的难度档 |

> **为什么位置重要**：只看 `mass` / `cells` 看不出 bot「呆」(站着不动质量照样涨)，必须结合 `x` / `y` 才能判断是否卡死。

---

## 回放管理

> 回放文件存于 `ContentRoot/replays/`，**不经面板认证**(游戏功能)。
> 文件名限制：`yyyymmdd_hhmmss.astr.io`，正则 `^\d{8}_\d{6}\.astr\.io$`(防路径穿越)。

### POST /api/replay/upload

上传回放文件。**同一秒内重存会覆盖同名文件。**

**请求**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|---|---|---|
| `file` | file | 回放文件，**≤ 20MB** |

**成功响应** `200 application/json`

{ "ok": true, "name": "20260913_143025.astr.io", "size": 1048576 }


**失败响应**

| 状态码 | 响应体 | 触发条件 |
|---|---|---|
| `400` | `{"error":"form-data required"}` | 非 multipart 请求 |
| `400` | `{"error":"file missing"}` | 无 `file` 字段或长度 0 |
| `400` | `{"error":"too large (>20MB)"}` | 超过 20MB |
| `400` | `{"error":"bad name"}` | 文件名不匹配正则 |

> 端点带 `.DisableAntiforgery()` —— 客户端 JS 直接 POST 无需 CSRF token。

---

### GET /api/replay/list

列出服务器上全部回放，**按文件名倒序**(= 时间倒序)。

**响应** `200 application/json` —— **数组**

[
  {
    "name": "20260913_143025.astr.io",
    "size": 1048576,
    "at": "2026-09-13T14:30:25Z"
  }
]


| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 文件名 |
| `size` | long | 字节数 |
| `at` | string | 最后写入时间(ISO 8601 UTC) |

---

### GET /api/replay/download/{name}

下载回放文件。浏览器会直接触发存盘；移动端由下载管理器接管。

**路径参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `name` | string | 文件名(须匹配 `^\d{8}_\d{6}\.astr\.io$`) |

**成功响应** `200 application/octet-stream`

Content-Disposition: attachment; filename="20260913_143025.astr.io"
<二进制文件流>


**失败响应**

| 状态码 | 响应体 | 触发条件 |
|---|---|---|
| `400` | `{"error":"bad name"}` | 文件名非法 |
| `404` | `{"error":"not found"}` | 文件不存在 |

---

## 页面路由

### GET /、GET /panel

两者返回**同一份** `panel.html`(控制面板 UI)。

**查找顺序**

1. `{ContentRoot}/panel.html` —— 开发时(`dotnet run`)
2. `{ContentRoot}/bin/Debug/net{版本}/panel.html` —— 调试发布
3. `{AppContext.BaseDirectory}/panel.html` —— AOT 独立发布

**响应** `200 text/html; charset=utf-8`

**失败响应** `500 text/plain`

panel.html not found (build copies it to output)


> **实现**：抽出 `ServePanelAsync(HttpContext, IWebHostEnvironment)` 静态辅助函数，两个 `MapGet` 共用。
>
> **注意**：原先的 `app.UseDefaultFiles()` 已注释 —— 防止 `vanillaRoot` 出现 `index.html` 时抢走 `/` 路由。

### 静态文件托管

仓库根目录(`ContentRoot/../..`)的静态文件仍通过 `PhysicalFileProvider` 挂载，`ServeUnknownFileTypes = true`。

### 兜底路由

app.Map("/{*path}", async (HttpContext ctx) =>
{
    if (ctx.WebSockets.IsWebSocketRequest) { await WsHandler(...); return; }
    ctx.Response.StatusCode = 404;
});


- **WebSocket 升级请求** → 按路径/端口推断游戏模式，交给 `WsHandler`
- **普通 HTTP 请求** → `404`(静态中间件已在前面处理过)

---

## 错误响应

### 通用错误体

{ "error": "unauthorized" }


### 状态码汇总

| 状态码 | 场景 | 响应体示例 |
|---|---|---|
| `200` | 成功 | 各端点 DTO |
| `400` | 参数非法 | `{"error":"bad name"}` |
| `401` | 未认证 / 密码错误 | `{"error":"unauthorized"}` 或 `{"ok":false,"error":"密码错误"}` |
| `404` | 资源不存在 / 未匹配路由 | `{"error":"not found"}` |
| `500` | 服务端错误(如 panel.html 缺失) | 纯文本 |

---

## WebSocket 端口对照

| 端口 | 协议 | 用途 |
|---|---|---|
| `3000` | WebSocket | domination 模式 |
| `3001` | WebSocket | megasplit 模式(64 人) |
| `3050` | WebSocket | extreme 模式(256 人) |
| `3005` | WebSocket | chat 桩(协议未逆向，静默接收) |
| **`4002`** | **HTTP** | **本文档所有端点 + 静态文件 + 面板** |

**客户端直连格式**：`ws://<host>:<port>/<mode>`(如 `ws://localhost:3050/extreme`)，不带 `/ws` 前缀。

模式推断逻辑(兜底路由内)：

var portMode = port switch { 3001 => "megasplit", 3050 => "extreme", _ => "domination" };
var mode = new[] { "domination","megasplit","extreme","novirus","instamerge","ffa" }.Contains(pathMode)
    ? pathMode : portMode;


---

## 世界常量与保底机制

### 世界尺寸

| 常量 | 值 | 说明 |
|---|---|---|
| `GameWorld.BorderMin` | `0f` | 地图左下角坐标 |
| `GameWorld.BorderMax` | `28284f` | 地图边长(**原 14142,已扩大一倍**) |
| `GameWorld.BorderPad` | `40f` | 边界内缩(修复小球贴边瞬移) |

**推导**：原版 `14142 ≈ √2 × 10000`(10000×10000 正方形内切圆半径)。当前扩为 **28284(×2)**，面积 ×4，地图中心 `14142`。

**协议安全性**：世界帧 / 边界帧坐标走 `U16`(上限 65535)，`28284` 在范围内。

**连带生效**(改一处全自动跟随)：`RandPos()`(食物/刺球/出生点分布)、`StepCore` 移动 clamp、`SpawnSubNear` 落点校验、`Split`/`Eject` 弹射终点、`Player` 默认鼠标(= 地图中心)。

> ⚠️ **副作用**：地图面积 ×4 但资源参数未变(`FoodTarget = 1000` / `VirusTarget = 3`)，食物密度降为原来的 1/4。开局发育变慢、霸屏更难达成。

---

### 霸屏保底(Anti-Dominance)

**目标**：单个玩家质量占比过高时，**5 秒后清场**，防止一人碾压全场导致对局无趣。

**源文件**：`Game/AntiDominance.cs`(纯函数状态机) + `GameWorld.CheckDominance()`(落地执行)

#### 触发条件(全部满足)

| 条件 | 常量 | 默认值 | 说明 |
|---|---|---|---|
| 单人质量 / 全服质量 | `RatioThreshold` | `0.80` | 占比 ≥ 80% |
| 全服总质量 | `MinTotalMass` | `5000f` | 防止开局误判 |
| 单人绝对质量 | `MinPlayerMass` | `3000f` | 防止「只有一人」被算成 100% |
| 在场玩家数 | `MinPlayers` | `2` | 至少 2 人才判定 |

#### 时序

检测命中 -> armedTick = 当前 tick
         |
         v  (每 tick 递减)
   5 秒倒计时(125 tick @ 40ms)
         |
         v  期间霸屏者质量掉回阈值以下 -> armedTick = -1 复位(取消)
         |
         v  倒计时归零
     清场 ClearAllPlayers()
         |
         v
   10 秒冷却(250 tick),期间不检测


| 常量 | 计算 | 值 |
|---|---|---|
| `AntiDominance.CountdownTicks` | `5000 / TickMs` | `125` |
| `AntiDominance.CooldownTicks` | `10000 / TickMs` | `250` |

#### 清场行为

| 对象 | 处理 |
|---|---|
| 所有细胞 | 从 `Cells` 移除，id 写入 `RemovedIds`(50 号帧 removed 段，客户端同步清残球) |
| **bot** | 清空后**立即 `Spawn` 重生**(维持数量) |
| **真人** | 清空细胞但**保留 Player 对象**，等客户端重发 30 号出生包(服务端不越权) |
| `PendingSplits` / `ActiveTab` | 复位(`0` / `1`) |

#### 可观测状态

`/api/panel/state` 暴露 4 个字段：`dominanceNick` / `dominanceRatio` / `dominanceRemainingTicks` / `dominanceWipes`。

**实测验证**(把 bot `Nova` 灌到 100k 质量)：

灌质量后  -> dominance: Nova 0.903 remain: 122 wipes: 0
             top1: {'nick': 'Nova', 'mass': 100531, 'cells': 129}

等 6 秒后 -> dominance: Echo 0.056 remain: -1 wipes: 1
             top3: [('Echo', 602), ('Comet', 564), ('Pulsar', 563)]


全场清空重生，倒计时复位，`wipes` 计数 +1。

---

## 实现说明

### AOT 兼容性

本项目已适配 **Native AOT**(`PublishAot=true`)。关键约束：

1. **所有 `Results.Json` 必须传显式 DTO + `JsonTypeInfo`**

   // ❌ AOT 下运行时抛 NotSupportedException
   return Results.Json(new { mass = loop.WorldRef.SpawnMass });
   // ✅
   return Results.Json(new MassDto(loop.WorldRef.SpawnMass), JsonApiContext.Default.MassDto);
   

2. **禁止反射序列化**(`JsonSerializer.Serialize<T>(obj)` 无 context 版本)

3. **禁止 `GetType().GetProperty(...)` 反射取值**(`ListPlayers` 曾用它排序，已改强类型)

4. **字段命名策略必须显式声明**

   [JsonSourceGenerationOptions(
       WriteIndented = false,
       PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
       DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
   public partial class JsonApiContext : JsonSerializerContext { }
   

   > ⚠️ **不带 `PropertyNamingPolicy` 时，source-gen 默认输出 PascalCase**(`{"Ok":true}`)，前端读 `data.ok` 拿到 `undefined` → 表现为「HTTP 200 但操作失败」。

5. **DTO 定义集中在 `ApiDtos.cs`**，另加 `[JsonSerializable(typeof(...))]` 注册

### 并发模型

| 部分 | 模型 |
|---|---|
| 世界模拟 | 单线程(`GameLoop` 的 `PeriodicTimer` 循环) |
| WS 接收 | 每连接一个 Task |
| HTTP API | Kestrel 线程池 |
| 状态修改 | 全局 `WorldLock` 串行化 |
| 每连接发送 | `Session._txGate` 信号量 |

**所有 `/api/panel/*` 写操作都持 `WorldLock`**，与主循环互斥。

### 配置持久化

- 路径：`{ContentRoot}/config.json`(**不是项目根目录**，是 exe 所在目录)
- 加载：启动时 `world.LoadConfig()` **只跑一次**
- 保存：`POST /api/panel/set` 中任一可持久化字段变更 → `world.SaveConfig()`
- **改配置文件后必须重启服务才生效**

---

*文档生成于 2026-09-13 · 对应 `AstrIO.Server` @ net10.0*
