// check-deps.mjs — 收集所有 systems.X 键,与 index.js 注册表比对,报告解析不到的键。
import fs from 'fs';
import { execSync } from 'child_process';

const files = execSync('find src -name "*.js"').toString().trim().split('\n');
const keys = new Set();
const byFile = {};
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  byFile[f] = [];
  for (const m of src.matchAll(/systems\.([A-Za-z_$][\w$]*)/g)) {
    keys.add(m[1]);
    byFile[f].push(m[1]);
  }
}

// index.js 实际注册的键(实例名 + 别名 + extras)
const instances = ['Store','I18n','SettingsPanel','HotkeysPanel','ProfilesPanel','KeyBindings',
  'Mouse','Commands','Keyboard','Targeting','Recorder','InstantReplay','Player','Chat','Sfx',
  'ChatHud','ChatProtocol','ChatService','Leaderboard','TeamLeaderboard','Minimap','TeamList',
  'StatsHud','TargetingHud','ViewportRect','Snowflakes','Menu','MenuForm','Theme','ImportExport',
  'SpectatorTab','TournamentOverlay','World','Canvas','Grid','NameRenderer','Food','OpponentRings',
  'VirusRange','PlayerList','GameConnection','AdminPanel','PartySync','AuthSession','FacebookAuth',
  'GoogleAuth','ChatSocket','color','App'];
const registry = new Set(instances.map(k => k.toLowerCase()));
const aliases = [
  ['replayplayer', 'player'], ['playerlist', 'playerlist'],
  ['tournamentbanner', 'tournamentoverlay'], ['packetrouter', 'adminpanel'],
  ['canvasmanager', 'canvas'], ['bytereader', 'binaryreader'],
  ['app', 'app'], ['camera', 'spectatortab'], ['spectator', 'spectatortab'],
  ['worldbounds', 'grid'], ['settings', 'settingspanel'],
  ['packetwriter', 'packetwriter'], ['writer', 'writer'], ['colorutil', 'color'],
];
for (const [k] of aliases) registry.add(k);
const extras = ['view','document','doc','window','$','jquery','writer','packetwriter',
  'binaryreader','cell','teamplayer','seedrandom','palette','xssfilters','escapehtml',
  'formatmass','langpacks','codec'];
for (const e of extras) registry.add(e);

const missing = [...keys].filter(k => !registry.has(k.toLowerCase()));
console.log(`total keys: ${keys.size} | missing: ${missing.length}`);
for (const k of missing) {
  const where = Object.entries(byFile)
    .filter(([, v]) => v.includes(k))
    .map(([f]) => f)
    .join(', ');
  console.log(`MISSING: ${k}  <-  ${where}`);
}
