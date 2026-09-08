using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using AstrIO.Server.Game;

namespace AstrIO.Server.Net;

/// <summary>
/// 单个 WebSocket 连接会话 —— astrio 原版协议:
/// 连接即下发 33B 种子帧(0xFD + 8×u32 LE)建立 xorshift128 流;
/// 此后上行经 Codec.DecodeFromClient、下行经 Codec.EncodeToClient。
/// 上行 opcode:10 昵称 / 20 房间 / 30 出生 / 60 鼠标 / 80 ping / 89 热键 / 208 分裂 / 212 吐球。
/// </summary>
public sealed class Session
{
    public Player Player { get; set; }
    readonly WebSocket _ws;
    readonly World _world;
    readonly ILogger _log;
    bool _alive = true;
    public bool Alive => _alive;

    /// <summary>astrio 协议:种子握手后开启加密流。连接建立即下发 33B 种子包。</summary>
    public ServerCodec Codec { get; } = new();
    public bool Seeded => Codec.Seeded;
    public string Mode { get; }

    // 上行原始帧(未加密)回调,供 GameLoop 按需读取(如 20 号 tag/pin)
    public string Tag { get; private set; } = "";
    public string Pin { get; private set; } = "";

    public Session(WebSocket ws, World world, ILogger log, string mode)
    {
        _ws = ws;
        _world = world;
        _log = log;
        Mode = mode;
        Player = world.AddPlayer("Player" + Random.Shared.Next(100, 999));
        Player.Mode = mode;
        Player.Session = this;
    }

    /// <summary>发送 33 字节种子包(0xFD + 8×u32 LE),初始化编解码器。</summary>
    public async Task SendSeedAsync(CancellationToken ct)
    {
        var seed = new uint[8];
        Random.Shared.NextBytes(System.Runtime.InteropServices.MemoryMarshal.AsBytes(seed.AsSpan()));
        Codec.InitFromSeed(seed);
        var buf = new byte[33];
        buf[0] = 0xFD;
        for (int i = 0; i < 8; i++)
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(1 + i * 4, 4), seed[i]);
        await SendRawAsync(buf, ct);
        _log.LogInformation("[session] seed sent to {Nick} ({Mode})", Player.Nick, Mode);
    }

    // ---------- 发送 ----------
    async Task SendRawAsync(byte[] payload, CancellationToken ct)
    {
        if (!_alive || _ws.State != WebSocketState.Open) return;
        try { await _ws.SendAsync(payload, WebSocketMessageType.Binary, true, ct); }
        catch { _alive = false; }
    }

    /// <summary>加密下行(种子后所有业务帧走此路径)。</summary>
    public async Task SendBinaryAsync(byte[] payload, CancellationToken ct)
    {
        if (!Codec.Seeded) { await SendRawAsync(payload, ct); return; }
        await SendRawAsync(Codec.EncodeToClient(payload), ct);
    }

    public async Task SendJsonAsync(object obj, CancellationToken ct)
    {
        if (!_alive || _ws.State != WebSocketState.Open) return;
        var json = JsonSerializer.Serialize(obj);
        try { await _ws.SendAsync(Encoding.UTF8.GetBytes(json), WebSocketMessageType.Text, true, ct); }
        catch { _alive = false; }
    }

    // ---------- 接收循环 ----------
    public async Task RunAsync(CancellationToken ct)
    {
        var buf = new byte[64 * 1024];
        try
        {
            while (!ct.IsCancellationRequested && _ws.State == WebSocketState.Open)
            {
                var msg = await _ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                if (msg.MessageType == WebSocketMessageType.Close) break;

                byte[] data;
                using (var ms = new MemoryStream())
                {
                    ms.Write(buf, 0, msg.Count);
                    while (!msg.EndOfMessage)
                    {
                        msg = await _ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                        ms.Write(buf, 0, msg.Count);
                    }
                    data = ms.ToArray();
                }

                if (msg.MessageType == WebSocketMessageType.Text)
                    HandleJson(JsonSerializer.Deserialize<JsonElement>(Encoding.UTF8.GetString(data)));
                else
                {
                    // astrio 协议:种子握手后上行全部经 Codec 解密(与客户端 Codec.encode 对应)
                    var plain = Codec.Seeded ? Codec.DecodeFromClient(data) : data;
                    HandleBinary(plain);
                }
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _log.LogWarning(ex, "session error"); }
        finally { _alive = false; }
    }

    // ---------- JSON 控制 ----------
    void HandleJson(JsonElement el)
    {
        var type = el.GetProperty("t").GetString();
        switch (type)
        {
            case "nick":
                Player.Nick = el.GetProperty("nick").GetString() ?? Player.Nick;
                foreach (var c in Player.Cells) c.Nick = Player.Nick;
                break;
            case "spawn":
                World.Lock();
                try { _world.Spawn(Player); } finally { World.Unlock(); }
                _ = SendJsonAsync(new { t = "spawned", mass = Player.MassTotal }, CancellationToken.None);
                break;
            case "ping":
                _ = SendJsonAsync(new { t = "pong", ts = el.TryGetProperty("ts", out var ts) ? ts.GetRawText() : "0" }, CancellationToken.None);
                break;
        }
    }

    // ---------- 二进制热路径(astrio 原版 opcode) ----------
    void HandleBinary(byte[] data)
    {
        if (data.Length < 1) return;
        var r = new BinReader(data);
        var op = r.U8();
        World.Lock();
        try
        {
            switch (op)
            {
                case Op.Nick: // [10][str16 nick]
                {
                    var nick = r.String16();
                    Player.Nick = nick;
                    foreach (var c in Player.Cells) c.Nick = nick;
                    break;
                }
                case Op.Room: // [20][u8 ver][str16 tag][str16 pin]
                {
                    r.U8(); // version
                    Tag = r.String16();
                    Pin = r.String16();
                    break;
                }
                case Op.Spawn: // [30][u16 x][u16 y][u8 freeSpectate]
                {
                    r.U16(); r.U16(); r.U8();
                    if (Player.Cells.Count == 0)
                        _world.Spawn(Player);
                    break;
                }
                case Op.Mouse: // [60][u8 tab][u16 x][u16 y][u8 frozen]
                {
                    var tab = r.U8();
                    var x = r.U16(); var y = r.U16();
                    var frozen = r.U8();
                    Player.Frozen = frozen != 0;
                    _world.SetMouse(Player, tab, x, y);
                    break;
                }
                case Op.Ping: // [80] → pong 同号(客户端测 RTT)
                    _ = SendBinaryAsync(new byte[] { Op.Ping }, CancellationToken.None);
                    break;
                case Op.Split: // [208][u8 tab]
                {
                    var tab = r.U8();
                    _world.Split(Player, tab);
                    break;
                }
                case Op.Eject: // [212][u8 tab]
                {
                    var tab = r.U8();
                    _world.Eject(Player, tab);
                    break;
                }
                case Op.Spectate: // [100][u8 flag](观战:暂不实现镜头,仅记录)
                    r.U8();
                    break;
            }
        }
        finally { World.Unlock(); }
    }
}
