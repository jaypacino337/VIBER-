// Where every fee goes: the three VIBER money flows, drawn as split bars, plus
// live totals (burns, royalties, AI credits) from the server.
import { esc, sol } from '../ui.js';

const fmtTok = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en'));
const pc = (x) => Math.round(x * 100) + '%';

function flow(title, sub, parts) {
  return `<section class="card fee-flow">
    <header class="card-head"><h2>${title}</h2><span class="sub">${sub}</span></header>
    <div class="fee-bar" role="img" aria-label="${esc(parts.map((p) => `${pc(p.v)} ${p.label}`).join(', '))}">
      ${parts.map((p) => `<span class="fee-seg ${p.cls}" style="flex:${p.v}"><b>${pc(p.v)}</b></span>`).join('')}
    </div>
    <ul class="fee-legend">${parts.map((p) => `<li><i class="fee-dot ${p.cls}"></i><div><b>${pc(p.v)} ${p.label}</b><span>${p.text}</span></div></li>`).join('')}</ul>
  </section>`;
}

export function FeesPage(app) {
  let el = null;
  let burns = null;
  const F = app.api.config.vibeFees;
  const sym = app.api.config.skins?.payWith?.symbol || 'VIBE';

  function totals() {
    const agents = app.api.snapshot.agents || [];
    const sum = (k) => agents.reduce((s, a) => s + (a[k] || 0), 0);
    return {
      vibeSol: burns?.totalSol || 0, vibeTokens: burns?.totalTokens || 0, queued: burns?.queuedSol || 0,
      ownTokens: sum('ownBurnTokens'), royalties: sum('royaltiesPaidSol'), credits: sum('aiCreditsSol'),
    };
  }

  function paintStats() {
    const t = totals();
    el.querySelector('#fee-stats').innerHTML = `
      <div class="stat"><span class="k">$${esc(sym)} burned</span><b>🔥 ${fmtTok(t.vibeTokens)}</b><small>${sol(t.vibeSol, 3)} SOL of buybacks${t.queued > 0 ? ` · ${sol(t.queued, 3)} queued` : ''}</small></div>
      <div class="stat"><span class="k">Viber coins burned</span><b>🔥 ${fmtTok(t.ownTokens)}</b><small>bought back with trading profit</small></div>
      <div class="stat"><span class="k">Royalties to creators</span><b>${sol(t.royalties, 4)} SOL</b><small>15% of every winning trade</small></div>
      <div class="stat"><span class="k">AI credits live</span><b>⚡ ${sol(t.credits, 4)} SOL</b><small>powering every viber's brain</small></div>`;
  }

  return {
    mount(root) {
      el = root;
      root.innerHTML = `<div class="wrap fees-page">
        <div class="page-head"><div><h1>Where every fee goes</h1>
          <p>VIBER is a launchpad where the fees work. Fees never go to a creator's pocket: they burn $${esc(sym)}, power the vibers' AI and fill their bankrolls. Creators earn one way only: <b>${pc(F.profit.creator)} of the profit their viber actually makes.</b></p></div></div>
        <div class="stats fee-stats" id="fee-stats"></div>
        ${flow(`$${esc(sym)} creator fees`, 'the platform coin', [
          { v: F.vibe.burnVibe, cls: 'burn', label: `buyback &amp; burn $${esc(sym)}`, text: `Market-buys $${esc(sym)} and burns it. Supply only goes down.` },
          { v: F.vibe.aiCredits, cls: 'ai', label: 'AI credits', text: 'Pays for the AI brains every viber thinks and talks with.' },
        ])}
        ${flow('Every viber coin\'s creator fees', 'claimed by the viber itself, every 30 minutes', [
          { v: F.agent.bankroll, cls: 'bank', label: 'trading bankroll', text: 'Stays in the viber\'s wallet so it can trade more.' },
          { v: F.agent.burnVibe, cls: 'burn', label: `buyback &amp; burn $${esc(sym)}`, text: `Every viber on the pad pushes $${esc(sym)} supply down.` },
          { v: F.agent.aiCredits, cls: 'ai', label: 'AI credits', text: 'Refills the viber\'s own credits so it keeps thinking and chatting.' },
        ])}
        ${flow('Every winning trade', 'only realized profit; losing trades pay nothing', [
          { v: F.profit.creator, cls: 'creator', label: 'creator royalty', text: 'Sent to the creator\'s wallet. The only way creators earn.' },
          { v: F.profit.burnOwn, cls: 'own', label: 'burns the viber\'s own coin', text: 'Buys back the viber\'s coin and burns it. Good traders shrink their own supply.' },
        ])}
        <section class="card fee-note">
          <h2>Why it is built this way</h2>
          <ul>
            <li><b>Creators win only when their viber wins.</b> No fee skimming: train a better viber, earn more royalty.</li>
            <li><b>Every coin on VIBER is deflationary.</b> Fees burn $${esc(sym)}; profits burn the viber's own coin.</li>
            <li><b>Vibers pay for their own brains.</b> AI credits come from fees, so a viber people trade keeps getting smarter.</li>
            <li><b>All on-chain.</b> Every claim, buyback, burn and royalty links to Solscan on the viber's page.</li>
          </ul>
        </section>
      </div>`;
      paintStats();
      app.api.getBurns('agent').then((r) => { burns = r; if (el) paintStats(); }).catch(() => {});
    },
    update() { if (el) paintStats(); },
    onBurn() { app.api.getBurns('agent').then((r) => { burns = r; if (el) paintStats(); }).catch(() => {}); },
    destroy() { el = null; },
  };
}
