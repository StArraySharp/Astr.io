namespace AstrIO.Server.Game;

/// <summary>
/// 世界模拟 —— Node server/world.js v4 的逐行 C# 移植（Ogar/MultiOgar 参数对齐）。
/// 线程模型：GameLoop 单线程调用 Step()；连接层通过 WorldLock 投递输入。
/// 与 Node 版保持同一行为（含全部修复）：
///   - 吞噬扫掠剪枝：食物可被吞（不能加 isFood 过滤——历史 bug：全场饿死）
///   - frozen 玩家：位置完全固定（跳过移动+碰撞）
///   - 单球 mass≥20000：SplitCell 只分该球（非全组分裂）
/// </summary>
public sealed class GameWorld
{
    // ---- 常量（MultiOgar config，与 world.js 一致）----
    public const float BorderMin = 0f, BorderMax = 14142f;
    public const float VirusMinSize = 100f, VirusMaxSize = 140f;
    public const int FoodTarget = 1000, FoodSpawnPerTick = 30, FoodSpawnInterval = 2;
    public const float FoodMinSize = 10f, FoodMaxSize = 20f;
    public const float PlayerMinSize = 32f;          // mass 10.24
    public const float PlayerMaxSize = 1500f;        // mass 22500
    public const float PlayerMinSplit = 60f;         // mass 36
    public const float EjectSize = 38f, EjectSizeLoss = 43f;
    public const float EjectDistance = 1400f;        // 用户偏好加速（原版 780）
    public const int EjectCooldown = 1;              // 官方实测 40ms/发（每 tick 可吐）
    public const float MergeBaseSec = 30f;
    public const float MergePerMassSec = 0.0233f;
    public const int MaxPieces = 16, MaxPiecesMegasplit = 64;
    public const int TickMs = 40;
    public const int TicksPerSec = 25;
    public const float BotSpawnMass = 500f;          // 官方对齐：初始质量 500
    public const float BorderPad = 40f;              // 边界内缩：修复小球贴边瞬移
    public const float SubSpawnMass = 500f;          // 子球初始质量
    public const int SubProtectTicks = 2 * TicksPerSec; // 子球出生保护 2s
    /// <summary>单球自动分裂阈值（服务器强制；面板设大质量时自动抬高）。</summary>
    public static float AutoSplitMass { get; set; } = 20000f;
    public const float MaxCollisionReach = 1500f;    // 同组碰撞扫掠的最大可能半径

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
    /// <summary>本帧吃事件（原版 50 号 wire 顺序：[victim][eater]），帧后由广播层消费。</summary>
    public List<(Cell Victim, Cell Eater)> EatenEvents { get; } = new();
    /// <summary>本帧非吞噬移除的细胞 id（击杀/SetBots/SetViruses）——50 号 removed 段下发,客户端清残留。</summary>
    public List<uint> RemovedIds { get; } = new();
    public int Tick { get; private set; }
    public float SpawnMass { get; set; } = 500f;

    // ---- 可实时调整的参数（Web 控制面板写入）----
    /// <summary>bot 数量上限（SetBots 实时增减）。</summary>
    public int BotCount { get; set; } = 100;
    /// <summary>全场刺球数（SetViruses 实时增减）。</summary>
    public int VirusTarget { get; set; } = 3;

    uint _nextCellId = 1, _nextPlayerId = 1000;
    readonly Random _rng = new();
    public readonly List<Player> Bots = new();

    public GameWorld()
    {
        SpawnFood(FoodTarget);
        SpawnViruses(VirusTarget);
    }

    // ---------- 生成 ----------

    (float X, float Y) RandPos(float pad = 100) => (
        pad + (float)_rng.NextDouble() * (BorderMax - pad * 2),
        pad + (float)_rng.NextDouble() * (BorderMax - pad * 2));

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

    public void Spawn(Player p)
    {
        if (p.Cells.Count == 0) SpawnTab(p, p.ActiveTab);
    }

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
        // 面板设置的质量优先（含 bot 重生保持自定义质量）,否则用全局出生质量
        c.Mass = p.PendingMass ?? SpawnMass;
        p.PendingMass = null;
        p.Cells.Add(c);
        Cells[c.Id] = c;
        p.Mouse[tab - 1] = (x, y);
        return c;
    }

    public void SetSpawnMass(float m) => SpawnMass = Math.Clamp(m, 10f, 50000f);

    // ---------- multibox ----------

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

        var m = src[0];
        foreach (var cc in src) if (cc.Mass > m.Mass) m = cc;   // 母球 = 源组最大球
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

        var px = m.X + ux * dist;
        var py = m.Y + uy * dist;
        if (OverlapsEnemy(px, py) || !InBorder(px, py))
        {
            var baseA = MathF.Atan2(dx, dy);
            var found = false;
            for (int i = 1; i <= 7; i++)   // 顺时针 45°×7 找合法落点
            {
                var a = baseA + i * MathF.PI / 4;
                var cx = m.X + MathF.Sin(a) * dist;
                var cy = m.Y + MathF.Cos(a) * dist;
                if (InBorder(cx, cy) && !OverlapsEnemy(cx, cy)) { px = cx; py = cy; found = true; break; }
            }
            if (!found)   // 兜底：远离最近敌方大球
            {
                Cell? nearest = null; float nd = float.MaxValue;
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
        c.NoMergeUntil = Tick + SubProtectTicks;   // 出生保护 2s：不可被同组吞噬
        p.Cells.Add(c);
        Cells[c.Id] = c;
        p.Mouse[dstTab - 1] = (px + ux * 400, py + uy * 400);   // 出生即沿前进方向跑
        return c;
    }

    // ---------- 输入 ----------

    public void SetMouse(Player p, byte tab, float x, float y)
    {
        if (tab is not (1 or 2)) return;
        p.Mouse[tab - 1] = (x, y);
    }

    /// <summary>S 键停移/恢复（linesplit 宏停移部分）。</summary>
    public void SetFrozen(Player p, bool frozen) => p.Frozen = frozen;

    // ---------- 分裂 ----------

    int PieceCap(Player p) =>
        ModePieceCaps.TryGetValue(p.Mode, out var cap) ? cap
        : (p.Mode == "megasplit" ? MaxPiecesMegasplit : MaxPieces);

    static int RemergeTicks(float mass) =>
        (int)MathF.Ceiling((MergeBaseSec + MergePerMassSec * mass) * TicksPerSec);

    /// <summary>
    /// 分裂（Ogar splitCells）：一次键击 tab 组内每个 ≥60 size 的细胞各分一次。
    /// 内部逐球走 SplitCell（受分身上限约束）。
    /// </summary>
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
            SplitCell(p, c);
    }

    /// <summary>
    /// 单球分裂（Ogar splitPlayerCell）：只分指定细胞，母球保留一半，
    /// 新球在母球前方 40 单位生成、固定 boostValue=870 沿鼠标方向弹出。
    /// 上限已满时静默跳过（20000 自动分裂下秒再试）。
    /// </summary>
    public void SplitCell(Player p, Cell c)
    {
        if (p.CellsOf(c.Tab).Count >= PieceCap(p)) return;
        var m = p.Mouse[c.Tab - 1];
        float dx = m.X - c.X, dy = m.Y - c.Y;
        // 鼠标与球重合时用随机方向（原来固定 dx=1,dy=0 → 所有兜底分身全部向右飞,累积成“全场往右下”的偏置）
        if (dx * dx + dy * dy < 1)
        {
            var a = (float)(_rng.NextDouble() * Math.PI * 2);
            dx = MathF.Sin(a); dy = MathF.Cos(a);
        }
        var angle = MathF.Atan2(dx, dy);
        var half = c.Mass / 2f;
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

    // ---------- 吐球 ----------

    /// <summary>吐孢子（Ogar ejectMass）：tab 组全部球各吐一枚，射程 EjectDistance。</summary>
    public void Eject(Player p, byte tab)
    {
        if (Tick - p.LastEjectTick < EjectCooldown) return;
        p.LastEjectTick = Tick;
        foreach (var c in p.CellsOf(tab))
        {
            if (c.R < PlayerMinSplit) continue;
            var m = p.Mouse[tab - 1];
            float dx = m.X - c.X, dy = m.Y - c.Y;
            // 同 SplitCell:重合时随机方向,不再恒向右
            if (dx * dx + dy * dy < 1)
            {
                var a2 = (float)(_rng.NextDouble() * Math.PI * 2);
                dx = MathF.Sin(a2); dy = MathF.Cos(a2);
            }
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

    // ---------- 主循环 ----------

    /// <summary>主循环一帧（25fps）。EatenEvents 帧后由广播层消费并清空。</summary>
    public void Step()
    {
        Tick++;
        EatenEvents.Clear();
        // ★ RemovedIds 不在这里清空:击杀(HTTP)发生在两次 tick 之间,
        //   若在此清空会把"上一帧间隙收到的击杀记录"在广播前抹掉,
        //   导致 removed 段恒空 → 客户端留下无碰撞假球。清空点在广播完成后(GameLoop)。

        // 1) 移动：朝各自 tab 鼠标，32 单位内线性减速；boost 消耗；边界内缩防瞬移；
        //    frozen（S 键停移）：老球不追鼠标(位置固定)，但新分裂球的 boost 保留——
        //    官方 linesplit 行为：停移+分裂 → 新球沿冻结鼠标方向直线飞出，老球原地不动
        foreach (var c in Cells.Values)
        {
            if (c.Owner != null && c.Owner.Frozen)
            {
                // 停移：不追鼠标；boost 照常消耗（分裂出的新球直线飞行）
                c.ApplyBoost();
                c.X = Math.Clamp(c.X, BorderMin + BorderPad, BorderMax - BorderPad);
                c.Y = Math.Clamp(c.Y, BorderMin + BorderPad, BorderMax - BorderPad);
                continue;
            }
            if (c.Owner != null)
            {
                var m = c.Owner.Mouse[c.Tab == 2 ? 1 : 0];
                float dx = m.X - c.X, dy = m.Y - c.Y;
                var sq = dx * dx + dy * dy;
                if (sq > 1)
                {
                    var d = MathF.Sqrt(sq);
                    var dn = MathF.Min(d, 32f) / 32f;   // 32 单位内减速
                    var spd = c.Speed * dn;
                    c.X += dx / d * spd; c.Y += dy / d * spd;
                }
            }
            c.ApplyBoost();
            c.X = Math.Clamp(c.X, BorderMin + BorderPad, BorderMax - BorderPad);
            c.Y = Math.Clamp(c.Y, BorderMin + BorderPad, BorderMax - BorderPad);
        }

        // 2) 通用吞噬（x 排序扫掠剪枝：对每个捕食者 a 只检查 x 距离 ≤ a.r 的邻居，
        //    把 O(N²) 全对比较降到近似 O(N·k)）：
        //    - 不同玩家：大小比 1.15，吃半径 = r_a - r_b/3
        //    - 同主跨 tab（multibox 字母组）：允许大吃小；同 tab 交给合并逻辑
        //    ★ 食物/孢子必须可被吞——历史 bug：误加 isFood 过滤导致全场饿死到最小球
        var list = Cells.Values.ToList();
        list.Sort((a, b) => a.X.CompareTo(b.X));
        for (int ai = 0; ai < list.Count; ai++)
        {
            var a = list[ai];
            if (!Cells.ContainsKey(a.Id)) continue;
            if (a.IsFood || a.IsEjected || a.IsVirus) continue;

            TrySweep(a, list, ai - 1, -1);   // 向左扫：x 递减，超 a.r 即停
            TrySweep(a, list, ai + 1, +1);   // 向右扫：x 递增，超 a.r 即停
        }

        // 3) 病毒：吃孢子成长；满 VIRUS_MAX_SIZE 时朝孢子来向射出新病毒（Ogar Virus.onEat）
        foreach (var v in list)
        {
            if (!v.IsVirus || !Cells.ContainsKey(v.Id)) continue;
            foreach (var e in list)
            {
                if (!e.IsEjected || !Cells.ContainsKey(e.Id)) continue;
                float dx = v.X - e.X, dy = v.Y - e.Y;
                var rr = v.R - e.R / 3f;
                if (dx * dx + dy * dy > rr * rr) continue;
                v.Mass += e.Mass;
                Cells.Remove(e.Id);
                EatenEvents.Add((e, v));
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

        // 4) 同 tab 细胞：碰撞排斥 + 合并（frozen 玩家跳过——位置固定无碰撞需求）
        foreach (var p in Players.Values)
        {
            if (p.Frozen) continue;
            for (byte tab = 1; tab <= 2; tab++)
            {
                var arr = p.CellsOf(tab).Where(c => Cells.ContainsKey(c.Id)).ToList();
                if (arr.Count < 2) continue;
                arr.Sort((a, b) => a.X.CompareTo(b.X));
                for (int i = 0; i < arr.Count; i++)
                {
                    var a = arr[i];
                    if (!Cells.ContainsKey(a.Id)) continue;
                    var aMaxReach = MaxCollisionReach + a.R;   // a 可能接触的最远 x
                    for (int j = i + 1; j < arr.Count; j++)
                    {
                        var b = arr[j];
                        if (b.X - a.X > aMaxReach) break;      // 剪枝：x 递增，超界即停
                        if (!Cells.ContainsKey(b.Id)) continue;
                        float dx = b.X - a.X, dy = b.Y - a.Y;
                        var distSq = dx * dx + dy * dy;
                        var minDist = a.R + b.R;
                        // Ogar checkRigidCollision：出生 <15 tick 忽略碰撞（防分裂立即弹开）
                        if (a.Age < 15 || b.Age < 15) continue;
                        var canMerge = a.CanRemerge(Tick) && b.CanRemerge(Tick);
                        if (canMerge)
                        {
                            // 允许重叠：中心进入大者半径内即合并（Ogar eatDistance）
                            var big = a.Mass >= b.Mass ? a : b;
                            var small = big == a ? b : a;
                            var rr = MathF.Max(0f, big.R - small.R / 3f);
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
                            // Ogar resolveRigidCollision：按面积平方加权冲量推开
                            var dist = MathF.Sqrt(distSq);
                            var nx = dx / dist; var ny = dy / dist;
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

        // 5) 刺球：够大的细胞碰到 → 均匀爆裂到最大分身量（astrio 官方机制）
        foreach (var p in Players.Values)
        {
            foreach (var c in p.Cells.ToList())
            {
                if (!Cells.ContainsKey(c.Id)) continue;
                foreach (var v in list)
                {
                    if (!v.IsVirus || !Cells.ContainsKey(v.Id)) continue;
                    if (c.R <= v.R * 1.15f) continue;
                    float dx = c.X - v.X, dy = c.Y - v.Y;
                    var rr = c.R - v.R / 3f;
                    if (dx * dx + dy * dy > rr * rr) continue;
                    Cells.Remove(v.Id);
                    EatenEvents.Add((v, c));
                    ExplodeByVirus(p, c);
                    break;
                }
            }
        }

        // 6) 食物/病毒补充（计数与生成分离:SpawnFood/SpawnViruses 写 Cells,不可在枚举中调用）
        if (Tick % FoodSpawnInterval == 0)
        {
            int food = 0, virus = 0;
            foreach (var c in Cells.Values)
            {
                if (c.IsFood) food++;
                else if (c.IsVirus) virus++;
            }
            if (food < FoodTarget) SpawnFood(Math.Min(FoodSpawnPerTick, FoodTarget - food));
            if (virus < VirusTarget) SpawnViruses(Math.Min(2, VirusTarget - virus));
            else if (virus > VirusTarget) RemoveExcessViruses(virus - VirusTarget);
        }

        // 7) 质量衰减：每秒一次，固定值制（官方实测 -100/s @20k，非百分比）；
        //    单球 mass≥20000 → SplitCell 只分该球（玩家与 bot 一致）
        // ★ 必须先快照再枚举：SplitCell 会向 Cells 写入新球,在 Dictionary.Values
        //   枚举途中写入会抛 InvalidOperationException 并杀死整个主循环
        //   （Node 版 for..of Map 迭代中加键是安全的,C# Dictionary 不行——移植陷阱）
        if (Tick % TicksPerSec == 0)
        {
            var decayList = Cells.Values.ToList();
            foreach (var c in decayList)
            {
                if (c.Owner == null || c.IsFood || c.IsVirus || c.IsEjected) continue;
                if (!Cells.ContainsKey(c.Id)) continue;   // 本轮已被吞/合并的跳过
                if (c.R <= PlayerMinSize) continue;
                c.Mass = MathF.Max(PlayerMinSize * PlayerMinSize / 100f, c.Mass - DecayPerSec(c.Mass));
                if (c.Mass >= AutoSplitMass)
                    SplitCell(c.Owner, c);
            }
        }

        // 8) multibox 自动切回：活跃组被吃光 → 切回存活组 + 鼠标继承（视角不跳变）
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

    /// <summary>扫掠吞嘤断片：dir=-1 向左（索引递减），dir=+1 向右（索引递增）。</summary>
    void TrySweep(Cell a, List<Cell> list, int start, int dir)
    {
        for (int bi = start; bi >= 0 && bi < list.Count; bi += dir)
        {
            var b = list[bi];
            var xDiff = dir > 0 ? b.X - a.X : a.X - b.X;
            if (xDiff > a.R) break;   // 已超出最大吞距，再扫只会更远
            if (!Cells.ContainsKey(b.Id) || !Cells.ContainsKey(a.Id)) continue;
            if (b.IsVirus || b.R >= a.R) continue;   // ★ 食物可被吞，不能过滤
            var sameOwner = a.Owner != null && b.Owner != null && a.Owner == b.Owner;
            if (sameOwner && a.Tab == b.Tab) continue;   // 同 tab：交给合并逻辑
            if (a.R <= b.R * 1.15f) continue;
            float dx = a.X - b.X, dy = a.Y - b.Y;
            var rr = a.R - b.R / 3f;
            if (dx * dx + dy * dy > rr * rr) continue;
            a.Mass += b.Mass;
            Cells.Remove(b.Id);
            b.Owner?.Cells.Remove(b);
            EatenEvents.Add((b, a));
        }
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

    /// <summary>
    /// 病毒爆刺（astrio 官方机制）：吃刺球的那个分身均匀裂成最大分身量（本体不保留额外质量），
    /// 朝四周均匀射出，各片带合并冷却。
    /// </summary>
    void ExplodeByVirus(Player p, Cell c)
    {
        var cap = PieceCap(p);
        var group = p.CellsOf(c.Tab);
        var maxSplit = cap - group.Count + 1;   // 本体计一名
        if (maxSplit < 2) return;
        var minPieceMass = PlayerMinSplit * PlayerMinSplit / 100f;
        var pieceCount = (int)MathF.Min(maxSplit, MathF.Floor(c.Mass / minPieceMass));
        if (pieceCount < 2) return;
        var each = c.Mass / pieceCount;
        c.Mass = each;
        c.NoMergeUntil = Tick + RemergeTicks(each);
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
            };
            piece.Mass = each;
            piece.NoMergeUntil = Tick + RemergeTicks(each);   // ★ 必须设,否则爆开即合拢
            piece.SetBoost(780 * 0.35f, angle);               // 爆刺射程
            p.Cells.Add(piece);
            Cells[piece.Id] = piece;
        }
    }

    // ---------- AI ----------

    public void SpawnBots()
    {
        for (int i = 0; i < BotCount; i++)
        {
            var name = BotNames[i % BotNames.Length] + (i >= BotNames.Length ? "-" + i : "");
            var b = AddPlayer(name, isBot: true);
            b.Mode = "extreme";                     // bot 与玩家统一上限（extreme=256）
            Spawn(b);
            foreach (var c in b.Cells) c.Mass = BotSpawnMass;
            Bots.Add(b);
        }
    }

    /// <summary>设置 bot 数量（控制面板实时生效）：多了移除，少了补生成。</summary>
    public string SetBots(int count)
    {
        count = Math.Clamp(count, 0, 500);
        var removed = 0;
        var added = 0;
        // 移除多余的（从尾部拿,顺带清出世界;id 进 removed 段清客户端残留）
        while (Bots.Count > count)
        {
            var b = Bots[^1];
            Bots.RemoveAt(Bots.Count - 1);
            foreach (var c in b.Cells) RemovedIds.Add(c.Id);
            RemovePlayer(b);
            removed++;
        }
        // 补足缺少的
        while (Bots.Count < count)
        {
            var i = Bots.Count;
            var name = BotNames[i % BotNames.Length] + (i >= BotNames.Length ? "-" + i : "");
            var b = AddPlayer(name, isBot: true);
            b.Mode = "extreme";
            Spawn(b);
            foreach (var c in b.Cells) c.Mass = BotSpawnMass;
            Bots.Add(b);
            added++;
        }
        BotCount = count;
        return $"bots={count} (removed {removed}, added {added})";
    }

    /// <summary>
    /// 设置指定玩家/bot 的总质量（控制面板实时生效）：按现有分身数比例摊分。
    /// 按 id 或 nick（大小写不敏感,前缀匹配）定位。
    /// </summary>
    public string? SetPlayerMass(uint id, float totalMass) => SetPlayerMass(p => p.Id == id, $"id={id}", totalMass);
    public string? SetPlayerMass(string nick, float totalMass) => SetPlayerMass(
        p => p.Nick.StartsWith(nick, StringComparison.OrdinalIgnoreCase), $"nick={nick}", totalMass);

    string? SetPlayerMass(Func<Player, bool> pred, string desc, float totalMass)
    {
        totalMass = Math.Clamp(totalMass, 10f, 10_000_000f);   // 无实际上限（面板可给到千万级）
        Player? target = null;
        foreach (var p in Players.Values)
        {
            if (!pred(p)) continue;
            target = p;
            break;
        }
        if (target == null) return null;
        if (target.Cells.Count == 0)
        {
            // 未出生:改它的出生质量兜底
            target.PendingMass = totalMass;
            return $"[{target.Nick}] not spawned, pendingMass={totalMass} ({desc})";
        }
        // 按比例摊分到每个分身
        var cur = target.MassTotal;
        foreach (var c in target.Cells)
            c.Mass = c.Mass / cur * totalMass;
        // 质量超过自动分裂阈值时同步抬高阈值,避免设完立即被强制分裂打回原形
        if (totalMass > AutoSplitMass)
        {
            AutoSplitMass = totalMass * 1.2f;
            return $"set [{target.Nick}] mass {cur:F0} → {totalMass:F0}, autoSplit→{AutoSplitMass:F0} ({desc})";
        }
        return $"set [{target.Nick}] mass {cur:F0} → {totalMass:F0} ({desc})";
    }

    /// <summary>
    /// AI v5 —— 极简目的地制状态机（重写版）。
    /// 每个 bot 只有三个状态,且状态切换有冷却,行为可预测、无群体漂移:
    ///   WANDER 游走  :直线走向远方目标点,只吃顺路食物,不追孢子
    ///   HUNT   追猎  :锁定一个比自己小的玩家/bot,直线追击+分裂扑杀
    ///   FLEE   逃跑  :大威胁接近,直线反向跑,靠边内缩
    /// 决策每 20 tick(0.8s)一次,目标锁定后不轻易换向(消除群体同步漂移)。
    /// 孢子(isEjected)完全不入眼——那是玩家才关心的东西。
    /// </summary>
    public void BotThink(Player b)
    {
        b.AiTick++;
        if (b.AiTick % 20 != 1) return;   // 0.8 秒决策一次

        Cell? mine = null;
        foreach (var c in b.Cells) { mine = c; break; }
        if (mine == null) { b.BotState = "wander"; b.WanderTarget = null; return; }

        float myBiggest = 0;
        foreach (var c in b.Cells) myBiggest = MathF.Max(myBiggest, c.R);

        // ---------- 感知:只找「威胁」和「猎物玩家」,食物/孢子不进决策 ----------
        Player? threat = null; Cell? threatCell = null;
        float threatD2 = float.MaxValue;
        Player? hunt = null; Cell? huntCell = null;
        float huntD2 = float.MaxValue;

        foreach (var c in Cells.Values)
        {
            if (c.Owner == null || c.Owner == b) continue;   // 食物/孢子/病毒全跳过
            if (c.IsVirus || c.IsFood || c.IsEjected) continue;

            var other = c.Owner;
            float otherBiggest = 0;
            foreach (var x in other.Cells) otherBiggest = MathF.Max(otherBiggest, x.R);

            float dx = c.X - mine.X, dy = c.Y - mine.Y;
            float d2 = dx * dx + dy * dy;

            if (otherBiggest > myBiggest * 1.3f)
            {
                if (d2 < threatD2) { threatD2 = d2; threat = other; threatCell = c; }
            }
            else if (myBiggest > otherBiggest * 1.3f && otherBiggest > 30f)
            {
                // 只猎"值得一吃"的活体(不含食物级小球——顺路吃即可)
                if (d2 < huntD2) { huntD2 = d2; hunt = other; huntCell = c; }
            }
        }

        var tab = b.ActiveTab;

        // ---------- 状态机 ----------
        // FLEE:900 内有能吃我的 → 反向直线跑
        if (threat != null && threatCell != null && threatD2 < 900f * 900f)
        {
            b.BotState = "flee";
            b.WanderTarget = null;
            var ex = mine.X - threatCell.X;
            var ey = mine.Y - threatCell.Y;
            var len = MathF.Sqrt(ex * ex + ey * ey);
            if (len < 1) { ex = 1; ey = 0; len = 1; }
            var fleeDist = MathF.Sqrt(threatD2);
            SetMouse(b, tab,
                Math.Clamp(mine.X + ex / len * 2000, BorderMin + BorderPad, BorderMax - BorderPad),
                Math.Clamp(mine.Y + ey / len * 2000, BorderMin + BorderPad, BorderMax - BorderPad));

            // ★ 逃跑分身:威胁进入 1.2 倍分裂射程内(再不跑要被吃)→
            //   鼠标已指向反方向,分身会朝逃跑方向弹出,瞬间提速脱离。
            //   单球且质量足够分裂(分身后仍 ≥ 最小分裂质量)才分。
            var splitReach = mine.R * 2.2f * 1.2f;
            if (b.Cells.Count == 1
                && fleeDist < splitReach
                && mine.Mass >= PlayerMinSplit * PlayerMinSplit / 100f * 4)
            {
                Split(b, tab);   // 分身朝反方向弹出 = 位移加速
            }
            return;
        }

        // HUNT:1400 内有猎物 → 追击,距离够且能压过对方就分裂
        if (hunt != null && huntCell != null && huntD2 < 1400f * 1400f)
        {
            b.BotState = "hunt";
            b.WanderTarget = null;
            SetMouse(b, tab, huntCell.X, huntCell.Y);
            if (b.Cells.Count == 1)
            {
                var reach = mine.R * 2.2f;
                var dist = MathF.Sqrt(huntD2);
                var halfMass = mine.Mass / 2f;
                if (dist < reach && halfMass > huntCell.Mass * 1.3f && mine.Mass >= PlayerMinSplit * PlayerMinSplit / 100f * 2)
                    Split(b, tab);
            }
            return;
        }

        // WANDER:朝目标点直线走;顺路吃食物由"目标点选在食物密集方向"实现(不是实时追单颗)
        b.BotState = "wander";
        var wt = b.WanderTarget;
        if (wt == null ||
            (mine.X - wt.Value.X) * (mine.X - wt.Value.X) + (mine.Y - wt.Value.Y) * (mine.Y - wt.Value.Y) < 400 * 400)
        {
            wt = PickWanderTarget(mine);
            b.WanderTarget = wt;
        }
        SetMouse(b, tab, wt.Value.X, wt.Value.Y);
    }

    /// <summary>选游走目标:偏向食物密度高的方向（把地图划成 6×6 格,抽样统计,选格子中心+抖动）。</summary>
    (float X, float Y) PickWanderTarget(Cell mine)
    {
        const int Grid = 6;
        var cell = BorderMax / Grid;
        var counts = new int[Grid * Grid];
        // 抽样 400 个食物估密度(全量扫太贵)
        var scanned = 0;
        foreach (var c in Cells.Values)
        {
            if (!c.IsFood) continue;
            var gx = Math.Min(Grid - 1, (int)(c.X / cell));
            var gy = Math.Min(Grid - 1, (int)(c.Y / cell));
            counts[gy * Grid + gx]++;
            if (++scanned >= 400) break;
        }
        // 距离加权:太远的格子打折（选最近的高密区）
        int best = -1; float bestScore = float.MinValue;
        for (int i = 0; i < counts.Length; i++)
        {
            var gx = i % Grid; var gy = i / Grid;
            var cx = gx * cell + cell / 2;
            var cy = gy * cell + cell / 2;
            var dist = MathF.Sqrt((cx - mine.X) * (cx - mine.X) + (cy - mine.Y) * (cy - mine.Y));
            var score = counts[i] * 10f - dist * 0.5f + (float)_rng.NextDouble() * 30f;   // 抖动避免全员同目标
            if (score > bestScore) { bestScore = score; best = i; }
        }
        if (best < 0) best = Grid * Grid / 2;
        var gx2 = best % Grid; var gy2 = best / Grid;
        return (
            gx2 * cell + cell * (0.3f + 0.4f * (float)_rng.NextDouble()),
            gy2 * cell + cell * (0.3f + 0.4f * (float)_rng.NextDouble()));
    }

    /// <summary>机器人死亡后自动重生（恢复初始质量）。</summary>
    public void MaintainBots()
    {
        foreach (var b in Bots)
        {
            if (b.Cells.Count == 0)
            {
                Spawn(b);   // SpawnTab 内部优先使用 PendingMass（面板自定义质量）
                if (b.Cells.Count > 0 && b.PendingMass == null)
                    foreach (var c in b.Cells) c.Mass = BotSpawnMass;
            }
        }
    }

    /// <summary>设置全场刺球数（控制面板实时生效）：多余的立即移除，不足的立即补。</summary>
    public string SetViruses(int count)
    {
        count = Math.Clamp(count, 0, 200);
        int current = 0;
        foreach (var c in Cells.Values) if (c.IsVirus) current++;
        var removed = 0;
        var added = 0;
        if (current > count)
        {
            RemoveExcessViruses(current - count);
            removed = current - count;
        }
        else if (current < count)
        {
            SpawnViruses(count - current);
            added = count - current;
        }
        VirusTarget = count;
        return $"viruses={count} (removed {removed}, added {added})";
    }

    /// <summary>移除 n 个刺球（SetViruses 专用）。</summary>
    void RemoveExcessViruses(int n)
    {
        foreach (var c in Cells.Values.ToList())
        {
            if (n <= 0) break;
            if (!c.IsVirus) continue;
            Cells.Remove(c.Id);
            n--;
        }
    }

    /// <summary>
    /// 杀死指定玩家/bot（控制面板）：清空其全部细胞（进入死亡→重生/旁观流程）。
    /// 按 id 或 nick（大小写不敏感,前缀匹配）定位。返回描述；null=没找到。
    /// </summary>
    public string? KillPlayer(uint id) => KillPlayer(p => p.Id == id, $"id={id}");
    public string? KillPlayer(string nick) => KillPlayer(
        p => p.Nick.StartsWith(nick, StringComparison.OrdinalIgnoreCase), $"nick={nick}");

    string? KillPlayer(Func<Player, bool> pred, string desc)
    {
        Player? target = null;
        foreach (var p in Players.Values)
        {
            if (!pred(p)) continue;
            target = p;   // 取第一个匹配
            break;
        }
        if (target == null) return null;
        var kind = target.IsBot ? "bot" : "player";
        var nick = target.Nick;
        var mass = (int)target.MassTotal;
        var cellCount = target.Cells.Count;
        foreach (var c in target.Cells.ToList())
        {
            Cells.Remove(c.Id);
            RemovedIds.Add(c.Id);   // 50 号 removed 段:客户端同步清掉场上残球
            target.Cells.Remove(c);
        }
        return $"killed {kind} [{nick}] id={target.Id} mass={mass} cells={cellCount} ({desc})";
    }

    /// <summary>列出全部在线玩家/bot（控制面板列表用）。</summary>
    public List<object> ListPlayers()
    {
        var list = new List<object>();
        foreach (var p in Players.Values)
        {
            if (p.Cells.Count == 0 && !p.IsBot) continue;   // 空真人（断线残留）跳过
            list.Add(new
            {
                id = p.Id,
                nick = p.Nick,
                isBot = p.IsBot,
                mass = (int)p.MassTotal,
                cells = p.Cells.Count,
                alive = p.Cells.Count > 0,
            });
        }
        return list;
    }
}

/// <summary>全局世界锁：连接层投递输入时与主循环互斥（旧 WorldLockExt 语义，并入此类避免散文件）。</summary>
public static class WorldLock
{
    static readonly object _gate = new();
    public static void Lock() => Monitor.Enter(_gate);
    public static void Unlock() => Monitor.Exit(_gate);
}
