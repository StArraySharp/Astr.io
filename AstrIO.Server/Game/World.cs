namespace AstrIO.Server.Game;

/// <summary>
/// 世界模拟（Ogar/MultiOgar 物理参数对齐，从 server/world.js v4.1 移植）。
/// 线程模型：GameLoop 单线程调用 Step()，连接层通过锁投递输入。
/// </summary>
public sealed class World
{
    // ---- 常量（MultiOgar config）----
    public const float BorderMin = 0f, BorderMax = 14142f;
    public const float VirusMinSize = 100f, VirusMaxSize = 140f;
    public const int VirusCount = 22, VirusMinAmount = 16;
    public const int FoodTarget = 1000, FoodSpawnPerTick = 30, FoodSpawnInterval = 2;
    public const float FoodMinSize = 10f, FoodMaxSize = 20f;
    public const float PlayerMinSize = 32f;          // mass 10.24
    public const float PlayerMaxSize = 1500f;        // mass 22500
    public const float PlayerMinSplit = 60f;         // mass 36
    public const float EjectSize = 38f, EjectSizeLoss = 43f;
    public const float EjectDistance = 1400f;        // 用户偏好加速（原版 780）
    public const int EjectCooldown = 1;              // 官方实测 40ms/发（每 tick 可吐）
    public const float MergeBaseSec = 30f;
    public const int MaxPieces = 16, MaxPiecesMegasplit = 64;
    public const int TickMs = 40;
    public const int BotCount = 100;
    public const float BotSpawnMass = 500f;          // 官方对齐：初始质量 500
    public const float BorderPad = 40f;              // 边界内缩：修复小球贴边瞬移
    public const int SubSpawnMass = 500;             // 子球初始质量
    public const int SubProtectTicks = 50;           // 子球出生保护 2s

    /// <summary>模式分身上限（astrio 官方实测：extreme=256/megasplit=64 其余 16）。</summary>
    public static readonly Dictionary<string, int> ModePieceCaps = new()
    {
        ["domination"] = 16, ["extreme"] = 256, ["ffa"] = 16,
        ["novirus"] = 16, ["instamerge"] = 16, ["megasplit"] = 64, ["hypermass"] = 1,
    };

    static readonly string[] BotNames = {
        "Champ", "Titan", "Doe", "Darwin", "Chief", "John", "Clement", "Warden", "Astra", "Nova",
        "Orbit", "Comet", "Pulsar", "Quark", "Zen", "Echo", "Fang", "Gale", "Hiro", "Iris",
        "Juno", "Kilo", "Luna", "Mako", "Nyx", "Onyx", "Pico", "Rune", "Sage", "Tide",
        "Vega", "Wisp", "Xeno", "Yuki", "Zephyr", "Ash", "Blaze", "Cinder", "Drift", "Ember",
        "Frost", "Glint", "Haze", "Ion", "Jet", "Koa", "Lynx", "Mist", "Nimbus", "Onyx2",
    };

    public Dictionary<uint, Player> Players { get; } = new();
    public Dictionary<uint, Cell> Cells { get; } = new();
    public List<(Cell Victim, Cell? Predator)> EatenEvents { get; } = new(); // 原版 50 号:[prey, predator]
    public int Tick { get; private set; }
    public float SpawnMass { get; set; } = 500f;        // 官方对齐：初始质量 500

    uint _nextCellId = 1, _nextPlayerId = 1000;
    readonly Random _rng = new();
    public readonly List<Player> Bots = new();

    static readonly object _lock = new();
    public static void Lock() => Monitor.Enter(_lock);
    public static void Unlock() => Monitor.Exit(_lock);

    public World()
    {
        SpawnFood(FoodTarget);
        SpawnViruses(VirusCount);
    }

    (float X, float Y) RandPos(float pad = 100)
    {
        return (
            pad + (float)_rng.NextDouble() * (BorderMax - pad * 2),
            pad + (float)_rng.NextDouble() * (BorderMax - pad * 2)
        );
    }

    public void SpawnFood(int n)
    {
        for (int i = 0; i < n; i++)
        {
            var (x, y) = RandPos(20);
            var size = FoodMinSize + (float)_rng.NextDouble() * (FoodMaxSize - FoodMinSize);
            var c = new Cell { Id = _nextCellId++, X = x, Y = y, IsFood = true };
            c.Mass = size * size / 100f;
            c.Color = new byte[] { (byte)(_rng.Next() % 256), (byte)(_rng.Next() % 256), (byte)(_rng.Next() % 256) };
            Cells[c.Id] = c;
        }
    }

    public void SpawnViruses(int n)
    {
        for (int i = 0; i < n; i++)
        {
            var (x, y) = RandPos(300);
            var c = new Cell { Id = _nextCellId++, X = x, Y = y, IsVirus = true };
            c.Mass = VirusMinSize * VirusMinSize / 100f;
            c.Color = new byte[] { 51, 51, 51 };
            Cells[c.Id] = c;
        }
    }

    public Player AddPlayer(string nick, bool isBot = false)
    {
        var p = new Player(_nextPlayerId++, nick, isBot);
        Players[p.Id] = p;
        return p;
    }

    public void RemovePlayer(Player p)
    {
        foreach (var c in p.Cells) Cells.Remove(c.Id);
        p.Cells.Clear();
        Players.Remove(p.Id);
    }

    public void Spawn(Player p) { if (p.Cells.Count == 0) SpawnTab(p, p.ActiveTab); }

    public Cell? SpawnTab(Player p, byte tab)
    {
        if (p.CellsOf(tab).Count > 0) return null;
        var (x, y) = RandPos(500);
        var c = new Cell
        {
            Id = _nextCellId++,
            X = x, Y = y,
            Owner = p, Tab = tab,
            Nick = p.Nick,
            Color = new byte[] { (byte)(_rng.Next() % 200), (byte)(_rng.Next() % 200), (byte)(_rng.Next() % 200) },
            BirthTick = Tick,
        };
        c.Mass = SpawnMass;
        p.Cells.Add(c);
        Cells[c.Id] = c;
        p.Mouse[tab - 1] = (x, y);
        return c;
    }

    public void SetSpawnMass(float m) => SpawnMass = Math.Clamp(m, 10f, 50000f);

    /// <summary>multibox 切组：目标组空时生成安全子球（前进方向优先 + 避开其他玩家）。</summary>
    public void MultiboxSwitch(Player p, byte tab)
    {
        if (tab is not (1 or 2)) return;
        var cur = p.ActiveTab;
        if (tab == cur) return;
        p.ActiveTab = tab;
        if (p.CellsOf(tab).Count == 0)
            SpawnSubNear(p, cur, tab);
    }

    /// <summary>子球安全生成：母球附近前进方向优先，避开其他玩家大球与边界；出生带 2s 保护。</summary>
    public Cell SpawnSubNear(Player p, byte srcTab, byte dstTab)
    {
        var src = p.CellsOf(srcTab);
        if (src.Count == 0) return SpawnTab(p, dstTab)!;
        var m = src.Aggregate((a, b) => b.Mass > a.Mass ? b : a);   // 母球 = 源组最大球
        var mm = p.Mouse[srcTab - 1];
        float dx = mm.X - m.X, dy = mm.Y - m.Y;
        float dl = dx * dx + dy * dy;
        if (dl < 100)
        {
            var a = (float)(_rng.NextDouble() * Math.PI * 2);
            dx = MathF.Sin(a); dy = MathF.Cos(a); dl = 1;
        }
        var d = MathF.Sqrt(dl);
        var ux = dx / d; var uy = dy / d;
        var subR = MathF.Sqrt(SubSpawnMass * 100f);
        var dist = m.R + subR * 2 + 120;
        float Px() => m.X + ux * dist;
        float Py() => m.Y + uy * dist;

        bool InBorder(float x, float y) =>
            x >= BorderMin + BorderPad && x <= BorderMax - BorderPad &&
            y >= BorderMin + BorderPad && y <= BorderMax - BorderPad;

        bool OverlapsEnemy(float x, float y)
        {
            foreach (var other in Cells.Values)
            {
                if (other.Owner == null || other.Owner == p) continue;
                var ddx = other.X - x; var ddy = other.Y - y;
                if (ddx * ddx + ddy * ddy < other.R * other.R) return true;
            }
            return false;
        }

        var px = Px(); var py = Py();
        if (OverlapsEnemy(px, py) || !InBorder(px, py))
        {
            var baseA = MathF.Atan2(dx, dy);
            var found = false;
            for (int i = 1; i <= 7; i++)
            {
                var a = baseA + i * MathF.PI / 4;
                var cx = m.X + MathF.Sin(a) * dist;
                var cy = m.Y + MathF.Cos(a) * dist;
                if (InBorder(cx, cy) && !OverlapsEnemy(cx, cy)) { px = cx; py = cy; found = true; break; }
            }
            if (!found)
            {
                // 兜底：远离最近敌方大球
                Player? nearOwner = null; Cell? nearest = null; float nd = float.MaxValue;
                foreach (var other in Cells.Values)
                {
                    if (other.Owner == null || other.Owner == p) continue;
                    var ddx = other.X - m.X; var ddy = other.Y - m.Y;
                    var dd = ddx * ddx + ddy * ddy;
                    if (dd < nd) { nd = dd; nearest = other; }
                }
                if (nearest != null)
                {
                    var ax = m.X - nearest.X; var ay = m.Y - nearest.Y;
                    var al = MathF.Sqrt(ax * ax + ay * ay);
                    if (al < 1) al = 1;
                    px = m.X + ax / al * dist; py = m.Y + ay / al * dist;
                }
            }
        }
        px = Math.Clamp(px, BorderMin, BorderMax);
        py = Math.Clamp(py, BorderMin, BorderMax);

        var c = new Cell
        {
            Id = _nextCellId++, X = px, Y = py,
            Owner = p, Tab = dstTab, Nick = p.Nick,
            Color = m.Color, BirthTick = Tick,
        };
        c.Mass = SubSpawnMass;
        // 出生保护 2s：不可被同组吞噬
        c.NoMergeUntil = Tick + SubProtectTicks;
        p.Cells.Add(c);
        Cells[c.Id] = c;
        p.Mouse[dstTab - 1] = (px + ux * 400, py + uy * 400);   // 出生即沿前进方向跑
        return c;
    }

    /// <summary>S 键停移/恢复（linesplit 宏停移部分）。</summary>
    public void SetFrozen(Player p, bool frozen) => p.Frozen = frozen;

    public void SetMouse(Player p, byte tab, float x, float y)
    {
        if (tab is not (1 or 2)) return;
        p.Mouse[tab - 1] = (x, y);
    }

    int PieceCap(Player p) =>
        ModePieceCaps.TryGetValue(p.Mode, out var cap) ? cap
        : (p.Mode == "megasplit" ? MaxPiecesMegasplit : MaxPieces);

    static float RemergeTicks(float mass) =>
        MathF.Ceiling((MergeBaseSec + 0.0233f * mass) * 25f);

    /// <summary>主循环一帧（25fps 调用）。EatenEvents 帧后由广播层消费并清空。</summary>
    public void Step()
    {
        Tick++;
        EatenEvents.Clear();

        // 1) 移动：朝各自 tab 鼠标，32 单位内减速；boost 消耗；边界内缩防瞬移；frozen 停移
        foreach (var c in Cells.Values)
        {
            if (c.Owner != null)
            {
                if (c.Owner.Frozen) { c.ApplyBoost(); }
                else
                {
                    var m = c.Owner.Mouse[c.Tab == 2 ? 1 : 0];
                    var dx = m.X - c.X;
                    var dy = m.Y - c.Y;
                    var sq = dx * dx + dy * dy;
                    if (sq > 1)
                    {
                        var d = MathF.Sqrt(sq);
                        var nx = dx / d;
                        var ny = dy / d;
                        var dn = MathF.Min(d, 32f) / 32f;
                        var spd = c.Speed * dn;
                        c.X += nx * spd; c.Y += ny * spd;
                    }
                }
            }
            c.ApplyBoost();
            c.X = Math.Clamp(c.X, BorderMin + BorderPad, BorderMax - BorderPad);
            c.Y = Math.Clamp(c.Y, BorderMin + BorderPad, BorderMax - BorderPad);
        }

        // 2) 通用吞噬：不同玩家互吃；同主跨 tab（字母球）允许大吃小；同 tab 交给合并逻辑
        var list = Cells.Values.ToList();
        foreach (var a in list)
        {
            if (!Cells.ContainsKey(a.Id)) continue;
            if (a.IsFood || a.IsEjected || a.IsVirus) continue;
            foreach (var b in list)
            {
                if (b == a) continue;
                if (!Cells.ContainsKey(b.Id) || !Cells.ContainsKey(a.Id)) continue;
                if (b.IsVirus) continue;
                var sameOwner = a.Owner != null && b.Owner != null && a.Owner == b.Owner;
                if (sameOwner && a.Tab == b.Tab) continue;
                if (a.R <= b.R * 1.15f) continue;
                var dx = a.X - b.X;
                var dy = a.Y - b.Y;
                var rr = a.R - b.R / 3f;
                if (dx * dx + dy * dy > rr * rr) continue;
                // 同主跨 tab：受出生保护限制
                if (sameOwner && (b.NoMergeUntil > Tick)) continue;
                a.Mass += b.Mass;   // 不限制单球质量
                Cells.Remove(b.Id);
                b.Owner?.Cells.Remove(b);
                EatenEvents.Add((b, a));
            }
        }

        // 3) 病毒吃孢子；满 140 射新病毒
        foreach (var v in list)
        {
            if (!v.IsVirus || !Cells.ContainsKey(v.Id)) continue;
            foreach (var e in list)
            {
                if (!e.IsEjected || !Cells.ContainsKey(e.Id)) continue;
                var dx = v.X - e.X;
                var dy = v.Y - e.Y;
                var rr = v.R - e.R / 3f;
                if (dx * dx + dy * dy > rr * rr) continue;
                v.Mass += e.Mass;
                Cells.Remove(e.Id);
                EatenEvents.Add((e, v)); // 病毒吃孢子
                if (v.R >= VirusMaxSize)
                {
                    v.Mass = VirusMinSize * VirusMinSize / 100f;
                    var angle = MathF.Atan2(dx, dy);
                    var nv = new Cell { Id = _nextCellId++, X = v.X, Y = v.Y, IsVirus = true };
                    nv.Mass = VirusMinSize * VirusMinSize / 100f;
                    nv.Color = new byte[] { 51, 51, 51 };
                    nv.SetBoost(780, angle);
                    Cells[nv.Id] = nv;
                }
            }
        }

        // 4) 同 tab 组：碰撞排斥 + 合并（含 NoMergeUntil 出生保护）
        foreach (var p in Players.Values)
        {
            for (byte tab = 1; tab <= 2; tab++)
            {
                var arr = p.CellsOf(tab).Where(c => Cells.ContainsKey(c.Id)).ToList();
                if (arr.Count < 2) continue;
                for (int i = 0; i < arr.Count; i++)
                {
                    var a = arr[i];
                    if (!Cells.ContainsKey(a.Id)) continue;
                    for (int j = i + 1; j < arr.Count; j++)
                    {
                        var b = arr[j];
                        if (!Cells.ContainsKey(b.Id)) continue;
                        var dx = b.X - a.X;
                        var dy = b.Y - a.Y;
                        var distSq = dx * dx + dy * dy;
                        var minDist = a.R + b.R;
                        if (a.Age < 15 || b.Age < 15) continue;
                        // 出生保护：任一方在保护期内不合并
                        if (a.NoMergeUntil > Tick || b.NoMergeUntil > Tick)
                        {
                            // 仍做碰撞排斥
                        }
                        var canMerge = (a.NoMergeUntil <= Tick && b.NoMergeUntil <= Tick) &&
                                       a.CanRemerge(Tick, MergeBaseSec) && b.CanRemerge(Tick, MergeBaseSec);
                        if (canMerge)
                        {
                            var big = a.Mass >= b.Mass ? a : b;
                            var small = big == a ? b : a;
                            var rr = MathF.Max(0, big.R - small.R / 3f);
                            if (distSq <= rr * rr)
                            {
                                big.Mass += small.Mass;
                                Cells.Remove(small.Id);
                                p.Cells.Remove(small);
                                EatenEvents.Add((small, big));
                                continue;
                            }
                        }
                        else if (distSq < minDist * minDist && distSq > 0)
                        {
                            var dist = MathF.Sqrt(distSq);
                            var nx = dx / dist;
                            var ny = dy / dist;
                            var penetration = minDist - dist;
                            var total = a.R * a.R + b.R * b.R;
                            var impA = b.R * b.R / total;
                            var impB = a.R * a.R / total;
                            a.X -= nx * penetration * impA;
                            a.Y -= ny * penetration * impA;
                            b.X += nx * penetration * impB;
                            b.Y += ny * penetration * impB;
                        }
                    }
                }
            }
        }

        // 5) 刺球爆裂
        foreach (var p in Players.Values)
        {
            foreach (var c in p.Cells.ToList())
            {
                if (!Cells.ContainsKey(c.Id)) continue;
                foreach (var v in list)
                {
                    if (!v.IsVirus || !Cells.ContainsKey(v.Id)) continue;
                    if (c.R <= v.R * 1.15f) continue;
                    var dx = c.X - v.X;
            var dy = c.Y - v.Y;
                    var rr = c.R - v.R / 3f;
                    if (dx * dx + dy * dy > rr * rr) continue;
                    Cells.Remove(v.Id);
                    EatenEvents.Add((v, c)); // 细胞吃病毒(c 吃 v → 爆裂)
                    ExplodeByVirus(p, c);
                    break;
                }
            }
        }

        // 6) 食物/病毒补充
        if (Tick % FoodSpawnInterval == 0)
        {
            int food = 0, virus = 0;
            foreach (var c in Cells.Values)
            {
                if (c.IsFood) food++;
                else if (c.IsVirus) virus++;
            }
            if (food < FoodTarget) SpawnFood(Math.Min(FoodSpawnPerTick, FoodTarget - food));
            if (virus < VirusMinAmount) SpawnViruses(2);
        }

        // 7) 质量衰减：固定值制（官方实测：-100/s @20k）
        if (Tick % 25 == 0)
        {
            foreach (var c in Cells.Values)
            {
                if (c.Owner == null || c.IsFood || c.IsVirus || c.IsEjected) continue;
                if (c.R <= PlayerMinSize) continue;
                c.Mass = MathF.Max(PlayerMinSize * PlayerMinSize / 100f, c.Mass - DecayPerSec(c.Mass));
            }
        }

        // 8) multibox 自动切回（活跃组清空 → 切回存活组 + 鼠标继承）
        foreach (var p in Players.Values)
        {
            int t1 = p.CellsOf(1).Count, t2 = p.CellsOf(2).Count;
            byte target = 0;
            if (p.ActiveTab == 2 && t2 == 0 && t1 > 0) target = 1;
            else if (p.ActiveTab == 1 && t1 == 0 && t2 > 0) target = 2;
            if (target != 0)
            {
                var last = p.Mouse[p.ActiveTab - 1];
                p.Mouse[target - 1] = last;
                p.ActiveTab = target;
            }
        }

        // 9) 细胞年龄推进
        foreach (var c in Cells.Values) c.Age = Tick - c.BirthTick;
    }

    /// <summary>官方固定值衰减分档（实测：-100/s @20k，~4/s @1.7k）。</summary>
    public static float DecayPerSec(float mass)
    {
        if (mass > 10000) return 100f;
        if (mass > 5000) return 50f;
        if (mass > 2000) return 20f;
        if (mass > 1000) return 8f;
        return 2f;
    }

    /// <summary>病毒爆刺（astrio 官方实测）：吃刺球的分身【均匀裂成最大分身量】。</summary>
    void ExplodeByVirus(Player p, Cell c)
    {
        var cap = PieceCap(p);
        var maxSplit = cap - p.CellsOf(c.Tab).Count + 1;   // 本体计一名
        if (maxSplit < 2) return;
        var minPieceMass = PlayerMinSplit * PlayerMinSplit / 100f;
        var pieceCount = (int)MathF.Min(maxSplit, MathF.Floor(c.Mass / minPieceMass));
        if (pieceCount < 2) return;
        var each = c.Mass / pieceCount;
        c.Mass = each;
        var angle0 = (float)(_rng.NextDouble() * Math.PI * 2);
        var step = MathF.PI * 2 / pieceCount;
        for (int i = 1; i < pieceCount; i++)
        {
            var angle = angle0 + i * step;
            var piece = new Cell
            {
                Id = _nextCellId++, X = c.X, Y = c.Y,
                Owner = p, Tab = c.Tab,
                Color = c.Color, Nick = c.Nick,
                BirthTick = Tick,
                NoMergeUntil = Tick + (int)RemergeTicks(each),
            };
            piece.Mass = each;
            piece.SetBoost(273, angle); // 780*0.35
            p.Cells.Add(piece);
            Cells[piece.Id] = piece;
        }
    }

    /// <summary>Ogar GameServer.splitMass：降序质量分布（含本体）。</summary>
    List<float> SplitMass(float mass, int count)
    {
        var throwSize = PlayerMinSplit + 12;
        var throwMass = throwSize * throwSize / 100f;
        int maxCount = count;
        var curMass = mass;
        while (maxCount > 1 && curMass / (maxCount - 1) < throwMass)
            maxCount >>= 1;
        if (maxCount < 2) return new List<float> { mass };
        var masses = new List<float>();
        if (maxCount < 3 || maxCount < count || curMass / throwMass <= 30)
        {
            for (int i = 0; i < maxCount; i++) masses.Add(curMass / maxCount);
            return masses;
        }
        int restCount = maxCount;
        while (restCount > 2)
        {
            var splitMass = curMass / 2;
            if (splitMass <= throwMass) break;
            var max = curMass - throwMass * (restCount - 1);
            if (max <= throwMass || splitMass >= max) break;
            masses.Add(splitMass);
            curMass -= splitMass;
            restCount--;
        }
        foreach (var div in new[] { 4f, 8f })
        {
            var splitMass = curMass / div;
            if (splitMass > throwMass)
            {
                while (restCount > 2)
                {
                    var max = curMass - throwMass * (restCount - 1);
                    if (max <= throwMass || splitMass >= max) break;
                    masses.Add(splitMass);
                    curMass -= splitMass;
                    restCount--;
                }
            }
        }
        if (restCount > 1)
        {
            var splitMass = curMass - throwMass * (restCount - 1);
            if (splitMass > throwMass)
            {
                masses.Add(splitMass);
                curMass -= splitMass;
                restCount--;
            }
        }
        if (restCount > 0)
        {
            var splitMass = curMass / restCount;
            for (int i = 0; i < restCount; i++) masses.Add(splitMass);
        }
        return masses;
    }

    public bool CanEject(Player p, int tick)
    {
        if (p.LastEjectTick < 0) { p.LastEjectTick = tick; return true; }
        return tick - p.LastEjectTick >= EjectCooldown;
    }

    /// <summary>吐孢子（每次键击所有细胞都吐）。</summary>
    public void Eject(Player p, byte tab)
    {
        if (Tick - p.LastEjectTick < EjectCooldown) return;
        p.LastEjectTick = Tick;
        foreach (var c in p.CellsOf(tab))
        {
            if (c.R < PlayerMinSplit) continue;
            var m = p.Mouse[tab - 1];
            var dx = m.X - c.X;
        var dy = m.Y - c.Y;
            var dl = dx * dx + dy * dy;
            if (dl < 1) { dx = 1; dy = 0; }
            var lossMass = EjectSizeLoss * EjectSizeLoss / 100f;
            if (c.Mass - lossMass < PlayerMinSize * PlayerMinSize / 100f) continue;
            c.Mass -= lossMass;
            var d = MathF.Sqrt(dx * dx + dy * dy);
            if (d < 1) d = 1;
            var e = new Cell
            {
                Id = _nextCellId++,
                X = c.X + dx / d * c.R, Y = c.Y + dy / d * c.R,
                IsEjected = true, Color = c.Color,
            };
            e.Mass = EjectSize * EjectSize / 100f;
            e.SetBoost(EjectDistance, MathF.Atan2(dx, dy));
            Cells[e.Id] = e;
        }
    }

    /// <summary>分裂（一次键击每个 ≥60 size 细胞各分一次，等分，boost 870）。</summary>
    public void Split(Player p, byte tab)
    {
        var cap = PieceCap(p);
        var group = p.CellsOf(tab);
        var toSplit = new List<Cell>();
        foreach (var c in group)
        {
            if (c.R < PlayerMinSplit) continue;
            toSplit.Add(c);
            if (toSplit.Count + group.Count >= cap) break;
        }
        foreach (var c in toSplit)
        {
            if (p.CellsOf(tab).Count >= cap) break;
            var m = p.Mouse[c.Tab - 1];
            var dx = m.X - c.X;
        var dy = m.Y - c.Y;
            var dl = dx * dx + dy * dy;
            if (dl < 1) { dx = 1; dy = 0; }
            var angle = MathF.Atan2(dx, dy);
            var half = c.Mass / 2;
            c.Mass = half;
            var n = new Cell
            {
                Id = _nextCellId++,
                X = c.X + 40 * MathF.Sin(angle), Y = c.Y + 40 * MathF.Cos(angle),
                Owner = p, Tab = c.Tab,
                Color = c.Color, Nick = c.Nick,
                BirthTick = Tick,
            };
            n.Mass = half;
            n.SetBoost(870, angle);
            p.Cells.Add(n);
            Cells[n.Id] = n;
        }
    }

    // ---------- AI ----------
    public void SpawnBots()
    {
        for (int i = 0; i < BotCount; i++)
        {
            var name = BotNames[i % BotNames.Length] + (i >= BotNames.Length ? "-" + i : "");
            var b = AddPlayer(name, isBot: true);
            b.Mode = "extreme";
            Spawn(b);
            foreach (var c in b.Cells) c.Mass = BotSpawnMass;
            Bots.Add(b);
        }
    }

    public void BotThink(Player b)
    {
        b.AiTick++;
        if (b.AiTick % 10 != 1) return;
        var tab = b.ActiveTab;
        Cell? best = null;
        float bestD = float.MaxValue;
        float myBiggest = 0;
        foreach (var c in b.Cells) myBiggest = MathF.Max(myBiggest, c.R);
        foreach (var c in Cells.Values)
        {
            if (c.Owner == b) continue;
            if (c.IsVirus) continue;
            if (!c.IsFood && !c.IsEjected)
            {
                float big = c.R;
                if (c.Owner != null)
                    foreach (var x in c.Owner.Cells) big = MathF.Max(big, x.R);
                if (myBiggest <= big * 1.3f) continue;
            }
            Cell? mine = null;
            foreach (var x in b.Cells) { mine = x; break; }
            if (mine == null) break;
            var dx = c.X - mine.X;
            var dy = c.Y - mine.Y;
            var d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = c; }
        }
        if (best != null)
        {
            SetMouse(b, tab, best.X, best.Y);
            if (b.Cells.Count == 1 && _rng.NextSingle() < 0.02f)
            {
                Cell? main = null;
                foreach (var x in b.CellsOf(tab)) { main = x; break; }
                if (main != null && main.Mass > 200 && bestD < main.R * 2 * (main.R * 2))
                    Split(b, tab);
            }
        }
        else
        {
            SetMouse(b, tab, (float)(_rng.NextDouble() * BorderMax), (float)(_rng.NextDouble() * BorderMax));
        }
    }

    public void MaintainBots()
    {
        foreach (var b in Bots)
        {
            if (b.Cells.Count == 0)
            {
                Spawn(b);
                foreach (var c in b.Cells) c.Mass = BotSpawnMass;
            }
        }
    }
}
