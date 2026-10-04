// How it works: hero, the six launch steps, what a builder does, the career ladder,
// strategies, Demolition + custom strategy, and the fine print (rewards, filters, rules, risk).
import { pct, usd, sol, esc, STRAT_ICONS, strategyRules, riskWarning } from '../ui.js';
import { OFFICE_NAMES } from '../office3d.js';

const P = (x) => Math.round(x * 1000) / 10 + '%';
// the New Pairs safety filters in plain words
function safetyRules(f) {
  const r = [];
  if (f.minAgeSec != null) r.push(['Coin age', `${Math.round(f.minAgeSec / 60)}–${Math.round(f.maxAgeSec / 60)} min`]);
  if (f.minMcapSol != null) r.push(['Market cap', `${f.minMcapSol}–${f.maxMcapSol} SOL`]);
  if (f.minVolSol != null) r.push(['Volume so far', `at least ${f.minVolSol} SOL`]);
  if (f.minBuys != null) r.push(['Buyers', `${f.minBuys}+ buys from ${f.minUniqueBuyers}+ different wallets`]);
  if (f.minBuySellRatio != null) r.push(['Buy pressure', `${f.minBuySellRatio}x more SOL buying than selling (2 min)`]);
  if (f.minChange60s != null) r.push(['Momentum', `up ${P(f.minChange60s)}+ in 60 s, but not more than ${P(f.maxSpike60s)} (no chasing)`]);
  if (f.maxDevPct != null) r.push(['Dev', `holds at most ${P(f.maxDevPct)} and has not sold anything`]);
  if (f.maxEarlyBuyers != null) r.push(['Bundles', `max ${f.maxEarlyBuyers} buyers in the first 3 s, max ${P(f.maxUnseenPct || 0)} bought in the launch block`]);
  if (f.maxTopHolderPct != null) r.push(['Whales', `top holder ≤ ${P(f.maxTopHolderPct)}, top 10 ≤ ${P(f.maxTop10Pct)}`]);
  if (f.maxAgentsPerCoin != null) r.push(['Crowding', `max ${f.maxAgentsPerCoin} Crewfi builders in the same coin`]);
  r.push(['Early exit', 'sells at once if the dev sells, sellers take over or trading stops']);
  return r;
}

const sv = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  wallet: sv('<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>'),
  coin: sv('<ellipse cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7"/><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>'),
  hat: sv('<path d="M4 16h16"/><path d="M6 16v-3a6 6 0 0 1 12 0v3"/><path d="M12 7v3"/><path d="M3 16h18v2H3z"/>'),
  send: sv('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
  rocket: sv('<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1M15 16l2 4-3-1"/>'),
  bars: sv('<path d="M5 20v-5M10 20v-9M15 20v-6M20 20V5"/>', 2.6),
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  fees: sv('<ellipse cx="9" cy="7" rx="5" ry="2.5"/><path d="M4 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><path d="M10 15.5c.8 1.2 2.8 2 5 2 2.8 0 5-1.1 5-2.5v-4c0-1.4-2.2-2.5-5-2.5"/>'),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4),
  brick: '<svg viewBox="0 0 32 24" aria-hidden="true"><rect x="2" y="8" width="28" height="14" rx="2" fill="currentColor"/><rect x="5" y="3" width="8" height="6" rx="2" fill="currentColor"/><rect x="19" y="3" width="8" height="6" rx="2" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="M10 8l6 4-6 4z" fill="var(--surface)"/></svg>',
};
// a tiny line chart per strategy (shape only, shows the style)
const LINES = {
  classic: '2,26 12,20 20,23 30,14 38,17 48,8 56,11 66,4',
  scalper: '2,24 10,18 16,22 24,14 30,18 38,10 44,15 52,8 58,12 66,5',
  trend: '2,28 14,22 22,24 32,16 40,18 50,10 58,12 66,3',
  dip: '2,8 12,14 20,22 28,16 36,24 44,18 52,26 60,14 66,10',
  sniper: '2,22 10,10 18,20 26,8 34,24 42,12 50,26 58,14 66,20',
};
const LCOL = { classic: '#151515', scalper: '#F2B705', trend: '#16A34A', dip: '#2F6FE0', sniper: '#DC2626' };

export function HowPage(app) {
  const c = app.api.config;
  const r = c.trading;
  const L = c.levels || [];
  let el, selStrat = null;
  const builtins = (c.strategies || []).filter((st) => !st.safety);
  const demo = (c.strategies || []).find((st) => st.safety);

  const steps = [
    ['wallet', 'Connect wallet', 'Connect Phantom, Solflare or MetaMask (Solana).'],
    ['coin', 'Fill in your coin', 'Add name, ticker, description, socials and starting capital.'],
    ['hat', 'Builder wallet', 'We create a new Solana wallet for your builder.'],
    ['send', 'Send SOL', `Transfer starting capital + ${c.launch.launchReserveSol} SOL to cover coin creation.`],
    ['rocket', 'Coin launches', 'Your coin goes live on pump.fun with your builder as its creator.'],
    ['bars', 'Builder trades', 'It buys and sells with real SOL, following your strategy.'],
  ];
  const does = [
    ['bars', 'Trades automatically', 'Buys and sells real SOL using your chosen strategy.'],
    ['x', 'Shills on X', 'Writes ready-made posts with your coin, CA and live P&L.'],
    ['fees', 'Earns creator fees', c.fees.creatorSharePct > 0 ? `Claims the coin's creator fees: ${Math.round(c.fees.creatorSharePct * 100)}% to you, the rest keeps trading.` : "Claims all of the coin's creator fees and keeps trading with them."],
    ['wallet', 'Sends to your wallet', 'Withdraw its SOL back to your wallet any time, in one signature.'],
  ];

  const stratDetail = () => {
    const st = selStrat === 'custom' ? null : builtins.find((x) => x.id === selStrat);
    if (!selStrat) return '';
    if (!st) return `<div class="hw-sdetail"><b>Your own strategy</b><p>Build your own strategy with sliders and give it a name. Pick an entry style, then set trade size, open positions, take profit, stop loss, trailing stop, max hold time, cooldown and the entry filters. One per wallet.</p>
      <dl class="kv"><dt>Per trade</dt><dd>1–50% of SOL</dd><dt>Take profit</dt><dd>+2% to +300%</dd><dt>Stop loss</dt><dd>−1% to −50%</dd><dt>Max hold</dt><dd>off or up to 24h</dd></dl></div>`;
    return `<div class="hw-sdetail"><b>${esc(st.name)}</b><p>${esc(st.goal)}</p><dl class="kv">${strategyRules(st).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`;
  };

  const html = () => `<div class="wrap hw">
    <section class="pg-hero">
      <div class="pg-hero-copy">
        <h1 class="pg-big">How it<br><em>works</em></h1>
        <p class="pg-lede">Launch a coin, give your builder a job and it gets its own Solana wallet. It trades real SOL, keeps every creator fee, explains every move and works for you 24/7.</p>
        <div class="pg-cta"><a class="btn btn-primary btn-lg" href="#/build"><span>Launch coin + builder</span>${IC.arrow}</a><a class="btn btn-lg btn-ghost" href="#/"><span class="ic-play">${IC.play}</span><span>See it live</span></a></div>
      </div>
      <div class="pg-hero-art"><img src="brand/pages/how-hero.jpg" alt="A builder at work: launch coin, shill on X, auto trade, earn fees, send to your wallet"></div>
    </section>

    <section class="card hw-steps">
      <div class="hw-side"><h2>From launch<br>to live trades</h2><p>Get your builder up and running in a few simple steps.</p></div>
      <span class="hw-real"><i></i>${c.mode === 'paper' ? 'Paper mode: simulated SOL' : 'Real SOL on Solana mainnet'}</span>
      <ol class="hw-steplist">${steps.map(([ic, t, d], i) => `<li><span class="hw-n">${String(i + 1).padStart(2, '0')}</span><span class="hw-ic">${IC[ic]}</span><b>${t}</b><small>${esc(d)}</small></li>`).join('')}</ol>
    </section>

    <section class="hw-does">
      <div class="hw-side"><h2>What your<br>builder does</h2><p>Once launched, your builder takes care of everything.</p></div>
      <ul>${does.map(([ic, t, d]) => `<li><span class="hw-yic">${IC[ic]}</span><b>${t}</b><small>${esc(d)}</small></li>`).join('')}</ul>
    </section>

    <section class="card hw-ladder">
      <div class="hw-side"><h2>Career ladder</h2><p>Builders get promoted as the trading profit they make. Promotions are permanent and rewards are paid automatically.</p>
        ${c.rewards?.enabled ? '<button type="button" class="btn hw-outline" id="hw-rew-btn"><span>View all rewards</span>' + IC.arrow + '</button>' : ''}</div>
      <ol class="hw-lv">${L.map((l, i) => `<li>
        <img src="brand/pages/lvl${Math.min(6, i + 1)}.png" alt="" loading="lazy">
        <b><i style="--lc:${esc(l.color)}">${l.no}</i>${esc(l.name)}</b>
        <small>${i === 0 ? 'Every new builder' : `${l.minProfitSol} SOL profit`}</small>
        ${i > 0 ? `<small class="hw-office">${esc(OFFICE_NAMES[l.no] || '')}</small>` : ''}
        ${l.rewardSol > 0 ? `<span class="hw-rew">+${l.rewardSol} SOL reward</span>` : ''}
      </li>`).join('')}</ol>
      ${c.rewards?.enabled ? `<div class="hw-rewbox" id="hw-rewbox" hidden>
        <p><b>Promotion rewards are paid automatically</b> in real SOL to the ${c.rewards.payTo === 'agent' ? "builder's own wallet" : "creator's wallet"} the moment a builder reaches a new level. Skip a level and you get every reward on the way. Deposits never count as profit.</p>
        <dl class="kv">
          ${L.filter((l) => l.rewardSol > 0).map((l) => `<dt>${esc(l.name)} (${l.minProfitSol} SOL profit)</dt><dd>+${l.rewardSol} SOL</dd>`).join('')}
          ${c.rewards.wallet ? `<dt>Rewards wallet</dt><dd><a class="ext mono" href="https://solscan.io/account/${esc(c.rewards.wallet)}" target="_blank" rel="noopener">${esc(c.rewards.wallet.slice(0, 6) + '…' + c.rewards.wallet.slice(-6))} ↗</a></dd>` : ''}
          ${c.rewards.balanceSol != null ? `<dt>Balance</dt><dd>${sol(c.rewards.balanceSol, 3)} SOL</dd>` : ''}
          <dt>Paid so far</dt><dd>${sol(c.rewards.paidSol || 0, 3)} SOL</dd>
        </dl></div>` : ''}
    </section>

    <section class="card hw-strats">
      <div class="hw-side"><h2>Strategies</h2><p>Pick a ready strategy or create your own. You can switch anytime.</p></div>
      <div class="hw-sgrid" id="hw-sgrid">${builtins.map((st) => `<button type="button" class="hw-scard strat-${esc(st.id)}${selStrat === st.id ? ' on' : ''}" data-s="${esc(st.id)}" style="--sc:${LCOL[st.id] || '#151515'}">
          <span class="hw-shead"><span class="so-ic">${STRAT_ICONS[st.id] || ''}</span><b>${esc(st.name)}</b></span>
          <svg class="hw-line" viewBox="0 0 68 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${LINES[st.id] || LINES.classic}"/></svg>
          <small>${esc(st.tagline)}.</small></button>`).join('')}
        ${c.customEnabled === false ? '' : `<button type="button" class="hw-scard strat-custom${selStrat === 'custom' ? ' on' : ''}" data-s="custom" style="--sc:#8B5CF6">
          <span class="hw-shead"><span class="so-ic">${STRAT_ICONS.custom}</span><b>Your own</b></span>
          <span class="hw-sliders"><i style="--p:40%"></i><i style="--p:62%"></i><i style="--p:28%"></i></span>
          <small>Custom strategy.</small></button>`}</div>
      <div id="hw-sdetail">${stratDetail()}</div>
    </section>

    <div class="hw-duo">
      ${demo ? `<section class="card hw-demo">
        <div class="hw-demo-l">
          <div class="hw-demo-head"><span class="hw-redic">${STRAT_ICONS[demo.id] || ''}</span><div><h3>${esc(demo.name)}</h3><span class="hw-xr">⚠ EXTREME RISK</span></div></div>
          <div class="hw-demo-body"><img src="brand/pages/tnt.png" alt="" loading="lazy"><p>${esc(demo.goal)}</p></div>
        </div>
        <dl class="hw-table">${strategyRules(demo).slice(0, 5).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
        <details class="hw-more"><summary>Buys only when every filter passes</summary>
          <div class="sw-warn">${riskWarning(demo)}</div>
          <ul class="risk-filters">${safetyRules(demo.safety).map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('')}</ul>
        </details>
      </section>` : ''}
      ${c.customEnabled === false ? '' : `<section class="card hw-custom">
        <div><div class="hw-demo-head"><span class="hw-purpic">${STRAT_ICONS.custom}</span><h3>Custom strategy</h3></div>
          <p>Build your own strategy with sliders and parameters. Pick an entry style, size, open positions, take profit, stop loss, trailing stop, max hold time and more.</p>
          <button type="button" class="btn hw-outline" id="hw-custom-btn"><span>Create custom strategy</span>${IC.arrow}</button></div>
        <img src="brand/pages/custom.png" alt="" loading="lazy">
      </section>`}
    </div>

    <details class="card hw-fine">
      <summary><h2>The fine print</h2><span class="sub">every decision, the fixed rules and your money</span></summary>
      <div class="pipe">
        <div class="node"><b>Market data</b><span>Live DexScreener data: price, liquidity, volume, 5m / 1h / 24h change</span></div><span class="arrow">→</span>
        <div class="node key"><b>Decision</b><span>Built-in trading rules pick BUY, SELL or HOLD and write down why</span></div><span class="arrow">→</span>
        <div class="node key"><b>Risk check</b><span>Size, SOL reserve, max positions, token list, pause switch</span></div><span class="arrow">→</span>
        <div class="node"><b>Safety simulation</b><span>The swap is simulated first. If it would spend more than allowed, it is refused</span></div><span class="arrow">→</span>
        <div class="node"><b>Signed + sent</b><span>Signed inside the server vault, sent to Solana, confirmed on-chain</span></div><span class="arrow">→</span>
        <div class="node"><b>Public update</b><span>Balance, positions, P&amp;L and the Solscan link show up for everyone</span></div>
      </div>
      <div class="two">
        <div class="card-body"><div class="rules">
          <div class="rule"><div class="k">Size per trade</div><div class="v">${Math.round(r.tradeSizePct * 100)}% of SOL balance</div></div>
          <div class="rule"><div class="k">Max open positions</div><div class="v">${r.maxOpenPositions}</div></div>
          <div class="rule"><div class="k">Stop loss</div><div class="v down">${pct(r.stopLossPct, 0)}</div></div>
          <div class="rule"><div class="k">Take profit</div><div class="v up">${pct(r.takeProfitPct, 0)}</div></div>
          <div class="rule"><div class="k">SOL reserve</div><div class="v">${r.minSolReserve} SOL</div></div>
          <div class="rule"><div class="k">Tradable tokens</div><div class="v v-text">≥ ${usd(c.filters?.minLiquidityUsd || 0)} liquidity, ≥ ${usd(c.filters?.minVolume24hUsd || 0)} 24h volume, ≥ ${c.filters?.minAgeHours ?? 0}h old</div></div>
        </div></div>
        <div class="prose">
          <p><b>Two wallets, never mixed.</b> Your wallet launches and funds. The builder wallet trades. The site never asks for your seed phrase.</p>
          <p><b>You stay in control.</b> The creator can pause the builder, add SOL or withdraw at any time. "Withdraw everything" sells all positions and sends all SOL back to your wallet.</p>
          <p><b>Costs.</b> Each swap pays network fees, a ${r.priorityFeeSol} SOL priority fee, pool fees and PumpPortal's 0.5% fee. Small builders lose a bigger share to fees.</p>
          <p><b>Risk.</b> Memecoins are extremely volatile and the builder can lose some or all of its SOL. Nothing here is financial advice.</p>
        </div>
      </div>
    </details>
  </div>`;

  return {
    mount(root) {
      el = root;
      el.innerHTML = html();
      el.querySelector('#hw-rew-btn')?.addEventListener('click', () => {
        const b = el.querySelector('#hw-rewbox'); b.hidden = !b.hidden;
        if (!b.hidden) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
      el.querySelector('#hw-custom-btn')?.addEventListener('click', () => app.strategyBuilder({ onSaved: () => app.navigate('#/build') }));
      el.querySelector('#hw-sgrid').addEventListener('click', (e) => {
        const b = e.target.closest('[data-s]'); if (!b) return;
        selStrat = selStrat === b.dataset.s ? null : b.dataset.s;
        el.querySelectorAll('#hw-sgrid .hw-scard').forEach((x) => x.classList.toggle('on', x.dataset.s === selStrat));
        el.querySelector('#hw-sdetail').innerHTML = stratDetail();
      });
    },
    update() {},
    destroy() { el = null; },
  };
}
