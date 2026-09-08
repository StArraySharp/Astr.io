// e2e-server.mjs — AstrIO.Server 原版协议端到端验证:
//   种子帧(0xFD) → 30 出生 / 10 昵称(加密上行) → 50 世界帧 / 90 排行榜 / 80 pong(加密下行)
// 用法:node scripts/e2e-server.mjs [ws://host:port]
import { initEncryptor, initDecryptor } from '../src/net/codecCipher.js';

const ws = new WebSocket(process.argv[2] || 'ws://localhost:3050');
ws.binaryType = 'arraybuffer';
let seed = null, frames = [], pongRtt = null, pingSentAt = 0, worldFrame = false, worldCells = 0;
const log = [];

ws.onopen = () => log.push('OPEN');
ws.onmessage = ev => {
  const v = new Uint8Array(ev.data);
  if (v[0] === 0xFD && ev.data.byteLength === 33) {
    seed = v.slice(1);
    log.push('SEED✓');
    const w = [];
    const dv = new DataView(seed.buffer, seed.byteOffset);
    for (let i = 0; i < 8; i++) w.push(dv.getUint32(i * 4, true));
    const enc = initEncryptor(w.slice(0, 4));
    const dec = initDecryptor(w.slice(4, 8));
    // 30 号出生包 [30][u16 x][u16 y][u8 frozen]
    const p = new Uint8Array(6);
    p[0] = 30;
    p[1] = 0x38; p[2] = 0x20; // x = 8248(世界中心)
    p[3] = 0x38; p[4] = 0x20; // y = 8248
    p[5] = 0;
    ws.send(enc.apply(p).buffer);
    // 10 号昵称包 [10][u8 len][str16×len]
    const n = new Uint8Array(1 + 1 + 7 * 2);
    n[0] = 10; n[1] = 7;
    'TestBot'.split('').forEach((c, i) => { n[2 + i * 2] = c.charCodeAt(0); });
    ws.send(enc.apply(n).buffer);
    setTimeout(() => { pingSentAt = Date.now(); ws.send(enc.apply(new Uint8Array([80])).buffer); }, 800);
    ws.onmessage = ev2 => {
      const plain = new Uint8Array(dec.apply(new Uint8Array(ev2.data)).buffer);
      const op = plain[0];
      frames.push(op);
      if (op === 50) {
        worldFrame = true;
        worldCells = new DataView(plain.buffer).getUint16(1, true);
      }
      if (op === 80) { pongRtt = Date.now() - pingSentAt; ws.close(); }
    };
  }
};
setTimeout(() => {
  const counts = {};
  frames.forEach(o => counts[o] = (counts[o] || 0) + 1);
  console.log('事件:', log.join(' → '));
  console.log('下行帧:', JSON.stringify(counts), '(50=世界 90=排行 80=pong)');
  console.log('世界帧?', worldFrame ? `YES ✓ (added=${worldCells})` : 'NO ✗',
    '| RTT:', pongRtt !== null ? pongRtt + 'ms ✓' : '✗');
  process.exit(0);
}, 6000);
