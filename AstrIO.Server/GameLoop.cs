using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using AstrIO.Server.Game;
using AstrIO.Server.Net;

namespace AstrIO.Server;

/// <summary>世界主循环 + WebSocket 接入 + 二进制世界帧编码。</summary>
public sealed class GameLoop
{
    readonly World _world = new();
    readonly ILogger<GameLoop> _log;
    readonly ConcurrentDictionary<Session, byte> _sessions = new();
    CancellationToken _ct;

    public GameLoop(ILogger<GameLoop> log) { _log = log; }

    public Session? AddSession(WebSocket ws, string mode)
    {
        var s = new Session(ws, _world, _log, mode);
        _sessions[s] = 1;
        return s;
    }

    public void RemoveSession(Session s)
    {
        _sessions.TryRemove(s, out _);
        World.Lock();
        try { _world.RemoveSessionPlayer(s.Player); } finally { World.Unlock(); }
    }

    public async Task RunAsync(CancellationToken ct)
    {
        _ct = ct;
        World.Lock();
        try { _world.SpawnBots(); } finally { World.Unlock(); }
        _log.LogInformation("[game] {Bots} bots spawned, world border {Max}", World.BotCount, World.BorderMax);

        var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(World.TickMs));
        int frame = 0;
        while (await timer.WaitForNextTickAsync(ct))
        {
            World.Lock();
            List<(Session, byte[])>? frames = null;
            try
            {
                foreach (var b in _world.Bots) _world.BotThink(b);
                _world.Step();
                _world.MaintainBots();

                frame++;
                var lb = frame % 25 == 0;   // 每秒排行榜+战队榜
                frames = new List<(Session, byte[])>(_sessions.Count);
                byte[]? lbFrame = lb ? EncodeLeaderboard() : null;
                byte[]? teamLbFrame = lb ? EncodeTeamLeaderboard() : null;
                foreach (var s in _sessions.Keys)
                {
                    if (!s.Seeded) continue; // 未完成种子握手不推业务帧

                    var alive = s.Player.Cells.Count > 0;
                    if (!alive)
                    {
                        // 死亡帧:发最后一个 delta(含吃事件,客户端才能移除残细胞)+ clearCells,
                        // 之后进入旁观模式:持续发世界 delta(无 own 细胞),客户端跟随镜头观战
                        if (!s.DeathSent)
                        {
                            frames.Add((s, EncodeWorldFrame(s)));
                            frames.Add((s, new byte[] { Op.ClearCells }));
                            s.Seen.Clear();
                            s.DeathSent = true;
                            s.SentInitial = false; // 重生后重新全量
                            _log.LogInformation("[session] {Nick} died → spectate", s.Player.Nick);
                        }
                        else
                        {
                            frames.Add((s, EncodeWorldFrame(s)));
                        }
                    }
                    else
                    {
                        frames.Add((s, EncodeWorldFrame(s)));
                    }
                    if (lbFrame != null) frames.Add((s, lbFrame));
                    if (teamLbFrame != null) frames.Add((s, teamLbFrame));
                }
            }
            finally { World.Unlock(); }

            if (frames != null)
                foreach (var (s, f) in frames)
                    await s.SendBinaryAsync(f, ct);
        }
    }

    /// <summary>
    /// 编码 astrio 原版 50 号世界帧(客户端 AdminPanel.worldUpdate 对应):
    /// [50][u16 added]{u32 id,u16 x,u16 y,u16 r,u16 flags[+rgb/str16 nick/u8 tab]}
    /// [u16 updated]{u32 id,u16 x,u16 y,u16 r,u8 ghost}
    /// [u16 eaten]{u32 prey,u32 predator}   ← 顺序:被吃者在先
    /// [u16 removed]{u32 id}
    /// flags:1 病毒 / 2 孢子 / 4 食物 / 8 颜色 / 16 昵称 / 64 自己 / 256 页签
    /// </summary>
    byte[] EncodeWorldFrame(Session session, bool includeLb = false)
    {
        var viewer = session.Player;
        var w = new BinWriter();
        w.U8(Op.WorldUpdate);

        var seenSet = session.Seen;
        var added = new List<Cell>();
        var updated = new List<Cell>();
        var removed = new List<uint>();
        if (seenSet != null)
        {
            foreach (var c in _world.Cells.Values)
                if (!seenSet.Contains(c.Id)) added.Add(c);
            foreach (var c in _world.Cells.Values)
            {
                if (seenSet.Contains(c.Id) && !c.IsFood) updated.Add(c);
            }
        }
        else
        {
            foreach (var c in _world.Cells.Values) added.Add(c);
        }

        var mine = viewer.Cells;

        w.U16((ushort)added.Count);
        foreach (var c in added)
        {
            w.U32(c.Id);
            w.U16((ushort)Math.Clamp((int)c.X, 0, 65535));
            w.U16((ushort)Math.Clamp((int)c.Y, 0, 65535));
            w.U16((ushort)Math.Clamp((int)c.R, 0, 65535));
            ushort flags = 0;
            if (c.IsVirus) flags |= 1;
            if (c.IsEjected) flags |= 2;
            if (c.IsFood) flags |= 4;
            if (c.Color != null) flags |= 8;
            if (!string.IsNullOrEmpty(c.Nick)) flags |= 16;
            if (mine.Contains(c)) flags |= 64;
            if (c.Tab != 0 && mine.Contains(c)) flags |= 256;
            w.U16(flags);
            if ((flags & 8) != 0) { w.U8(c.Color[0]); w.U8(c.Color[1]); w.U8(c.Color[2]); }
            if ((flags & 16) != 0) w.String16(c.Nick);
            if ((flags & 256) != 0) w.U8(c.Tab);
        }

        w.U16((ushort)updated.Count);
        foreach (var c in updated)
        {
            w.U32(c.Id);
            w.U16((ushort)Math.Clamp((int)c.X, 0, 65535));
            w.U16((ushort)Math.Clamp((int)c.Y, 0, 65535));
            w.U16((ushort)Math.Clamp((int)c.R, 0, 65535));
            w.U8(0);
        }

        var eaten = _world.EatenEvents;
        w.U16((ushort)eaten.Count);
        foreach (var (victim, predator) in eaten)
        {
            w.U32(victim.Id);                       // 被吃者在先(客户端 eatCell(predator, prey))
            w.U32(predator?.Id ?? victim.Id);       // 捕食者(无则自指,客户端丢弃该事件)
        }

        w.U16(0); // removed

        seenSet.Clear();
        foreach (var c in _world.Cells.Values) seenSet.Add(c.Id);

        return w.ToArray();
    }

    /// <summary>
    /// 编码 astrio 原版 130 号战队榜帧(EU 抓包精确字节:82 0000 0001 00 a6fd0000):
    /// [130][u16 0][u16 1=队伍条数][u16 0=空行占位?][u32 总质量] —— 共 12 字节。
    /// 客户端 TeamLeaderboard/TeamList 填充 TEAMS/ALLIES 面板。
    /// </summary>
    byte[] EncodeTeamLeaderboard()
    {
        World.Lock();
        uint totalMass;
        int teamCount;
        try
        {
            totalMass = (uint)_world.Players.Values
                .Where(p => p.Cells.Count > 0)
                .Sum(p => (decimal)p.MassTotal);
            teamCount = _world.Players.Values.Count(p => p.Cells.Count > 0);
        }
        finally { World.Unlock(); }

        var w = new BinWriter();
        w.U8(Op.TeamLeaderboard);
        w.U16(0);                                  // 抓包 0000
        w.U16((ushort)Math.Min(teamCount, 65535)); // 抓包 0001
        w.U16(0);                                  // 抓包 00 00(两字节)
        w.U32(totalMass);                          // 抓包 a6 fd 00 00
        return w.ToArray();
    }

    /// <summary>
    /// 编码 astrio 原版 90 号排行榜帧(客户端 AdminPanel.getLeaderboard 对应):
    /// [90][u8 count]{str16 tag, str16 nick, u32 mass, u8 crowned, u8 nameColorMode}
    /// ——格式对齐 mock-server pktLeaderboard(真实客户端联调验证)。
    /// 客户端解析: name1=string16(tag 位), name2=string16(nick 位);
    /// tag 非空显示 "[tag] nick"; nameColorMode 0=无 1=rgb(+3B) 2=rainbow 3=gradient。
    /// </summary>
    byte[] EncodeLeaderboard()
    {
        World.Lock();
        List<(string nick, uint mass)> rows;
        try
        {
            rows = _world.Players.Values
                .Where(p => p.Cells.Count > 0)
                .OrderByDescending(p => p.MassTotal)
                .Take(10)
                .Select(p => (p.Nick, (uint)p.MassTotal))
                .ToList();
        }
        finally { World.Unlock(); }

        var w = new BinWriter();
        w.U8(Op.Leaderboard);
        w.U8((byte)rows.Count);
        foreach (var (nick, mass) in rows)
        {
            w.String16("");           // tag 位(空)
            w.String16(nick + "\r");  // nick 位 —— EU 原版昵称尾部带 \r(抓包实测),必须保留
            w.U32(mass);
            w.U8(0);                  // crowned
            w.U8(0);                  // nameColorMode: 0=无
        }
        return w.ToArray();
    }

    public World WorldRef => _world;
}

public static class WorldSessionExt
{
    public static void RemoveSessionPlayer(this World w, Player p) => w.RemovePlayer(p);
}
