/* Verificación en DOM real (jsdom): carga index.html y ejercita el juego con
   eventos reales de usuario (click, teclado). Abre el Codex desde el botón
   de selección de civ, recorre sus 4 pestañas y juega una partida hasta el
   final sin excepciones. Uso:
     node tools/dom-test.js   → PASS/FAIL con detalle
*/
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const grad = { addColorStop() {} };
const canvasCtx = () => new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 12 });
    if (p === 'canvas') return { width: 960, height: 600 };
    if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad;
    return () => {};
  },
  set() { return true; },
});

const dom = new JSDOM(HTML, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => canvasCtx();
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
    window.cancelAnimationFrame = clearTimeout;
  },
});

const { window } = dom;
let errors = [];
window.addEventListener('error', e => errors.push('window error: ' + e.message));

try {
  window.eval(HTML.match(/<script>([\s\S]*?)<\/script>/)[1]);
} catch (e) {
  console.error('FATAL: error al cargar el script:', e.message);
  console.error(e.stack);
  process.exit(1);
}

const doc = window.document;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); return cond; };
const fire = (el, type, opts) => {
  const ev = new window.MouseEvent(type, opts || { bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
};
const key = (k) => {
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
};
let pass = true;

pass = ok(!!window.GAME, 'API global GAME expuesta') && pass;

// --- Codex desde la pantalla de selección de casa ---
const civPickBtn = doc.getElementById('codexbtn-civpick');
pass = ok(!!civPickBtn, 'botón Codex en pantalla de civ existe') && pass;
fire(civPickBtn, 'click');
const codexOpen1 = (doc.getElementById('codex').className || '').indexOf('show') >= 0;
pass = ok(codexOpen1, 'clic en botón abre el Codex') && pass;

const tabBtns = doc.getElementById('codex-tabs').children;
pass = ok(tabBtns.length === 4, 'Codex tiene 4 pestañas (tiene ' + tabBtns.length + ')') && pass;
const labels = [];
for (const b of tabBtns) labels.push((b.textContent || '').trim());
pass = ok(labels.length === 4, 'pestañas: ' + labels.join(' | ')) && pass;

const tabHtml = id => {
  fire(doc.getElementById('codex-tabs').children[id], 'click');
  return doc.getElementById('codex-body').innerHTML || '';
};
const unitsHtml = tabHtml(0);
pass = ok(unitsHtml.indexOf('Lancero') >= 0 && unitsHtml.indexOf('Caballero') >= 0, 'pestaña Unidades renderiza unidades') && pass;
const techHtml = tabHtml(1);
pass = ok(techHtml.indexOf('Edad') >= 0 && techHtml.indexOf('Forja') >= 0, 'pestaña Tecnologías renderiza edades y herrería') && pass;
const civsHtml = tabHtml(2);
pass = ok(civsHtml.indexOf('Ingleses') >= 0 && civsHtml.indexOf('Delhi') >= 0, 'pestaña Civilizaciones renderiza las 8') && pass;
const cntHtml = tabHtml(3);
pass = ok(cntHtml.length > 100, 'pestaña Contadores genera tabla') && pass;

// tecla C cierra y reabre
key('c');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') < 0, 'tecla C cierra el Codex') && pass;
key('c');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') >= 0, 'tecla C reabre el Codex') && pass;
key('Escape');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') < 0, 'tecla Escape cierra el Codex') && pass;

// --- partida en DOM real ---
const game = window.GAME;
game.setDifficulty(0);
game._startMatch('english', 'french');
let probe = null;
for (let i = 0; i < 40000; i++) {
  try {
    game.update(0.05);
    probe = game.probe();
  } catch (e) { errors.push('tick: ' + e.message); break; }
  if (probe.over) break;
}
pass = ok(probe && probe.t > 0, 'partida avanza en DOM real (t=' + (probe ? probe.t.toFixed(0) : '?') + 's)') && pass;
pass = ok(probe && probe.over, 'partida llega a game over en DOM real') && pass;

// música y sonido seguros sin AudioContext
let sndOk = true;
try { window.GAME._startMatch('mongols', 'delhi'); window.GAME.update(0.05); } catch (e) { sndOk = false; errors.push('mus: ' + e.message); }
pass = ok(sndOk, 'arranque con música/SFX no lanza excepción sin AudioContext') && pass;

pass = ok(errors.length === 0, 'cero errores capturados en el DOM (' + (errors.length || '0') + ')') && pass;
if (errors.length) for (const e of errors) console.log('       -> ' + e);

console.log(errors.length === 0 && pass ? '=== DOM TEST PASSED ===' : '=== DOM TEST FAILED ===');
process.exit(pass ? 0 : 1);
