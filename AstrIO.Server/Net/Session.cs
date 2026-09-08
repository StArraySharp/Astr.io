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

    // 会话帧策略状态(mock-server 同款三段式:全量首帧→delta→死亡旁观)
    public bool SentInitial { get; set; }       // 首帧/重生后发全量,之后 delta
    public bool DeathSent { get; set; }         // 死亡当帧已发(clearCells)
    public HashSet<uint> Seen { get; } = new(); // 已下发过的细胞 id(增量基础)

    // 上行流失步自同步状态(mock-server 同款:候选密钥流偏移集合过滤)
    readonly HashSet<int> _candOffsets = new() { 0 };
    int _lastHitOff = -1;
    int _hitStreak = 0;
    bool _txLocked = false;

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

        // EU 原版服抓包(2026-09-08):种子帧后服务器主动下发以下帧。
        // 150 号空包是官方上行握手触发器 —— 客户端 AdminPanel.data() 收到后
        // 回发 room(20)/nick(10)/skin(90),服务器由此获得上行流的真实起点,
        // 无需穷举密钥流偏移。
        await SendBinaryAsync(new byte[] { Op.RoomData }, ct);            // 150:[96]
        await SendBinaryAsync(new byte[] { 174, 1 }, ct);                 // 174: betterDoubleSplits=1
        await SendBinaryAsync(new byte[] { 175, 0 }, ct);                 // 175: authRequired=0(免登录)
    }

    // ---------- 发送 ----------
    async Task SendRawAsync(byte[] payload, CancellationToken ct)
    {
        if (!_alive || _ws.State != WebSocketState.Open) return;
        try { await _ws.SendAsync(payload, WebSocketMessageType.Binary, true, ct); }
        catch { _alive = false; }
    }

    /// <summary>加密下行(种子后所有业务帧走此路径)。
    /// 注意:EncodeToClient 是就地 XOR,而排行榜帧(lbFrame)是跨 session 共享的 byte[] ——
    /// 必须克隆后加密,否则第二个 session 收到的是双重加密的垃圾帧(客户端解出随机
    /// opcode → 恰好命中 175 bit4=banned → "Discord banned" 弹窗 + 流错位卡死)。</summary>
    public async Task SendBinaryAsync(byte[] payload, CancellationToken ct)
    {
        if (!Codec.Seeded) { await SendRawAsync(payload, ct); return; }
        await SendRawAsync(Codec.EncodeToClient((byte[])payload.Clone()), ct);
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
                    // astrio 协议:种子握手后上行经 Codec 解密。
                    // 播种前客户端可能已发明文包 / encode 竞态导致 A 流错位 ——
                    // 用候选偏移集自同步(mock-server decodeFromClient 同款),未锁定时丢弃未消歧包。
                    var plain = Codec.Seeded ? DecodeFromClientSelfSync(data) : data;
                    if (plain != null) HandleBinary(plain);
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
                    _log.LogInformation("[session] spawn request from {Nick} (cells={N})", Player.Nick, Player.Cells.Count);
                    if (Player.Cells.Count == 0)
                    {
                        _world.Spawn(Player);
                        _log.LogInformation("[session] spawned {Nick}, cells={N}, mass={M}", Player.Nick, Player.Cells.Count, Player.MassTotal);
                        // mock-server 验证过的行为:spawn 后立即发 60 号边界帧,
                        // 客户端据此设置世界边界(否则渲染用默认边界)
                        _ = SendBinaryAsync(EncodeBorder(), CancellationToken.None);
                    }
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
                case Op.Split: // [50][u8 tab][u8 flag](原版 50=上行分裂;下行 50=世界帧,编号复用)
                {
                    var tab = r.U8();
                    r.U8(); // flag(0=普通分裂)
                    _world.Split(Player, tab);
                    break;
                }
                case Op.Eject: // [40][u8 tab](原版 40=上行吐球;下行 40=清屏,编号复用)
                {
                    var tab = r.U8();
                    _world.Eject(Player, tab);
                    break;
                }
                case Op.Spectate: // [70][u8 flag](观战/S 键停移:暂不实现镜头,仅记录)
                case Op.MultiboxSwitch: // [100][u8 tab](Tab 切子球:世界暂单组,记录)
                    r.U8();
                    break;
            }
        }
        finally { World.Unlock(); }
    }

    /// <summary>60 号边界帧(方形):[60][0][u16 l][u16 t][u16 r][u16 b][ejectSpeed][eatAnim][保留]。
    /// 对齐 mock-server pktBorder(真实客户端联调验证)。Spawn 后必发。</summary>
    byte[] EncodeBorder()
    {
        var w = new BinWriter();
        w.U8(Op.Border);
        w.U8(0); // 0=方形边界
        w.U16((ushort)Game.World.BorderMin);
        w.U16((ushort)Game.World.BorderMin);
        w.U16((ushort)Game.World.BorderMax);
        w.U16((ushort)Game.World.BorderMax);
        w.U8(80); // ejectSpeed
        w.U8(0);  // eatAnimation
        w.U8(0);  // 保留
        return w.ToArray();
    }

    /// <summary>
    /// 上行流失步自同步(mock-server decodeFromClient 同款):
    /// 维护候选密钥流偏移集合,每包对每个候选试解,「已知 op 且声明长度===包长」者保留;
    /// 单候选或同候选连续命中 ≥2 包即锁定快进;无命中则重置全偏移空间(8192)重搜。
    /// 返回 null 表示本包未能消歧(调用方丢弃)。
    /// </summary>
    byte[]? DecodeFromClientSelfSync(byte[] buf)
    {
        if (_txLocked) return Codec.DecodeFromClient(buf);

        var len = buf.Length;
        var hits = new List<(int off, byte[] plain)>();
        foreach (var off in _candOffsets)
        {
            var probe = Codec.ProbeTxStream(off);          // 密钥流副本推进 off 轮
            var plain = Codec.CodecInPlaceCopy(buf, probe);
            if (TryParseLen(plain) == len) hits.Add((off, plain));
        }
        if (hits.Count >= 1)
        {
            var first = hits[0];
            if (_lastHitOff == first.off) _hitStreak++;
            else { _lastHitOff = first.off; _hitStreak = 1; }
            if (_candOffsets.Count == 1 || _hitStreak >= 2)
            {
                _txLocked = true;
                Codec.FastForwardTx(first.off);
                var real = Codec.DecodeFromClient(buf);
                _candOffsets.Clear();
                _candOffsets.Add(first.off + len);
                _log.LogInformation("[ws] tx-stream locked at round {Off} (streak {N})", first.off, _hitStreak);
                return real;
            }
            _candOffsets.Clear();
            foreach (var h in hits) _candOffsets.Add(h.off + len);
            return null;
        }
        // 无候选命中:重置全偏移空间重搜(上限 4096,防性能爆炸;6B 短包约束弱,
        // 依赖 150 号触发的 room/nick 长包来锁定)
        _candOffsets.Clear();
        for (int k = 0; k < 4096; k++) _candOffsets.Add(k);
        _lastHitOff = -1;
        _hitStreak = 0;
        return null;
    }

    /// <summary>上行包长度表(mock-server tryParseLen 同款):返回声明总长;-1 长度不足;-2 未知 op。</summary>
    static int TryParseLen(byte[] buf)
    {
        if (buf.Length < 1) return -1;
        var op = buf[0];
        switch (op)
        {
            case 30: return 6;   // spawn
            case 60: return 7;   // mouse
            case 50: return 3;   // split
            case 40: return 2;   // eject
            case 80: return 1;   // ping
            case 100: return 2;  // multiboxSwitch
            case 70: return 2;   // spectate
            case 89: return 5;   // key
            case 163: return 2;  // useLockedColor
            case 222: return buf.Length >= 5 ? 5 : -1;  // authResponse
            case 162:
            case 161: return buf.Length >= 3 ? 3 + buf[1] : -1; // token/challengeAnswer
            case 10:
                return buf.Length >= 2 ? 2 + 2 * buf[1] : -1;   // nick: [op][u8 len][chars×2]
            case 20: // room: [op][u8 ver][u8 tagLen][tag×2][u8 pinLen][pin×2]
            {
                if (buf.Length < 3) return -1;
                var l1 = buf[2];                                 // ver 在 buf[1],tagLen 在 buf[2]
                if (buf.Length < 3 + 2 * l1 + 1) return -1;
                var l2 = buf[3 + 2 * l1];
                return 3 + 2 * l1 + 1 + 2 * l2;
            }
            case 90: // skin: [op][u8 s1Len][s1×2][u8 s2Len][s2×2]
            {
                if (buf.Length < 2) return -1;
                var p = 2;
                var l1 = buf[1];
                p += 2 * l1;
                if (buf.Length < p + 1) return -1;
                p += 1;
                if (buf.Length < p + 1) return -1;
                var l2 = buf[p];
                return p + 1 + 2 * l2;
            }
            default: return -2;
        }
    }
}
