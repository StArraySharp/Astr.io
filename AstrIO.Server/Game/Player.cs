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
    public int AiTick { get; set; }
    public int LastEjectTick { get; set; } = -999;
    /// <summary>面板设置的质量：出生时生效（未出生时暂存）。</summary>
    public float? PendingMass { get; set; }
    // ---- bot 状态(v5 目的地制 AI)----
    /// <summary>当前状态:wander / hunt / flee。</summary>
    public string BotState { get; set; } = "wander";
    /// <summary>当前游走目标（未到点不乱改方向,移动更自然）。</summary>
    public (float X, float Y)? WanderTarget { get; set; }
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
