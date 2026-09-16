using System.Text.Json.Serialization;

namespace AstrIO.Server;

// ============================================================================
// HTTP API 返回/请求 DTO —— 全部显式 record
// ★ AOT 要求：System.Text.Json 反射序列化在 AOT/trimming 下不可用，
//   所有 Results.Json(...) 必须传「显式类型 + JsonApiContext.Default.XXX」。
//   原来的匿名对象 (new { mass = ... }) 在 AOT 下会运行时抛 NotSupportedException。
// ============================================================================

/// <summary>GET/POST /api/mass</summary>
public sealed record MassDto(float Mass);

/// <summary>GET /server-info/{mode}</summary>
public sealed record ServerInfoDto(int Players, int Spectators);

/// <summary>GET /api/panel/auth</summary>
public sealed record PanelAuthDto(bool NeedSetup, bool Authed);

/// <summary>POST /api/panel/auth</summary>
public sealed record PanelAuthResult(bool Ok, string? Error = null, bool? Setup = null);

/// <summary>POST /api/panel/logout</summary>
public sealed record OkDto(bool Ok);

/// <summary>GET /api/panel/state 的 top 行。</summary>
public sealed record PanelTopDto(string Nick, int Mass, int Cells);

/// <summary>GET /api/panel/state</summary>
public sealed record PanelStateDto(
    int Tick,
    int Bots,
    int BotTarget,
    int Real,
    int Viruses,
    int VirusTarget,
    int Food,
    int Ejected,
    int Cells,
    float SpawnMass,
    float AutoSplitMass,
    bool AutoSplitEnabled,
    bool SubSpawnEnabled,
    float DecayScale,
    float EjectSize,
    float EjectSizeLoss,
    float EjectDistance,
    float ViewBaseRadius,
    float ViewMassFactor,
    float ViewCellBonus,
    float ViewMaxRadius,
    bool ViewCulling,
    string BotDifficulty,
    List<PanelTopDto> Top,
    // ---- 霸屏保底(Anti-Dominance) ----
    /// <summary>当前霸屏者昵称(空 = 无)</summary>
    string DominanceNick,
    /// <summary>霸屏者质量占比(0~1)</summary>
    float DominanceRatio,
    /// <summary>距清场剩余 tick(-1 = 未进入倒计时)</summary>
    int DominanceRemainingTicks,
    /// <summary>累计清场次数</summary>
    int DominanceWipes);

/// <summary>POST /api/panel/set</summary>
public sealed record PanelSetDto(bool Ok, List<string> Results);

/// <summary>/api/panel/players 的单行(对应 GameWorld.PlayerRow)。</summary>
public sealed record PlayerRowDto(
    uint Id,
    string Nick,
    bool IsBot,
    int Mass,
    int Cells,
    bool Alive,
    int X,
    int Y);

/// <summary>/api/panel/ai 的单行(对应 GameWorld.BotAiRow)。</summary>
public sealed record BotAiRowDto(
    string Nick,
    bool Alive,
    int Mass = 0,
    int Cells = 0,
    int Tab1 = 0,
    int Tab2 = 0,
int Mass1 = 0,
    int Mass2 = 0,
    int State = 0,
    int StateTicks = 0,
    bool Farming = false,
    int X = 0,
    int Y = 0,
    int MaxR = 0,
    string? Threat = null,
    bool? ThreatIsBot = null,
    int ThreatD = -1,
    string? Prey = null,
    int HuntD = -1,
    string? Difficulty = null);

/// <summary>回放上传结果。</summary>
public sealed record ReplayUploadDto(bool Ok, string Name, long Size);

/// <summary>回放列表单行。</summary>
public sealed record ReplayRowDto(string Name, long Size, DateTime At);

/// <summary>通用错误体(替代 Results.BadRequest(new { error }))。</summary>
public sealed record ApiErrorDto(string Error);

/// <summary>面板 set 请求体(宽松：全部可空，缺省不改)。</summary>
public sealed record PanelSetRequest(
    int? Bots = null,
    int? Viruses = null,
    float? SpawnMass = null,
    float? AutoSplitMass = null,
    string? Difficulty = null,
    float? DecayScale = null,
    float? EjectSize = null,
    float? EjectSizeLoss = null,
    float? EjectDistance = null,
    float? ViewBaseRadius = null,
    float? ViewMassFactor = null,
    float? ViewCellBonus = null,
    float? ViewMaxRadius = null,
    bool? ViewCulling = null,
    bool? AutoSplitEnabled = null,
    bool? SubSpawnEnabled = null,
    uint? KillId = null,
    string? KillNick = null,
    uint? MassId = null,
    string? MassNick = null,
    float? Mass = null);

/// <summary>POST /api/mass 请求体。</summary>
public sealed record MassRequest(float Mass);

/// <summary>POST /api/panel/auth 请求体。</summary>
public sealed record AuthRequest(string? Password);

// ============================================================================
// Source-generated JSON 上下文 —— AOT 下唯一的序列化入口
// ============================================================================
[JsonSourceGenerationOptions(
    WriteIndented = false,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(MassDto))]
[JsonSerializable(typeof(MassRequest))]
[JsonSerializable(typeof(ServerInfoDto))]
[JsonSerializable(typeof(PanelAuthDto))]
[JsonSerializable(typeof(PanelAuthResult))]
[JsonSerializable(typeof(AuthRequest))]
[JsonSerializable(typeof(OkDto))]
[JsonSerializable(typeof(PanelTopDto))]
[JsonSerializable(typeof(List<PanelTopDto>))]
[JsonSerializable(typeof(PanelStateDto))]
[JsonSerializable(typeof(PanelSetDto))]
[JsonSerializable(typeof(PanelSetRequest))]
[JsonSerializable(typeof(PlayerRowDto))]
[JsonSerializable(typeof(List<PlayerRowDto>))]
[JsonSerializable(typeof(BotAiRowDto))]
[JsonSerializable(typeof(List<BotAiRowDto>))]
[JsonSerializable(typeof(ReplayUploadDto))]
[JsonSerializable(typeof(ReplayRowDto))]
[JsonSerializable(typeof(List<ReplayRowDto>))]
[JsonSerializable(typeof(ApiErrorDto))]
[JsonSerializable(typeof(Dictionary<string, object>))]
public partial class JsonApiContext : JsonSerializerContext
{
}
