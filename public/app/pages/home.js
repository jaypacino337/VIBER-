// VIBER home: hero + live 3D site office, platform stats, viber jobs, your vibers,
// a viber's office + career, "Vibers, right now" (what every viber decided and why),
// the just-bonded phone and the live trade feed.
import { createOffice, OFFICE_NAMES, MAIN_OFFICE } from '../office3d.js';
import { wallet } from '../wallet.js';
import { createPhone } from '../phone3d.js';
import { SKIN_MODELS } from '../skins3d.js';
import { robotParts, robotSVG } from '../robot.js';
import { STRAT_ICONS, stratIcon, stratKey, strategyById, avatar, feedItem, coinThumb, esc, sol, signedSol, pct, tone, ago, usd, age } from '../ui.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const SEL_KEY = 'build-home-builder';
const store = { get() { try { return localStorage.getItem(SEL_KEY); } catch { return null; } }, set(v) { try { localStorage.setItem(SEL_KEY, String(v)); } catch {} } };

// the six jobs on the home page: every built-in strategy + your own
const JOBS = [
  { id: 'scalper', seed: 'crew-shill', line: 'Fast in, fast out on live momentum' },
  { id: 'trend', seed: 'crew-trade', line: 'Rides strong moves floor by floor' },
  { id: 'dip', seed: 'crew-research', line: 'Digs into pullbacks after a run' },
  { id: 'sniper', seed: 'crew-dev', line: 'Measures twice, enters only the best' },
  { id: 'classic', seed: 'crew-launch', line: 'The balanced all-round plan' },
  { id: 'custom', seed: 'crew-custom', name: 'Custom Viber', line: 'Your own strategy and rules' },
];

const IC = {
  stats: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>',
  play: '<svg class="ic-play" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="M10 8l6 4-6 4z"/></svg>',
  brick: '<svg class="ic-brick" viewBox="0 0 32 24" aria-hidden="true"><rect x="2" y="8" width="28" height="14" rx="2"/><rect x="5" y="3" width="8" height="6" rx="2"/><rect x="19" y="3" width="8" height="6" rx="2"/></svg>',
  arrow: '<svg class="ic-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  up: '<svg class="ic-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
};

export function HomePage(app) {
  const cfg = app.api.config;
  let el, office = null, phone = null, bOffice = null, lastFeedKey = '', lastHeavy = 0, tick = 0;
  let feedFilter = 'all', selNo = Number(store.get()) || 0, boKey = '';

  const mineOf = (snap) => (wallet.address ? (snap.agents || []).filter((a) => a.creator === wallet.address) : []);
  const selected = (snap) => { const m = mineOf(snap); return m.find((a) => a.no === selNo) || m.sort((a, b) => b.createdAt - a.createdAt)[0] || null; };
  const stName = (a) => strategyById(cfg, a.strategy)?.name || 'Custom';
  const stCls = (a) => (a.paused ? 'paused' : a.status === 'ACTIVE' ? 'work' : 'idle');
  const stTxt = (a) => (a.paused ? 'Paused' : a.status === 'ACTIVE' ? 'Working' : 'Idle');

  // ── hero ──
  const fallbackHTML = () => `<img class="office-img" src="brand/banner.jpg" alt="The VIBER site office">
    <button type="button" class="fb-bub ob ob-shill" data-role="shill" style="left:36.3%;top:44.5%"><span class="ob-t"><b>Content Creator</b><small>Posting on X</small></span></button>
    <button type="button" class="fb-bub ob ob-trade" data-role="trade" style="left:57.5%;top:32.5%"><span class="ob-t"><b>Trader</b><small>Trading 24/7</small></span></button>
    <button type="button" class="fb-bub ob ob-research" data-role="research" style="left:36.1%;top:70.1%"><span class="ob-t"><b>Researcher</b><small>Finding trends</small></span></button>
    <button type="button" class="fb-bub ob ob-launch" data-role="launch" style="left:50.2%;top:62.7%"><span class="ob-t"><b>Launcher</b><small>Launching coins</small></span></button>
    <button type="button" class="fb-bub ob ob-community" data-role="community" style="left:64.1%;top:54.4%"><span class="ob-t"><b>Community Manager</b><small>Replying &amp; engaging</small></span></button>`;
  const feedOffice = (snap) => {
    if (!office) return;
    const key = (snap.feed?.[0]?.id || '') + ':' + (snap.coins?.[0]?.mint || '') + ':' + (snap.tokens?.length || 0);
    if (key === lastFeedKey) return;
    lastFeedKey = key;
    office.setData({ trades: snap.feed || [], tokens: snap.tokens || [], coins: snap.coins || [] });
  };

  const statsHTML = (s) => `
    <div class="ps-row"><div><b>${(s.agentsTotal || 0).toLocaleString('en-US')}</b><small>Vibers created</small></div><span class="ps-bars">${IC.stats}</span></div>
    <div class="ps-row"><div><b>${sol(s.volume24hSol || 0, 1)} <i>SOL</i></b><small>Traded by vibers · 24h</small></div><span class="ps-bars">${IC.stats}</span></div>
    <div class="ps-row"><div><b class="${tone(s.pnlSol)}">${signedSol(s.pnlSol || 0, 2)} <i>SOL</i></b><small>Total PnL</small></div><span class="ps-bars">${IC.stats}</span></div>
    <div class="ps-mini"><span><b>${s.agentsActive || 0}</b> working</span><span><b>${(s.trades24h || 0).toLocaleString('en-US')}</b> trades 24h</span><span><b>${sol(s.aumSol || 0, 2)}</b> SOL in wallets</span></div>`;

  // recent activity: trades, launches and promotions, newest first
  const activityHTML = (snap) => {
    const items = [];
    for (const t of (snap.feed || []).slice(0, 10)) items.push({ ts: t.ts, seed: t.avatarSeed, href: `#/viber/${t.agentNo}`, text: `${esc(t.agentName)} ${t.side === 'BUY' ? 'bought' : 'sold'} <b>$${esc(t.symbol)}</b>${t.side === 'SELL' && t.pnlPct != null ? ` <span class="${tone(t.pnlPct)}">${pct(t.pnlPct)}</span>` : ''}` });
    const byId = Object.fromEntries((snap.agents || []).map((a) => [a.id, a]));
    for (const c of (snap.coins || []).slice(0, 6)) { const a = byId[c.agentId]; if (a) items.push({ ts: c.createdAt, seed: a.avatarSeed, href: `#/viber/${a.no}`, text: `${esc(a.name)} launched <b>$${esc(c.ticker)}</b>` }); }
    for (const th of (snap.thoughts || []).filter((x) => x.levelUp).slice(0, 4)) items.push({ ts: th.ts, seed: th.avatarSeed, href: `#/viber/${th.agentNo}`, text: `${esc(th.agentName)} promoted to <b>${esc(th.levelUp)}</b>` });
    items.sort((a, b) => b.ts - a.ts);
    if (!items.length) return '<div class="ra-empty">Quiet on site. Build the first viber and it shows up here.</div>';
    return items.slice(0, 6).map((x) => `<a class="ra-item" href="${x.href}">${avatar(x.seed, 28)}<span>${x.text}</span><time data-ago="${x.ts}">${ago(x.ts)}</time></a>`).join('');
  };

  // ── jobs ──
  const jobsHTML = () => JOBS.map((j, i) => {
    const st = j.id === 'custom' ? null : strategyById(cfg, j.id);
    if (j.id !== 'custom' && !st) return '';
    if (j.id === 'custom' && cfg.customEnabled === false) return '';
    return `<button type="button" class="job${i === 0 ? ' hot' : ''}" data-job="${j.id}">
      <span class="job-av">${avatar(j.seed, 72)}<span class="job-badge strat-${j.id}">${STRAT_ICONS[j.id] || ''}</span></span>
      <span class="job-t"><b>${esc(j.name || st.name)}</b><small>${esc(j.line)}</small></span>
      <span class="job-go">${IC.arrow}</span>
    </button>`;
  }).join('');

  // ── your vibers ──
  const myHTML = (snap) => {
    const mine = mineOf(snap).sort((a, b) => b.createdAt - a.createdAt);
    const sel = selected(snap);
    if (!wallet.address) return `<div class="yb-empty"><p>Connect your wallet to see your vibers here.</p><button class="btn btn-primary" type="button" data-connect>Connect wallet</button></div>`;
    if (!mine.length) return `<div class="yb-empty"><p>No vibers yet. Your first one gets its own desk.</p><a class="btn btn-primary" href="#/build">Launch your viber</a></div>`;
    return mine.slice(0, 6).map((a) => `<button type="button" class="yb-row${sel && sel.no === a.no ? ' on' : ''}" data-sel="${a.no}">
      ${avatar(a.avatarSeed, 36)}<span class="yb-name"><b>${esc(a.name)}</b><small>$${esc(a.coin?.ticker || '')} · ${esc(stName(a))}</small></span>
      <span class="yb-st ${stCls(a)}"><i></i>${stTxt(a)}</span>
      <b class="yb-pnl ${tone(a.pnlSol)}">${signedSol(a.pnlSol, 3)} SOL</b>
    </button>`).join('') + (mine.length > 6 ? `<a class="yb-more" href="#/my-vibers">All ${mine.length} vibers →</a>` : '');
  };
  const myCount = (snap) => { const m = mineOf(snap); return wallet.address ? `${m.filter((a) => a.status === 'ACTIVE' && !a.paused).length} / ${m.length}` : ''; };

  // ── the selected viber's office + career ──
  const xpHTML = (a) => {
    const l = a.level;
    if (!l) return '';
    return `<div class="bo-xp"><div class="bo-xp-top"><span>Level ${l.no} · ${esc(l.name)}</span><span>${l.next ? `${sol(l.bestProfitSol, 3)} / ${sol(l.next.minProfitSol, 2)} SOL` : 'Max level'}</span></div><div class="bo-track"><i style="width:${(l.progress * 100).toFixed(1)}%"></i></div></div>`;
  };
  const infoHTML = (a) => {
    const st = strategyById(cfg, a.strategy);
    return `<div class="bo-info">${xpHTML(a)}
      <div class="bo-card"><div class="bo-head"><span class="bo-ic strat-${esc(stratKey(a.strategy))}">${stratIcon(a.strategy)}</span><b>${esc(a.name)}</b><span class="yb-st ${stCls(a)}"><i></i>${stTxt(a)}</span></div>
        <p>${esc(st ? st.goal : 'Trades with its own custom strategy.')}</p>
        <div class="bo-stats"><div><b>${a.trades}</b><small>Trades</small></div><div><b>${a.winRate == null ? '–' : Math.round(a.winRate * 100) + '%'}</b><small>Win rate</small></div><div><b class="${tone(a.pnlSol)}">${signedSol(a.pnlSol, 3)}</b><small>PnL (SOL)</small></div></div></div>
      <div class="bo-btns"><a class="btn btn-primary" href="#/viber/${a.no}">Customize viber</a><button type="button" class="btn icon-more" data-shill-a="${esc(a.id)}" title="Shill on X" aria-label="Shill on X">𝕏</button></div>
    </div>`;
  };
  const officeCardHTML = (snap) => {
    const a = selected(snap);
    if (!a) return `<div class="bo-grid"><div class="bo-stage bo-static"><img src="brand/banner.jpg" alt="A VIBER site office"></div>
      <div class="bo-info"><div class="bo-card"><b>Every viber gets an office</b><p>It starts in ${esc(OFFICE_NAMES[1])} and moves up with every promotion, all the way to ${esc(OFFICE_NAMES[6])}.</p></div><a class="btn btn-primary btn-block" href="#/build">Launch your viber</a></div></div>`;
    return `<div class="bo-grid"><div class="bo-stage" id="h-bo-stage"></div>${infoHTML(a)}</div>`;
  };
  const officeKey = (a) => (a ? [a.no, a.skin || '', a.office || a.level?.no || 1, a.paused ? 1 : 0, a.status].join('|') : 'none');
  const stateOf = (a) => {
    if (a.status !== 'ACTIVE') return { state: 'idle', title: a.name, sub: 'Getting ready…' };
    if (a.paused) return { state: 'sleep', title: a.name, sub: 'Paused · Zzz' };
    return { state: 'work', title: a.name, sub: stName(a) + ' · on shift' };
  };
  const mountBuilderOffice = (a) => {
    bOffice?.destroy(); bOffice = null;
    const stage = el?.querySelector('#h-bo-stage');
    if (!a || !stage) return;
    try {
      const model = a.skin && SKIN_MODELS[a.skin] ? SKIN_MODELS[a.skin]() : null;
      const p = robotParts(a.baseSeed || a.avatarSeed);
      bOffice = createOffice(stage, { level: a.office || a.level?.no || 1, agent: { model, spec: model ? null : p.spec, ...stateOf(a) } });
      bOffice.setAgent?.(stateOf(a));
    } catch { stage.innerHTML = '<img src="brand/banner.jpg" alt="">'; }
  };

  const upgradeHTML = (snap) => {
    const a = selected(snap);
    const L = cfg.levels || [];
    const no = a?.level?.no || 1, next = L[no] || null;
    const reward = next ? Math.floor(next.minProfitSol * (next.rewardPct || 0) * 1e6) / 1e6 : 0;
    return `<header class="card-head"><h2>Upgrade Office</h2><span class="up-lv">Level ${no}${next ? ` <b>→ ${no + 1}</b>` : ''}</span></header>
      <div class="up-rooms">${[1, 2, 3, 4, 5, 6].map((n) => `<span class="up-room${n <= no ? ' on' : ''}${n === no + 1 ? ' next' : ''}" title="${esc(OFFICE_NAMES[n])}"><i>${n}</i></span>`).join('')}</div>
      <p class="up-name">${next ? `Next: <b>${esc(OFFICE_NAMES[no + 1])}</b> as ${esc(next.name)}` : `<b>${esc(OFFICE_NAMES[6])}</b> unlocked. Top floor.`}</p>
      <ul class="up-list">
        ${next ? `<li>${IC.brick}<span>Reach <b>${sol(next.minProfitSol, 2)} SOL</b> trading profit</span></li>` : ''}
        ${next && reward > 0 ? `<li>${IC.brick}<span>Promotion pays <b class="up">${sol(reward, 3)} SOL</b> automatically</span></li>` : ''}
        <li>${IC.brick}<span>Unlocks a new office design</span></li>
        <li>${IC.brick}<span>New title: ${esc(next ? next.name : L[L.length - 1]?.name || '')}</span></li>
      </ul>
      <a class="btn btn-primary btn-block btn-lg" href="${a ? `#/viber/${a.no}` : '#/build'}">${IC.up}<span>${a ? 'Upgrade Office' : 'Start building'}</span></a>
      <small class="up-note">Offices are earned with trading profit, never bought. Deposits do not count.</small>`;
  };

  // ── vibers, right now: what each viber did and why ──
  const thoughtHTML = (t) => {
    const img = t.image ? `<img src="${esc(t.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
    const act = t.levelUp ? 'promoted' : t.failed ? 'tried' : t.blocked ? 'held back' : t.action === 'BUY' ? 'bought' : t.action === 'SELL' ? 'sold' : t.note ? 'noted' : 'decided';
    const tr = t.trade ? `<span class="mr-trade ${t.trade.side === 'BUY' ? 'buy' : tone(t.trade.pnlPct)}">${t.trade.side} ${sol(t.trade.sol, 3)} SOL${t.trade.side === 'SELL' && t.trade.pnlPct != null ? ' · ' + pct(t.trade.pnlPct) : ''}</span>` : '';
    return `<article class="mr-item mr-${(t.action || 'hold').toLowerCase()}${t.blocked ? ' mr-blocked' : ''}${t.levelUp ? ' mr-lvl' : ''}" data-id="${esc(t.id)}">
      <a class="mr-av" href="#/viber/${t.agentNo}" aria-label="${esc(t.agentName)}"><span class="av av-42">${robotSVG(t.avatarSeed)}${img}</span></a>
      <div class="mr-body">
        <div class="mr-top"><a href="#/viber/${t.agentNo}"><b>$${esc(t.ticker || t.agentName)}</b></a><span class="mr-act">${act}</span><span class="mr-dot">·</span><time data-ago="${t.ts}">${ago(t.ts)}</time>${tr}${t.trade?.url ? `<a class="mr-tx" href="${esc(t.trade.url)}" target="_blank" rel="noopener">tx ↗</a>` : ''}</div>
        <p class="mr-text">${esc(t.text)}</p>
        ${t.blocked ? `<p class="mr-why">${esc(t.blocked)}</p>` : ''}
      </div>
    </article>`;
  };
  const mindsHTML = (snap) => {
    const list = (snap.thoughts || []).slice(0, 24);
    return list.length ? list.map(thoughtHTML).join('') : `<div class="mr-empty">No viber is on shift yet. The moment one starts working, it writes here what it did and why.</div>`;
  };

  const feedHTML = (feed) => {
    const items = (feed || []).filter((t) => feedFilter === 'all' || t.side === feedFilter).slice(0, 30);
    return items.length ? items.map((t) => feedItem(t)).join('') : `<div class="feed-empty">No trades yet. Vibers start trading a few seconds after their coin launches.</div>`;
  };
  const newBuildsHTML = (snap) => {
    const byId = Object.fromEntries(snap.agents.map((a) => [a.id, a]));
    if (!snap.coins.length) return `<a class="hire empty" href="#/build"><span class="hire-av">${avatar('crew-launch', 56)}</span><span class="hire-t"><b>Your coin here</b><small>The first build gets the first desk</small></span><span class="hire-cta">Build →</span></a>`;
    return snap.coins.slice(0, 5).map((c) => {
      const a = byId[c.agentId];
      const fresh = Date.now() - c.createdAt < 15 * 60_000;
      const st = a ? strategyById(cfg, a.strategy) : null;
      return `<a class="hire" href="#/viber/${a ? a.no : ''}">
        <span class="hire-av">${coinThumb(c, 56)}</span>
        <span class="hire-t"><b>${esc(c.name)}${fresh ? '<span class="new-badge">NEW</span>' : ''}</b><small>$${esc(c.ticker)} · ${a ? esc(a.name) : ''}</small></span>
        <span class="hire-m"><b>${usd(c.mcapUsd)}</b><small>${age(c.createdAt)} old</small>${st ? `<span class="strat-mini strat-${esc(stratKey(st))}" title="${esc(st.name)}">${stratIcon(st)}</span>` : ''}</span>
      </a>`;
    }).join('');
  };

  function html(snap) {
    return `<div class="wrap home">
      <section class="hero2">
        <div class="hero2-copy">
          <h1 class="brick-word" aria-label="VIBER"><span>V</span><span>I</span><span>B</span><span>E</span><span class="y">R</span></h1>
          <h2 class="hero2-h">Launch your AI viber<br>and let it <em>work for you.</em></h2>
          <p class="hero2-p">Launch a coin, give your viber a job and it gets its own Solana wallet. It trades real SOL, keeps every creator fee, explains every move and grows 24/7.</p>
          <div class="hero2-cta">
            <a class="btn btn-primary btn-lg" href="#/build">${IC.brick}<span>Launch Your Viber</span>${IC.arrow}</a>
            <a class="btn btn-lg btn-ghost" href="#/how">${IC.play}<span>How it works</span></a>
          </div>
        </div>
        <div class="office hero2-office" id="h-office"></div>
        <aside class="hero2-side">
          <section class="card ps-card"><header class="card-head"><h2>Platform Stats</h2><span class="live-dot">Live</span></header><div id="h-stats">${statsHTML(snap.stats || {})}</div></section>
          <section class="card ra-card"><header class="card-head"><h2>Recent Activity</h2></header><div id="h-activity">${activityHTML(snap)}</div></section>
        </aside>
      </section>

      <section class="jobs" id="h-jobs" aria-label="Pick a job for your viber">${jobsHTML()}</section>

      <section class="trio">
        <div class="card yb-card"><header class="card-head"><h2>Your Vibers</h2><span class="sub" id="h-my-n">${myCount(snap)}</span></header><div class="yb-list" id="h-my">${myHTML(snap)}</div></div>
        <div class="card bo-wrap"><header class="card-head"><h2>Viber Office</h2><span class="sub" id="h-bo-sub"></span></header><div id="h-bo"></div></div>
        <div class="card up-card" id="h-up">${upgradeHTML(snap)}</div>
      </section>

      <section class="duo2">
        <div class="minds" id="h-minds-card">
          <header class="minds-head"><span class="minds-live"><i></i>LIVE</span><h2>Vibers, right now</h2><span class="minds-n" id="h-minds-n">${snap.thinking || 0} on shift</span></header>
          <div class="minds-list" id="h-minds" aria-live="polite">${mindsHTML(snap)}</div>
        </div>
        <div class="card bonded-card">
          <header class="card-head"><h2>Researcher's phone</h2><span class="live">LIVE</span></header>
          <div class="phone-stage" id="h-phone" title="Drag to turn the phone, tap a coin to open it"></div>
          <div class="phone-cap">Just bonded on pump.fun · drag to turn</div>
        </div>
      </section>

      <section class="duo">
        <section class="card feed-card" id="h-feed-card">
          <header class="card-head"><h2>Trading floor</h2><span class="live">LIVE</span>
            <div class="right"><div class="seg" id="h-feed-seg"><button class="on" data-f="all">All</button><button data-f="BUY">Buys</button><button data-f="SELL">Sells</button></div></div>
          </header>
          <div class="feed timeline" id="h-feed">${feedHTML(snap.feed)}</div>
        </section>
        <div class="card hires-card">
          <header class="card-head"><h2>New builds</h2><span class="sub" style="margin-left:auto">latest coins + their vibers</span></header>
          <div class="hires" id="h-recent">${newBuildsHTML(snap)}</div>
          <a class="card-foot" href="#/vibers">Full leaderboard →</a>
        </div>
      </section>
    </div>`;
  }

  const paintMine = (snap) => {
    if (!el) return;
    el.querySelector('#h-my').innerHTML = myHTML(snap);
    el.querySelector('#h-my-n').textContent = myCount(snap);
    const a = selected(snap);
    el.querySelector('#h-bo-sub').textContent = a ? OFFICE_NAMES[a.office || a.level?.no || 1] || '' : '';
    const key = officeKey(a);
    if (key !== boKey) {
      boKey = key;
      el.querySelector('#h-bo').innerHTML = officeCardHTML(snap);
      mountBuilderOffice(a);
    } else if (a) {
      const info = el.querySelector('#h-bo .bo-info');
      if (info) { const tmp = document.createElement('div'); tmp.innerHTML = infoHTML(a); info.replaceWith(tmp.firstElementChild); }
      bOffice?.setAgent?.(stateOf(a));
    }
    el.querySelector('#h-up').innerHTML = upgradeHTML(snap);
  };
  const paintMinds = (snap) => {
    const box = el?.querySelector('#h-minds');
    if (!box) return;
    const first = box.querySelector('.mr-item')?.dataset.id;
    box.innerHTML = mindsHTML(snap);
    const it = box.querySelector('.mr-item');
    if (it && first && it.dataset.id !== first) it.classList.add('fresh');
    el.querySelector('#h-minds-n').textContent = `${snap.thinking || 0} on shift`;
  };
  const flash = (c, block) => {
    c.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block });
    c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
  };

  return {
    mount(root, snap) {
      root.innerHTML = html(snap);
      el = root;
      const act = (role) => {
        if (role === 'launch') app.navigate('#/build');
        else if (role === 'shill' || role === 'community') app.shill();
        else if (role === 'research') flash(el.querySelector('.bonded-card'), 'center');
        else if (role === 'trade') { flash(el.querySelector('#h-minds-card'), 'start'); office?.celebrate('trade'); }
        else app.navigate('#/how');
      };
      const host = el.querySelector('#h-office');
      try { office = createOffice(host, { onAction: act, level: MAIN_OFFICE }); host.classList.add('is-3d'); }
      catch { office = null; host.classList.add('fallback'); host.insertAdjacentHTML('beforeend', fallbackHTML()); }
      host.addEventListener('click', (e) => { const b = e.target.closest('.fb-bub'); if (b) act(b.dataset.role); });
      feedOffice(snap);

      el.querySelector('#h-jobs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-job]'); if (!b) return;
        if (b.dataset.job === 'custom') app.strategyBuilder({ onSaved: () => app.navigate('#/build') });
        else app.navigate('#/build?s=' + b.dataset.job);
      });
      el.querySelector('.trio').addEventListener('click', (e) => {
        if (e.target.closest('[data-connect]')) { app.openConnect(); return; }
        const r = e.target.closest('[data-sel]');
        if (r) { selNo = Number(r.dataset.sel); store.set(selNo); paintMine(app.api.snapshot); return; }
        const s = e.target.closest('[data-shill-a]');
        if (s) app.shill(s.dataset.shillA);
      });
      phone = createPhone(el.querySelector('#h-phone'), {
        items: snap.bonded || [],
        onOpen: (it) => window.open('https://pump.fun/coin/' + encodeURIComponent(it.mint), '_blank', 'noopener'),
      });
      el.querySelector('#h-feed-seg').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        feedFilter = b.dataset.f;
        el.querySelectorAll('#h-feed-seg button').forEach((x) => x.classList.toggle('on', x === b));
        el.querySelector('#h-feed').innerHTML = feedHTML(app.api.snapshot.feed);
      });
      paintMine(snap);
      tick = setInterval(() => { el?.querySelectorAll('time[data-ago]').forEach((t) => { t.textContent = ago(Number(t.dataset.ago)); }); }, 5000);
    },
    update(snap) {
      if (!el) return;
      feedOffice(snap);
      el.querySelector('#h-stats').innerHTML = statsHTML(snap.stats || {});
      el.querySelector('#h-activity').innerHTML = activityHTML(snap);
      paintMinds(snap);
      const now = Date.now();
      if (now - lastHeavy > 3000) {
        lastHeavy = now;
        el.querySelector('#h-recent').innerHTML = newBuildsHTML(snap);
        paintMine(snap);
      }
    },
    onWallet() { if (el) paintMine(app.api.snapshot); },
    onTrade(t) {
      if (!el) return;
      feedOffice(app.api.snapshot);
      office?.celebrate('trade');
      el.querySelector('#h-activity').innerHTML = activityHTML(app.api.snapshot);
      if (feedFilter !== 'all' && t.side !== feedFilter) return;
      const feed = el.querySelector('#h-feed');
      feed.querySelector('.feed-empty')?.remove();
      feed.insertAdjacentHTML('afterbegin', feedItem(t, true));
      while (feed.children.length > 30) feed.lastElementChild.remove();
    },
    onLaunch() { office?.celebrate('launch'); },
    onLevelUp() { office?.celebrate('launch'); },
    onBonded(b) { phone?.push(b); },
    destroy() { clearInterval(tick); office?.destroy(); office = null; bOffice?.destroy(); bOffice = null; phone?.destroy(); phone = null; el = null; },
  };
}
