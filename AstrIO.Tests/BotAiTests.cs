using AstrIO.Server.Game;

namespace AstrIO.Tests;

/// <summary>
/// bot AI 判定单元测试。
/// 每个用例都对应一个真实踩过的坑（注释标了出处），改 AI 先跑这里。
/// 宏观行为（速度/状态分布）另由 tools/ai-test.py 端到端采样验证，两者互补。
/// </summary>
[TestFixture]
public class BotAiTests
{
    GameWorld _w = null!;

    [SetUp]
    public void SetUp()
    {
        // 这两个是全局静态开关，测完不能污染别的用例
        GameWorld.AutoSplitRunEnabled = true;
        GameWorld.SubSpawnEnabled = true;
        GameWorld.AutoSplitEnabled = true;
        _w = new GameWorld { BotCount = 0, VirusTarget = 0 };
    }

    // ---------- 构造工具 ----------

    Player AddBot(float mass, float x, float y, BotDifficulty diff = BotDifficulty.Impossible)
    {
        var b = _w.AddPlayer("bot", isBot: true);
        b.Difficulty = diff;
        b.Mode = "extreme";
        _w.Spawn(b);
        foreach (var c in b.Cells) { c.Mass = mass; c.X = x; c.Y = y; }
        return b;
    }

    Player AddHuman(float mass, float x, float y)
    {
        var h = _w.AddPlayer("human");
        h.Mode = "extreme";
        _w.Spawn(h);
        foreach (var c in h.Cells) { c.Mass = mass; c.X = x; c.Y = y; }
        return h;
    }

    // ---------- 1. 难度参数表（对齐 Nebulous Bot.initBot）----------

    [Test]
    public void 难度参数_Impossible_对齐逆向文档四核心值()
    {
        var p = BotParams.For(BotDifficulty.Impossible);
        Assert.Multiple(() =>
        {
            Assert.That(p.StateCooldown, Is.EqualTo(6), "状态切换最快");
            Assert.That(p.FleeDuration, Is.EqualTo(300), "攻击/逃跑持续 300t（死咬）");
            Assert.That(p.DeathGrace, Is.EqualTo(6), "死亡呆滞 6t（秒复活）");
            Assert.That(p.SplitCooldown, Is.EqualTo(0), "分裂零冷却 → 连发");
            Assert.That(p.Hive, Is.True, "只有 Impossible 开全图合围");
            Assert.That(p.UseSub, Is.True, "Impossible 会用子球发育");
        });
    }

    [Test]
    public void 难度参数_逐档增强_不能有档位反超()
    {
        var e = BotParams.For(BotDifficulty.Easy);
        var m = BotParams.For(BotDifficulty.Medium);
        var h = BotParams.For(BotDifficulty.Hard);
        var i = BotParams.For(BotDifficulty.Impossible);
        Assert.Multiple(() =>
        {
            Assert.That(e.StateCooldown, Is.GreaterThan(m.StateCooldown), "Easy 决策最慢");
            Assert.That(m.StateCooldown, Is.GreaterThan(h.StateCooldown));
            Assert.That(e.DeathGrace, Is.GreaterThan(m.DeathGrace), "Easy 复活呆滞最久");
            Assert.That(i.ScanRadius, Is.GreaterThanOrEqualTo(h.ScanRadius), "Impossible 感知最广");
        });
    }

    // ---------- 2. 官方"喂 AI"加成（GameSimulation ~9322）----------

    [Test]
    public void 喂食倍率_只有bot吃才翻倍_Impossible最高()
    {
        Assert.Multiple(() =>
        {
            Assert.That(GameWorld.HoleBotMultiplier(BotDifficulty.Medium), Is.EqualTo(1.0f).Within(1e-6), "Medium 官方不给加成");
            Assert.That(GameWorld.HoleBotMultiplier(BotDifficulty.Hard), Is.EqualTo(2.0f).Within(1e-6));
            Assert.That(GameWorld.HoleBotMultiplier(BotDifficulty.Impossible), Is.EqualTo(2.6666667f).Within(1e-5));
            Assert.That(GameWorld.HoleBotMultiplier(BotDifficulty.Easy), Is.EqualTo(1.1333333f).Within(1e-5));
        });
    }

    // ---------- 3. 威胁判定（"我比他大它也不跑"的回归测试）----------

    [Test]
    public void 大玩家贴脸_小bot必须进入FLEE()
    {
        var bot = AddBot(500, 7000, 7000);
        var bc = bot.Cells.First();
        AddHuman(20000, bc.X + 300, bc.Y + 300);
        _w.BotThink(bot);
        Assert.That(bot.AiState, Is.EqualTo(2),
            "玩家大 40 倍且贴脸 —— 必须 FLEE。回归：老版用中心距判定可见性，大球边缘贴脸了 bot 还看不见");
    }

    [Test]
    public void 大球中心很远但边缘贴近_仍然要逃()
    {
        // 这就是"边缘间距 vs 中心距"的回归用例：
        // 大球半径 ~1599（mass 25578），中心距 1800 但边缘只差 ~200
        var bot = AddBot(500, 7000, 7000);
        var bc = bot.Cells.First();
        AddHuman(25578, bc.X + 1800, bc.Y);
        _w.BotThink(bot);
        Assert.That(bot.AiState, Is.EqualTo(2),
            "大球中心 1800 远，但半径 1599 已经快贴到脸了 —— 老版中心距判定会漏掉它");
    }

    // ---------- 4. 猎物判定（"往我肚子里跑"的回归测试）----------

    [Test]
    public void 整组碾压的对手_哪怕单片小也不能当猎物追()
    {
        // 回归：老版写 gap<700 才判整组碾压 → 远处的大玩家被判成猎物 → bot 横跨地图送头
        var bot = AddBot(500, 3000, 3000);
        var bc = bot.Cells.First();
        AddHuman(20000, bc.X + 1200, bc.Y);   // 在猎物圈(1800)内，但边缘间距远超老版的 700
        _w.BotThink(bot);
        Assert.That(bot.AiState, Is.Not.EqualTo(1),
            "对方总质量是自己的 40 倍，不管离多远都不能进追击态");
    }

    [Test]
    public void 更小的对手贴近_应该进入ATTACK()
    {
        // 反向用例：别把 AI 改得太怂
        var bot = AddBot(5000, 3000, 3000);
        var bc = bot.Cells.First();
        AddHuman(300, bc.X + 700, bc.Y);
        _w.BotThink(bot);
        Assert.That(bot.AiState, Is.EqualTo(1), "对方小得多且近在咫尺，应该去追");
    }

    // ---------- 5. 分身跑（Nebulous GameMode.L 连分机制）----------

    [Test]
    public void 追击态下_分身跑计时器1点5秒内触发一次分裂()
    {
        var bot = AddBot(20000, 3000, 3000);
        var bc = bot.Cells.First();
        AddHuman(500, bc.X + 800, bc.Y);
        _w.BotThink(bot);
        Assert.That(bot.AiState, Is.EqualTo(1), "前置：得先进入追击态");

        int before = bot.CellsOf(1).Count;
        // 1.5 秒 = 37.5 tick（25tps），跑 45 tick 必触发
        for (int i = 0; i < 45; i++) _w.BotThink(bot);
        Assert.That(bot.CellsOf(1).Count, Is.GreaterThan(before),
            "原版只有玩家按键才启动计时器，bot 恒为 0 —— 这里验证我们给 AI 开了表");
    }

    [Test]
    public void 游走态不连分_免得边吃边把自己切碎()
    {
        var bot = AddBot(20000, 3000, 3000);
        _w.BotThink(bot);
        Assert.That(bot.AiState, Is.EqualTo(0), "空旷处没人 → 游走");
        int before = bot.CellsOf(1).Count;
        for (int i = 0; i < 45; i++) _w.BotThink(bot);
        Assert.That(bot.CellsOf(1).Count, Is.EqualTo(before), "游走态不该连分");
    }

    // ---------- 6. 并发安全（tick 3722 崩溃的回归测试）----------

    [Test]
    public void 边跑Step边加玩家_不能抛集合修改异常()
    {
        var w = new GameWorld { BotCount = 10, VirusTarget = 3 };
        w.SpawnBots();

        using var cts = new CancellationTokenSource();
        var runner = Task.Run(() =>
        {
            while (!cts.IsCancellationRequested) w.Step();
        });

        // 模拟玩家陆续连接（Session 构造函数里就是裸调 AddPlayer 的）
        for (int i = 0; i < 40; i++)
        {
            var p = w.AddPlayer("p" + i);
            w.Spawn(p);
            Thread.Sleep(2);
        }
        cts.Cancel();
        Assert.DoesNotThrow(() => runner.Wait(2000),
            "回归：Step() 在 foreach (Players.Values) 时被 ws 线程改字典 → Collection was modified");
    }
}
