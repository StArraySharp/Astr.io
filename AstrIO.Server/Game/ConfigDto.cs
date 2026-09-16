using System.Text.Json.Serialization;

namespace AstrIO.Server.Game;

/// <summary>
/// config.json 的强类型映射(AOT：替代 SaveConfig 里的匿名对象反射序列化)。
/// 属性名用驼峰 JSON 命名策略保持与原文件一致(spawnMass/botDifficulty/...)。
/// </summary>
public sealed class ConfigDto
{
    public float SpawnMass { get; set; }
    public int Bots { get; set; }
    public int Viruses { get; set; }
    public float AutoSplitMass { get; set; }
    public string BotDifficulty { get; set; } = "impossible";
    public float DecayScale { get; set; }
    public float EjectSize { get; set; }
    public float EjectSizeLoss { get; set; }
    public float EjectDistance { get; set; }
    // ---- 视野裁剪 ----
    public float ViewBaseRadius { get; set; } = 1000f;
    public float ViewMassFactor { get; set; } = 4f;
    public float ViewCellBonus { get; set; } = 60f;
    public float ViewMaxRadius { get; set; } = 6000f;
    public bool ViewCulling { get; set; } = true;
    public bool AutoSplitEnabled { get; set; }
    public bool SubSpawnEnabled { get; set; }
    public string PanelPasswordHash { get; set; } = "";
}

/// <summary>config.json 专用 source-gen 上下文。</summary>
[JsonSourceGenerationOptions(
    WriteIndented = true,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ConfigDto))]
public partial class ConfigJsonContext : JsonSerializerContext
{
}
