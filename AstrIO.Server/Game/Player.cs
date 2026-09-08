namespace AstrIO.Server.Game;

/// <summary>连接的玩家（含 multibox 两组状态与各自鼠标）。</summary>
public sealed class Player
{
    public uint Id { get; }
    public string Nick { get; set; } = "Player";
    public HashSet<Cell> Cells { get; } = new();
    public byte ActiveTab { get; set; } = 1;
    /// <summary>每组独立鼠标坐标（index 0 = tab1, 1 = tab2）。</summary>
    public (float X, float Y)[] Mouse { get; } = { (7071, 7071), (7071, 7071) };
    public string Mode { get; set; } = "domination";
    public bool IsBot { get; set; }
    public bool Frozen { get; set; }            // S 键停移
    public int AiTick { get; set; }
    public int LastEjectTick { get; set; } = -999;
    /// <summary>关联的 WebSocket 会话（bot 为 null）。</summary>
    public object? Session { get; set; }

    public Player(uint id, string nick, bool isBot = false)
    {
        Id = id;
        Nick = nick;
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
