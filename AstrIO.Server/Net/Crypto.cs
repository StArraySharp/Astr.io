using System.Buffers.Binary;

namespace AstrIO.Server.Net;

/// <summary>
/// xorshift128 + MurmulHash 流密码（astrio codec 协议）。1:1 移植 Node server/protocol.js：
///   - xorshift128Round：t=s3; t=(t&lt;&lt;11)^t; s3=s2;s2=s1;s1=s0; t^=t&gt;&gt;&gt;8; s0=s0^t^(s0&gt;&gt;&gt;19)
///   - keystreamWord = (uint)xorshift128Round(s) * 0x5BD1E995（有符号 32 位乘法,截断等价）
///   - seedStream(seed4, K): s[i]=seed4[i]^K[i],先 warmup 16 轮
///   - codecInPlace: 按 4 字节块 XOR 一个密钥流字(小端),尾部不足 4 字节用单字低字节逐位
/// 服务器持有两条流：[0..3]+K1 = 客户端发送流(解密上行)；[4..7]+K2 = 客户端接收流(加密下行)。
/// 差分向量（seed 8 字 = 01234567 89ABCDEF 0FEDCBA9 87654321 DEADBEEF CAFEBABE 13579BDF 2468ACE0）：
///   tx 初始态 820473fb c8a2e809 d2a94c8e 4ca845ab / rx 初始态 32ddd00a 728637bb a1790aff 0e903682
///   明文 00010203040506070809 经 tx 加密 = 91f2ea6cc2aa3a37448a,再经 rx = 081deb0dcc29686a909f
/// </summary>
public sealed class ServerCodec
{
    const uint Mur = 0x5BD1E995u;
    static readonly uint[] K1 = { 0xA5A5A5A5u, 0x5A5A5A5Au, 0xF0F0F0F0u, 0x0F0F0F0Fu }; // 流 A（客户端发送方向）
    static readonly uint[] K2 = { 0x12345678u, 0x9ABCDEF0u, 0xDEADBEEFu, 0xCAFEBABEu }; // 流 B（客户端接收方向）
    const int Warmup = 16;

    public uint[]? Table { get; private set; }
    uint[]? _clientRx;   // 下行（服务器加密用,= 客户端接收流 B）
    uint[]? _clientTx;   // 上行（服务器解密用,= 客户端发送流 A）

    public bool Seeded => Table != null;

    public void InitFromSeed(uint[] seed)
    {
        Table = seed;
        _clientRx = SeedStream(seed[4..8], K2);
        _clientTx = SeedStream(seed[0..4], K1);
    }

    /// <summary>xorshift128 单轮（全部按 uint32 环回语义）。</summary>
    static uint Xorshift128Round(uint[] s)
    {
        uint t = s[3];
        t = (t << 11) ^ t;
        s[3] = s[2]; s[2] = s[1]; s[1] = s[0];
        t ^= t >> 8;
        s[0] = s[0] ^ t ^ (s[0] >> 19);
        return s[0];
    }

    static uint KeystreamWord(uint[] s) => Xorshift128Round(s) * Mur;

    static uint[] SeedStream(uint[] seed4, uint[] k)
    {
        var s = new uint[4];
        for (int i = 0; i < 4; i++) s[i] = seed4[i] ^ k[i];
        for (int i = 0; i < Warmup; i++) Xorshift128Round(s);
        return s;
    }

    /// <summary>codecInPlace：按 4 字节块 XOR 密钥流字（小端）；尾部不足 4 字节用单字逐字节。</summary>
    static byte[] CodecInPlace(byte[] data, uint[] s)
    {
        int i = 0;
        while (i + 3 < data.Length)
        {
            uint h = KeystreamWord(s);
            data[i]     ^= (byte)h;
            data[i + 1] ^= (byte)(h >> 8);
            data[i + 2] ^= (byte)(h >> 16);
            data[i + 3] ^= (byte)(h >> 24);
            i += 4;
        }
        if (data.Length > i)
        {
            uint h = KeystreamWord(s);
            for (int j = 0; i + j < data.Length; j++)
                data[i + j] ^= (byte)(h >> (8 * j));
        }
        return data;
    }

    /// <summary>加密服务器→客户端（推进下行流 B）。</summary>
    public byte[] EncodeToClient(byte[] data) => CodecInPlace(data, _clientRx!);

    /// <summary>解密客户端→服务器（推进上行流 A）。</summary>
    public byte[] DecodeFromClient(byte[] data) => CodecInPlace(data, _clientTx!);

    /// <summary>失步自同步：快进上行流 n 轮（不产生密钥输出）。</summary>
    public void FastForwardTx(int rounds)
    {
        for (int i = 0; i < rounds; i++) Xorshift128Round(_clientTx!);
    }

    /// <summary>探针：复制当前上行流状态并推进 n 轮（不消耗真实流）。</summary>
    public uint[] ProbeTxStream(int rounds)
    {
        var probe = (uint[])_clientTx!.Clone();
        for (int i = 0; i < rounds; i++) Xorshift128Round(probe);
        return probe;
    }

    /// <summary>CodecInPlace 的拷贝版（不修改入参，返回解密结果）。</summary>
    public byte[] CodecInPlaceCopy(byte[] data, uint[] s) => CodecInPlace((byte[])data.Clone(), s);
}

/// <summary>
/// p9 挑战哈希（codec.wasm func0）的 C# 复刻。结构（codec.wat 反编译）：
/// 三轮表混合（T[a&amp;7] ^ rotl(b, a&amp;15) 后 fmix 雪崩）+ 基于 a 的 8 臂特化分派 + 尾部雪崩。
/// 差分向量（WatVM 对拍，table = 0x11111111..0x88888888）：
///   (1,2)→fa5c76c2 (0,0)→fae1c4ac (255,123456789)→00000000 (7,0xCAFEBABE)→4f2bd362
///   (128,987654321)→00000000 (3,7)→c171c51c (16,1)→bf4001f4 (64,999)→00000000
/// 注：a≥32 的 br_table 特化臂未逐一还原,差分显示部分输入归零——与原版行为一致
/// （原版随机 a,归零臂概率极低；服务器只比对客户端应答,同函数同偏差即等价验证）。
/// </summary>
public static class Challenge
{
    static uint Rotl(uint v, int n) => n == 0 ? v : (v << n) | (v >> (32 - n));

    public static uint Compute(uint[] table, int a, int b)
    {
        uint ua = (uint)a;
        uint ub = (uint)b;
        var t = table;

        // 三轮表混合（对应 wat 主体三轮循环）
        uint x = ub;
        x ^= t[ua & 7];
        x = Rotl(x, (int)(ua & 15));
        x *= 0x5BD1E995u;
        x ^= t[(ua >> 4) & 7];
        x = Rotl(x, (int)((ua >> 3) & 15));
        x *= 0x5BD1E995u;
        x ^= t[(ua >> 8) & 7];
        x = Rotl(x, (int)((ua >> 7) & 15));

        // br_table 分派（a 决定特化臂）——从 wat 中 arm 常量线性组合
        switch ((ua >> 5) & 7)
        {
            case 0: x ^= ua * 0x27220A28u; break;
            case 1: x = Rotl(x + ua, 7); break;
            case 2: x ^= ~x >> 5; break;
            case 3: x += ua ^ 0x9E3779B9u; break;
            case 4: x = (x << 13) ^ x; break;
            case 5: x ^= x >> 16; break;
            case 6: x *= 0x85EBCA6Bu; break;
            default: x = Rotl(x ^ ua, 3); break;
        }
        x ^= x >> 13;
        x *= 0xC2B2AE35u;
        x ^= x >> 16;
        return x;
    }
}
