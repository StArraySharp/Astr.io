// serve.mjs — 本地运行重写版客户端:
//   原站静态资源(play.html 等)+ 拦截混淆 bundle → 重写 ESM 入口
//   npm start  →  http://localhost:8123/play.html
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = join(ROOT, 'site', 'www.astrio.io');
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
    // 1) 重写工程资源;/src/ 模块的裸说明符改写为绝对路径(无需 importmap,绕开 CSP)
    if (raw.startsWith('/src/')) {
      const f = join(ROOT, raw);
      if (!existsSync(f)) return send(res, 404, 'text/plain', 'not found: ' + raw);
      let js = readFileSync(f, 'utf8');
      js = js.replaceAll("'jquery'", "'/vendor/jquery-esm.js'")
        .replaceAll('"jquery"', '"/vendor/jquery-esm.js"')
        .replaceAll("'seedrandom'", "'/vendor/seedrandom-esm.js'")
        .replaceAll('"seedrandom"', '"/vendor/seedrandom-esm.js"');
      return send(res, 200, MIME['.js'], js);
    }
    if (raw.startsWith('/vendor/')) {
      const f = join(ROOT, raw);
      if (existsSync(f)) return send(res, 200, MIME[extname(f)] || 'text/plain', readFileSync(f));
      return send(res, 404, 'text/plain', 'not found: ' + raw);
    }
    // 2) 混淆 bundle → 加载器
    if (raw.startsWith('/js/bundle.js')) {
      return send(res, 200, MIME['.js'], readFileSync(here('../public/bundle-loader.js')));
    }
    // 3) 原 Codec.js(全局自加载)→ 空桩(重写版自带 Codec)
    if (raw.startsWith('/js/connection/astrio/Codec.js')) {
      return send(res, 200, MIME['.js'], '/* replaced by rewrite: src/net/Codec.js */');
    }
    // 4) codec.wasm → 内嵌副本
    if (raw === '/js/connection/astrio/codec.wasm') {
      return send(res, 200, MIME['.wasm'], readFileSync(join(ROOT, 'wasm', 'codec.wasm')));
    }

    // 5) 原站文件;HTML 做改写(绝对 URL → 本地 + 保持拦截路径)
    // 线上路由:/ = 落地页(index.html),/play = 游戏客户端页(镜像 play.html)
    const routeAliases = { '/': '/index.html', '/play': '/play.html', '/game': '/play.html' };
    const raw0 = routeAliases[raw] || raw;
    const localN = join(SITE, raw0);
    const local = join(SITE, raw0.replaceAll('/', '\\'));
    const file = existsSync(localN) && statSync(localN).isFile() ? localN : (existsSync(local) && statSync(local).isFile() ? local : null);
    if (!file) {
      console.log('404', raw);
      return send(res, 404, 'text/plain', 'not found: ' + raw);
    }
    if (file.endsWith('.html')) {
      let html = readFileSync(file, 'utf8');
      html = html.replaceAll('https://www.astrio.io/', '/');
      html = html.replaceAll('https://astrio.io/', '/');
      // 静态化资源版本参数 → 镜像文件名(main.css?v=96353 → main.css@v=96353.css 等)
      html = html.replace(/(css\/|js\/)([\w.\-]+?\.(?:css|js))\?v=(\d+)/g, '$1$2@v=$3');
      // 本地运行:移除 CSP meta(它拦截注入的模块脚本;CSP 属于原站线上策略)
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

server.listen(PORT, () => {
  console.log(`astrio rewrite — http://localhost:${PORT}/play.html`);
  console.log(`site: ${SITE}`);
  console.log('ws: browser → wss://astrio.io directly (proxy removed)');
});
