namespace AstrIO.Server.Net;

/// <summary>
/// 小端二进制读取器（协议热路径）。1:1 对应 Node server/protocol.js 的 Reader（客户端 bU）。
/// </summary>
public sealed class BinReader
{
    readonly byte[] _buf;
    int _pos;

    public BinReader(byte[] buf) { _buf = buf; _pos = 0; }

    public int Remaining => _buf.Length - _pos;

    public byte U8() => _buf[_pos++];
    public sbyte I8() => (sbyte)_buf[_pos++];
    public ushort U16() { var v = BitConverter.ToUInt16(_buf, _pos); _pos += 2; return v; }
    public short I16() { var v = BitConverter.ToInt16(_buf, _pos); _pos += 2; return v; }
    public uint U32() { var v = BitConverter.ToUInt32(_buf, _pos); _pos += 4; return v; }
    public int I32() { var v = BitConverter.ToInt32(_buf, _pos); _pos += 4; return v; }
    public float F32() { var v = BitConverter.ToSingle(_buf, _pos); _pos += 4; return v; }
    public double F64() { var v = BitConverter.ToDouble(_buf, _pos); _pos += 8; return v; }

    public void Skip(int n) => _pos += n;

    /// <summary>[u8 len][len×u8]。</summary>
    public string String8()
    {
        var n = U8();
        var sb = new System.Text.StringBuilder(n);
        for (int i = 0; i < n; i++) sb.Append((char)U8());
        return sb.ToString();
    }

    /// <summary>[u8 len][len×u16 LE]。</summary>
    public string String16()
    {
        var n = U8();
        var sb = new System.Text.StringBuilder(n);
        for (int i = 0; i < n; i++) sb.Append((char)U16());
        return sb.ToString();
    }
}

/// <summary>
/// 小端二进制写入器（协议热路径）。语义对齐 Node Writer：String16 长度写 u8，
/// 每字符写 u16 LE，超 255 截断（客户端同款行为）。
/// </summary>
public sealed class BinWriter
{
    readonly MemoryStream _ms = new();

    public void U8(byte v) => _ms.WriteByte(v);
    public void I8(sbyte v) => _ms.WriteByte((byte)v);
    public void U16(ushort v)
    {
        _ms.WriteByte((byte)v);
        _ms.WriteByte((byte)(v >> 8));
    }
    public void I16(short v)
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
    public void I32(int v) => U32(unchecked((uint)v));
    public void F32(float v) => U32(BitConverter.SingleToUInt32Bits(v));
    public void Bytes(ReadOnlySpan<byte> b) => _ms.Write(b);

    public void String8(string s)
    {
        var len = Math.Min(s.Length, 255);
        U8((byte)len);
        for (int i = 0; i < len; i++) U8((byte)(s[i] & 0xFF));
    }

    public void String16(string s)
    {
        var len = Math.Min(s.Length, 255);
        U8((byte)len);
        for (int i = 0; i < len; i++) U16(s[i]);
    }

    public byte[] ToArray() => _ms.ToArray();
}

/// <summary>
/// 二进制帧 opcode —— astrio 原版协议（逆向自混淆 bundle / mock-server OPCODE_LEN 表验证）。
/// C→S 上行与 S→C 下行共用编号空间；种子帧 0xFD 由 Session 直发。
/// 注意：上行 50(Split)/40(Eject) 与下行 50(WorldUpdate)/40(ClearCells) 编号复用，
/// 方向不同含义不同 —— 与原版一致。
/// </summary>
public static class Op
{
    // C→S（客户端 Keyboard.sendPacket；长度经 mock-server tryParseLen 验证）
    public const byte Nick = 10;             // [10][u8 len][nick×u16]
    public const byte Room = 20;             // [20][u8 ver=4][str16 tag][str16 pin]
    public const byte Spawn = 30;            // [30][u16 x][u16 y][u8 freeSpectate](6B)
    public const byte Eject = 40;            // [40][u8 tab](2B)
    public const byte Split = 50;            // [50][u8 tab][u8 flag](3B)
    public const byte Mouse = 60;            // [60][u8 tab][u16 x][u16 y][u8 frozen](7B)
    public const byte Ping = 80;             // [80](App 5s；pong 回同号)(1B)
    public const byte Spectate = 70;         // [70][u8 flag](2B)
    public const byte Key = 89;              // [89][u32 code](热键)(5B)
    public const byte MultiboxSwitch = 100;  // [100][u8 tab](2B)
    public const byte ChallengeAnswer = 161; // [161][u8 len][chars…]
    public const byte Token = 162;           // [162][u8 len][chars…](Discord token)
    public const byte UseLockedColor = 163;  // [163][u8 flag]
    public const byte Skin = 90;             // [90][u8 c1][str16 url1][u8 c2][str16 url2]
    public const byte AuthResponse = 222;    // [222][u32](挑战应答)(5B)

    // S→C（客户端 AdminPanel.parse）
    public const byte SpawnTimer = 34;       // [34][u16 sec](复活倒计时)
    public const byte ClearCells = 40;       // [40](死亡当帧清空客户端细胞)
    public const byte WorldUpdate = 50;      // [50](added/updated/eaten/removed)
    public const byte Border = 60;           // [60](世界边界)
    public const byte Pong = 80;             // [80](延迟测量应答)
    public const byte Leaderboard = 90;      // [90](排行榜)
    public const byte TabChange = 120;       // [120][u8 tab](推荐页签)
    public const byte TeamLeaderboard = 130; // [130](战队榜+全服统计)
    public const byte RoomData = 150;        // [150](触发上行握手)
    public const byte BetterDoubleSplits = 174; // [174][u8]
    public const byte AuthFlags = 175;       // [175][u8 flags]
    public const byte Announcement = 172;    // [172][u8 kind][str16](kind 0=system 1=banner)
    public const byte AuthChallenge = 222;   // [222][u8 type][u8 a][u32 b](挑战下发)
}
