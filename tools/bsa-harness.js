/* Arnés headless de BattleSide Ages
   Ejecuta index.html en un sandbox con DOM falso y dirige partidas completas
   contra la API global GAME. Comandos:
     node tools/bsa-harness.js smoke               una partida, valida finitos
     node tools/bsa-harness.js diffcheck [N]       N partidas/dificultad (def 6)
     node tools/bsa-harness.js autoplay [pCiv eCiv]  una partida jugada por la IA (traza final)
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO SCRIPT FOUND'); process.exit(1); }
const CODE = m[1];

/* ---------- stubs de DOM ---------- */
function makeClassList(init) {
  const set = new Set(init || []);
  return {
    add: c => set.add(c),
    remove: c => set.delete(c),
    toggle: (c, force) => { if (force === undefined) { if (set.has(c)) { set.delete(c); return false; } set.add(c); return true; } force ? set.add(c) : set.delete(c); return !!force; },
    contains: c => set.has(c),
  };
}
function ctxProxy() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 12 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient' || p === 'createPattern') return () => grad;
      if (p === 'canvas') return { width: 960, height: 600 };
      return () => {};
    },
    set() { return true; },
  });
}
function makeEl(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    classList: makeClassList(),
    style: { setProperty() {}, getPropertyValue: () => '' },
    dataset: {},
    _innerHTML: '', _text: '',
    children: [],
    value: '0',
    set innerHTML(v) { this._innerHTML = String(v); },
    get innerHTML() { return this._innerHTML; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    querySelector() { return makeEl('span'); },
    querySelectorAll() { return []; },
    getContext() { return ctxProxy(); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 960, height: 600 }; },
    focus() {}, blur() {}, setAttribute() {}, getAttribute() { return null; },
    scrollTo() {},
  };
  return el;
}
const doc = {
  getElementById: () => makeEl('div'),
  createElement: t => makeEl(t),
  createElementNS: () => makeEl('svg'),
};
const sandbox = {
  console, Math, Date, JSON, isNaN,
  performance: globalThis.performance,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
  document: doc,
  innerWidth: 960, innerHeight: 600,
  devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox, { timeout: 60000 });
const GAME = sandbox.GAME;
if (!GAME) { console.error('GAME API NOT EXPOSED'); process.exit(1); }

/* ---------- helpers de partida ---------- */
const CIVS = ['english', 'french', 'mongols', 'hre', 'chinese', 'ottomans', 'rus', 'delhi'];

/* Bot P competente: refleja la estrategia de la IA del juego pero jugando
   por el lado humano con sus propias decisiones (entrenar, motores, edad,
   mejoras). Convierte el diffcheck en una medida real de balance. */
function makePBot() {
  const b = { think: 0.4, engT: 0, upgT: 0 };
  return function pBotTick(dt) {
    const st = GAME.state;
    if (!st || st.over) return;
    const P = st.sides.P, E = st.sides.E;
    const D = GAME.constData();
    b.think -= dt;
    b.engT -= dt;
    b.upgT -= dt;
    if (b.think > 0) return;
    b.think = 0.5;
    const ageCost = P.age < 3 ? D.AGES[P.age + 1].cost : null;
    const reserve = { food: 0, wood: 0, gold: 0 };
    if (ageCost && P.age >= 0 && st.t > 30) for (const k in ageCost) reserve[k] = ageCost[k];
    // 1) edad: subir en cuanto haya dinero y algo de colchón
    if (!P.aging && P.age < 3) {
      let ok = true;
      for (const k in ageCost) if (P.res[k] < ageCost[k] + 60) { ok = false; break; }
      if (ok) GAME.ageUp();
    }
    // 2) economía: refuerza el motor más atrasado sin pisar la reserva
    if (b.engT <= 0) {
      b.engT = 2.0;
      const w = { farm: 1.0, wood: 0.85, mine: 0.95 };
      let best = null, bs = 1e9;
      for (const k in D.ENGINES) {
        if (P.eng[k] >= 8) continue;
        const score = P.eng[k] / w[k];
        if (score < bs) { bs = score; best = k; }
      }
      if (best) {
        const c = D.engCost(best, P.eng[best]);
        const cr = D.ENGINES[best].costRes;
        if (P.res[cr] > c + (reserve[cr] || 0) + 40) GAME.buyEngine(best);
      }
    }
    // 3) plan de counter contra las unidades visibles del enemigo
    const roster = GAME._roster(P.civ);
    const cnt = {};
    for (const t of D.UNIT_ORDER) cnt[t] = 0;
    for (const u of st.units) {
      if (u.side !== 'E' || u.dying) continue;
      const ck = D.counterKey(u.type);
      if (cnt[ck] !== undefined) cnt[ck]++;
    }
    let top = null, tm = 0;
    for (const k in cnt) if (cnt[k] > tm) { tm = cnt[k]; top = k; }
    let plan = null;
    if (top) plan = D.civUnitFor(P.civ, D.COUNTER_OF[top]);
    if (!plan || roster.indexOf(plan) < 0) plan = roster[0];
    if (E.age >= 2 && Math.random() < 0.15) plan = 'mangonel';
    if (E.age >= 3 && Math.random() < 0.2) plan = 'bombard';
    if (P.civ != null && Math.random() < 0.35) plan = D.CIVS[P.civ].unit;
    // 4) mejoras: alternar forja/armadura sin dejar que la reserva de la edad
    //    las bloquee de forma permanente (comprar con colchón de 20, no 40)
    if (b.upgT <= 0) {
      b.upgT = 7;
      const tryOrder = P.upg.atk <= P.upg.def ? ['atk', 'def'] : ['def', 'atk'];
      for (const k of tryOrder) {
        const u = D.UPG[k], lvl = P.upg[k];
        if (lvl >= u.max || P.age < u.age[lvl]) continue;
        const cost = u.cost[lvl];
        let ok = true;
        for (const r in cost) if (P.res[r] < cost[r] + (reserve[r] || 0) + 20) { ok = false; break; }
        if (ok) { GAME.buyUpg(k); break; }
      }
    }
    // 5) entrenar sin vaciar la reserva y con tope de ejército
    const armyNow = st.units.reduce((n, u) => n + (u.side === 'P' && !u.dying ? 1 : 0), 0);
    const target = [5, 7, 9, 12][P.age];
    if (P.queue.length < 5 && armyNow < target) {
      const cost = GAME._unitCost('P', plan);
      const spare = (k) => P.res[k] - cost[k] - (reserve[k] || 0) * 0.5;
      let ok = true;
      for (const k in cost) if (spare(k) < 20) { ok = false; break; }
      if (ok) GAME.train(plan);
    }
  };
}
function runMatch(pCiv, eCiv, diff, dt) {
  const t0 = performance.now();
  GAME.setDifficulty(diff);
  GAME._startMatch(pCiv, eCiv);
  const pBot = makePBot();
  let ex = null, over = false, winner = null;
  for (let i = 0; i < 200000; i++) {
    try {
      pBot(dt);
      GAME.update(dt);
    } catch (e) { ex = e; break; }
    const p = GAME.probe();
    if (p.over) { over = true; winner = p.winner; break; }
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (typeof v === 'number' && !isFinite(v)) { ex = new Error('non-finite probe ' + k + '=' + v); break; }
    }
    if (ex) break;
  }
  return {
    over, winner, ex,
    wall: performance.now() - t0,
    t: GAME.probe().t,
    state: GAME.state ? {
      P: GAME.state.sides.P.stats, E: GAME.state.sides.E.stats,
      ages: [GAME.state.sides.P.age, GAME.state.sides.E.age],
      upgP: GAME.state.sides.P.upg, upgE: GAME.state.sides.E.upg,
    } : null,
  };
}

/* ---------- comandos ---------- */
const cmd = process.argv[2] || 'smoke';
if (cmd === 'smoke') {
  const r = runMatch('english', 'french', 1, 0.05);
  if (r.ex) { console.error('SMOKE FAILED:', r.ex); process.exit(1); }
  if (!r.over) { console.error('SMOKE FAILED: no game over'); process.exit(1); }
  console.log('[GAME OVER at t=' + r.t.toFixed(0) + 's] Winner: ' + (r.winner === 'P' ? 'Player' : 'Enemy'));
  console.log('  ✓ All probe values finite');
  console.log('=== SMOKE TEST PASSED ===');
  process.exit(0);
} else if (cmd === 'diffcheck') {
  const N = parseInt(process.argv[3] || '6', 10);
  const dt = 0.05;
  for (let diff = 0; diff < 4; diff++) {
    let eWins = 0, pWins = 0, total = 0, exc = 0, eUpg = { atk: 0, def: 0 }, pUpg = { atk: 0, def: 0 };
    for (let g = 0; g < N; g++) {
      const pc = CIVS[Math.random() * CIVS.length | 0];
      const ec = CIVS[Math.random() * CIVS.length | 0];
      const r = runMatch(pc, ec, diff, dt);
      if (r.ex) { exc++; continue; }
      total += r.t;
      if (r.winner === 'E') eWins++; else pWins++;
      if (r.state) {
        eUpg.atk += r.state.upgE.atk; eUpg.def += r.state.upgE.def;
        pUpg.atk += r.state.upgP.atk; pUpg.def += r.state.upgP.def;
      }
    }
    const names = ['Fácil', 'Normal', 'Difícil', 'Extremo'];
    console.log('--- Difficulty ' + diff + ': ' + names[diff] + ' ---');
    console.log('  E win rate: ' + (100 * eWins / N).toFixed(1) + '% (' + eWins + '/' + N + ')');
    console.log('  P win rate: ' + (100 * pWins / N).toFixed(1) + '% (' + pWins + '/' + N + ')');
    console.log('  Avg time: ' + (total / N).toFixed(1) + 's');
    console.log('  Exceptions: ' + exc);
    console.log('  Avg E upg: atk=' + (eUpg.atk / N).toFixed(2) + '  def=' + (eUpg.def / N).toFixed(2));
    console.log('  Avg P upg: atk=' + (pUpg.atk / N).toFixed(2) + '  def=' + (pUpg.def / N).toFixed(2));
  }
} else if (cmd === 'autoplay') {
  const pCiv = process.argv[3] || 'english', eCiv = process.argv[4] || 'mongols';
  const diff = parseInt(process.argv[5] || '1', 10);
  const r = runMatch(pCiv, eCiv, diff, 0.05);
  if (r.ex) { console.error('AUTOPLAY FAILED:', r.ex); process.exit(1); }
  console.log('winner:', r.winner, '| over:', r.over, '| t:', r.t.toFixed(1) + 's', '| wall:', r.wall.toFixed(0) + 'ms');
  if (r.state) {
    console.log('P stats:', JSON.stringify(r.state.P));
    console.log('E stats:', JSON.stringify(r.state.E));
    console.log('Ages P/E:', r.state.ages[0], '/', r.state.ages[1]);
  }
} else if (cmd === 'formcheck') {
  /* Verifica de forma determinista los multiplicadores y la colocación
     en línea de las formaciones, además de un combate de daño controlado. */
  const fail = m => { console.error('FORMCHECK FAILED: ' + m); process.exit(1); };
  GAME.setDifficulty(0);
  GAME._startMatch('english', 'french');
  GAME._grant('P', { food: 1e6, wood: 1e6, gold: 1e6 });
  GAME._grant('E', { food: 1e6, wood: 1e6, gold: 1e6 });
  // Libre (form 0): todo 1x
  GAME.setForm(0);
  const libre = GAME.formMul('P');
  if (libre.atk !== 1 || libre.def !== 1 || libre.splash !== 1) fail('Libre no es 1x: ' + JSON.stringify(libre));
  // Línea: defensa 0.90, splash 0.5, ataque 1x
  GAME.setForm(1);
  const line = GAME.formMul('P');
  if (line.def !== 0.90 || line.splash !== 0.5 || line.atk !== 1) fail('Línea mal: ' + JSON.stringify(line));
  // Horda: ataque 1.10, splash 1.6
  GAME.setForm(2);
  const horde = GAME.formMul('P');
  if (horde.atk !== 1.10 || horde.splash !== 1.6) fail('Horda mal: ' + JSON.stringify(horde));
  // Flanco: ataque 1.05
  GAME.setForm(3);
  const flank = GAME.formMul('P');
  if (flank.atk !== 1.05) fail('Flanco mal: ' + JSON.stringify(flank));
  // colocación en Línea: fy uniformemente espaciado y se reajusta en vivo
  GAME.setForm(1);
  const placed = [];
  for (let s = 0; s < 8; s++) placed.push(GAME._place('P', 'lancer', 100 + s * 30));
  GAME.update(0.05); // el frente se reajusta en vivo con el ejército actual
  const fys = placed.map(u => u.fy).sort((a, b) => a - b);
  const span = fys[fys.length - 1] - fys[0];
  const step = span / (fys.length - 1);
  for (let i = 1; i < fys.length; i++) {
    if (Math.abs((fys[i] - fys[i - 1]) - step) > 0.75) fail('espaciado de Línea irregular en ' + fys[i].toFixed(1));
  }
  // daño real vía damageUnit (víctima P, cuya doctrina manda): Libre descuenta raw*defMul
  const raw = 40, defMul = 1 - GAME.constData().UPG.def.step * GAME.state.sides.P.upg.def;
  GAME.setForm(0);
  const base = Math.max(1, Math.round(raw * defMul));
  const freeHit = GAME._hit('P', raw, false);
  if (freeHit !== base) fail('daño Libre mal: esperado ' + base + ', real ' + freeHit);
  // Línea: la misma víctima recibe 0.90 de ese daño base
  GAME.setForm(1);
  const lineHit = GAME._hit('P', raw, false);
  if (lineHit !== Math.max(1, Math.round(base * 0.90))) fail('daño Línea mal: esperado ' + Math.max(1, Math.round(base * 0.90)) + ', real ' + lineHit);
  // Horda vs splash: la víctima en horda recibe 1.6x del daño de área
  GAME.setForm(2);
  const hordeHit = GAME._hit('P', raw, true);
  if (hordeHit !== Math.max(1, Math.round(raw * defMul * 1 * 1.6))) fail('daño Horda-splash mal: esperado ' + Math.max(1, Math.round(raw * defMul * 1.6)) + ', real ' + hordeHit);
  // Flanco sin splash: defensa 1x, daño idéntico a Libre
  GAME.setForm(3);
  const flankHit = GAME._hit('P', raw, false);
  if (flankHit !== base) fail('daño Flanco mal: esperado ' + base + ', real ' + flankHit);
  console.log('  ✓ Libre=1x, Línea def 0.90/splash 0.5, Horda atk 1.10/splash 1.6, Flanco atk 1.05');
  console.log('  ✓ espaciado uniforme en Línea (' + fys.length + ' tropas, paso ' + step.toFixed(2) + ')');
  console.log('  ✓ damageUnit aplica defensa de formación (Libre=' + freeHit + ', Línea=' + lineHit + ', Horda-splash=' + hordeHit + ')');
  console.log('=== FORMCHECK PASSED ===');
  process.exit(0);
} else {
  console.error('comando desconocido: ' + cmd);
  process.exit(1);
}
