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

// Contratos de regresión para accesibilidad, arte y controles esenciales
const civCards = [...doc.querySelectorAll('#civ-grid .civ-card')];
pass = ok(civCards.length === 8 && civCards.every(c => c.tagName === 'BUTTON' && c.type === 'button' && c.getAttribute('aria-label')), '8 civilizaciones son botones accesibles') && pass;
for (const id of ['overlay','civpick','codex','pause-overlay']) {
  const d = doc.getElementById(id);
  pass = ok(d && d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && d.hasAttribute('aria-labelledby'), id + ' tiene contrato dialog') && pass;
}
pass = ok(doc.getElementById('toast').getAttribute('aria-live') === 'polite' && doc.getElementById('herald').getAttribute('aria-live') === 'polite', 'toast/heraldo anuncian cambios') && pass;
pass = ok(doc.getElementById('cv').getAttribute('role') === 'img' && doc.getElementById('cv').getAttribute('aria-label'), 'canvas tiene rol y nombre accesible') && pass;
pass = ok(doc.querySelector('meta[name="description"]') && doc.querySelector('meta[name="theme-color"]') && doc.querySelector('link[rel="icon"][href="assets/battle-ages-emblem.webp"]'), 'metadatos y favicon de identidad presentes') && pass;
pass = ok((doc.getElementById('cv').textContent || '').indexOf('canvas') >= 0, 'canvas incluye fallback textual') && pass;
pass = ok(fs.existsSync(path.join(ROOT, 'assets', 'battle-ages-key-art.webp')) && fs.existsSync(path.join(ROOT, 'assets', 'battle-ages-emblem.webp')) && /battle-ages-key-art\.webp/.test(HTML) && /battle-ages-emblem\.webp/.test(HTML), 'assets originales referenciados y presentes') && pass;
pass = ok(['pixel-units-atlas-v1.png','pixel-buildings-atlas-v1.png','pixel-meadow-atlas-v1.png','pixel-valley-background-v1.png'].every(f => fs.existsSync(path.join(ROOT, 'assets', f))) && /pixel-units-atlas-v1\.png/.test(HTML) && /pixel-valley-background-v1\.png/.test(HTML), 'atlas y paisaje pixel-art originales presentes y conectados') && pass;
const diffBtns = [...doc.querySelectorAll('#diff-btns .diff-btn')];
pass = ok(diffBtns.length === 4 && diffBtns.every(b => b.hasAttribute('aria-pressed')), 'dificultad expone aria-pressed') && pass;

// --- Codex desde la pantalla de selección de casa ---
const civPickBtn = doc.getElementById('codexbtn-civpick');
pass = ok(!!civPickBtn, 'botón Codex en pantalla de civ existe') && pass;
civPickBtn.focus();
fire(civPickBtn, 'click');
const codexOpen1 = (doc.getElementById('codex').className || '').indexOf('show') >= 0;
pass = ok(codexOpen1, 'clic en botón abre el Codex') && pass;
pass = ok(doc.activeElement && doc.activeElement.id === 'codex-x', 'abrir Codex enfoca su cierre') && pass;

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
pass = ok(unitsHtml.indexOf('Lancero') >= 0 && unitsHtml.indexOf('Caballero') >= 0 && unitsHtml.indexOf('Saboteador') >= 0, 'pestaña Unidades renderiza ejército y frente del Prado') && pass;
const techHtml = tabHtml(1);
pass = ok(techHtml.indexOf('Edad') >= 0 && techHtml.indexOf('Forja') >= 0 && techHtml.indexOf('segundo frente') >= 0, 'pestaña Tecnologías documenta edades, herrería y Prado') && pass;
const civsHtml = tabHtml(2);
pass = ok(civsHtml.indexOf('Ingleses') >= 0 && civsHtml.indexOf('Delhi') >= 0, 'pestaña Civilizaciones renderiza las 8') && pass;
const cntHtml = tabHtml(3);
pass = ok(cntHtml.length > 100, 'pestaña Contadores genera tabla') && pass;

// trampa de foco básica dentro del Codex
doc.getElementById('codex-x').focus();
key('Tab');
pass = ok(doc.activeElement === doc.getElementById('codex-tabs').children[0], 'Tab avanza al primer control del Codex') && pass;
key('Tab');
pass = ok(doc.activeElement === doc.getElementById('codex-tabs').children[1], 'Tab recorre las pestañas del Codex') && pass;
key('Tab');
key('Tab');
key('Tab');
pass = ok(doc.activeElement && doc.activeElement.id === 'codex-x', 'Tab cíclico vuelve al cierre del Codex') && pass;

// tecla C cierra y reabre
key('c');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') < 0, 'tecla C cierra el Codex') && pass;
key('c');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') >= 0, 'tecla C reabre el Codex') && pass;
key('Escape');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') < 0, 'tecla Escape cierra el Codex') && pass;
pass = ok(doc.activeElement && doc.activeElement.id === 'codexbtn-civpick', 'cerrar Codex restaura el foco al invocador') && pass;

// --- partida en DOM real ---
const game = window.GAME;
game.setDifficulty(0);
game._startMatch('english', 'french');
doc.getElementById('pausebtn').focus();
key('p');
pass = ok(game.isPaused && game.isPaused() === true && doc.getElementById('pause-overlay').getAttribute('aria-hidden') === 'false', 'tecla P pausa y abre overlay accesible') && pass;
pass = ok(doc.activeElement && doc.activeElement.id === 'resume-btn', 'pausar enfoca Continuar') && pass;
// El Codex no puede competir con el diálogo de pausa; P/Escape reanudan.
key('c');
pass = ok(game.isPaused() === true && doc.getElementById('pause-overlay').getAttribute('aria-hidden') === 'false', 'tecla C no cierra la pausa') && pass;
pass = ok((doc.getElementById('codex').className || '').indexOf('show') < 0, 'tecla C no abre el Codex durante la pausa') && pass;
pass = ok(doc.activeElement && doc.activeElement.id === 'resume-btn', 'pausa conserva el foco en Continuar tras C') && pass;
key('p');
pass = ok(game.isPaused() === false && doc.getElementById('pause-overlay').getAttribute('aria-hidden') === 'true', 'tecla P reanuda la partida') && pass;
key('c');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') >= 0, 'tecla C abre el Codex tras reanudar') && pass;
key('Escape');
pass = ok((doc.getElementById('codex').className || '').indexOf('show') < 0, 'Escape cierra el Codex tras reanudar') && pass;
key('p');
pass = ok(game.isPaused() === true, 'pausa vuelve a activarse para probar Escape') && pass;
key('Escape');
pass = ok(game.isPaused() === false && doc.getElementById('pause-overlay').getAttribute('aria-hidden') === 'true', 'tecla Escape reanuda la partida') && pass;
fire(doc.getElementById('resume-btn'), 'click');
pass = ok(game.isPaused() === false && doc.getElementById('pause-overlay').getAttribute('aria-hidden') === 'true', 'botón Continuar reanuda la partida') && pass;
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
for (let i = 0; i < 25; i++) game.update(0.05);
const endOverlay = doc.getElementById('overlay');
pass = ok((endOverlay.className || '').indexOf('show') >= 0 && endOverlay.getAttribute('aria-hidden') === 'false', 'game over abre el resumen accesible tras la transición') && pass;
pass = ok(doc.activeElement && doc.activeElement.id === 'btn-restart', 'game over enfoca Luchar de nuevo') && pass;

// aria-disabled refleja estados visuales sin usar disabled nativo
game._startMatch('english', 'french');
game.update(0.2);
const ageBtnA11y = doc.getElementById('agebtn');
pass = ok(ageBtnA11y.getAttribute('aria-disabled') === 'true' && !ageBtnA11y.disabled, 'control no asequible expone aria-disabled sin disabled nativo') && pass;
game._grant('P', 'food', 1e6); game._grant('P', 'gold', 1e6);
game.update(0.2);
pass = ok(ageBtnA11y.getAttribute('aria-disabled') === 'false', 'aria-disabled desaparece al conceder recursos') && pass;

// --- formaciones: botón, ciclo y API ---
game._startMatch('english', 'french'); // partida fresca: el ciclo se bloquea tras game over
const formBtn = doc.getElementById('formbtn');
const formLbl = doc.getElementById('formlbl');
pass = ok(!!formBtn && !!formLbl, 'botón y etiqueta de formación existen') && pass;
fire(formBtn, 'click');
pass = ok(game.getForm() === 1, 'clic en formación pasa a Línea (form=' + game.getForm() + ')') && pass;
game.setForm(2);
pass = ok(game.getForm() === 2, 'setForm(2) aplica Horda') && pass;
game.cycleForm();
pass = ok(game.getForm() === 3, 'cycleForm avanza a Flanco (form=' + game.getForm() + ')') && pass;
game.cycleForm();
pass = ok(game.getForm() === 0, 'cycleForm vuelve a Libre') && pass;
pass = ok((formBtn.className || '').indexOf('on') < 0, 'botón Libre sin clase on') && pass;
game.setForm(1);
pass = ok((formBtn.className || '').indexOf('on') >= 0, 'botón Línea con clase on') && pass;
pass = ok((formLbl.textContent || '').indexOf('Línea') >= 0, 'etiqueta muestra Línea') && pass;

// --- defensa: botones B/N presentes y funcionales en DOM real ---
game._startMatch('english', 'french');
game._grant('P', 'stone', 1e6);
const wallBtn = doc.getElementById('def-wall').querySelector('.buy');
const towerBtn = doc.getElementById('def-tower').querySelector('.buy');
pass = ok(!!wallBtn && !!towerBtn, 'botones de Muralla y Torre existen') && pass;
fire(wallBtn, 'click');
pass = ok(game._def('P').wall.lvl >= 1, 'clic construye la muralla') && pass;
fire(towerBtn, 'click');
pass = ok(game._def('P').towers.length >= 1, 'clic construye la torre') && pass;

// --- tecnología única: botón T presente y funcional en DOM real ---
game._startMatch('english', 'french');
const techBtn = doc.getElementById('tech-btn');
pass = ok(!!techBtn, 'botón de Tecnología Única existe') && pass;
game._setAge('P', 2);
game._grant('P', 'wood', 1e6);
game._grant('P', 'gold', 1e6);
fire(techBtn, 'click');
pass = ok(game._tech('P').done, 'clic investiga la tecnología única') && pass;
fire(techBtn, 'click');
pass = ok(game._tech('P').done, 'tecla/clic no investiga dos veces') && pass;

// --- maravilla: botón U presente y funcional en DOM real ---
game._startMatch('english', 'french');
const wonderBtn = doc.getElementById('wonder-btn');
pass = ok(!!wonderBtn, 'botón de Maravilla existe') && pass;
game._setAge('P', 1);
game._grant('P', 'food', 1e6);
game._grant('P', 'wood', 1e6);
game._grant('P', 'gold', 1e6);
game._grant('P', 'stone', 1e6);
fire(wonderBtn, 'click');
pass = ok(!game._wonder('P').built, 'clic no construye la maravilla antes de la edad 3') && pass;
game._setAge('P', 3);
fire(wonderBtn, 'click');
pass = ok(game._wonder('P').built, 'clic construye la maravilla en edad 3') && pass;
fire(wonderBtn, 'click');
pass = ok(game._wonder('P').hp > 0, 'clic no construye la maravilla dos veces') && pass;

// --- El Prado: construcción, objetivo, despliegue y animación visible ---
game._startMatch('english', 'french');
game._setAge('P', 2);
for (const r of ['food','wood','gold','stone']) game._grant('P', r, 1e6);
const storeBtn = doc.getElementById('prado-store');
const watchBtn = doc.getElementById('prado-watch');
const campBtn = doc.getElementById('prado-camp');
const raidBtn = doc.getElementById('prado-raider');
const guardBtn = doc.getElementById('prado-warden');
pass = ok([storeBtn, watchBtn, campBtn, raidBtn, guardBtn].every(Boolean), 'cinco controles del Prado existen') && pass;
fire(storeBtn, 'click'); fire(watchBtn, 'click'); fire(campBtn, 'click');
pass = ok(game._meadow('P').store === 1 && game._meadow('P').watch === 1 && game._meadow('P').camp === 1, 'clic levanta Almacén, Vigía y Campamento') && pass;
const quarryTarget = doc.querySelector('[data-prado-target="quarry"]');
fire(quarryTarget, 'click');
pass = ok(game._meadow('P').target === 'quarry' && quarryTarget.getAttribute('aria-pressed') === 'true', 'objetivo de incursión seleccionable y accesible') && pass;
fire(raidBtn, 'click'); fire(guardBtn, 'click');
for (let i = 0; i < 300; i++) game.update(0.05);
let meadowUnits = game._unitStates().filter(u => u.side === 'P' && u.front === 'meadow');
pass = ok(meadowUnits.some(u => u.type === 'saboteur' && u.target === 'quarry') && meadowUnits.some(u => u.type === 'warden'), 'Saboteador y Guardián llegan al frente del Prado') && pass;
const beforeMove = meadowUnits.map(u => u.x);
for (let i = 0; i < 20; i++) game.update(0.05);
meadowUnits = game._unitStates().filter(u => u.side === 'P' && u.front === 'meadow');
pass = ok(meadowUnits.some((u, i) => Math.abs(u.x - beforeMove[i]) > 0.5 || ['walk','work','guard','attack'].includes(u.action)), 'unidades del Prado exponen movimiento/trabajo/guardia animados') && pass;

// --- Regla visual de edificios: antorcha salvo máquinas de asedio ---
game._startMatch('english', 'french');
const lancer = game._place('P', 'lancer', 500);
game._attackCastle(lancer);
pass = ok(game._projectiles().torches === 1 && lancer.action === 'torch', 'infantería ataca edificios con antorcha') && pass;
game._startMatch('english', 'french');
const bombard = game._place('P', 'bombard', 500);
game._attackCastle(bombard);
pass = ok(game._projectiles().torches === 0 && game._projectiles().arrows === 1, 'máquina de asedio usa proyectil, nunca antorcha') && pass;

// --- música y sonido seguros sin AudioContext ---
let sndOk = true;
try { window.GAME._startMatch('mongols', 'delhi'); window.GAME.update(0.05); } catch (e) { sndOk = false; errors.push('mus: ' + e.message); }
pass = ok(sndOk, 'arranque con música/SFX no lanza excepción sin AudioContext') && pass;

pass = ok(errors.length === 0, 'cero errores capturados en el DOM (' + (errors.length || '0') + ')') && pass;
if (errors.length) for (const e of errors) console.log('       -> ' + e);

console.log(errors.length === 0 && pass ? '=== DOM TEST PASSED ===' : '=== DOM TEST FAILED ===');
process.exit(pass ? 0 : 1);
