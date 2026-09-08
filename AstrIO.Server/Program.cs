using System.Net.WebSockets;
using AstrIO.Server;
using AstrIO.Server.Game;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.SetMinimumLevel(LogLevel.Information);
// GameLoop 注册为单例（WsHandler 静态方法通过 DI 解析）
builder.Services.AddSingleton<GameLoop>();
// 多端口监听：与 Node 私服完全一致（3000 domination / 3001 megasplit /
// 3050 extreme / 4002 HTTP 静态+API / 3005 chat 桩）
builder.WebHost.UseUrls(
    "http://0.0.0.0:3000", "http://0.0.0.0:3001",
    "http://0.0.0.0:3050", "http://0.0.0.0:4002", "http://0.0.0.0:3005");

var app = builder.Build();
var gameLoop = app.Services.GetRequiredService<GameLoop>();
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

// 静态文件：AstrIO.Client/wwwroot（客户端独立项目）
var clientRoot = Path.Combine(Directory.GetParent(app.Environment.ContentRootPath)!.FullName, "AstrIO.Client", "wwwroot");
if (Directory.Exists(clientRoot))
{
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(clientRoot) });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(clientRoot) });
}
else
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
}

// 原版客户端静态文件（项目根目录：index.html + js/bundle.js 等，与 Node 私服同布局）。
// Kestrel 按 注册顺序 匹配：先 AstrIO.Client，再原版根目录（原版 index.html 优先级更低）。
var vanillaRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "..", ".."));
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(vanillaRoot),
    ServeUnknownFileTypes = true,
});

var loopCts = new CancellationTokenSource();
_ = gameLoop.RunAsync(loopCts.Token);

// 排行榜已并入主循环(每 25 帧 ≈ 1s 二进制 90 号帧),不再单独广播。

// WebSocket：/ws/{mode} + 根路径（客户端 localPorts 直连 ws://host:port/ 不带 /ws 前缀）。
// 注意：Map("/") 会匹配所有路径，必须先放行非 WebSocket 请求让静态文件中间件工作。
app.Map("/ws/{mode}", (HttpContext ctx) => WsHandler(ctx, ctx.GetRouteValue("mode")?.ToString() ?? "extreme"));
app.Map("/", async (HttpContext ctx) =>
{
    if (ctx.WebSockets.IsWebSocketRequest)
    {
        // 从监听端口推断模式：3001=megasplit 3050=extreme 3000=domination
        var port = ctx.Connection.LocalPort;
        var mode = port switch { 3001 => "megasplit", 3050 => "extreme", _ => "domination" };
        await WsHandler(ctx, mode);
        return;
    }
    // 非 WS 请求：重新执行静态文件管道（Map 已消费请求，需要手动回退到文件服务）
    ctx.Response.StatusCode = 404;
});

static async Task WsHandler(HttpContext ctx, string mode)
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var gameLoop = ctx.RequestServices.GetRequiredService<GameLoop>();
    var loopCts = ctx.RequestServices.GetRequiredService<IHostApplicationLifetime>().ApplicationStopping;
    using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    var session = gameLoop.AddSession(ws, mode);
    if (session == null) return;
    // astrio 原版协议:连接建立即下发 33B 种子帧(客户端据此初始化 Codec)
    await session.SendSeedAsync(loopCts);
    var tcs = new TaskCompletionSource();
    ctx.RequestAborted.Register(() => tcs.TrySetResult());
    var runTask = session.RunAsync(loopCts);
    await Task.WhenAny(runTask, tcs.Task);
    gameLoop.RemoveSession(session);
}

// HTTP API
app.MapGet("/api/mass", () => Results.Json(new { mass = gameLoop.WorldRef.SpawnMass }));
app.MapPost("/api/mass", async (HttpContext ctx) =>
{
    using var doc = await System.Text.Json.JsonDocument.ParseAsync(ctx.Request.Body);
    if (doc.RootElement.TryGetProperty("mass", out var m))
        gameLoop.WorldRef.SetSpawnMass(m.GetSingle());
    return Results.Json(new { mass = gameLoop.WorldRef.SpawnMass });
});
app.MapGet("/server-info/{mode}", (string mode) =>
    Results.Json(new { players = 1, spectators = 0 }));

app.Run();
