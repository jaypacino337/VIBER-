// Shared UI pieces
import { robotSVG } from './robot.js';
import { esc, sol, signedSol, pct, tone, ago, agentNo, usd, short, age } from './format.js';
import { sparkline } from './charts.js';

// Builder avatar: the builder's voxel worker. stand: true draws the whole body.
export const avatar = (seed, size = 42, { stand = false } = {}) => `<span class="av av-${size}${stand ? ' stand' : ''}">${robotSVG(seed, { stand })}</span>`;

// Tiny pixel icons (currentColor): rows of '#' and '.'
export function pixIcon(rows) {
  let rects = '';
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') { x++; continue; }
      let w = 1;
      while (row[x + w] === '#') w++;
      rects += `<rect x="${x}" y="${y}" width="${w}" height="1"/>`;
      x += w;
    }
  });
  return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${rects}</svg>`;
}

// Pixel icons for the Crewfi crew: LAUNCH → SHILL → TRADE → FEES
export const ICONS = {
  launch: pixIcon(['.....#.....', '....###....', '...#####...', '...##.##...', '...##.##...', '...#####...', '...#####...', '..#######..', '.##.###.##.', '.#..###..#.', '....#.#....']),
  shill: pixIcon(['#.......#', '##.....##', '.##...##.', '..##.##..', '...###...', '..##.##..', '.##...##.', '##.....##', '#.......#']),
  trade: pixIcon(['.......####', '........###', '.......##.#', '......##...', '#....##....', '##..##.....', '.####......', '..##.......', '...........', '###########', '...........']),
  fees: pixIcon(['...#####...', '...#...#...', '###########', '#.........#', '#.........#', '####.#.####', '#...###...#', '#.........#', '#.........#', '###########']),
  x: pixIcon(['#.......#', '##.....##', '.##...##.', '..##.##..', '...###...', '..##.##..', '.##...##.', '##.....##', '#.......#']),
  sun: pixIcon(['....#....', '.#.....#.', '...###...', '..#####..', '#.#####.#', '..#####..', '...###...', '.#.....#.', '....#....']),
  moon: pixIcon(['..####...', '.##......', '##.......', '##.......', '##.......', '###......', '.###...##', '..######.', '...####..']),
};

export function agentLoop(extraClass = '') {
  const items = [
    ['launch', 'Launch', 'Your coin goes live on pump.fun, created by the builder\'s own wallet'],
    ['shill', 'Shill', 'One click writes a post for X with the coin, CA and live P&L'],
    ['trade', 'Trade', 'Buys and sells real SOL with fixed rules, every few seconds'],
    ['fees', 'Fees', 'Creator fees are claimed and go back into the builder\'s wallet'],
  ];
  return `<ol class="loop ${extraClass}">${items.map(([k, t, d]) => `<li><span class="loop-ic">${ICONS[k]}</span><b>${t.toUpperCase()}</b><span>${d}</span></li>`).join('')}</ol>`;
}

const TOK_COLORS = ['#7BD389', '#F2B84B', '#6FA8DC', '#E06C9F', '#9AD0C2', '#F28C6B', '#C9A27E', '#5CC8E0', '#86B84B', '#F5D547'];
export function tokIcon(symbol, icon, lg = false) {
  const cls = 'tok' + (lg ? ' tok-lg' : '');
  const c = TOK_COLORS[(symbol || '?').charCodeAt(0) % TOK_COLORS.length];
  const img = icon ? `<img src="${esc(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<span class="${cls}" style="--tc:${c}">${esc((symbol || '?')[0])}${img}</span>`;
}

export function coinThumb(coin, size = 42) {
  const seed = coin ? coin.mint || coin.ticker : 'coin';
  const img = coin && coin.image ? `<img src="${esc(coin.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  return `<span class="av av-${size}">${robotSVG(seed)}${img}</span>`;
}

const STATUS = {
  ACTIVE: ['pill-active', 'ACTIVE'],
  PAUSED: ['pill-unfunded', 'PAUSED'],
  'LOW BALANCE': ['pill-low', 'LOW BALANCE'],
  AWAITING_FUNDS: ['pill-unfunded', 'WAITING FOR SOL'],
  LAUNCHING: ['pill-unfunded', 'LAUNCHING'],
  LAUNCH_FAILED: ['pill-low', 'LAUNCH FAILED'],
  EXPIRED: ['pill', 'EXPIRED'],
};
export function statusPill(status) {
  const [cls, label] = STATUS[status] || ['pill', status];
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

export const sidePill = (side) => `<span class="side side-${side.toLowerCase()}">${side}</span>`;

export function sourceChip(source) {
  if (source === 'take-profit') return `<span class="chip chip-tp">Take profit</span>`;
  if (source === 'trailing-stop') return `<span class="chip chip-tp">Trailing stop</span>`;
  if (source === 'time-exit') return `<span class="chip">Time exit</span>`;
  if (source === 'stop-loss') return `<span class="chip chip-sl">Stop loss</span>`;
  if (source === 'withdraw') return `<span class="chip">Withdrawal</span>`;
  if (source === 'rugged') return `<span class="chip chip-sl">Rugged · written off</span>`;
  return '';
}

export const change = (x) => `<span class="chg ${tone(x)}">${pct(x)}</span>`;
export const txLink = (sig, label) => (sig ? `<a class="ext mono" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">${label || short(sig, 5)} ↗</a>` : '');
export const addrLink = (a, label) => `<a class="ext mono" href="https://solscan.io/account/${esc(a)}" target="_blank" rel="noopener">${label || short(a, 5)} ↗</a>`;

// One row in ACTIVE BUILDER TRADES
export function feedItem(t, fresh = false) {
  const href = `#/builder/${t.agentNo}`;
  const pnl = t.side === 'SELL' ? `<span class="fi-pnl ${tone(t.pnlPct)}">${pct(t.pnlPct)}</span>` : '';
  return `<article class="fi${fresh ? ' fresh' : ''}" data-id="${esc(t.id)}">
    <a href="${href}" aria-label="${esc(t.agentName)}">${avatar(t.avatarSeed, 42)}</a>
    <div>
      <div class="fi-top">
        <a href="${href}"><span class="agent-tag">${agentNo(t.agentNo)}</span> <span class="name">${esc(t.agentName)}</span></a>
        <span class="fi-time" data-ago="${t.ts}">${ago(t.ts)}</span>
      </div>
      <div class="fi-main">
        ${sidePill(t.side)}
        <span class="tokname">$${esc(t.symbol)}</span>
        <span class="fi-amt">${sol(t.sol, 3)} <small>SOL</small></span>
        ${pnl}
        ${sourceChip(t.source)}
        <span class="fi-tx">${txLink(t.sig, 'tx')}</span>
      </div>
      ${t.reason ? `<p class="fi-reason">${esc(t.reason)}</p>` : ''}
    </div>
  </article>`;
}

// ── career levels (Apprentice → Master Builder) ──
export function levelBadge(l, { short = false } = {}) {
  if (!l) return '';
  return `<span class="lvl lvl-${l.no}" style="--lc:${esc(l.color)}" title="Level ${l.no} of ${l.max}: ${esc(l.name)}"><b>${l.no}</b>${short ? '' : esc(l.name)}</span>`;
}
export function levelBar(l) {
  if (!l) return '';
  const left = l.next ? Math.max(0, l.next.minProfitSol - l.bestProfitSol) : 0;
  return `<div class="lvl-bar" style="--lc:${esc(l.color)};--nc:${esc(l.next?.color || l.color)}">
    <div class="lvl-bar-top"><span>${l.next ? `<b>${sol(left, 3)} SOL</b> more profit → ${esc(l.next.name)}${l.next.rewardSol > 0 ? ` · promotion pays <b class="up">${sol(l.next.rewardSol, 3)} SOL</b>` : ''}` : '<b>Top of the site.</b> Master Builder reached'}</span></div>
    <div class="lvl-track"><i style="width:${(l.progress * 100).toFixed(1)}%"></i></div>
    <div class="lvl-steps">${Array.from({ length: l.max }, (_, i) => `<span class="${i < l.no ? 'on' : ''}"></span>`).join('')}</div>
  </div>`;
}

export function agentCard(a) {
  return `<a class="acard" href="#/builder/${a.no}">
    <div class="acard-top">
      ${avatar(a.avatarSeed, 56)}
      <div style="min-width:0">
        <div class="agent-tag">${agentNo(a.no)}</div>
        <div class="name">${esc(a.name)}</div>
        <div class="acard-meta">${levelBadge(a.level)}${statusPill(a.status)}${a.coin ? `<span class="chip">$${esc(a.coin.ticker)}</span>` : ''}${a.strategy ? `<span class="strat-mini strat-${esc(stratKey(a.strategy))}" title="${esc(isCustomStrat(a.strategy) ? 'custom' : a.strategy)} strategy">${stratIcon(a.strategy)}</span>` : ''}</div>
      </div>
    </div>
    <div class="acard-nums">
      <div><div class="k">Portfolio</div><div class="v">${sol(a.equitySol, 3)} <small class="muted">SOL</small></div></div>
      <div><div class="k">P&amp;L</div><div class="v ${tone(a.pnlSol)}">${pct(a.pnlPct)}</div></div>
    </div>
    ${sparkline(a.spark, { w: 220, h: 38 })}
    <div class="acard-foot"><span>${a.openPositions} open · ${a.trades} trades</span><span>${a.lastTradeAt ? 'traded ' + ago(a.lastTradeAt) : 'no trades yet'}</span></div>
  </a>`;
}

export function copyBtn(text, label = 'Copy') {
  return `<button class="copy" type="button" data-copy="${esc(text)}">${label}</button>`;
}

export { esc, sol, signedSol, pct, tone, ago, agentNo, usd, short, age, sparkline };

// ── strategies (list comes from the server config) ──
const sic = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const STRAT_ICONS = {
  classic: sic('<path d="M12 4v16M6 8h12M6 8l-3 6a3 3 0 0 0 6 0zM18 8l-3 6a3 3 0 0 0 6 0z"/>'),
  scalper: sic('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
  trend: sic('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  dip: sic('<path d="M3 5l6 9 3-3 3 4 6-9"/><path d="M17 6h4v4"/>'),
  sniper: sic('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>'),
  newpairs: sic('<path d="M12 22c4.4 0 7-3 7-6.8 0-3.6-2.6-5.6-3.8-8.7-1 2-2.2 3-3.7 3.1.2-2.6-.8-5-2.9-6.6-.6 4.4-4.6 6.6-4.6 12.2C4 19 7.6 22 12 22z"/><path d="M12 18.5c1.5 0 2.6-1 2.6-2.5 0-1.3-.9-2.1-1.4-3.2-.5 1-1.6 1.6-2.6 1.6-.8.6-1.2 1.2-1.2 1.9 0 1.2 1.1 2.2 2.6 2.2z"/>'),
  custom: sic('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
};
export const isCustomStrat = (id) => typeof id === 'string' && id.startsWith('custom-');
// icon + css class for a strategy object or id (every custom strategy shares the "custom" look)
export const stratKey = (x) => (isCustomStrat(typeof x === 'string' ? x : x?.id) ? 'custom' : (typeof x === 'string' ? x : x?.id));
export const stratIcon = (x) => STRAT_ICONS[stratKey(x)] || '';
// extra: custom strategies the page fetched itself (e.g. the connected wallet's own)
export const strategyById = (cfg, id, extra = []) => (cfg.strategies || []).find((x) => x.id === id)
  || [...(cfg.customStrategies || []), ...extra].find((x) => x && x.id === id)
  || (cfg.strategies || []).find((x) => x.id === cfg.defaultStrategy) || null;
export function strategyChip(cfg, id, extra = []) {
  const st = strategyById(cfg, id, extra);
  return st ? `<span class="chip strat-chip strat-${esc(stratKey(st))}">${stratIcon(st)}${esc(st.name)}${st.custom ? '<em class="cust-tag">custom</em>' : ''}${riskTag(st)}</span>` : '';
}
const p0 = (x) => (x >= 0 ? '+' : '−') + Math.round(Math.abs(x) * 1000) / 10 + '%';
// short rule lines for a strategy card / table
export function strategyRules(st) {
  return [
    ...(st.custom ? [['Entry style', esc(st.baseName || st.base)]] : []),
    ['Per trade', Math.round(st.sizePct * 100) + '% of SOL'],
    ['Take profit / stop', `${p0(st.takeProfitPct)} / ${p0(st.stopLossPct)}`],
    ['Trailing stop', st.trail ? `at ${p0(st.trail.at)}, trail ${Math.round(st.trail.by * 1000) / 10}%` : 'none'],
    ['Max hold', st.maxHoldMin ? st.maxHoldMin + ' min' : 'no limit'],
    ['Open positions', 'up to ' + st.maxOpen],
    ['Cooldown', st.cooldownMin ? st.cooldownMin + ' min' : 'none'],
    ...(st.maxTradeSol ? [['Max per trade', st.maxTradeSol + ' SOL']] : []),
  ];
}
// red "EXTREME RISK" tag + the warning shown before anyone can pick such a strategy
export const riskTag = (st) => (st && st.risk === 'extreme' ? '<em class="risk-tag">EXTREME RISK</em>' : '');
export function riskWarning(st, { checkbox = false, checked = false } = {}) {
  if (!st || st.risk !== 'extreme') return '';
  return `<div class="risk-warn" role="alert">
    <b>⚠ Extreme risk</b>
    <p>${esc(st.name)} buys pump.fun coins that are only minutes old. Most of them go to zero, rugs and bundled launches are common, and prices can drop 50% in seconds, faster than any stop loss can sell. <b>This builder can lose all of its SOL.</b></p>
    <p class="risk-prot">Protections: max ${Math.round(st.sizePct * 100)}% of SOL per trade${st.maxTradeSol ? ` (never more than ${st.maxTradeSol} SOL)` : ''}, ${st.maxOpen} coin${st.maxOpen > 1 ? 's' : ''} at once, take profit ${p0(st.takeProfitPct)}, stop loss ${p0(st.stopLossPct)}, sold after ${st.maxHoldMin} min at most, and it only buys coins that pass every safety filter (volume, buyers, dev holding, dev not selling, no bundles, no whales).</p>
    ${checkbox ? `<label class="risk-ok"><input type="checkbox" data-risk-ok ${checked ? 'checked' : ''}> <span>I understand the risk and that my builder can lose all of its SOL.</span></label>` : ''}
  </div>`;
}

// a skin's price in CREW (skins are paid only in the CREW coin, same value as their SOL price)
const fmtBig = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en'));
export function skinPriceLabel(item, S) {
  const px = S?.payWith?.tokenPriceSol;
  return px > 0 ? `≈ ${fmtBig(item.priceSol / px)} CREW` : `${item.priceSol} SOL in CREW`;
}
