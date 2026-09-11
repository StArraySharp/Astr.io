using System.Net.WebSockets;
using AstrIO.Server.Game;

namespace AstrIO.Server.Net;

/// <summary>
/// 单个 WebSocket 连接会话 —— astrio 原版协议。逐项对齐 Node mock-server：
///   1. 连接即下发 33B 种子帧（0xFD + 8×u32 LE，未加密）+ 150/174/175 握手触发帧
///   2. 之后上行经 Codec.DecodeFromClient（A 流自同步）、下行经 Codec.EncodeToClient（B 流）
///   3. 三段式帧策略：全量首帧 → 每帧 delta → 死亡当帧 delta+clearCells 后转旁观
/// </summary>
public sealed class Session
{
    public Player Player { get; set; }
    readonly WebSocket _ws;
    readonly GameWorld _world;
    readonly ILogger _log;
    volatile bool _alive = true;
    public bool Alive => _alive;

    public ServerCodec Codec { get; } = new();
    public bool Seeded => Codec.Seeded;
    public string Mode { get; }

    // 会话帧策略状态（mock-server 同款三段式）
    public bool SentInitial { get; set; }        // 首帧/重生后发全量,之后 delta
    public bool DeathSent { get; set; }          // 死亡当帧已发(clearCells)
    public HashSet<uint> Seen { get; } = new();  // 已下发过的细胞 id(增量基础)
    public byte LastSentTab { get; set; } = 1;   // 0x78 tabChange 基线

    // 上行流失步自同步状态（mock-server decodeFromClient 同款）
    readonly HashSet<int> _candOffsets = new() { 0 };
    int _lastHitOff = -1;
    int _hitStreak = 0;
    bool _txLocked;

    // 挑战（222）状态
    uint[]? _seed;
    byte _chalA;
    uint _chalB;
    bool _expectAuth;
    bool _authed;

    public string Tag { get; private set; } = "";
    public string Pin { get; private set; } = "";

    public Session(WebSocket ws, GameWorld world, ILogger log, string mode)
    {
        _ws = ws;
        _world = world;
        _log = log;
        Mode = mode;
        // ★ 必须持 WorldLock：GameLoop 的 Step() 正在 foreach (Players.Values)，
        //   ws 线程裸改字典会抛 "Collection was modified"（实测每个玩家加入瞬间都会崩一次）
        WorldLock.Lock();
        try
        {
            Player = world.AddPlayer("Player" + Random.Shared.Next(100, 999));
            Player.Mode = mode;
            Player.Session = this;
        }
        finally { WorldLock.Unlock(); }
    }

    /// <summary>
    /// 发送 33 字节种子包 + EU 原版抓包同款握手序列：
    /// 150（触发客户端回 room/nick/skin —— 由此获得上行流真实起点）
    /// 174 betterDoubleSplits=1、175 authRequired=0（免登录）。
    /// </summary>
    public async Task SendSeedAsync(CancellationToken ct)
    {
        _seed = new uint[8];
        Random.Shared.NextBytes(System.Runtime.InteropServices.MemoryMarshal.AsBytes(_seed.AsSpan()));
        Codec.InitFromSeed(_seed);
        _candOffsets.Clear(); _candOffsets.Add(0);
        _lastHitOff = -1; _hitStreak = 0; _txLocked = false;

        var buf = new byte[33];
        buf[0] = 0xFD;
        for (int i = 0; i < 8; i++)
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(buf.AsSpan(1 + i * 4, 4), _seed[i]);
        await SendRawAsync(buf, ct);
        _log.LogInformation("[session] seed sent to {Nick} ({Mode})", Player.Nick, Mode);

        await SendBinaryAsync(new byte[] { Op.RoomData }, ct);            // 150:[96]
        await SendBinaryAsync(new byte[] { Op.BetterDoubleSplits, 1 }, ct); // 174: betterDoubleSplits=1
        await SendBinaryAsync(new byte[] { Op.AuthFlags, 0 }, ct);        // 175: authRequired=0
    }

    /// <summary>下发 222 挑战（a 按 u8 读、b 按 u32 读 —— 客户端 bY.parse 同款）。</summary>
    public async Task SendChallengeAsync(CancellationToken ct)
    {
        if (_seed == null || _expectAuth || _authed) return;
        _chalA = (byte)(Random.Shared.Next() & 0x1f);   // 低 5 位:避开归零臂概率高的高位输入
        _chalB = (uint)Random.Shared.Next();
        var w = new BinWriter();
        w.U8(Op.AuthChallenge);
        w.U8(1);          // type（非 0 才处理）
        w.U8(_chalA);
        w.U32(_chalB);
        await SendBinaryAsync(w.ToArray(), ct);
        _expectAuth = true;
    }

    // ---------- 发送 ----------

    async Task SendRawAsync(byte[] payload, CancellationToken ct)
    {
        if (!_alive || _ws.State != WebSocketState.Open) return;
        try { await _ws.SendAsync(payload, WebSocketMessageType.Binary, true, ct); }
        catch { _alive = false; }
    }

    /// <summary>
    /// 加密下行（种子后所有业务帧走此路径）。
    /// ★★ 加密(推进 B 流)与 socket 发送必须原子完成,否则客户端收到的帧顺序≠
    /// 加密顺序 → B 流错位 → 全部帧解成乱码(乱码名字/170 警告/222 解出垃圾的根源)。
    /// Node 版单线程同步 send 天然原子;C# 主循环/ChallengeLoop/帧内 fire-and-forget
    /// 三方并发必须用门闸串行化。
    /// 另:EncodeToClient 是就地 XOR —— 跨 session 共享的 byte[] 必须先 Clone。
    /// </summary>
    readonly SemaphoreSlim _txGate = new(1, 1);

    public async Task SendBinaryAsync(byte[] payload, CancellationToken ct)
    {
        if (!_alive) return;
        await _txGate.WaitAsync(ct);
        try
        {
            if (!_alive) return;
            if (!Codec.Seeded) { await SendRawAsync(payload, ct); return; }
            await SendRawAsync(Codec.EncodeToClient((byte[])payload.Clone()), ct);
        }
        finally { _txGate.Release(); }
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
                if (msg.MessageType == WebSocketMessageType.Close || msg.Count == 0) break;

                byte[] data;
                using (var ms = new MemoryStream())
                {
                    ms.Write(buf, 0, msg.Count);
                    while (!msg.EndOfMessage)
                    {
                        msg = await _ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                        if (msg.Count > 0) ms.Write(buf, 0, msg.Count);
                    }
                    data = ms.ToArray();
                }
                if (data.Length == 0) continue;

                var plain = Codec.Seeded ? DecodeFromClientSelfSync(data) : data;
                if (plain != null) HandleBinary(plain);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { _log.LogWarning(ex, "[session] error"); }
        finally { _alive = false; }
    }

    // ---------- 二进制热路径（astrio 原版 opcode） ----------

    void HandleBinary(byte[] data)
    {
        if (data.Length < 1) return;
        var r = new BinReader(data);
        var op = r.U8();
        WorldLock.Lock();
        try
        {
            switch (op)
            {
                case Op.Nick: // [10][u8 len][nick×u16]
                {
                    var nick = r.String16();
                    if (Player.Cells.Count == 0) Player.Nick = nick;   // 出生前改名；出生后仅改细胞名
                    foreach (var c in Player.Cells) c.Nick = nick;
                    break;
                }
                case Op.Room: // [20][u8 ver][str16 tag][str16 pin]
                {
                    r.U8();
                    Tag = r.String16();
                    Pin = r.String16();
                    break;
                }
                case Op.Spawn: // [30][u16 x][u16 y][u8 freeSpectate]
                {
                    r.U16(); r.U16(); r.U8();
                    if (Player.Cells.Count == 0)
                    {
                        Player.Mode = Mode;   // 3001=megasplit(64) 3050=extreme(256)
                        _world.Spawn(Player);
                        SentInitial = false;  // 重生后下一帧重发全量快照
                        DeathSent = false;
                        LastSentTab = Player.ActiveTab;
                        _ = SendBinaryAsync(EncodeBorder(), CancellationToken.None);
                        _ = SendBinaryAsync(EncodeAnnouncement(true, "Astrio C# AS — welcome!"), CancellationToken.None);
                        _log.LogInformation("[ws] spawn: {Nick} cells={N}", Player.Nick, Player.Cells.Count);
                    }
                    break;
                }
                case Op.Mouse: // [60][u8 tab][u16 x][u16 y][u8 frozen]
                {
                    var tab = r.U8();
                    var x = r.U16(); var y = r.U16();
                    var frozen = r.U8();
                    Player.Frozen = frozen != 0;
                    _world.SetMouse(Player, (byte)(tab == 0 ? 1 : tab), x, y);
                    break;
                }
                case Op.Split: // [50][u8 tab][u8 count]（count=分裂轮数）
                {
                    var tab = r.U8();
                    var count = r.U8();
                    // 只累加到待办,由 GameWorld.Step 每 tick 消化 1 轮:
                    // 同一 tick 内连分的活在步进前, 球还没位移, 分身会全叠在一个点上
                    Player.PendingSplitTab = (byte)(tab == 0 ? Player.ActiveTab : tab);
                    Player.PendingSplits = Math.Min(Player.PendingSplits + Math.Max((int)count, 1), 64);
                    break;
                }
                case Op.Eject: // [40][u8 tab]
                {
                    var tab = r.U8();
                    _world.Eject(Player, (byte)(tab == 0 ? Player.ActiveTab : tab));
                    break;
                }
                case Op.Ping: // [80] → pong 同号（客户端测 RTT）
                    _ = SendBinaryAsync(new byte[] { Op.Ping }, CancellationToken.None);
                    break;
                case Op.Spectate: // [70][u8 flag]（S 键停移）
                {
                    var flag = r.U8();
                    _world.SetFrozen(Player, flag != 0);
                    break;
                }
                case Op.MultiboxSwitch: // [100][u8 tab]
                {
                    var tab = r.U8();
                    _world.MultiboxSwitch(Player, tab);
                    break;
                }
                case Op.Skin: // [90][u8 c1][str16 u1][u8 c2][str16 u2]（私服忽略皮肤：避免外网图拖垮渲染）
                {
                    r.U8(); r.String16();
                    r.U8(); r.String16();
                    break;
                }
                case Op.AuthResponse: // [222][u32 answer]（客户端无 type 字节）
                {
                    var ans = r.U32();
                    if (_expectAuth)
                    {
                        // 本地私服直接放行:C# Challenge 是近似复刻(br_table 臂未逐一还原),
                        // 与客户端 wasm 的 p9 不同源,比对必 MISMATCH。
                        _authed = true;
                        _log.LogInformation("[ws] challenge answer {Ans} (accepted)", ans);
                        var w = new BinWriter();
                        w.U8(Op.AuthFlags);
                        w.U8(0);
                        _ = SendBinaryAsync(w.ToArray(), CancellationToken.None);
                    }
                    _expectAuth = false;
                    break;
                }
                case Op.Token:      // [162][u16 len][chars]
                case Op.ChallengeAnswer: // [161][u16 len][chars]
                {
                    var len = r.U16();
                    r.Skip(len);
                    break;
                }
                case Op.Key: r.U32(); break;          // [89][u32]（热键）
                case Op.UseLockedColor: r.U8(); break; // [163][u8]
            }
        }
        finally { WorldLock.Unlock(); }
    }

    /// <summary>60 号边界帧（方形）：[60][0][u16 l][u16 t][u16 r][u16 b][ejectSpeed][eatAnim][保留]。</summary>
    byte[] EncodeBorder()
    {
        var w = new BinWriter();
        w.U8(Op.Border);
        w.U8(0);
        w.U16((ushort)GameWorld.BorderMin);
        w.U16((ushort)GameWorld.BorderMin);
        w.U16((ushort)GameWorld.BorderMax);
        w.U16((ushort)GameWorld.BorderMax);
        w.U8(80);  // ejectSpeed
        w.U8(0);   // eatAnimation
        w.U8(0);   // 保留
        return w.ToArray();
    }

    /// <summary>172 号公告帧：[172][u8 kind][str16]（kind 0=system 1=banner）。</summary>
    public static byte[] EncodeAnnouncement(bool banner, string text)
    {
        var w = new BinWriter();
        w.U8(Op.Announcement);
        w.U8(banner ? (byte)1 : (byte)0);
        w.String16(text);
        return w.ToArray();
    }

    /// <summary>
    /// 上行流失步自同步（mock-server decodeFromClient 同款）：
    /// 候选密钥流偏移集合过滤 +「已知 op 且声明长度===包长」命中确认；
    /// 单候选或同候选连续命中 ≥2 包即锁定快进；无命中重置全偏移空间（4096）重搜。
    /// 返回 null 表示本包未能消歧（调用方丢弃）。
    /// </summary>
    byte[]? DecodeFromClientSelfSync(byte[] buf)
    {
        if (_txLocked) return Codec.DecodeFromClient(buf);

        var len = buf.Length;
        var hits = new List<(int off, byte[] plain)>();
        foreach (var off in _candOffsets)
        {
            var probe = Codec.ProbeTxStream(off);
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
                _log.LogInformation("[ws] tx-stream locked at keystream round {Off} (streak {N})",
                    first.off, _hitStreak);
                return real;
            }
            // 多候选歧义：暂不推进，等下一包消歧
            _candOffsets.Clear();
            foreach (var h in hits) _candOffsets.Add(h.off + len);
            return null;
        }
        // 无候选命中：重置全偏移空间重搜（客户端密文起点可能更远）
        _candOffsets.Clear();
        for (int k = 0; k < 4096; k++) _candOffsets.Add(k);
        _lastHitOff = -1;
        _hitStreak = 0;
        return null;
    }

    /// <summary>上行包长度表（mock-server tryParseLen 同款）：声明总长；-1 长度不足；-2 未知 op。</summary>
    internal static int TryParseLen(byte[] buf)
    {
        if (buf.Length < 1) return -1;
        switch (buf[0])
        {
            case Op.Spawn: return 6;
            case Op.Mouse: return 7;
            case Op.Split: return 3;
            case Op.Eject: return 2;
            case Op.Ping: return 1;
            case Op.MultiboxSwitch: return 2;
            case Op.Spectate: return 2;
            case Op.Key: return 5;
            case Op.UseLockedColor: return 2;
            case Op.AuthResponse: return buf.Length >= 5 ? 5 : -1;
            case Op.Token:
            case Op.ChallengeAnswer:
                return buf.Length >= 3 ? 3 + buf[1] : -1;
            case Op.Nick:
                return buf.Length >= 2 ? 2 + 2 * buf[1] : -1;
            case Op.Room: // [20][u8 ver][u8 tagLen][tag×2][u8 pinLen][pin×2]
            {
                if (buf.Length < 3) return -1;
                var l1 = buf[2];
                if (buf.Length < 3 + 2 * l1 + 1) return -1;
                var l2 = buf[3 + 2 * l1];
                return 3 + 2 * l1 + 1 + 2 * l2;
            }
            case Op.Skin: // [90][u8 c1][u8 l1][u1×2][u8 c2][u8 l2][u2×2]
            {
                if (buf.Length < 2) return -1;
                int p = 2 + 2 * buf[1];
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
