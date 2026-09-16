using System.Net.WebSockets;
using System.Text.Json;
using System.Text.RegularExpressions;
using AstrIO.Server;
using AstrIO.Server.Game;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Information);
builder.Services.AddSingleton<GameLoop>();
// server-info 人数轮询来自本地页面源(http://localhost:8123),需 CORS
builder.Services.AddCors(o => o.AddPolicy("poll", p => p
    .WithOrigins("http://localhost:8123", "http://127.0.0.1:8123")
    .AllowAnyMethod()));
// 多端口监听：与 Node 私服完全一致
//   3000 domination / 3001 megasplit(64) / 3050 extreme(256) / 4002 HTTP 静态+API / 3005 chat 桩
builder.WebHost.UseUrls(
    "http://0.0.0.0:3000", "http://0.0.0.0:3001",
    "http://0.0.0.0:3050", "http://0.0.0.0:4002", "http://0.0.0.0:3005");

var app = builder.Build();
var gameLoop = app.Services.GetRequiredService<GameLoop>();
// 读取持久化配置(首次运行写出默认 config.json)并注入路径供后续保存
var world = gameLoop.WorldRef;
world.ConfigPath = Path.Combine(app.Environment.ContentRootPath, "config.json");
world.LoadConfig();
app.UseCors("poll");

// ---------- 控制面板密码校验 ----------
// 密码以 SHA256 十六进制存 config.json（**明文不落盘**）。
// 存储值为空 / 非 64 位十六进制 = 尚未设置 → 首次访问时要求用户设置密码。
// 登录成功发一个随机 token（内存态，重启失效需重登），Cookie: panel_auth。
var panelTokens = new HashSet<string>();

static string Sha256Hex(string s) =>
    Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
        System.Text.Encoding.UTF8.GetBytes(s))).ToLowerInvariant();

static bool IsValidHash(string? h) =>
    !string.IsNullOrWhiteSpace(h) && h.Length == 64 && h.All(Uri.IsHexDigit);

bool PanelAuthed(HttpContext ctx) =>
    ctx.Request.Cookies.TryGetValue("panel_auth", out var t) && t != null && panelTokens.Contains(t);

void Grant(HttpContext ctx)
{
    var token = Guid.NewGuid().ToString("N");
    panelTokens.Add(token);
    ctx.Response.Cookies.Append("panel_auth", token, new CookieOptions
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Lax,
        Path = "/",
    });
}

// 拦 /api/panel/*（auth 端点本身除外）：未认证一律 401，前端据此弹登录框
app.Use(async (ctx, next) =>
{
    var path = ctx.Request.Path.Value ?? "";
    if (path.StartsWith("/api/panel") && !path.StartsWith("/api/panel/auth") && !PanelAuthed(ctx))
    {
        ctx.Response.StatusCode = 401;
        await ctx.Response.WriteAsJsonAsync(new ApiErrorDto("unauthorized"), JsonApiContext.Default.ApiErrorDto);
        return;
    }
    await next();
});

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

// 原版客户端静态文件（仓库根：index.html + js/ 等,与 Node 私服同布局）
var vanillaRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
if (Directory.Exists(vanillaRoot))
{
    // app.UseDefaultFiles();  // 根路径已交给控制面板,静态中间件不再抢 /
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(vanillaRoot),
        ServeUnknownFileTypes = true,
    });
}

var loopCts = new CancellationTokenSource();
_ = gameLoop.RunAsync(loopCts.Token);

// WebSocket：/ws/{mode} + 根路径（客户端 localPorts 直连 ws://host:port/ 不带 /ws 前缀）。
// Map("/") 匹配所有路径,非 WS 请求回 404 让静态文件已在上面中间件处理。
app.Map("/ws/{mode}", (HttpContext ctx) => WsHandler(ctx, ctx.GetRouteValue("mode")?.ToString() ?? "extreme"));
app.Map("/{*path}", async (HttpContext ctx) =>
{
    if (ctx.WebSockets.IsWebSocketRequest)
    {
        // 客户端 asia 区连接形如 ws://localhost:3050/extreme(带模式 path);
        // 优先取 path 段,非法值回落到端口推断:3001=megasplit 3050=extreme 其余=domination
        var pathMode = ctx.Request.Path.Value?.Trim('/') ?? "";
        var port = ctx.Connection.LocalPort;
        var portMode = port switch { 3001 => "megasplit", 3050 => "extreme", _ => "domination" };
        var mode = new[] { "domination", "megasplit", "extreme", "novirus", "instamerge", "ffa" }.Contains(pathMode)
            ? pathMode : portMode;
        await WsHandler(ctx, mode);
        return;
    }
    ctx.Response.StatusCode = 404;
});

static async Task WsHandler(HttpContext ctx, string mode)
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var gameLoop = ctx.RequestServices.GetRequiredService<GameLoop>();
    var lifetime = ctx.RequestServices.GetRequiredService<IHostApplicationLifetime>();
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var session = gameLoop.AddSession(ws, mode);
    // astrio 原版协议:连接建立即下发 33B 种子帧 + 150/174/175 握手序列
    await session.SendSeedAsync(lifetime.ApplicationStopping);
    var runTask = session.RunAsync(lifetime.ApplicationStopping);
    await Task.WhenAny(runTask, Task.Delay(Timeout.Infinite, ctx.RequestAborted));
    gameLoop.RemoveSession(session);
}

// ---------- HTTP API（对齐 mock-server httpHandler） ----------

app.MapGet("/api/mass", (GameLoop loop) => Results.Json(new MassDto(loop.WorldRef.SpawnMass), JsonApiContext.Default.MassDto));
app.MapPost("/api/mass", async (HttpContext ctx, GameLoop loop) =>
{
    using var doc = await System.Text.Json.JsonDocument.ParseAsync(ctx.Request.Body);
    if (doc.RootElement.TryGetProperty("mass", out var m))
        loop.WorldRef.SetSpawnMass(m.GetSingle());
    return Results.Json(new MassDto(loop.WorldRef.SpawnMass), JsonApiContext.Default.MassDto);
});
app.MapGet("/server-info/{mode}", (string mode, GameLoop loop) =>
{
    // 人数口径对齐 mock-server:extreme=真人+bot,ffa=bot,其余=真人
    int real = 0;
    foreach (var s in loop.WorldRef.Players.Values)
        if (!s.IsBot && s.Cells.Count > 0) real++;
    var bots = loop.WorldRef.Bots.Count;
    var players = mode switch
    {
        "ffa" => bots,
        "extreme" => real + bots,
        "domination" or "megasplit" => real,
        _ => bots,
    };
    return Results.Json(new ServerInfoDto(players, 0), JsonApiContext.Default.ServerInfoDto);
})
.RequireCors("poll");

// 3005 已由 UseUrls 监听：聊天协议未逆向,根路径 WebSocket 静默接收（避免客户端报错断线）
app.Map("/chat", async (HttpContext ctx) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var buf = new byte[16 * 1024];
    while (!ctx.RequestAborted.IsCancellationRequested && ws.State == WebSocketState.Open)
    {
        var res = await ws.ReceiveAsync(buf, ctx.RequestAborted);
        if (res.MessageType == WebSocketMessageType.Close) break;
        // 静默接收：原始聊天协议未完整逆向,不回包
    }
});

// ---------- Web 控制面板（实时生效） ----------

/// <summary>认证状态：needSetup = 从未设置密码（要求首次设置），authed = 已登录。</summary>
app.MapGet("/api/panel/auth", (HttpContext ctx, GameLoop loop) =>
{
    var needSetup = !IsValidHash(loop.WorldRef.PanelPasswordHash);
    return Results.Json(new PanelAuthDto(needSetup, !needSetup && PanelAuthed(ctx)), JsonApiContext.Default.PanelAuthDto);
});

/// <summary>登录 / 首次设置密码。请求体 { password }。</summary>
app.MapPost("/api/panel/auth", async (HttpContext ctx, GameLoop loop) =>
{
    var pwd = "";
    try
    {
        using var doc = await JsonDocument.ParseAsync(ctx.Request.Body, cancellationToken: ctx.RequestAborted);
        if (doc.RootElement.TryGetProperty("password", out var pe)) pwd = pe.GetString() ?? "";
    }
    catch { /* 体不合法 → 当空密码处理 */ }

    if (pwd.Length == 0)
        return Results.Json(new PanelAuthResult(false, "密码不能为空"), JsonApiContext.Default.PanelAuthResult, statusCode: 400);

    var w = loop.WorldRef;

    // ---- 首次：设置密码 ----
    if (!IsValidHash(w.PanelPasswordHash))
    {
        if (pwd.Length < 4)
            return Results.Json(new PanelAuthResult(false, "密码至少 4 位"), JsonApiContext.Default.PanelAuthResult, statusCode: 400);
        w.PanelPasswordHash = Sha256Hex(pwd);
        w.SaveConfig();
        Grant(ctx);
        return Results.Json(new PanelAuthResult(true, Setup: true), JsonApiContext.Default.PanelAuthResult);
    }

    // ---- 校验：比 SHA256 十六进制串，固定时间比较防时序侧信道 ----
    var given = System.Text.Encoding.UTF8.GetBytes(Sha256Hex(pwd));
    var stored = System.Text.Encoding.UTF8.GetBytes(w.PanelPasswordHash.Trim().ToLowerInvariant());
    if (given.Length != stored.Length ||
        !System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(given, stored))
        return Results.Json(new PanelAuthResult(false, "密码错误"), JsonApiContext.Default.PanelAuthResult, statusCode: 401);

    Grant(ctx);
    return Results.Json(new PanelAuthResult(true), JsonApiContext.Default.PanelAuthResult);
});

/// <summary>登出（丢弃 token + 清 Cookie）。</summary>
app.MapPost("/api/panel/logout", (HttpContext ctx) =>
{
    if (ctx.Request.Cookies.TryGetValue("panel_auth", out var t) && t != null) panelTokens.Remove(t);
    ctx.Response.Cookies.Delete("panel_auth", new CookieOptions { Path = "/" });
    return Results.Json(new OkDto(true), JsonApiContext.Default.OkDto);
});

// 控制面板：根路径 / 与 /panel 都返回 panel.html
static async Task ServePanelAsync(HttpContext ctx, IWebHostEnvironment env)
{
    // panel.html 查找顺序:ContentRoot(开发/dotnet run) → ContentRoot/bin/...(发布部署) → BaseDirectory
    var candidates = new[]
    {
        Path.Combine(env.ContentRootPath, "panel.html"),
        Path.Combine(env.ContentRootPath, "bin", "Debug", $"net{Environment.Version}", "panel.html"),
        Path.Combine(AppContext.BaseDirectory, "panel.html"),
    };
    var path = candidates.FirstOrDefault(File.Exists);
    if (path == null)
    {
        ctx.Response.StatusCode = 500;
        await ctx.Response.WriteAsync("panel.html not found (build copies it to output)", ctx.RequestAborted);
        return;
    }
    var html = await File.ReadAllTextAsync(path, ctx.RequestAborted);
    ctx.Response.ContentType = "text/html; charset=utf-8";
    await ctx.Response.WriteAsync(html, ctx.RequestAborted);
}

app.MapGet("/", (HttpContext ctx, IWebHostEnvironment env) => ServePanelAsync(ctx, env));
app.MapGet("/panel", (HttpContext ctx, IWebHostEnvironment env) => ServePanelAsync(ctx, env));

app.MapGet("/api/panel/state", (GameLoop loop) =>
{
    var w = loop.WorldRef;
    int real = 0;
    foreach (var p in w.Players.Values) if (!p.IsBot && p.Cells.Count > 0) real++;
    int viruses = 0, food = 0, ejected = 0;
    foreach (var c in w.Cells.Values)
    {
        if (c.IsVirus) viruses++;
        else if (c.IsFood) food++;
        else if (c.IsEjected) ejected++;
    }
    var top = w.Players.Values
        .Where(p => p.Cells.Count > 0)
        .OrderByDescending(p => p.MassTotal)
        .Take(8)
        .Select(p => new PanelTopDto(p.Nick + (p.IsBot ? " 🤖" : " 👤"), (int)p.MassTotal, p.Cells.Count))
        .ToList();
    return Results.Json(new PanelStateDto(
        Tick: w.Tick,
        Bots: w.Bots.Count,
        BotTarget: w.BotCount,
        Real: real,
        Viruses: viruses,
        VirusTarget: w.VirusTarget,
        Food: food,
        Ejected: ejected,
        Cells: w.Cells.Count,
        SpawnMass: w.SpawnMass,
        AutoSplitMass: GameWorld.AutoSplitMass,
        AutoSplitEnabled: GameWorld.AutoSplitEnabled,
        SubSpawnEnabled: GameWorld.SubSpawnEnabled,
        DecayScale: GameWorld.DecayScale,
        EjectSize: GameWorld.EjectSize,
        EjectSizeLoss: GameWorld.EjectSizeLoss,
        EjectDistance: GameWorld.EjectDistance,
        ViewBaseRadius: GameWorld.ViewBaseRadius,
        ViewMassFactor: GameWorld.ViewMassFactor,
        ViewCellBonus: GameWorld.ViewCellBonus,
        ViewMaxRadius: GameWorld.ViewMaxRadius,
        ViewCulling: GameWorld.ViewCulling,
        BotDifficulty: w.BotDifficulty.ToString(),
        Top: top,
        DominanceNick: w.DominanceNick,
        DominanceRatio: w.DominanceRatio,
        DominanceRemainingTicks: w.DominanceArmedTick < 0
            ? -1
            : Math.Max(0, AntiDominance.CountdownTicks - (w.Tick - w.DominanceArmedTick)),
        DominanceWipes: w.DominanceWipes), JsonApiContext.Default.PanelStateDto);
});

app.MapPost("/api/panel/set", async (HttpContext ctx, GameLoop loop) =>
{
    using var doc = await System.Text.Json.JsonDocument.ParseAsync(ctx.Request.Body, cancellationToken: ctx.RequestAborted);
    var root = doc.RootElement;
    var results = new List<string>();
    WorldLock.Lock();
    try
    {
        var changed = false;
        if (root.TryGetProperty("bots", out var botsEl) && botsEl.TryGetInt32(out var bots))
        {
            results.Add(loop.WorldRef.SetBots(bots));
            changed = true;
        }
        if (root.TryGetProperty("viruses", out var virEl) && virEl.TryGetInt32(out var vir))
        {
            results.Add(loop.WorldRef.SetViruses(vir));
            changed = true;
        }
        if (root.TryGetProperty("spawnMass", out var smEl) && smEl.TryGetSingle(out var sm))
        {
            loop.WorldRef.SetSpawnMass(sm);
            results.Add($"spawnMass={loop.WorldRef.SpawnMass}");
            changed = true;
        }
        if (root.TryGetProperty("autoSplitMass", out var asmEl) && asmEl.TryGetSingle(out var asm))
        {
            GameWorld.AutoSplitMass = MathF.Max(asm, 100f);
            results.Add($"autoSplitMass={GameWorld.AutoSplitMass}");
            changed = true;
        }
        if (root.TryGetProperty("difficulty", out var diffEl))
        {
            results.Add(loop.WorldRef.SetBotDifficulty(diffEl.GetString() ?? ""));
            changed = true;
        }
        if (root.TryGetProperty("decayScale", out var dscEl) && dscEl.TryGetSingle(out var dsc))
        {
            GameWorld.DecayScale = Math.Clamp(dsc, 0f, 5f);
            results.Add($"decayScale={GameWorld.DecayScale}");
            changed = true;
        }
        if (root.TryGetProperty("ejectSize", out var esEl) && esEl.TryGetSingle(out var es))
        {
            GameWorld.EjectSize = Math.Clamp(es, 10f, 100f);
            results.Add($"ejectSize={GameWorld.EjectSize}");
            changed = true;
        }
        if (root.TryGetProperty("ejectSizeLoss", out var eslEl) && eslEl.TryGetSingle(out var esl))
        {
            GameWorld.EjectSizeLoss = Math.Clamp(esl, 10f, 100f);
            results.Add($"ejectSizeLoss={GameWorld.EjectSizeLoss}");
            changed = true;
        }
        if (root.TryGetProperty("ejectDistance", out var edEl) && edEl.TryGetSingle(out var ed))
        {
            GameWorld.EjectDistance = Math.Clamp(ed, 200f, 5000f);
            results.Add($"ejectDistance={GameWorld.EjectDistance}");
            changed = true;
        }
        // 视野裁剪(float)
        if (root.TryGetProperty("viewBaseRadius", out var vbrEl) && vbrEl.TryGetSingle(out var vbr))
        {
            GameWorld.ViewBaseRadius = Math.Clamp(vbr, 200f, 20000f);
            results.Add($"viewBaseRadius={GameWorld.ViewBaseRadius}");
            changed = true;
        }
        if (root.TryGetProperty("viewMassFactor", out var vmfEl) && vmfEl.TryGetSingle(out var vmf))
        {
            GameWorld.ViewMassFactor = Math.Clamp(vmf, 0f, 50f);
            results.Add($"viewMassFactor={GameWorld.ViewMassFactor}");
            changed = true;
        }
        if (root.TryGetProperty("viewCellBonus", out var vcbEl) && vcbEl.TryGetSingle(out var vcb))
        {
            GameWorld.ViewCellBonus = Math.Clamp(vcb, 0f, 2000f);
            results.Add($"viewCellBonus={GameWorld.ViewCellBonus}");
            changed = true;
        }
        if (root.TryGetProperty("viewMaxRadius", out var vmrEl) && vmrEl.TryGetSingle(out var vmr))
        {
            GameWorld.ViewMaxRadius = Math.Clamp(vmr, 200f, 40000f);
            results.Add($"viewMaxRadius={GameWorld.ViewMaxRadius}");
            changed = true;
        }
        if (root.TryGetProperty("viewCulling", out var vcEl) && (vcEl.ValueKind == JsonValueKind.True || vcEl.ValueKind == JsonValueKind.False))
        {
            GameWorld.ViewCulling = vcEl.GetBoolean();
            results.Add($"viewCulling={GameWorld.ViewCulling}");
            changed = true;
        }
        // 开关类(bool)
        if (root.TryGetProperty("autoSplitEnabled", out var aseEl) && (aseEl.ValueKind == JsonValueKind.True || aseEl.ValueKind == JsonValueKind.False))
        {
            GameWorld.AutoSplitEnabled = aseEl.GetBoolean();
            results.Add($"autoSplitEnabled={GameWorld.AutoSplitEnabled}");
            changed = true;
        }
        if (root.TryGetProperty("subSpawnEnabled", out var sseEl) && (sseEl.ValueKind == JsonValueKind.True || sseEl.ValueKind == JsonValueKind.False))
        {
            GameWorld.SubSpawnEnabled = sseEl.GetBoolean();
            results.Add($"subSpawnEnabled={GameWorld.SubSpawnEnabled}");
            changed = true;
        }
        // 任何可持久化参数变更 → 写 config.json(重启后自动恢复)
        if (changed) loop.WorldRef.SaveConfig();
        if (root.TryGetProperty("killId", out var kidEl) && kidEl.TryGetUInt32(out var kid))
        {
            var r = loop.WorldRef.KillPlayer(kid);
            results.Add(r ?? $"id={kid} not found");
        }
        else if (root.TryGetProperty("killNick", out var knEl))
        {
            var r = loop.WorldRef.KillPlayer(knEl.GetString() ?? "");
            results.Add(r ?? "nick not found");
        }
        if (root.TryGetProperty("massId", out var midEl) && midEl.TryGetUInt32(out var mid)
            && root.TryGetProperty("mass", out var mvEl) && mvEl.TryGetSingle(out var mv))
        {
            var r = loop.WorldRef.SetPlayerMass(mid, mv);
            results.Add(r ?? $"id={mid} not found");
        }
        else if (root.TryGetProperty("massNick", out var mnEl)
            && root.TryGetProperty("mass", out var mv2El) && mv2El.TryGetSingle(out var mv2))
        {
            var r = loop.WorldRef.SetPlayerMass(mnEl.GetString() ?? "", mv2);
            results.Add(r ?? "nick not found");
        }
    }
    finally { WorldLock.Unlock(); }
    return Results.Json(new PanelSetDto(true, results), JsonApiContext.Default.PanelSetDto);
});

/// <summary>在线玩家/bot 全列表(击杀面板用)。</summary>
app.MapGet("/api/panel/players", (GameLoop loop) =>
{
    WorldLock.Lock();
    try { return Results.Json(loop.WorldRef.ListPlayers(), JsonApiContext.Default.ListPlayerRowDto); }
    finally { WorldLock.Unlock(); }
});

/// <summary>bot AI 诊断快照(状态机/威胁/猎物/位置/分组)—— 调试与自动化测试用。</summary>
app.MapGet("/api/panel/ai", (GameLoop loop) =>
{
    WorldLock.Lock();
    try { return Results.Json(loop.WorldRef.ListBotAi(), JsonApiContext.Default.ListBotAiRowDto); }
    finally { WorldLock.Unlock(); }
});
// ---------- 回放上传/下载（存 ContentRoot/replays/,不经面板认证——游戏功能） ----------
var replayDir = Path.Combine(app.Environment.ContentRootPath, "replays");
Directory.CreateDirectory(replayDir);

// 合法文件名:yyyymmdd_hhmmss.astr.io(防路径穿越)
static bool ValidReplayName(string? name) =>
    !string.IsNullOrWhiteSpace(name)
    && name.EndsWith(".astr.io")
    && Regex.IsMatch(name, @"^\d{8}_\d{6}\.astr\.io$");

/// <summary>上传回放。multipart/form-data 字段 file;同名覆盖(同一秒内重存)。</summary>
app.MapPost("/api/replay/upload", async (HttpContext ctx) =>
{
    var req = ctx.Request;
    if (!req.HasFormContentType)
        return Results.Json(new ApiErrorDto("form-data required"), JsonApiContext.Default.ApiErrorDto, statusCode: 400);
    var form = await req.ReadFormAsync(ctx.RequestAborted);
    var file = form.Files.GetFile("file");
    if (file == null || file.Length == 0)
        return Results.Json(new ApiErrorDto("file missing"), JsonApiContext.Default.ApiErrorDto, statusCode: 400);
    if (file.Length > 20 * 1024 * 1024)
        return Results.Json(new ApiErrorDto("too large (>20MB)"), JsonApiContext.Default.ApiErrorDto, statusCode: 400);
    var name = Path.GetFileName(file.FileName);
    if (!ValidReplayName(name))
        return Results.Json(new ApiErrorDto("bad name"), JsonApiContext.Default.ApiErrorDto, statusCode: 400);
    await using var fs = File.Create(Path.Combine(replayDir, name));
    await file.CopyToAsync(fs, ctx.RequestAborted);
    return Results.Json(new ReplayUploadDto(true, name, file.Length), JsonApiContext.Default.ReplayUploadDto);
}).DisableAntiforgery();

/// <summary>列出服务器上全部回放(名字+大小+时间,倒序)。</summary>
app.MapGet("/api/replay/list", () =>
{
    var list = Directory.GetFiles(replayDir, "*.astr.io")
        .Select(p => new FileInfo(p))
        .OrderByDescending(f => f.Name)
        .Select(f => new ReplayRowDto(f.Name, f.Length, f.LastWriteTimeUtc))
        .ToList();
    return Results.Json(list, JsonApiContext.Default.ListReplayRowDto);
});

/// <summary>下载回放(浏览器直接存盘;手机上由下载管理器接管)。</summary>
app.MapGet("/api/replay/download/{name}", (string name) =>
{
    if (!ValidReplayName(name)) return Results.Json(new ApiErrorDto("bad name"), JsonApiContext.Default.ApiErrorDto, statusCode: 400);
    var p = Path.Combine(replayDir, name);
    return File.Exists(p)
        ? Results.File(p, "application/octet-stream", name)
        : Results.Json(new ApiErrorDto("not found"), JsonApiContext.Default.ApiErrorDto, statusCode: 404);
});
app.Run();
