using System.Net.WebSockets;
using System.Text.Json;
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
app.UseCors("poll");
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

// 原版客户端静态文件（仓库根：index.html + js/ 等,与 Node 私服同布局）
var vanillaRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
if (Directory.Exists(vanillaRoot))
{
    app.UseDefaultFiles();
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

app.MapGet("/api/mass", (GameLoop loop) => Results.Json(new { mass = loop.WorldRef.SpawnMass }));
app.MapPost("/api/mass", async (HttpContext ctx, GameLoop loop) =>
{
    using var doc = await System.Text.Json.JsonDocument.ParseAsync(ctx.Request.Body);
    if (doc.RootElement.TryGetProperty("mass", out var m))
        loop.WorldRef.SetSpawnMass(m.GetSingle());
    return Results.Json(new { mass = loop.WorldRef.SpawnMass });
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
    return Results.Json(new { players, spectators = 0 });
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

app.MapGet("/panel", async (HttpContext ctx) =>
{
    // panel.html 查找顺序:ContentRoot(开发/dotnet run) → ContentRoot/bin/...(发布部署)
    var candidates = new[]
    {
        Path.Combine(app.Environment.ContentRootPath, "panel.html"),
        Path.Combine(app.Environment.ContentRootPath, "bin", "Debug", $"net{Environment.Version}", "panel.html"),
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
});

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
        .Select(p => new { nick = p.Nick + (p.IsBot ? " 🤖" : " 👤"), mass = (int)p.MassTotal, cells = p.Cells.Count })
        .ToList();
    return Results.Json(new
    {
        tick = w.Tick,
        bots = w.Bots.Count,
        botTarget = w.BotCount,
        real,
        viruses,
        virusTarget = w.VirusTarget,
        food,
        ejected,
        cells = w.Cells.Count,
        spawnMass = w.SpawnMass,
        autoSplitMass = GameWorld.AutoSplitMass,
        top,
    });
});

app.MapPost("/api/panel/set", async (HttpContext ctx, GameLoop loop) =>
{
    using var doc = await System.Text.Json.JsonDocument.ParseAsync(ctx.Request.Body, cancellationToken: ctx.RequestAborted);
    var root = doc.RootElement;
    var results = new List<string>();
    WorldLock.Lock();
    try
    {
        if (root.TryGetProperty("bots", out var botsEl) && botsEl.TryGetInt32(out var bots))
            results.Add(loop.WorldRef.SetBots(bots));
        if (root.TryGetProperty("viruses", out var virEl) && virEl.TryGetInt32(out var vir))
            results.Add(loop.WorldRef.SetViruses(vir));
        if (root.TryGetProperty("spawnMass", out var smEl) && smEl.TryGetSingle(out var sm))
        {
            loop.WorldRef.SetSpawnMass(sm);
            results.Add($"spawnMass={loop.WorldRef.SpawnMass}");
        }
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
    return Results.Json(new { ok = true, results });
});

/// <summary>在线玩家/bot 全列表（击杀面板用）。</summary>
app.MapGet("/api/panel/players", (GameLoop loop) =>
{
    WorldLock.Lock();
    try { return Results.Json(loop.WorldRef.ListPlayers()); }
    finally { WorldLock.Unlock(); }
});

app.Run();
