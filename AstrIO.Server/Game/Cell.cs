namespace AstrIO.Server.Game;

/// <summary>
/// 世界中的一个细胞（玩家球/食物/病毒/孢子）。
/// 物理参数逐行对齐 Ogar/MultiOgar（mass = size²/100）。
/// </summary>
public sealed class Cell
{
    public uint Id { get; set; }
    public float X { get; set; }
    public float Y { get; set; }

    float _mass = 1f;
    public float Mass
    {
        get => _mass;
        set { _mass = MathF.Max(1f, value); R = MathF.Sqrt(_mass * 100f); }
    }

    public float R { get; private set; } = 10f;
    public byte[] Color { get; set; } = { 200, 60, 60 };
    public string Nick { get; set; } = "";
    public bool IsVirus { get; set; }
    public bool IsFood { get; set; }
    public bool IsEjected { get; set; }
    public Player? Owner { get; set; }
    /// <summary>所属 multibox 组（1/2），无主为 0。</summary>
    public byte Tab { get; set; }

    // ---- Ogar 冲量模型：boostDistance 总射程 + 方向单位向量 ----
    public float BoostDistance { get; set; }
    public float Bx { get; set; }
    public float By { get; set; }
    public float BoostMaxSpeed { get; set; } = 78f;
    public int BirthTick { get; set; }
    public int Age { get; set; }
    /// <summary>出生保护：在此之前不可被同组合并/吞噬（tick）。</summary>
    public int NoMergeUntil { get; set; }

    public float Speed => 2.1106f / MathF.Pow(R, 0.449f) * 40f * 1.3f;

    /// <summary>Ogar setBoost(distance, angle)：distance 为总射程。</summary>
    public void SetBoost(float distance, float angle, float maxSpeed = 78f)
    {
        BoostDistance = distance;
        Bx = MathF.Sin(angle);
        By = MathF.Cos(angle);
        BoostMaxSpeed = maxSpeed;
    }

    /// <summary>Ogar Cell.move()：speed = sqrt(dist²/100)，上限 boostMaxSpeed，指数消耗。</summary>
    public void ApplyBoost()
    {
        if (BoostDistance <= 0) return;
        var spd = MathF.Sqrt(BoostDistance * BoostDistance / 100f);
        spd = MathF.Min(spd, BoostMaxSpeed);
        spd = MathF.Min(spd, BoostDistance);
        BoostDistance -= spd;
        X += Bx * spd;
        Y += By * spd;
        if (BoostDistance < 1f) BoostDistance = 0;
    }

    /// <summary>Ogar canRemerge：出生≥15tick 且 age ≥ max(30s, size×0.2s)。</summary>
    public bool CanRemerge(int tick, float mergeBaseSec)
    {
        if (Age < 15) return false;
        var ttr = MathF.Max(mergeBaseSec, (int)(R * 0.2f));
        return Age >= ttr * 25f;
    }
}
