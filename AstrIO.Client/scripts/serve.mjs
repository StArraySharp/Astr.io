// serve.mjs — 静态站点服务器（标准 html 项目结构,游戏页即首页）:
//   src/index.html     = 游戏客户端（原 play.html,首页）
//   src/home.html      = 原营销落地页（/home）
//   src/js/            = 客户端 ESM 模块（纯静态,无构建）
//   src/js/vendor/     = jquery / seedrandom 本地副本
//   npm start  →  http://<内网IP>:8123/  (监听 0.0.0.0,全内网可访问)
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// 站点根 = src/（标准 html 结构:index.html + js/ + css/ + resources/）
const SITE = join(ROOT, 'src');
const PORT = Number(process.env.PORT || 8123);

// === WebSocket 地址使用原版 ===
// 浏览器直连 wss://astrio.io(带真实指纹,Cloudflare 401 免疫);
// 曾有本地 3000-3050 端口 ws 代理备用,已移除(闲置;历史见 git)。
// 设 ASTRIO_LOCAL_WS=1 可让客户端回退原版 localhost 端口表行为(需自备游戏服)。

const here = f => fileURLToPath(new URL(f, import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
};

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent(req.url.split('?')[0]);

  try {
    // 0a) /server-info/*:转发到线上(菜单模式人数轮询;
    //     原版 localhost 行为同样 404,这里代理以还原线上人数显示)
    if (raw.startsWith('/server-info/')) {
      fetch('https://astrio.io' + req.url, {
        headers: { Origin: 'https://astrio.io', Referer: 'https://astrio.io/' },
      })
        .then(up => up.text())
        .then(body => {
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(body);
        })
        .catch(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"players":0,"spectators":0}'); });
      return;
    }
    // 0) /auth/* 与 /api/join/*:转发到线上(authBase=origin,即 astrio.io)
    //    用于验证 Discord OAuth 流(302→discord.com→callback→?token=)
    if (raw.startsWith('/auth/') || (req.method === 'POST' && raw.startsWith('/api/join/'))) {
      const upstream = 'https://astrio.io' + req.url;
      const headers = { ...req.headers };
      delete headers.host; delete headers.connection; delete headers.origin;
      delete headers['accept-encoding']; // 让上游返回未压缩体,直接透传
      headers.origin = 'https://astrio.io';
      headers.referer = 'https://astrio.io/';
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        fetch(upstream, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
          redirect: 'manual',
        }).then(up => {
          const h = {};
          up.headers.forEach((v, k) => {
            if (!['content-encoding', 'transfer-encoding', 'content-length', 'connection'].includes(k)) h[k] = v;
          });
          // OAuth 回环:线上 callback 的 302 目标(astrio.io?token=…/auth_error=…)
          // 改写到本地,让 AuthSession(?token= 处理链)在本地完成登录
          const loc = up.headers.get('location');
          if (loc && /^https:\/\/(www\.)?astrio\.io\/?(\?|$)/.test(loc)) {
            try {
              const u = new URL(loc);
              h.location = '/' + (u.search || '');
              console.log('auth loopback:', loc.slice(0, 60), '→', h.location);
            } catch {}
          }
          res.writeHead(up.status, h);
          up.body.pipe(res);
        }).catch(e => {
          if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('upstream error: ' + e.message);
        });
      });
      return;
    }
    // 1) 静态站点（site/www.astrio.io）—— 纯静态页面 + 本地 js,无构建。
    //    路由:/ = 游戏客户端(首页),/home = 原落地页;/play 兼容重定向到 /
    const routeAliases = { '/': '/index.html', '/home': '/home.html', '/index': '/index.html', '/game': '/index.html', '/privacy': '/privacy.html', '/terms': '/terms.html', '/bracket': '/bracket.html' };
    const raw0 = routeAliases[raw] || raw;
    if (raw === '/play' || raw === '/play.html' || raw === '/game') {
      res.writeHead(308, { Location: '/' });
      res.end();
      return;
    }
    const localN = join(SITE, raw0);
    const local = join(SITE, raw0.replaceAll('/', '\\'));
    const file = existsSync(localN) && statSync(localN).isFile() ? localN : (existsSync(local) && statSync(local).isFile() ? local : null);
    if (!file) {
      console.log('404', raw);
      return send(res, 404, 'text/plain', 'not found: ' + raw);
    }
    if (file.endsWith('.html')) {
      let html = readFileSync(file, 'utf8');
      // 本地运行:移除 CSP meta(它拦截内联引导脚本;CSP 属于原站线上策略)
      html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/gi, '');
      // WebSocket 地址使用原版:浏览器直连 wss://www.astrio.io(带真实指纹/Cookie,401 免疫);
      // 设 ASTRIO_LOCAL_WS=1 可切回原版 localhost 端口表行为
      if (!process.env.ASTRIO_LOCAL_WS) {
        html = html.replace(/<head[^>]*>/i, m => m + '\n<script>window.__ASTRIO_LIVE_WS = true;</script>');
      }
      // 编解码后端:默认纯 JS(长期测试,零 wasm 依赖,开销 0.03% CPU 无感);
      // 设 ASTRIO_CODEC_WASM=1 切回 wasm 后端(单包快 3 倍,但当前流量下无可测差异)
      if (!process.env.ASTRIO_CODEC_WASM) {
        html = html.replace(/<head[^>]*>/i, m => m + '\n<script>window.__ASTRIO_FORCE_JS_CODEC = true;</script>');
      }
      return send(res, 200, MIME['.html'], html);
    }
    return send(res, 200, MIME[extname(file)] || 'application/octet-stream', readFileSync(file));
  } catch (e) {
    console.error('500', raw, e.message);
    return send(res, 500, 'text/plain', String(e.message));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`astrio rewrite — http://0.0.0.0:${PORT}/  (game = index.html, landing = /home)`);
  console.log(`site: ${SITE}`);
  console.log('ws: browser → wss://astrio.io directly (proxy removed)');
});
