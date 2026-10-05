// Two public burn pages: Viber Burns (vibers' creator fees) and Dev Burns (the dev wallet's fees).
// Every burn is public: when, how much SOL, how many tokens, buy tx + burn tx.
import { avatar, esc, sol, ago, agentNo, txLink, copyBtn } from '../ui.js';

const SUPPLY = 1_000_000_000;
const fmtTok = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en'));

// ── shared pieces ──
const burnStats = (f, labels) => {
  const pctSupply = (f.totalTokens || 0) / SUPPLY * 100;
  return `<div class="burn-stats">
    <div class="burn-stat hot"><span>${labels.spent}</span><b>${sol(f.totalSol || 0, 3)} SOL</b></div>
    <div class="burn-stat hot"><span>Tokens burned</span><b>🔥 ${fmtTok(f.totalTokens || 0)}</b></div>
    <div class="burn-stat"><span>Of the total supply</span><b>${pctSupply < 0.01 && pctSupply > 0 ? '<0.01' : pctSupply.toFixed(2)}%</b></div>
    <div class="burn-stat"><span>Burns</span><b>${f.count || 0}</b></div>
    <div class="burn-stat"><span>${labels.queued}</span><b>${sol(f.queuedSol || 0, 3)} SOL</b>${labels.queuedSub ? `<small>${labels.queuedSub}</small>` : ''}</div>
  </div>`;
};
const coinBox = (mint) => (mint ? `<div class="burn-ca"><span>Coin that gets burned</span><code class="mono">${esc(mint)}</code>${copyBtn(mint)}<a class="ext" href="https://solscan.io/token/${esc(mint)}" target="_blank" rel="noopener">Solscan ↗</a></div>` : '');
const burnRows = (list, { loading, err, empty, dev }) => {
  const cols = dev ? 5 : 6;
  if (loading) return `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:36px">Loading burns…</td></tr>`;
  if (err) return `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:36px">Could not load the burns. Refresh the page.</td></tr>`;
  if (!list.length) return `<tr><td colspan="${cols}" class="muted" style="text-align:center;padding:36px">${empty}</td></tr>`;
  return list.map((b) => `<tr${dev ? '' : ` class="click" data-go="#/viber/${b.agentNo}"`}>
    <td class="muted" data-ago="${b.ts}" title="${esc(new Date(b.ts).toLocaleString())}">${ago(b.ts)}</td>
    ${dev ? '' : `<td><span class="cell-agent">${avatar(b.avatarSeed, 32)}<span><span class="name">${esc(b.agentName)}${b.source === 'skin' ? ' <em class="burn-skin-tag">SKIN</em>' : ''}</span><br><span class="agent-tag">${agentNo(b.agentNo)}${b.source === 'skin' ? ' · paid for a skin' : b.source === 'profit' ? ' · profit burn of $' + esc(b.coinTicker) : b.coinTicker ? ' · $' + esc(b.coinTicker) : ''}</span></span></span></td>`}
    <td class="r b">${b.source === 'skin' ? `<span class="muted">${esc(b.skinName || 'skin')} skin</span>` : sol(b.sol, 4) + ' SOL'}</td>
    <td class="r b burn-amt">🔥 ${fmtTok(b.tokens)}</td>
    <td class="r">${b.buySig ? txLink(b.buySig, 'buy') : '<span class="muted">–</span>'}</td>
    <td class="r">${txLink(b.burnSig, 'burn')}</td>
  </tr>`).join('');
};

// ── VIBER BURNS: pct of every viber's creator fees buys + burns the VIBE coin ──
export function AgentBurnsPage(app) {
  const cfg = app.api.config;
  let el, data = null, loading = true, err = null;
  const totals = () => (data?.agents || app.api.snapshot.flywheel?.agents || {});
  const paint = () => {
    if (!el) return;
    el.querySelector('#bn-stats').innerHTML = burnStats(totals(), { spent: 'SOL spent by vibers', queued: 'Queued for the next burns' });
    el.querySelector('#bn-rows').innerHTML = burnRows(data?.burns || [], { loading: loading && !data, err: err && !data, empty: `No viber burns yet. The first one happens when a viber has collected ${cfg.flywheel?.minBuySol || 0.01} SOL from its creator fees.` });
  };
  const load = () => app.api.getBurns('agent').then((r) => { data = r; err = null; }).catch((e) => { err = e; }).finally(() => { loading = false; paint(); });
  return {
    mount(root) {
      el = root;
      const F = cfg.flywheel || {};
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>Viber Burns</h1>
          <p>${F.enabled ? `<b>${Math.round((F.pct || 0) * 100)}% of every creator-fee claim</b> from every viber buys the VIBE coin and <b>burns it forever</b>. Every buy and every burn is on-chain: click a transaction to check it on Solscan.` : 'The flywheel is switched off right now.'}</p></div>
          <div class="right"><a class="btn" href="#/dev-burns">🔥 Dev Burns →</a></div></div>
        ${coinBox(F.mint)}
        <div id="bn-stats"></div>
        <section class="card">
          <header class="card-head"><h2 class="pix">Every viber burn</h2><span class="sub">newest first · updates live</span></header>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>When</th><th>Viber</th><th class="r">Bought for</th><th class="r">Burned</th><th class="r">Buy tx</th><th class="r">Burn tx</th></tr></thead>
            <tbody id="bn-rows"></tbody>
          </table></div>
        </section>
        <section class="card burn-how">
          <header class="card-head"><h2 class="pix">How the viber flywheel works</h2></header>
          <ol>
            <li>Every viber claims the pump.fun creator fees of its own coin.</li>
            <li>${Math.round((F.pct || 0) * 100)}% of each claim is set aside in the viber's wallet. The rest keeps trading.</li>
            <li>When ${F.minBuySol || 0.01} SOL or more is collected, the viber buys the VIBE coin with it.</li>
            <li>Right after, it burns every token it bought (they are gone for good) and closes the empty account.</li>
            ${cfg.skins?.payWith?.burn ? `<li>Skins are paid in VIBE too: ${(cfg.skins.payWith.burnPct ?? 1) >= 1 ? 'every token paid for a skin' : Math.round(cfg.skins.payWith.burnPct * 100) + '% of every skin payment'} is burned here as well (marked SKIN).</li>` : ''}
          </ol>
        </section>
      </div>`;
      paint(); load();
    },
    update() { if (data) { const f = app.api.snapshot.flywheel; if (f?.agents) data.agents = f.agents; paint(); } },
    onBurn(b) { if (b.source !== 'dev' && data) { data.burns = [b, ...(data.burns || []).filter((x) => x.id !== b.id)]; paint(); } },
  };
}

// ── DEV BURNS: pct of the VIBER dev wallet's own creator fees → buyback + burn ──
export function DevBurnsPage(app) {
  const cfg = app.api.config;
  let el, data = null, loading = true, err = null;
  const D = () => data?.dev || app.api.snapshot.flywheel?.dev || {};
  const totals = () => { const d = D(); return { totalSol: d.buybackSol, totalTokens: d.burnedTokens, count: d.burns, queuedSol: d.pendingSol }; };
  const claimsHTML = () => {
    const d = D(), pct = Math.round((d.pct || 0) * 100);
    if (!(d.claims || []).length) return '<p class="muted" style="padding:18px">No dev claims yet. The server claims every 30 min, when there is something to claim.</p>';
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When</th><th class="r">Dev fees claimed</th><th class="r">To buyback (${pct}%)</th><th class="r">Claim tx</th></tr></thead><tbody>
      ${d.claims.slice(0, 50).map((c) => `<tr><td class="muted" data-ago="${c.ts}">${ago(c.ts)}</td><td class="r b">${sol(c.claimedSol, 4)} SOL</td><td class="r b burn-amt">${sol(c.buybackSol, 4)} SOL</td><td class="r">${txLink(c.sig, 'claim')}</td></tr>`).join('')}
    </tbody></table></div>`;
  };
  const paint = () => {
    if (!el) return;
    const d = D();
    el.querySelector('#dv-off').hidden = !!d.enabled || loading;
    const errEl = el.querySelector('#dv-err');
    errEl.hidden = !(d.lastError && d.pendingSol > 0);
    errEl.innerHTML = errEl.hidden ? '' : `⚠️ The last buyback try did not go through. The server tries again by itself every few seconds.<br><small class="muted">${esc(d.lastError)}</small>`;
    el.querySelector('#dv-wallet').innerHTML = d.wallet ? `<div class="burn-ca"><span>Dev wallet</span><code class="mono">${esc(d.wallet)}</code>${copyBtn(d.wallet)}<a class="ext" href="https://solscan.io/account/${esc(d.wallet)}" target="_blank" rel="noopener">Solscan ↗</a></div>` : '';
    el.querySelector('#bn-stats').innerHTML = burnStats(totals(), { spent: 'SOL spent by the dev', queued: 'Waiting for the next burn', queuedSub: d.inProgress ? 'buying + burning now…' : (d.pendingSol || 0) > (d.maxBuySol || 0.25) ? `bought in parts of ${d.maxBuySol || 0.25} SOL` : `burns at ${d.minBuySol || 0.01} SOL` })
      + `<div class="burn-stats burn-stats-2"><div class="burn-stat"><span>Dev fees claimed (total)</span><b>${sol(d.claimedSol || 0, 3)} SOL</b></div><div class="burn-stat"><span>Share that goes to buyback</span><b>${Math.round((d.pct || 0) * 100)}%</b></div></div>`;
    el.querySelector('#dv-claims').innerHTML = claimsHTML();
    el.querySelector('#bn-rows').innerHTML = burnRows(data?.burns || [], { dev: true, loading: loading && !data, err: err && !data, empty: 'No dev burns yet. The first one happens after the next dev fee claim.' });
  };
  const load = () => app.api.getBurns('dev').then((r) => { data = r; err = null; }).catch((e) => { err = e; }).finally(() => { loading = false; paint(); });
  return {
    mount(root) {
      el = root;
      const F = cfg.flywheel || {};
      root.innerHTML = `<div class="wrap">
        <div class="page-head"><div><h1>Dev Burns</h1>
          <p>The server claims the <b>VIBER dev wallet's</b> pump.fun creator fees by itself. <b>50% of every claim</b> buys the VIBE coin and burns exactly the tokens it bought; the other 50% funds the vibers' AI credits. Every claim, buy and burn links to Solscan.</p></div>
          <div class="right"><a class="btn" href="#/burns">🔥 Viber Burns →</a></div></div>
        <p class="muted" id="dv-off" hidden>The dev buyback is not switched on yet.</p>
        <p class="burn-warn" id="dv-err" hidden></p>
        ${coinBox(F.mint)}
        <div id="dv-wallet"></div>
        <div id="bn-stats"></div>
        <section class="card">
          <header class="card-head"><h2 class="pix">Every dev burn</h2><span class="sub">newest first · updates live</span></header>
          <div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>When</th><th class="r">Bought for</th><th class="r">Burned</th><th class="r">Buy tx</th><th class="r">Burn tx</th></tr></thead>
            <tbody id="bn-rows"></tbody>
          </table></div>
        </section>
        <section class="card">
          <header class="card-head"><h2 class="pix">Dev fee claims</h2><span class="sub">every claim of the dev wallet's creator fees</span></header>
          <div id="dv-claims"></div>
        </section>
      </div>`;
      paint(); load();
    },
    update() { if (data) { const f = app.api.snapshot.flywheel; if (f?.dev) data.dev = { ...data.dev, ...f.dev, claims: data.dev?.claims || [] }; paint(); } },
    onDevClaim() { load(); },
    onBurn(b) { if (b.source === 'dev') load(); },
  };
}
