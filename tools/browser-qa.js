/* Real-browser QA for Battle Ages (Node 24+, no external dependencies).
 * Usage: node tools/browser-qa.js
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const startedAt = Date.now();
let server;
let chrome;
let profileDir;

const checks = [];
let failures = 0;
function check(ok, message) {
  checks.push({ ok: !!ok, message });
  if (ok) console.log(`  ✓ ${message}`);
  else { failures++; console.log(`  ✗ ${message}`); }
  return !!ok;
}
function assert(ok, message) { check(ok, message); if (!ok) throw new Error(message); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' })[ext] || 'application/octet-stream';
}

async function startServer() {
  server = http.createServer((req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const file = path.resolve(ROOT, rel);
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) throw new Error('outside root');
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (_) { res.writeHead(400); res.end('Bad request'); }
  });
  const port = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
  return `http://127.0.0.1:${port}`;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ws.onmessage = event => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'));
        else p.resolve(msg.result);
      } else if (msg.method) {
        const list = this.events.get(msg.method) || [];
        for (const fn of list) fn(msg.params || {});
      }
    };
    this.ws.onerror = () => {};
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, fn) { const list = this.events.get(method) || []; list.push(fn); this.events.set(method, list); }
  once(method) {
    return new Promise(resolve => {
      const fn = value => { const list = this.events.get(method) || []; this.events.set(method, list.filter(x => x !== fn)); resolve(value); };
      this.on(method, fn);
    });
  }
  close() { try { this.ws.close(); } catch (_) {} }
}

async function connectCDP(port) {
  let target;
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (target) break;
    } catch (_) { await sleep(100); }
  }
  if (!target || !target.webSocketDebuggerUrl) throw new Error('Chrome remote debugging endpoint not available');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return new CDP(ws);
}

async function launchChrome() {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome no encontrado en ${CHROME} (use CHROME_PATH)`);
  const port = await freePort();
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-ages-browser-'));
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--window-size=1440,900', 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  chrome.on('error', err => { throw err; });
  return connectCDP(port);
}

async function evaluate(cdp, expression, awaitPromise = false, returnByValue = true) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed');
  return returnByValue ? result.result?.value : result.result;
}
async function waitFor(cdp, expression, timeout = 8000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await evaluate(cdp, expression)) return true; } catch (_) {}
    await sleep(80);
  }
  return false;
}
async function clickSelector(cdp, selector) {
  const rect = await evaluate(cdp, `(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)return null; const r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  assert(rect && Number.isFinite(rect.x), `elemento ${selector} localizado para clic`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
}
async function key(cdp, keyValue) {
  const code = keyValue.length === 1 ? `Key${keyValue.toUpperCase()}` : keyValue;
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: keyValue, code });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyValue, code });
}
async function capture(cdp, name) {
  const outDir = path.join(ROOT, 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(outDir, name);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return file;
}

async function main() {
  const base = await startServer();
  const url = `${base}/`;
  const cdp = await launchChrome();
  const loadingFailures = [];
  const consoleErrors = [];
  const exceptions = [];
  cdp.on('Network.loadingFailed', p => { if (p.requestId && p.errorText) loadingFailures.push(p); });
  cdp.on('Runtime.exceptionThrown', p => exceptions.push(p));
  cdp.on('Runtime.consoleAPICalled', p => { if (['error', 'assert'].includes(p.type)) consoleErrors.push(p); });
  cdp.on('Log.entryAdded', p => { if (p.entry?.level === 'error') consoleErrors.push(p); });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp.send('Page.navigate', { url });
  assert(await waitFor(cdp, `document.readyState === 'complete'`), 'la página carga completamente');
  await sleep(350);

  console.log('\nDesktop 1440x900');
  const desktop = await evaluate(cdp, `(() => { const q=s=>document.querySelector(s); const cards=[...document.querySelectorAll('#civ-grid .civ-card')]; const styles=cards.map(c=>getComputedStyle(c)); const p=q('#civpick-panel'), d=document.documentElement, b=document.body; return {w:innerWidth,h:innerHeight,cards:cards.length,opaque:styles.every(s=>s.opacity!=='0'), docOverflow:b.scrollWidth<=b.clientWidth+1 && (d.scrollWidth<=d.clientWidth+1 || getComputedStyle(d).overflowX==='hidden'), panelOverflow:p.scrollWidth<=p.clientWidth+1, pick:q('#civpick')?.classList.contains('show'), meta:!!document.querySelector('meta[name="description"]')?.content, theme:!!document.querySelector('meta[name="theme-color"]')?.content, icon:!!document.querySelector('link[rel="icon"]')}; })()`);
  assert(desktop.w === 1440 && desktop.h === 900, 'viewport desktop es 1440x900');
  assert(desktop.cards === 8 && desktop.opaque, '8 civ-card renderizadas y opacas');
  assert(desktop.docOverflow && desktop.panelOverflow, 'sin overflow horizontal en documento/panel');
  assert(desktop.pick, 'pantalla de selección visible al inicio');
  assert(desktop.meta && desktop.theme && desktop.icon, 'meta description, theme-color y favicon presentes');
  for (const asset of ['assets/battle-ages-key-art.webp', 'assets/battle-ages-emblem.webp',
    'assets/pixel-units-atlas-v1.png', 'assets/pixel-buildings-atlas-v1.png', 'assets/pixel-meadow-atlas-v1.png',
    'assets/pixel-valley-background-v1.png']) {
    const response = await fetch(`${base}/${asset}`);
    assert(response.status === 200, `${asset} responde HTTP 200`);
  }

  await clickSelector(cdp, '#civ-grid .civ-card');
  assert(await waitFor(cdp, `!document.querySelector('#civpick').classList.contains('show')`), 'elegir civ oculta civpick y arranca la partida');
  assert(await evaluate(cdp, `!!window.GAME?.state?.sides?.P?.civ`), 'la partida tiene civilización del jugador');
  const pixelScene = await evaluate(cdp, `(() => {
    for(const side of ['P','E']) { GAME._setAge(side,2); for(const r of ['food','wood','gold','stone']) GAME._grant(side,r,1e6); }
    for(const side of ['P','E']) for(const k of ['farm','wood','mine','quarry']) GAME._eng(side,k,3);
    for(const k of ['store','watch','camp']) GAME._buildMeadow('P',k);
    GAME._setMeadowTarget('mine'); GAME._deployMeadow('P','saboteur','mine'); GAME._deployMeadow('P','warden','farm');
    for(let i=0;i<280;i++) GAME.update(0.05);
    const prado=document.querySelector('#prado-sec'),r=prado.getBoundingClientRect();
    return {pradoVisible:r.left<innerWidth&&r.right>0, pixelCards:[...document.querySelectorAll('.civ-card .u-sprite')].length,
      meadow:GAME._unitStates().filter(u=>u.side==='P'&&u.front==='meadow').map(u=>({type:u.type,action:u.action})),
      assets:Object.values(PIXEL_ASSETS).every(img=>img.complete&&img.naturalWidth>0)};
  })()`);
  assert(pixelScene.pradoVisible && pixelScene.pixelCards === 8, 'Prado visible y selector usa 8 sprites pixel-art');
  assert(pixelScene.assets, 'todos los atlas e imagen de mundo se decodifican');
  assert(pixelScene.meadow.some(u => u.type === 'saboteur') && pixelScene.meadow.some(u => u.type === 'warden'), 'Saboteador y Guardián se renderizan en el Prado');
  const desktopShot = await capture(cdp, 'qa-desktop-pixel.png');
  console.log('  captura desktop:', desktopShot);
  const stress = await evaluate(cdp, `(() => {
    const SIDE_CAP = 42;
    const mix = [['lancer',0],['archer',1],['crossbow',2],['handcan',3],['scout',1],['knight',2],['elite',3],['mangonel',2],['bombard',3]];
    const finite = v => typeof v === 'number' ? Number.isFinite(v)
      : Array.isArray(v) ? v.every(finite)
      : v && typeof v === 'object' ? Object.values(v).every(finite) : true;
    GAME._startMatch('english','french');
    GAME.state.sides.P.castleHp = 1e9;
    GAME.state.sides.E.castleHp = 1e9;
    const placed = {P:0,E:0};
    for (const side of ['P','E']) {
      for (let i=0; i<SIDE_CAP; i++) {
        const [type,age] = mix[i % mix.length];
        GAME._setAge(side, age);
        const x = side === 'P' ? 40 + i : 1400 - i;
        if (GAME._place(side, type, x)) placed[side]++;
      }
      GAME._setAge(side, 3);
    }
    const before = performance.now();
    for (let i=0; i<300; i++) GAME.update(1/60);
    const totalMs = performance.now() - before;
    const probe = typeof GAME.probe === 'function' ? GAME.probe() : {};
    return { totalMs, msPerTick: totalMs / 300, placed, units: GAME.state.units.length,
      over: GAME.state.over, finite: finite({totalMs, probe, placed, units: GAME.state.units.length}) };
  })()`);
  console.log(`  stress 300 GAME.update: total ${stress.totalMs.toFixed(2)} ms; ${stress.msPerTick.toFixed(3)} ms/tick; unidades P/E ${stress.placed.P}/${stress.placed.E}`);
  assert(stress.placed.P > 0 && stress.placed.P <= 42 && stress.placed.E > 0 && stress.placed.E <= 42, 'stress coloca unidades mezcladas respetando SIDE_CAP');
  assert(stress.finite && Number.isFinite(stress.totalMs) && Number.isFinite(stress.msPerTick) && stress.msPerTick <= 16.7, 'stress de rendimiento finito y promedio <=16.7 ms/tick');
  await key(cdp, 'p');
  assert(await waitFor(cdp, `document.querySelector('#pause-overlay').classList.contains('show')`), 'tecla P abre pausa');
  const paused = await evaluate(cdp, `({paused:window.GAME.isPaused(),focus:document.activeElement?.id})`);
  assert(paused.paused && paused.focus === 'resume-btn', 'pausa activa GAME.isPaused y enfoca Continuar');
  await key(cdp, 'p');
  assert(await waitFor(cdp, `!document.querySelector('#pause-overlay').classList.contains('show') && !window.GAME.isPaused()`), 'tecla P reanuda la partida');
  await evaluate(cdp, `document.querySelector('#pausebtn').focus(); true`);
  const focusBeforeCodex = await evaluate(cdp, `document.activeElement?.id || ''`);
  await key(cdp, 'c');
  assert(await waitFor(cdp, `document.querySelector('#codex').classList.contains('show')`), 'tecla C abre Codex');
  assert(await evaluate(cdp, `document.querySelector('#codex').contains(document.activeElement)`), 'foco queda dentro del Codex');
  await key(cdp, 'Escape');
  assert(await waitFor(cdp, `!document.querySelector('#codex').classList.contains('show')`), 'Escape cierra Codex');
  const focusAfterCodex = await evaluate(cdp, `document.activeElement?.id || ''`);
  console.log('  foco antes/después Codex:', JSON.stringify({ before: focusBeforeCodex, after: focusAfterCodex }));
  assert(focusAfterCodex === focusBeforeCodex, 'Escape restaura el foco previo');

  console.log('\nMobile 500x844');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 500, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Page.reload', { ignoreCache: true });
  assert(await waitFor(cdp, `document.readyState === 'complete'`), 'reload mobile completa');
  await sleep(250);
  const mobile = await evaluate(cdp, `(() => { const d=document.documentElement,b=document.body,p=document.querySelector('#civpick-panel'),dock=document.querySelector('#dock'); const cards=[...document.querySelectorAll('#civ-grid .civ-card')]; const targets=[...document.querySelectorAll('.btn,.civ-card')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}); return {w:innerWidth,h:innerHeight,cards:cards.length,docOverflow:d.scrollWidth<=d.clientWidth+1&&b.scrollWidth<=b.clientWidth+1,panel:p.scrollWidth<=p.clientWidth+1,panelWidth:p.getBoundingClientRect().width,targets:targets.length>0&&targets.every(e=>{const r=e.getBoundingClientRect();return r.width>=40&&r.height>=40}),dockOverflow:dock.scrollWidth>dock.clientWidth,dockTouch:getComputedStyle(dock).touchAction}; })()`);
  assert(mobile.w === 500 && mobile.h === 844, 'viewport mobile es 500x844');
  assert(mobile.cards === 8, 'mobile renderiza 8 civ-card');
  assert(mobile.docOverflow && mobile.panel && mobile.panelWidth <= 500, 'mobile sin overflow horizontal y panel cabe');
  assert(mobile.targets, 'targets principales móviles miden al menos 40px');
  assert(mobile.dockOverflow && mobile.dockTouch.includes('pan-x'), 'dock móvil tiene overflow horizontal y touch-action pan-x');
  await clickSelector(cdp, '#civ-grid .civ-card');
  assert(await waitFor(cdp, `!document.querySelector('#civpick').classList.contains('show')`), 'mobile inicia partida desde selector');
  const mobileShot = await capture(cdp, 'qa-mobile-pixel.png');
  console.log('  captura mobile:', mobileShot);

  const projectFailures = loadingFailures.filter(p => !p.url || p.url.startsWith(base));
  assert(projectFailures.length === 0, `sin Network.loadingFailed de recursos del proyecto (${projectFailures.length})`);
  assert(exceptions.length === 0, `sin excepciones JavaScript (${exceptions.length})`);
  assert(consoleErrors.length === 0, `sin console errors (${consoleErrors.length})`);
  console.log(`\n=== BROWSER QA PASSED === (${Date.now() - startedAt} ms)`);
  cdp.close();
}

async function cleanup() {
  if (chrome && !chrome.killed) { try { chrome.kill(); } catch (_) {} }
  if (server) await new Promise(resolve => server.close(() => resolve()));
  if (profileDir) { try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {} }
}

main().catch(err => {
  console.error(`\nBROWSER QA FAILED: ${err.message}`);
  if (err.stack) console.error(err.stack.split('\n').slice(1, 3).join('\n'));
  process.exitCode = 1;
}).finally(cleanup);
