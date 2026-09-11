/**
 * ReplayStore — 回放文件持久化(IndexedDB)。
 *
 * 为什么不用 <a download>:Capacitor Android WebView 里 blob 下载行为不稳定
 * (有的落到 Download,有的静默失败)。IndexedDB 存的是 WebView 私有数据
 * (Android 上位于 /data/data/<包名>/app_webview/),生命周期与应用一致,读写零授权。
 * 浏览器端打开回放页同样能列出/播放这些文件(localStorage 同源)。
 *
 * 记录结构:{ name: "yyyymmdd_hhmmss.astr.io", blob: Blob, size, at }
 */
const DB_NAME = 'astrio-replays';
const STORE = 'files';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(out && out.result !== undefined ? out.result : out); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

/** yyyymmdd_hhmmss 文件名(本地时间)。 */
export function replayFileName(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.astr.io`;
}

/** 保存回放 Blob,返回文件名。同名(同一秒内重复保存)覆盖。 */
export async function saveReplay(blob, name = replayFileName()) {
  await tx('readwrite', store => store.put({ name, blob, size: blob.size, at: Date.now() }));
  return name;
}

/** 列出全部回放(按时间倒序)。 */
export async function listReplays() {
  return tx('readonly', store => {
    const req = store.getAll();
    return new Promise(resolve => {
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.at - a.at));
      req.onerror = () => resolve([]);
    });
  });
}

/** 取单个回放 Blob。 */
export async function getReplay(name) {
  const rec = await tx('readonly', store => {
    const req = store.get(name);
    return new Promise(resolve => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  });
  return rec ? rec.blob : null;
}

/** 删除回放。 */
export async function deleteReplay(name) {
  return tx('readwrite', store => store.delete(name));
}
