namespace AstrIO.Server.Net;

/// <summary>小端二进制读取器（协议热路径）。</summary>
public sealed class BinReader
{
    readonly byte[] _buf;
    int _pos;

    public BinReader(byte[] buf) { _buf = buf; _pos = 0; }

    public int Remaining => _buf.Length - _pos;

    public byte U8() => _buf[_pos++];
    public ushort U16() { var v = BitConverter.ToUInt16(_buf, _pos); _pos += 2; return v; }
    public uint U32() { var v = BitConverter.ToUInt32(_buf, _pos); _pos += 4; return v; }

    public string String16()
    {
        var len = U8();
        var sb = new System.Text.StringBuilder(len);
        for (int i = 0; i < len; i++) sb.Append((char)U16());
        return sb.ToString();
    }
}

/// <summary>小端二进制写入器（协议热路径）。</summary>
public sealed class BinWriter
{
    readonly MemoryStream _ms = new();

    public void U8(byte v) => _ms.WriteByte(v);
    public void U16(ushort v)
    {
        _ms.WriteByte((byte)v);
        _ms.WriteByte((byte)(v >> 8));
    }
    public void U32(uint v)
    {
        _ms.WriteByte((byte)v);
        _ms.WriteByte((byte)(v >> 8));
        _ms.WriteByte((byte)(v >> 16));
        _ms.WriteByte((byte)(v >> 24));
    }
    public void F32(float v) => U32(BitConverter.SingleToUInt32Bits(v));
    public void Bytes(ReadOnlySpan<byte> b) => _ms.Write(b);

    public void String16(string s)
    {
        U8((byte)Math.Min(s.Length, 255));
        foreach (var ch in s) U16(ch);
    }

    public byte[] ToArray() => _ms.ToArray();
}

/// <summary>
/// 二进制帧 opcode —— astrio 原版协议(逆向自混淆 bundle / 会话总结)。
/// C→S 上行与 S→C 下行共用编号空间;种子帧 0xFD 由 Session 直发。
/// </summary>
public static class Op
{
    // C→S(客户端 Keyboard.sendPacket)
    public const byte Nick = 10;            // [10][str16 nick]
    public const byte Room = 20;            // [20][u8 ver=4][str16 tag][str16 pin]
    public const byte Spawn = 30;           // [30][u16 x][u16 y][u8 freeSpectate]
    public const byte Mouse = 60;           // [60][u8 tab][u16 x][u16 y][u8 frozen]
    public const byte Ping = 80;            // [80](App 5s;pong 回同号)
    public const byte Key = 89;             // [89][u32 code](热键)
    public const byte Split = 208;          // [208][u8 tab]
    public const byte Eject = 212;          // [212][u8 tab]
    public const byte PingOld = 13;         // 兼容:部分客户端路径
    public const byte Spectate = 100;       // [100][u8 flag]
    public const byte AuthResponse = 222;   // [222][u32](挑战应答)

    // S→C(客户端 AdminPanel.parse)
    public const byte SpawnTimer = 34;      // [34](复活倒计时)
    public const byte WorldUpdate = 50;     // [50](added/updated/eaten/removed)
    public const byte Border = 60;          // [60](世界边界 f32×4)
    public const byte Pong = 80;            // [80](延迟测量应答)
    public const byte Leaderboard = 90;     // [90](排行榜)
    public const byte TeamLeaderboard = 130;// [130](战队榜+全服统计)
    public const byte RoomData = 150;       // [150](触发上行握手)
    public const byte AuthChallenge = 222;  // [222][u8 sub][u8 algo][u32 seed]
}
