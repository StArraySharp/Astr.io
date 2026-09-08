using System.Buffers.Binary;

namespace AstrIO.Server.Net;

/// <summary>
/// p9 挑战哈希（codec.wasm func0）的 C# 复刻。
/// 源：codec.wat 反编译（server/protocol.js createChallengeFn 用 WatVM 执行同一逻辑）。
/// 结构：三轮表混合（T[a&7] ^ rotl(b, a&15) 等）+ 基于原始 a 的 br_table 分派。
/// 与 WatVM 差分验证通过（见测试）。
/// </summary>
public static class Challenge
{
    // br_table 特化臂常量（从 wat 反编译提取）
    static readonly uint[] Mix = {
        0x27220A28u, 0x007F4A62u, 0x5A5A00C1u, 0x68934B11u,
        0x7A12C6D4u, 0x316E1B31u, 0x99732D7Eu, 0x00110F00u,
    };

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
        x *= MurMul(x);
        x ^= t[(ua >> 4) & 7];
        x = Rotl(x, (int)((ua >> 3) & 15));
        x *= MurMul(x);
        x ^= t[(ua >> 8) & 7];
        x = Rotl(x, (int)((ua >> 7) & 15));

        // br_table 分派（a 决定特化臂）——从 wat 中 arm 常量线性组合
        var arm = (ua >> 5) & 7;
        switch (arm)
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

    static uint MurMul(uint v) => v * 0x5BD1E995u;
}
