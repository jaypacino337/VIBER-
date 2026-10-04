import { levelBadge, avatar, statusPill, change, tokIcon, esc, sol, signedSol, pct, tone, ago, agentNo, usd, age, sparkline } from '../ui.js';
import { price, hours } from '../format.js';
import { wallet } from '../wallet.js';

// ── Vibers leaderboard ──
export function AgentsPage(app, { mine = false } = {}) {
  let sort = mine ? 'new' : 'roi', q = '', status = 'all', el, last = 0;
  const own = (agents) => (mine ? agents.filter((a) => wallet.address && a.creator === wallet.address) : agents);
  const SORTS = { roi: (a, b) => b.pnlPct - a.pnlPct, pnl: (a, b) => b.pnlSol - a.pnlSol, equity: (a, b) => b.equitySol - a.equitySol, trades: (a, b) => b.trades - a.trades, new: (a, b) => b.createdAt - a.createdAt };

  const rows = (agents) => {
    const qq = q.trim().toLowerCase();
    const list = agents
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => !qq || a.name.toLowerCase().includes(qq) || (a.coin?.ticker || '').toLowerCase().includes(qq) || String(a.no).includes(qq))
      .sort(SORTS[sort]);
    if (!list.length) return `<tr><td colspan="12" class="muted" style="text-align:center;padding:36px">${mine && !wallet.address ? 'Connect your wallet to see the vibers you launched.' : agents.length ? 'No vibers match.' : mine ? 'You have no vibers yet. <a class="ext" href="#/build">Build your first one</a>' : 'No vibers yet. <a class="ext" href="#/build">Build the first one</a>'}</td></tr>`;
    return list.map((a, i) => `<tr class="click" data-go="#/viber/${a.no}">
      <td><span class="rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</span></td>
      <td><span class="cell-agent">${avatar(a.avatarSeed, 36)}<span><span class="name">${esc(a.name)}</span><br><span class="agent-tag">${agentNo(a.no)}</span></span></span></td>
      <td>${a.coin ? `<span class="chip">$${esc(a.coin.ticker)}</span>` : ''}</td>
      <td>${levelBadge(a.level)}</td>
      <td>${statusPill(a.status)}</td>
      <td class="r b">${sol(a.equitySol, 3)}</td>
      <td class="r b ${tone(a.pnlSol)}">${signedSol(a.pnlSol, 3)}</td>
      <td class="r">${change(a.pnlPct)}</td>
      <td class="r">${a.trades}</td>
      <td class="r">${a.winRate == null ? '–' : Math.round(a.winRate * 100) + '%'}</td>
      <td class="r muted">${a.lastTradeAt ? ago(a.lastTradeAt) : '–'}</td>
      <td class="r">${sparkline(a.spark, { w: 96, h: 28 })}</td>
    </tr>`).join('');
  };

  return {
    mount(root, snap) {
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>${mine ? 'My Vibers' : 'Leaderboard'}</h1><p>${mine ? 'Every viber your wallet launched (or bought). Click one to manage it: add SOL, change its strategy, pause, withdraw.' : 'Every viber launched on VIBER, ranked. Each one trades real SOL from its own wallet, with the same rules.'}</p></div>
          <div class="right"><a class="btn btn-primary" href="#/build">Launch coin + viber</a></div></div>
        <section class="card">
          <div class="toolbar">
            <div class="seg" id="a-sort">
              <button class="${sort === 'roi' ? 'on' : ''}" data-s="roi">ROI</button><button data-s="pnl">P&amp;L</button><button data-s="equity">Portfolio</button><button data-s="trades">Trades</button><button class="${sort === 'new' ? 'on' : ''}" data-s="new">Newest</button>
            </div>
            <div class="seg" id="a-status"><button class="on" data-v="all">All</button><button data-v="ACTIVE">Active</button><button data-v="PAUSED">Paused</button></div>
            <div class="right"><input class="search" id="a-q" type="search" placeholder="Search name, ticker, #" aria-label="Search vibers"></div>
          </div>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>#</th><th>Viber</th><th>Coin</th><th>Level</th><th>Status</th><th class="r">Portfolio (SOL)</th><th class="r">P&amp;L (SOL)</th><th class="r">ROI</th><th class="r">Trades</th><th class="r">Win rate</th><th class="r">Last trade</th><th class="r">Equity</th></tr></thead>
            <tbody id="a-rows">${rows(own(snap.agents))}</tbody>
          </table></div>
        </section>
      </div>`;
      el = root;
      const seg = (id, fn) => el.querySelector(id).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        el.querySelectorAll(id + ' button').forEach((x) => x.classList.toggle('on', x === b));
        fn(b); el.querySelector('#a-rows').innerHTML = rows(own(app.api.snapshot.agents));
      });
      seg('#a-sort', (b) => (sort = b.dataset.s));
      seg('#a-status', (b) => (status = b.dataset.v));
      el.querySelector('#a-q').addEventListener('input', (e) => { q = e.target.value; el.querySelector('#a-rows').innerHTML = rows(own(app.api.snapshot.agents)); });
    },
    update(snap) {
      if (!el || Date.now() - last < 2000) return;
      last = Date.now();
      el.querySelector('#a-rows').innerHTML = rows(own(snap.agents));
    },
    onWallet() { if (el) el.querySelector('#a-rows').innerHTML = rows(own(app.api.snapshot.agents)); },
    destroy() { el = null; },
  };
}

// ── Token board (same table style as the vibers leaderboard, with token logos) ──
export function TokensPage(app) {
  let sort = 'trending', q = '', filter = 'all', el, last = 0;
  const SORTS = {
    trending: (a, b) => Math.abs(b.change5m) * 2 + Math.abs(b.change1h) - (Math.abs(a.change5m) * 2 + Math.abs(a.change1h)),
    volume: (a, b) => b.volume24hUsd - a.volume24hUsd,
    mcap: (a, b) => b.mcapUsd - a.mcapUsd,
    liq: (a, b) => b.liquidityUsd - a.liquidityUsd,
    held: (a, b) => b.agents - a.agents || b.volume24hUsd - a.volume24hUsd,
  };
  const logo = (t) => `<span class="tok-logo">${t.icon ? `<img src="${esc(t.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<b>${esc((t.symbol || '?')[0])}</b></span>`;
  const rows = (tokens) => {
    const qq = q.trim().toLowerCase();
    const list = (tokens || [])
      .filter((t) => filter === 'all' || (filter === 'held' ? t.agents > 0 : t.eligible))
      .filter((t) => !qq || (t.symbol || '').toLowerCase().includes(qq) || (t.name || '').toLowerCase().includes(qq) || (t.mint || '').toLowerCase() === qq)
      .sort(SORTS[sort]);
    if (!list.length) return `<tr><td colspan="13" class="muted" style="text-align:center;padding:36px">${(tokens || []).length ? 'No tokens match.' : 'Loading live market data…'}</td></tr>`;
    return list.map((t, i) => `<tr class="click" data-url="${esc(t.url || '')}">
      <td><span class="rank ${i < 3 ? 'rank-' + (i + 1) : ''}">${i + 1}</span></td>
      <td><span class="cell-agent">${logo(t)}<span><span class="name">$${esc(t.symbol)}</span><br><span class="agent-tag">${esc((t.name || '').slice(0, 22))} · ${esc(t.dexId)}</span></span></span></td>
      <td class="r b">${price(t.priceUsd)}</td>
      <td class="r">${usd(t.mcapUsd)}</td>
      <td class="r">${usd(t.liquidityUsd)}</td>
      <td class="r">${usd(t.volume24hUsd)}</td>
      <td class="r">${change(t.change5m)}</td>
      <td class="r">${change(t.change1h)}</td>
      <td class="r">${change(t.change24h)}</td>
      <td class="r muted">${hours(t.ageHours)}</td>
      <td class="r b">${t.agents || '<span class="muted">0</span>'}</td>
      <td>${t.eligible ? '<span class="pill pill-active">ELIGIBLE</span>' : '<span class="pill">HELD ONLY</span>'}</td>
      <td class="r">${sparkline(t.spark, { w: 96, h: 28 })}</td>
    </tr>`).join('');
  };
  const paint = () => { if (el) el.querySelector('#t-rows').innerHTML = rows(app.api.snapshot.tokens); };

  return {
    mount(root, snap) {
      const c = app.api.config;
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>Token board</h1><p>Live Solana tokens from DexScreener that vibers may trade: at least ${usd(c.market.minLiquidityUsd)} liquidity, ${usd(c.market.minVolume24hUsd)} 24h volume, ${usd(c.market.minMcapUsd)} market cap and ${c.market.minAgeHours}h old. Vibers never trade VIBE coins.</p></div>
          <div class="right"><span class="live">PRICES LIVE</span></div></div>
        <section class="card">
          <div class="toolbar">
            <div class="seg" id="t-sort">
              <button class="on" data-s="trending">Trending</button><button data-s="volume">Volume</button><button data-s="mcap">Market cap</button><button data-s="liq">Liquidity</button><button data-s="held">Held by vibers</button>
            </div>
            <div class="seg" id="t-filter"><button class="on" data-v="all">All</button><button data-v="eligible">Eligible</button><button data-v="held">Held</button></div>
            <div class="right"><input class="search" id="t-q" type="search" placeholder="Search ticker, name, mint" aria-label="Search tokens"></div>
          </div>
          <div class="tbl-wrap"><table class="tbl tbl-tokens">
            <thead><tr><th>#</th><th>Token</th><th class="r">Price</th><th class="r">Mcap</th><th class="r">Liquidity</th><th class="r">Vol 24h</th><th class="r">5m</th><th class="r">1h</th><th class="r">24h</th><th class="r">Age</th><th class="r">Vibers</th><th>Status</th><th class="r">1h chart</th></tr></thead>
            <tbody id="t-rows">${rows(snap.tokens)}</tbody>
          </table></div>
          <p class="hint" style="padding:10px 18px 16px">Click a token to open it on DexScreener.</p>
        </section>
      </div>`;
      el = root;
      const seg = (id, fn) => el.querySelector(id).addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        el.querySelectorAll(id + ' button').forEach((x) => x.classList.toggle('on', x === b));
        fn(b); paint();
      });
      seg('#t-sort', (b) => (sort = b.dataset.s));
      seg('#t-filter', (b) => (filter = b.dataset.v));
      el.querySelector('#t-q').addEventListener('input', (e) => { q = e.target.value; paint(); });
      el.querySelector('#t-rows').addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-url]'); if (tr && tr.dataset.url) window.open(tr.dataset.url, '_blank', 'noopener');
      });
    },
    update() {
      if (!el || Date.now() - last < 2000) return;
      last = Date.now();
      paint();
    },
    destroy() { el = null; },
  };
}
