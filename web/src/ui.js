// HTML interface: top bar, context panel (town / boat / shipyard / lists / finances), news, route editing.
import { TIER, KM_PER_UNIT } from './archipelago.js';
import { CARGO, MODEL, UPGRADES, MONTHS, START_YEAR, money, dateString } from './sim.js';
import { pathLength } from './nav.js';
import { CAPTAIN, QUIRK_TEXT, hireFee } from './captains.js';
import { QUEST, QUEST_KINDS } from './quests.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLASS_LABEL = { river: 'River', coastal: 'Coastal', ocean: 'Ocean' };
const MODE_LABEL = { normal: 'Load & go', full: 'Wait for full load', transfer: 'Unload & transfer', unload: 'Unload only' };
const MODES = ['normal', 'full', 'transfer', 'unload'];
const pct = (v) => `${Math.round(v * 100)}%`;
const bar = (v, cls = '') => `<span class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;

export class UI {
  constructor(sim, view, actions) {
    this.sim = sim;
    this.view = view;
    this.act = actions;
    this.panel = $('#panel');
    this.body = $('#panel .pb');
    this.title = $('#panel .title');
    this.sel = null;
    this.mode = null; // 'town' | 'boat' | 'buy' | 'fleet' | 'towns' | 'finance' | 'help' | 'menu'
    this.editing = null;
    this.lastTouch = 0;
    this.refreshT = 0;
    this.townSort = 'size';
    this.lastChatter = -1e9;
    this.questTab = 'open';
    this.questPick = null;
    this.etaCache = null;
    try { this.chatterOn = localStorage.getItem('archipelago-chatter') !== 'off'; } catch { this.chatterOn = true; }

    $('#panel .x').addEventListener('click', () => this.close());
    this.panel.addEventListener('pointerdown', () => { this.lastTouch = performance.now(); });
    this.panel.addEventListener('click', (e) => this._click(e));
    $('#speed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]');
      if (b) { this.sim.speed = Number(b.dataset.speed); this._speedButtons(); }
    });
    $('#navbtns').addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (!b) return;
      const m = b.dataset.open;
      if (m === 'captains') this.capBoat = null;
      if (this.mode === m) this.close(); else this.open(m);
    });
    $('#editbar').addEventListener('click', (e) => { if (e.target.closest('[data-act=done]')) this.stopEditing(); });
    $('#news').addEventListener('click', (e) => {
      const n = e.target.closest('.n');
      if (n && n._ref) this.focusRef(n._ref);
    });
    this._speedButtons();
    sim.on((ev) => this._event(ev));
  }

  _speedButtons() {
    for (const b of document.querySelectorAll('#speed [data-speed]')) b.classList.toggle('on', Number(b.dataset.speed) === this.sim.speed);
  }

  // ---------------------------------------------------------------- news

  _event(ev) {
    if (ev.kind === 'coins') {
      const b = ev.ref.boat;
      this.view.float(`+${money(ev.ref.amount)}`, b.x, 1.5, b.z, 'coin');
      return;
    }
    if (ev.kind === 'captain') {
      // Captains talk a lot. Keep it to one remark every so often.
      const now = performance.now();
      if (!this.chatterOn || now - this.lastChatter < 20000) return;
      this.lastChatter = now;
    }
    this.news(ev.text, ev.kind, ev.ref);
  }

  news(text, kind = 'info', ref = null) {
    const box = $('#news');
    const el = document.createElement('div');
    el.className = `n ${kind}`;
    el.textContent = text;
    el._ref = ref;
    box.prepend(el);
    while (box.children.length > 4) box.lastChild.remove();
    setTimeout(() => { el.classList.add('fade'); setTimeout(() => el.remove(), 600); }, kind === 'captain' ? 8000 : 6000);
  }

  focusRef(ref) {
    if (!ref) return;
    if (ref.quest) { this.questTab = ref.quest.state === 'active' ? 'active' : 'open'; this.questPick = null; this.open('quests'); return; }
    if (ref.orders) { this.select({ type: 'boat', obj: ref }); this.view.focus(ref.x, ref.z, Math.min(this.view.rig.dist, 60)); }
    else if (ref.tier) { this.select({ type: 'town', obj: ref }); this.view.focus(ref.x, ref.z, Math.min(this.view.rig.dist, 90)); }
  }

  // ---------------------------------------------------------------- panel management

  open(mode) {
    this.mode = mode;
    this.panel.classList.add('show');
    this.render();
    this._inset();
  }

  _inset() {
    document.body.classList.toggle('po', !!this.mode);
    if (!this.mode) { this.view.setInset(0, 0); return; }
    const r = this.panel.getBoundingClientRect();
    const bottomSheet = r.left < 40;
    this.view.setInset(bottomSheet ? 0 : innerWidth - r.left, bottomSheet ? innerHeight - r.top : 0);
  }

  close() {
    if (this.editing) this.stopEditing();
    this.mode = null;
    this.sel = null;
    this.view.select(null);
    this.panel.classList.remove('show');
    this._inset();
  }

  select(sel) {
    if (this.editing && sel && sel.type === 'town') { this.addStop(sel.obj); return; }
    if (this.editing && (!sel || sel.obj !== this.editing)) this.stopEditing();
    this.sel = sel;
    this.view.select(sel);
    if (!sel) { if (this.mode === 'town' || this.mode === 'boat') this.close(); return; }
    this.open(sel.type);
  }

  tick(dt) {
    $('#cash').textContent = money(this.sim.money);
    $('#cash').classList.toggle('neg', this.sim.money < 0);
    $('#date').textContent = dateString(this.sim.day);
    const nOpen = this.sim.quests.filter((q) => q.state === 'open').length;
    const badge = $('#qbadge');
    if (badge && badge.textContent !== String(nOpen || '')) badge.textContent = nOpen || '';
    const w = this.sim.weather, wi = w.info;
    $('#wx').textContent = `${wi.icon} ${wi.label} · wind ${w.windKmh()} km/h`;
    $('#wx').title = wi.speed < 1 ? `Boats at sea sail at ${Math.round(wi.speed * 100)}% speed. Rivers are sheltered.` : 'Good sailing weather.';
    this.refreshT -= dt;
    if (this.mode && this.refreshT <= 0 && performance.now() - this.lastTouch > 700) {
      this.refreshT = 0.5;
      this.render();
    }
  }

  render() {
    const m = this.mode;
    let html = '', title = '';
    if (m === 'town' && this.sel) [title, html] = this._town(this.sel.obj);
    else if (m === 'boat' && this.sel) [title, html] = this._boat(this.sel.obj);
    else if (m === 'buy') [title, html] = this._buy(this.buyTown);
    else if (m === 'fleet') [title, html] = this._fleet();
    else if (m === 'towns') [title, html] = this._towns();
    else if (m === 'finance') [title, html] = this._finance();
    else if (m === 'routes') [title, html] = this._routes();
    else if (m === 'quests') [title, html] = this._quests();
    else if (m === 'captains') [title, html] = this._captains();
    else if (m === 'help') [title, html] = this._help();
    else if (m === 'menu') [title, html] = this._menu();
    else { this.panel.classList.remove('show'); return; }
    this.title.textContent = title;
    if (this.body._html !== html) { this.body._html = html; this.body.innerHTML = html; this._inset(); }
    for (const b of document.querySelectorAll('#navbtns [data-open]')) b.classList.toggle('on', b.dataset.open === m);
  }

  // ---------------------------------------------------------------- town

  _town(t) {
    const s = this.sim;
    const reach = ['river', 'coastal', 'ocean'].filter((c) => s.nav.canReach(t, c));
    const dock = reach.includes('ocean') ? 'Deep-water port' : reach.includes('coastal') ? 'Coastal harbour' : 'River landing';
    let h = `<div class="sub">${TIER[t.tier].label} · population ${t.pop.toLocaleString('en-US')}</div>`;
    h += `<div class="chips"><span class="chip">🌊 ${dock}</span>${t.shipyard ? '<span class="chip gold">⚓ Shipyard</span>' : ''}</div>`;
    h += `<p class="dim small">Reachable by ${reach.map((c) => CLASS_LABEL[c].toLowerCase()).join(', ')} boats.</p>`;
    h += '<h4>Cargo for collection</h4><table class="cargo">';
    for (const c of Object.keys(t.prod)) {
      const C = CARGO[c];
      const tr = t.transfer[c].reduce((a, p) => a + p.n, 0);
      h += `<tr><td class="nw">${C.icon} ${C.name}</td><td class="num">${Math.round(t.prod[c] * 30)}/mo</td>`;
      if (t.served[c]) h += `<td class="num">${Math.floor(t.waiting[c] + tr)} waiting</td><td class="nw" title="Rating">${bar(t.rating[c], t.rating[c] < 0.4 ? 'bad' : '')} ${pct(t.rating[c])}</td>`;
      else h += '<td colspan="2" class="dim small">No boat collects this here yet</td>';
      h += '</tr>';
    }
    for (const c of Object.keys(CARGO)) {
      if (t.prod[c]) continue;
      const tr = t.transfer[c].reduce((a, p) => a + p.n, 0);
      if (tr > 0) h += `<tr><td>${CARGO[c].icon} ${CARGO[c].name}</td><td></td><td class="num">${tr} transferred</td><td></td></tr>`;
    }
    h += '</table>';
    const tq = s.quests.filter((q) => q.state === 'open' && q.from === t.id);
    for (const q of tq) h += `<div class="qnote">${QUEST[q.tpl].icon} <b>${esc(QUEST[q.tpl].title)}</b> to ${esc(s.a.towns[q.to].name)} · <span class="pos">${money(q.reward)}</span> <button class="chip gold" data-act="pickquest" data-id="${q.id}">View quest</button></div>`;
    h += `<h4>Accepts</h4><div class="chips">${[...t.accepts].map((c) => `<span class="chip">${CARGO[c].icon} ${CARGO[c].name}</span>`).join('')}</div>`;
    if (t.factory) h += `<p class="small dim">Factories here turn delivered timber and grain into goods${t.factoryStock > 1 ? ` (${Math.round(t.factoryStock)} t in stock)` : ''}.</p>`;
    const calling = s.boats.filter((b) => b.orders.some((o) => o.town === t.id));
    if (calling.length) h += `<h4>Your boats calling here</h4><div class="list">${calling.map((b) => this._boatRow(b)).join('')}</div>`;
    h += '<div class="btns">';
    if (this.editing) h += `<button class="primary" data-act="addstop" data-id="${t.id}">Add to ${esc(this.editing.name)}'s route</button>`;
    if (t.shipyard) h += `<button class="primary" data-act="buyhere" data-id="${t.id}">⚓ Buy a boat here</button>`;
    h += `<button data-act="goto" data-x="${t.x}" data-z="${t.z}">📍 Look</button></div>`;
    return [t.name, h];
  }

  // ---------------------------------------------------------------- shipyard

  _buy(t) {
    const s = this.sim;
    let h = `<div class="sub">Shipyard at ${esc(t.name)} · ${s.yearNum}</div><div class="models">`;
    for (const m of s.available()) {
      const reach = s.nav.canReach(t, m.cls);
      const afford = s.money >= m.price;
      h += `<div class="model ${reach && afford ? '' : 'off'}">
        <div class="mh"><b>${m.name}</b><span class="chip">${CLASS_LABEL[m.cls]}</span></div>
        <div class="ms">${m.cargo.map((c) => CARGO[c].icon).join(' ')} ${m.cap} ${m.cargo.includes('pax') ? 'passengers' : 'tonnes'} · ${m.kmh} km/h · reliability ${pct(m.rel)}</div>
        <div class="ms dim">Running cost ${money(m.run)}/yr · lasts about ${m.life} years</div>
        <button class="primary" data-act="buy" data-model="${m.id}" ${reach && afford ? '' : 'disabled'}>${!reach ? "Can't reach this dock" : `Buy for ${money(m.price)}`}</button>
      </div>`;
    }
    const soon = Object.values(MODEL).filter((m) => m.year > s.yearNum).sort((a, b) => a.year - b.year)[0];
    if (soon) h += `<p class="dim small">Coming in ${soon.year}: ${soon.name}.</p>`;
    h += '</div><p class="small dim">River boats can go almost anywhere, including up rivers and channels. Coastal boats need open water. Ocean ships need deep-water ports.</p>';
    return ['Buy a boat', h];
  }

  // ---------------------------------------------------------------- boat

  status(b) {
    const s = this.sim;
    const tn = (id) => (id != null && s.a.towns[id] ? s.a.towns[id].name : '?');
    if (!s.captainOf(b)) return '⚠ Needs a captain';
    const q = b.quest != null ? s.quest(b.quest) : null;
    if (q && (b.state === 'sail' || b.state === 'load')) return `📜 ${q.phase === 'pickup' ? 'Collecting' : 'Delivering'} ${QUEST[q.tpl].title} ${q.phase === 'pickup' ? 'at' : 'to'} ${tn(q.phase === 'pickup' ? q.from : q.to)}`;
    switch (b.state) {
      case 'sail': return b.detour === b.target ? `Heading to ${tn(b.target)} for servicing` : `Sailing to ${tn(b.target)}`;
      case 'load': return `Loading at ${tn(b.at)}`;
      case 'broken': return '⚠ Broken down';
      case 'service': return `Being serviced at ${tn(b.at)}`;
      case 'lost': return "⚠ Can't find a route";
      default: return b.orders.length ? 'Waiting' : 'Idle: give it a route';
    }
  }

  _boatRow(b) {
    const s = this.sim;
    const p = b.profitLast != null ? b.profitLast : b.profitThis;
    return `<button class="row" data-act="selboat" data-id="${b.id}"><span class="nm">${esc(b.name)}</span><span class="dim small">${MODEL[b.model].name.split(' ')[0]} · ${this.status(b)}</span><span class="num ${p < 0 ? 'neg' : 'pos'}">${money(b.profitThis)}</span>${bar(b.rel / s.maxRel(b), b.rel < 0.4 ? 'bad' : '')}</button>`;
  }

  _boat(b) {
    const s = this.sim, m = MODEL[b.model];
    const cap = s.boatCap(b), load = s.load(b);
    const age = (s.day - b.built) / 360;
    let h = `<div class="sub">${m.name} · ${CLASS_LABEL[m.cls]}</div>`;
    h += `<div class="status ${b.state}">${this.status(b)}</div>`;
    h += `<div class="grid">
      <div><label>Cargo</label>${CARGO[b.cargoType].icon} ${load}/${cap} ${CARGO[b.cargoType].name.toLowerCase()} ${bar(load / cap)}</div>
      <div><label>Speed</label>${Math.round(s.boatKmh(b))} km/h</div>
      <div><label>Reliability</label>${bar(b.rel, b.rel < 0.4 ? 'bad' : '')} ${pct(b.rel)}</div>
      <div><label>Age</label>${age.toFixed(1)} of ~${m.life} years</div>
      <div><label>Profit this year</label><span class="${b.profitThis < 0 ? 'neg' : 'pos'}">${money(b.profitThis)}</span></div>
      <div><label>Last year</label>${b.profitLast == null ? '–' : `<span class="${b.profitLast < 0 ? 'neg' : 'pos'}">${money(b.profitLast)}</span>`}</div>
      <div><label>Last serviced</label>${Math.floor(s.day - b.lastService)} days ago</div>
      <div><label>Value</label>${money(s.boatValue(b))}</div>
    </div>`;
    h += this._boatCaptain(b);
    h += `<h4>Route ${b.orders.length > 1 ? `<span class="dim small">· round trip ≈ ${Math.round(s.routeDays(b) || 0)} days</span>` : ''}</h4>`;
    if (!b.orders.length) h += `<p class="dim small">${this.editing === b ? 'Tap towns on the map to add stops.' : 'No stops yet.'}</p>`;
    h += '<div class="orders">';
    b.orders.forEach((o, i) => {
      const t = s.a.towns[o.town];
      const cur = i === b.cur && b.detour == null;
      h += `<div class="order ${cur ? 'cur' : ''}"><span class="no">${i + 1}</span><button class="link" data-act="seltown" data-id="${t.id}">${esc(t.name)}</button>
        <button class="mode" data-act="mode" data-i="${i}">${MODE_LABEL[o.mode]}</button>
        <button class="del" data-act="delstop" data-i="${i}" aria-label="Remove">✕</button></div>`;
    });
    h += '</div><div class="btns">';
    h += this.editing === b ? '<button class="primary" data-act="done">✓ Done editing</button>' : `<button class="primary" data-act="edit">✏ ${b.orders.length ? 'Edit route' : 'Plan route'}</button>`;
    h += `<button data-act="follow">${this.act.following() === b ? '📍 Following' : '📍 Follow'}</button>`;
    h += `<button data-act="service">🔧 Service now</button></div>`;
    if (s.canUpgrade(b)) {
      h += '<h4>Shipyard</h4><div class="ups">';
      for (const [k, u] of Object.entries(UPGRADES)) {
        const lvl = b.up[k];
        const maxed = lvl >= u.max;
        h += `<button data-act="upgrade" data-k="${k}" ${maxed ? 'disabled' : ''}><b>${u.name} ${'★'.repeat(lvl)}${'☆'.repeat(u.max - lvl)}</b><small>${maxed ? 'Fully upgraded' : `${u.desc} · ${money(s.upgradeCost(b, k))}`}</small></button>`;
      }
      h += '</div>';
      if (m.cargo.length > 1) {
        h += `<div class="small dim">Refit to carry (${money(Math.round(m.price * 0.04))}, empties the hold):</div><div class="chips">`;
        for (const c of m.cargo) h += `<button class="chip ${c === b.cargoType ? 'gold' : ''}" data-act="refit" data-c="${c}" ${c === b.cargoType ? 'disabled' : ''}>${CARGO[c].icon} ${CARGO[c].name}</button>`;
        h += '</div>';
      }
    } else h += '<p class="small dim">Upgrades and cargo refits are done while the boat is docked at a shipyard ⚓.</p>';
    h += `<div class="btns"><button class="danger" data-act="sell">Sell for ${money(s.boatValue(b))}</button></div>`;
    return [b.name, h];
  }

  // ---------------------------------------------------------------- lists

  _fleet() {
    const s = this.sim;
    if (!s.boats.length) return ['Fleet', '<p>You have no boats yet. Tap a town with a shipyard ⚓ (the port cities and large towns) and buy one.</p><div class="btns"><button class="primary" data-act="yards">Show me a shipyard</button></div>'];
    const total = s.boats.reduce((a, b) => a + b.profitThis, 0);
    return [`Fleet (${s.boats.length})`, `<div class="sub">Profit this year: <span class="${total < 0 ? 'neg' : 'pos'}">${money(total)}</span></div><div class="list">${s.boats.map((b) => this._boatRow(b)).join('')}</div>`];
  }

  _towns() {
    const s = this.sim;
    const order = { city: 0, large: 1, medium: 2, small: 3 };
    const ts = [...s.a.towns].sort(this.townSort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => order[a.tier] - order[b.tier] || b.pop - a.pop);
    let h = `<div class="chips"><button class="chip ${this.townSort === 'size' ? 'gold' : ''}" data-act="sort" data-s="size">By size</button><button class="chip ${this.townSort === 'name' ? 'gold' : ''}" data-act="sort" data-s="name">By name</button></div><div class="list">`;
    for (const t of ts) {
      const served = Object.values(t.served).some(Boolean);
      h += `<button class="row" data-act="seltown" data-id="${t.id}" data-go="1"><span class="nm">${esc(t.name)} ${t.shipyard ? '⚓' : ''}</span><span class="dim small">${TIER[t.tier].label} · ${t.pop.toLocaleString('en-US')}</span><span class="small ${served ? 'pos' : 'dim'}">${served ? '● served' : '○'}</span></button>`;
    }
    return [`Towns (${ts.length})`, h + '</div>'];
  }

  _finance() {
    const s = this.sim;
    const months = s.months;
    const totals = months.map((m) => s.monthTotals(m));
    const cur = totals[totals.length - 1], prev = totals[totals.length - 2];
    const yr = s.yearNum;
    const startIdx = Math.max(0, months.length - 1 - (Math.floor(s.day) % 360) / 30 | 0);
    const ytdIncome = {};
    for (let i = startIdx; i < months.length; i++) for (const [c, v] of Object.entries(months[i].income)) ytdIncome[c] = (ytdIncome[c] || 0) + v;
    let h = `<div class="grid">
      <div><label>Cash</label><b class="${s.money < 0 ? 'neg' : ''}">${money(s.money)}</b></div>
      <div><label>Loan (6%/yr)</label><b>${money(s.loan)}</b> <span class="dim small">of ${money(s.maxLoan)}</span></div>
      <div><label>Company value</label><b>${money(s.companyValue())}</b></div>
      <div><label>Boats</label><b>${s.boats.length}</b></div>
    </div>
    <div class="btns"><button data-act="borrow">Borrow $10,000</button><button data-act="repay">Repay $10,000</button></div>`;
    const row = (label, a, b) => `<tr><td>${label}</td><td class="num">${money(a)}</td><td class="num dim">${b == null ? '' : money(b)}</td></tr>`;
    const m = months[months.length - 1], pm = months[months.length - 2];
    h += `<h4>This month <span class="dim small">vs last</span></h4><table class="fin">
      ${row('Income', cur.income, prev && prev.income)}
      ${row('Running costs', -m.running, pm && -pm.running)}
      ${row('Servicing', -m.service, pm && -pm.service)}
      ${row("Captains' wages", -(m.wages || 0), pm && -(pm.wages || 0))}
      ${row('Quests', m.quests || 0, pm && (pm.quests || 0))}
      ${row('New boats', -m.boats, pm && -pm.boats)}
      ${row('Upgrades & refits', -m.upgrades, pm && -pm.upgrades)}
      ${row('Loan interest', -m.interest, pm && -pm.interest)}
      <tr class="tot"><td>Profit</td><td class="num ${cur.profit < 0 ? 'neg' : 'pos'}">${money(cur.profit)}</td><td class="num dim">${prev ? money(prev.profit) : ''}</td></tr></table>`;
    const last = totals.slice(-12);
    const max = Math.max(1, ...last.map((t) => Math.abs(t.profit)));
    h += '<h4>Monthly profit</h4><div class="chart">';
    last.forEach((t, i) => {
      const idx = months.length - last.length + i;
      const monthNo = (Math.floor(s.day / 30) - (months.length - 1 - idx)) % 12;
      const hgt = Math.abs(t.profit) / max * 50;
      h += `<div class="col" title="${money(t.profit)}"><div class="up">${t.profit > 0 ? `<i style="height:${hgt}px"></i>` : ''}</div><div class="dn">${t.profit < 0 ? `<i style="height:${hgt}px"></i>` : ''}</div><span>${MONTHS[(monthNo + 12) % 12][0]}</span></div>`;
    });
    h += '</div>';
    const inc = Object.entries(ytdIncome).sort((a, b) => b[1] - a[1]);
    if (inc.length) h += `<h4>Income in ${yr} by cargo</h4><table class="fin">${inc.map(([c, v]) => `<tr><td>${CARGO[c].icon} ${CARGO[c].name}</td><td class="num">${money(v)}</td></tr>`).join('')}</table>`;
    return ['Finances', h];
  }

  // ---------------------------------------------------------------- captains

  _capStats(c) {
    const st = (v, good) => { const d = Math.round((v - 1) * 100); return d === 0 ? '<span class="dim">±0%</span>' : `<span class="${(d > 0) === good ? 'pos' : 'neg'}">${d > 0 ? '+' : ''}${d}%</span>`; };
    return `<span class="capstats">Speed ${st(c.speed, true)} · Wear ${st(c.care, false)} · Haggling ${st(c.haggle, true)}${c.quirk ? ` · <i>${QUIRK_TEXT[c.quirk]}</i>` : ''}</span>`;
  }

  _boatCaptain(b) {
    const s = this.sim, c = s.captainOf(b);
    if (c) return `<div class="cap"><span class="face">${c.face}</span><div><b>${esc(c.name)}</b>${this._capStats(c)}</div><button class="small" data-act="opencaps">Change</button></div>`;
    const free = s.crew.filter((x) => x.boat == null);
    let h = '<div class="cap warn"><span class="face">⚓</span><div><b>No captain</b><span class="small">This boat won\'t move until someone takes the wheel.</span></div></div><div class="chips">';
    for (const f of free) h += `<button class="chip" data-act="assign" data-id="${f.id}" data-boat="${b.id}">${CAPTAIN[f.id].face} ${esc(CAPTAIN[f.id].name)}</button>`;
    return h + '<button class="chip gold" data-act="opencaps">🧑‍✈️ Hire a captain</button></div>';
  }

  _captains() {
    const s = this.sim;
    const forBoat = this.capBoat != null ? s.boats.find((x) => x.id === this.capBoat) : null;
    const needy = s.boats.filter((b) => !s.captainOf(b));
    let h = '';
    if (needy.length) h += `<p class="small"><span class="neg">⚠ ${needy.length} boat${needy.length > 1 ? 's' : ''} without a captain:</span> ${needy.map((b) => esc(b.name)).join(', ')}</p>`;
    h += `<h4>Your captains <span class="dim small">(${s.crew.length})</span></h4>`;
    if (!s.crew.length) h += '<p class="small dim">Nobody yet. Every boat needs a captain, so hire one below.</p>';
    h += '<div class="list">';
    for (const cr of s.crew) {
      const c = CAPTAIN[cr.id];
      const boat = cr.boat != null ? s.boats.find((x) => x.id === cr.boat) : null;
      h += `<div class="capcard"><div class="cap"><span class="face">${c.face}</span><div><b>${esc(c.name)}</b>${this._capStats(c)}<span class="small dim">${money(c.wage)}/yr · ${boat ? `Captain of <button class="link" data-act="selboat" data-id="${boat.id}">${esc(boat.name)}</button>` : 'Ashore, still on wages'}</span></div></div>`;
      h += '<div class="chips">';
      if (forBoat && (!boat || boat.id !== forBoat.id)) h += `<button class="chip gold" data-act="assign" data-id="${cr.id}" data-boat="${forBoat.id}">Put on ${esc(forBoat.name)}</button>`;
      else if (!boat && needy.length) for (const nb of needy.slice(0, 4)) h += `<button class="chip gold" data-act="assign" data-id="${cr.id}" data-boat="${nb.id}">Put on ${esc(nb.name)}</button>`;
      if (boat) h += `<button class="chip" data-act="ashore" data-id="${cr.id}">Bring ashore</button>`;
      h += `<button class="chip danger" data-act="fire" data-id="${cr.id}">Let go</button></div></div>`;
    }
    h += '</div>';
    h += `<h4>Looking for work</h4><p class="small dim">New faces turn up at the harbour every month or two. Hiring fee is a quarter of a year's wage.</p><div class="list">`;
    if (!s.pool.length) h += '<p class="small dim">Nobody is looking for work right now.</p>';
    const target = forBoat || needy[0];
    for (const id of s.pool) {
      const c = CAPTAIN[id];
      h += `<div class="capcard"><div class="cap"><span class="face">${c.face}</span><div><b>${esc(c.name)}</b><span class="small bio">${esc(c.bio)}</span>${this._capStats(c)}<span class="small dim">${money(c.wage)}/yr</span></div></div>
        <div class="chips"><button class="chip gold" data-act="hire" data-id="${id}" ${target ? `data-boat="${target.id}"` : ''}>Hire for ${money(hireFee(c))}${target ? ` → ${esc(target.name)}` : ''}</button></div></div>`;
    }
    h += '</div>';
    return [forBoat ? `Captains · for ${forBoat.name}` : 'Captains', h];
  }

  // ---------------------------------------------------------------- quests

  _questEtas(q) {
    const c = this.etaCache;
    if (c && c.q === q.id && performance.now() - c.t < 3000) return c.list;
    const s = this.sim;
    const list = s.boats.map((b) => {
      const why = s.questProblem(q, b);
      const eta = why ? null : s.questEta(q, b);
      return { b, why: why || (eta == null ? 'No route' : null), eta };
    }).sort((x, y) => (x.why ? 1 : 0) - (y.why ? 1 : 0) || (x.eta ?? 1e9) - (y.eta ?? 1e9));
    this.etaCache = { q: q.id, t: performance.now(), list };
    return list;
  }

  _questCard(q) {
    const s = this.sim, tpl = QUEST[q.tpl], T = s.a.towns;
    const K = QUEST_KINDS[tpl.kind];
    const town = (id) => `<button class="link" data-act="questtown" data-id="${id}">${esc(T[id].name)}</button>`;
    let h = `<div class="quest ${tpl.kind}"><div class="qh"><span class="qi">${tpl.icon}</span><div><b>${esc(tpl.title)}</b><span class="small dim">${K.icon} ${K.label} · ${town(q.from)} → ${town(q.to)} · ${Math.round(q.km)} km</span></div><span class="qr">${money(q.reward)}</span></div>`;
    h += `<p class="qt">${esc(s.questText(q))}</p>`;
    const needs = tpl.cap > 1 ? ` · needs a hold of ${tpl.cap}+` : '';
    const who = q.classes.map((c) => ({ river: 'river', coastal: 'coastal', ocean: 'ocean' }[c])).join(', ');
    if (q.state === 'open') {
      h += `<div class="small dim">⏱ ${q.limit} days to deliver once accepted · offer ends in ${Math.max(0, Math.ceil(q.expires - s.day))} days · ${who} boats${needs}</div>`;
      if (this.questPick === q.id) {
        const list = this._questEtas(q);
        h += '<div class="pick"><div class="small"><b>Which boat?</b> <span class="dim">Fastest first. The boat leaves its route and returns to it afterwards.</span></div>';
        const ok = list.filter((r) => !r.why);
        if (!ok.length) h += '<p class="small neg">None of your boats can take this one.</p>';
        for (const r of ok.slice(0, 8)) {
          const late = r.eta > q.limit;
          h += `<div class="prow"><span class="nm">${esc(r.b.name)} <span class="dim small">${MODEL[r.b.model].name.split(' ')[0]} · ${esc(this.status(r.b))}</span></span><span class="small ${late ? 'neg' : 'pos'}">≈ ${Math.ceil(r.eta)} days${late ? ' (too slow!)' : ''}</span><button class="chip gold" data-act="sendquest" data-q="${q.id}" data-boat="${r.b.id}">Send</button></div>`;
        }
        const bad = list.filter((r) => r.why);
        if (bad.length) h += `<div class="small dim">Can't go: ${bad.slice(0, 6).map((r) => `${esc(r.b.name)} (${r.why.toLowerCase()})`).join(', ')}${bad.length > 6 ? '…' : ''}</div>`;
        h += '<div class="chips"><button class="chip" data-act="unpick">Cancel</button></div></div>';
      } else h += `<div class="chips"><button class="chip gold" data-act="pickquest" data-id="${q.id}">Send a boat</button></div>`;
    } else if (q.state === 'active') {
      const b = s.boats.find((x) => x.id === q.boat);
      const left = q.deadline - s.day;
      h += `<div class="small">${b ? `<button class="link" data-act="selboat" data-id="${b.id}">${esc(b.name)}</button>` : '?'} is ${q.phase === 'pickup' ? `on the way to collect at ${esc(T[q.from].name)}` : `delivering to ${esc(T[q.to].name)}`} · <span class="${left < 3 ? 'neg' : ''}">${Math.max(0, Math.ceil(left))} days left</span> ${bar(1 - left / q.limit, left < 3 ? 'bad' : '')}</div>`;
      h += `<div class="chips"><button class="chip danger" data-act="abandon" data-id="${q.id}">Abandon</button></div>`;
    } else {
      const lbl = { done: `<span class="pos">✓ Done · +${money(q.reward)}</span>`, failed: '<span class="neg">✗ Failed</span>', expired: '<span class="dim">Nobody took it</span>' }[q.state];
      h = `<div class="quest done"><div class="qh"><span class="qi">${tpl.icon}</span><div><b>${esc(tpl.title)}</b><span class="small dim">${esc(T[q.from].name)} → ${esc(T[q.to].name)} · ${dateString(q.ended)}</span></div><span class="small">${lbl}</span></div>`;
      if (q.state !== 'expired') h += `<p class="qt small">${esc(s.questText(q, q.state === 'done' ? 'done' : 'fail'))}</p>`;
    }
    return h + '</div>';
  }

  _quests() {
    const s = this.sim;
    const open = s.quests.filter((q) => q.state === 'open').sort((a, b) => (QUEST[b.tpl].kind === 'emergency') - (QUEST[a.tpl].kind === 'emergency') || b.reward - a.reward);
    const active = s.quests.filter((q) => q.state === 'active');
    const tab = this.questTab;
    const earned = s.questLog.filter((q) => q.state === 'done').reduce((t, q) => t + q.reward, 0);
    let h = `<div class="chips"><button class="chip ${tab === 'open' ? 'gold' : ''}" data-act="qtab" data-t="open">Available (${open.length})</button><button class="chip ${tab === 'active' ? 'gold' : ''}" data-act="qtab" data-t="active">Under way (${active.length})</button><button class="chip ${tab === 'log' ? 'gold' : ''}" data-act="qtab" data-t="log">History</button></div>`;
    const list = tab === 'open' ? open : tab === 'active' ? active : s.questLog;
    if (!list.length) h += `<p class="small dim">${tab === 'open' ? 'No quests right now. Townsfolk post new ones every week or so.' : tab === 'active' ? 'No quests under way. Pick one from Available.' : 'Nothing yet.'}</p>`;
    if (tab === 'log' && earned) h += `<div class="sub">Earned from recent quests: <span class="pos">${money(earned)}</span></div>`;
    for (const q of list) h += this._questCard(q);
    return ['Quests', h];
  }

  // ---------------------------------------------------------------- routes

  _routeGroups() {
    const s = this.sim, groups = new Map();
    for (const b of s.boats) {
      let key = 'none';
      if (b.orders.length) {
        const ids = b.orders.map((o) => o.town);
        const i = ids.indexOf(Math.min(...ids));
        key = [...ids.slice(i), ...ids.slice(0, i)].join('>');
      }
      if (!groups.has(key)) groups.set(key, { key, boats: [], ids: b.orders.map((o) => o.town) });
      groups.get(key).boats.push(b);
    }
    return [...groups.values()];
  }

  _routeStats(g) {
    const s = this.sim, a = s.a;
    const st = { income: 0, profit: 0, incomeLast: 0, profitLast: 0, hasLast: false, units: 0, loadSum: 0, loadN: 0, sailed: 0, paid: 0, days: 0 };
    for (const b of g.boats) {
      st.income += b.incomeThis || 0;
      st.profit += b.profitThis;
      if (b.profitLast != null) { st.hasLast = true; st.profitLast += b.profitLast; st.incomeLast += b.incomeLast || 0; }
      st.units += b.unitsThis || 0;
      st.loadSum += b.loadSum || 0; st.loadN += b.loadN || 0;
    }
    if (g.key !== 'none') {
      const b = g.boats[0], cls = MODEL[b.model].cls;
      for (let i = 0; i < g.ids.length; i++) {
        const A = a.towns[g.ids[i]], B = a.towns[g.ids[(i + 1) % g.ids.length]];
        const pts = s.nav.route(A.berthX, A.berthZ, B, cls);
        if (pts) st.sailed += pathLength(pts) * KM_PER_UNIT;
        st.paid += Math.hypot(A.x - B.x, A.z - B.z) * KM_PER_UNIT;
      }
      st.days = s.routeDays(b) || 0;
    }
    st.costs = st.income - st.profit;
    st.load = st.loadN ? st.loadSum / st.loadN : null;
    return st;
  }

  _routes() {
    const s = this.sim, a = s.a;
    if (!s.boats.length) return ['Routes', '<p>No routes yet. Buy a boat at a shipyard ⚓ and give it some stops.</p>'];
    const dayOfYear = Math.floor(s.day) % 360;
    const groups = this._routeGroups().map((g) => ({ g, st: this._routeStats(g) })).sort((x, y) => (x.g.key === 'none') - (y.g.key === 'none') || y.st.profit - x.st.profit);
    const total = groups.reduce((t, r) => t + r.st.profit, 0);
    let h = `<div class="sub">${groups.filter((r) => r.g.key !== 'none').length} routes · profit so far this year <span class="${total < 0 ? 'neg' : 'pos'}">${money(total)}</span> <span class="dim small">(day ${dayOfYear + 1} of 360)</span></div>`;
    for (const { g, st } of groups) {
      const names = g.key === 'none' ? 'No route yet' : g.ids.map((id) => esc(a.towns[id].name)).join(' → ') + ' ↺';
      const perBoat = st.profit / g.boats.length;
      const margin = st.income > 0 ? st.profit / st.income : null;
      const verdict = g.key === 'none' ? '' : dayOfYear < 30 && !st.hasLast ? '<span class="chip">🆕 Just started</span>'
        : st.profit < 0 ? '<span class="chip bad">⚠ Losing money</span>' : margin != null && margin > 0.45 ? '<span class="chip good">💰 Money spinner</span>' : '<span class="chip">👍 Paying its way</span>';
      const cargos = [...new Set(g.boats.map((b) => b.cargoType))].map((c) => CARGO[c].icon).join(' ');
      h += `<div class="route"><div class="rh"><b>${names}</b>${verdict}</div>`;
      if (g.key !== 'none') {
        h += `<div class="grid">
          <div><label>Boats</label>${g.boats.length} · ${cargos}</div>
          <div><label>Round trip</label>≈ ${Math.round(st.days)} days</div>
          <div><label>Distance</label>${st.sailed.toFixed(0)} km sailed <span class="dim small">· ${st.paid.toFixed(0)} km paid</span>${st.sailed > st.paid * 1.8 + 5 ? ' <span class="neg small">long way round!</span>' : ''}</div>
          <div><label>Leaves stops</label>${st.load == null ? '–' : `${bar(st.load)} ${pct(st.load)} full`}</div>
          <div><label>Income this year</label>${money(st.income)}</div>
          <div><label>Costs this year</label>${money(st.costs)}</div>
          <div><label>Profit this year</label><span class="${st.profit < 0 ? 'neg' : 'pos'}">${money(st.profit)}</span>${margin != null ? ` <span class="dim small">${pct(margin)} margin</span>` : ''}</div>
          <div><label>Last year</label>${st.hasLast ? `<span class="${st.profitLast < 0 ? 'neg' : 'pos'}">${money(st.profitLast)}</span>` : '–'}</div>
          <div><label>Per boat</label><span class="${perBoat < 0 ? 'neg' : 'pos'}">${money(perBoat)}</span></div>
          <div><label>Delivered</label>${Math.round(st.units).toLocaleString('en-US')} units</div>
        </div>`;
      }
      h += `<div class="list">${g.boats.map((b) => this._boatRow(b)).join('')}</div>`;
      if (g.key !== 'none') h += `<div class="btns"><button data-act="showroute" data-id="${g.boats[0].id}">🗺 Show on map</button></div>`;
      h += '</div>';
    }
    h += '<p class="small dim">Boats with the same stops in the same order count as one route. Costs include running costs, captains\' wages and servicing for those boats.</p>';
    return ['Routes', h];
  }

  _help() {
    return ['How to play', `
      <ol class="help">
        <li><b>Buy a boat</b> at a shipyard ⚓. Port cities and large towns have one.</li>
        <li><b>Plan its route.</b> Tap <i>Plan route</i>, then tap towns on the map to add stops. The boat sails them in a loop.</li>
        <li><b>Carry cargo.</b> Passengers and mail go to any town. Food and goods go to most towns. Timber and grain go to factories in large towns and cities, which then make more goods to ship.</li>
        <li><b>Get paid</b> by distance (in a straight line) and speed. Slow deliveries pay less.</li>
        <li><b>Be reliable.</b> Towns give you more cargo when your boats call often and the cargo doesn't pile up. Boats wear out and break down, so keep them serviced. They also get a service when they visit a shipyard.</li>
        <li><b>Hire captains.</b> Every boat needs one before it will sail. Each captain has their own speed, care for the boat, haggling skill and wage, and opinions. So many opinions.</li>
        <li><b>Take on quests.</b> Townsfolk post odd jobs (📜 on the map) that pay very well. Send a boat that's nearby and fast enough, before someone else's poodle loses patience.</li>
        <li><b>Watch the weather.</b> Fog and storms slow boats at sea, and storms wear them out faster. Rivers are sheltered.</li>
        <li><b>Grow.</b> Upgrade engines, hulls and holds at a shipyard. Newer boat models arrive over the years.</li>
      </ol>
      <p class="small dim">River boats can travel up rivers and through channels across islands. Coastal and ocean boats are bigger and faster but limited to open water and bigger ports. Use <i>Unload & transfer</i> stops to move cargo between them.</p>
      <p class="small dim">Controls: drag to pan, pinch or scroll to zoom, two-finger twist or right-drag to rotate. Tap a town or boat to inspect it. The game saves itself every month.</p>`];
  }

  _menu() {
    return ['Menu', `<div class="btns col">
      <button data-act="save">💾 Save now</button>
      <button data-act="chatter">${this.chatterOn ? '🔇 Mute captain chatter' : '💬 Unmute captain chatter'}</button>
      <button data-act="newgame" class="danger">🗺 New game (new archipelago)</button></div>
      <p class="small dim">The game autosaves every month in this browser.</p>`];
  }

  // ---------------------------------------------------------------- actions

  _click(e) {
    const b = e.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const s = this.sim;
    const act = b.dataset.act;
    const boat = this.sel && this.sel.type === 'boat' ? this.sel.obj : null;
    const err = (m) => m && this.news(m, 'bad');
    switch (act) {
      case 'buyhere': this.buyTown = s.a.towns[Number(b.dataset.id)]; this.open('buy'); break;
      case 'buy': {
        const r = s.buy(b.dataset.model, this.buyTown);
        if (typeof r === 'string') err(r);
        else {
          this.news(`${r.name} launched at ${this.buyTown.name}. Now tap towns to give it a route.`, 'good', r);
          if (!s.captainOf(r)) this.news(`${r.name} needs a captain before it can sail. Hire one from 🧑‍✈️ Captains.`, 'bad', r);
          this.select({ type: 'boat', obj: r });
          this.startEditing(r);
          if (!r.orders.length) this.addStop(this.buyTown, true);
        }
        break;
      }
      case 'selboat': { const bt = s.boats.find((x) => x.id === Number(b.dataset.id)); if (bt) this.focusRef(bt); break; }
      case 'seltown': {
        const t = s.a.towns[Number(b.dataset.id)];
        if (b.dataset.go || !this.editing) this.focusRef(t);
        break;
      }
      case 'goto': this.view.focus(Number(b.dataset.x), Number(b.dataset.z), 60); break;
      case 'addstop': this.addStop(s.a.towns[Number(b.dataset.id)]); break;
      case 'edit': this.startEditing(boat); break;
      case 'done': this.stopEditing(); break;
      case 'mode': {
        const o = boat.orders[Number(b.dataset.i)];
        o.mode = MODES[(MODES.indexOf(o.mode) + 1) % MODES.length];
        break;
      }
      case 'delstop': {
        const orders = boat.orders.filter((_, i) => i !== Number(b.dataset.i));
        s.setOrders(boat, orders);
        this.view.refreshRoute();
        break;
      }
      case 'follow': this.act.follow(this.act.following() === boat ? null : boat); break;
      case 'service': err(s.sendForService(boat)); break;
      case 'upgrade': err(s.upgrade(boat, b.dataset.k)); break;
      case 'refit': err(s.refit(boat, b.dataset.c)); break;
      case 'sell':
        if (confirm(`Sell ${boat.name} for ${money(s.boatValue(boat))}?`)) { s.sell(boat); this.close(); }
        break;
      case 'sort': this.townSort = b.dataset.s; break;
      case 'qtab': this.questTab = b.dataset.t; this.questPick = null; break;
      case 'pickquest': this.questTab = 'open'; this.questPick = Number(b.dataset.id); this.etaCache = null; if (this.mode !== 'quests') this.open('quests'); break;
      case 'unpick': this.questPick = null; break;
      case 'sendquest': {
        const q = s.quest(Number(b.dataset.q)), bt = s.boats.find((x) => x.id === Number(b.dataset.boat));
        const r = s.acceptQuest(q, bt);
        if (r) err(r); else { this.questPick = null; this.questTab = 'active'; }
        break;
      }
      case 'abandon': {
        const q = s.quest(Number(b.dataset.id));
        if (q && confirm(`Abandon "${QUEST[q.tpl].title}"? You'll pay a ${money(Math.round(q.reward * 0.1 / 100) * 100)} penalty.`)) s.abandonQuest(q);
        break;
      }
      case 'questtown': { const t = s.a.towns[Number(b.dataset.id)]; this.view.focus(t.x, t.z, Math.max(this.view.rig.dist, 250)); break; }
      case 'hire': {
        const bt = b.dataset.boat ? s.boats.find((x) => x.id === Number(b.dataset.boat)) : null;
        err(s.hireCaptain(b.dataset.id, bt));
        break;
      }
      case 'fire': {
        const c = CAPTAIN[b.dataset.id];
        if (confirm(`Let ${c.name} go? Their boat will stop until it gets a new captain.`)) s.fireCaptain(b.dataset.id);
        break;
      }
      case 'assign': {
        const bt = s.boats.find((x) => x.id === Number(b.dataset.boat));
        if (bt) s.assignCaptain(b.dataset.id, bt);
        break;
      }
      case 'ashore': s.assignCaptain(b.dataset.id, null); break;
      case 'opencaps': this.capBoat = boat ? boat.id : null; this.open('captains'); break;
      case 'capfor': this.capFor = b.dataset.id === this.capFor ? null : b.dataset.id; break;
      case 'chatter':
        this.chatterOn = !this.chatterOn;
        try { localStorage.setItem('archipelago-chatter', this.chatterOn ? 'on' : 'off'); } catch { /* ignore */ }
        break;
      case 'showroute': {
        const bt = s.boats.find((x) => x.id === Number(b.dataset.id));
        if (bt) { this.select({ type: 'boat', obj: bt }); this.view.focus(bt.x, bt.z, Math.max(this.view.rig.dist, 300)); }
        break;
      }
      case 'borrow': err(s.borrow(10000)); break;
      case 'repay': err(s.repay(10000)); break;
      case 'yards': {
        const t = s.a.towns.find((x) => x.tier === 'city');
        this.focusRef(t);
        break;
      }
      case 'save': this.news(s.save() ? 'Game saved.' : "Couldn't save in this browser.", 'info'); break;
      case 'newgame': if (confirm('Start a new company on a new archipelago? Your current game will be lost.')) this.act.newGame(); break;
    }
    this.lastTouch = 0;
    this.render();
  }

  startEditing(b) {
    this.editing = b;
    $('#editbar').innerHTML = `<span>Tap towns to add stops to <b>${esc(b.name)}</b>'s route</span><button data-act="done">Done</button>`;
    $('#editbar').classList.add('show');
    this.render();
  }

  stopEditing() {
    const b = this.editing;
    this.editing = null;
    $('#editbar').classList.remove('show');
    if (b && b.orders.length === 1) this.news(`${b.name} needs at least two stops to make money.`, 'bad', b);
    this.render();
  }

  addStop(t, quiet = false) {
    const b = this.editing;
    if (!b) return;
    const s = this.sim;
    const cls = MODEL[b.model].cls;
    if (!s.nav.canReach(t, cls)) { this.news(`A ${CLASS_LABEL[cls].toLowerCase()} boat can't dock at ${t.name}.`, 'bad'); return; }
    const last = b.orders[b.orders.length - 1];
    if (last && last.town === t.id) return;
    if (last) {
      const A = s.a.towns[last.town];
      if (!s.nav.route(A.berthX, A.berthZ, t, cls)) { this.news(`No water route from ${A.name} to ${t.name} for this boat.`, 'bad'); return; }
    }
    s.setOrders(b, [...b.orders, { town: t.id, mode: 'normal' }]);
    if (!quiet) {
      const A = last ? s.a.towns[last.town] : null;
      let msg = `Stop ${b.orders.length}: ${t.name}`;
      if (A) {
        const km = Math.hypot(A.x - t.x, A.z - t.z) * KM_PER_UNIT;
        const water = pathLength(s.nav.route(A.berthX, A.berthZ, t, cls)) * KM_PER_UNIT;
        msg += ` · paid for ${km.toFixed(1)} km, sails ${water.toFixed(1)} km`;
        if (water > km * 2.2 && water - km > 8) msg += ' (a long way round!)';
      }
      this.news(msg, A && msg.includes('long way') ? 'bad' : 'info');
    }
    this.view.refreshRoute();
    this.sel = { type: 'boat', obj: b };
    this.view.selection = this.sel;
    this.mode = 'boat';
    this.render();
  }
}

export { START_YEAR };
