namespace AstrIO.Server.Game;

/// <summary>
/// 霸屏保底机制(Anti-Dominance)：单个玩家质量占比过高 → 5 秒后全场清场。
///
/// 设计：
///   - 判定：单玩家 MassTotal / 全服 MassTotal ≥ <see cref="RatioThreshold"/>，
///           且全服 MassTotal ≥ <see cref="MinTotalMass"/>(避免开局误判)
///   - 倒计时：首次命中记 tick，<see cref="CountdownTicks"/> 个 tick(5s @ 25fps)后触发
///   - 取消：倒计时期间霸屏者质量掉回阈值以下 → 复位
///   - 触发：把全场玩家(含 bot)全部击杀，各自重生(保留玩家身份)
///   - 冷却：清场后再等 <see cref="CooldownTicks"/> 才重新开始检测(防连环清场)
/// </summary>
public static class AntiDominance
{
    // ---- 可调参数 ----
    /// <summary>触发阈值：单玩家质量占全服比例 ≥ 此值视为霸屏。</summary>
    public const float RatioThreshold = 0.80f;
    /// <summary>全服总质量下限：低于此值不检测(开局阶段所有人都是小球，比例会失真)。</summary>
    public const float MinTotalMass = 5000f;
    /// <summary>单玩家绝对质量下限：防止"只有一个人时占比 100%"被误判。</summary>
    public const float MinPlayerMass = 3000f;
    /// <summary>在场玩家数下限：只有 1 个玩家时不判霸屏。</summary>
    public const int MinPlayers = 2;

    /// <summary>倒计时长度(tick)。5 秒 @ 40ms/tick = 125 tick。</summary>
    public static int CountdownTicks => (int)(5000f / GameWorld.TickMs);
    /// <summary>清场后冷却(tick)，防连环触发。</summary>
    public static int CooldownTicks => (int)(10000f / GameWorld.TickMs);

    /// <summary>
    /// 单帧检测结果。
    /// </summary>
    /// <param name="Triggered">本帧是否应执行清场</param>
    /// <param name="Dominator">霸屏者(可能为 null)</param>
    /// <param name="DominatorNick">霸屏者昵称</param>
    /// <param name="Ratio">当前占比</param>
    /// <param name="RemainingTicks">距清场剩余 tick(未进入倒计时为 -1)</param>
    public readonly record struct Verdict(
        bool Triggered,
        Player? Dominator,
        string DominatorNick,
        float Ratio,
        int RemainingTicks);

    /// <summary>
    /// 评估当前世界状态，推进/复位倒计时。
    /// <para>★ 调用方必须持 <c>WorldLock</c>(由 GameWorld.StepCore 保证)。</para>
    /// </summary>
    /// <param name="players">全场玩家快照</param>
    /// <param name="tick">当前 tick</param>
    /// <param name="armedTick">in/out：倒计时起点 tick(-1 = 未激活)</param>
    /// <param name="cooldownUntilTick">in/out：冷却截止 tick</param>
    public static Verdict Evaluate(
        IEnumerable<Player> players,
        int tick,
        ref int armedTick,
        ref int cooldownUntilTick)
    {
        // 冷却中：直接跳过
        if (tick < cooldownUntilTick)
            return new Verdict(false, null, "", 0f, -1);

        // 统计：全服总质量 + 各玩家质量
        float total = 0f;
        float best = 0f;
        Player? bestPlayer = null;
        int aliveCount = 0;

        foreach (var p in players)
        {
            if (p.Cells.Count == 0) continue;   // 只算有细胞的
            aliveCount++;
            var m = p.MassTotal;
            total += m;
            if (m > best) { best = m; bestPlayer = p; }
        }

        // —— 霸屏判定 ——
        bool active =
            aliveCount >= MinPlayers &&
            total >= MinTotalMass &&
            bestPlayer != null &&
            best >= MinPlayerMass &&
            best / total >= RatioThreshold;

        if (!active)
        {
            armedTick = -1;   // 中断倒计时
            return new Verdict(false, bestPlayer, bestPlayer?.Nick ?? "", total > 0 ? best / total : 0f, -1);
        }

        // —— 倒计时推进 ——
        if (armedTick < 0) armedTick = tick;
        var elapsed = tick - armedTick;
        var remain = CountdownTicks - elapsed;

        if (remain <= 0)
        {
            // 触发清场 → 进入冷却
            armedTick = -1;
            cooldownUntilTick = tick + CooldownTicks;
            return new Verdict(true, bestPlayer, bestPlayer.Nick, best / total, 0);
        }

        return new Verdict(false, bestPlayer, bestPlayer.Nick, best / total, remain);
    }
}
