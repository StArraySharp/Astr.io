using System.Collections.Concurrent;
using System.Net.WebSockets;
using AstrIO.Server.Game;
using AstrIO.Server.Net;

namespace AstrIO.Server;

/// <summary>
/// 世界主循环 + 会话注册 + 二进制帧编码。逐项对齐 Node mock-server 主循环：
///   - 每 tick：botThink → world.Step → maintainBots → 每会话推帧
///   - 三段式帧策略：全量首帧（含 seen 重建）→ 每帧 delta → 死亡 delta+clearCells 后旁观
///   - 25 帧（≈1s）发一次 90 排行榜 + 130 战队榜
///   - activeTab 变化时下发 0x78 tabChange（multibox 控制权跟随）
/// </summary>
public sealed class GameLoop
{
    readonly GameWorld _world = new();
    readonly ILogger<GameLoop> _log;
    readonly ConcurrentDictionary<Session, byte> _sessions = new();

    public GameLoop(ILogger<GameLoop> log) { _log = log; }

    public Session AddSession(WebSocket ws, string mode)
    {
        var s = new Session(ws, _world, _log, mode);
        _sessions[s] = 1;
        return s;
    }

    public void RemoveSession(Session s)
    {
        _sessions.TryRemove(s, out _);
        WorldLock.Lock();
        try { _world.RemovePlayer(s.Player); } finally { WorldLock.Unlock(); }
        _log.LogInformation("[ws] player left: {Nick}", s.Player.Nick);
    }

    public async Task RunAsync(CancellationToken ct)
    {
        WorldLock.Lock();
        try { _world.SpawnBots(); } finally { WorldLock.Unlock(); }
        _log.LogInformation("[bots] spawned {N} bots with mass {M} → mode: extreme",
            _world.BotCount, GameWorld.BotSpawnMass);

        // 定期重发 222 挑战（客户端 onOpen 后 init,就绪即应答）
        using var challengeTimer = new PeriodicTimer(TimeSpan.FromSeconds(3));
        var challengeTask = ChallengeLoop(ct, challengeTimer);

        var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(GameWorld.TickMs));
        int frame = 0;
        while (await timer.WaitForNextTickAsync(ct))
        {
            var sends = new List<(Session, byte[])>();
            byte[]? lbFrame = null, teamLbFrame = null;
            try
            {
                WorldLock.Lock();
                try
                {
                    foreach (var b in _world.Bots) _world.BotThink(b);
                    _world.Step();
                    _world.MaintainBots();

                    frame++;
                    var lb = frame % 25 == 0;
                    if (lb)
                    {
                        lbFrame = EncodeLeaderboard();
                        teamLbFrame = EncodeTeamLeaderboard();
                    }

                    foreach (var s in _sessions.Keys)
                    {
                        if (!s.Seeded) continue;   // 未完成种子握手不推业务帧

                        // 首帧/重生：全量世界 + seen 重建
                        if (!s.SentInitial)
                        {
                            sends.Add((s, EncodeWorldFull(s)));
                            s.SentInitial = true;
                            s.Seen.Clear();
                            foreach (var c in _world.Cells.Keys) s.Seen.Add(c);
                            s.DeathSent = false;
                            continue;
                        }

                        var alive = s.Player.Cells.Count > 0;
                        if (!alive)
                        {
                            // 死亡帧：最后一个 delta（含吃事件,客户端才能移除残细胞）+ clearCells,
                            // 之后旁观模式:持续发世界 delta（无 own 细胞）,客户端跟随镜头观战
                            if (!s.DeathSent)
                            {
                                sends.Add((s, EncodeWorldDelta(s)));
                                sends.Add((s, new byte[] { Op.ClearCells }));
                                s.DeathSent = true;
                                _log.LogInformation("[ws] {Nick} died → spectate", s.Player.Nick);
                            }
                            sends.Add((s, EncodeWorldDelta(s)));
                            continue;
                        }

                        sends.Add((s, EncodeWorldDelta(s)));

                        // multibox：activeTab 变化（含子球被吃自动切回）→ 下发 0x78 模拟 Tab 键
                        if (s.Player.ActiveTab != s.LastSentTab)
                        {
                            s.LastSentTab = s.Player.ActiveTab;
                            var w = new BinWriter();
                            w.U8(Op.TabChange);
                            w.U8(s.Player.ActiveTab);
                            sends.Add((s, w.ToArray()));
                        }
                    }
                }
                finally { WorldLock.Unlock(); }
            }
            catch (Exception ex)
            {
                // ★ 单帧异常只记日志不中断:主循环若被异常终止,客户端会停留在
                //   "收到初始帧后再无世界帧"的假死状态（静默失败最难排查）
                _log.LogError(ex, "[game] tick {Frame} failed — world continues", frame);
                await Task.Delay(GameWorld.TickMs, ct);
                continue;
            }

            foreach (var (s, f) in sends)
                await s.SendBinaryAsync(f, ct);
            if (lbFrame != null || teamLbFrame != null)
                foreach (var s in _sessions.Keys)
                {
                    if (lbFrame != null) await s.SendBinaryAsync(lbFrame, ct);
                    if (teamLbFrame != null) await s.SendBinaryAsync(teamLbFrame, ct);
                }

            // 广播完成后再清空本帧吃事件/移除记录
            // (击杀来自 HTTP 线程,发生在两次 tick 之间;若在下一帧 Step 开头清空,
            //  击杀写入会被广播前的清空抹掉 → removed 段恒空 → 客户端残留无碰撞假球)
            WorldLock.Lock();
            try { _world.EatenEvents.Clear(); _world.RemovedIds.Clear(); }
            finally { WorldLock.Unlock(); }
        }
        await challengeTask;
    }

    async Task ChallengeLoop(CancellationToken ct, PeriodicTimer timer)
    {
        while (await timer.WaitForNextTickAsync(ct))
        {
            foreach (var s in _sessions.Keys)
            {
                if (s.Seeded) _ = s.SendChallengeAsync(ct);
            }
        }
    }

    /// <summary>
    /// 计算会话视野(中心=自己全部细胞质心;半径=GameWorld.CalcViewRadius 质量/分片自适应)。
    /// 返回 false 表示当前无自己细胞(观战/死亡) → 调用方退回全图同步。
    /// </summary>
    bool TryGetView(Session session, out float cx, out float cy, out float radius)
    {
        cx = cy = 0f; radius = 0f;
        var mine = session.Player.Cells;
        if (mine.Count == 0) return false;
        float sx = 0, sy = 0;
        foreach (var c in mine) { sx += c.X; sy += c.Y; }
        cx = sx / mine.Count;
        cy = sy / mine.Count;
        radius = GameWorld.CalcViewRadius(session.Player.MassTotal, mine.Count);
        return true;
    }

    /// <summary>细胞是否落在视野内(圆心距 &lt;= 视野半径 + 细胞半径;食物/病毒/孢子同样受裁剪)。</summary>
    static bool InView(Cell c, float cx, float cy, float radius)
    {
        var dx = c.X - cx;
        var dy = c.Y - cy;
        var reach = radius + c.R;
        return dx * dx + dy * dy <= reach * reach;
    }

    /// <summary>
    /// 50 号全量世界帧：added=可见细胞,updated/eaten/removed 空。
    /// flags:1 病毒 / 2 孢子 / 4 食物 / 8 颜色 / 16 昵称 / 64 自己 / 256 页签。
    /// </summary>
    byte[] EncodeWorldFull(Session session)
    {
        var w = new BinWriter();
        w.U8(Op.WorldUpdate);
        var mine = session.Player.Cells;

        var cull = false;
        float cx = 0f, cy = 0f, radius = 0f;
        if (GameWorld.ViewCulling) cull = TryGetView(session, out cx, out cy, out radius);
        var visible = new List<Cell>(_world.Cells.Count);
        foreach (var c in _world.Cells.Values)
        {
            // 自己的细胞永远可见(视野中心由它们算出,极端情况下半径也该覆盖)
            if (!cull || mine.Contains(c) || InView(c, cx, cy, radius)) visible.Add(c);
        }

        w.U16((ushort)Math.Min(visible.Count, ushort.MaxValue));
        foreach (var c in visible) WriteCell(w, c, mine);
        w.U16(0);   // updated
        w.U16(0);   // eaten
        w.U16(0);   // removed
        return w.ToArray();
    }

    /// <summary>
    /// 50 号增量世界帧：单次遍历分拣 added/updated（食物静止不更新）,
    /// eaten=[victim u32][eater u32]（被吃者在先）,removed=击杀/管理移除的细胞;
    /// seen = added ∪ old − eaten − removed（先删后加,避免同帧边界）。
    /// </summary>
    byte[] EncodeWorldDelta(Session session)
    {
        var w = new BinWriter();
        w.U8(Op.WorldUpdate);
        var mine = session.Player.Cells;
        var seen = session.Seen;

        // 视野裁剪:无自己细胞(观战/死亡)时退回全图同步(不裁剪)
        var cull = false;
        float cx = 0f, cy = 0f, radius = 0f;
        if (GameWorld.ViewCulling) cull = TryGetView(session, out cx, out cy, out radius);

        var added = new List<Cell>();
        var updated = new List<Cell>();
        // 本会话专属"离开视野"列表(不能写 _world.RemovedIds -- 那是全服共享的)
        List<uint>? outOfView = null;
        foreach (var c in _world.Cells.Values)
        {
            var visible = !cull || mine.Contains(c) || InView(c, cx, cy, radius);
            if (!visible)
            {
                if (seen.Contains(c.Id)) (outOfView ??= new List<uint>()).Add(c.Id);
                continue;
            }
            if (seen.Contains(c.Id))
            {
                if (!c.IsFood) updated.Add(c);   // 食物静止不更新
            }
            else added.Add(c);
        }

        w.U16((ushort)added.Count);
        foreach (var c in added) WriteCell(w, c, mine);

        w.U16((ushort)updated.Count);
        foreach (var c in updated)
        {
            w.U32(c.Id);
            w.U16((ushort)Math.Clamp((int)c.X, 0, 65535));
            w.U16((ushort)Math.Clamp((int)c.Y, 0, 65535));
            w.U16((ushort)Math.Clamp((int)c.R, 0, 65535));
            w.U8(0);   // ghost=0
        }

        var eaten = _world.EatenEvents;
        w.U16((ushort)eaten.Count);
        foreach (var (victim, eater) in eaten)
        {
            w.U32(victim.Id);
            w.U32(eater.Id);
        }

        // removed：击杀/管理移除（KillPlayer/SetBots/SetViruses）的细胞 id,
        // 客户端据此同步清掉场上残球
        var removed = _world.RemovedIds;
        var outCount = outOfView?.Count ?? 0;
        w.U16((ushort)(removed.Count + outCount));
        foreach (var id in removed) w.U32(id);
        if (outOfView != null)
            foreach (var id in outOfView) w.U32(id);

        // seen 维护：先删后加(避免 add 后又被 eat 的边界)
        foreach (var (victim, _) in eaten) seen.Remove(victim.Id);
        foreach (var id in removed) seen.Remove(id);
        if (outOfView != null) foreach (var id in outOfView) seen.Remove(id);
        foreach (var c in added) seen.Add(c.Id);
        return w.ToArray();
    }

    static void WriteCell(BinWriter w, Cell c, HashSet<Cell> mine)
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
        if (mine.Contains(c)) flags |= 64;                     // 自己的细胞
        if (c.Tab != 0 && mine.Contains(c)) flags |= 256;      // multibox 组号
        w.U16(flags);
        if ((flags & 8) != 0 && c.Color != null)
        {
            w.U8(c.Color[0]); w.U8(c.Color[1]); w.U8(c.Color[2]);
        }
        if ((flags & 16) != 0) w.String16(c.Nick);
        if ((flags & 256) != 0) w.U8(c.Tab);
    }

    /// <summary>
    /// 90 号排行榜帧：[90][u8 count]{str16 tag, str16 nick, u32 mass, u8 crowned, u8 nameColorMode}。
    /// （mock-server pktLeaderboard 同款——真实客户端联调验证过）
    /// </summary>
    byte[] EncodeLeaderboard()
    {
        var rows = _world.Players.Values
            .Where(p => p.Cells.Count > 0)
            .OrderByDescending(p => p.MassTotal)
            .Take(10)
            .ToList();
        var w = new BinWriter();
        w.U8(Op.Leaderboard);
        w.U8((byte)rows.Count);
        foreach (var p in rows)
        {
            w.String16("");           // tag 位（空）
            w.String16(p.Nick);
            w.U32((uint)p.MassTotal);
            w.U8(0);                  // crowned
            w.U8(0);                  // nameColorMode: 0=无
        }
        return w.ToArray();
    }

    /// <summary>
    /// 130 号战队榜帧 —— EU 抓包精确字节（82 0000 0001 00 a6fd0000,12B）：
    /// [130][u16 0][u16 队伍数][u16 0=空行占位][u32 全服总质量]。
    /// </summary>
    byte[] EncodeTeamLeaderboard()
    {
        uint totalMass = 0;
        int teamCount = 0;
        foreach (var p in _world.Players.Values)
        {
            if (p.Cells.Count == 0) continue;
            totalMass += (uint)p.MassTotal;
            teamCount++;
        }
        var w = new BinWriter();
        w.U8(Op.TeamLeaderboard);
        w.U16(0);                                  // 抓包 0000
        w.U16((ushort)Math.Min(teamCount, 65535)); // 抓包 0001
        w.U16(0);                                  // 抓包 00 00
        w.U32(totalMass);                          // 抓包 a6 fd 00 00
        return w.ToArray();
    }

    public GameWorld WorldRef => _world;
}
