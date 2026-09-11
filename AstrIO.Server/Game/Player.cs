namespace AstrIO.Server.Game;

/// <summary>连接的玩家（含 multibox 两组状态与各自鼠标）。</summary>
public sealed class Player
{
    public uint Id { get; }
    public string Nick { get; set; }
    public HashSet<Cell> Cells { get; } = new();
    public byte ActiveTab { get; set; } = 1;
    /// <summary>每组独立鼠标坐标（index 0 = tab1, 1 = tab2），默认世界中心。</summary>
    public (float X, float Y)[] Mouse { get; } =
        { (GameWorld.BorderMax / 2f, GameWorld.BorderMax / 2f), (GameWorld.BorderMax / 2f, GameWorld.BorderMax / 2f) };
    public string Mode { get; set; } = "domination";
    public bool IsBot { get; set; }
    public bool Frozen { get; set; }            // S 键停移
    /// <summary>停移(linesplit)期间的"整组统一方向"(tab 组质量中心 → 鼠标,归一化)。
    /// 分裂与排斥都用它,而不是每个球各自算 —— 否则链越长两端方向差越大,会随时间逐渐跑偏。</summary>
    public (float X, float Y) LineDir { get; set; }
    /// <summary>待执行的分裂轮数（客户端一个包可带多轮）。每 tick 只消化 1 轮，
    /// 否则同一 tick 内连分时母球位置不变、新球全叠在同一个点上。</summary>
    public int PendingSplits { get; set; }
    /// <summary>待分裂的目标 tab 组。</summary>
    public byte PendingSplitTab { get; set; } = 1;
    public int AiTick { get; set; }
    public int LastEjectTick { get; set; } = -999;
    /// <summary>面板设置的质量：出生时生效（未出生时暂存）。</summary>
    public float? PendingMass { get; set; }
    // ---- bot 状态(v5 目的地制 AI)----
    /// <summary>当前状态:wander / hunt / flee。</summary>
    public string BotState { get; set; } = "wander";
    /// <summary>当前游走目标（未到点不乱改方向,移动更自然）。</summary>
    public (float X, float Y)? WanderTarget { get; set; }
    // ---- bot 难度 AI（Nebulous Impossible 状态机移植,详见逆向文档 BotAI.md）----
    /// <summary>难度档位（参数表 BotParams.For）。</summary>
    public BotDifficulty Difficulty { get; set; } = BotDifficulty.Impossible;
    /// <summary>状态机:0游走 1追击 2逃跑 3多片压制。</summary>
    public int AiState { get; set; }
    public int StateTicks { get; set; }             // 当前状态已持续 tick
    public int StateSwitchCooldown { get; set; }    // 状态切换冷却（Nebulous stateCooldownTicks）
    public int AttackDelay { get; set; }            // 死亡呆滞（deathGrace）:归零前不 split-kill
    public int SplitCooldown { get; set; }          // 分裂冷却（Impossible=0 → 连发）
    /// <summary>感知缓存:威胁/猎物细胞 id + 距离²（按难度节流重扫,Hard/Impossible 每 3t）。</summary>
    public uint ThreatId { get; set; }
    public uint HuntId { get; set; }
    public float ThreatD2 { get; set; } = float.MaxValue;
    public float HuntD2 { get; set; } = float.MaxValue;
    /// <summary>下次允许重扫感知的 tick（感知节流:Easy 12t / Medium 6t / Hard·Impossible 3t）。</summary>
    public int NextScanTick { get; set; }
    // ---- multibox 自我发育（v7:tab2 免费子球经济）----
    /// <summary>发育截止 tick（-1 = 未在发育）。</summary>
    public int FarmUntilTick { get; set; } = -1;
    public int SubCooldown { get; set; }               // 开下一轮子球的冷却
    public int NextEconTick { get; set; }              // 经济决策/子球威胁感知节流
    public uint SubThreatId { get; set; }              // 子球附近威胁缓存
    public float SubThreatD2 { get; set; } = float.MaxValue;
    public (float X, float Y)? SubWander { get; set; } // 子球自己的觅食目标
    public uint VirusId { get; set; }                  // 最近刺球（大体型主动避刺）
    public float VirusD2 { get; set; } = float.MaxValue;
    // ---- v8 技能冷却 ----
    public int BurstCd { get; set; }                   // 多连分冷却
    public int ArtilleryCd { get; set; }               // 推刺火炮冷却
    public uint ArtilleryVirusId { get; set; }         // 当前炮位刺球
    public int FeedCd { get; set; }                    // 主球→子球输血冷却
    // ---- v12 分身跑（Nebulous GameMode.L 自动连分机制）----
    /// <summary>连分计时器 1（Nebulous f12076m2）：累加到 1.5 秒→ 触发主组全分（M0）。</summary>
    public float AutoSplitT1 { get; set; }
    /// <summary>连分计时器 2（Nebulous l2）：累加到 1.5 秒 → 触发子组连分（S，一次最多 5 片）。</summary>
    public float AutoSplitT2 { get; set; }
    /// <summary>关联的 WebSocket 会话（bot 为 null）。</summary>
    public object? Session { get; set; }

    public Player(uint id, string nick, bool isBot = false)
    {
        Id = id;
        Nick = string.IsNullOrEmpty(nick) ? "Player" + id : nick;
        IsBot = isBot;
    }

    public List<Cell> CellsOf(byte tab)
    {
        var list = new List<Cell>();
        foreach (var c in Cells)
            if (c.Tab == tab) list.Add(c);
        return list;
    }

    public float MassTotal
    {
        get
        {
            float m = 0;
            foreach (var c in Cells) m += c.Mass;
            return m;
        }
    }
}
