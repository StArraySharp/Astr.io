namespace AstrIO.Server.Game;

/// <summary>bot AI 难度档位（对应 Nebulous.io DifficultyEnum:Easy/Medium/Hard/Impossible）。</summary>
public enum BotDifficulty { Easy = 0, Medium = 1, Hard = 2, Impossible = 3 }

/// <summary>
/// 难度参数表——逐项对齐 Nebulous Bot.initBot() 四核心参数（逆向文档 BotAI.md §1）：
///   StateCooldown 状态切换最快反应 / FleeDuration 攻击·逃跑持续(20tps) /
///   DeathGrace 死亡呆滞(重生后 AttackDelay,归零前不分裂杀) / SplitCooldown 分裂冷却(Impossible=0 → 连发) /
///   ScanRadius 感知半径(原版 38/2.35/0.78 边距查询的等效展开)。
/// </summary>
public sealed record BotParams(
    int StateCooldown, int FleeDuration, int DeathGrace, int SplitCooldown, float ScanRadius,
    bool UseSub, float FarmStartMass, int FarmTicks, int SubCooldownTicks, bool Hive)
{
    // UseSub=multibox 自我发育;FarmStartMass 开发育质量;FarmTicks 发育时长(t);
    // SubCooldownTicks 下一轮子球冷却;Hive=全图共享真人位置全员合围（只有 Impossible）。
    public static BotParams For(BotDifficulty d) => d switch
    {
        BotDifficulty.Easy       => new(20,  80, 100, 20,  800f, false,     0f,   0,   0, false),
        BotDifficulty.Medium     => new(13, 100,  20, 10,  950f, true,  1200f, 500, 300, false),
        BotDifficulty.Hard       => new(6,  120,   6,  5, 1100f, true,   700f, 400, 120, false),
        BotDifficulty.Impossible => new(6,  300,   6,  0, 1250f, true,   300f, 320,  15, true),
        _                        => new(13, 100,  20, 10,  950f, true,  1200f, 500, 300, false),
    };
}

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
    /// <summary>吐出的孢子质量（原版 38,可调;调高 = 孢子回收损耗小）。</summary>
    public static float EjectSize { get; set; } = 38f;
    /// <summary>吐球扣除的质量（原版 43,可调;调低 = 吐球损耗小）。</summary>
    public static float EjectSizeLoss { get; set; } = 38f;
    /// <summary>玩家质量衰减倍率（1 = 官方原版速率,0 = 不衰减;config.json decayScale）。</summary>
    public static float DecayScale { get; set; } = 0.3f;
    /// <summary>吐球射程/速度（原版 780,当前默认 1400 加速;config.json ejectDistance 可调）。</summary>
    public static float EjectDistance { get; set; } = 1400f;
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
    /// <summary>达到 AutoSplitMass 时单球自动分裂开关（config.json 持久化）。</summary>
    public static bool AutoSplitEnabled { get; set; } = true;
    /// <summary>分身跑开关：Nebulous GameMode.L 自动连分机制移植（bot 连分冲刺）。</summary>
    public static bool AutoSplitRunEnabled { get; set; } = true;
    /// <summary>multibox 切组允许生成子球开关（config.json 持久化;关 = 空组不补球）。</summary>
    public static bool SubSpawnEnabled { get; set; } = true;
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

    // ---- 可实时调整的参数（Web 控制面板写入;SaveConfig/LoadConfig 持久化到 config.json）----
    /// <summary>bot 数量上限（SetBots 实时增减）。</summary>
    public int BotCount { get; set; } = 100;
    /// <summary>房间总席位（真人+bot）。真人加入时若满员 → 踢一个 bot 腾位；
    /// 真人离开后若席位有余 → 自动补回 bot，维持总人数。</summary>
    public const int MaxSlots = 50;
    /// <summary>因满员被踢掉的 bot 数（离开回补用）。</summary>
    private int _botsKickedForRoom;
    /// <summary>全场刺球数（SetViruses 实时增减）。</summary>
    public int VirusTarget { get; set; } = 3;
    /// <summary>bot AI 难度（SetBotDifficulty 实时切换,config.json 持久化）。默认 Impossible——最变态档。</summary>
    public BotDifficulty BotDifficulty { get; set; } = BotDifficulty.Impossible;

    /// <summary>配置文件路径（默认当前目录 config.json;启动时由 Program 注入 ContentRoot）。</summary>
    public string ConfigPath { get; set; } = "config.json";

    /// <summary>
    /// 控制面板密码的 SHA256 十六进制（小写，64 位）。
    /// **明文不落盘**；空值或非十六进制 = 尚未设置 → 首次访问面板时要求用户设置密码。
    /// </summary>
    public string PanelPasswordHash { get; set; } = "";

    /// <summary>保存当前可调参数到 config.json。</summary>
    public void SaveConfig()
    {
        var json = System.Text.Json.JsonSerializer.Serialize(new
        {
            spawnMass = SpawnMass,
            bots = BotCount,
            viruses = VirusTarget,
            autoSplitMass = AutoSplitMass,
            botDifficulty = BotDifficulty.ToString().ToLowerInvariant(),
            decayScale = DecayScale,
            ejectSize = EjectSize,
            ejectSizeLoss = EjectSizeLoss,
            ejectDistance = EjectDistance,
            autoSplitEnabled = AutoSplitEnabled,
            subSpawnEnabled = SubSpawnEnabled,
            panelPasswordHash = PanelPasswordHash,
        }, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(ConfigPath, json);
    }

    /// <summary>启动时从 config.json 读取配置（不存在则用默认值并写出默认文件）。</summary>
    public void LoadConfig()
    {
        if (!File.Exists(ConfigPath))
        {
            SaveConfig();   // 首次运行写出默认配置
            return;
        }
        try
        {
            var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(ConfigPath));
            var root = doc.RootElement;
            if (root.TryGetProperty("spawnMass", out var sm)) SpawnMass = Math.Clamp(sm.GetSingle(), 10f, 50000f);
            if (root.TryGetProperty("bots", out var bt)) BotCount = Math.Clamp(bt.GetInt32(), 0, 500);
            if (root.TryGetProperty("viruses", out var vr)) VirusTarget = Math.Clamp(vr.GetInt32(), 0, 200);
            if (root.TryGetProperty("autoSplitMass", out var asp)) AutoSplitMass = MathF.Max(asp.GetSingle(), 100f);
            if (root.TryGetProperty("botDifficulty", out var bd) && Enum.TryParse<BotDifficulty>(bd.GetString(), true, out var parsed))
                BotDifficulty = parsed;
            if (root.TryGetProperty("decayScale", out var ds)) DecayScale = Math.Clamp(ds.GetSingle(), 0f, 5f);
            if (root.TryGetProperty("ejectSize", out var es)) EjectSize = Math.Clamp(es.GetSingle(), 10f, 100f);
            if (root.TryGetProperty("ejectSizeLoss", out var esl)) EjectSizeLoss = Math.Clamp(esl.GetSingle(), 10f, 100f);
            if (root.TryGetProperty("ejectDistance", out var ed)) EjectDistance = Math.Clamp(ed.GetSingle(), 200f, 5000f);
            if (root.TryGetProperty("autoSplitEnabled", out var ase)) AutoSplitEnabled = ase.GetBoolean();
            if (root.TryGetProperty("subSpawnEnabled", out var sse)) SubSpawnEnabled = sse.GetBoolean();
            // 面板密码哈希（空 / 非十六进制 = 未设置 → 首次访问面板时要求设置密码）
            if (root.TryGetProperty("panelPasswordHash", out var pph)) PanelPasswordHash = pph.GetString() ?? "";
        }
        catch
        {
            // 配置损坏时回退默认并重写
            SaveConfig();
        }
    }

    uint _nextCellId = 1, _nextPlayerId = 1000;
    readonly Random _rng = new();
    public readonly List<Player> Bots = new();
    // ---- SIEGE 巨人共享感知（全场 bot 情报网,每 tick 重算一次）----
    Player? GiantCache;          // 被围剿的巨人（非 bot,显著大于最强 bot）
    int GiantTick = -1;
    float GiantMassCache, GiantMaxRCache;

    /// <summary>巨人判定：非 bot 总质量 > 3000 且 > 1.8×最强 bot → 全场围剿目标。</summary>
    void RecomputeGiant()
    {
        GiantTick = Tick; GiantCache = null;
        float botBest = 0;
        Player? bestReal = null;
        foreach (var p in Players.Values.ToList())
        {
            if (p.Cells.Count == 0) continue;
            if (p.IsBot) { if (p.MassTotal > botBest) botBest = p.MassTotal; }
            else if (bestReal == null || p.MassTotal > bestReal.MassTotal) bestReal = p;
        }
        if (bestReal != null && bestReal.MassTotal > 3000f && bestReal.MassTotal > botBest * 1.8f)
        {
            GiantCache = bestReal;
            GiantMassCache = bestReal.MassTotal;
            float mr = 0;
            foreach (var c in bestReal.Cells) mr = MathF.Max(mr, c.R);
            GiantMaxRCache = mr;
        }
    }

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
        // ★ 自持锁：ws 线程随时可能加人（Session ctor），而 GameLoop 正在遍历 Players/Cells。
        //   WorldLock 是可重入 Monitor，在已持锁的路径里再锁一次无副作用。
        WorldLock.Lock();
        try
        {
            // ★ 真人加入且房间满员（真人+bot ≥ MaxSlots）→ 踢一个 bot 腾位。
            //   取 Bots 尾部（最早生成的那批往往质量分布更均匀,取尾保住老玩家印象中的熟面孔）。
            if (!isBot)
            {
                var realCount = Players.Values.Count(p => !p.IsBot);
                if (realCount + Bots.Count >= MaxSlots && Bots.Count > 0)
                {
                    var victim = Bots[^1];
                    Bots.RemoveAt(Bots.Count - 1);
                    RemovePlayer(victim);
                    _botsKickedForRoom++;
                }
            }
            var p = new Player(_nextPlayerId++, nick, isBot);
            Players[p.Id] = p;
            return p;
        }
        finally { WorldLock.Unlock(); }
    }

    public void RemovePlayer(Player p)
    {
        WorldLock.Lock();
        try
        {
            // id 进 removed 段:客户端同步清掉残球(断线/移除都走这里)
            foreach (var c in p.Cells.ToList()) RemovedIds.Add(c.Id);
            foreach (var c in p.Cells.ToList()) Cells.Remove(c.Id);
            p.Cells.Clear();
            Players.Remove(p.Id);
            Bots.Remove(p);

            // ★ 真人离开 → 若席位有余且有因满员被踢的 bot → 补回一个,维持总人数。
            //   不在 AddPlayer 里做：避免真人顶替真人时误补。
            if (!p.IsBot && _botsKickedForRoom > 0)
            {
                var realCount = Players.Values.Count(x => !x.IsBot);
                if (realCount + Bots.Count < MaxSlots)
                {
                    _botsKickedForRoom--;
                    var i = Bots.Count;
                    var b = AddPlayer(BotNames[i % BotNames.Length] + (i >= BotNames.Length ? "-" + i : ""), isBot: true);
                    b.Mode = "extreme";
                    b.Difficulty = BotDifficulty;
                    Spawn(b);
                    foreach (var c in b.Cells) c.Mass = BotSpawnMass;
                    Bots.Add(b);
                }
            }
        }
        finally { WorldLock.Unlock(); }
    }

    public void Spawn(Player p)
    {
        WorldLock.Lock();
        try
        {
            if (p.Cells.Count == 0) SpawnTab(p, p.ActiveTab);
        }
        finally { WorldLock.Unlock(); }
    }

    public Cell? SpawnTab(Player p, byte tab)
    {
        WorldLock.Lock();
        try
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
        finally { WorldLock.Unlock(); }
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
        if (SubSpawnEnabled && p.CellsOf(tab).Count == 0)
            SpawnSubNear(p, cur, tab);
    }

    /// <summary>子球安全生成：母球附近前进方向优先，避开其他玩家大球与边界；出生带 2s 保护。</summary>
    public Cell? SpawnSubNear(Player p, byte srcTab, byte dstTab)
    {
        if (!SubSpawnEnabled) return null;
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

    /// <summary>S 键停移/恢复（客户端此时会把鼠标点投射到地图边缘，服务器正常追即可）。</summary>
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
        float dx, dy;
        if (p.Frozen && (p.LineDir.X != 0f || p.LineDir.Y != 0f))
        {
            // 停移:用整组统一方向(见 Step 开头) —— 保证每一轮新球都沿同一条线飞出
            dx = p.LineDir.X; dy = p.LineDir.Y;
        }
        else
        {
            var m = p.Mouse[c.Tab - 1];
            dx = m.X - c.X; dy = m.Y - c.Y;
            // 鼠标与球重合时用随机方向（原来固定 dx=1,dy=0 → 所有兜底分身全部向右飞）
            if (dx * dx + dy * dy < 1)
            {
                var a = (float)(_rng.NextDouble() * Math.PI * 2);
                dx = MathF.Sin(a); dy = MathF.Cos(a);
            }
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

    /// <summary>
    /// 自动分裂（一次性算轮次）：球质量超过阈值时，按 2^n 对半分到低于阈值为止。
    /// 例：80000/20000 → 分 2 轮（→2×40000→4×20000）；受分身上限约束，剩余质量下轮再试。
    /// 每轮母球与分身各得一半，分身沿鼠标方向弹出。
    /// </summary>
    void AutoSplitCell(Player p, Cell c)
    {
        var cap = PieceCap(p);
        // 轮次数 = log2(mass / threshold) 向上取整,即分到每片 < 阈值所需的最少对半次数
        var rounds = (int)MathF.Ceiling(MathF.Log2(c.Mass / AutoSplitMass));
        if (rounds < 1) return;
        // 当前波前（这一轮要参与对半的所有球）,从母球开始
        var wave = new List<Cell> { c };
        for (int r = 0; r < rounds; r++)
        {
            var next = new List<Cell>();
            foreach (var cell in wave)
            {
                if (p.CellsOf(cell.Tab).Count >= cap) return;   // 分身上限已满,剩余留到下秒
                float dx, dy;
                if (p.Frozen && (p.LineDir.X != 0f || p.LineDir.Y != 0f))
                {
                    dx = p.LineDir.X; dy = p.LineDir.Y;
                }
                else
                {
                    var m = p.Mouse[cell.Tab - 1];
                    dx = m.X - cell.X; dy = m.Y - cell.Y;
                    if (dx * dx + dy * dy < 1)
                    {
                        var a = (float)(_rng.NextDouble() * Math.PI * 2);
                        dx = MathF.Sin(a); dy = MathF.Cos(a);
                    }
                }
                var angle = MathF.Atan2(dx, dy);
                var half = cell.Mass / 2f;
                cell.Mass = half;
                var n = new Cell
                {
                    Id = _nextCellId++,
                    X = cell.X + 40 * MathF.Sin(angle), Y = cell.Y + 40 * MathF.Cos(angle),
                    Owner = p, Tab = cell.Tab,
                    Color = cell.Color, Nick = cell.Nick,
                    BirthTick = Tick,
                };
                n.Mass = half;
                n.SetBoost(870 * (0.4f + 0.2f * r), angle);   // 轮次越深弹得越近,逐步散开
                p.Cells.Add(n);
                Cells[n.Id] = n;
                next.Add(cell);
                next.Add(n);
            }
            wave = next;
        }
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
    /// <summary>世界推进一帧。**自持锁** —— 调用方（GameLoop / 单测）漏锁也不会出现并发改集合。</summary>
    public void Step()
    {
        WorldLock.Lock();
        try { StepCore(); }
        finally { WorldLock.Unlock(); }
    }

    void StepCore()
    {
        Tick++;
        EatenEvents.Clear();
        // ★ RemovedIds 不在这里清空:击杀(HTTP)发生在两次 tick 之间,
        //   若在此清空会把"上一帧间隙收到的击杀记录"在广播前抹掉,
        //   导致 removed 段恒空 → 客户端留下无碰撞假球。清空点在广播完成后(GameLoop)。

        // -) 停移玩家先算"整组统一方向"(质量中心 → 鼠标):后面分裂/排斥都用它。
        //    若让每个球各自算方向,链越长两端方向差越大 → 分身会随时间逐渐离开直线。
        //    ★ 快照遍历：ws 线程（玩家连接/输入）会同时改 Players/Cells 字典，
        //      即使漏锁也不能让整个 tick 崩掉（回归：tick 3722 的 Collection was modified）
        foreach (var p in Players.Values.ToList())
        {
            if (!p.Frozen) continue;
            var cs = p.CellsOf(p.ActiveTab);
            if (cs.Count == 0) continue;
            float ccx = 0, ccy = 0;
            foreach (var c in cs) { ccx += c.X; ccy += c.Y; }
            ccx /= cs.Count; ccy /= cs.Count;
            var mm = p.Mouse[p.ActiveTab - 1];
            var vx = mm.X - ccx; var vy = mm.Y - ccy;
            var vl = MathF.Sqrt(vx * vx + vy * vy);
            if (vl >= 1f) p.LineDir = (vx / vl, vy / vl);
        }

        // 0) 消化待办分裂（每 tick 只做 1 轮）——
        //    客户端一个 50 号包可带多轮(×2/×16/×64);若一次性全做完,这一 tick 内球没位移,
        //    每轮新球都落在母球前方 40 的同一点 → 叠成一团。
        //    逐 tick 消化:每轮之间球会被 boost 推开一段,出生点逐轮错开 → 排成一条链。
        foreach (var p in Players.Values.ToList())
        {
            if (p.PendingSplits <= 0) continue;
            p.PendingSplits--;
            Split(p, p.PendingSplitTab);
        }

        // 1) 移动：朝各自 tab 鼠标，32 单位内线性减速；boost 消耗；边界内缩防瞬移；
        //    停移(S 键)：位置完全固定(不追鼠标),但 boost 照常消耗 ——
        //    停移中分裂出的球沿冻结方向弹出,再由第 4 步的同组排斥彼此顶开,排成一条链
        foreach (var c in Cells.Values.ToList())
        {
            if (c.Owner != null && c.Owner.Frozen)
            {
                // 停移：位置固定；boost 照常消耗（分裂出的新球继续沿方向飞出去）
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

        // 4) 同 tab 细胞：碰撞排斥 + 合并
        //    ★ 停移玩家**也要**做排斥:否则停移分裂出的分身会永远堆在同一个点上。
        //      "分身先叠在一起、等出生保护过后彼此顶开成一条链、头部被后面顶出线外"全靠它。
        //    ★ 用快照遍历：跨线程新玩家加入（Session ctor）即使漏锁也不会把整个 tick 弄崩
        foreach (var p in Players.Values.ToList())
        {
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
                        else if (distSq < minDist * minDist)
                        {
                            // Ogar resolveRigidCollision：按面积平方加权冲量推开
                            // ★ 推开方向：停移时统一取"本组鼠标方向"(= 冻结方向投射到地图边缘的点)，
                            //   这样所有分身都沿同一条轴分离 → 排成一条链。
                            //   实测：若用球心连线，球心接近时方向近于随机，分会散成一团而不是链。
                            float dist = distSq < 1e-4f ? 0f : MathF.Sqrt(distSq);
                            float nx, ny;
                            if (p.Frozen && (p.LineDir.X != 0f || p.LineDir.Y != 0f))
                            {
                                // 停移:统一沿"整组方向"分离 → 排成一条线且长期不跑偏
                                nx = p.LineDir.X; ny = p.LineDir.Y;
                            }
                            else if (distSq < 1f)
                            {
                                var ang = (float)(_rng.NextDouble() * Math.PI * 2);
                                nx = MathF.Sin(ang); ny = MathF.Cos(ang);
                            }
                            else
                            {
                                nx = dx / dist; ny = dy / dist;
                            }
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
        foreach (var p in Players.Values.ToList())
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
                    // 扎刺护体：先分出半球分身，由分身爆刺，主体保住一半质量（始终开启）
                    var shield = SplitShieldPiece(p, c, v);
                    if (shield != null) { ExplodeByVirus(p, shield); break; }
                    ExplodeByVirus(p, c);
                    break;
                }
            }
        }

        // 6) 食物/病毒补充（计数与生成分离:SpawnFood/SpawnViruses 写 Cells,不可在枚举中调用）
        if (Tick % FoodSpawnInterval == 0)
        {
            int food = 0, virus = 0;
            foreach (var c in Cells.Values.ToList())
            {
                if (c.IsFood) food++;
                else if (c.IsVirus) virus++;
            }
            if (food < FoodTarget) SpawnFood(Math.Min(FoodSpawnPerTick, FoodTarget - food));
            if (virus < VirusTarget) SpawnViruses(Math.Min(2, VirusTarget - virus));
            else if (virus > VirusTarget) RemoveExcessViruses(virus - VirusTarget);
        }

        // 7) 质量衰减：每秒一次，固定值制（官方实测 -100/s @20k，非百分比）；
        //    单球 mass≥20000 → AutoSplitCell 一次性按 log2(mass/threshold) 对半分到位（玩家与 bot 一致）
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
                if (AutoSplitEnabled && c.Mass >= AutoSplitMass)
                    AutoSplitCell(c.Owner, c);
            }
        }

        // 8) multibox 自动切回：活跃组被吃光 → 切回存活组 + 鼠标继承（视角不跳变）
        foreach (var p in Players.Values.ToList())
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
        foreach (var c in Cells.Values.ToList()) c.Age = Tick - c.BirthTick;
    }

    /// <summary>扫掠吞嘤断片：dir=-1 向左（索引递减），dir=+1 向右（索引递增）。</summary>
    /// <summary>
    /// Nebulous 官方"黑洞喂食倍率"（GameSimulation ~9322）：
    ///   f10 = (hole.type == 1) ? 75 : 375;  if (player3 instanceof Bot) f10 *= 系数;
    /// —— **只有 bot 吃才乘，真人没有**。astrio 没有黑洞，所以等价移植为
    /// **bot 吃食物时的质量加成**（等于让 AI 滚雪球更快）。
    /// Easy ×1.1333 / Medium ×1.0 / Hard ×2.0 / Impossible ×2.6667。
    /// </summary>
    public static float HoleBotMultiplier(BotDifficulty d) => d switch
    {
        BotDifficulty.Medium     => 1.0f,
        BotDifficulty.Hard       => 2.0f,
        BotDifficulty.Impossible => 2.6666667f,
        _                        => 1.1333333f,   // Easy
    };

    /// <summary>Nebulous Bot.randomFeed() 的固定质量表（含 668 那个官方彩蛋值）。</summary>
    static readonly int[] RandomFeedTable =
        { 1, 2, 3, 4, 6, 6, 7, 8, 10, 11, 13, 16, 17, 20, 21, 27, 30, 31, 33, 35, 37, 42, 44, 46, 59, 66, 67, 668, 77, 82 };

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
            // 官方"黑洞喂食倍率":只有 bot 吃才乘(真人没有) → astrio 等价为 bot 吃食物加成
            var gain = b.Mass;
            if (b.IsFood && a.Owner is { IsBot: true } botOwner)
                gain *= HoleBotMultiplier(botOwner.Difficulty);
            a.Mass += gain;
            Cells.Remove(b.Id);
            b.Owner?.Cells.Remove(b);
            EatenEvents.Add((b, a));
        }
    }

    /// <summary>官方固定值衰减分档（实测：-100/s @20k，~4/s @1.7k），乘 DecayScale 全局倍率。</summary>
    public static float DecayPerSec(float mass)
    {
        float baseDecay;
        if (mass > 10000) baseDecay = 100f;
        else if (mass > 5000) baseDecay = 50f;
        else if (mass > 2000) baseDecay = 20f;
        else if (mass > 1000) baseDecay = 8f;
        else baseDecay = 2f;
        return baseDecay * DecayScale;
    }

    /// <summary>
    /// 扎刺护体分身：主球质量一劈为二，新分身朝病毒方向弹出并作为爆刺载体。
    /// 返回分身；主球质量太小（分不出合法半球）时返回 null。
    /// </summary>
    Cell? SplitShieldPiece(Player p, Cell c, Cell virus)
    {
        var half = c.Mass / 2f;
        var minMass = PlayerMinSplit * PlayerMinSplit / 100f;
        if (half < minMass) return null;   // 半球低于最小分裂质量，不值得护体
        c.Mass = half;
        var angle = MathF.Atan2(virus.X - c.X, virus.Y - c.Y);   // 朝病毒方向弹出
        var piece = new Cell
        {
            Id = _nextCellId++, X = c.X, Y = c.Y,
            Owner = p, Tab = c.Tab,
            Color = c.Color, Nick = c.Nick,
            BirthTick = Tick,
        };
        piece.Mass = half;
        piece.NoMergeUntil = Tick + RemergeTicks(half);
        piece.SetBoost(780 * 0.35f, angle);
        p.Cells.Add(piece);
        Cells[piece.Id] = piece;
        return piece;
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
            b.Difficulty = BotDifficulty;           // 出生即挂当前难度（Nebulous initBot）
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
        // 移除多余的（从尾部拿,顺带清出世界;RemovePlayer 内部写 RemovedIds 清客户端残留）
        while (Bots.Count > count)
        {
            var b = Bots[^1];
            Bots.RemoveAt(Bots.Count - 1);
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
            b.Difficulty = BotDifficulty;
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
        // 不再抬高 AutoSplitMass:自动分裂已是一次性算轮次(80k/20k → 一次分 4 片),
        // 设大质量后按当前阈值立即分裂即是预期行为
        return $"set [{target.Nick}] mass {cur:F0} → {totalMass:F0} ({desc})";
    }

    /// <summary>
    /// AI v7 —— Nebulous 难度状态机 + multibox 自我发育 + HIVE 全图合围。
    ///   0 WANDER   游走/发育:安全且够肥 → tab2 开子球吃独食（FarmUntilTick 时限）;
    ///              Impossible 无脑奔向 HIVE 目标（全场最肥真人）
    ///   1 ATTACK   追击:双组（tab1+tab2）协同 split-kill,各自判斩杀窗口,Impossible 冷却≈0 连发
    ///   2 FLEE     逃跑:两组同向反跑 + 墙角规避 + 弹射脱离
    ///   3 MERGE-UP 收缩:主组多片且质量占优 → 挤合并,子球照常觅食
    /// 发育经济:子球独立鼠标找最近食物,遭遇威胁独立逃命;被吃 → 冷却后重开。
    /// Impossible = 600 质量就开发育/发育 320t/冷却 40t/被吃秒重开 —— 滚雪球机器。
    /// </summary>
    /// <summary>单个 bot 的决策（自持锁）。</summary>
    public void BotThink(Player b)
    {
        WorldLock.Lock();
        try { BotThinkCore(b); }
        finally { WorldLock.Unlock(); }
    }

    void BotThinkCore(Player b)
    {
        var bp = BotParams.For(b.Difficulty);
        int diff = (int)b.Difficulty;

        // ---- 计时器递减（每 tick）----
        if (b.StateSwitchCooldown > 0) b.StateSwitchCooldown--;
        if (b.AttackDelay > 0) b.AttackDelay--;
        if (b.SplitCooldown > 0) b.SplitCooldown--;
        if (b.SubCooldown > 0) b.SubCooldown--;
        if (b.BurstCd > 0) b.BurstCd--;
        if (b.ArtilleryCd > 0) b.ArtilleryCd--;
        if (b.FeedCd > 0) b.FeedCd--;

        if (b.Cells.Count == 0) { b.AiState = 0; b.StateTicks = 0; b.WanderTarget = null; b.FarmUntilTick = -1; return; }

        // ---- 分组统计:主组(tab1)/子组(tab2) ----
        float cx = 0, cy = 0, myR = 0, m1 = 0;
        int n1 = 0, n2 = 0;
        Cell? me = null;
        foreach (var c in b.Cells)
        {
            cx += c.X; cy += c.Y;
            if (c.Tab == 2) { n2++; continue; }
            m1 += c.Mass; n1++;
            if (me == null || c.R > myR) { myR = c.R; me = c; }
        }
        if (me == null)
        {
            // 主组被吃只剩子组:子球照常觅食避难,同时立刻把主组重生回 tab1
            //（旧版只跑经济 → Split(b,1) 全打空,bot 变成永不分裂的废物）
            BotEconomy(b, bp);
            if (b.CellsOf(1).Count == 0 && b.CellsOf(2).Count > 0)
            {
                b.ActiveTab = 1;
                var nc = SpawnTab(b, 1);
                if (nc != null && b.PendingMass == null) nc.Mass = BotSpawnMass;
                b.PendingMass = null;
            }
            b.StateTicks++;
            return;
        }
        cx /= b.Cells.Count; cy /= b.Cells.Count;
        var main = me;
        var subs = b.CellsOf(2);

        // ---- 最肥真人（每 tick 实时算:HIVE 合围目标 + 火炮睞准点）----
        (float X, float Y)? fatPos = null;
        float fatMass = 0f;                 // 最肥真人质量（HIVE 合围的质量门槛用）
        {
            Player? fattest = null;
            foreach (var p in Players.Values)
            {
                if (p.IsBot || p.Cells.Count == 0) continue;
                if (fattest == null || p.MassTotal > fattest.MassTotal) fattest = p;
            }
            if (fattest != null)
            {
                float fx = 0, fy = 0;
                foreach (var c in fattest.Cells) { fx += c.X; fy += c.Y; }
                fatPos = (fx / fattest.Cells.Count, fy / fattest.Cells.Count);
                fatMass = fattest.MassTotal;
            }
        }
        var hivePos = fatPos;

        // ---- SIEGE 情报网:真人巨人出现 → 全场共享目标 ----
        bool siege = false;
        (float X, float Y) gPos = default;
        if (bp.Hive)
        {
            if (Tick != GiantTick) RecomputeGiant();
            var g = GiantCache;
            if (g != null && g.Cells.Count > 0)
            {
                float gx = 0, gy = 0;
                foreach (var c in g.Cells) { gx += c.X; gy += c.Y; }
                gPos = (gx / g.Cells.Count, gy / g.Cells.Count);
                siege = true;
            }
        }

        // ---- 感知节流 ----
        if (Tick >= b.NextScanTick)
        {
            // ★ 巨人（碾压级真人）的威慑圈必须单独放大：普通 ScanRadius(1250) 根本看不到
            //   半径 90+ 的大玩家，AI 直接一头撞进它嘴里 —— “看不见的杀手”。
            var scanR = bp.ScanRadius;
            if (siege) scanR = MathF.Max(scanR, GiantMaxRCache * 6f + 1600f);
            // 猎物扫描放大到 1800（原版是 e0.i(blob,-198f) 的 198 边距，很小）——
            // 放开是为了不让 20 个 bot 在大图里永不见面，但绝不能像之前 4200 那样
            // 让 bot 横跨半张地图去追远处的对手
            var preyR = MathF.Max(scanR, 1800f);
            ScanSensors(b, main, myR, scanR, preyR);
            b.NextScanTick = Tick + (diff >= 2 ? 3 : diff == 1 ? 6 : 12);
        }
        var threat = ById(b.ThreatId);
        if (threat == null) b.ThreatD2 = float.MaxValue;
        var prey = ById(b.HuntId);
        if (prey == null || prey.Owner == null) b.HuntD2 = float.MaxValue;

        // ---- 子球经济（独立觅食/逃命,节流 6t）----
        BotEconomy(b, bp);
        bool subAlive = n2 > 0;

        // ---- 发育触发:安全+够肥+冷却好+子组空 → tab2 开子球吃独食 ----
        // 两个历史坑：
        //  ① 安全圈用中心距:大球中心远、边缘已贴脸 → 改用边缘间距
        //  ② 非要求 AiState∈{0,3}:20 个 bot 互相猎杀时几乎永远在 1/2 状态
        //    → 发育永远不触发，只能靠啃食物慢慢涨。现在只要“近身无威胁 + 主球够肥”就开。
        var safeGap = 240f + myR * 1.6f;
        bool noNearThreat = threat == null
            || MathF.Sqrt(b.ThreatD2) - threat.R - myR > safeGap;
        // ③ 主球必须明显大于子球出生质量：老版 FarmStart=300 但子球固定 500，
        //    刚开出来子球比主球还大 → 反手把主球吃掉
        var farmMinMass = MathF.Max(bp.FarmStartMass, SubSpawnMass * 1.6f);
        if (bp.UseSub && !subAlive && b.SubCooldown <= 0
            && b.MassTotal >= farmMinMass && noNearThreat)
        {
            // bot 专用:直接调 SpawnSubNear（MultiboxSwitch 有 tab==cur 早退,
            // 且 bot 死亡重生若 ActiveTab=2 会卡死这条路径）
            SpawnSubNear(b, 1, 2);
            b.ActiveTab = 1;
            b.FarmUntilTick = Tick + bp.FarmTicks;
            b.SubWander = null;
            b.NextEconTick = 0;
            subAlive = true;
        }
        bool farming = b.FarmUntilTick > Tick && subAlive;
        if (!subAlive && b.FarmUntilTick > 0)
        {
            // 子球被吃了 → 本轮发育结束,短冷却后重开
            b.FarmUntilTick = -1;
            b.SubCooldown = Math.Max(10, bp.SubCooldownTicks);
        }
        else if (subAlive && b.FarmUntilTick > 0 && b.FarmUntilTick <= Tick)
            b.FarmUntilTick = -1;   // 时限到:子球转为常驻第二猎杀组

        b.StateTicks++;
        float minSplitMass = PlayerMinSplit * PlayerMinSplit / 100f;

        // ---- 全局威胁响应 ----
        // fleeR 含威胁半径×2.5 → 威胁越大躲得越远（大球威慑圈 ∝ 自身半径）。
        // 等价于「边缘间距 < 300 + 自身半径×2 + 威胁半径×1.5」
        float fleeR = 300f + myR * 2f + (threat?.R ?? 0f) * 2.5f;
        if (threat != null && b.ThreatD2 < fleeR * fleeR)
        {
            // 只有威胁尚远且主组多片占优才原地合并;贴脸一律跑 —— 分身弹射比合并快,
            // 老版 mergeUp 把被压着的 bot 往威胁脸上送（被吃时还在慢慢挤合并）
            bool mergeUp = n1 > 1 && m1 > threat.Mass * 1.5f && b.ThreatD2 > 700f * 700f;
            RequestState(b, mergeUp ? 3 : 2, bp);
        }
        else if (b.HuntD2 < float.MaxValue)
        {
            // 攻击圈：原版是 260+R*2.2（约 750），这里不再大幅放大 ——
            // 放大狩猎圈会让 bot 主动冲向远处的大块头，得不偿失
            float attackR = MathF.Max(260f + myR * 2.2f, 900f);
            var atk2 = attackR * attackR;
            // 发育中只有猎物贴近脸才中断发育（否则永远在发育永远不干活）
            if (b.HuntD2 < atk2 && (!farming || b.HuntD2 < atk2 * 0.45f)) RequestState(b, 1, bp);
        }

        // ---- 火炮技能:够肥+附近有炮(刺球)+有真人目标+无敌贴脸 → 状态4 推刺睞准 ----
        if (diff >= 2 && b.ArtilleryCd <= 0 && b.AiState == 0 && !farming
            && b.MassTotal > 1200f && threat == null
            && b.VirusId != 0 && fatPos != null)
        {
            b.ArtilleryVirusId = b.VirusId;
            b.AiState = 4; b.StateTicks = 0;
            b.StateSwitchCooldown = bp.StateCooldown;
        }

        // ---- SIEGE 围剿:只有真能打的才参与 ----
        // 门槛 = 巨人 55% 质量（多片合击才有戏）。打不过的一律不拉 ——
        // 老版是无条件全员拉入，它们的“后勤”分支又直接朝玩家走 → 排队送头。
        if (siege && diff >= 2 && b.AiState != 2 && !farming
            && b.MassTotal > GiantMassCache * 0.55f)
            RequestState(b, 5, bp);

        // ---- 状态执行 ----
        switch (b.AiState)
        {
            case 1:   // ATTACK 双组协同 split-kill
            {
                if (prey == null) { RequestState(b, 0, bp); break; }
                b.WanderTarget = null;
                SetMouse(b, 1, prey.X, prey.Y);

                if (b.AttackDelay <= 0 && b.SplitCooldown <= 0)
                {
                    // 主组斩杀窗口（Nebulous:目标有效半径 ×1.05+0.75,半径²比 ∈ (2, 4.2)）
                    var tr = prey.R * 1.05f + 0.75f;
                    var t2 = tr * tr;
                    if (n1 == 1)
                    {
                        var m2 = main.R * main.R;
                        var reach = main.R * 2.2f + 480f;
                        // 窗口 2.2~8×:半球仍能稳吞猎物（原版 4.2 上限太保守,
                        // 4.2~9× 之间既不 split 也不 burst → bot 比你大 6 倍只会用脸蹭）
                        if (m2 > 2.2f * t2 && m2 < 8f * t2 && b.HuntD2 < reach * reach)
                        {
                            Split(b, 1);
                            b.SplitCooldown = bp.SplitCooldown == 0 ? 2 : bp.SplitCooldown;
                        }
                    }
                    // 多连分纪律:只有碾压级优势+近距精确才泼 —— 老版条件太松到处乱泼,
                    // 128 片洒一地被人捡尸体。收紧:12× 优势 + 距离 0.8×射程内
                    var areach = (main.R * 2.2f + 620f) * 0.8f;
                    if (m1 > prey.Mass * 12f && b.BurstCd <= 0
                        && b.HuntD2 < areach * areach && b.AttackDelay <= 0)
                    {
                        BurstSplit(b, 1, 7);
                        b.BurstCd = 420;
                        b.SplitCooldown = Math.Max(b.SplitCooldown, 30);
                    }
                    // 子组第二刀:窗口独立判定 —— 两把刀同时落下
                    if (n2 == 1)
                    {
                        var sub = subs[0];
                        var sr2 = sub.R * sub.R;
                        float sdx = prey.X - sub.X, sdy = prey.Y - sub.Y;
                        var sd2 = sdx * sdx + sdy * sdy;
                        var sreach = sub.R * 2.2f + 480f;
                        if (sr2 > 2.2f * t2 && sr2 < 8f * t2 && sd2 < sreach * sreach
                            && sub.Mass >= minSplitMass * 2)
                        {
                            SetMouse(b, 2, prey.X, prey.Y);
                            Split(b, 2);
                            b.SplitCooldown = bp.SplitCooldown == 0 ? 2 : bp.SplitCooldown;
                        }
                        else if (sd2 < bp.ScanRadius * bp.ScanRadius)
                            SetMouse(b, 2, prey.X, prey.Y);   // 子组围堵
                    }
                }
                if (b.StateTicks >= bp.FleeDuration) RequestState(b, 0, bp);
                break;
            }
            case 2:   // FLEE 两组同向反跑
            {
                if (threat == null) { RequestState(b, 0, bp); break; }
                b.WanderTarget = null;
                var (ex, ey) = SteerAwayFromWalls(cx, cy, cx - threat.X, cy - threat.Y);
                var l = MathF.Sqrt(ex * ex + ey * ey);
                if (l < 1) { ex = 1; ey = 0; l = 1; }
                var fx = Math.Clamp(cx + ex / l * 2000f, BorderMin + BorderPad, BorderMax - BorderPad);
                var fy = Math.Clamp(cy + ey / l * 2000f, BorderMin + BorderPad, BorderMax - BorderPad);
                SetMouse(b, 1, fx, fy);
                if (subAlive) SetMouse(b, 2, fx, fy);

                // 贴脸必分身弹射:任何一片进入被吃距离 → 全组朝反方向爆分。
                // boost=位移,冷却好就再弹（老版锁 n1==1,分过一次就永远不再弹 → 被压着活活吃掉）
                var eatReach = threat.R + main.R * 2.4f;
                if (b.SplitCooldown <= 0 && b.ThreatD2 < eatReach * eatReach
                    && main.Mass >= minSplitMass * 2)
                {
                    Split(b, 1);
                    b.SplitCooldown = Math.Max(6, bp.SplitCooldown);
                }
                // 威胁已甩开 → 立刻回归游走(防原地罚站)
                if (b.ThreatD2 > fleeR * fleeR * 1.7f) { RequestState(b, 0, bp, true); break; }
                if (b.StateTicks >= bp.FleeDuration) RequestState(b, 0, bp);
                break;
            }
            case 3:   // MERGE-UP 主组收缩;子球照常觅食（经济不停）
            {
                if (threat == null || n1 <= 1) { RequestState(b, 0, bp); break; }
                b.WanderTarget = null;
                var (mx, my2) = SteerAwayFromWalls(cx, cy, cx - threat.X, cy - threat.Y);
                var ml = MathF.Sqrt(mx * mx + my2 * my2);
                if (ml < 1) { mx = 1; my2 = 0; ml = 1; }
                SetMouse(b, 1,
                    Math.Clamp(cx + mx / ml * 800f, BorderMin + BorderPad, BorderMax - BorderPad),
                    Math.Clamp(cy + my2 / ml * 800f, BorderMin + BorderPad, BorderMax - BorderPad));
                if (b.StateTicks >= bp.FleeDuration * 0.5f) RequestState(b, 0, bp);
                break;
            }
            default:   // WANDER 发育中→纯觅食避刺;平时→逼近猎物/HIVE 合围/食物密集区
            {
                var wt = b.WanderTarget;
                // 到达判定：至少走完“两个身位+320”才算到 —— 老版死写 400，而 bot 半径
                // 本就有 224~447，目标点还在自己身体里就被判“到了” → 一步一换向，原地踏步
                var arriveR = main.R * 2f + 320f;
                bool needNew = wt == null ||
                    (main.X - wt.Value.X) * (main.X - wt.Value.X) + (main.Y - wt.Value.Y) * (main.Y - wt.Value.Y) < arriveR * arriveR;
                if (farming)
                {
                    if (needNew) { wt = PickWanderTarget(b, main); b.WanderTarget = wt; }
                }
                else if (prey != null && b.HuntD2 < 1800f * 1800f)
                {
                    // 主动狩猎：只找近处的对手（1800 内），不跨地图送头
                    wt = (prey.X, prey.Y);
                    b.WanderTarget = wt;
                }
                else if (hivePos is { } hp && b.MassTotal > 900f
                         && (fatMass <= 0f || b.MassTotal > fatMass * 0.45f))
                {
                    // HIVE:够肥的才参加合围,小球别去送头(安心发育);
                    // 比目标小太多(不到45%)也一律不去 —— 否则全场 bot 排队给大玩家送人头
                    if (wt is { } wtv && (needNew || (wtv.X - hp.X) * (wtv.X - hp.X) + (wtv.Y - hp.Y) * (wtv.Y - hp.Y) > 600f * 600f))
                    {
                        var ja = (float)(_rng.NextDouble() * Math.PI * 2);
                        var jr = 150f + 550f * (float)_rng.NextDouble();
                        wt = (hp.X + MathF.Sin(ja) * jr, hp.Y + MathF.Cos(ja) * jr);
                        b.WanderTarget = wt;
                    }
                }
                else if (needNew)
                {
                    wt = PickWanderTarget(b, main);
                    b.WanderTarget = wt;
                }
                var t = wt ?? (BorderMax / 2f, BorderMax / 2f);
                // 大体型主动避刺:刺球在躲闪半径内 → 目标点改成远离刺球方向
                var virus = ById(b.VirusId);
                var avoidR = main.R * 2.5f + 260f;
                if (virus != null && b.VirusD2 < avoidR * avoidR)
                {
                    float ax = main.X - virus.X, ay = main.Y - virus.Y;
                    var al = MathF.Sqrt(ax * ax + ay * ay);
                    if (al < 1) { ax = 1; ay = 0; al = 1; }
                    t = (main.X + ax / al * 1200f, main.Y + ay / al * 1200f);
                    b.WanderTarget = null;
                }
                SetMouse(b, 1, Math.Clamp(t.X, BorderMin + BorderPad, BorderMax - BorderPad),
                               Math.Clamp(t.Y, BorderMin + BorderPad, BorderMax - BorderPad));
                // 发育期输血:主球肥子球瘦 → 吐几口孢子直喂它(跨组吞噬,吃自家孢子合法)
                if (farming && n2 > 0 && b.FeedCd <= 0 && main.Mass > 1000f)
                {
                    Cell? sub0 = subs[0];
                    foreach (var s in subs) if (s.Mass < sub0.Mass) sub0 = s;
                    float fdx = sub0.X - main.X, fdy = sub0.Y - main.Y;
                    if (sub0.Mass < 420f && fdx * fdx + fdy * fdy < 900f * 900f)
                    {
                        SetMouse(b, 1, sub0.X, sub0.Y);
                        Eject(b, 1);
                        b.FeedCd = 4;
                    }
                }
                break;
            }
            case 4:   // ARTILLERY 推刺炮:站位刺球正后方吐孢子 → 新刺穿过刺球射向最肥真人
            {
                var V = ById(b.ArtilleryVirusId) ?? ById(b.VirusId);
                if (V == null || fatPos == null || b.MassTotal < 900f)
                { b.ArtilleryCd = 420 + _rng.Next(300); RequestState(b, 0, bp, true); break; }
                b.WanderTarget = null;
                float tvx = fatPos.Value.X - V.X, tvy = fatPos.Value.Y - V.Y;
                var tvl = MathF.Sqrt(tvx * tvx + tvy * tvy);
                if (tvl < 1) { b.ArtilleryCd = 300; RequestState(b, 0, bp, true); break; }
                tvx /= tvl; tvy /= tvl;
                var standX = V.X - tvx * (main.R + 240f);
                var standY = V.Y - tvy * (main.R + 240f);
                float sx = main.X - standX, sy = main.Y - standY;
                if (sx * sx + sy * sy > 340f * 340f)
                    SetMouse(b, 1, standX, standY);   // 先走炮位
                else
                {
                    SetMouse(b, 1, V.X + tvx * 60f, V.Y + tvy * 60f);   // 对穿刺球
                    Eject(b, 1);   // 喂刺 → 满 140 尺寸射出新刺沿同方向飞向目标
                }
                if (b.StateTicks >= 60)
                { b.ArtilleryCd = 360 + _rng.Next(240); RequestState(b, 0, bp, true); }
                break;
            }
            case 5:   // SIEGE 全场围剿巨人:主力贴脸 split-kill / 后勤输血养 boss / 炮灰撤离
            {
                if (!siege) { RequestState(b, 0, bp, true); break; }
                b.WanderTarget = null;
                float gdx = gPos.X - main.X, gdy = gPos.Y - main.Y;
                var gd2 = gdx * gdx + gdy * gdy;
                if (b.MassTotal > GiantMassCache * 2.3f)
                {
                    // 主力:质量压过巨人 → 贴脸 split-kill（斩杀线用巨人半径）
                    SetMouse(b, 1, gPos.X, gPos.Y);
                    var tr = GiantMaxRCache * 1.05f + 0.75f;
                    var t2g = tr * tr;
                    var m2g = main.R * main.R;
                    var greach = main.R * 2.2f + 560f;
                    if (n1 == 1 && b.SplitCooldown <= 0 && b.AttackDelay <= 0
                        && m2g > 2f * t2g && gd2 < greach * greach)
                    {
                        Split(b, 1);
                        b.SplitCooldown = bp.SplitCooldown == 0 ? 2 : bp.SplitCooldown;
                    }
                    // 距离够近且碾压 → 直接多连分弹幕覆盖
                    if (b.BurstCd <= 0 && b.AttackDelay <= 0
                        && b.MassTotal > GiantMassCache * 6f
                        && gd2 < (main.R * 2.2f + 620f) * (main.R * 2.2f + 620f))
                    {
                        BurstSplit(b, 1, 7);
                        b.BurstCd = 150;
                        b.SplitCooldown = Math.Max(b.SplitCooldown, 30);
                    }
                }
                else if (b.MassTotal > 500f)
                {
                    // 后勤:待在巨人威慑圈外,只给附近主力 bot 输血 ——
                    // 老版无条件 SetMouse(巨人位置) → 排队送进玩家嘴里
                    var safe = GiantMaxRCache * 3f + main.R * 2f + 900f;
                    float gd = MathF.Sqrt(gdx * gdx + gdy * gdy);
                    if (gd > safe) SetMouse(b, 1, gPos.X, gPos.Y);   // 圈外才靠近
                    else
                    {
                        var (bx, by) = SteerAwayFromWalls(cx, cy, -gdx, -gdy);   // 退出威慑圈
                        var bl = MathF.Sqrt(bx * bx + by * by);
                        if (bl < 1) { bx = 1; by = 0; bl = 1; }
                        SetMouse(b, 1,
                            Math.Clamp(cx + bx / bl * 1600f, BorderMin + BorderPad, BorderMax - BorderPad),
                            Math.Clamp(cy + by / bl * 1600f, BorderMin + BorderPad, BorderMax - BorderPad));
                    }
                    if (b.FeedCd <= 0 && main.Mass > minSplitMass * 4)
                    {
                        Player? boss = null; Cell? bossCell = null;
                        float bd2 = float.MaxValue;
                        foreach (var o in Bots)
                        {
                            if (o == b || o.Cells.Count == 0 || o.MassTotal < GiantMassCache * 1.5f) continue;
                            foreach (var oc in o.Cells)
                            {
                                float dx = oc.X - main.X, dy = oc.Y - main.Y;
                                var d2 = dx * dx + dy * dy;
                                if (d2 < bd2) { bd2 = d2; boss = o; bossCell = oc; }
                            }
                        }
                        if (boss != null && bossCell != null && bd2 < 1100f * 1100f)
                        {
                            SetMouse(b, 1, bossCell.X, bossCell.Y);
                            Eject(b, 1);
                            b.FeedCd = 3;
                        }
                    }
                }
                else
                {
                    // 炮灰(<500):别送质量,反向撤离
                    var (px2, py2) = SteerAwayFromWalls(cx, cy, cx - gPos.X, cy - gPos.Y);
                    var pl = MathF.Sqrt(px2 * px2 + py2 * py2);
                    if (pl < 1) { px2 = 1; py2 = 0; pl = 1; }
                    SetMouse(b, 1,
                        Math.Clamp(cx + px2 / pl * 2000f, BorderMin + BorderPad, BorderMax - BorderPad),
                        Math.Clamp(cy + py2 / pl * 2000f, BorderMin + BorderPad, BorderMax - BorderPad));
                }
                if (b.StateTicks >= 500) RequestState(b, 0, bp, true);   // 防卡死
                break;
            }
        }

        // ---- 分身跑（Nebulous GameMode.L 自动连分机制移植）----
        BotAutoSplitRun(b);
    }

    /// <summary>
    /// 分身跑 Auto Split-Run —— Nebulous `GameMode.L` 的自动连分机制。
    /// 反编译位置：GameSimulation 12668 段（bot 分支）/ 15205、15313 段（玩家按键分支），
    /// 计时器 `f12076m2` 与 `l2` 每 tick 加 `f12771h0`(=1/tickRate)，到 1.5 秒翻成负数 →
    /// 负数下一帧就触发 `M0()`（全组对半弹出）或 `S()`（单组连分，一次最多 5 片）。
    ///
    /// 关键：原版这两个计时器**只有玩家按键(V0/Q0) 才会启动，bot 的恒为 0**
    /// → AI 永远不会连分冲刺（只会用脸慢慢蹭）。真人却能连分弹射跑位，
    /// 所以这里给 bot 主动开表。
    /// 分裂自带 boost 弹射（SplitCell 固定 870），连分的位移远快于单球巡航。
    /// </summary>
    void BotAutoSplitRun(Player b)
    {
        // 分身上限太低（hypermass=1 等模式）根本没得连分
        if (!AutoSplitRunEnabled || b.Cells.Count == 0 || PieceCap(b) < 8)
        {
            b.AutoSplitT1 = 0f; b.AutoSplitT2 = 0f;
            return;
        }
        // 只在"有明确去向"时连分：追击(1)/逃跑(2)/围剿(5)。
        // 游走与发育期不连分，否则 bot 会一边吃食物一边把自己切碎送尸。
        if (b.AiState != 1 && b.AiState != 2 && b.AiState != 5)
        {
            b.AutoSplitT1 = 0f; b.AutoSplitT2 = 0f;
            return;
        }
        // 逃跑但不够肥 → 不连分（切成碎片等于喂饭）
        if (b.AiState == 2 && b.MassTotal < 1500f)
        {
            b.AutoSplitT1 = 0f; b.AutoSplitT2 = 0f;
            return;
        }
        var step = 1f / TicksPerSec;   // Nebulous f12771h0 = 1/tickRate
        // 计时器 1 → 主组全分（Nebulous M0：整组对半弹出）
        if (b.AutoSplitT1 == 0f) b.AutoSplitT1 = step;          // 原版 V0():按键启动
        if (b.AutoSplitT1 > 0f)
        {
            b.AutoSplitT1 += step;
            if (b.AutoSplitT1 >= 1.5f) b.AutoSplitT1 = -1.5f;   // 到点翻负 = 触发信号
        }
        if (b.AutoSplitT1 < 0f)
        {
            Split(b, 1);
            b.AutoSplitT1 = 0f;
        }
        // 计时器 2 → 子组连分（Nebulous S(z10=true)：一次最多 5 片）
        if (b.CellsOf(2).Count > 0)
        {
            if (b.AutoSplitT2 == 0f) b.AutoSplitT2 = step;
            if (b.AutoSplitT2 > 0f)
            {
                b.AutoSplitT2 += step;
                if (b.AutoSplitT2 >= 1.5f) b.AutoSplitT2 = -1.5f;
            }
            if (b.AutoSplitT2 < 0f)
            {
                BurstSplit(b, 2, 2);   // 2 轮 → 4 片
                b.AutoSplitT2 = 0f;
            }
        }
        else b.AutoSplitT2 = 0f;
    }

    /// <summary>子球经济:独立觅最近食物;有能吃它的靠近 → 独立逃命。节流 6t。</summary>
    void BotEconomy(Player b, BotParams bp)
    {
        var subs = b.CellsOf(2);
        if (subs.Count == 0) { b.SubWander = null; b.SubThreatId = 0; return; }
        Cell? sub = subs[0];
        foreach (var s in subs) if (s.Mass > sub.Mass) sub = s;
        var s0 = sub!;

        if (Tick >= b.NextEconTick)
        {
            b.NextEconTick = Tick + 6;
            uint sid = 0; float sd2 = float.MaxValue;
            (float X, float Y)? food = null; float fd2 = float.MaxValue;
            foreach (var c in Cells.Values)
            {
                if (c.IsFood)
                {
                    float dx = c.X - s0.X, dy = c.Y - s0.Y, d2 = dx * dx + dy * dy;
                    if (d2 < fd2) { fd2 = d2; food = (c.X, c.Y); }
                    continue;
                }
                if (c.Owner == null || c.Owner == b || c.IsVirus || c.IsEjected) continue;
                if (c.R * 1.15f <= s0.R) continue;
                float ddx = c.X - s0.X, ddy = c.Y - s0.Y, dd2 = ddx * ddx + ddy * ddy;
                if (dd2 < sd2) { sd2 = dd2; sid = c.Id; }
            }
            b.SubThreatId = sid; b.SubThreatD2 = sd2;
            if (food != null) b.SubWander = food;
        }
        var st = ById(b.SubThreatId);
        if (st == null) b.SubThreatD2 = float.MaxValue;
        else
        {
            var rr = 260f + s0.R * 3f;
            if (b.SubThreatD2 < rr * rr)
            {
                float dx = s0.X - st.X, dy = s0.Y - st.Y;
                var l = MathF.Sqrt(dx * dx + dy * dy);
                if (l < 1) { dx = 1; dy = 0; l = 1; }
                SetMouse(b, 2,
                    Math.Clamp(s0.X + dx / l * 1500f, BorderMin + BorderPad, BorderMax - BorderPad),
                    Math.Clamp(s0.Y + dy / l * 1500f, BorderMin + BorderPad, BorderMax - BorderPad));
                return;
            }
        }
        if (b.SubWander is { } sw) SetMouse(b, 2, sw.X, sw.Y);
    }

    /// <summary>状态切换（Nebulous Bot.requestStateChange）:同状态忽略;冷却中拒绝,但追击(1)可强制覆盖;force=清理用。</summary>
    void RequestState(Player b, int state, BotParams bp, bool force = false)
    {
        if (b.AiState == state) return;
        if (!force && b.StateSwitchCooldown > 0 && state != 1) return;
        b.AiState = state;
        b.StateSwitchCooldown = bp.StateCooldown;
        b.StateTicks = 0;
    }

    /// <summary>多连分:一个 tick 内连续分裂 n 次 → 最多 2^n 片扇形泼出（受分身上限约束,extreme=256）。</summary>
    public void BurstSplit(Player p, byte tab, int n)
    {
        for (int i = 0; i < n; i++)
        {
            var before = p.CellsOf(tab).Count;
            Split(p, tab);
            if (p.CellsOf(tab).Count <= before) break;   // 没得分了（全小于分裂质量或到上限）
        }
    }

    /// <summary>感知缓存:威胁/猎物/最近刺球,记细胞 id + 距离²。</summary>
    void ScanSensors(Player b, Cell mine, float myR, float threatScan, float preyScan)
    {
        uint threatId = 0, huntId = 0, virusId = 0;
        float threatD2 = float.MaxValue, huntD2 = float.MaxValue, virusD2 = float.MaxValue;
        float myMass = b.MassTotal;
        // 对方总质量一次扫描只算一次（MassTotal 是遍历属性，每个 cell 调一次太贵）
        var massCache = new Dictionary<Player, float>();
        foreach (var c in Cells.Values)
        {
            if (c.IsFood || c.IsEjected) continue;
            float dx = c.X - mine.X, dy = c.Y - mine.Y;
            float d2 = dx * dx + dy * dy;
            // ★ 可见性按「边缘间距」判定（对应原版 e0.i(blob, margin) 的带半径相交查询）：
            //   大球中心明明很远、边缘早就贴到脸上 —— 用中心距的话大玩家走到跟前 bot 都“看不见”
            //   这就是「玩家比它大、它也不跑」的根因。
            float gap = MathF.Sqrt(d2) - c.R - mine.R;
            if (c.IsVirus)
            {
                if (gap > threatScan) continue;
                if (d2 < virusD2) { virusD2 = d2; virusId = c.Id; }
                continue;
            }
            var o = c.Owner;
            if (o == null || o == b) continue;
            if (!massCache.TryGetValue(o, out var oMass)) massCache[o] = oMass = o.MassTotal;
            // 威胁 = 单球比自己大 15%（原版 Player.W() 判定），或**整组质量碾压**：
            // 对方分一堆小片时单片都不比自己大，但它就是屠夫 —— 追上去会被其它片包夹。
            // ★ 这个判定绝不能带距离限制：老版写 gap<700，于是“远处的大玩家”单片小、
            //   不在 700 内 → 被判成猎物 → bot 横跨半张图冲过去送头。
            bool isThreat = c.R * 1.15f > myR || oMass > myMass * 1.5f;
            // ★ 威胁圈小、猎物圈大：猎物要能“主动去找”，否则大图里 20 个 bot 永不照面，全场瞎逛
            var lim = isThreat ? threatScan : preyScan;
            if (gap > lim) continue;
            if (isThreat) { if (d2 < threatD2) { threatD2 = d2; threatId = c.Id; } }
            else if (c.R > 20f) { if (d2 < huntD2) { huntD2 = d2; huntId = c.Id; } }
        }
        b.ThreatId = threatId; b.HuntId = huntId;
        b.ThreatD2 = threatD2; b.HuntD2 = huntD2;
        b.VirusId = virusId; b.VirusD2 = virusD2;
    }

    Cell? ById(uint id) => id != 0 && Cells.TryGetValue(id, out var c) ? c : null;

    /// <summary>墙角规避:靠近边界时削弱垂直分量 → 沿墙切向滑走（Nebulous §3.6 简化版）。</summary>
    (float X, float Y) SteerAwayFromWalls(float x, float y, float dx, float dy)
    {
        const float m = 340f;
        if (x < m || x > BorderMax - m) dx *= 0.35f;
        if (y < m || y > BorderMax - m) dy *= 0.35f;
        return (dx, dy);
    }

    /// <summary>选游走目标:食物密度高分 - 玩家/bot 密度重罚 → 散开找安静角落觅食发育,
    /// 消除全员扎堆混战（老版只看食物,50 个 bot 挤成一团互相打断发育）。</summary>
    (float X, float Y) PickWanderTarget(Player b, Cell mine)
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
        // 拥挤度:敌方球分布（抽样 300）→ 有球的地方重扣分
        var crowd = new int[Grid * Grid];
        var scanned2 = 0;
        foreach (var c in Cells.Values)
        {
            if (c.Owner == null || c.Owner == b) continue;
            var gx = Math.Min(Grid - 1, (int)(c.X / cell));
            var gy = Math.Min(Grid - 1, (int)(c.Y / cell));
            crowd[gy * Grid + gx]++;
            if (++scanned2 >= 300) break;
        }
        // 距离加权:太远的格子轻微打折。
        // ★ 老版系数 0.5 太狠（最远格 -7000，而满食物格才 +4000）→ 永远选最近格，
        //   bot 就在原地几格内打转；实测净位移只有 92px/s（理论值 ~240px/s）。
        //   降到 0.12 并加“最低行程”约束，让它真的会去远处巡游。
        int best = -1; float bestScore = float.MinValue;
        float minTravel = mine.R * 2f + 1200f;   // 目标点至少这么远（否则等于没目标）
        for (int i = 0; i < counts.Length; i++)
        {
            var gx = i % Grid; var gy = i / Grid;
            var cx = gx * cell + cell / 2;
            var cy = gy * cell + cell / 2;
            var dist = MathF.Sqrt((cx - mine.X) * (cx - mine.X) + (cy - mine.Y) * (cy - mine.Y));
            var score = counts[i] * 10f - crowd[i] * 45f - dist * 0.12f + (float)_rng.NextDouble() * 30f;
            if (dist < minTravel) score -= 800f;   // 太近的格子直接劝退
            if (score > bestScore) { bestScore = score; best = i; }
        }
        if (best < 0) best = Grid * Grid / 2;
        var gx2 = best % Grid; var gy2 = best / Grid;
        return (
            gx2 * cell + cell * (0.3f + 0.4f * (float)_rng.NextDouble()),
            gy2 * cell + cell * (0.3f + 0.4f * (float)_rng.NextDouble()));
    }

    /// <summary>机器人死亡后自动重生（恢复初始质量）。</summary>
    /// <summary>死掉的 bot 重生（自持锁）。</summary>
    public void MaintainBots()
    {
        WorldLock.Lock();
        try { MaintainBotsCore(); }
        finally { WorldLock.Unlock(); }
    }

    void MaintainBotsCore()
    {
        foreach (var b in Bots)
        {
            if (b.Cells.Count == 0)
            {
                // 重生 = Nebulous Bot.d0() 死亡钩子：刷新状态机 + 死亡呆滞
                //（Impossible deathGrace=6t ≈ 0.24s 秒复活秒报仇;Easy 100t = 复活送菜）
                var bp = BotParams.For(b.Difficulty = BotDifficulty);
                b.ActiveTab = 1;   // ★ 死亡时 ActiveTab 可能是 2 → 重生必须回主组,否则 n1=0 永久残废
                b.AiState = 0; b.StateTicks = 0;
                b.StateSwitchCooldown = 0; b.SplitCooldown = 0;
                b.AttackDelay = bp.DeathGrace;
                b.WanderTarget = null;
                b.FarmUntilTick = -1; b.SubCooldown = 0;
                b.SubWander = null; b.SubThreatId = 0; b.NextEconTick = 0;
                b.BurstCd = 0; b.ArtilleryCd = 0; b.FeedCd = 0; b.ArtilleryVirusId = 0;
                Spawn(b);   // SpawnTab 内部优先使用 PendingMass（面板自定义质量）
                if (b.Cells.Count > 0 && b.PendingMass == null)
                    foreach (var c in b.Cells) c.Mass = BotSpawnMass;
                // Nebulous Bot.O():复活后 10% 概率 randomFeed 喷质量 —— 官方给 AI 的额外补给
                if (b.Cells.Count > 0 && _rng.NextDouble() < 0.1)
                {
                    var big = b.Cells.OrderByDescending(c => c.Mass).First();
                    big.Mass += RandomFeedTable[_rng.Next(RandomFeedTable.Length)];
                }
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

    /// <summary>切换 bot AI 难度（控制面板实时生效）：立即作用于全部现有 bot。</summary>
    public string SetBotDifficulty(string name)
    {
        if (!Enum.TryParse<BotDifficulty>(name?.Trim(), true, out var d)
            || d < BotDifficulty.Easy || d > BotDifficulty.Impossible)
            return $"unknown difficulty '{name}' (easy|medium|hard|impossible)";
        BotDifficulty = d;
        foreach (var b in Bots)
        {
            b.Difficulty = d;
            b.StateSwitchCooldown = 0;   // 清冷却:立刻按新难度重新决策
        }
        return $"bot difficulty = {d} {BotParams.For(d)}";
    }

    /// <summary>移除 n 个刺球（SetViruses 专用）。写入 RemovedIds,否则客户端残留无碰撞假刺球。</summary>
    void RemoveExcessViruses(int n)
    {
        foreach (var c in Cells.Values.ToList())
        {
            if (n <= 0) break;
            if (!c.IsVirus) continue;
            Cells.Remove(c.Id);
            RemovedIds.Add(c.Id);   // 50 号 removed 段:客户端同步清掉
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

    /// <summary>列出全部在线玩家/bot（控制面板列表用;按总质量降序 = 排行榜顺序）。</summary>
    /// <summary>
    /// bot AI 诊断快照（自动化测试/调试用）：状态机档位、威胁/猎物来源、分组、位置。
    /// 位置是关键 —— 只看 mass/cells 看不出“呆”（站着不动质量照样涨）。
    /// </summary>
    public List<object> ListBotAi()
    {
        var list = new List<object>();
        foreach (var b in Bots)
        {
            if (b.Cells.Count == 0)
            {
                list.Add(new { nick = b.Nick, alive = false });
                continue;
            }
            float cx = 0, cy = 0, maxR = 0, m1 = 0, m2 = 0;
            int n1 = 0, n2 = 0;
            foreach (var c in b.Cells)
            {
                cx += c.X; cy += c.Y;
                if (c.R > maxR) maxR = c.R;
                if (c.Tab == 2) { n2++; m2 += c.Mass; } else { n1++; m1 += c.Mass; }
            }
            cx /= b.Cells.Count; cy /= b.Cells.Count;
            var th = ById(b.ThreatId);
            var pr = ById(b.HuntId);
            list.Add(new
            {
                nick = b.Nick,
                alive = true,
                mass = (int)b.MassTotal,
                cells = b.Cells.Count,
                tab1 = n1,
                tab2 = n2,
                mass1 = (int)m1,
                mass2 = (int)m2,
                state = b.AiState,
                stateTicks = b.StateTicks,
                farming = b.FarmUntilTick > Tick,
                x = (int)cx,
                y = (int)cy,
                maxR = (int)maxR,
                threat = th?.Owner?.Nick,
                threatIsBot = th?.Owner?.IsBot,
                threatD = b.ThreatD2 < float.MaxValue ? (int)MathF.Sqrt(b.ThreatD2) : -1,
                prey = pr?.Owner?.Nick,
                huntD = b.HuntD2 < float.MaxValue ? (int)MathF.Sqrt(b.HuntD2) : -1,
                difficulty = b.Difficulty.ToString(),
            });
        }
        return list;
    }

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
                x = p.Cells.Count > 0 ? (int)(p.Cells.Sum(c => c.X) / p.Cells.Count) : 0,
                y = p.Cells.Count > 0 ? (int)(p.Cells.Sum(c => c.Y) / p.Cells.Count) : 0,
            });
        }
        // 按质量降序:排行榜即玩家列表本身
        return list
            .OrderByDescending(o => (int)o.GetType().GetProperty("mass")!.GetValue(o)!)
            .ToList();
    }
}

/// <summary>全局世界锁：连接层投递输入时与主循环互斥（旧 WorldLockExt 语义，并入此类避免散文件）。</summary>
public static class WorldLock
{
    static readonly object _gate = new();
    public static void Lock() => Monitor.Enter(_gate);
    public static void Unlock() => Monitor.Exit(_gate);
}
