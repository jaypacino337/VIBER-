// Builder dashboard: hero with the main action (+ every other action in a menu), stats,
// the builder's own 3D office, its strategy, activity, portfolio chart, recent trades,
// notes & decisions, then positions, full history and the coin / wallet / fee details.
import { levelBar, strategyById, strategyRules, STRAT_ICONS, stratIcon, stratKey, sidePill, sourceChip, tokIcon, coinThumb, copyBtn, txLink, addrLink, esc, sol, signedSol, pct, tone, ago, agentNo, usd, short, age } from '../ui.js';
import { price, clockSec, dur } from '../format.js';
import { equityChart } from '../charts.js';
import { wallet, signAction, actionMessage } from '../wallet.js';
import { createOffice, OFFICE_NAMES } from '../office3d.js';
import { SKIN_MODELS } from '../skins3d.js';
import { robotParts } from '../robot.js';
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en'));
const sv = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  plus: sv('<path d="M12 5v14M5 12h14"/>', 2.6), play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/></svg>',
  down: sv('<path d="M12 4v12M6 11l6 6 6-6M5 20h14"/>'), x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  target: sv('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'), link: sv('<path d="M7 17L17 7M9 7h8v8"/>'),
  tag: sv('<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.5"/>'), star: sv('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  ext: sv('<path d="M7 17L17 7M9 7h8v8"/>'), chev: sv('<path d="M6 9l6 6 6-6"/>', 2.6), dots: sv('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>', 3),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'),
  office: sv('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M11 21v-3h2v3"/>'),
  wallet: sv('<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>'),
  bars: sv('<path d="M5 20v-6M10 20V9M15 20v-8M20 20V4"/>', 2.6), up: sv('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  swap: sv('<path d="M4 8h14l-3-3M20 16H6l3 3"/>'), coin: sv('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>'),
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#16A34A"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  bulb: sv('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4), brick: '<svg viewBox="0 0 32 24" aria-hidden="true"><rect x="2" y="8" width="28" height="14" rx="2" fill="currentColor"/><rect x="5" y="3" width="8" height="6" rx="2" fill="currentColor"/><rect x="19" y="3" width="8" height="6" rx="2" fill="currentColor"/></svg>',
};
// what each strategy does, step by step (Strategy card)
const STEPS = {
  classic: ['Scan the token board', 'Score momentum and dips', 'Lock gains when the trend fades', 'Hard stop loss and take profit'],
  scalper: ['Watch 5-minute momentum', 'Check that volume is rising', 'Quick entry, small size', 'Fast take profit, tight stop'],
  trend: ['Check 5m and 15m averages', 'Confirm 15m momentum', 'Ride the move with a trailing stop', 'Exit when momentum turns'],
  dip: ['Find coins that ran this hour', 'Wait for a 7–15% pullback', 'Buy the bounce off the low', 'Trailing stop locks the gains'],
  sniper: ['Measure every filter twice', 'Liquidity, volume and momentum', 'Never chase a spike', 'One position at a time'],
  newpairs: ['Scan new pairs', 'Check dev, bundles and holders', 'Tiny size, quick profit', 'Hard exits on any red flag'],
  custom: ['Your entry style', 'Your size and slots', 'Your take profit and stop', 'Your hold time and cooldown'],
};
const RANGES = { '1H': 3600e3, '1D': 86400e3, '7D': 7 * 86400e3, '30D': 30 * 86400e3 };

export function AgentPage(app, id) {
  let el, d = null, loading = false, lastFetch = 0, lastChart = 0, hovering = false, showAll = false, mode = null, menuOpen = false, range = '1D';
  const cfg = app.api.config;
  const rules = cfg.trading;
  const strat = () => strategyById(cfg, d?.strategy, [d?.customStrategy]) || { sizePct: rules.tradeSizePct, maxOpen: rules.maxOpenPositions, takeProfitPct: rules.takeProfitPct, stopLossPct: rules.stopLossPct, name: 'Blueprint', id: 'classic' };
  const isCreator = () => wallet.address && d && wallet.address === d.creator;

  const rangeBar = (pnl) => {
    const lo = strat().stopLossPct, hi = strat().takeProfitPct;
    const z = ((0 - lo) / (hi - lo)) * 100;
    const p = Math.max(0, Math.min(100, ((pnl - lo) / (hi - lo)) * 100));
    const t = pnl >= 0 ? 'up' : 'down';
    const left = Math.min(z, p), width = Math.abs(p - z);
    return `<div class="range" title="Stop loss ${pct(lo, 0)} · take profit ${pct(hi, 0)}"><div class="track"></div><div class="zero" style="left:${z}%"></div><div class="fill ${t}" style="left:${left}%;width:${width}%"></div><div class="mk ${t}" style="left:${p}%"></div></div>
      <div class="range-lbl"><span>SL ${pct(lo, 0)}</span><span>TP ${pct(hi, 0)}</span></div>`;
  };

  // ── actions (the main button + the menu) ──
  const tiles = () => {
    if (!d) return [];
    const mine = isCreator();
    const st = d.rawStatus;
    const T = [];
    if (st === 'ACTIVE') {
      T.push({ act: 'deposit', label: 'Add SOL', sub: 'fund the builder', bg: '#E4282E', icon: 'plus', creator: true });
      T.push(d.paused
        ? { act: 'resume', label: 'Resume', sub: 'start trading', bg: '#1E9C47', icon: 'play', creator: true }
        : { act: 'pause', label: 'Pause', sub: 'stop new trades', bg: '#E8A32E', icon: 'pause', creator: true, dark: true });
      T.push({ act: 'withdraw', label: 'Withdraw', sub: d.market ? 'locked: for sale' : 'SOL to your wallet', bg: '#3A3A42', icon: 'down', creator: true });
      T.push({ act: 'shill', label: 'Shill on X', sub: 'ready-made post', bg: '#0B0B0D', icon: 'x', creator: false, off: !d.coin?.mint });
      T.push({ act: 'strategy', label: 'Strategy', sub: strat().name, bg: '#2F5FD0', icon: 'target', creator: true });
      T.push({ act: 'pump', label: 'pump.fun', sub: 'coin page', bg: '#26262C', icon: 'link', creator: false, off: !d.coin?.mint });
      if (cfg.market?.enabled) {
        const L = d.market;
        T.push(L && L.escrow
          ? (mine ? { act: 'market-list', label: 'For sale', sub: `${+L.price.toFixed(4)} SOL · edit`, bg: '#0F7F72', icon: 'tag', creator: true }
            : { act: 'market-buy', label: 'Buy builder', sub: `${+L.price.toFixed(4)} SOL`, bg: '#0F7F72', icon: 'tag', creator: false })
          : L ? { act: 'market-escrow', label: 'Listing', sub: 'send the NFT', bg: '#0F7F72', icon: 'tag', creator: true }
          : d.nft?.asset ? { act: 'market-list', label: 'Sell builder', sub: 'on the market', bg: '#0F7F72', icon: 'tag', creator: true }
          : { act: 'market-list', label: 'Sell builder', sub: 'make it an NFT first', bg: '#0F7F72', icon: 'tag', creator: true, off: true });
      }
      if (d.x?.enabled) T.push(d.x.connected
        ? { act: 'x-card', label: '@' + d.x.handle, sub: 'posting on X', bg: '#000000', icon: 'x', creator: false }
        : { act: 'x-card', label: 'Connect X', sub: 'let it post on X', bg: '#000000', icon: 'x', creator: true });
      if (cfg.skins?.enabled) T.push({ act: 'skins', label: 'Skins', sub: d.skin ? ((cfg.skins.items || []).find((x) => x.id === d.skin)?.name || 'custom look') : 'new look', bg: '#8A3FD1', icon: 'star', creator: true });
    } else if (st === 'LAUNCH_FAILED') {
      T.push({ act: 'retry', label: 'Retry launch', sub: 'try again', bg: '#E4282E', icon: 'play', creator: true });
      T.push({ act: 'withdraw', label: 'Withdraw', sub: 'SOL to your wallet', bg: '#3A3A42', icon: 'down', creator: true });
    } else if (st === 'AWAITING_FUNDS') {
      T.push({ act: 'fund-launch', label: 'Send SOL', sub: sol(Math.max(0, d.requiredSol - d.balanceSol), 4) + ' SOL', bg: '#E4282E', icon: 'plus', creator: true });
      if (d.balanceSol > 0) T.push({ act: 'withdraw', label: 'Withdraw', sub: 'SOL to your wallet', bg: '#3A3A42', icon: 'down', creator: true });
    }
    return T.map((t) => ({ ...t, locked: t.creator && !mine }));
  };

  const act = (t) => {
    if (!t) return;
    if (t.act === 'connect') return app.openConnect();
    if (t.off && t.act === 'market-list') return app.toast(`<b>Make it an NFT first</b>Only NFT builders can be sold. Use <b>Make it an NFT</b> on this page (free).`);
    if (t.off) return;
    if (t.act === 'shill') return app.shill(d.id);
    if (t.act === 'market-buy') return app.marketBuy({ ...d, price: d.market.price, seller: d.market.seller }, () => fetchDetail(true));
    if (t.act === 'x-card' && (d.x?.connected || t.locked)) return el.querySelector('#ag-x')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (t.act === 'x-card') return app.agentAction('x-connect', d, () => fetchDetail(true));
    if (t.act === 'pump') return window.open('https://pump.fun/coin/' + encodeURIComponent(d.coin.mint), '_blank', 'noopener');
    if (t.locked) return app.toast(`<b>Creator only</b>Connect the creator wallet (${esc(short(d.creator, 4))}) to ${esc(t.label.toLowerCase())}.`);
    app.agentAction(t.act, d, () => fetchDetail(true));
  };
  const primary = () => {
    const T = tiles();
    if (!isCreator() && !wallet.address) return { act: 'connect', label: 'Connect wallet', icon: 'wallet' };
    const pick = T.find((t) => ['resume', 'pause', 'retry', 'fund-launch'].includes(t.act) && !t.locked) || T.find((t) => t.act === 'market-buy') || T.find((t) => t.act === 'shill' && !t.off) || T[0];
    return pick || null;
  };
  const menuHTML = () => {
    const p = primary();
    const T = tiles().filter((t) => !p || t.act !== p.act);
    if (!T.length) return '';
    return `<div class="ag-menu" role="menu">${T.map((t) => `<button type="button" role="menuitem" class="ag-mi${t.locked || t.off ? ' dim' : ''}" data-tile="${esc(t.act)}"><span class="ag-mi-ic" style="--tc:${esc(t.bg)}">${IC[t.locked ? 'lock' : t.icon] || ''}</span><span><b>${esc(t.label)}</b><small>${esc(t.locked ? 'creator only' : t.sub || '')}</small></span></button>`).join('')}</div>`;
  };

  // ── the builder's own office: it sits alone at its desk, in its skin (kept across re-renders) ──
  let officeView = null, officeMenu = false;
  const hx = (c) => parseInt(String(c || '#888888').replace('#', ''), 16);
  const specFor = (seed) => {
    const p = robotParts(seed);
    if (p.spec) return p.spec;
    return { skin: hx(p.skin), hair: hx(p.hair), style: p.style, top: hx(p.top), pants: hx(p.pants), kind: p.kind === 'shirt' ? 'tee' : p.kind, tie: hx(p.tie || '#E4282E'), cap: p.gear === 'cap' ? hx(p.cap) : null, glasses: p.gear === 'glasses' || p.gear === 'shades', headphones: p.gear === 'headphones' };
  };
  const officeState = () => {
    if (d.rawStatus !== 'ACTIVE') return { state: 'idle', title: d.name, sub: 'Getting ready…' };
    if (d.paused) return { state: 'sleep', title: d.name, sub: 'Paused · Zzz' };
    if (d.status === 'LOW BALANCE') return { state: 'idle', title: d.name, sub: 'Needs SOL to trade' };
    const t = (d.history || [])[0];
    return { state: 'work', title: d.name, sub: t ? `${t.side} $${String(t.symbol || '').slice(0, 10)} · ${Number(t.sol || 0).toFixed(3)} SOL` : 'Trading · ' + (strat().name || '') };
  };
  const officeLevels = () => cfg.levels || [];
  const officeHead = () => {
    const n = d.office || d.level?.no || 1, max = d.level?.no || 1;
    const L = officeLevels();
    return `<h2>Builder Office</h2><span class="sub">${esc(OFFICE_NAMES[n] || '')} · where ${esc(d.name)} works 24/7</span>
      <div class="right office-pick-inline">
        ${cfg.skins?.enabled ? `<button type="button" class="btn btn-sm" id="ag-skin-btn">${IC.gear}<span>Customize</span></button>` : ''}
        <button type="button" class="btn btn-sm" id="ag-office-btn" aria-expanded="${officeMenu}" ${isCreator() && max > 1 ? '' : 'disabled title="Unlocks with the first promotion (creator only)"'}>${IC.office}<span>Change Office</span></button>
        ${officeMenu ? `<div class="op-menu" role="menu">
          <div class="op-head">${esc(d.name)}'s offices <small>unlocks one more with every promotion</small></div>
          ${[1, 2, 3, 4, 5, 6].map((k) => { const ok = k <= max; const l = L[k - 1] || {}; return `<button type="button" class="op-item${k === n ? ' on' : ''}${ok ? '' : ' locked'}" data-office="${k}" ${ok ? '' : 'disabled'}>
            <span class="op-lv" style="background:${esc(l.color || '#888')}">${k}</span>
            <span class="op-n"><b>${esc(OFFICE_NAMES[k])}</b><small>${ok ? esc(l.name || '') + ' office' : '🔒 Reach ' + esc(l.name || 'level ' + k)}</small></span>${k === n ? '<span class="op-ok">✓</span>' : ''}</button>`; }).join('')}
        </div>` : ''}</div>`;
  };
  function mountOffice() {
    const slot = el?.querySelector('#ag-office');
    if (!slot) { officeView?.v.destroy(); officeView = null; return; }
    const lvl = d.office || d.level?.no || 1;
    const key = lvl + '|' + (d.skin || '') + '|' + (d.baseSeed || '');
    if (officeView && officeView.key === key) {
      if (officeView.host !== slot) slot.replaceWith(officeView.host);
      officeView.v.setAgent(officeState());
      officeView.v.setData({ trades: (d.history || []).slice(0, 6), tokens: app.api.snapshot.tokens || [], coins: [] });
      return;
    }
    officeView?.v.destroy(); officeView = null;
    slot.innerHTML = '';
    try {
      const model = d.skin && SKIN_MODELS[d.skin] ? SKIN_MODELS[d.skin]() : null;
      const v = createOffice(slot, { level: lvl, agent: { model, spec: model ? null : specFor(d.baseSeed || d.avatarSeed), ...officeState() } });
      v.setAgent(officeState());
      v.setData({ trades: (d.history || []).slice(0, 6), tokens: app.api.snapshot.tokens || [], coins: [] });
      officeView = { key, host: slot, v };
    } catch { slot.innerHTML = '<img class="ag-office-flat" src="brand/banner.jpg" alt="">'; }
  }
  async function pickOffice(n) {
    officeMenu = false;
    const head = el?.querySelector('#ag-office-head');
    if (n === (d.office || d.level?.no)) { if (head) head.innerHTML = officeHead(); return; }
    try {
      const auth = await signAction(actionMessage('office', d.wallet, [`Office: ${n}`]));
      await app.api.setOffice(d.id, { office: n, ...auth });
      d.office = n;
      app.toast(`<b>🏢 ${esc(OFFICE_NAMES[n])}</b>${esc(d.name)} moved into a new office.`, d.avatarSeed);
      mountOffice();
    } catch (e) { app.toast(`<b>Office not changed</b>${esc(e.message || 'Try again.')}`); }
    if (head) head.innerHTML = officeHead();
  }
  

  const pendingHTML = () => {
    const s = d.rawStatus;
    let body = '';
    if (s === 'AWAITING_FUNDS') {
      body = `<h2 class="pix">Waiting for SOL</h2>
        <p>Send <b>${sol(d.requiredSol, 4)} SOL</b> to the builder wallet above to launch <b>$${esc(d.coin.ticker)}</b>. Received so far: ${sol(d.balanceSol, 4)} SOL.</p>
        ${isCreator() ? `<div><button class="btn btn-primary" data-act="fund-launch">Send ${sol(Math.max(0, d.requiredSol - d.balanceSol), 4)} SOL</button></div>` : ''}
        <p class="note">Unfunded launches expire 30 minutes after they were started.</p>`;
    } else if (s === 'LAUNCHING') {
      body = `<h2 class="pix">Launching on pump.fun…</h2><p>Funds received. The builder is creating <b>$${esc(d.coin.ticker)}</b> from its own wallet. This usually takes under a minute.</p>${d.error ? `<p class="blocked">${esc(d.error)} (retrying)</p>` : ''}`;
    } else if (s === 'LAUNCH_FAILED') {
      body = `<h2 class="pix">Launch failed</h2><p class="blocked">${esc(d.error || 'Unknown error')}</p><p>The SOL is still in the builder wallet (${sol(d.balanceSol, 4)} SOL). The creator can retry or withdraw it.</p>`;
    }
    return `<section class="card"><div class="card-body" style="display:grid;gap:12px">${body}</div></section>`;
  };


  // ── hero ──
  const STATUS = { ACTIVE: ['work', 'Active'], PAUSED: ['paused', 'Paused'], 'LOW BALANCE': ['low', 'Low balance'], AWAITING_FUNDS: ['paused', 'Waiting for SOL'], LAUNCHING: ['info', 'Launching'], LAUNCH_FAILED: ['low', 'Launch failed'] };
  const heroHTML = () => {
    const st = STATUS[d.status] || ['info', d.status];
    const p = primary();
    const T = tiles();
    return `<section class="ag-hero">
      <div class="ag-hero-art" aria-hidden="true"></div>
      <div class="ag-hero-in">
        <div class="ag-no">${d.no ? 'BUILDER #' + String(d.no).padStart(3, '0') : 'NEW BUILDER'}${d.coin?.createdAt ? ` · launched ${age(d.coin.createdAt)} ago` : ''}</div>
        <h1>${esc(d.name)}</h1>
        <div class="ag-chips">
          ${d.level ? `<span class="ag-chip lv">${IC.gear}${esc(d.level.name)}</span>` : ''}
          ${d.coin?.ticker ? `<span class="ag-chip coin">${IC.target}$${esc(d.coin.ticker)}</span>` : ''}
          <span class="ag-chip">${stratIcon(strat())}${esc(strat().name)}</span>
          <span class="ag-chip">${IC.coin}${app.api.config.mode === 'paper' ? 'Paper mode' : 'Solana Mainnet'}</span>
          ${d.x?.connected ? `<a class="ag-chip ag-chip-x" href="https://x.com/${esc(d.x.handle)}" target="_blank" rel="noopener">${IC.x}@${esc(d.x.handle)}</a>` : ''}
        </div>
        <span class="ag-status ${st[0]}">${d.paused ? IC.pause : st[0] === 'work' ? IC.play : ''}${esc(st[1])}</span>
        ${d.rawStatus === 'ACTIVE' ? `<div class="ag-lvbar">${levelBar(d.level)}</div>` : ''}
        <div class="ag-walletbar"><span class="ag-wl">Builder wallet</span><code class="ag-addr">${esc(d.wallet)}</code><button type="button" class="ag-copy" data-copy="${esc(d.wallet)}" title="Copy">${IC.copy}</button><a class="btn ag-scan" href="https://solscan.io/account/${esc(d.wallet)}" target="_blank" rel="noopener"><span>View on Solscan</span>${IC.ext}</a></div>
      </div>
      <div class="ag-actions">
        ${p ? `<div class="ag-main"><button type="button" class="btn btn-primary btn-lg ag-go" data-tile="${esc(p.act)}">${IC[p.icon] || ''}<span>${esc(p.label)}</span></button>${T.length > 1 ? `<button type="button" class="btn btn-primary btn-lg ag-chev" data-menu aria-label="More actions">${IC.chev}</button>` : ''}</div>` : ''}
        ${T.length ? `<button type="button" class="btn btn-lg ag-dots" data-menu aria-label="All actions">${IC.dots}</button>` : ''}
        ${menuOpen ? menuHTML() : ''}
        ${d.rawStatus === 'ACTIVE' && !d.paused ? `<span class="ag-next" data-countdown="${d.nextDecisionAt}"></span>` : ''}
      </div>
    </section>
    ${T.length ? `<nav class="ag-quick" aria-label="Builder actions">${T.map((t) => `<button type="button" class="ag-qb${t.locked || t.off ? ' dim' : ''}" data-tile="${esc(t.act)}" title="${esc(t.locked ? 'Creator only' : t.sub || '')}"><span class="ag-mi-ic" style="--tc:${esc(t.bg)}">${IC[t.locked ? 'lock' : t.icon] || ''}</span><span><b>${esc(t.label)}</b><small>${esc(t.locked ? 'creator only' : t.sub || '')}</small></span></button>`).join('')}</nav>` : ''}`;
  };

  const statsHTML = () => `
    <div class="ag-stat"><span class="ag-sic">${IC.wallet}</span><div><small>SOL BALANCE</small><b>${sol(d.balanceSol, 4)} <i>SOL</i></b><span>free SOL in the builder wallet</span></div></div>
    <div class="ag-stat"><span class="ag-sic">${IC.bars}</span><div><small>PORTFOLIO VALUE</small><b>${sol(d.equitySol, 4)} <i>SOL</i></b><span>${usd(d.equitySol * (app.api.snapshot.stats.solUsd || 0))} incl. positions</span></div></div>
    <div class="ag-stat"><span class="ag-sic">${IC.up}</span><div><small>TOTAL P&amp;L</small><b class="${tone(d.pnlSol)}">${signedSol(d.pnlSol, 4)} <i>SOL</i></b><span><em class="${tone(d.pnlSol)}">${pct(d.pnlPct, 1)}</em> on ${sol(d.depositedSol, 3)} SOL deposited</span></div></div>
    <div class="ag-stat"><span class="ag-sic">${IC.swap}</span><div><small>TOTAL TRADES</small><b>${d.trades}</b><span>${d.closedTrades} closed · ${d.winRate == null ? 'no win rate yet' : Math.round(d.winRate * 100) + '% wins'}</span></div></div>
    <div class="ag-stat"><span class="ag-sic coin">${IC.coin}</span><div><small>CREATOR FEES KEPT</small><b>${sol(d.feesKeptSol, 4)} <i>SOL</i></b><span>${d.feesToCreatorSol > 0 ? `${sol(d.feesToCreatorSol, 4)} SOL sent to creator` : 'all fees stay with the builder'}</span></div></div>`;

  const stratCardHTML = () => {
    const st = strat();
    const steps = STEPS[stratKey(st)] || STEPS[st.base] || STEPS.classic;
    return `<header class="card-head"><h2>Strategy</h2>${isCreator() && d.rawStatus === 'ACTIVE' ? '<button type="button" class="btn btn-sm" data-tile="strategy">Edit</button>' : ''}</header>
      <div class="ag-cur"><small>Current strategy</small><b><span class="strat-${esc(stratKey(st))}">${stratIcon(st)}</span>${esc(st.name)}</b></div>
      <ul class="ag-steps">${steps.map((x) => `<li>${IC.check}<span>${esc(x)}</span></li>`).join('')}</ul>
      <details class="ag-rules"><summary>All rules</summary><dl class="kv">${strategyRules(st).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}<dt>SOL reserve</dt><dd>${rules.minSolReserve} SOL</dd></dl></details>`;
  };

  // activity: trades, notes, deposits, withdrawals and fee claims, newest first
  const activity = () => {
    const A = [];
    for (const t of (d.history || []).slice(0, 12)) A.push({ ts: t.ts, k: t.side === 'BUY' ? 'buy' : 'sell', ic: t.side === 'BUY' ? IC.plus : IC.down, text: `${t.side === 'BUY' ? 'Bought' : 'Sold'} $${t.symbol} · ${sol(t.sol, 3)} SOL${t.side === 'SELL' && t.pnlPct != null ? ' · ' + pct(t.pnlPct) : ''}` });
    for (const x of (d.decisions || []).filter((x) => x.note).slice(0, 8)) A.push({ ts: x.ts, k: x.levelUp ? 'lvl' : 'note', ic: x.levelUp ? IC.star : IC.gear, text: x.levelUp ? `Promoted to ${x.levelUp}` : String(x.reason || '').split('.')[0] });
    for (const x of (d.deposits || []).slice(0, 6)) A.push({ ts: x.ts, k: 'dep', ic: IC.wallet, text: `Added ${sol(x.amount, 3)} SOL` });
    for (const x of (d.withdrawals || []).slice(0, 6)) A.push({ ts: x.ts, k: 'wd', ic: IC.down, text: `Withdrew ${sol(x.amount, 3)} SOL` });
    for (const x of (d.feeClaims || []).slice(0, 6)) A.push({ ts: x.ts, k: 'fee', ic: IC.coin, text: `Claimed ${sol(x.claimedSol, 3)} SOL creator fees` });
    if (d.paused) A.push({ ts: Date.now(), k: 'pause', ic: IC.pause, text: 'Builder paused' });
    return A.sort((a, b) => b.ts - a.ts);
  };
  const activityHTML = () => {
    const A = activity().slice(0, 5);
    return `<header class="card-head"><h2>Activity</h2><button type="button" class="btn btn-sm" data-goto="ag-dec-card"><span>View all</span>${IC.arrow}</button></header>
      ${A.length ? `<ul class="ag-act">${A.map((x) => `<li class="k-${x.k}"><span class="ag-aic">${x.ic}</span><span class="ag-at">${esc(x.text)}</span><time data-ago="${x.ts}">${ago(x.ts)}</time></li>`).join('')}</ul>` : '<p class="ag-empty">Nothing yet. Activity shows up here as soon as the builder starts working.</p>'}`;
  };

  const recentHTML = () => {
    const list = (d.history || []).slice(0, 5);
    return `<header class="card-head"><h2>Recent Trades</h2><button type="button" class="btn btn-sm" data-goto="ag-trades-card"><span>View all</span>${IC.arrow}</button></header>
      ${list.length ? `<table class="ag-rt"><thead><tr><th>Token</th><th>Type</th><th class="r">Amount</th><th class="r">PnL</th><th class="r">Time</th></tr></thead><tbody>${list.map((t) => `<tr>
        <td><span class="ag-tok">${tokIcon(t.symbol, null)}$${esc(t.symbol)}</span></td>
        <td><span class="ag-side ${t.side === 'BUY' ? 'buy' : 'sell'}">${t.side === 'BUY' ? 'Buy' : 'Sell'}</span></td>
        <td class="r">${sol(t.sol, 2)} SOL</td>
        <td class="r ${t.side === 'SELL' ? tone(t.pnlSol) : 'muted'}">${t.side === 'SELL' ? signedSol(t.pnlSol, 3) + ' SOL' : '–'}</td>
        <td class="r muted" data-ago="${t.ts}">${ago(t.ts)}</td></tr>`).join('')}</tbody></table>` : '<p class="ag-empty">No trades yet.</p>'}`;
  };

  const notesHTML = () => {
    const N = (d.decisions || []).filter((x) => x.reason).slice(0, 3);
    return `<header class="card-head"><h2>Notes &amp; Decisions</h2></header>
      ${N.length ? N.map((x) => `<div class="ag-note${x.blocked ? ' is-blocked' : ''}"><span class="ag-bulb">${IC.bulb}</span><div><p>${esc(x.reason)}</p>${x.blocked ? `<small class="ag-blk">${esc(x.blocked)}</small>` : ''}<time data-ago="${x.ts}">${ago(x.ts)}</time></div></div>`).join('') : '<p class="ag-empty">The first decision is coming up…</p>'}`;
  };

  // ── X account: the builder posts its big trades, promotions and a daily report ──
  const X_KINDS = [['trades', 'Big trades', 'Wins and losses over ±15%, with the reason'], ['promos', 'Promotions', 'New level and new office'], ['recap', 'Daily shift report', 'Once a day, only if it traded'], ['images', 'AI pictures', 'A picture of your builder, max 1 a day']];
  const xHTML = () => {
    const x = d.x || {};
    const mine = isCreator();
    const head = `<header class="card-head"><h2><span class="ag-xlogo">${IC.x}</span>Builder on X</h2>${x.connected ? `<a class="btn btn-sm" href="https://x.com/${esc(x.handle)}" target="_blank" rel="noopener"><span>@${esc(x.handle)}</span>${IC.ext}</a>` : ''}</header>`;
    if (!x.enabled) return head + `<p class="ag-empty">${mine ? 'X posting is not switched on for this site yet.' : 'Not connected.'}</p>`;
    if (!x.connected) return head + `<div class="ag-xbody"><p class="ag-xlead">Connect an X account and ${esc(d.name)} posts what matters, never spam:</p>
      <ul class="ag-xlist">${X_KINDS.filter(([k]) => k !== 'images' || x.images).map(([, t, s]) => `<li>${IC.check}<span><b>${t}</b><small>${s}</small></span></li>`).join('')}</ul>
      <p class="ag-xnote">At most one post every 90 minutes and a few a day. You choose what it posts and can disconnect any time. Tip: use a separate X account for your builder and mark it as <b>Automated</b> in X settings.</p>
      ${mine ? `<button type="button" class="btn btn-primary ag-xgo" data-x="connect">${IC.x}<span>Connect X account</span></button>` : '<p class="ag-empty">Only the creator can connect an X account.</p>'}</div>`;
    const next = x.nextPostAt > Date.now() ? `next post possible ${ago(2 * Date.now() - x.nextPostAt).replace(' ago', '')} from now` : 'ready to post';
    return head + `<div class="ag-xbody">
      <div class="ag-xstat"><span><b>${x.postsToday}/${x.maxPerDay}</b> posts today</span><span>${esc(next)}</span>${x.queued?.length ? `<span>${x.queued.length} waiting</span>` : ''}</div>
      ${x.error ? `<p class="ag-xerr">${esc(x.error)}</p>` : ''}
      <div class="ag-xset">${X_KINDS.filter(([k]) => k !== 'images' || x.images).map(([k, t, s]) => `<label class="ag-tog"><input type="checkbox" data-xset="${k}" ${x.settings?.[k] ? 'checked' : ''} ${mine ? '' : 'disabled'}><span class="ag-sw"></span><span><b>${t}</b><small>${s}</small></span></label>`).join('')}</div>
      ${mine ? `<div class="ag-xbtns"><button type="button" class="btn btn-sm" data-x="save">Save settings</button><button type="button" class="btn btn-sm btn-primary" data-x="post">Post an update now</button><button type="button" class="btn btn-sm" data-x="disconnect">Disconnect</button></div>` : ''}
      <div class="ag-xposts"><small class="ag-xh">Recent posts</small>${(x.posts || []).length ? x.posts.slice(0, 5).map((p) => `<a class="ag-xp" href="${esc(p.url)}" target="_blank" rel="noopener"><span>${esc(p.text)}</span><time data-ago="${p.ts}">${ago(p.ts)}</time>${p.image ? '<em>🖼</em>' : ''}</a>`).join('') : '<p class="ag-empty">No posts yet. The first one goes out within a minute or two.</p>'}</div>
    </div>`;
  };

  const chartHead = () => `<header class="card-head"><h2><span class="ag-hic">${IC.bars}</span>Portfolio Value</h2><div class="ag-ranges">${Object.keys(RANGES).map((k) => `<button type="button" data-range="${k}" class="${k === range ? 'on' : ''}">${k}</button>`).join('')}</div></header>`;

  const positionsHTML = () => {
    if (!d.positions.length) return `<div class="feed-empty">No open positions. The builder is holding SOL.</div>`;
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Token</th><th class="r">Cost</th><th class="r">Value</th><th class="r">Entry</th><th class="r">Now</th><th class="r">P&amp;L</th><th>Stop loss → take profit</th><th class="r">Held</th></tr></thead>
      <tbody>${d.positions.map((p) => `<tr>
        <td><a class="tokname" href="${esc(p.url || 'https://solscan.io/token/' + p.mint)}" target="_blank" rel="noopener">${tokIcon(p.symbol, p.icon)}$${esc(p.symbol)}</a>${p.recovered ? ' <span class="pill" title="Found on-chain after a restart; cost basis = value when found">RECOVERED</span>' : ''}${p.sellFails ? ` <span class="pill pill-low" title="The sell did not go through yet. The builder keeps retrying.">SELL RETRY ×${p.sellFails > 99 ? '99+' : p.sellFails}</span>` : ''}</td>
        <td class="r">${sol(p.costSol, 4)} SOL</td>
        <td class="r b">${sol(p.valueSol, 4)} SOL</td>
        <td class="r muted">${price(p.entryPriceSol * (app.api.snapshot.stats.solUsd || 0))}</td>
        <td class="r">${price(p.priceUsd)}</td>
        <td class="r"><b class="${tone(p.pnlPct)}">${pct(p.pnlPct)}</b><br><span class="${tone(p.pnlSol)}" style="font-size:12px">${signedSol(p.pnlSol, 4)}</span></td>
        <td>${rangeBar(p.pnlPct)}</td>
        <td class="r muted">${dur(Date.now() - p.openedAt)}</td>
      </tr>`).join('')}</tbody></table></div>`;
  };

  const tradesHTML = () => {
    const list = showAll ? d.history : d.history.slice(0, 25);
    if (!list.length) return `<div class="feed-empty">No trades yet.</div>`;
    return `<div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Time</th><th>Side</th><th>Token</th><th class="r">Amount</th><th class="r">Price</th><th class="r">P&amp;L</th><th>Trigger</th><th>Transaction</th></tr></thead>
      <tbody>${list.map((t) => `<tr>
        <td><span data-ago="${t.ts}">${ago(t.ts)}</span><br><span class="muted" style="font-size:12px">${clockSec(t.ts)}</span></td>
        <td>${sidePill(t.side)}</td>
        <td class="b">$${esc(t.symbol)}</td>
        <td class="r b">${sol(t.sol, 4)} SOL</td>
        <td class="r muted">${price(t.priceUsd)}</td>
        <td class="r">${t.side === 'SELL' ? `<b class="${tone(t.pnlPct)}">${pct(t.pnlPct)}</b><br><span class="${tone(t.pnlSol)}" style="font-size:12px">${signedSol(t.pnlSol, 4)} SOL</span>` : '<span class="muted">–</span>'}</td>
        <td>${sourceChip(t.source) || '<span class="chip">Builder</span>'}</td>
        <td>${txLink(t.sig)}</td>
      </tr>`).join('')}</tbody></table></div>
      ${d.history.length > 25 ? `<button class="card-foot" style="width:100%;border:0;border-top:1px solid var(--line);background:transparent;cursor:pointer;text-align:left" id="ag-more">${showAll ? 'Show fewer' : 'Show all ' + d.history.length + ' recent trades'}</button>` : ''}`;
  };

  const decisionsHTML = () => {
    if (!d.decisions.length) return `<div class="feed-empty">First decision coming up…</div>`;
    return `<ul class="decisions">${d.decisions.map((x) => `<li>
      <div class="top">${sidePill(x.action)}${x.count > 1 ? `<span class="muted" style="font-size:12px;font-weight:600">${x.failed ? `tried ${x.count > 999 ? '999+' : x.count}×` : `×${x.count} in a row`}</span>` : ''}${x.symbol ? `<b>$${esc(x.symbol)}</b>` : ''}<span class="when" data-ago="${x.ts}">${ago(x.ts)}</span></div>
      ${x.reason ? `<p>${esc(x.reason)}</p>` : ''}
      ${x.blocked ? `<div class="blocked${x.failed ? ' failed' : ''}">${esc(x.blocked)}</div>` : x.action !== 'HOLD' ? '<div class="approved">Approved by risk check · executed on-chain</div>' : ''}
    </li>`).join('')}</ul>`;
  };

  const coinHTML = () => {
    const c = d.coin;
    const link = (u) => (/^https?:\/\//i.test(u) ? u : 'https://' + u);
    const tw = c.twitter ? (c.twitter.startsWith('http') ? c.twitter : 'https://x.com/' + c.twitter.replace(/^@/, '')) : '';
    return `<section class="card coin-card">
      <div class="coin-head">${coinThumb(c, 56)}<div><div class="agent-tag">ASSOCIATED COIN</div><div class="t">${esc(c.name)}<small>$${esc(c.ticker)}</small></div></div></div>
      ${c.description ? `<p style="color:var(--ink-2);font-size:14px">${esc(c.description)}</p>` : ''}
      <dl class="kv">
        ${c.mint ? `<dt>Market cap</dt><dd>${usd(c.mcapUsd)}</dd><dt>All-time high</dt><dd>${usd(c.athUsd)}</dd>` : ''}
        ${c.createdAt ? `<dt>Launched</dt><dd>${age(c.createdAt)} ago</dd>` : ''}
        ${c.mint ? `<dt>Mint</dt><dd><span class="mono">${short(c.mint, 6)}</span> ${copyBtn(c.mint)}</dd>` : ''}
        ${c.launchSig ? `<dt>Launch tx</dt><dd>${txLink(c.launchSig)}</dd>` : ''}
        ${tw ? `<dt>X / Twitter</dt><dd><a class="ext" href="${esc(tw)}" target="_blank" rel="noopener">${esc(c.twitter)}</a></dd>` : ''}
        ${c.website ? `<dt>Website</dt><dd><a class="ext" href="${esc(link(c.website))}" target="_blank" rel="noopener">${esc(c.website.replace(/^https?:\/\//, ''))}</a></dd>` : ''}
      </dl>
      ${c.mint ? `<a class="btn btn-sm" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">View on pump.fun ↗</a>` : ''}
      <p class="note">The builder wallet is this coin's creator on pump.fun. Builders never trade CREW coins.</p>
    </section>`;
  };

  const walletHTML = () => `<section class="card coin-card">
      <div class="agent-tag">WALLETS</div>
      <dl class="kv">
        <dt>Builder wallet</dt><dd>${addrLink(d.wallet, short(d.wallet, 6))}</dd>
        <dt>Keys</dt><dd>${esc(d.custody || '')}</dd>
        <dt>Creator wallet</dt><dd>${addrLink(d.creator, short(d.creator, 6))}</dd>
        <dt>Net deposited</dt><dd>${sol(d.depositedSol, 4)} SOL</dd>
        ${d.launchCostSol ? `<dt>Coin creation cost</dt><dd>${sol(d.launchCostSol, 4)} SOL</dd>` : ''}
        ${d.withdrawnSol ? `<dt>Withdrawn</dt><dd>${sol(d.withdrawnSol, 4)} SOL</dd>` : ''}
      </dl>
      <div class="agent-tag" style="margin-top:4px">DEPOSITS &amp; WITHDRAWALS</div>
      <dl class="kv">${[...d.deposits.map((x) => ({ ...x, dir: '+' })), ...d.withdrawals.map((x) => ({ ...x, dir: '−' }))].sort((a, b) => b.ts - a.ts).slice(0, 12)
        .map((x) => `<dt data-ago="${x.ts}">${ago(x.ts)}</dt><dd>${x.dir}${sol(x.amount, 4)} SOL ${x.sig ? txLink(x.sig, 'tx') : ''}</dd>`).join('') || '<dt class="muted">None yet</dt><dd></dd>'}</dl>
      <p class="note">The trading logic never sees a private key. It proposes BUY / SELL / HOLD; the server checks the rules, simulates the transaction and only then signs.</p>
    </section>`;

  const feesHTML = () => `<section class="card coin-card">
      <div class="agent-tag">CREATOR FEES · ${cfg.fees.creatorSharePct > 0 ? `${Math.round(cfg.fees.creatorSharePct * 100)}% CREATOR / ` : ''}${cfg.flywheel?.enabled ? `${Math.round(cfg.flywheel.pct * 100)}% BURN / ${Math.round((1 - cfg.flywheel.pct - (cfg.fees.creatorSharePct || 0)) * 100)}% BUILDER` : cfg.fees.creatorSharePct > 0 ? `${Math.round((1 - cfg.fees.creatorSharePct) * 100)}% BUILDER` : '100% BUILDER'}</div>
      <dl class="kv">
        <dt>Kept by builder</dt><dd>${sol(d.feesKeptSol, 4)} SOL</dd>
        ${d.feesToCreatorSol > 0 || cfg.fees.creatorSharePct > 0 ? `<dt>Sent to creator</dt><dd>${sol(d.feesToCreatorSol, 4)} SOL</dd>` : ''}
        ${d.nextFeeClaimAt ? `<dt>Next claim</dt><dd data-countdown-plain="${d.nextFeeClaimAt}"></dd>` : ''}
      </dl>
      <div class="agent-tag" style="margin-top:4px">CLAIMS</div>
      <dl class="kv">${d.feeClaims.map((x) => `<dt data-ago="${x.ts}">${ago(x.ts)}</dt><dd>${sol(x.claimedSol, 4)} SOL ${txLink(x.sig, 'tx')}${x.toCreatorSol > 0 ? `<br><span class="muted" style="font-weight:500">${sol(x.toCreatorSol, 4)} to creator ${x.shareSig ? txLink(x.shareSig, 'tx') : ''}</span>` : ''}</dd>`).join('') || '<dt class="muted">No claims yet</dt><dd></dd>'}</dl>
      ${cfg.flywheel?.enabled && d.flywheel ? `<div class="agent-tag" style="margin-top:4px">🔥 BUYBACK &amp; BURN · <a class="ext" href="#/burns">all burns</a></div>
      <dl class="kv">
        <dt>Burned so far</dt><dd>${sol(d.flywheel.sol, 4)} SOL · ${fmtTok(d.flywheel.tokens)} tokens</dd>
        ${d.flywheel.pendingSol > 0 ? `<dt>Collecting</dt><dd>${sol(d.flywheel.pendingSol, 4)} / ${cfg.flywheel.minBuySol} SOL</dd>` : ''}
        ${d.flywheel.burns.slice(0, 5).map((b) => `<dt data-ago="${b.ts}">${ago(b.ts)}</dt><dd>${sol(b.sol, 4)} SOL → 🔥 ${fmtTok(b.tokens)} ${txLink(b.burnSig, 'burn')}</dd>`).join('')}
      </dl>` : ''}
      ${(d.rewards || []).length ? `<div class="agent-tag" style="margin-top:4px">PROMOTION REWARDS</div>
      <dl class="kv">${d.rewards.map((r) => `<dt>${esc(r.level)}</dt><dd>${sol(r.amountSol, 3)} SOL ${r.status === 'paid' ? txLink(r.sig, 'paid ✓') : `<span class="muted" style="font-weight:600">${r.status === 'waiting_funds' ? 'queued' : 'sending…'}</span>`}</dd>`).join('')}</dl>` : ''}
      <div class="agent-tag" style="margin-top:4px">STRATEGY · ${esc(strat().name.toUpperCase())}${strat().custom ? ' <span class="cust-tag">custom</span>' : ''}</div>
      <dl class="kv">
        ${strategyRules(strat()).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
        <dt>SOL reserve</dt><dd>${rules.minSolReserve} SOL</dd>
      </dl>
      ${isCreator() && d.rawStatus === 'ACTIVE' ? `<button class="btn btn-sm" type="button" data-act="strategy">${stratIcon(strat())}<span>Change strategy</span></button>` : ''}
    </section>`;

  // ── builder market: for sale banner / sell card / owner history ──
  // ── builder NFT (whoever holds it owns the builder) + selling on the Crewfi market (NFT builders only) ──
  const nftHTML = () => {
    if (!cfg.agentNft?.enabled || d.rawStatus !== 'ACTIVE') return '';
    const mine = isCreator();
    if (d.nft?.asset) return `<section class="card mk-agent nft-card"><div class="mk-agent-row"><span class="mk-badge nft">🎟 NFT</span>
        <span class="mk-agent-sub"><b>This builder is an NFT.</b> Whoever holds the NFT owns the builder: its wallet, its coin and its future creator fees.${mine ? ' Sell it here with <b>Sell this builder</b>.' : ''}</span>
        <span class="right nft-links"><a class="ext" href="https://solscan.io/token/${esc(d.nft.asset)}" target="_blank" rel="noopener">NFT on Solscan ↗</a></span></div></section>`;
    if (d.nftJob && d.nftJob.status !== 'failed') return `<section class="card mk-agent nft-card"><div class="mk-agent-row"><span class="mk-badge nft">🎟 NFT</span><span class="mk-agent-sub"><b>Making the NFT…</b> It lands in the owner wallet in about a minute.${mine && d.nftJob.error ? `<br><small class="muted">Still trying: ${esc(d.nftJob.error)}</small>` : ''}</span></div></section>`;
    if (!mine) return '';
    return `<section class="card mk-agent nft-card"><div class="mk-agent-row"><span class="mk-badge nft">🎟 NFT</span>
        <span class="mk-agent-sub"><b>Turn this builder into an NFT</b> to be able to sell it. Whoever holds the NFT owns the builder. Free: Crewfi pays the mint.${d.nftJob?.status === 'failed' ? ' <span class="err-t">The last try failed, you can try again.</span>' : ''}</span>
        <span class="right"><button class="btn btn-sm" type="button" data-act="nft-mint">🎟 Make it an NFT</button></span></div></section>`;
  };

  const marketHTML = () => {
    if (!cfg.market?.enabled || d.rawStatus !== 'ACTIVE') return '';
    const L = d.market, mine = isCreator(), fee = cfg.market.feePct ?? 0.05;
    const hist = (d.sales || []).length ? `<div class="mk-hist"><span class="agent-tag">OWNERS</span>${d.sales.map((s) => `<span>Sold for <b>${sol(s.priceSol, 3)} SOL</b> <span class="muted" data-ago="${s.ts}">${ago(s.ts)}</span> ${txLink(s.paySig, 'tx')}</span>`).join('')}</div>` : '';
    if (L && L.escrow) return `<section class="card mk-agent on-sale">
        <div class="mk-agent-row"><span class="mk-badge">FOR SALE</span><span class="mk-price"><small>Price</small><span>${+L.price.toFixed(4)} <em>SOL</em></span>${L.priceTokens ? `<small class="mk-tok">≈ ${Math.round(L.priceTokens).toLocaleString('en')} CREW</small>` : ''}</span>
        <span class="muted mk-agent-sub">Listed <span data-ago="${L.listedAt}">${ago(L.listedAt)}</span> by ${esc(short(L.seller, 4))}${mine ? ` · you get the CREW worth ${sol(L.price * (1 - fee), 4)} SOL` : ''}</span>
        <span class="right">${mine ? '<button class="btn btn-sm" type="button" data-act="market-list">Change price</button><button class="btn btn-sm" type="button" data-act="market-delist">Remove from market</button>' : '<button class="btn btn-primary" type="button" data-mkbuy="1">Buy this builder</button>'}</span></div>
        ${mine ? '<p class="note">The NFT is in the market wallet and withdrawals are locked while it is for sale. Remove it any time: the NFT comes back to you.</p>' : ''}${hist}</section>`;
    if (!mine) return hist ? `<section class="card mk-agent">${hist}</section>` : '';
    if (L) return `<section class="card mk-agent sell-card">
        <div class="mk-agent-row"><span class="mk-badge sell">LISTING</span><span class="mk-agent-sub"><b>Waiting for the NFT.</b> ${+L.price.toFixed(4)} SOL: it goes on sale as soon as the builder NFT is in the market wallet. If you did not send it, send it now.</span>
        <span class="right"><button class="btn btn-primary btn-sm" type="button" data-act="market-escrow">Send the NFT</button><button class="btn btn-sm" type="button" data-act="market-delist">Cancel</button></span></div>${hist}</section>`;
    const ready = !!d.nft?.asset;
    const minting = d.nftJob && d.nftJob.status !== 'failed';
    return `<section class="card mk-agent sell-card${ready ? '' : ' off'}">
        <div class="mk-agent-row"><span class="mk-badge sell">SELL</span><span class="mk-agent-sub">${ready ? `<b>Sell this builder on the Builder Market.</b> You set the price in SOL, the buyer pays in CREW. You get the CREW minus ${Math.round(fee * 100)}%.` : minting ? '<b>Selling unlocks when the NFT is ready.</b> The builder NFT is being made (about a minute).' : '<b>Only NFT builders can be sold.</b> Make it an NFT first (free, below), then this button works.'}</span>
        <span class="right"><button class="btn ${ready ? 'btn-primary' : ''}" type="button" ${ready ? 'data-act="market-list"' : 'disabled title="Make it an NFT first"'}>🤝 Sell this builder</button></span></div>${hist}</section>`;
  };


  function renderAll() {
    mode = d.rawStatus === 'ACTIVE' ? 'active' : 'pending';
    const main = mode === 'active' ? `
      <div class="ag-stats" id="ag-stats">${statsHTML()}</div>
      <div class="ag-row1">
        <section class="card ag-office-card"><header class="card-head" id="ag-office-head">${officeHead()}</header><div class="ag-office-stage office" id="ag-office"></div></section>
        <section class="card ag-strat" id="ag-strat">${stratCardHTML()}</section>
        <section class="card ag-activity" id="ag-activity">${activityHTML()}</section>
      </div>
      <div class="ag-row2">
        <section class="card ag-chart-card">${chartHead()}<div class="chart-box" id="ag-chart"></div></section>
        <section class="card ag-recent" id="ag-recent">${recentHTML()}</section>
        <section class="card ag-notes" id="ag-notes">${notesHTML()}</section>
      </div>
      <section class="card ag-x" id="ag-x">${xHTML()}</section>
      <section class="card"><header class="card-head"><h2>Current positions</h2><span class="sub" id="ag-pos-n">${d.positions.length} of ${strat().maxOpen}</span></header><div id="ag-pos">${positionsHTML()}</div></section>
      <div class="two">
        <section class="card" id="ag-trades-card"><header class="card-head"><h2>Trade history</h2><span class="sub">on-chain, newest first</span></header><div id="ag-trades">${tradesHTML()}</div></section>
        <section class="card" id="ag-dec-card"><header class="card-head"><h2>Decision log</h2><span class="sub">what the builder did and why</span></header><div id="ag-dec">${decisionsHTML()}</div></section>
      </div>
      <div class="three" id="ag-cards">${coinHTML()}${walletHTML()}${feesHTML()}</div>`
      : `<div id="ag-pending">${pendingHTML()}</div>
      <section class="card ag-office-card"><header class="card-head" id="ag-office-head">${officeHead()}</header><div class="ag-office-stage office" id="ag-office"></div></section>
      <div class="three" id="ag-cards">${coinHTML()}${walletHTML()}</div>`;
    el.innerHTML = `<div class="wrap ag">
      <a href="#/builders" class="muted ag-back">← All builders</a>
      <div id="ag-hero">${heroHTML()}</div>
      <div id="ag-market">${marketHTML()}${nftHTML()}</div>
      ${main}
    </div>`;
    if (officeView) { officeView.v.destroy(); officeView = null; }
    mountOffice();
    if (mode === 'active') {
      const box = el.querySelector('#ag-chart');
      box.addEventListener('pointerenter', () => (hovering = true));
      box.addEventListener('pointerleave', () => (hovering = false));
      drawChart(true);
    }
    bindOnce();
  }

  function renderLive() {
    const nextMode = d.rawStatus === 'ACTIVE' ? 'active' : 'pending';
    if (nextMode !== mode) return renderAll();
    el.querySelector('#ag-hero').innerHTML = heroHTML();
    el.querySelector('#ag-market').innerHTML = marketHTML() + nftHTML();
    mountOffice();
    if (!officeMenu) { const h = el.querySelector('#ag-office-head'); if (h) h.innerHTML = officeHead(); }
    if (mode === 'active') {
      el.querySelector('#ag-stats').innerHTML = statsHTML();
      el.querySelector('#ag-strat').innerHTML = stratCardHTML();
      el.querySelector('#ag-activity').innerHTML = activityHTML();
      el.querySelector('#ag-recent').innerHTML = recentHTML();
      el.querySelector('#ag-notes').innerHTML = notesHTML();
      if (!el.querySelector('#ag-x')?.contains(document.activeElement) && !xDirty) el.querySelector('#ag-x').innerHTML = xHTML();
      el.querySelector('#ag-dec').innerHTML = decisionsHTML();
      el.querySelector('#ag-pos').innerHTML = positionsHTML();
      el.querySelector('#ag-pos-n').textContent = `${d.positions.length} of ${strat().maxOpen}`;
      el.querySelector('#ag-trades').innerHTML = tradesHTML();
      el.querySelector('#ag-cards').innerHTML = coinHTML() + walletHTML() + feesHTML();
      drawChart(false);
    } else {
      el.querySelector('#ag-pending').innerHTML = pendingHTML();
      el.querySelector('#ag-cards').innerHTML = coinHTML() + walletHTML();
    }
  }

  function drawChart(force) {
    if (!force && (hovering || Date.now() - lastChart < 5000)) return;
    lastChart = Date.now();
    const from = Date.now() - RANGES[range];
    let pts = d.equity.filter((p) => p[0] >= from);
    if (pts.length < 2) pts = d.equity.slice(-2);
    if (Date.now() - (pts[pts.length - 1]?.[0] || 0) > 1000) pts.push([Date.now(), d.equitySol]);
    equityChart(el.querySelector('#ag-chart'), pts, d.depositedSol);
  }

  // one delegated listener for the whole page (survives the live re-renders)
  let bound = false, xDirty = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    el.addEventListener('change', (e) => { if (e.target.matches('[data-xset]')) xDirty = true; });
    el.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-menu]');
      if (m) { menuOpen = !menuOpen; el.querySelector('#ag-hero').innerHTML = heroHTML(); return; }
      const tl = e.target.closest('[data-tile]');
      if (tl) { menuOpen = false; el.querySelector('#ag-hero').innerHTML = heroHTML(); const t = tl.dataset.tile === 'connect' ? { act: 'connect' } : tiles().find((x) => x.act === tl.dataset.tile) || { act: tl.dataset.tile }; return act(t); }
      if (menuOpen && !e.target.closest('.ag-menu')) { menuOpen = false; el.querySelector('#ag-hero').innerHTML = heroHTML(); }
      const xb = e.target.closest('[data-x]');
      if (xb) {
        const k = xb.dataset.x;
        if (k === 'connect') return app.agentAction('x-connect', d, () => fetchDetail(true));
        if (k === 'post') return app.agentAction('x-post', d, () => fetchDetail(true));
        if (k === 'disconnect') return app.agentAction('x-disconnect', d, () => fetchDetail(true));
        if (k === 'save') {
          const set = {}; el.querySelectorAll('[data-xset]').forEach((c) => { set[c.dataset.xset] = c.checked; });
          d.__xSettings = { trades: false, recap: false, promos: false, images: false, ...(d.x?.settings || {}), ...set };
          xDirty = false;
          return app.agentAction('x-settings', d, () => fetchDetail(true));
        }
      }
      const cp = e.target.closest('[data-copy]');
      if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); app.toast('<b>Copied</b>Builder wallet address'); } catch {} return; }
      const a = e.target.closest('[data-act]');
      if (a) return app.agentAction(a.dataset.act, d, () => fetchDetail(true));
      if (e.target.closest('[data-mkbuy]')) return app.marketBuy({ ...d, price: d.market.price, seller: d.market.seller }, () => fetchDetail(true));
      if (e.target.closest('[data-shill-agent]')) return app.shill(d.id);
      if (e.target.closest('#ag-more')) { showAll = !showAll; el.querySelector('#ag-trades').innerHTML = tradesHTML(); return; }
      const g = e.target.closest('[data-goto]');
      if (g) { el.querySelector('#' + g.dataset.goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      const r = e.target.closest('[data-range]');
      if (r) { range = r.dataset.range; el.querySelectorAll('[data-range]').forEach((x) => x.classList.toggle('on', x === r)); drawChart(true); return; }
      if (e.target.closest('#ag-office-btn')) { officeMenu = !officeMenu; el.querySelector('#ag-office-head').innerHTML = officeHead(); return; }
      if (e.target.closest('#ag-skin-btn')) { if (!isCreator()) return app.toast(`<b>Creator only</b>Connect the creator wallet (${esc(short(d.creator, 4))}) to change the look.`); return app.agentAction('skins', d, () => fetchDetail(true)); }
      const it = e.target.closest('[data-office]'); if (it && !it.disabled) pickOffice(Number(it.dataset.office));
    });
  }

  async function fetchDetail(force = false) {
    if (loading || (!force && Date.now() - lastFetch < 2500)) return;
    loading = true;
    lastFetch = Date.now();
    try {
      const next = await app.api.getAgent(id);
      if (!el) return;
      if (!next) { el.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Builder ${esc(id)} not found. <a class="ext" href="#/builders">See all builders</a></div></div></div>`; return; }
      const first = !d;
      d = next;
      if (first) renderAll(); else renderLive();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  // "next decision in Ns"
  const tick = setInterval(() => {
    el?.querySelectorAll('[data-countdown]').forEach((n) => { const s = Math.max(0, Math.round((Number(n.dataset.countdown) - Date.now()) / 1000)); n.textContent = s > 0 ? `Next decision in ${s}s` : 'Thinking…'; });
    el?.querySelectorAll('[data-countdown-plain]').forEach((n) => { const s = Math.max(0, Math.round((Number(n.dataset.countdownPlain) - Date.now()) / 1000)); n.textContent = s > 60 ? `in ${Math.round(s / 60)} min` : `in ${s}s`; });
  }, 1000);

  return {
    mount(root) {
      el = root;
      const xq = (location.hash.split('?')[1] || '').match(/x=(\w+)/)?.[1];
      if (xq) {
        app.toast(xq === 'connected' ? '<b>X connected</b>Your builder posts a hello in a minute, then only what matters.' : xq === 'cancelled' ? '<b>X login cancelled</b>Nothing was connected.' : '<b>X could not be connected</b>Please try again. If it keeps failing, the site operator should check the X app settings.');
        history.replaceState(null, '', location.hash.split('?')[0]);
      }
      el.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Loading builder…</div></div></div>`;
      fetchDetail(true);
    },
    update() { fetchDetail(false); },
    onTrade(t) { if (d && t.agentNo === d.no) { officeView?.v.celebrate('trade'); setTimeout(() => fetchDetail(true), 50); } },
    onWallet() { if (d) renderAll(); },
    onMarket(p) { if (d && (!p?.agentId || p.agentId === d.id)) fetchDetail(true); },
    destroy() { clearInterval(tick); officeView?.v.destroy(); officeView = null; el = null; },
  };
}
