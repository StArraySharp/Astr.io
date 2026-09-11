using AstrIO.Server.Game;

namespace AstrIO.Tests;

/// <summary>
/// 房间席位测试（MaxSlots=50）：满员时真人加入踢 bot 腾位；真人离开补回 bot。
/// </summary>
[TestFixture]
public class RoomSlotTests
{
    GameWorld _w = null!;

    [SetUp]
    public void SetUp()
    {
        _w = new GameWorld { BotCount = 0, VirusTarget = 0 };
    }

    [Test]
    public void 未满员_真人加入不踢bot()
    {
        _w.SetBots(10);
        var before = _w.Bots.Count;
        _w.AddPlayer("human");
        Assert.Multiple(() =>
        {
            Assert.That(_w.Bots.Count, Is.EqualTo(before), "未满员不该动 bot");
            Assert.That(_w.Players.Values.Count(p => !p.IsBot), Is.EqualTo(1));
        });
    }

    [Test]
    public void 正好满50人_真人加入踢掉一个bot()
    {
        _w.SetBots(49);                       // 49 bot + 即将进来的 1 真人 = 50
        // 先放 1 个真人(此时 49 bot,总 50,未超),再放第 2 个真人 → 应踢 1 个 bot
        _w.AddPlayer("human1");
        var botsBefore = _w.Bots.Count;
        var totalBefore = _w.Players.Count;

        _w.AddPlayer("human2");

        Assert.Multiple(() =>
        {
            Assert.That(_w.Bots.Count, Is.EqualTo(botsBefore - 1), "满员时新真人应踢掉一个 bot");
            Assert.That(_w.Players.Count, Is.LessThanOrEqualTo(GameWorld.MaxSlots), "总人数不得超上限");
            Assert.That(totalBefore, Is.EqualTo(GameWorld.MaxSlots), "前提:之前正好 50");
        });
    }

    [Test]
    public void 真人离开_席位有余则补回bot()
    {
        _w.SetBots(49);
        var h1 = _w.AddPlayer("human1");      // 49 bot + 1 = 50
        var h2 = _w.AddPlayer("human2");      // 踢 1 bot → 48 bot + 2 真人 = 50
        var botsAfterJoin = _w.Bots.Count;

        _w.RemovePlayer(h2);                  // 真人离开 → 应补回 1 bot

        Assert.Multiple(() =>
        {
            Assert.That(_w.Bots.Count, Is.EqualTo(botsAfterJoin + 1), "真人离开应补回 bot");
            // h1(真人) + 49 bot = 50 —— 回补后总人数维持 MaxSlots
            Assert.That(_w.Players.Count, Is.EqualTo(GameWorld.MaxSlots), "总人数维持满员");
            Assert.That(h2.Cells.Count, Is.EqualTo(0), "离开者数据已清");
        });
    }

    [Test]
    public void bot被移除_不算真人离开_不触发回补()
    {
        _w.SetBots(49);
        _w.AddPlayer("human1");               // 50
        _w.AddPlayer("human2");               // 踢 1 bot → 48 bot
        var botsAfterJoin = _w.Bots.Count;

        // 面板直接减 bot（SetBots 走 RemovePlayer）→ 不应触发"真人离开回补"
        _w.SetBots(botsAfterJoin - 1);

        Assert.That(_w.Bots.Count, Is.EqualTo(botsAfterJoin - 1),
            "面板减 bot 是显式操作,不应被回补逻辑抵消");
    }

    [Test]
    public void 没有bot可踢时_真人加入不炸_只是超员不受欢迎()
    {
        _w.AddPlayer("human1");               // 0 bot
        Assert.DoesNotThrow(() => _w.AddPlayer("human2"));
        Assert.That(_w.Players.Values.Count(p => !p.IsBot), Is.EqualTo(2));
    }
}
