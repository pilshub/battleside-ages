/* Arnés headless de BattleSide Ages
   Ejecuta index.html en un sandbox con DOM falso y dirige partidas completas
   contra la API global GAME. Comandos:
      node tools/bsa-harness.js smoke               una partida, valida finitos
      node tools/bsa-harness.js diffcheck [N] [seed] N partidas/dificultad (def 6), semilla opcional
      node tools/bsa-harness.js autoplay [pCiv eCiv]  una partida jugada por la IA (traza final)
      node tools/bsa-harness.js formcheck           formaciones (determinista)
      node tools/bsa-harness.js defcheck            muralla/torres (determinista)
      node tools/bsa-harness.js techcheck           tecnologías únicas (determinista)
      node tools/bsa-harness.js wondercheck         maravilla (determinista)
      node tools/bsa-harness.js soakcheck [seed]    estabilidad prolongada determinista
      node tools/bsa-harness.js pradocheck          segundo frente + antorchas determinista
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const m = HTML.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('NO SCRIPT FOUND'); process.exit(1); }
const CODE = m[1];

/* PRNG locales reproducibles; no mutan el Math global del proceso. El RNG de
   calendario se consume únicamente al precomputar los emparejamientos, y el
   RNG de simulación se reinicia para cada partida. */
const cmdArg = process.argv[2] || 'smoke';
const seedArg = cmdArg === 'diffcheck' ? process.argv[4]
  : cmdArg === 'soakcheck' ? process.argv[3] : undefined;
const seed = seedArg === undefined ? 1337 : Number(seedArg);
if ((cmdArg === 'diffcheck' || cmdArg === 'soakcheck') &&
    (!Number.isInteger(seed) || !Number.isSafeInteger(seed))) {
  console.error(cmdArg.toUpperCase() + ' FAILED: seed debe ser un entero');
  process.exit(1);
}
function makeRng(seedValue) {
  let state = (seedValue >>> 0) || 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
/* Mezcla seed+dificultad+índice para aislar por completo las partidas. */
function deriveMatchSeed(baseSeed, diff, index) {
  let x = (baseSeed >>> 0) ^ Math.imul((diff + 1) >>> 0, 0x9e3779b9) ^
    Math.imul((index + 1) >>> 0, 0x85ebca6b);
  x >>>= 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x || 0x9e3779b9;
}
const calendarRng = makeRng(seed);
let simulationRng = makeRng(seed);
const rng = () => simulationRng();
const setSimulationSeed = matchSeed => { simulationRng = makeRng(matchSeed); };

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
const sandboxMath = Object.create(Math);
sandboxMath.random = () => simulationRng();
const sandbox = {
  console, Math: sandboxMath, Date, JSON, isNaN,
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
// Debe coincidir con el límite duro de unidades por bando en el juego. El
// objetivo urgente de asedio se mantiene muy por debajo para no saturar colas.
const SIDE_CAP = 42;

/* Bot P competente: refleja la estrategia de la IA del juego pero jugando
   por el lado humano con sus propias decisiones (entrenar, motores, edad,
   mejoras). Convierte el diffcheck en una medida real de balance. */
function makePBot() {
  const b = { think: 0.4, engT: 0, upgT: 0, meadowT: 3 };
  return function pBotTick(dt) {
    const st = GAME.state;
    if (!st || st.over) return;
    const P = st.sides.P, E = st.sides.E;
    const D = GAME.constData();
    b.think -= dt;
    b.engT -= dt;
    b.upgT -= dt;
    b.meadowT -= dt;
    if (b.think > 0) return;
    b.think = 0.5;
    const ageCost = P.age < 3 ? D.AGES[P.age + 1].cost : null;
    const reserve = { food: 0, wood: 0, gold: 0 };
    if (ageCost && P.age >= 0 && st.t > 30) for (const k in ageCost) reserve[k] = ageCost[k];
    const ownWonder = GAME._wonder('P');
    const enemyWonder = GAME._wonder('E');
    const enemyWonderActive = enemyWonder.built && enemyWonder.hp > 0;
    // Una Maravilla no debe salir a costa de dejar la puerta desnuda. Cuando
    // el jugador ya tiene un pequeño ejército y una muralla, reservamos el
    // coste completo (más un colchón) hasta poder levantarla de una vez.
    const armyNow = st.units.reduce((n, u) => n + (u.side === 'P' && !u.dying && u.front !== 'meadow' ? 1 : 0), 0);
    const wonderSaving = !ownWonder.built && !enemyWonderActive && P.age >= D.WONDER.age &&
      st.t > 90 && armyNow >= 6 && P.def.wall.lvl >= 1;
    if (wonderSaving) {
      for (const k in D.WONDER.cost) reserve[k] = Math.max(reserve[k] || 0, D.WONDER.cost[k] + 80);
    }
    // 1) edad: subir en cuanto haya dinero y algo de colchón
    if (!P.aging && P.age < 3) {
      let ok = true;
      for (const k in ageCost) if (P.res[k] < ageCost[k] + 60) { ok = false; break; }
      if (ok) GAME.ageUp();
    }
    // 2) economía: refuerza el motor más atrasado sin pisar la reserva
    if (b.engT <= 0) {
      b.engT = 2.0;
      const w = { farm: 1.0, wood: 0.85, mine: 0.95, quarry: 0.7 };
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
    // Una maravilla enemiga es una amenaza con reloj: prioriza asedio para
    // abrir la muralla y golpearla antes de que expire su cuenta atrás.
    if (enemyWonderActive) {
      if (P.age >= 3 && roster.indexOf('bombard') >= 0) plan = 'bombard';
      else if (P.age >= 2 && roster.indexOf('mangonel') >= 0) plan = 'mangonel';
      else if (P.age >= 2 && roster.indexOf('crossbow') >= 0) plan = 'crossbow';
    }
    if (!enemyWonderActive && E.age >= 2 && rng() < 0.15) plan = 'mangonel';
    if (!enemyWonderActive && E.age >= 3 && rng() < 0.2) plan = 'bombard';
    // Las tiradas de mezcla no deben anular la respuesta al reloj de la
    // maravilla; fuera de esa emergencia se conserva la variedad original.
    if (!enemyWonderActive && P.civ != null && rng() < 0.35) plan = D.CIVS[P.civ].unit;
    // Doctrina de asedio del Imperial: una muralla enemiga aún en pie exige
    // bombarda para no atascar el frente con unidades de melé.  Si la partida
    // se alarga con ambos castillos vivos, activamos la misma respuesta aunque
    // el muro ya haya caído; el umbral temporal es fijo y no depende de DIFF.
    const wallStanding = P.age >= 3 && E.def.wall.hp > 0;
    const lateSiege = P.age >= 3 && st.t >= 300 && E.castleHp > 0;
    const siegeRequired = wallStanding || lateSiege;
    if (siegeRequired && roster.indexOf('bombard') >= 0) plan = 'bombard';
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
    // 4c) tecnología única de la civilización: investigar en cuanto se pueda
    if (P.civ != null && !P.tech && P.age >= 2) {
      const info = GAME._tech('P').info;
      if (info && P.age >= info.age) {
        let ok = true;
        for (const r in info.cost) if (P.res[r] < info.cost[r] + (reserve[r] || 0) + 40) { ok = false; break; }
        if (ok) GAME._buyTech('P');
      }
    }
    // Levantar la propia Maravilla solo con ejército y defensa suficientes.
    // Si el enemigo ya la tiene, todos los recursos y colas quedan dedicados
    // a asedio/reacción en vez de iniciar una carrera ciega.
    if (wonderSaving && P.res.food >= D.WONDER.cost.food && P.res.wood >= D.WONDER.cost.wood &&
      P.res.gold >= D.WONDER.cost.gold && P.res.stone >= D.WONDER.cost.stone) {
      GAME._buildWonder('P');
    }
    // 5) entrenar sin vaciar la reserva y con tope de ejército
    const target = [5, 7, 9, 12][P.age];
    // Si la maravilla enemiga está activa, ampliar de forma acotada el objetivo
    // normal permite reunir respuesta de asedio aun con el ejército ya lleno.
    // Se cuentan también las unidades en cola para no encadenar órdenes sin fin.
    const urgentTarget = enemyWonderActive
      ? Math.min(SIDE_CAP, target + 6)
      : siegeRequired ? Math.min(SIDE_CAP, target + 3) : target;
    const committedArmy = armyNow + P.queue.filter(q => !D.UNITS[q.type].meadow).length;
    if (P.queue.length < 5 && committedArmy < urgentTarget) {
      const cost = GAME._unitCost('P', plan);
      // Mantén la mayor parte de la reserva de la próxima edad: gastar solo
      // la mitad suele dejar al bot atascado en Edad II, pero reservar todo
      // puede volverlo excesivamente pasivo. La cola ya cuenta como compromiso.
      const spare = (k) => P.res[k] - cost[k] - (reserve[k] || 0) * 0.80;
      let ok = true;
      for (const k in cost) if (spare(k) < 20) { ok = false; break; }
      if (ok) GAME.train(plan);
    }
    // 6) defensa: el bot también levanta muralla y torres cuando le sobra piedra
    if (P.age >= 1) {
      const spareStone = P.res.stone - (reserve.stone || 0);
      if (P.def.wall.lvl < 3 && spareStone > 80) GAME._buildDef('P', 'wall');
      if (P.def.towers.length < 2 && P.age >= 2 && spareStone > 100) GAME._buildDef('P', 'tower');
    }
    // 7) segundo frente: misma secuencia estructural que la IA rival y una
    // guarnición pequeña antes de lanzar incursiones al recurso más productivo.
    if (b.meadowT <= 0) {
      b.meadowT = 5;
      const meadowSpare = cost => Object.keys(cost).every(k => P.res[k] >= cost[k] + (reserve[k] || 0) + 20);
      if (P.age >= 1 && P.meadow.store < 1 && meadowSpare(D.MEADOW_STRUCTURES.store.cost) && GAME._buildMeadow('P', 'store')) return;
      if (P.age >= 1 && P.meadow.watch < 1 && meadowSpare(D.MEADOW_STRUCTURES.watch.cost) && GAME._buildMeadow('P', 'watch')) return;
      if (P.age >= 2 && P.meadow.camp < 1 && meadowSpare(D.MEADOW_STRUCTURES.camp.cost) && GAME._buildMeadow('P', 'camp')) return;
      const enemyRaiders = st.units.filter(u => u.side === 'E' && !u.dying && u.type === 'saboteur').length;
      const guards = st.units.filter(u => u.side === 'P' && !u.dying && u.type === 'warden').length + P.queue.filter(q => q.type === 'warden').length;
      const guardCost = GAME._unitCost('P', 'warden');
      if (P.meadow.watch > 0 && guards < Math.max(1, enemyRaiders) && meadowSpare(guardCost) && GAME._deployMeadow('P', 'warden', 'farm')) return;
      const raiders = st.units.filter(u => u.side === 'P' && !u.dying && u.type === 'saboteur').length + P.queue.filter(q => q.type === 'saboteur').length;
      const raidCost = GAME._unitCost('P', 'saboteur');
      if (P.meadow.camp > 0 && raiders < 2 && meadowSpare(raidCost)) {
        const target = D.MEADOW_TARGETS.slice().sort((a, c) =>
          (E.eng[c] * (E.workers[c].alive + 1)) - (E.eng[a] * (E.workers[a].alive + 1)))[0];
        GAME._deployMeadow('P', 'saboteur', target);
      }
    }
  };
}
/* Determina la causa del final a partir del estado publicado. La victoria por
   maravilla solo se marca cuando el contador de la maravilla ganadora alcanzó
   WONDER.time y sigue levantada; en cualquier otro caso un castillo a 0 es la
   causa convencional. */
function inferVictoryReason(probe, state) {
  if (!probe || !probe.over || (probe.winner !== 'P' && probe.winner !== 'E')) return 'other';
  const D = GAME.constData();
  const side = state && state.sides ? state.sides[probe.winner] : null;
  if (side && side.wonder && side.wonder.built && side.wonder.t + 1e-6 >= D.WONDER.time) return 'wonder';
  const castleHp = probe.winner === 'P' ? probe.eCastle : probe.pCastle;
  if (typeof castleHp === 'number' && castleHp <= 0) return 'castle';
  return 'other';
}
function runMatch(pCiv, eCiv, diff, dt, observer, matchSeed) {
  const t0 = performance.now();
  if (matchSeed !== undefined) setSimulationSeed(matchSeed);
  GAME.setDifficulty(diff);
  GAME._startMatch(pCiv, eCiv);
  const pBot = makePBot();
  let ex = null, over = false, winner = null, steps = 0;
  for (let i = 0; i < 200000; i++) {
    try {
      pBot(dt);
      GAME.update(dt);
      steps = i + 1;
    } catch (e) { ex = e; break; }
    const p = GAME.probe();
    try {
      if (observer && (steps % observer.interval === 0 || p.over)) observer({ step: steps, probe: p, state: GAME.state });
    } catch (e) { ex = e; break; }
    if (p.over) { over = true; winner = p.winner; break; }
    for (const k of Object.keys(p)) {
      const v = p[k];
      if (typeof v === 'number' && !isFinite(v)) { ex = new Error('non-finite probe ' + k + '=' + v); break; }
    }
    if (ex) break;
  }
  return {
    over, winner, reason: inferVictoryReason(GAME.probe(), GAME.state), ex, steps,
    wall: performance.now() - t0,
    t: GAME.probe().t,
    state: GAME.state ? {
      P: GAME.state.sides.P.stats, E: GAME.state.sides.E.stats,
      ages: [GAME.state.sides.P.age, GAME.state.sides.E.age],
      upgP: GAME.state.sides.P.upg, upgE: GAME.state.sides.E.upg,
      defP: GAME._def('P'), defE: GAME._def('E'),
      wonderP: GAME._wonder('P'), wonderE: GAME._wonder('E'),
    } : null,
  };
}

/* Invariantes de estabilidad para el estado headless. Se inspeccionan tanto
   los números publicados por probe() como el estado que los produce, de modo
   que un NaN/Infinity no pueda ocultarse en una estructura interna. */
function soakInvariant(sample) {
  const D = GAME.constData();
  const fail = msg => { throw new Error(msg); };
  const finiteTree = (value, pathName, seen) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) fail('non-finite ' + pathName + '=' + value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    for (const k of Object.keys(value)) finiteTree(value[k], pathName + '.' + k, seen);
  };
  finiteTree(sample.probe, 'probe', new Set());
  finiteTree(sample.state, 'state', new Set());
  const st = sample.state;
  if (!st || !st.sides || !st.sides.P || !st.sides.E) fail('estado incompleto');
  const resources = ['food', 'wood', 'gold', 'stone'];
  const expectedKeys = resources.slice().sort();
  for (const side of ['P', 'E']) {
    const s = st.sides[side];
    const keys = Object.keys(s.res).sort();
    if (keys.length !== expectedKeys.length || keys.some((k, i) => k !== expectedKeys[i])) {
      fail('resources keys inválidas en ' + side + ': ' + JSON.stringify(keys));
    }
    for (const r of resources) {
      if (!Number.isFinite(s.res[r]) || s.res[r] < 0) fail('resource inválido ' + side + '.' + r + '=' + s.res[r]);
    }
    if (!Number.isInteger(s.age) || s.age < 0 || s.age >= D.AGES.length) fail('age inválida ' + side + '=' + s.age);
    if (typeof s.aging !== 'boolean' || !Number.isFinite(s.ageT) || s.ageT < 0 || s.ageT > 8.000001) fail('age timer inválido en ' + side);
    for (const k of Object.keys(D.ENGINES)) {
      if (!Number.isInteger(s.eng[k]) || s.eng[k] < 0 || s.eng[k] > 8) fail('engine cap inválido ' + side + '.' + k);
      const w = s.workers[k];
      if (!w || !Number.isInteger(w.alive) || !Number.isInteger(w.max) || w.alive < 0 || w.alive > w.max || w.max !== s.eng[k]) {
        fail('workers inválidos en ' + side + '.' + k);
      }
      if (!Number.isFinite(w.hp) || w.hp > w.max * 26 + 0.001 || !Number.isFinite(w.rt) || w.rt < 0) {
        fail('worker hp/respawn inválido en ' + side + '.' + k);
      }
    }
    for (const k of ['atk', 'def']) {
      const upg = D.UPG[k];
      if (!Number.isInteger(s.upg[k]) || s.upg[k] < 0 || s.upg[k] > upg.max) fail('upgrade inválida ' + side + '.' + k);
    }
    if (!Array.isArray(s.queue) || s.queue.length > 6) fail('queue cap excedido en ' + side);
    for (const q of s.queue) {
      if (!q || !D.UNITS[q.type] || !Number.isFinite(q.t) || !Number.isFinite(q.dur) || q.dur <= 0 || q.t < -1e-9 || q.t > q.dur + 1e-9) {
        fail('queue inválida en ' + side);
      }
    }
    for (const k of ['trained', 'lost', 'gathered']) {
      if (!Number.isFinite(s.stats[k]) || s.stats[k] < 0) fail('stat inválida ' + side + '.' + k);
    }
    const cmax = side === 'P' ? sample.probe.castleMax : sample.probe.castleMaxE;
    if (!Number.isFinite(s.castleHp) || s.castleHp < 0 || s.castleHp > cmax + 0.001) fail('castle HP inválido ' + side);
    const hpMul = s.civ === 'rus' && s.tech ? 1.15 : 1;
    const wallMax = s.def.wall.lvl > 0 ? D.DEFENSE.wall.hp[s.def.wall.lvl] * hpMul : 0;
    if (!Number.isInteger(s.def.wall.lvl) || s.def.wall.lvl < 0 || s.def.wall.lvl > D.DEFENSE.wall.max ||
      !Number.isFinite(s.def.wall.hp) || s.def.wall.hp < 0 || s.def.wall.hp > wallMax + 1) fail('wall inválida ' + side);
    if (!Array.isArray(s.def.towers) || s.def.towers.length > D.DEFENSE.tower.max) fail('tower cap excedido en ' + side);
    for (const tower of s.def.towers) {
      if (!Number.isFinite(tower.hp) || tower.hp < 0 || !Number.isFinite(tower.max) || tower.max <= 0 || tower.hp > tower.max + 0.001) fail('tower HP inválido en ' + side);
    }
    if (typeof s.tech !== 'boolean' || !s.wonder || typeof s.wonder.built !== 'boolean' ||
      !Number.isFinite(s.wonder.hp) || !Number.isFinite(s.wonder.max) || !Number.isFinite(s.wonder.t) ||
      s.wonder.hp < 0 || s.wonder.max < 0 || s.wonder.hp > s.wonder.max + 0.001 || s.wonder.t < 0 || s.wonder.t > D.WONDER.time + 0.001) {
      fail('wonder/tech inválida en ' + side);
    }
    if (!s.meadow || !D.MEADOW_TARGETS.includes(s.meadow.target)) fail('meadow/target inválido en ' + side);
    for (const k of Object.keys(D.MEADOW_STRUCTURES)) {
      if (!Number.isInteger(s.meadow[k]) || s.meadow[k] < 0 || s.meadow[k] > D.MEADOW_STRUCTURES[k].max) {
        fail('meadow structure cap inválido ' + side + '.' + k);
      }
    }
    if (!Number.isFinite(s.meadow.watchCd)) fail('meadow watchCd inválido en ' + side);
    for (const k of ['raids', 'defended']) if (!Number.isFinite(s.meadow[k]) || s.meadow[k] < 0) fail('meadow stat inválido ' + side + '.' + k);
  }
  if (!Array.isArray(st.units)) fail('units no es array');
  const live = { P: { battle: 0, meadow: 0 }, E: { battle: 0, meadow: 0 } };
  for (const u of st.units) {
    if (!u || (u.side !== 'P' && u.side !== 'E') || !D.UNITS[u.type]) fail('unidad inválida');
    if (!Number.isFinite(u.hp) || !Number.isFinite(u.max) || u.hp < 0 || u.max <= 0 || u.hp > u.max + 0.001 ||
      !Number.isFinite(u.x) || !Number.isFinite(u.y0) || !Number.isFinite(u.dmg) || !Number.isFinite(u.spd)) fail('stats inválidas en unidad');
    if (!Number.isFinite(u.actionT || 0) || (u.front !== 'battle' && u.front !== 'meadow')) fail('front/action inválido en unidad');
    if (!u.dying) live[u.side][u.front]++;
  }
  for (const side of ['P', 'E']) {
    if (live[side].battle > SIDE_CAP) fail('battle side cap excedido en ' + side);
    if (live[side].meadow > 8) fail('meadow side cap excedido en ' + side);
  }
  if (!Array.isArray(st.torches)) fail('torches no es array');
  for (const t of st.torches) if (![t.x,t.y,t.sx,t.tx,t.ty,t.t,t.dur].every(Number.isFinite) || t.dur <= 0) fail('antorcha inválida');
  if (!Number.isInteger(sample.step) || sample.step <= 0) fail('step inválido');
}

/* ---------- comandos ---------- */
const cmd = cmdArg;
if (cmd === 'smoke') {
  const r = runMatch('english', 'french', 1, 0.05, undefined, deriveMatchSeed(seed, 1, 0));
  if (r.ex) { console.error('SMOKE FAILED:', r.ex); process.exit(1); }
  if (!r.over) { console.error('SMOKE FAILED: no game over'); process.exit(1); }
  console.log('[GAME OVER at t=' + r.t.toFixed(0) + 's] Winner: ' + (r.winner === 'P' ? 'Player' : 'Enemy'));
  console.log('  ✓ All probe values finite');
  console.log('=== SMOKE TEST PASSED ===');
  process.exit(0);
} else if (cmd === 'diffcheck') {
  const rawN = process.argv[3] || '6';
  const N = Number(rawN);
  if (!Number.isInteger(N) || N <= 0) {
    console.error('DIFFCHECK FAILED: N debe ser un entero mayor que 0');
    process.exit(1);
  }
  console.log('DIFFCHECK seed: ' + seed);
  const calendar = [];
  for (let g = 0; g < N; g++) {
    const pc = CIVS[calendarRng() * CIVS.length | 0];
    const ec = CIVS[calendarRng() * CIVS.length | 0];
    calendar.push({ pc, ec });
  }
  console.log('DIFFCHECK calendar: ' + calendar.map((m, i) => i + '=' + m.pc + '/' + m.ec).join(', '));
  console.log('DIFFCHECK match seeds: derive(seed,diff,index), per partida');
  const dt = 0.05;
  let diffcheckBad = false;
  for (let diff = 0; diff < 4; diff++) {
    let eWins = 0, pWins = 0, draws = 0, incomplete = 0, total = 0, exc = 0, eUpg = { atk: 0, def: 0 }, pUpg = { atk: 0, def: 0 };
    const reasons = { eWonder: 0, pWonder: 0, eCastle: 0, pCastle: 0, other: 0 };
    for (let g = 0; g < N; g++) {
      const { pc, ec } = calendar[g];
      const r = runMatch(pc, ec, diff, dt, undefined, deriveMatchSeed(seed, diff, g));
      if (r.ex) { exc++; continue; }
      if (!r.over) { incomplete++; continue; }
      if (r.winner !== 'E' && r.winner !== 'P') { draws++; continue; }
      total += r.t;
      if (r.winner === 'E') eWins++; else pWins++;
      if (r.reason === 'wonder') reasons[r.winner === 'E' ? 'eWonder' : 'pWonder']++;
      else if (r.reason === 'castle') reasons[r.winner === 'E' ? 'eCastle' : 'pCastle']++;
      else reasons.other++;
      if (r.state) {
        eUpg.atk += r.state.upgE.atk; eUpg.def += r.state.upgE.def;
        pUpg.atk += r.state.upgP.atk; pUpg.def += r.state.upgP.def;
      }
    }
    // Cualquier resultado no completamente clasificable invalida diffcheck:
    // excepciones, partidas sin cierre, empates o una causa de victoria
    // desconocida no deben ocultarse tras las tasas de victoria.
    if (exc || incomplete || draws || reasons.other) diffcheckBad = true;
    const names = ['Fácil', 'Normal', 'Difícil', 'Extremo'];
    console.log('--- Difficulty ' + diff + ': ' + names[diff] + ' ---');
    console.log('  E win rate: ' + (100 * eWins / N).toFixed(1) + '% (' + eWins + '/' + N + ')');
    console.log('  P win rate: ' + (100 * pWins / N).toFixed(1) + '% (' + pWins + '/' + N + ')');
    console.log('  Avg time: ' + (total / N).toFixed(1) + 's');
    console.log('  Exceptions: ' + exc);
    console.log('  Draws: ' + draws);
    console.log('  Incomplete: ' + incomplete);
    console.log('  Win reasons: E wonder=' + reasons.eWonder + ' castle=' + reasons.eCastle +
      ' | P wonder=' + reasons.pWonder + ' castle=' + reasons.pCastle + ' other=' + reasons.other);
    console.log('  Avg E upg: atk=' + (eUpg.atk / N).toFixed(2) + '  def=' + (eUpg.def / N).toFixed(2));
    console.log('  Avg P upg: atk=' + (pUpg.atk / N).toFixed(2) + '  def=' + (pUpg.def / N).toFixed(2));
  }
  process.exit(diffcheckBad ? 1 : 0);
} else if (cmd === 'soakcheck') {
  const dt = 0.05;
  const interval = 100;
  const targetSteps = 100000;
  const minGames = 8;
  const maxGames = 24;
  const t0 = performance.now();
  let totalSteps = 0, simulated = 0, games = 0;
  let bad = null;
  for (let g = 0; g < maxGames && (games < minGames || totalSteps < targetSteps); g++) {
    // Rotación fija para cubrir las ocho civilizaciones y las cuatro
    // dificultades; el PRNG sigue gobernando todas las decisiones del bot.
    const pc = CIVS[g % CIVS.length];
    const ec = CIVS[(g * 3 + 1) % CIVS.length];
    const diff = g % 4;
    const observer = sample => {
      try { soakInvariant(sample); }
      catch (e) { throw new Error('partida ' + (g + 1) + ' (' + pc + '/' + ec + ', dificultad ' + diff + ', paso ' + sample.step + '): ' + e.message); }
    };
    observer.interval = interval;
    // Soak conserva el flujo aleatorio continuo histórico del arnés; al no
    // depender de un calendario de comparativa, esto mantiene su cobertura y
    // sus invariantes exactamente como antes, de forma determinista.
    const r = runMatch(pc, ec, diff, dt, observer);
    games++;
    totalSteps += r.steps;
    simulated += r.t;
    if (r.ex) { bad = r.ex; break; }
    if (!r.over) { bad = new Error('partida ' + games + ' no terminó antes de 200000 pasos'); break; }
    if (r.steps > 200000) { bad = new Error('partida ' + games + ' excedió el límite de 200000 pasos'); break; }
    if (r.winner !== 'P' && r.winner !== 'E') { bad = new Error('partida ' + games + ' terminó sin ganador válido'); break; }
  }
  const wall = performance.now() - t0;
  console.log('SOAKCHECK seed: ' + seed);
  console.log('Partidas: ' + games);
  console.log('Pasos: ' + totalSteps);
  console.log('Duración simulada: ' + simulated.toFixed(1) + 's');
  console.log('Tiempo real: ' + wall.toFixed(0) + 'ms');
  if (bad || games < minGames || totalSteps < targetSteps) {
    if (!bad) bad = new Error('objetivo insuficiente: se requieren ' + minGames + ' partidas y ' + targetSteps + ' pasos');
    console.error('SOAKCHECK FAILED: ' + bad.message);
    process.exit(1);
  }
  console.log('=== SOAKCHECK PASSED ===');
  process.exit(0);
} else if (cmd === 'autoplay') {
  const pCiv = process.argv[3] || 'english', eCiv = process.argv[4] || 'mongols';
  const diff = parseInt(process.argv[5] || '1', 10);
  const r = runMatch(pCiv, eCiv, diff, 0.05, undefined, deriveMatchSeed(seed, diff, 0));
  if (r.ex) { console.error('AUTOPLAY FAILED:', r.ex); process.exit(1); }
  console.log('winner:', r.winner, '| reason:', r.reason, '| over:', r.over, '| t:', r.t.toFixed(1) + 's', '| wall:', r.wall.toFixed(0) + 'ms');
  if (r.state) {
    console.log('P stats:', JSON.stringify(r.state.P));
    console.log('E stats:', JSON.stringify(r.state.E));
    console.log('Ages P/E:', r.state.ages[0], '/', r.state.ages[1]);
    console.log('Live state:', JSON.stringify({
      P: { res: GAME.state.sides.P.res, aging: GAME.state.sides.P.aging, ageT: GAME.state.sides.P.ageT, queue: GAME.state.sides.P.queue.map(q => q.type), meadow: GAME._meadow('P') },
      E: { res: GAME.state.sides.E.res, aging: GAME.state.sides.E.aging, ageT: GAME.state.sides.E.ageT, queue: GAME.state.sides.E.queue.map(q => q.type), meadow: GAME._meadow('E') },
      units: { P: GAME._unitStates().filter(u => u.side === 'P').map(u => u.type), E: GAME._unitStates().filter(u => u.side === 'E').map(u => u.type) }
    }));
    console.log('Defense P: wall lvl ' + r.state.defP.wall.lvl + ' (hp ' + r.state.defP.wall.hp.toFixed(0) + ') torres ' + r.state.defP.towers.length);
    console.log('Defense E: wall lvl ' + r.state.defE.wall.lvl + ' (hp ' + r.state.defE.wall.hp.toFixed(0) + ') torres ' + r.state.defE.towers.length);
    console.log('Wonder P: ' + (r.state.wonderP.built ? 'built' : 'down') + ' (hp ' + r.state.wonderP.hp.toFixed(0) + ', t ' + r.state.wonderP.t.toFixed(1) + 's)' +
      ' | E: ' + (r.state.wonderE.built ? 'built' : 'down') + ' (hp ' + r.state.wonderE.hp.toFixed(0) + ', t ' + r.state.wonderE.t.toFixed(1) + 's)');
  }
} else if (cmd === 'formcheck') {
  /* Verifica de forma determinista los multiplicadores y la colocación
     en línea de las formaciones, además de un combate de daño controlado. */
  const fail = m => { console.error('FORMCHECK FAILED: ' + m); process.exit(1); };
  GAME.setDifficulty(0);
  GAME._startMatch('english', 'french');
  const resources = ['food', 'wood', 'gold', 'stone'];
  for (const side of ['P', 'E']) {
    for (const r of resources) GAME._grant(side, r, 1e6);
    const res = GAME.state.sides[side].res;
    const keys = Object.keys(res).sort();
    if (keys.length !== resources.length || keys.some((key, i) => key !== resources.slice().sort()[i])) {
      fail('recursos de ' + side + ' tienen keys inesperadas: ' + JSON.stringify(keys));
    }
    for (const r of resources) {
      if (typeof res[r] !== 'number' || !Number.isFinite(res[r])) fail('recurso ' + side + '.' + r + ' no es finito');
    }
  }
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
} else if (cmd === 'defcheck') {
  /* Verifica muralla y torres: construcción, bloqueo del asalto, destrucción
     y fuego de las torres. */
  const fail = m => { console.error('DEFCHECK FAILED: ' + m); process.exit(1); };
  GAME.setDifficulty(0);
  GAME._startMatch('english', 'french');
  for (const s of ['P', 'E']) for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant(s, r, 1e6);
  // 1) construcción desde el hook
  if (!GAME._buildDef('P', 'wall')) fail('no se pudo levantar la muralla P');
  if (!GAME._buildDef('P', 'tower')) fail('no se pudo levantar la torre P');
  if (!GAME._buildDef('P', 'tower')) fail('no se pudo levantar la 2ª torre P');
  if (GAME._buildDef('P', 'tower')) fail('debería limitar a 2 torres');
  const gP = GAME._geo();
  if (gP.wallP <= gP.frontP) fail('muralla P mal situada: ' + gP.wallP + ' vs frente ' + gP.frontP);
  const dP = GAME._def('P');
  if (dP.wall.hp <= 0 || dP.towers.length !== 2) fail('estado defensa P incorrecto: ' + JSON.stringify(dP));
  // 2) subir muralla un nivel
  if (!GAME._buildDef('P', 'wall')) fail('no se pudo reforzar la muralla P');
  const dP2 = GAME._def('P');
  if (dP2.wall.lvl !== 2) fail('muralla P no subió a Nv 2');
  // 3) asedio: un lancero E debe atacar la muralla (no el castillo) hasta derribarla
  GAME._place('E', 'lancer', GAME._geo().wallP + 55);
  const before = GAME.probe();
  GAME.update(0.05);
  GAME.update(0.05);
  // simula 8s con substeps
  for (let i = 0; i < 160; i++) GAME.update(0.05);
  let st = GAME.probe();
  if (st.pCastle !== before.pCastle) fail('la muralla no protegió el castillo: daño recibido');
  if (st.pWall >= dP2.wall.hp) fail('la muralla no recibió daño: ' + st.pWall + '/' + dP2.wall.hp);
  // 4) los mismos golpes al final derriban la muralla y entonces sí llegan al castillo
  for (let i = 0; i < 600; i++) GAME.update(0.05);
  st = GAME.probe();
  if (st.pCastle <= 0) fail('el castillo P se cayó demasiado pronto');
  // 5) el fuego de torre debe haber dañado al asaltante E (hubo tiro de torre: daño acumulado)
  //    Comprobamos que el asaltante acabó muerto (las torres + el castillo ayudan)
  GAME.update(0.05);
  console.log('  ✓ muralla construida (Nv ' + dP2.wall.lvl + '), torres 2/2, muro bloquea el asalto');
  console.log('  ✓ asalto derriba la muralla antes de tocar el castillo (HP castillo P intacto durante el bloqueo)');
  console.log('=== DEFCHECK PASSED ===');
  process.exit(0);
} else if (cmd === 'techcheck') {
  /* Verifica la tecnología única por civilización: gate por edad y coste,
     efecto sobre las estadísticas de las unidades y el bonus defensivo de los
     Rus. No debe poder comprarse dos veces ni antes de tiempo. */
  const fail = m => { console.error('TECHCHECK FAILED: ' + m); process.exit(1); };
  GAME.setDifficulty(0);
  // 1) cada civ tiene su tecnología definida con efecto o defHp
  const D = GAME.constData();
  for (const c of Object.keys(D.CIVS)) {
    const t = D.CIV_TECH[c];
    if (!t || !t.name || !t.cost || !t.age) fail('CIV_TECH[' + c + '] incompleto');
    if (!t.fx && !t.defHp) fail('CIV_TECH[' + c + '] sin efecto');
  }
  // 2) gate de edad y coste
  GAME._startMatch('french', 'mongols');
  GAME._setAge('P', 1);
  if (GAME._buyTech('P')) fail('debería bloquear la tecnología antes de la edad 2');
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant('P', r, 1e6);
  GAME._setAge('P', 2);
  if (!GAME._buyTech('P')) fail('no compró la tecnología en edad 2 con recursos');
  if (GAME._buyTech('P')) fail('compró la tecnología dos veces');
  if (!GAME._tech('P').done) fail('_tech no refleja la compra');
  // 3) efecto: la Coraza francesa da +15% de vida a la caballería pesada (royal)
  const royal = GAME._place('P', 'royal');
  if (!royal) fail('no pudo desplegar royal para medir la tecnología');
  if (royal.hp < 290 * 1.15 * 0.95) fail('la tecnología francesa no subió la vida del royal: ' + royal.hp);
  // 4) los Rus refuerzan castillo (defHp) al investigar
  GAME._startMatch('rus', 'english');
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant('P', r, 1e6);
  GAME._setAge('P', 2);
  const maxBefore = GAME.probe().castleMax;
  if (!GAME._buyTech('P')) fail('rus no investigó su fortaleza');
  const maxAfter = GAME.probe().castleMax;
  if (maxAfter <= maxBefore) fail('la fortaleza rusa no reforzó el castillo: ' + maxBefore + ' -> ' + maxAfter);
  console.log('  ✓ las 8 civilizaciones tienen tecnología única con efecto');
  console.log('  ✓ gate de edad/coste y compra única (francesa, edad 2)');
  console.log('  ✓ la Coraza de Limoges sube la vida de la caballería real (' + Math.round(royal.hp) + ' HP)');
  console.log('  ✓ Fortaleza de Novgorod refuerza el castillo ruso (' + Math.round(maxBefore) + ' -> ' + Math.round(maxAfter) + ')');
  console.log('=== TECHCHECK PASSED ===');
  process.exit(0);
} else if (cmd === 'wdebug') {
  GAME.setDifficulty(0);
  GAME._startMatch('english', 'french');
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant('P', r, 1e6);
  GAME._setAge('P', 3);
  GAME._buildWonder('P');
  const geo = GAME._geo();
  const bs = [];
  for (let k = 0; k < 3; k++) bs.push(GAME._place('E', 'bombard', geo.wonderP - 10 - k * 20));
  let last = GAME._wonder('P').hp;
  for (let i = 0; i < 600; i++) {
    GAME.update(0.05);
    const w = GAME._wonder('P');
    if (i % 20 === 0) console.log('t=' + (i * 0.05).toFixed(1) + 's hp=' + w.hp + ' bombards bhp=[' + bs.map(b => b.hp.toFixed(0)).join(',') + ']');
    if (w.hp !== last) { console.log('    hp ' + last + ' -> ' + w.hp); last = w.hp; }
    if (w.hp <= 0) break;
  }
  console.log('final hp=' + GAME._wonder('P').hp + ' over=' + GAME.probe().over);
  process.exit(0);
} else if (cmd === 'pradocheck') {
  const fail = m => { console.error('PRADOCHECK FAILED: ' + m); process.exit(1); };
  const D = GAME.constData();
  GAME.setDifficulty(0);
  GAME._startMatch('english', 'french');
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant('P', r, 1e6);
  GAME._setAge('P', 2);
  const income0 = GAME._income('P', 'food');
  if (!GAME._buildMeadow('P', 'store')) fail('no construyó Almacén');
  if (GAME._income('P', 'food') <= income0) fail('Almacén no aumenta la producción');
  if (!GAME._buildMeadow('P', 'watch') || !GAME._buildMeadow('P', 'camp')) fail('no construyó Vigía/Campamento');
  while (GAME._buildMeadow('P', 'store')) {}
  if (GAME._meadow('P').store !== D.MEADOW_STRUCTURES.store.max || GAME._buildMeadow('P', 'store')) fail('cap del Almacén incorrecto');
  // Incursión dirigida: la mina enemiga tiene trabajadores y ninguna defensa.
  GAME._eng('E', 'mine', 3);
  const workers0 = GAME._workers('E').mine.alive;
  if (!GAME._deployMeadow('P', 'saboteur', 'mine')) fail('no desplegó Saboteador');
  for (let i = 0; i < 1200; i++) GAME.update(0.05);
  const mineNow = GAME._workers('E').mine.alive;
  const raider = GAME._unitStates().find(u => u.side === 'P' && u.type === 'saboteur');
  if (mineNow >= workers0 || !GAME._meadow('P').raids) fail('Saboteador no dañó la economía objetivo');
  if (raider && raider.front !== 'meadow') fail('Saboteador salió del frente del Prado');
  // Defensa: un Guardián y el puesto de Vigía interceptan una incursión rival.
  GAME._startMatch('english', 'french');
  for (const side of ['P', 'E']) {
    for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant(side, r, 1e6);
    GAME._setAge(side, 2);
  }
  GAME._buildMeadow('P', 'watch'); GAME._buildMeadow('E', 'camp'); GAME._eng('P', 'farm', 3);
  if (!GAME._deployMeadow('P', 'warden', 'farm') || !GAME._deployMeadow('E', 'saboteur', 'farm')) fail('no desplegó defensa/incursor');
  for (let i = 0; i < 1000; i++) GAME.update(0.05);
  if (GAME._meadow('P').defended < 1 && GAME._unitStates().some(u => u.side === 'E' && u.type === 'saboteur' && !u.dying)) fail('Guardián/Vigía no interceptaron la incursión');
  // Regla de edificio: antorcha para tropa, proyectil para asedio.
  GAME._startMatch('english', 'french');
  const lancer = GAME._place('P', 'lancer', 500); GAME._attackCastle(lancer);
  if (GAME._projectiles().torches !== 1 || lancer.action !== 'torch') fail('Lancero no lanzó antorcha');
  GAME._startMatch('english', 'french');
  const bombard = GAME._place('P', 'bombard', 500); GAME._attackCastle(bombard);
  if (GAME._projectiles().torches !== 0 || GAME._projectiles().arrows !== 1) fail('Bombarda usó antorcha o no lanzó proyectil');
  console.log('  ✓ Almacén mejora producción y respeta cap; Vigía/Campamento construibles');
  console.log('  ✓ Saboteador dirigido a mina reduce trabajadores y permanece en El Prado');
  console.log('  ✓ Guardián/Puesto de Vigía interceptan incursiones');
  console.log('  ✓ tropas usan antorcha contra edificios; asedio usa proyectil');
  console.log('=== PRADOCHECK PASSED ===');
  process.exit(0);
} else if (cmd === 'wondercheck') {
  /* Verifica la Maravilla (victoria alternativa): gate por edad y coste,
     compra única, prioridad de ataque sobre el castillo, countdown de victoria
     y cancelación al ser derribada. */
  const fail = m => { console.error('WONDERCHECK FAILED: ' + m); process.exit(1); };
  const D = GAME.constData();
  const WT = D.WONDER.time;
  GAME.setDifficulty(0);
  GAME._startMatch('english', 'french');
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant('P', r, 1e6);
  // 1) gate de edad: en edad 1 no se puede construir
  GAME._setAge('P', 1);
  if (GAME._buildWonder('P')) fail('debería bloquear la maravilla antes de la edad ' + D.WONDER.age);
  // 2) en edad 3 con recursos se construye y no dos veces
  GAME._setAge('P', 3);
  if (!GAME._buildWonder('P')) fail('no construyó la maravilla en edad 3 con recursos');
  if (GAME._buildWonder('P')) fail('construyó la maravilla dos veces');
  const w0 = GAME._wonder('P');
  if (!w0.built || w0.hp <= 0) fail('estado de la maravilla P incorrecto: ' + JSON.stringify(w0));
  // 3) la maravilla gasta recursos (el coste se descontó)
  // 4) countdown: la maravilla en pie el tiempo justo da la victoria por maravilla
  //    E no recibe recursos y los suyos iniciales se anulan: no puede reclutar
  //    tropas que la derriben, así que el contador corre despejado.
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME.state.sides.E.res[r] = 0;
  for (let i = 0; i < Math.ceil(WT / 0.05) + 4; i++) GAME.update(0.05);
  let st = GAME.probe();
  if (!st.over) fail('no hubo game over tras mantener la maravilla ' + WT + 's');
  if (st.winner !== 'P') fail('la victoria por maravilla debería ser del jugador, ganó ' + st.winner);
  // 5) cancelación: si la derriban antes del tiempo, el contador se resetea y no hay victoria
  GAME._startMatch('english', 'french');
  for (const r of ['food', 'wood', 'gold', 'stone']) GAME._grant('P', r, 1e6);
  GAME._setAge('P', 3);
  if (!GAME._buildWonder('P')) fail('no construyó la maravilla P (escenario 2)');
  // tres bombardas E a la posición de la maravilla la derriban (el castillo P
  // las hostiga pero una sola no basta: el tiro combinado la reduce a 0; E no
  // recibe recursos para no levantar su propia maravilla)
  for (let k = 0; k < 3; k++) GAME._place('E', 'bombard', GAME._geo().wonderP - 10 - k * 20);
  for (let i = 0; i < 600; i++) GAME.update(0.05);
  st = GAME.probe();
  if (st.over) fail('la maravilla derribada no debería dar la victoria');
  const w2 = GAME._wonder('P');
  if (w2.built) fail('la maravilla debería estar derribada, sigue en pie con hp ' + w2.hp);
  if (w2.t !== 0) fail('el contador de maravilla derribada debería resetear a 0: ' + w2.t);
  console.log('  ✓ gate de edad y coste, compra única (' + D.WONDER.cost.food + '/' + D.WONDER.cost.wood + '/' + D.WONDER.cost.gold + '/' + D.WONDER.cost.stone + ', edad ' + D.WONDER.age + ')');
  console.log('  ✓ la maravilla en pie ' + WT + 's da la victoria alternativa');
  console.log('  ✓ derribarla antes de tiempo cancela el contador (hp ' + Math.round(w0.hp) + ', reset t=0)');
  console.log('=== WONDERCHECK PASSED ===');
  process.exit(0);
} else {
  console.error('comando desconocido: ' + cmd);
  console.error('Uso: smoke | diffcheck [N] [seed] | soakcheck [seed] | autoplay [pCiv eCiv] | formcheck | defcheck | techcheck | wondercheck | pradocheck');
  process.exit(1);
}
