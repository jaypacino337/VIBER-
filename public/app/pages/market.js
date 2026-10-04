// Builder market: builders for sale (price in SOL), with their server-verified track record.
import { avatar, levelBadge, esc, sol, signedSol, tone, ago, agentNo, short, txLink, addrLink } from '../ui.js';
import { wallet } from '../wallet.js';

const fmtBag = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en'));

export function MarketPage(app) {
  const cfg = app.api.config;
  let el, data = null, loading = true, err = null, sort = 'new';
  const M = () => data || { ...(cfg.market || {}), listings: [], sales: [], refunds: [] };
  const SORTS = {
    new: (a, b) => b.listedAt - a.listedAt,
    cheap: (a, b) => a.price - b.price,
    pnl: (a, b) => b.realizedPnlSol - a.realizedPnlSol,
    fees: (a, b) => b.feesTotalSol - a.feesTotalSol,
  };

  const card = (x) => {
    const wr = x.closedTrades ? Math.round((x.wins / x.closedTrades) * 100) + '%' : '–';
    const mine = wallet.address && wallet.address === x.creator;
    return `<article class="mk-card">
      <a class="mk-top" href="#/builder/${x.no}">
        ${avatar(x.avatarSeed, 56)}
        <span class="mk-id"><b>${esc(x.name)}</b><span class="agent-tag">${agentNo(x.no)}${x.coin?.ticker ? ' · $' + esc(x.coin.ticker) : ''}</span>${levelBadge(x.level, { short: true })}</span>
      </a>
      <div class="mk-strat"><span class="chip">${esc(x.strategyName || x.strategy)}</span>${x.strategyPrompt ? `<p class="mk-prompt" title="${esc(x.strategyPrompt)}">“${esc(x.strategyPrompt.length > 140 ? x.strategyPrompt.slice(0, 138) + '…' : x.strategyPrompt)}”</p>` : ''}</div>
      <dl class="mk-stats">
        <div><dt>Realized PnL</dt><dd class="${tone(x.realizedPnlSol)}">${signedSol(x.realizedPnlSol, 3)} SOL</dd></div>
        <div><dt>Win rate</dt><dd>${wr}<small> of ${x.closedTrades}</small></dd></div>
        <div><dt>Creator fees earned</dt><dd>${sol(x.feesTotalSol, 3)} SOL</dd></div>
        <div><dt>Coin mcap</dt><dd>${x.coin?.mcapUsd ? '$' + Math.round(x.coin.mcapUsd).toLocaleString('en') : '–'}</dd></div>
      </dl>
      <div class="mk-buy">
        <span class="mk-price"><small>Price</small><span>${+x.price.toFixed(4)} <em>SOL</em></span>${x.priceTokens ? `<small class="mk-tok">≈ ${fmtBag(x.priceTokens)} CREW</small>` : ''}</span>
        ${mine ? `<a class="btn" href="#/builder/${x.no}">Your listing</a>` : `<button class="btn btn-primary" type="button" data-buy="${esc(x.id)}">Buy builder</button>`}
      </div>
      <small class="muted mk-seller">Seller ${esc(short(x.seller, 4))} · listed <span data-ago="${x.listedAt}">${ago(x.listedAt)}</span></small>
    </article>`;
  };

  const salesRows = () => {
    const s = M().sales || [];
    if (!s.length) return '<tr><td colspan="6" class="muted" style="text-align:center;padding:28px">No sales yet.</td></tr>';
    return s.map((x) => `<tr class="click" data-go="#/builder/${x.agentNo}">
      <td class="muted" data-ago="${x.ts}">${ago(x.ts)}</td>
      <td><span class="cell-agent">${avatar(x.avatarSeed, 28)}<span><span class="name">${esc(x.agentName)}</span><br><span class="agent-tag">${agentNo(x.agentNo)}</span></span></span></td>
      <td class="r b">${sol(x.priceSol, 4)} SOL</td>
      <td class="mono muted">${esc(short(x.seller, 4))} → ${esc(short(x.buyer, 4))}</td>
      <td class="r">${txLink(x.paySig, 'payment')}</td>
      <td class="r">${x.payoutSig ? txLink(x.payoutSig, 'seller paid') : '<span class="muted">sending…</span>'}</td>
    </tr>`).join('');
  };

  const paint = () => {
    if (!el) return;
    const m = M();
    el.querySelector('#mk-stats').innerHTML = `
      <div class="burn-stat hot"><span>For sale now</span><b>${m.listed ?? (m.listings || []).length}</b></div>
      <div class="burn-stat"><span>Builders sold</span><b>${m.sold || 0}</b></div>
      <div class="burn-stat"><span>Volume</span><b>${sol(m.volumeSol || 0, 2)} SOL</b></div>
      <div class="burn-stat"><span>Market fee</span><b>${Math.round((m.feePct ?? 0.05) * 100)}%</b></div>`;
    const list = (m.listings || []).slice().sort(SORTS[sort]);
    el.querySelector('#mk-grid').innerHTML = loading && !data ? '<p class="muted" style="padding:30px;text-align:center">Loading the market…</p>'
      : err && !data ? '<p class="muted" style="padding:30px;text-align:center">Could not load the market. Refresh the page.</p>'
      : list.length ? list.map(card).join('') : `<div class="mk-empty"><b>No builders for sale right now.</b><span>Own a builder? Open its page and tap <b>Sell this builder</b>.</span></div>`;
    el.querySelector('#mk-sales').innerHTML = salesRows();
    const rf = (m.refunds || []).filter((r) => r.status !== 'paid' || Date.now() - r.ts < 24 * 3600_000);
    el.querySelector('#mk-refunds').innerHTML = rf.length ? `<div class="burn-warn">${rf.map((r) => `↩ Refund of <b>${r.tokens ? fmtBag(r.tokens) + ' CREW' : sol(r.sol, 4) + ' SOL'}</b> (${esc(r.note || '')}): ${r.sig ? txLink(r.sig, 'sent ✓') : 'being sent…'}`).join('<br>')}</div>` : '';
  };

  const load = () => app.api.getMarket(wallet.address).then((r) => { data = r; err = null; }).catch((e) => { err = e; }).finally(() => { loading = false; paint(); });

  return {
    mount(root) {
      el = root;
      const m = M();
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>Builder Market</h1>
          <p>Buy a builder that already works: its wallet, its coin and <b>all its future creator fees</b>, its level, skins and track record. Every number here is counted by the server from on-chain trades, not typed in by the seller.</p></div></div>
        ${m.enabled === false ? '<p class="burn-warn">The builder market is closed right now.</p>' : ''}
        <div id="mk-refunds"></div>
        <div class="burn-stats" id="mk-stats"></div>
        <section class="card">
          <header class="card-head"><h2 class="pix">For sale</h2>
            <div class="right seg" id="mk-sort">${[['new', 'Newest'], ['cheap', 'Cheapest'], ['pnl', 'Best PnL'], ['fees', 'Most fees']].map(([k, l]) => `<button type="button" data-s="${k}" class="${k === sort ? 'on' : ''}">${l}</button>`).join('')}</div></header>
          <div class="mk-grid" id="mk-grid"></div>
        </section>
        <section class="card">
          <header class="card-head"><h2 class="pix">Recent sales</h2><span class="sub">on-chain payments</span></header>
          <div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th>Builder</th><th class="r">Price</th><th>Seller → buyer</th><th class="r">Payment</th><th class="r">Payout</th></tr></thead><tbody id="mk-sales"></tbody></table></div>
        </section>
        <section class="card burn-how">
          <header class="card-head"><h2 class="pix">How buying and selling works</h2></header>
          <ol>
            <li><b>Selling:</b> only NFT builders can be sold. Open the builder, tap <b>🎟 Make it an NFT</b> (free), withdraw all its SOL, then tap <b>Sell this builder</b>: you sign the price and send the builder NFT to the market wallet. It is on sale as soon as the NFT arrives. Remove it any time and the NFT comes back to you.</li>
            <li><b>Buying:</b> prices are shown in SOL, but you <b>pay in the CREW coin</b>: the amount worth the SOL price at that moment (fixed for 10 minutes). You sign one message and send the CREW to the market wallet <code class="mono">${esc(short(m.payTo || '', 4))}</code>. The first valid payment wins, and the builder is yours right away.</li>
            <li>The seller gets the CREW minus the <b>${Math.round((m.feePct ?? 0.05) * 100)}% market fee</b>, sent automatically.</li>
            <li>If the builder was sold a moment before, removed or repriced, or you paid too little, <b>your CREW is sent back automatically</b>.</li>

            <li>The builder comes with an empty wallet: fund it with <b>Add SOL</b> and it starts trading with its strategy. NFT skins stay with the seller's wallet.</li>
            <li>Past results do not guarantee future profit. Memecoin trading is very risky.</li>
          </ol>
        </section>
      </div>`;
      root.querySelector('#mk-sort').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; sort = b.dataset.s; root.querySelectorAll('#mk-sort button').forEach((x) => x.classList.toggle('on', x === b)); paint(); });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-buy]');
        if (b) { const x = (M().listings || []).find((l) => l.id === b.dataset.buy); if (x) app.marketBuy(x, load); return; }
        const tr = e.target.closest('tr[data-go]'); if (tr) app.navigate(tr.dataset.go);
      });
      paint(); load();
    },
    onMarket() { load(); },
    onWallet() { load(); },
  };
}
