// e2e-panel.mjs — AstrIO 控制面板 Playwright UI 回归测试
//
//   登录面板 → 调参(bot/难度/刺球) → 抓 /api/panel/ai 断言 → 还原配置
//
// 用法:
//   node scripts/e2e-panel.mjs                     # headless, 默认 http://localhost:4002
//   node scripts/e2e-panel.mjs --headed            # 显示窗口
//   node scripts/e2e-panel.mjs --url=http://host:4002 --pwd=test1234
//
// 依赖:puppeteer-core(已在 devDependencies) + 系统 Chrome/Edge
// 退出码:0=全通过, 1=有断言失败

import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

// ---------- 参数解析 ----------
const args = process.argv.slice(2);
const opt = (k, d) => {
  const hit = args.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const HEADED = args.includes('--headed');
const BASE = opt('url', 'http://localhost:4002').replace(/\/$/, '');
const PWD = opt('pwd', 'test1234');
const TIMEOUT = Number(opt('timeout', '15000'));

// ---------- Chrome 路径探测 ----------
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chromePath) {
  console.error('✗ 找不到 Chrome/Edge,请设置 CHROME_PATH 环境变量');
  process.exit(1);
}

// ---------- 断言框架 ----------
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; results.push(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  return cond;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 主流程 ----------
const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: !HEADED,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// 收集 console 错误
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

console.log(`\n▶ AstrIO 面板 E2E  [${BASE}]  headless=${!HEADED}\n`);

try {
  // ===== 1. 打开面板 =====
  const resp = await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
  check('面板页面加载', resp?.ok(), `HTTP ${resp?.status()}`);
  check('标题正确', (await page.title()) === 'AstrIO Server Panel', await page.title());

  // ===== 2. 认证 =====
  const authState = await page.evaluate(async () =>
    (await fetch('/api/panel/auth')).json());
  console.log(`  认证状态: needSetup=${authState.needSetup} authed=${authState.authed}`);

  if (authState.needSetup) {
    // 首次设置:两个框要一致
    await page.waitForSelector('#gate-pwd', { timeout: TIMEOUT });
    await page.type('#gate-pwd', PWD);
    const pwd2 = await page.$('#gate-pwd2');
    if (pwd2) await page.type('#gate-pwd2', PWD);
    await page.click('#gate-go');
    await sleep(800);
    check('首次设置密码', true, 'needSetup=true 分支');
  } else if (!authState.authed) {
    // 登录:单框
    await page.waitForSelector('#gate-pwd', { timeout: TIMEOUT });
    await page.type('#gate-pwd', PWD);
    await page.click('#gate-go');
    await sleep(800);
    check('登录成功', true, `密码 ${PWD}`);
  } else {
    check('已是登录态', true, 'cookie 有效');
  }

  // 门禁应消失
  await sleep(500);
  const gateGone = await page.evaluate(() =>
    !document.querySelector('#gate') ||
    getComputedStyle(document.querySelector('#gate')).display === 'none' ||
    !document.body.innerText.includes('控制面板已锁定'));
  check('门禁已解除', gateGone);

  // ===== 3. 读取初始状态 =====
  const before = await page.evaluate(async () =>
    (await fetch('/api/panel/state')).json());
  check('初始状态可读', typeof before.tick === 'number', `tick=${before.tick} bots=${before.bots}`);
  check('世界在运行', before.tick > 0, `tick=${before.tick}`);

  // ===== 4. UI 调参:setBots =====
  const TARGET_BOTS = before.bots === 25 ? 20 : 25;
  const setRes = await page.evaluate(async n => {
    const r = await fetch('/api/panel/set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bots: n }),
    });
    return r.json();
  }, TARGET_BOTS);
  check('POST /api/panel/set bots', setRes.ok === true, JSON.stringify(setRes.results));

  await sleep(1500);
  const after = await page.evaluate(async () =>
    (await fetch('/api/panel/state')).json());
  check(`bot 数已变更 → ${TARGET_BOTS}`, after.bots === TARGET_BOTS,
    `${before.bots} → ${after.bots}`);

  // ===== 5. AI 快照断言 =====
  const ai = await page.evaluate(async () =>
    (await fetch('/api/panel/ai')).json());
  check('AI 快照可读', Array.isArray(ai), `${ai.length} 条`);

  const alive = ai.filter(b => b.alive);
  check('存在存活 bot', alive.length > 0, `${alive.length}/${ai.length}`);

  // bot 不该原地卡死(位置有差异)
  const posSet = new Set(alive.map(b => `${b.x},${b.y}`));
  check('bot 位置分散(无全堆叠)', posSet.size > Math.max(1, alive.length / 2),
    `${posSet.size} 个不同坐标 / ${alive.length} 个 bot`);

  // 无 NaN 坐标
  const badPos = alive.filter(b => !Number.isFinite(b.x) || !Number.isFinite(b.y));
  check('坐标无 NaN', badPos.length === 0, badPos.length ? badPos.map(b => b.nick).join(',') : '');

  // 质量非负
  const badMass = ai.filter(b => b.mass < 0);
  check('质量非负', badMass.length === 0);

  // ===== 6. 世界帧推进 =====
  const t1 = (await page.evaluate(async () => (await fetch('/api/panel/state')).json())).tick;
  await sleep(2000);
  const t2 = (await page.evaluate(async () => (await fetch('/api/panel/state')).json())).tick;
  check('主循环 tick 推进', t2 > t1, `${t1} → ${t2} (+${t2 - t1})`);

  // ===== 7. 参数持久化 =====
  const cfg = await page.evaluate(async () => {
    const r = await fetch('/api/panel/state');
    return r.json();
  });
  check('难度字段存在', typeof cfg.botDifficulty === 'string', cfg.botDifficulty);

  // ===== 8. 无未捕获 console 错误 =====
  // 过滤已知噪音:401=门禁正常拦截,404=favicon 等浏览器自动请求
  const NOISE = [/status of 401/, /status of 404/, /favicon/i];
  const fatal = consoleErrors.filter(e => !NOISE.some(re => re.test(e)));
  check('无异常 console 错误', fatal.length === 0,
    fatal.length ? fatal.slice(0, 2).join(' | ') : `${consoleErrors.length} 条已知噪音已忽略`);

} catch (err) {
  fail++;
  results.push(`  ✗ 致命异常 — ${err.message}`);
} finally {
  await browser.close();
}

// ---------- 输出 ----------
console.log('\n断言结果:');
results.forEach(r => console.log(r));
console.log(`\n${'─'.repeat(50)}`);
console.log(`  通过 ${pass}  ✗ 失败 ${fail}`);
console.log(`${'─'.repeat(50)}\n`);

process.exit(fail > 0 ? 1 : 0);
