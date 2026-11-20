// The transport company simulation: calendar, towns and cargo, boats and their orders, finances, saves.
import { KM_PER_UNIT, CLASS_MIN, NAV, CELL, N } from './archipelago.js';
import { Weather, WEATHER } from './weather.js';
import { CAPTAINS, CAPTAIN, captainLine, hireFee } from './captains.js';
import { QUESTS, QUEST, questName, fillQuest } from './quests.js';
import { pathLength } from './nav.js';

export const DAY_SECONDS = 12; // real seconds per in-game day at 1x speed
export const UNITS_PER_KMH = 0.48; // world units per real second, per km/h, at 1x
export const START_YEAR = 1950;
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SAVE_KEY = 'archipelago-shipping-save-v1';

export const CARGO = {
  pax: { name: 'Passengers', unit: '', rate: 0.45, d1: 8, d2: 28, color: '#4f7fd9', icon: '👤' },
  mail: { name: 'Mail', unit: 'bags', rate: 0.66, d1: 5, d2: 20, color: '#e8e0c0', icon: '✉' },
  goods: { name: 'Goods', unit: 'crates', rate: 0.57, d1: 10, d2: 40, color: '#c9a060', icon: '📦' },
  food: { name: 'Food', unit: 't', rate: 0.51, d1: 6, d2: 22, color: '#e85050', icon: '🍎' },
  timber: { name: 'Timber', unit: 't', rate: 0.3, d1: 22, d2: 80, color: '#8a5a30', icon: '🪵' },
  grain: { name: 'Grain', unit: 't', rate: 0.315, d1: 20, d2: 75, color: '#e0c060', icon: '🌾' },
};
const PAX = ['pax', 'mail'];
const FREIGHT = ['goods', 'food', 'timber', 'grain'];

export const MODELS = [
  { id: 'wren', name: 'Wren river launch', year: 1950, cls: 'river', cargo: PAX, cap: 30, kmh: 18, price: 9000, run: 1800, rel: 0.82, decay: 0.0035, life: 20 },
  { id: 'mallard', name: 'Mallard barge', year: 1950, cls: 'river', cargo: FREIGHT, cap: 60, kmh: 13, price: 12000, run: 2200, rel: 0.86, decay: 0.003, life: 25 },
  { id: 'puffin', name: 'Puffin coastal ferry', year: 1950, cls: 'coastal', cargo: PAX, cap: 140, kmh: 24, price: 42000, run: 7500, rel: 0.78, decay: 0.004, life: 25 },
  { id: 'gannet', name: 'Gannet coaster', year: 1952, cls: 'coastal', cargo: FREIGHT, cap: 320, kmh: 19, price: 55000, run: 9000, rel: 0.8, decay: 0.0035, life: 28 },
  { id: 'kingfisher', name: 'Kingfisher river bus', year: 1962, cls: 'river', cargo: PAX, cap: 70, kmh: 30, price: 24000, run: 4200, rel: 0.85, decay: 0.003, life: 22 },
  { id: 'heron', name: 'Heron motor barge', year: 1966, cls: 'river', cargo: FREIGHT, cap: 150, kmh: 20, price: 30000, run: 5000, rel: 0.88, decay: 0.0028, life: 28 },
  { id: 'albatross', name: 'Albatross freighter', year: 1970, cls: 'ocean', cargo: FREIGHT, cap: 1200, kmh: 26, price: 210000, run: 32000, rel: 0.84, decay: 0.003, life: 30 },
  { id: 'swift', name: 'Swift hydrofoil', year: 1975, cls: 'coastal', cargo: PAX, cap: 220, kmh: 50, price: 160000, run: 26000, rel: 0.8, decay: 0.0038, life: 22 },
  { id: 'osprey', name: 'Osprey container ship', year: 1988, cls: 'ocean', cargo: ['goods', 'food'], cap: 2400, kmh: 32, price: 420000, run: 55000, rel: 0.9, decay: 0.0024, life: 30 },
];
export const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));
export const UPGRADES = {
  engine: { name: 'Engine', max: 3, cost: 0.25, desc: '+12% speed' },
  hull: { name: 'Hull', max: 3, cost: 0.2, desc: '+5% reliability, slower wear' },
  hold: { name: 'Cargo hold', max: 2, cost: 0.3, desc: '+20% capacity' },
};

const BOAT_NAMES = ['Marigold', 'Lady Fern', 'Puddle Jumper', 'Saltwhistle', 'Merry Tern', 'Old Faithful', 'Seawren',
  'Bramble', 'Duchess', 'Morning Star', 'Kittiwake', 'Driftwood', 'Bluebell', 'Cormorant', 'Silver Eel', 'Honeybee',
  'Tidewalker', 'Lantern', 'Gentle Annie', 'Brass Monkey', 'Sea Holly', 'Pennywhistle', 'Clementine', 'Northern Lass'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function dateString(day) {
  const d = Math.floor(day);
  const y = START_YEAR + Math.floor(d / 360);
  const m = Math.floor((d % 360) / 30);
  return `${(d % 30) + 1} ${MONTHS[m]} ${y}`;
}
export const money = (v) => (v < 0 ? '-' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US');

export class Sim {
  constructor(arch, nav) {
    this.a = arch;
    this.nav = nav;
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }
  emit(kind, text, ref) { for (const f of this.listeners) f({ kind, text, ref }); }

  newGame() {
    this.day = 0;
    this.speed = 1;
    this.weather = new Weather();
    this.crew = []; // hired captains: { id, boat, since }
    this.pool = []; // captains looking for work
    this._refreshPool(5);
    this.money = 80000;
    this.loan = 80000;
    this.maxLoan = 400000;
    this.boats = [];
    this.nextBoatId = 1;
    this.months = [this._blankMonth()];
    this.year = { income: 0, costs: 0 };
    this.lastYear = null;
    for (const t of this.a.towns) this._initTown(t);
    this.quests = []; // open and active
    this.questLog = []; // finished, failed, expired (most recent first)
    this.nextQuestId = 1;
    for (let i = 0; i < 3; i++) this._spawnQuest(true);
  }

  _blankMonth() { return { income: {}, running: 0, service: 0, boats: 0, upgrades: 0, interest: 0, sales: 0, wages: 0, quests: 0 }; }
  get month() { return this.months[this.months.length - 1]; }
  get yearNum() { return START_YEAR + Math.floor(this.day / 360); }

  _initTown(t) {
    t.waiting = {}; t.transfer = {}; t.rating = {}; t.served = {}; t.lastPickup = {}; t.lastSpeed = {};
    t.factoryStock = 0; t.recent = 0; t.delivered = 0; t.firstVisit = false;
    for (const c of Object.keys(CARGO)) { t.waiting[c] = 0; t.transfer[c] = []; }
    const p = t.pop;
    t.prod = { pax: 2 + Math.pow(p, 0.75) / 25 };
    t.prod.mail = t.prod.pax * 0.35;
    if (t.raw) t.prod[t.raw] = t.tier === 'small' ? 14 + (t.seed % 10) : 28 + (t.seed % 16);
    if (t.factory) t.prod.goods = Math.pow(p, 0.6) / 12;
    t.accepts = new Set(['pax', 'mail', 'goods']);
    if (t.raw !== 'food') t.accepts.add('food');
    if (t.factory) { t.accepts.add('timber'); t.accepts.add('grain'); }
  }

  produces(t, c) { return (t.prod[c] || 0) > 0 || (c === 'goods' && t.factoryStock > 0); }

  // ---------------------------------------------------------------- boats

  available() { return MODELS.filter((m) => m.year <= this.yearNum); }

  boatCap(b) { return Math.round(MODEL[b.model].cap * (1 + 0.2 * b.up.hold)); }
  boatKmh(b) { return MODEL[b.model].kmh * (1 + 0.12 * b.up.engine) * (this.captainOf(b)?.speed || 1); }

  // ---------------------------------------------------------------- quests

  quest(id) { return this.quests.find((q) => q.id === id) || null; }

  // Biggest hold available today for a class of boat (with a fully upgraded hold).
  _classCap(cls) {
    return Math.max(0, ...MODELS.filter((m) => m.cls === cls && m.year <= this.yearNum).map((m) => m.cap * 1.4));
  }

  _spawnQuest(quiet = false) {
    const a = this.a, towns = a.towns;
    for (let tries = 0; tries < 30; tries++) {
      const emergency = Math.random() < 0.2;
      const pool = QUESTS.filter((q) => (q.kind === 'emergency') === emergency && !this.quests.some((o) => o.tpl === q.id));
      const tpl = pool[Math.floor(Math.random() * pool.length)];
      if (!tpl) continue;
      const from = towns[Math.floor(Math.random() * towns.length)];
      const to = towns[Math.floor(Math.random() * towns.length)];
      const km = Math.hypot(from.x - to.x, from.z - to.z) * KM_PER_UNIT;
      if (from === to || km < 6 || km > 70) continue;
      const classes = ['river', 'coastal', 'ocean'].filter((c) => this.nav.canReach(from, c) && this.nav.canReach(to, c) && this._classCap(c) >= tpl.cap);
      if (!classes.length || !this.nav.route(from.berthX, from.berthZ, to, classes[0])) continue;
      const em = tpl.kind === 'emergency';
      const reward = Math.round((1200 + km * 170) * tpl.mult * (0.85 + Math.random() * 0.3) / 100) * 100;
      const q = {
        id: this.nextQuestId++, tpl: tpl.id, from: from.id, to: to.id, km, reward, classes,
        limit: Math.ceil(km * 1.5 / 3.6 * (em ? 1.1 : 1.8) + (em ? 3 : 8)),
        posted: this.day, expires: this.day + (em ? 7 + Math.random() * 5 : 20 + Math.random() * 15),
        state: 'open', boat: null, phase: null, deadline: null, vars: { name: questName(), name2: questName() },
      };
      this.quests.push(q);
      if (!quiet) this.emit('quest', `${tpl.icon} New ${em ? 'EMERGENCY ' : ''}quest at ${from.name}: ${tpl.title} (${money(reward)})`, { quest: q });
      return q;
    }
    return null;
  }

  questText(q, key = 'text') { return fillQuest(QUEST[q.tpl][key], q, this.a.towns); }

  // Why a boat can't take a quest, or null if it can.
  questProblem(q, b) {
    const m = MODEL[b.model];
    if (b.quest != null) return 'Already on a quest';
    if (!this.captainOf(b)) return 'Needs a captain';
    if (!q.classes.includes(m.cls)) return `${m.cls === 'river' ? 'River boats' : m.cls === 'coastal' ? 'Coastal boats' : 'Ocean ships'} can't reach both towns`;
    if (this.boatCap(b) < QUEST[q.tpl].cap) return `Hold too small (needs ${QUEST[q.tpl].cap})`;
    return null;
  }

  // Estimated days for a boat to collect and deliver a quest.
  questEta(q, b) {
    const cls = MODEL[b.model].cls, from = this.a.towns[q.from], to = this.a.towns[q.to];
    const p1 = b.at === from.id ? [[0, 0]] : this.nav.route(b.x, b.z, from, cls);
    const p2 = this.nav.route(from.berthX, from.berthZ, to, cls);
    if (!p1 || !p2) return null;
    const extra = b.state === 'broken' || b.state === 'service' ? b.timer : 0;
    return (pathLength(p1) + pathLength(p2)) / (this.boatKmh(b) * UNITS_PER_KMH) / DAY_SECONDS + 1 + extra;
  }

  acceptQuest(q, b) {
    if (!q || q.state !== 'open') return 'That quest is no longer available.';
    const why = this.questProblem(q, b);
    if (why) return why;
    q.state = 'active'; q.boat = b.id; q.phase = 'pickup'; q.deadline = this.day + q.limit;
    b.quest = q.id;
    b.detour = null;
    // Drop what it's doing (it picks up its route again afterwards).
    if (b.state === 'load') { if (b.orders.length) b.cur = (b.cur + 1) % b.orders.length; this._depart(b, false); }
    else if (b.state === 'sail') this._depart(b, false);
    else if (b.state === 'broken') b.path = null;
    else if (b.state !== 'service') this._depart(b, false);
    this.emit('good', `${b.name} has taken the quest "${QUEST[q.tpl].title}". Off to ${this.a.towns[q.from].name}!`, b);
    if (Math.random() < 0.7) this.chatter(b);
    return null;
  }

  _endQuest(q, outcome) {
    q.state = outcome;
    q.ended = this.day;
    this.quests.splice(this.quests.indexOf(q), 1);
    this.questLog.unshift(q);
    if (this.questLog.length > 25) this.questLog.pop();
    const b = q.boat != null ? this.boats.find((x) => x.id === q.boat) : null;
    if (b && b.quest === q.id) {
      b.quest = null;
      if (b.state === 'sail') b.path = null; // re-plans back onto its route
      else if (b.state === 'load') b.resume = true;
    }
    return b;
  }

  abandonQuest(q) {
    const pen = Math.round(q.reward * 0.1 / 100) * 100;
    this.money -= pen;
    this.month.quests = (this.month.quests || 0) - pen;
    this._endQuest(q, 'failed');
    this.emit('bad', `Quest abandoned: ${QUEST[q.tpl].title}. ${this.questText(q, 'fail')} (Penalty ${money(pen)})`);
  }

  _questArrive(b, t) {
    const q = this.quest(b.quest);
    if (!q || t.id !== (q.phase === 'pickup' ? q.from : q.to)) return false;
    const tpl = QUEST[q.tpl];
    this._unload(b, t, false);
    b.state = 'load';
    b.timer = 0.4;
    b.loadedHere = 0;
    if (q.phase === 'pickup') {
      q.phase = 'deliver';
      this.emit('info', `${tpl.icon} ${b.name} has collected "${tpl.title}" at ${t.name}. Now for ${this.a.towns[q.to].name}!`, b);
    } else {
      this.money += q.reward;
      this.month.quests = (this.month.quests || 0) + q.reward;
      b.profitThis += q.reward;
      b.incomeThis = (b.incomeThis || 0) + q.reward;
      this._endQuest(q, 'done');
      b.resume = true;
      this.emit('good', `${tpl.icon} Quest complete! ${this.questText(q, 'done')} (+${money(q.reward)})`, b);
      this.emit('coins', '', { boat: b, amount: q.reward });
      if (Math.random() < 0.6) this.chatter(b, 'paid');
    }
    return true;
  }

  _questDay() {
    for (const q of [...this.quests]) {
      if (q.state === 'open' && this.day > q.expires) {
        this._endQuest(q, 'expired');
        this.emit('info', `${QUEST[q.tpl].icon} Nobody took "${QUEST[q.tpl].title}". ${this.questText(q, 'fail')}`);
      } else if (q.state === 'active' && this.day > q.deadline) {
        const pen = Math.round(q.reward * 0.1 / 100) * 100;
        this.money -= pen;
        this.month.quests = (this.month.quests || 0) - pen;
        this._endQuest(q, 'failed');
        this.emit('bad', `${QUEST[q.tpl].icon} Quest failed: ${QUEST[q.tpl].title}. ${this.questText(q, 'fail')} (Penalty ${money(pen)})`);
      }
    }
    if (this.quests.filter((q) => q.state === 'open').length < 6 && Math.random() < 0.14) this._spawnQuest();
  }

  // ---------------------------------------------------------------- captains

  captainOf(b) {
    const c = this.crew.find((x) => x.boat === b.id);
    return c ? CAPTAIN[c.id] : null;
  }

  _refreshPool(n) {
    const taken = new Set([...this.crew.map((c) => c.id), ...this.pool]);
    const free = CAPTAINS.filter((c) => !taken.has(c.id));
    for (let i = 0; i < n && free.length; i++) this.pool.push(free.splice(Math.floor(Math.random() * free.length), 1)[0].id);
  }

  hireCaptain(id, boat = null) {
    const c = CAPTAIN[id];
    if (!c || !this.pool.includes(id)) return 'That captain is no longer available.';
    const fee = hireFee(c);
    if (this.money < fee) return `You need ${money(fee)} to hire ${c.name}.`;
    this.money -= fee;
    this.month.wages = (this.month.wages || 0) + fee;
    this.pool.splice(this.pool.indexOf(id), 1);
    this.crew.push({ id, boat: null, since: this.day });
    if (!boat) boat = this.boats.find((b) => !this.captainOf(b));
    if (boat) this.assignCaptain(id, boat);
    this.emit('captain', `${c.face} ${c.name}: "${captainLine(c, 'lines', this._ctx(boat))}"`, boat);
    return null;
  }

  fireCaptain(id) {
    const i = this.crew.findIndex((c) => c.id === id);
    if (i < 0) return;
    this.crew.splice(i, 1);
    this.emit('info', `${CAPTAIN[id].name} has left the company, muttering.`);
  }

  // Put a captain on a boat (or ashore with boat = null). Any captain already on that boat goes ashore.
  assignCaptain(id, boat) {
    const c = this.crew.find((x) => x.id === id);
    if (!c) return;
    if (boat) for (const o of this.crew) if (o.boat === boat.id) o.boat = null;
    c.boat = boat ? boat.id : null;
  }

  _ctx(b) {
    const t = b && b.target != null ? this.a.towns[b.target] : b && b.at != null ? this.a.towns[b.at] : null;
    return { boat: b ? b.name : 'boat', town: t ? t.name : 'port', cargo: b ? CARGO[b.cargoType].name.toLowerCase() : 'cargo' };
  }

  // A captain says something.
  chatter(b, kind = 'lines') {
    const c = b && this.captainOf(b);
    if (c) this.emit('captain', `${c.face} ${c.name}: "${captainLine(c, kind, this._ctx(b))}"`, b);
  }
  maxRel(b) {
    const m = MODEL[b.model];
    const age = (this.day - b.built) / 360;
    return clamp(m.rel + 0.05 * b.up.hull - Math.max(0, age - m.life) * 0.05, 0.25, 0.98);
  }
  boatValue(b) {
    const m = MODEL[b.model];
    const age = (this.day - b.built) / 360;
    return m.price * clamp(1 - age / (m.life * 1.2), 0.15, 1) + (b.spentUpgrades || 0) * 0.4;
  }
  load(b) { return b.cargo.reduce((s, p) => s + p.n, 0); }

  buy(modelId, town) {
    const m = MODEL[modelId];
    if (!town.shipyard) return 'Boats can only be bought at a shipyard.';
    if (this.money < m.price) return `You need ${money(m.price)}.`;
    if (!this.nav.canReach(town, m.cls)) return `A ${m.name} can't reach ${town.name}'s docks.`;
    this.money -= m.price;
    this.month.boats += m.price;
    const used = new Set(this.boats.map((b) => b.name));
    let name = BOAT_NAMES.find((n) => !used.has(n));
    if (!name) name = `${m.name.split(' ')[0]} ${this.nextBoatId}`;
    const b = {
      id: this.nextBoatId++, name, model: modelId, x: town.berthX, z: town.berthZ, heading: 0,
      cargoType: m.cargo[0], cargo: [], orders: [], cur: 0, state: 'idle', path: null, pi: 0, timer: 0,
      rel: m.rel, lastService: this.day, built: this.day, up: { engine: 0, hull: 0, hold: 0 },
      profitThis: 0, profitLast: null, at: town.id, spentUpgrades: 0, trips: 0,
    };
    this.boats.push(b);
    const free = this.crew.find((c) => c.boat == null);
    if (free) free.boat = b.id;
    return b;
  }

  sell(b) {
    const v = this.boatValue(b);
    this.money += v;
    this.month.sales += v;
    this.boats.splice(this.boats.indexOf(b), 1);
    for (const c of this.crew) if (c.boat === b.id) c.boat = null;
    const q = b.quest != null && this.quest(b.quest);
    if (q) { q.state = 'open'; q.boat = null; q.phase = null; q.deadline = null; }
    this.emit('info', `${b.name} sold for ${money(v)}.`);
  }

  canUpgrade(b) {
    const t = b.at != null ? this.a.towns[b.at] : null;
    return !!(t && t.shipyard && (b.state === 'load' || b.state === 'idle' || b.state === 'service'));
  }

  upgradeCost(b, kind) { return Math.round(MODEL[b.model].price * UPGRADES[kind].cost * (b.up[kind] + 1)); }

  upgrade(b, kind) {
    if (!this.canUpgrade(b)) return 'Visit a shipyard first.';
    if (b.up[kind] >= UPGRADES[kind].max) return 'Already fully upgraded.';
    const cost = this.upgradeCost(b, kind);
    if (this.money < cost) return `You need ${money(cost)}.`;
    this.money -= cost;
    this.month.upgrades += cost;
    b.spentUpgrades = (b.spentUpgrades || 0) + cost;
    b.up[kind]++;
    if (kind === 'hull') b.rel = this.maxRel(b);
    this.emit('good', `${b.name}: ${UPGRADES[kind].name} upgraded to level ${b.up[kind]}.`, b);
    return null;
  }

  refit(b, c) {
    if (!this.canUpgrade(b)) return 'Visit a shipyard first.';
    if (!MODEL[b.model].cargo.includes(c)) return 'This boat cannot carry that.';
    const cost = Math.round(MODEL[b.model].price * 0.04);
    if (this.money < cost) return `You need ${money(cost)}.`;
    this.money -= cost;
    this.month.upgrades += cost;
    b.cargo = [];
    b.cargoType = c;
    this.emit('info', `${b.name} refitted to carry ${CARGO[c].name.toLowerCase()}.`, b);
    return null;
  }

  setOrders(b, orders) {
    b.orders = orders;
    b.cur = 0;
    if (b.state === 'sail' || b.state === 'idle') this._depart(b, false);
  }

  sendForService(b) {
    const yard = this._nearestYard(b);
    if (!yard) return 'No reachable shipyard.';
    b.detour = yard.id;
    if (b.state === 'sail' || b.state === 'idle' || b.state === 'load') { b.state = 'sail'; this._plan(b, yard); }
    return null;
  }

  _nearestYard(b) {
    const cls = MODEL[b.model].cls;
    let best = null, bd = Infinity;
    for (const t of this.a.towns) {
      if (!t.shipyard || !this.nav.canReach(t, cls)) continue;
      const d = Math.hypot(t.x - b.x, t.z - b.z);
      if (d < bd && this.nav.route(b.x, b.z, t, cls)) { bd = d; best = t; }
    }
    return best;
  }

  _plan(b, town) {
    const pts = this.nav.route(b.x, b.z, town, MODEL[b.model].cls);
    b.path = pts;
    b.pi = 1;
    b.target = town.id;
    b.legStartDay = this.day;
    if (!pts) {
      b.state = 'lost';
      this.emit('bad', `${b.name} can't find a way to ${town.name}.`, b);
    }
  }

  // Leave the current stop for the next order (or a service detour).
  _depart(b, advance = true) {
    const q = b.quest != null ? this.quest(b.quest) : null;
    if (!q && b.quest != null) b.quest = null;
    if (!b.orders.length && !q) { b.state = 'idle'; b.path = null; return; }
    if (q) advance = false;
    if (advance) { b.loadSum = (b.loadSum || 0) + this.load(b) / this.boatCap(b); b.loadN = (b.loadN || 0) + 1; }
    if (advance) b.cur = (b.cur + 1) % b.orders.length;
    const m = MODEL[b.model];
    const due = this.day - b.lastService > (b.serviceDays || 150);
    const here = b.at != null ? this.a.towns[b.at] : null;
    if (due && !q && b.autoService !== false && !(here && here.shipyard)) {
      const yard = this._nearestYard(b);
      if (yard) b.detour = yard.id;
    }
    const target = q ? this.a.towns[q.phase === 'pickup' ? q.from : q.to] : b.detour != null ? this.a.towns[b.detour] : this.a.towns[b.orders[b.cur].town];
    b.at = null;
    b.state = 'sail';
    if (!this.nav.canReach(target, m.cls)) { b.state = 'lost'; this.emit('bad', `${b.name} can't reach ${target.name}.`, b); return; }
    this._plan(b, target);
  }

  _arrive(b) {
    const t = this.a.towns[b.target];
    b.at = t.id;
    b.x = t.berthX; b.z = t.berthZ;
    if (!t.firstVisit) {
      t.firstVisit = true;
      this.emit('good', `Crowds cheer the first ${this._boatKind(b)} to arrive at ${t.name}!`, t);
    }
    if (b.quest != null && this._questArrive(b, t)) return;
    if (b.detour === t.id) {
      b.detour = null;
      this._service(b, t);
      // carry on with whichever order we were heading for
      b.state = 'service';
      b.timer = 1;
      b.resumeOrder = true;
      return;
    }
    if (t.shipyard && this.day - b.lastService > 30) this._service(b, t);
    const order = b.orders[b.cur];
    this._unload(b, t, order && order.mode === 'transfer');
    b.state = 'load';
    b.timer = 0.3;
    b.loadedHere = 0;
    const c = b.cargoType;
    if (this.produces(t, c) && !t.served[c]) { t.served[c] = true; t.rating[c] = 0.6; t.lastPickup[c] = this.day; }
  }

  _boatKind(b) { return MODEL[b.model].cls === 'ocean' ? 'ship' : 'boat'; }

  _service(b, t) {
    const m = MODEL[b.model];
    const cost = Math.round(m.price * 0.01 + 150);
    this.money -= cost;
    this.month.service += cost;
    b.profitThis -= cost;
    b.rel = this.maxRel(b);
    b.lastService = this.day;
  }

  _income(b, c, amount) {
    this.money += amount;
    this.month.income[c] = (this.month.income[c] || 0) + amount;
    b.profitThis += amount;
    b.incomeThis = (b.incomeThis || 0) + amount;
  }

  pay(c, n, srcId, dst, loadedDay) {
    const src = this.a.towns[srcId];
    const km = Math.hypot(src.x - dst.x, src.z - dst.z) * KM_PER_UNIT;
    const days = this.day - loadedDay;
    const C = CARGO[c];
    const f = days <= C.d1 ? 1 : days >= C.d2 ? 0.25 : 1 - 0.75 * (days - C.d1) / (C.d2 - C.d1);
    return n * C.rate * km * f;
  }

  _unload(b, t, transfer) {
    let earned = 0, n = 0;
    const keep = [];
    for (const p of b.cargo) {
      if (p.src !== t.id && t.accepts.has(p.c)) {
        const v = this.pay(p.c, p.n, p.src, t, p.day) * (this.captainOf(b)?.haggle || 1);
        earned += v; n += p.n;
        b.unitsThis = (b.unitsThis || 0) + p.n;
        this._income(b, p.c, v);
        if (p.c === 'timber' || p.c === 'grain') t.factoryStock += p.n;
        else t.recent += p.n;
        t.delivered += p.n;
      } else if (transfer && p.src !== t.id) {
        t.transfer[p.c].push(p);
      } else keep.push(p);
    }
    b.cargo = keep;
    if (earned > 0) {
      b.lastDelivery = { n, earned, town: t.id, day: this.day };
      this.emit('coins', `+${money(earned)}`, { boat: b, amount: earned });
      if (earned > 1500 && Math.random() < 0.12) this.chatter(b, 'paid');
    }
  }

  _loadTick(b, t, dDays) {
    const c = b.cargoType;
    const cap = this.boatCap(b);
    let room = cap - this.load(b);
    let rate = cap * 1.6 * dDays; // a full hold in about 15 hours
    // Transferred packets first (they keep their origin for payment).
    const tr = t.transfer[c];
    while (room > 0 && rate > 0 && tr.length) {
      const p = tr[0];
      const take = Math.min(p.n, room, Math.ceil(rate));
      b.cargo.push({ c, n: take, src: p.src, day: p.day });
      p.n -= take; room -= take; rate -= take;
      if (p.n <= 0) tr.shift();
    }
    if (room > 0 && rate > 0 && t.waiting[c] >= 1) {
      const take = Math.min(Math.floor(t.waiting[c]), room, Math.max(1, Math.floor(rate)));
      if (take > 0) {
        t.waiting[c] -= take;
        const last = b.cargo[b.cargo.length - 1];
        if (last && last.src === t.id && last.c === c && Math.abs(last.day - this.day) < 1) last.n += take;
        else b.cargo.push({ c, n: take, src: t.id, day: this.day });
        b.loadedHere += take;
      }
    }
    return cap - this.load(b);
  }

  // ---------------------------------------------------------------- time

  update(realDt) {
    if (!this.speed || !(realDt > 0)) return;
    const dt = realDt * this.speed;
    const dDays = dt / DAY_SECONDS;
    const before = Math.floor(this.day);
    this.day += dDays;
    for (const b of this.boats) this._boat(b, dt, dDays);
    for (let d = before + 1; d <= Math.floor(this.day); d++) this._daily(d);
  }

  _boat(b, dt, dDays) {
    if (!this.captainOf(b)) { b.speedNow = 0; return; }
    switch (b.state) {
      case 'sail': {
        if (!b.path) { this._depart(b, false); return; }
        const wx = this.weatherFactor(b.x, b.z, b);
        let move = this.boatKmh(b) * wx * UNITS_PER_KMH * dt;
        b.speedNow = this.boatKmh(b) * wx;
        while (move > 0 && b.pi < b.path.length) {
          const [tx, tz] = b.path[b.pi];
          const dx = tx - b.x, dz = tz - b.z;
          const d = Math.hypot(dx, dz);
          if (d <= move) { b.x = tx; b.z = tz; move -= d; b.pi++; }
          else {
            b.x += dx / d * move; b.z += dz / d * move; move = 0;
            const want = Math.atan2(dz, dx);
            let diff = want - b.heading;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            b.heading += diff * Math.min(1, dt * 3);
          }
        }
        if (b.pi >= b.path.length) this._arrive(b);
        break;
      }
      case 'load': {
        const t = this.a.towns[b.at];
        b.speedNow = 0;
        if (b.quest != null || b.resume) {
          b.timer -= dDays;
          if (b.timer <= 0) { b.resume = false; this._depart(b, false); }
          break;
        }
        const order = b.orders[b.cur];
        const room = order && order.mode !== 'unload' ? this._loadTick(b, t, dDays) : 0;
        b.timer -= dDays;
        const full = room <= 0;
        const waitFull = order && order.mode === 'full';
        if (b.timer <= 0 && (full || (!waitFull && (t.waiting[b.cargoType] < 1 && !t.transfer[b.cargoType].length)) || !order || order.mode === 'unload')) {
          if (b.loadedHere > 0 || this.produces(t, b.cargoType)) {
            t.lastPickup[b.cargoType] = this.day;
            t.lastSpeed[b.cargoType] = this.boatKmh(b);
          }
          b.trips++;
          this._depart(b, true);
        }
        break;
      }
      case 'service':
      case 'broken': {
        b.speedNow = 0;
        b.timer -= dDays;
        if (b.timer <= 0) {
          if (b.state === 'broken') { b.state = 'sail'; this.emit('info', `${b.name} is under way again.`, b); }
          else this._depart(b, false);
        }
        break;
      }
      default:
        b.speedNow = 0;
    }
  }

  // Rivers are sheltered; open water feels the weather.
  sheltered(x, z) {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    if (i < 0 || j < 0 || i >= N || j >= N) return false;
    const n = this.a.nav[j * N + i];
    return n === NAV.RIVER || n === NAV.LAND;
  }

  weatherFactor(x, z, b) {
    const w = this.weather.info;
    if (w.speed === 1 || this.sheltered(x, z)) return 1;
    const q = b && this.captainOf(b)?.quirk;
    if (this.weather.kind === 'fog' && q === 'fogproof') return 1;
    if (this.weather.kind === 'storm' && q === 'stormproof') return 1;
    if (this.weather.kind === 'storm' && q === 'stormlover') return 1.1;
    return w.speed;
  }

  _daily(d) {
    const day = d;
    const changed = this.weather.day();
    if (changed === 'storm') this.emit('bad', '⛈️ A storm is sweeping the islands. Boats at sea are slowed and take a battering.');
    else if (changed === 'fog') this.emit('info', '🌫️ Fog has rolled in. Boats at sea are feeling their way slowly.');
    else if (changed && (changed === 'clear' || changed === 'fair') && this._lastWx && WEATHER[this._lastWx].speed < 1) this.emit('good', `${WEATHER[changed].icon} The weather has cleared.`);
    this._lastWx = this.weather.kind;
    const wear = this.weather.info.wear;
    // Running costs and wear.
    for (const b of this.boats) {
      const m = MODEL[b.model];
      const cost = m.run / 360;
      this.money -= cost;
      this.month.running += cost;
      b.profitThis -= cost;
      b.rel = Math.max(0.05, b.rel - m.decay * 0.55 * (1 - 0.2 * b.up.hull) * (this.sheltered(b.x, b.z) ? 1 : wear) * (this.captainOf(b)?.care || 1));
      if (b.state === 'sail' && Math.random() < 0.05 * Math.pow(1 - b.rel, 1.6)) {
        b.state = 'broken';
        b.timer = 2 + Math.random() * 3;
        b.rel = Math.max(b.rel, 0.1);
        this.emit('bad', `${b.name} has broken down!`, b);
        if (Math.random() < 0.6) this.chatter(b, 'broken');
      }
      const age = (this.day - b.built) / 360;
      if (Math.abs(age - m.life) < 1 / 360) this.emit('bad', `${b.name} is getting old and will become less reliable. Consider replacing it.`, b);
    }
    this._questDay();
    // Captains: wages, the job market and idle chatter.
    for (const c of this.crew) {
      const w = CAPTAIN[c.id].wage / 360;
      this.money -= w;
      this.month.wages = (this.month.wages || 0) + w;
      const b = c.boat != null && this.boats.find((x) => x.id === c.boat);
      if (b) b.profitThis -= w;
    }
    if (day % 45 === 0) { if (this.pool.length > 3) this.pool.splice(Math.floor(Math.random() * this.pool.length), 1); this._refreshPool(Math.max(0, 5 - this.pool.length)); }
    const crewed = this.boats.filter((b) => this.captainOf(b));
    if (crewed.length) {
      if (changed === 'storm') { const atSea = crewed.filter((b) => b.state === 'sail' && !this.sheltered(b.x, b.z)); if (atSea.length) this.chatter(atSea[Math.floor(Math.random() * atSea.length)], 'storm'); }
      else if (Math.random() < 0.3) this.chatter(crewed[Math.floor(Math.random() * crewed.length)]);
    }
    // Towns: production into waiting cargo, ratings, factories, growth.
    for (const t of this.a.towns) this._townDay(t);
    // Month and year boundaries.
    if (day % 30 === 0) {
      const interest = this.loan * 0.06 / 12;
      this.money -= interest;
      this.month.interest += interest;
      this.months.push(this._blankMonth());
      if (this.months.length > 26) this.months.shift();
      if (day % 360 === 0) this._yearEnd();
      this.save();
    }
    for (const m of MODELS) if (m.year === this.yearNum && day % 360 === 0 && m.year > START_YEAR) {
      this.emit('good', `New boat available: ${m.name}!`);
    }
  }

  _yearEnd() {
    const y = this.yearNum - 1;
    let total = 0;
    for (const b of this.boats) {
      b.profitLast = b.profitThis;
      b.incomeLast = b.incomeThis || 0; b.unitsLast = b.unitsThis || 0; b.loadLast = b.loadN ? b.loadSum / b.loadN : null;
      b.incomeThis = 0; b.unitsThis = 0; b.loadSum = 0; b.loadN = 0;
      total += b.profitThis;
      if (b.profitThis < 0 && (this.day - b.built) > 300) this.emit('bad', `${b.name} lost ${money(-b.profitThis)} in ${y}.`, b);
      b.profitThis = 0;
    }
    this.emit('info', `${y} is over. Your fleet made ${money(total)}.`);
  }

  _townDay(t) {
    for (const c of Object.keys(t.prod)) {
      if (!t.served[c]) continue;
      let p = t.prod[c] * (0.8 + Math.random() * 0.4);
      const r = t.rating[c];
      t.waiting[c] += p * r;
      if (t.waiting[c] > 400) t.waiting[c] -= (t.waiting[c] - 400) * 0.05 * (1.2 - r);
      // rating moves toward a target reflecting how well the stop is served
      const since = this.day - (t.lastPickup[c] ?? -999);
      let target = 0.3;
      target += since <= 15 ? 0.33 : since <= 30 ? 0.25 : since <= 60 ? 0.14 : since <= 120 ? 0.05 : 0;
      target += clamp(((t.lastSpeed[c] || 15) - 15) / 140, 0, 0.17);
      target += t.waiting[c] < 100 ? 0.1 : t.waiting[c] > 1500 ? -0.1 : 0;
      t.rating[c] += (clamp(target, 0.05, 0.98) - r) * 0.04;
    }
    if (t.factoryStock > 0) {
      const used = Math.min(t.factoryStock, 8 + t.factoryStock * 0.08);
      t.factoryStock -= used;
      if (t.served.goods) t.waiting.goods += used * 0.8 * (t.rating.goods || 0.5);
    }
    // Towns grow when they're well supplied.
    if (t.recent > 0) {
      const g = Math.min(t.recent / t.pop, 0.3) * 0.0012;
      t.pop = Math.round(t.pop * (1 + g));
      t.recent *= 0.97;
      t.prod.pax = 2 + Math.pow(t.pop, 0.75) / 25;
      t.prod.mail = t.prod.pax * 0.35;
      if (t.factory) t.prod.goods = Math.pow(t.pop, 0.6) / 12;
    }
  }

  // ---------------------------------------------------------------- finance

  borrow(amount) {
    const a = Math.min(amount, this.maxLoan - this.loan);
    if (a <= 0) return 'You can’t borrow any more.';
    this.loan += a; this.money += a;
    return null;
  }

  repay(amount) {
    const a = Math.min(amount, this.loan, Math.max(0, this.money));
    if (a <= 0) return 'Nothing to repay.';
    this.loan -= a; this.money -= a;
    return null;
  }

  monthTotals(m) {
    const income = Object.values(m.income).reduce((s, v) => s + v, 0) + m.sales + (m.quests || 0);
    const costs = m.running + m.service + m.boats + m.upgrades + m.interest + (m.wages || 0);
    return { income, costs, profit: income - costs };
  }

  companyValue() { return this.money - this.loan + this.boats.reduce((s, b) => s + this.boatValue(b), 0); }

  // Rough estimate of a route's round-trip time in days for the order editor.
  routeDays(b) {
    const cls = MODEL[b.model].cls;
    let d = 0;
    for (let i = 0; i < b.orders.length; i++) {
      const A = this.a.towns[b.orders[i].town], B = this.a.towns[b.orders[(i + 1) % b.orders.length].town];
      const pts = this.nav.route(A.berthX, A.berthZ, B, cls);
      if (!pts) return null;
      d += pathLength(pts);
    }
    return d / (this.boatKmh(b) * UNITS_PER_KMH) / DAY_SECONDS + b.orders.length * 0.5;
  }

  // ---------------------------------------------------------------- save / load

  serialize() {
    return {
      v: 1, seed: this.a.seed, day: this.day, money: this.money, loan: this.loan, nextBoatId: this.nextBoatId,
      months: this.months, weather: this.weather.serialize(), crew: this.crew, pool: this.pool, quests: this.quests, questLog: this.questLog, nextQuestId: this.nextQuestId,
      boats: this.boats.map((b) => ({ ...b, path: null })),
      towns: this.a.towns.map((t) => ({ pop: t.pop, waiting: t.waiting, transfer: t.transfer, rating: t.rating, served: t.served,
        lastPickup: t.lastPickup, lastSpeed: t.lastSpeed, factoryStock: t.factoryStock, recent: t.recent, delivered: t.delivered, firstVisit: t.firstVisit })),
    };
  }

  restore(s) {
    this.newGame();
    Object.assign(this, { day: s.day, money: s.money, loan: s.loan, nextBoatId: s.nextBoatId, months: s.months });
    this.weather.restore(s.weather);
    if (s.crew) { this.crew = s.crew; this.pool = s.pool || []; }
    if (s.quests) { this.quests = s.quests; this.questLog = s.questLog || []; this.nextQuestId = s.nextQuestId || 1; }
    s.towns.forEach((ts, i) => {
      const t = this.a.towns[i];
      if (!t) return;
      Object.assign(t, ts);
      t.prod.pax = 2 + Math.pow(t.pop, 0.75) / 25;
      t.prod.mail = t.prod.pax * 0.35;
      if (t.factory) t.prod.goods = Math.pow(t.pop, 0.6) / 12;
    });
    this.boats = s.boats;
    if (!s.crew) {
      // Saves from before captains: every boat gets a captain on the house.
      this.crew = []; this.pool = [];
      const free = [...CAPTAINS].sort(() => Math.random() - 0.5);
      for (const b of this.boats) { const c = free.pop(); if (c) this.crew.push({ id: c.id, boat: b.id, since: this.day }); }
      this._refreshPool(5);
    }
    for (const b of this.boats) {
      if (b.state === 'sail') { const tgt = this.a.towns[b.target]; if (tgt) this._plan(b, tgt); else this._depart(b, false); }
      if (b.state === 'lost') this._depart(b, false);
    }
  }

  save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize())); return true; } catch { return false; }
  }

  static loadSave() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  }

  static clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
}
