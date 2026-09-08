using System.Buffers.Binary;

namespace AstrIO.Server.Net;

/// <summary>
/// xorshift128 流加密（astrio codec 协议）：
/// 种子 8×u32 → 服务器用 [0..3]+K1 派生客户端发送流（解密上行），
/// [4..7]+K2 派生客户端接收流（加密下行）。
/// </summary>
public sealed class ServerCodec
{
    const uint Mur = 0x5BD1E995;
    static readonly int[] K1 = { unchecked((int)0xA5A5A5A5), unchecked((int)0x5A5A5A5A), unchecked((int)0xF0F0F0F0), unchecked((int)0x0F0F0F0F) };
    static readonly int[] K2 = { unchecked((int)0x12345678), unchecked((int)0x9ABCDEF0), unchecked((int)0xDEADBEEF), unchecked((int)0xCAFEBABE) };
    const int Warmup = 16;

    public uint[]? Table { get; private set; }
    int[]? _clientRx;   // 下行（服务器加密用）
    int[]? _clientTx;   // 上行（服务器解密用）

    public bool Seeded => Table != null;

    public void InitFromSeed(uint[] seed)
    {
        Table = seed;
        _clientRx = SeedStream(seed.Skip(4).Take(4).ToArray(), K2);
        _clientTx = SeedStream(seed.Take(4).ToArray(), K1);
    }

    static int Xorshift128Round(int[] s)
    {
        int t = s[3];
        t = (t << 11) ^ t;
        s[3] = s[2]; s[2] = s[1]; s[1] = s[0];
        t ^= (int)((uint)t >> 8);
        s[0] = s[0] ^ t ^ (int)((uint)s[0] >> 19);
        return s[0];
    }

    static int KeystreamWord(int[] s) =>unchecked((int)(uint)Xorshift128Round(s) *unchecked((int)Mur));

    static int[] SeedStream(uint[] seed4, int[] k)
    {
        var s = new int[4];
        for (int i = 0; i < 4; i++) s[i] = unchecked((int)(seed4[i] ^ (uint)k[i]));
        for (int i = 0; i < Warmup; i++) Xorshift128Round(s);
        return s;
    }

    /// <summary>codecInPlace：按 4 字节块 XOR 密钥流（尾部不足 4 字节用单轮低字节）。</summary>
    byte[] CodecInPlace(byte[] data, int[] s)
    {
        int i = 0;
        while (i + 3 < data.Length)
        {
            uint h = unchecked((uint)KeystreamWord(s));
            data[i] ^= (byte)h;
            data[i + 1] ^= (byte)(h >> 8);
            data[i + 2] ^= (byte)(h >> 16);
            data[i + 3] ^= (byte)(h >> 24);
            i += 4;
        }
        if (data.Length > i)
        {
            uint h = unchecked((uint)KeystreamWord(s));
            for (int j = 0; i + j < data.Length; j++)
                data[i + j] ^= (byte)(h >> (8 * j));
        }
        return data;
    }

    /// <summary>加密服务器→客户端（推进下行流）。</summary>
    public byte[] EncodeToClient(byte[] data) => CodecInPlace(data, _clientRx!);

    /// <summary>解密客户端→服务器（推进上行流）。</summary>
    public byte[] DecodeFromClient(byte[] data) => CodecInPlace(data, _clientTx!);

    /// <summary>失步自同步：快进上行流 n 轮。</summary>
    public void FastForwardTx(int rounds) { for (int i = 0; i < rounds; i++) Xorshift128Round(_clientTx!); }

    /// <summary>探针：复制当前上行流状态并推进 n 轮（不消耗真实流）。</summary>
    public int[] ProbeTxStream(int rounds)
    {
        var probe = (int[])_clientTx!.Clone();
        for (int i = 0; i < rounds; i++) Xorshift128Round(probe);
        return probe;
    }

    /// <summary>CodecInPlace 的拷贝版（不修改入参，返回解密结果）。</summary>
    public byte[] CodecInPlaceCopy(byte[] data, int[] s) => CodecInPlace((byte[])data.Clone(), s);
}
