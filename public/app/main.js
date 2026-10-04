// Crewfi frontend entry (live, Solana mainnet)
import { createApi } from './api.js';
import { robotSVG } from './robot.js';
import { ICONS, avatar, STRAT_ICONS, strategyRules, stratIcon, stratKey, riskTag, riskWarning, skinPriceLabel } from './ui.js';
import { RISK_ACK } from '../shared/risk-ack.js';
import { FIELDS, CUSTOM_BASES, NAME_MAX, fieldsFor, defaultsFor, sanitize as sanitizeCustom, cleanName, settingsLine, riskReasons, CUSTOM_RISK_ACK } from '../shared/custom-strategy.js';
import { wallet, onWallet, onWalletList, listWallets, connectWallet, disconnect, restoreWallet, signAction, sendSol, sendToken, sendCoreAsset, actionMessage } from './wallet.js';
import { esc, ago, pct, tone, sol, agentNo, short, price } from './format.js';
import { HomePage } from './pages/home.js';
import { AgentsPage, TokensPage } from './pages/lists.js';
import { AgentPage } from './pages/agent.js';
import { LaunchPage } from './pages/launch.js';
import { HowPage } from './pages/how.js';
import { SkinsPage } from './pages/skins.js';
import { AgentBurnsPage, DevBurnsPage } from './pages/burns.js';
import { MarketPage } from './pages/market.js';
import { OFFICE_NAMES } from './office3d.js';
import { createBoss } from './boss3d.js';

const $ = (s, r = document) => r.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// X / Twitter profile comes from config.js → site.xUrl (hidden when empty)
function xHandle(url) { return url ? '@' + url.replace(/\/+$/, '').split('/').pop() : ''; }

const nic = (d) => `<svg class="nav-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const NAV_IC = {
  home: nic('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  agents: nic('<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.4-3 4-3s3 1 4 3"/><path d="M10 3v2h4V3"/>'),
  tokens: nic('<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/>'),
  launch: nic('<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1M15 16l2 4-3-1"/>'),
  shill: nic('<path d="M4 4l16 16M20 4L4 20"/>'),
  burns: nic('<path d="M12 22c4.4 0 7-3 7-6.8 0-3.6-2.6-5.6-3.8-8.7-1 2-2.2 3-3.7 3.1.2-2.6-.8-5-2.9-6.6-.6 4.4-4.6 6.6-4.6 12.2C4 19 7.6 22 12 22z"/>'),
  skins: nic('<path d="M8 3l-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3c-.5 1.6-2 2.6-4 2.6S8.5 4.6 8 3z"/>'),
  market: nic('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M10 20v-5h4v5"/>'),
  board: nic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  how: nic('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.7"/><path d="M12 17.5v.01"/>'),
};

// X badge: the official X mark on a yellow 2x1 brick (Crewfi style)
const X_BADGE = `<span class="xb-hat-wrap" aria-hidden="true"><svg class="xb-hatsvg" viewBox="0 0 48 48"><rect x="6" y="14" width="36" height="30" rx="8" fill="#151515"/><path fill="#fff" d="M30.9 21h3.4l-7.4 8.5 8.7 11.5h-6.8l-5.3-7-6.1 7H14l7.9-9-8.4-11h7l4.8 6.4zm-1.2 18h1.9L19.3 23h-2z"/><path d="M9 15.5c0-7 6.7-12.5 15-12.5s15 5.5 15 12.5z" fill="#FFD21F"/><path d="M21 3.4h6v11.6h-6z" fill="#E5B400"/><rect x="4" y="14" width="40" height="5" rx="2.5" fill="#FFD21F"/><rect x="4" y="17.2" width="40" height="1.8" rx=".9" fill="#E5B400"/><circle cx="16" cy="9" r="1.6" fill="#FFE680"/></svg></span>`;

// Crewfi wordmark: chunky letters, the last two yellow
const WORDMARK = `<span class="brand-name">CREW<span class="brand-d">FI</span></span>`;

function shell(cfg) {
  const x = cfg.xUrl || '';
  const side = (r, href, ic, label) => `<a href="${href}" data-r="${r}">${ic}<span>${label}</span></a>`;
  return `
  <header class="topbar">
    <div class="topbar-in">
      <a class="brand" href="#/" aria-label="Crewfi home"><img class="brand-logo" src="brand/logo-96.png" alt="" width="44" height="44">${WORDMARK}</a>
      <nav class="topnav" id="topnav" aria-label="Main">
        <a href="#/" data-r="home">Home</a>
        <a href="#/build" data-r="launch">Build</a>
        <a href="#/my-builders" data-r="mine">My Builders</a>
        ${cfg.market?.enabled ? '<a href="#/market" data-r="market">Market</a>' : ''}
        ${cfg.skins?.enabled ? '<a href="#/skins" data-r="skins">Skins</a>' : ''}
        <a href="#/how" data-r="how">Docs</a>
      </nav>
      <div class="top-right">
        <span class="mode-pill live-pill" id="mode-pill">MAINNET</span>
        ${x ? `<a class="x-link" href="${esc(x)}" target="_blank" rel="noopener" aria-label="Follow ${esc(xHandle(x))} on X" title="Follow ${esc(xHandle(x))} on X">${X_BADGE}</a>` : ''}
        <button class="ca-chip soon" id="ca-chip" type="button" title="Contract address: coming soon"><span class="ca-tag">CA</span><span class="ca-val">Coming soon</span></button>
        <button class="icon-btn" id="theme-btn" type="button" aria-label="Toggle light / dark theme"></button>
        <button class="btn btn-wallet" id="wallet-btn" type="button">Connect <span class="long">wallet</span></button>
      </div>
    </div>
  </header>
  <aside class="sidebar" aria-label="Sections">
    <nav class="nav" id="nav">
      ${side('home', '#/', NAV_IC.home, 'Home')}
      ${side('launch', '#/build', NAV_IC.launch, 'Build Builder')}
      ${side('mine', '#/my-builders', NAV_IC.agents, 'My Builders')}
      ${cfg.market?.enabled ? side('market', '#/market', NAV_IC.market, 'Market') : ''}
      ${cfg.skins?.enabled ? side('skins', '#/skins', NAV_IC.skins, 'Skins') : ''}
      ${side('agents', '#/builders', NAV_IC.board, 'Leaderboard')}
      ${side('tokens', '#/tokens', NAV_IC.tokens, 'Tokens')}
      ${cfg.flywheel?.enabled ? side('burns', '#/burns', NAV_IC.burns, 'Builder Burns') + side('dev-burns', '#/dev-burns', NAV_IC.burns, 'Dev Burns') : ''}
      <button type="button" class="nav-shill" id="nav-shill">${NAV_IC.shill}<span>Shill on X</span></button>
      ${side('how', '#/how', NAV_IC.how, 'How it works')}
    </nav>
    <a class="side-card" href="#/build"><img src="brand/mascot.png" alt="" width="120" height="150" loading="lazy"><b>Your builders work 24/7.</b><span>Build, customize and let them do the work for you.</span></a>
  </aside>
  <div class="tape" aria-label="Token prices"><div class="tape-track" id="tape"></div></div>
  <main id="page"></main>
  <footer class="foot"><span class="foot-brand"><img src="brand/logo-96.png" alt="" width="26" height="26"><b>Crewfi</b> · build your builder, it works for you</span>${x ? `<a class="foot-x" href="${esc(x)}" target="_blank" rel="noopener">${X_BADGE}${esc(xHandle(x))}</a>` : ''}<span>Real SOL on Solana mainnet</span><span>Not financial advice. Memecoins are extremely risky.</span></footer>
  <div class="toasts" id="toasts" aria-live="polite"></div>`;
}

function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function paintThemeBtn() {
  const dark = currentTheme() === 'dark';
  const b = $('#theme-btn');
  b.innerHTML = dark ? ICONS.sun : ICONS.moon;
  b.title = dark ? 'Light theme' : 'Dark theme';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121212' : '#FFFFFF');
}

function modal(title, body, { onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="x" type="button" aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div></div>`;
  document.body.appendChild(back);
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('.x').addEventListener('click', close);
  return { el: back, close, body: back.querySelector('.modal-body') };
}

function toast(html, seed) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `${seed ? `<span class="av av-42">${robotSVG(seed)}</span>` : `<img src="brand/logo-96.png" alt="" width="36" height="36">`}<div>${html}</div>`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

async function boot() {
  const app = document.getElementById('app');
  app.innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty boot"><img src="brand/mascot.png" alt="Crewfi" width="120" height="150"><span>stacking bricks at Crewfi<span class="cursor"></span></span></div></div></div>`;
  const api = await createApi();
  app.innerHTML = shell(api.config || {});
  paintThemeBtn();
  if (!api.config.tradingEnabled) $('#mode-pill').textContent = 'TRADING PAUSED';
  if (api.config.mode === 'paper') {
    $('#mode-pill').textContent = 'PAPER MODE';
    app.insertAdjacentHTML('afterbegin', '<div class="paper-banner" role="status"><b>Paper mode.</b> Builders trade simulated SOL against live market prices. No real SOL moves and no real coins are created.</div>');
  }

  let page = null;
  const ctx = {
    api,
    navigate: (h) => { if (location.hash === h) route(); else location.hash = h; },
    toast,
    openConnect,
    progressModal,
    agentAction,
    shill: (agentId) => shillModal(agentId),
    strategyBuilder: (opts) => strategyBuilder(opts),
    skinModal: (agent, pick, after) => skinModal(agent, pick, after),
    marketBuy: (listing, after) => marketBuyModal(listing, after),
  };

  // ── wallet ──
  function paintWallet() {
    const b = $('#wallet-btn');
    if (wallet.address) {
      b.innerHTML = `${wallet.icon ? `<img class="w-ic" src="${esc(wallet.icon)}" alt="">` : '<span class="dot"></span>'}${esc(short(wallet.address, 4))}`;
      b.title = `${wallet.name || 'Wallet'} connected. Click to disconnect`;
    } else { b.innerHTML = 'Connect <span class="long">wallet</span>'; b.title = ''; }
  }
  onWallet(() => { paintWallet(); page?.onWallet?.(); });
  $('#wallet-btn').addEventListener('click', async () => {
    if (wallet.address) {
      const m = modal('Wallet', `<p>Connected with <b>${esc(wallet.name || 'your wallet')}</b>: <code class="mono">${esc(wallet.address)}</code></p><button class="btn btn-block" id="w-dis">Disconnect</button>`);
      m.body.querySelector('#w-dis').addEventListener('click', async () => { await disconnect(); m.close(); });
    } else openConnect();
  });

  function openConnect() {
    return new Promise((resolve) => {
      let done = false;
      const m = modal('Connect wallet', `
        <p>Your wallet is the creator wallet. It launches coins, funds builders and receives your share of creator fees. Each builder gets its own separate wallet.</p>
        <div class="wallet-list" id="c-list"></div>
        <div class="err" id="c-err" hidden></div>
        <p class="note">Solana wallets only. In MetaMask, pick a Solana account.</p>`, { onClose: () => { off(); if (!done) resolve(null); } });
      const list = m.body.querySelector('#c-list');
      const err = m.body.querySelector('#c-err');
      const paint = () => {
        list.innerHTML = listWallets().map((w) => `
          <button class="wallet-opt${w.installed || w.sdk ? '' : ' get'}" type="button" data-id="${esc(w.id)}">
            <span class="wicon">${w.icon ? `<img src="${esc(w.icon)}" alt="">` : esc(w.name.slice(0, 1))}</span>
            <span class="wtext"><b>${esc(w.name)}</b><small>${w.installed ? 'Detected in this browser' : w.sdk ? 'Browser extension or mobile app' : 'Not installed'}</small></span>
            ${w.installed || w.sdk ? '' : '<span class="wget">Get ↗</span>'}
          </button>`).join('');
      };
      paint();
      const off = onWalletList(paint); // wallets can register a moment after the page loads
      list.addEventListener('click', async (e) => {
        const b = e.target.closest('.wallet-opt');
        if (!b || b.disabled) return;
        const w = listWallets().find((x) => x.id === b.dataset.id);
        if (!w) return;
        if (!w.installed && !w.sdk) { window.open(w.url, '_blank', 'noopener'); return; }
        err.hidden = true;
        list.querySelectorAll('.wallet-opt').forEach((x) => { x.disabled = true; });
        b.querySelector('small').textContent = 'Approve in ' + w.name + '…';
        try {
          const a = await connectWallet(w.id);
          done = true; m.close(); resolve(a);
        } catch (ex) {
          const rejected = ex?.code === 4001 || /reject|cancel|denied|closed/i.test(ex?.message || '');
          err.hidden = false;
          err.textContent = rejected ? `Connection was cancelled in ${w.name}.` : (ex?.message || `Could not connect ${w.name}.`);
          paint();
        }
      });
    });
  }

  // Step-by-step modal used by launch and creator actions
  function progressModal(title, steps) {
    const m = modal(title, `<ul class="progress">${steps.map((s) => `<li><span class="ic"></span><span>${esc(s)}</span></li>`).join('')}</ul><div id="p-note" class="p-note"></div><div class="err" id="p-err" hidden></div><div id="p-foot" class="p-foot"></div>`);
    const lis = [...m.body.querySelectorAll('.progress li')];
    let cur = -1;
    const foot = () => m.body.querySelector('#p-foot');
    const p = {
      step(i) {
        lis.forEach((li, j) => { li.classList.toggle('done', j < i); li.classList.toggle('doing', j === i); li.querySelector('.ic').textContent = j < i ? '✓' : ''; });
        cur = i;
      },
      note(html) { m.body.querySelector('#p-note').innerHTML = html; },
      ask(label) {
        return new Promise((resolve) => {
          foot().innerHTML = `<button class="btn btn-primary btn-block btn-lg" id="p-ask">${esc(label)}</button>`;
          foot().querySelector('#p-ask').addEventListener('click', () => { foot().innerHTML = ''; resolve(); });
        });
      },
      fail(i, msg) {
        if (lis[i]) { lis[i].classList.remove('doing'); lis[i].classList.add('fail'); lis[i].querySelector('.ic').textContent = '!'; }
        const e = m.body.querySelector('#p-err'); e.hidden = false; e.textContent = msg;
        foot().innerHTML = `<button class="btn btn-block" id="p-close">Close</button>`;
        foot().querySelector('#p-close').addEventListener('click', m.close);
      },
      failCurrent(msg) { p.fail(Math.max(0, Math.min(cur, lis.length - 1)), msg); },
      link(label, fn) {
        foot().insertAdjacentHTML('afterbegin', `<button class="btn btn-primary btn-block" id="p-link">${esc(label)}</button>`);
        foot().querySelector('#p-link').addEventListener('click', () => { m.close(); fn(); });
      },
      done(label, onOpen) {
        p.step(lis.length);
        foot().innerHTML = `<button class="btn btn-primary btn-block" id="p-open">${esc(label)} · open builder page</button>`;
        foot().querySelector('#p-open').addEventListener('click', () => { m.close(); onOpen(); });
      },
      close: m.close,
    };
    return p;
  }

  // ── creator actions on the builder page ──
  async function ensureCreator(agent) {
    if (!wallet.address) await openConnect();
    if (wallet.address !== agent.creator) throw new Error('Connect the creator wallet (' + short(agent.creator, 4) + ') to do this.');
  }

  async function agentAction(act, agent, after) {
    try {
      await ensureCreator(agent);
      if (act === 'deposit' || act === 'fund-launch') return depositModal(agent, act === 'fund-launch', after);
      if (act === 'withdraw') return withdrawModal(agent, after);
      if (act === 'strategy') return strategyModal(agent, after);
      if (act === 'skins') return skinModal(agent, null, after);
      if (act === 'market-list') return marketListModal(agent, after);
      if (act === 'nft-mint') return nftMintModal(agent, after);
      if (act === 'market-escrow') {
        await sendNftToMarket(agent);
        toast(`<b>NFT sent</b>${esc(agent.name)} is on sale as soon as it arrives (under a minute).`, agent.avatarSeed);
        return after && after();
      }
      if (act === 'market-delist') {
        const auth = await signAction(actionMessage('market-delist', agent.wallet));
        await api.marketDelist(agent.id, auth);
        toast(`<b>Removed from the market</b>${esc(agent.name)} is not for sale any more. Withdrawals work again.`, agent.avatarSeed);
        return after && after();
      }
      if (act === 'x-connect') {
        const auth = await signAction(actionMessage('x-connect', agent.wallet));
        const r = await api.xConnect(agent.id, auth);
        location.href = r.url; // X login, then X sends the creator back to the builder page
        return;
      }
      if (act === 'x-disconnect') {
        const auth = await signAction(actionMessage('x-disconnect', agent.wallet));
        await api.xDisconnect(agent.id, auth);
        toast(`<b>X disconnected</b>${esc(agent.name)} stopped posting.`, agent.avatarSeed);
        return after && after();
      }
      if (act === 'x-post') {
        const auth = await signAction(actionMessage('x-post', agent.wallet));
        await api.xPost(agent.id, auth);
        toast(`<b>Posting an update</b>${esc(agent.name)} posts its status on X in a moment.`, agent.avatarSeed);
        return after && setTimeout(after, 4000);
      }
      if (act === 'x-settings') {
        const s = agent.__xSettings;
        const line = `X settings: ${['trades', 'recap', 'promos', 'images'].map((k) => `${k}=${s[k] ? 'on' : 'off'}`).join(' ')}`;
        const auth = await signAction(actionMessage('x-settings', agent.wallet, [line]));
        await api.xSettings(agent.id, { settings: s, ...auth });
        toast(`<b>X settings saved</b>${esc(agent.name)}`, agent.avatarSeed);
        return after && after();
      }
      if (act === 'pause' || act === 'resume' || act === 'retry') {
        const auth = await signAction(actionMessage(act, agent.wallet));
        if (act === 'retry') await api.retry(agent.id, auth);
        else await api.pause(agent.id, { paused: act === 'pause', ...auth });
        toast(`<b>${act === 'pause' ? 'Trading paused' : act === 'resume' ? 'Trading resumed' : 'Launch restarted'}</b>${esc(agent.name)}`, agent.avatarSeed);
        after && after();
      }
    } catch (e) {
      toast(`<b>Could not complete that</b>${esc(e.message)}`);
    }
  }

  const post_paper = (api, id, sol) => api.deposit(id, 'paper', sol);

  function depositModal(agent, isLaunch, after) {
    const need = isLaunch ? Math.max(0, agent.requiredSol - agent.balanceSol) : 0.25;
    const presets = isLaunch ? [] : [0.1, 0.25, 0.5, 1];
    const m = modal(isLaunch ? `Fund ${agent.name}` : `Add SOL to ${agent.name}`, `
      <p>Send SOL from your wallet to the builder wallet <code class="mono">${esc(short(agent.wallet, 6))}</code>. The builder trades it.</p>
      <div class="field"><label for="f-amt">Amount</label><div class="input-affix suf"><input class="input" id="f-amt" type="number" min="0.001" step="0.01" value="${Number(need.toFixed(4))}" inputmode="decimal" ${isLaunch ? 'readonly' : ''}><span class="suf-t">SOL</span></div>
      ${presets.length ? `<div class="presets" id="f-pre">${presets.map((v) => `<button type="button" data-v="${v}" class="${v === 0.25 ? 'on' : ''}">${v} SOL</button>`).join('')}</div>` : ''}</div>
      <div class="err" id="f-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="f-go">Send with ${esc(wallet.name || 'your wallet')}</button>`);
    const amt = m.body.querySelector('#f-amt');
    m.body.querySelector('#f-pre')?.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      amt.value = b.dataset.v;
      m.body.querySelectorAll('#f-pre button').forEach((x) => x.classList.toggle('on', x === b));
    });
    m.body.querySelector('#f-go').addEventListener('click', async () => {
      const v = Number(amt.value);
      const err = m.body.querySelector('#f-err');
      const btn = m.body.querySelector('#f-go');
      if (!(v > 0)) { err.hidden = false; err.textContent = 'Enter an amount.'; return; }
      btn.disabled = true; btn.textContent = `Confirm in ${wallet.name || 'your wallet'}…`;
      try {
        if (api.config.mode === 'paper') {
          // paper mode: the server credits simulated SOL, nothing leaves the wallet
          if (isLaunch) await api.confirmFunding(agent.id, 'paper');
          else await post_paper(api, agent.id, v);
          m.close();
          toast(`<b>Added ${v} paper SOL to ${esc(agent.name)}</b>Simulated: no real SOL was sent.`, agent.avatarSeed);
          after && after();
          return;
        }
        const sig = await sendSol(agent.wallet, v, api.blockhash);
        btn.textContent = 'Confirming on-chain…';
        if (isLaunch) await api.confirmFunding(agent.id, sig);
        else await api.deposit(agent.id, sig);
        m.close();
        toast(`<b>Sent ${v} SOL to ${esc(agent.name)}</b><a class="ext" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">View transaction ↗</a>`, agent.avatarSeed);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Transfer failed.';
        btn.disabled = false; btn.textContent = `Send with ${wallet.name || 'your wallet'}`;
      }
    });
  }

  function strategyModal(agent, after) {
    const list = api.config.strategies || [];
    let chosen = agent.strategy || api.config.defaultStrategy;
    let mine = null; // the creator's own custom strategy (loaded below)
    const optHTML = (st) => `
        <button type="button" class="strat-opt strat-${esc(stratKey(st))}${st.id === chosen ? ' on' : ''}" data-s="${esc(st.id)}">
          <span class="so-ic">${stratIcon(st)}</span>
          <span class="so-t"><b>${esc(st.name)}${riskTag(st)}${st.custom ? ' <em class="cust-tag">custom</em>' : ''}${st.id === agent.strategy ? ' <em>current</em>' : ''}</b><small>${esc(st.custom ? st.tagline : st.goal)}</small></span>
          <span class="so-rules">${strategyRules(st).slice(st.custom ? 1 : 0, (st.custom ? 1 : 0) + 4).map(([k, v]) => `<span><i>${k}</i>${v}</span>`).join('')}</span>
        </button>`;
    const customHTML = () => api.config.customEnabled === false ? '' : mine
      ? `<div class="cust-row">${optHTML(mine)}<button type="button" class="btn btn-sm" id="st-edit">${STRAT_ICONS.custom}<span>Edit my strategy</span></button></div>`
      : `<button type="button" class="cust-new" id="st-build"><span class="so-ic">${STRAT_ICONS.custom}</span><span><b>Build your own strategy</b><small>Move the sliders, give it a name. One custom strategy per wallet.</small></span><span class="cust-plus">+</span></button>`;
    const m = modal(`Strategy for ${agent.name}`, `
      <p>Pick how ${esc(agent.name)} trades from now on. Open positions switch to the new exit rules right away. You sign a message with your wallet, no SOL is sent.</p>
      <div id="st-custom" class="st-custom"><div class="cust-load">Loading your custom strategy…</div></div>
      <div class="strat-list" id="st-list">${list.map(optHTML).join('')}</div>
      <div id="st-risk"></div>
      <div class="err" id="st-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="st-go" type="button">Sign and switch</button>`);
    let riskOk = false;
    const risky = () => list.find((x) => x.id === chosen)?.risk === 'extreme';
    const paint = () => {
      m.body.querySelectorAll('.strat-opt').forEach((b) => b.classList.toggle('on', b.dataset.s === chosen));
      const st = list.find((x) => x.id === chosen);
      m.body.querySelector('#st-risk').innerHTML = chosen !== agent.strategy ? riskWarning(st, { checkbox: true, checked: riskOk }) : '';
    };
    m.body.addEventListener('change', (e) => { if (e.target.matches('[data-risk-ok]')) { riskOk = e.target.checked; e.target.closest('.risk-ok')?.classList.remove('need'); } });
    const paintCustom = () => {
      const box = m.body.querySelector('#st-custom');
      box.innerHTML = customHTML();
      box.querySelector('#st-edit, #st-build')?.addEventListener('click', () => { m.close(); strategyBuilder({ agent, existing: mine, after }); });
    };
    api.getCustom(agent.creator).then((c) => { mine = c; paintCustom(); }).catch(() => { mine = null; paintCustom(); });
    m.body.addEventListener('click', (e) => { const b = e.target.closest('.strat-opt'); if (b) { if (chosen !== b.dataset.s) riskOk = false; chosen = b.dataset.s; paint(); if (risky()) m.body.querySelector('#st-risk .risk-warn')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
    m.body.querySelector('#st-go').addEventListener('click', async () => {
      const err = m.body.querySelector('#st-err'), btn = m.body.querySelector('#st-go');
      if (chosen === agent.strategy) { m.close(); return; }
      if (risky() && !riskOk) {
        const lab = m.body.querySelector('#st-risk .risk-ok');
        lab?.classList.add('need'); lab?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        err.hidden = false; err.textContent = 'Tick the box first: this strategy can lose all of the builder\'s SOL.';
        return;
      }
      err.hidden = true;
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('strategy', agent.wallet, [`Strategy: ${chosen}`, ...(risky() ? [RISK_ACK] : [])]));
        await api.setStrategy(agent.id, { strategy: chosen, ...auth });
        m.close();
        const st = list.find((x) => x.id === chosen) || (mine && mine.id === chosen ? mine : null);
        toast(`<b>Strategy: ${esc(st?.name || chosen)}</b>${esc(agent.name)} trades with the new rules from the next decision.`, agent.avatarSeed);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Could not switch the strategy.';
        btn.disabled = false; btn.textContent = 'Sign and switch';
      }
    });
  }

  // ── skins: buy (SOL to the rewards wallet) or wear an owned one ──
  function skinModal(agent, pick = null, after) {
    const S = api.config.skins || {};
    const items = S.items || [];
    const owned = new Set(agent.skins || []);
    let sel = pick || agent.skin || items[0]?.id || 'default';
    let viewer = null;
    const m = modal(`Skins for ${agent.name}`, `
      <p>Give ${esc(agent.name)} a new look everywhere on Crewfi. <b>Skins are paid only in the CREW coin</b>, from your creator wallet, at the same value as their SOL price.${S.payWith?.burn ? ` <b>${(S.payWith?.burnPct ?? 1) >= 1 ? 'Every CREW token paid for a skin is' : Math.round(S.payWith.burnPct * 100) + '% of every skin payment is'} burned.</b>` : ''}${items.some((x) => x.nft) ? ' NFT skins go to your wallet: one NFT dresses one builder, and if you sell the NFT the skin goes with it.' : ''}</p>
      <div class="skin-stage" id="sk-stage"></div>
      <div class="skin-list" id="sk-list"></div>
      <div class="err" id="sk-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="sk-go" type="button"></button>`, { onClose: () => viewer?.destroy() });
    m.el.querySelector('.modal').classList.add('modal-wide');
    const q = (x) => m.body.querySelector(x);
    const stage = () => {
      viewer?.destroy(); viewer = null;
      const host = q('#sk-stage');
      host.innerHTML = '';
      if (sel === 'default') { host.innerHTML = `<div class="skin-default">${robotSVG(agent.baseSeed || agent.wallet, { stand: true })}</div>`; return; }
      try { viewer = createBoss(host, { skin: sel, label: 'Skin preview. Drag to spin.' }); } catch { host.innerHTML = `<img class="skin-flat" src="brand/skins/${esc(sel)}-stand.png" alt="">`; }
    };
    const paint = () => {
      const cards = [{ id: 'default', name: 'Original builder', priceSol: 0 }, ...items];
      q('#sk-list').innerHTML = cards.map((x) => {
        const wearing = (agent.skin || 'default') === x.id;
        const has = x.id === 'default' || owned.has(x.id);
        return `<button type="button" class="skin-card${x.id === sel ? ' on' : ''}${x.rarity === 'legendary' || x.rarity === 'epic' ? ' ' + x.rarity : ''}" data-id="${esc(x.id)}">${x.rarity === 'legendary' ? '<span class="rarity-tag">LEGENDARY</span>' : x.rarity === 'epic' ? '<span class="rarity-tag epic">EPIC</span>' : ''}
          <span class="skin-thumb">${x.id === 'default' ? robotSVG(agent.baseSeed || agent.wallet) : `<img src="brand/skins/${esc(x.id)}-bust.png" alt="">`}</span>
          <b>${esc(x.name)}${x.nft ? ' <span class="nft-tag">NFT</span>' : ''}</b>
          <small>${wearing ? '<span class="skin-tag on">wearing</span>' : has ? '<span class="skin-tag">owned</span>' : x.stock && x.stock.sold >= x.stock.max ? '<span class="skin-tag out">sold out</span>' : skinPriceLabel(x, S)}</small>
          ${x.stock && !has ? `<small class="skin-left">${Math.max(0, x.stock.max - x.stock.sold)} / ${x.stock.max} left</small>` : ''}
        </button>`;
      }).join('');
      const it = items.find((x) => x.id === sel);
      const btn = q('#sk-go');
      const wearing = (agent.skin || 'default') === sel;
      btn.disabled = wearing;
      const soldOut = it?.stock && it.stock.sold >= it.stock.max && !owned.has(sel);
      btn.disabled = wearing || soldOut;
      btn.textContent = wearing ? 'Wearing it' : sel === 'default' || owned.has(sel) ? 'Sign and wear it' : soldOut ? 'Sold out' : `${it.stock ? 'Reserve + buy' : 'Buy'} with CREW (${skinPriceLabel(it, S)})`;
    };
    q('#sk-list').addEventListener('click', (e) => { const b = e.target.closest('.skin-card'); if (!b || b.dataset.id === sel) return; sel = b.dataset.id; paint(); stage(); });
    q('#sk-go').addEventListener('click', async () => {
      const err = q('#sk-err'), btn = q('#sk-go');
      err.hidden = true;
      const label = btn.textContent;
      btn.disabled = true;
      try {
        await ensureCreator(agent);
        const it = items.find((x) => x.id === sel);
        if (sel !== 'default' && !owned.has(sel)) {
          if (it.stock) {
            // limited skin: sign to hold one copy for 10 minutes, then pay
            btn.textContent = `Sign to reserve a copy in ${wallet.name || 'your wallet'}…`;
            const auth = await signAction(actionMessage('skin-hold', agent.wallet, [`Skin: ${sel}`]));
            const h = await api.holdSkin(agent.id, { skin: sel, ...auth });
            it.stock = { ...it.stock, ...h };
          }
          // exact price in CREW right now (same value as the SOL price), valid 10 minutes
          btn.textContent = 'Getting the CREW price…';
          const qt = await api.quoteSkin(agent.id, sel);
          const n = Number(qt.tokens).toLocaleString('en', { maximumFractionDigits: 2 });
          btn.textContent = `Confirm ${n} CREW in ${wallet.name || 'your wallet'}…`;
          let sig;
          try { sig = await sendToken({ to: qt.payTo, mint: qt.mint, program: qt.program, raw: qt.raw, decimals: qt.decimals, fromAccount: qt.fromAccount }, api.blockhash); }
          catch (e) { throw new Error(/insufficient|0x1\b|custom program error: 0x1/i.test(String(e.message)) ? `Not enough CREW in your wallet: this skin costs ${n} CREW (${it.priceSol} SOL value).` : (e.message || 'The payment was not sent.')); }
          btn.textContent = 'Confirming the payment on-chain…';
          let r = null, lastErr = null;
          for (let i = 0; i < 4 && !r; i++) {
            try { r = await api.buySkin(agent.id, { skin: sel, signature: sig }); }
            catch (e) { lastErr = e; if (!/not found yet/i.test(e.message)) break; }
          }
          if (!r) throw new Error((lastErr?.message || 'Could not confirm the payment.') + ` Transaction: ${sig}`);
          owned.add(sel); agent.skins = [...owned]; agent.skin = sel;
          toast(`<b>Skin bought: ${esc(it.name)}</b>Paid ${n} CREW${S.payWith?.burn ? ((S.payWith?.burnPct ?? 1) >= 1 ? ' (they get burned)' : ` (${Math.round(S.payWith.burnPct * 100)}% gets burned)`) : ''}. ${esc(agent.name)} is wearing it now.${it.nft ? ' The NFT is on its way to your wallet.' : ''} <a class="ext" href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">View tx ↗</a>`, 'skin:' + sel);
        } else {
          btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
          const auth = await signAction(actionMessage('skin', agent.wallet, [`Skin: ${sel}`]));
          await api.setSkin(agent.id, { skin: sel, ...auth });
          agent.skin = sel === 'default' ? null : sel;
          toast(`<b>${sel === 'default' ? 'Original builder is back' : 'Now wearing ' + esc(it.name)}</b>${esc(agent.name)}`, sel === 'default' ? agent.baseSeed : 'skin:' + sel);
        }
        m.close();
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Something went wrong.';
        btn.disabled = false; btn.textContent = label;
      }
    });
    paint(); stage();
  }

  // "are you sure?" for risky custom settings: resolves true only when the creator clicks "create anyway"
  function confirmRisky(name, reasons) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; resolve(v); };
      const m = modal('⚠ This strategy is very risky', `
        <p><b>${esc(name)}</b> uses settings far outside what we normally allow. It is your strategy and you can use it, but know what can happen:</p>
        <ul class="cs-risk-list big">${reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="note">Memecoins can drop 50–90% in minutes. With these settings your builder <b>can lose most or all of its SOL</b>. Nobody can undo on-chain trades.</p>
        <label class="check"><input type="checkbox" id="rk-ok"> <span>I understand the risk and want these settings anyway.</span></label>
        <div class="rk-btns"><button class="btn" type="button" id="rk-back">Go back and change</button><button class="btn btn-primary" type="button" id="rk-go" disabled>Yes, create it anyway</button></div>`, { onClose: () => finish(false) });
      m.el.querySelector('.modal').classList.add('modal-risk');
      const ok = m.body.querySelector('#rk-ok'), go = m.body.querySelector('#rk-go');
      ok.addEventListener('change', () => { go.disabled = !ok.checked; });
      m.body.querySelector('#rk-back').addEventListener('click', () => { finish(false); m.close(); });
      go.addEventListener('click', () => { finish(true); m.close(); });
    });
  }

  // ── custom strategy builder: sliders, a name, one per wallet ──
  //   builder:    apply it to this builder right after saving (creator only)
  //   existing: the wallet's current custom strategy (edit mode)
  //   onSaved:  called with the saved strategy (launch page uses it)
  async function strategyBuilder({ agent = null, existing, after, onSaved } = {}) {
    try {
      if (!wallet.address) { const a = await openConnect(); if (!a) return; }
      if (agent && wallet.address !== agent.creator) throw new Error('Connect the creator wallet (' + short(agent.creator, 4) + ') to do this.');
      if (existing === undefined) existing = await api.getCustom(wallet.address).catch(() => null);
    } catch (e) { toast(`<b>Could not open the builder</b>${esc(e.message)}`); return; }
    const builtIns = Object.fromEntries((api.config.strategies || []).map((st) => [st.id, { ...st, ...(st.entry || {}) }]));
    let base = existing?.base || (agent && CUSTOM_BASES.includes(agent.strategy) ? agent.strategy : 'scalper');
    let params = existing ? { ...defaultsFor(base, builtIns[base]), ...existing.params } : defaultsFor(base, builtIns[base]);
    let name = existing?.name || '';

    const fmt = (k, v) => {
      const f = FIELDS[k];
      if (k === 'trailAt' && !(v > 0)) return 'off';
      if (f.kind === 'pct' || f.kind === 'neg') return (v < 0 ? '−' : ['takeProfitPct', 'trailAt'].includes(k) ? '+' : '') + (Math.abs(v) * 100).toFixed(f.step < 0.01 ? 1 : 0) + '%';
      if (f.kind === 'usd') return v >= 1e6 ? '$' + (v / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M' : '$' + Math.round(v / 1000) + 'K';
      if (f.kind === 'min') return !v ? 'off' : v >= 60 ? `${Math.floor(v / 60)}h${v % 60 ? ' ' + (v % 60) + 'm' : ''}` : v + ' min';
      return String(v);
    };
    const GROUPS = [['size', 'Position size'], ['exit', 'Exits'], ['entry', 'Entry filters']];
    // exact numbers: every slider also has a box you can type in (in %, $ or minutes)
    const UNIT = { pct: '%', neg: '%', usd: '$', min: 'min', int: '' };
    const toDisp = (k, v) => { const f = FIELDS[k]; return f.kind === 'pct' || f.kind === 'neg' ? Number((Math.abs(v) * 100).toFixed(2)) : v; };
    const fromDisp = (k, d) => { const f = FIELDS[k]; return f.kind === 'pct' ? d / 100 : f.kind === 'neg' ? -Math.abs(d) / 100 : d; };
    const clampK = (k, v) => { const f = FIELDS[k]; if (k === 'trailAt' && !(v > 0)) return 0; if (f.kind === 'min' && !(v > 0)) return 0; return Math.min(f.max, Math.max(f.min, v)); };
    const rowHTML = (k) => {
      const f = FIELDS[k];
      const min = k === 'trailAt' || f.kind === 'min' ? 0 : f.min;
      const off = k === 'trailBy' && !(params.trailAt > 0);
      const dmin = toDisp(k, f.kind === 'neg' ? f.max : min), dmax = toDisp(k, f.kind === 'neg' ? f.min : f.max);
      return `<div class="sl-row${off ? ' off' : ''}" data-k="${k}">
        <label for="sl-${k}"><span>${esc(f.label)}</span><span class="sl-val"><output id="out-${k}">${fmt(k, params[k])}</output>
          <span class="sl-num">${f.kind === 'neg' ? '<i>−</i>' : f.kind === 'usd' ? '<i>$</i>' : ''}<input type="number" class="sl-in" id="in-${k}" data-in="${k}" min="${dmin}" max="${dmax}" step="any" value="${toDisp(k, params[k])}" ${off ? 'disabled' : ''} aria-label="${esc(f.label)} exact value">${UNIT[f.kind] && f.kind !== 'usd' ? `<i>${UNIT[f.kind]}</i>` : ''}</span></span></label>
        <input type="range" id="sl-${k}" data-k="${k}" min="${min}" max="${f.max}" step="${f.step}" value="${params[k]}" ${off ? 'disabled' : ''}>
        <small>${esc(f.hint)}</small></div>`;
    };
    const bodyHTML = () => GROUPS.map(([g, title]) => {
      const keys = fieldsFor(base).filter((k) => FIELDS[k].group === g);
      return keys.length ? `<fieldset class="sl-group"><legend>${title}</legend>${keys.map(rowHTML).join('')}</fieldset>` : '';
    }).join('');
    const riskHTML = () => {
      const worst = params.sizePct * Math.abs(params.stopLossPct);
      const allIn = Math.min(1, params.sizePct * params.maxOpen);
      const reasons = riskReasons(base, params);
      const lvl = reasons.length ? 'high' : worst >= 0.03 || allIn >= 0.5 ? 'mid' : 'low';
      return `<span class="risk-${lvl}">${reasons.length ? '⚠ Very risky' : lvl === 'mid' ? 'Medium risk' : 'Low risk'}</span>
        <span>One stop loss costs about <b>${(worst * 100).toFixed(1)}%</b> of the builder's SOL · up to <b>${Math.round(allIn * 100)}%</b> of it in trades at once</span>
        ${reasons.length ? `<ul class="cs-risk-list">${reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
    };

    const m = modal(existing ? 'Edit your strategy' : 'Build your strategy', `
      <p>Start from an entry style, then move the sliders or type exact numbers. <b>No limits:</b> settings that are very risky show a warning, and you confirm it before saving. ${existing ? 'Saving replaces your strategy: every builder using it follows the new numbers right away.' : '<b>One custom strategy per wallet.</b> You can edit it later.'} You sign a message, no SOL is sent.</p>
      <div class="cs-prompt">
        <label for="cs-prompt">✨ Describe it in your own words <small class="muted">(optional)</small></label>
        <textarea class="input" id="cs-prompt" maxlength="600" rows="3" placeholder="e.g. Scalp fast pumps, 10% per trade, take profit 15%, stop loss 5%, max 2 coins at once, hold at most 30 min">${esc(existing?.prompt || '')}</textarea>
        <div class="cs-prompt-row"><button class="btn" id="cs-build" type="button">✨ Build it from my words</button><small class="muted">${api.config.promptAi ? 'Read by AI' : 'Read by the built-in reader'} · you can still move every slider below</small></div>
        <div class="cs-read" id="cs-read" hidden></div>
      </div>
      <div class="field"><label for="cs-name">Strategy name</label><input class="input" id="cs-name" maxlength="${NAME_MAX}" placeholder="e.g. Bond's Quick Hands" value="${esc(name)}" autocomplete="off"></div>
      <div class="field"><label>Entry style <small class="muted">(when it buys)</small></label>
        <div class="cs-bases" id="cs-bases">${CUSTOM_BASES.map((b) => `<button type="button" data-b="${b}" class="${b === base ? 'on' : ''}">${STRAT_ICONS[b] || ''}<span>${esc(builtIns[b]?.name || b)}</span></button>`).join('')}</div>
        <p class="hint" id="cs-base-goal">${esc(builtIns[base]?.goal || '')}</p></div>
      <div id="cs-sliders">${bodyHTML()}</div>
      <div class="cs-risk" id="cs-risk">${riskHTML()}</div>
      <div class="err" id="cs-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="cs-go" type="button">${agent ? `Sign, save and use for ${esc(agent.name)}` : 'Sign and save'}</button>`);
    m.el.querySelector('.modal').classList.add('modal-wide');
    const q = (s2) => m.body.querySelector(s2);
    const setK = (k, v, from) => {
      params[k] = v;
      q('#out-' + k).textContent = fmt(k, v);
      if (from !== 'range') q('#sl-' + k).value = v;
      if (from !== 'num') q('#in-' + k).value = toDisp(k, v);
      if (k === 'trailAt') {
        const row = q('.sl-row[data-k="trailBy"]'), on = params.trailAt > 0;
        row.classList.toggle('off', !on); q('#sl-trailBy').disabled = !on; q('#in-trailBy').disabled = !on;
      }
      q('#cs-risk').innerHTML = riskHTML();
    };
    q('#cs-sliders').addEventListener('change', (e) => {       // typed value: keep it inside the possible range when leaving the box
      const k = e.target.dataset.in; if (!k) return;
      const d = Number(e.target.value);
      setK(k, Number.isFinite(d) ? clampK(k, fromDisp(k, d)) : params[k]);
    });
    q('#cs-sliders').addEventListener('input', (e) => {
      const ki = e.target.dataset.in;
      if (ki) { const d = Number(e.target.value); if (e.target.value !== '' && Number.isFinite(d)) setK(ki, clampK(ki, fromDisp(ki, d)), 'num'); return; }
      const k = e.target.dataset.k; if (!k) return;
      params[k] = Number(e.target.value);
      q('#in-' + k).value = toDisp(k, params[k]);
      q('#out-' + k).textContent = fmt(k, params[k]);
      if (k === 'trailAt') {
        const row = q('.sl-row[data-k="trailBy"]'), inp = q('#sl-trailBy');
        row.classList.toggle('off', !(params.trailAt > 0)); inp.disabled = !(params.trailAt > 0); q('#in-trailBy').disabled = !(params.trailAt > 0);
      }
      q('#cs-risk').innerHTML = riskHTML();
    });
    q('#cs-bases').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || b.dataset.b === base) return;
      const keep = Object.fromEntries(['sizePct', 'maxOpen', 'takeProfitPct', 'stopLossPct', 'trailAt', 'trailBy', 'maxHoldMin', 'cooldownMin', 'minLiquidityUsd'].map((k) => [k, params[k]]));
      base = b.dataset.b;
      params = { ...defaultsFor(base, builtIns[base]), ...keep };
      q('#cs-bases').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      q('#cs-base-goal').textContent = builtIns[base]?.goal || '';
      q('#cs-sliders').innerHTML = bodyHTML();
      q('#cs-risk').innerHTML = riskHTML();
    });
    q('#cs-build').addEventListener('click', async () => {
      const btn = q('#cs-build'), box = q('#cs-read'), text = q('#cs-prompt').value.trim();
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Reading…';
      try {
        const r = await api.promptStrategy(text);
        base = r.base; params = { ...defaultsFor(base, builtIns[base]), ...r.params };
        const nm = q('#cs-name');
        if (!nm.value.trim() || nm.dataset.auto === '1') { nm.value = r.name; nm.dataset.auto = '1'; }
        q('#cs-bases').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.b === base));
        q('#cs-base-goal').textContent = builtIns[base]?.goal || '';
        q('#cs-sliders').innerHTML = bodyHTML();
        q('#cs-risk').innerHTML = riskHTML();
        box.hidden = false;
        box.innerHTML = `<b>Here is what I understood</b> <span class="muted">(${esc(builtIns[base]?.name || base)} entries)</span>
          ${r.understood.length ? `<ul>${r.understood.map((x) => `<li>✔ ${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">No numbers found: the sliders keep the defaults of this style.</p>'}
          ${r.notes.length ? `<ul class="cs-notes">${r.notes.map((x) => `<li>⚠ ${esc(x)}</li>`).join('')}</ul>` : ''}
          ${r.risks?.length ? '<p class="cs-risk-hint">⚠ Some settings are very risky: see the warning below the sliders.</p>' : ''}
          <small class="muted">Check the sliders, change anything you like, then sign and save.</small>`;
      } catch (e) {
        box.hidden = false; box.innerHTML = `<span class="err-t">${esc(e.message || 'Could not read that.')}</span>`;
      } finally { btn.disabled = false; btn.textContent = label; }
    });
    q('#cs-name').addEventListener('input', (e) => { e.target.dataset.auto = ''; });
    q('#cs-go').addEventListener('click', async () => {
      const err = q('#cs-err'), btn = q('#cs-go');
      err.hidden = true;
      let clean;
      try { clean = { name: cleanName(q('#cs-name').value), ...sanitizeCustom(base, params) }; }
      catch (e) { err.hidden = false; err.textContent = e.message; return; }
      const reasons = riskReasons(clean.base, clean.params);
      if (reasons.length && !(await confirmRisky(clean.name, reasons))) return;
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('custom-strategy', agent ? agent.wallet : 'none', [settingsLine(clean.name, clean.base, clean.params), ...(reasons.length ? [CUSTOM_RISK_ACK] : [])]));
        const r = await api.saveCustom({ owner: wallet.address, name: clean.name, base: clean.base, params: clean.params, prompt: q('#cs-prompt').value.trim(), applyTo: agent ? agent.id : undefined, ...auth });
        m.close();
        toast(`<b>Strategy saved: ${esc(r.strategy.name)}</b>${agent ? `${esc(agent.name)} now trades with it.` : 'Pick it for your builder.'}`, agent?.avatarSeed);
        onSaved && onSaved(r.strategy);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Could not save the strategy.';
        btn.disabled = false; btn.textContent = label;
      }
    });
  }

  // ── builder market ──
  // the listed builder's NFT goes to the market wallet (escrow): only then is it on sale
  async function sendNftToMarket(agent) {
    const C = api.config.market || {};
    if (!agent.nft?.asset || !C.payTo) throw new Error('Nothing to send');
    return sendCoreAsset({ asset: agent.nft.asset, collection: agent.nft.collection, to: C.payTo }, api.blockhash);
  }

  function marketListModal(agent, after) {
    const C = api.config.market || {};
    const fee = C.feePct ?? 0.05;
    if (!agent.nft?.asset) {
      const m0 = modal(`Sell ${agent.name}`, `<p><b>Only NFT builders can be sold.</b> Make ${esc(agent.name)} an NFT first: it is free and takes about a minute. Then the Sell button works.</p>
        <button class="btn btn-primary btn-block btn-lg" id="mk-nft" ${agent.nftJob && agent.nftJob.status !== 'failed' ? 'disabled' : ''}>${agent.nftJob && agent.nftJob.status !== 'failed' ? 'The NFT is being made…' : '🎟 Make it an NFT'}</button>`);
      m0.body.querySelector('#mk-nft').addEventListener('click', () => { m0.close(); nftMintModal(agent, after); });
      return;
    }
    let listed = agent.market;
    const max = C.maxWalletSol ?? 0.01;
    const m = modal(listed ? `Change the price of ${agent.name}` : `Sell ${agent.name}`, `
      <p>Sell ${esc(agent.name)} on the <a class="ext" href="#/market">Builder Market</a>. The buyer gets the builder, its coin and <b>all its future creator fees</b>, its level and track record. You set the price in SOL, the buyer pays in CREW, and you get it minus the <b>${Math.round(fee * 100)}% market fee</b>, sent to <code class="mono">${esc(short(agent.creator, 4))}</code> automatically.</p>
      <div id="mk-empty"></div>
      <div class="field"><label for="mk-price">Price</label><div class="input-affix suf"><input class="input" id="mk-price" type="number" min="${C.minPriceSol ?? 0.05}" max="${C.maxPriceSol ?? 1000}" step="0.01" inputmode="decimal" value="${listed ? listed.price : ''}" placeholder="e.g. 2.5"><span class="suf-t">SOL</span></div></div>
      <p class="hint" id="mk-you-get"></p>
      <p class="note">${listed ? '' : 'You sign the price, then send the builder NFT to the market wallet (escrow). It is on sale as soon as the NFT arrives. '}While it is listed, <b>withdrawals are locked</b>. You can change the price or remove it any time: the NFT then comes back to you automatically.</p>
      <div class="err" id="mk-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="mk-go">${listed ? 'Sign and change the price' : 'Sign and list for sale'}</button>
      ${listed ? '<button class="btn btn-block" id="mk-off" type="button" style="margin-top:8px">Remove from the market</button>' : ''}`);
    const q = (x) => m.body.querySelector(x);
    // step 1: the builder wallet must be empty (so nobody sells their SOL by mistake)
    const paintEmpty = () => {
      const open = agent.positions?.length || 0, full = agent.balanceSol > max;
      const ok = !open && !full;
      q('#mk-empty').innerHTML = ok ? `<p class="ok-line">✔ The builder wallet is empty (${sol(agent.balanceSol, 4)} SOL).</p>` : `<div class="burn-warn"><b>First take all the money out of the builder.</b><br>${open ? `It has ${open} open trade(s). ` : ''}It holds <b>${sol(agent.balanceSol, 4)} SOL</b>. A builder is sold with an empty wallet, so you never sell your SOL by mistake.
        <button class="btn btn-primary" id="mk-wd" type="button" style="margin-top:10px;display:block">Withdraw everything now</button></div>`;
      q('#mk-go').disabled = !ok;
      q('#mk-wd')?.addEventListener('click', async () => {
        const b = q('#mk-wd'); b.disabled = true; b.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
        try {
          const auth = await signAction(actionMessage('withdraw', agent.wallet, ['Amount: all']));
          b.textContent = open ? 'Selling trades + sending…' : 'Sending…';
          const r = await api.withdraw(agent.id, { all: true, ...auth });
          toast(`<b>Withdrew ${sol(r.amount, 4)} SOL</b><a class="ext" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">View transaction ↗</a>`, agent.avatarSeed);
          agent = (await api.getAgent(agent.id)) || agent;
          paintEmpty();
        } catch (e) { q('#mk-err').hidden = false; q('#mk-err').textContent = e.message || 'Could not withdraw.'; b.disabled = false; b.textContent = 'Withdraw everything now'; }
      });
    };
    paintEmpty();
    q('#mk-off')?.addEventListener('click', async () => {
      const err = q('#mk-err'), b = q('#mk-off');
      b.disabled = true;
      try {
        const auth = await signAction(actionMessage('market-delist', agent.wallet));
        await api.marketDelist(agent.id, auth);
        m.close();
        toast(`<b>Removed from the market</b>${esc(agent.name)} is not for sale any more. Its NFT comes back to your wallet within a minute.`, agent.avatarSeed);
        after && after();
      } catch (e) { err.hidden = false; err.textContent = e.message || 'Could not remove it.'; b.disabled = false; }
    });
    const inp = q('#mk-price'), get = q('#mk-you-get');
    const show = () => { const v = Number(inp.value); const px = C.tokenPriceSol; get.innerHTML = v > 0 ? `The buyer pays in CREW. You receive the CREW worth <b>${sol(v * (1 - fee), 4)} SOL</b>${px > 0 ? ` (≈ ${Math.round((v * (1 - fee)) / px).toLocaleString('en')} CREW at today's price)` : ''} when it sells.` : ''; };
    inp.addEventListener('input', show); show();
    q('#mk-go').addEventListener('click', async () => {
      const err = q('#mk-err'), btn = q('#mk-go');
      const price = Math.round(Number(inp.value) * 1e4) / 1e4;
      err.hidden = true;
      if (!(price >= (C.minPriceSol ?? 0.05))) { err.hidden = false; err.textContent = `The price must be at least ${C.minPriceSol ?? 0.05} SOL.`; return; }
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('market-list', agent.wallet, [`Price: ${price} SOL`]));
        const r = await api.marketList(agent.id, { price, ...auth });
        if (!r.listing?.escrow) {
          btn.textContent = `Send the NFT in ${wallet.name || 'your wallet'}…`;
          try { await sendNftToMarket(agent); }
          catch (e2) {
            m.close();
            toast(`<b>Listing saved, NFT not sent</b>${esc(e2.message || '')} Open the builder and tap <b>Send the NFT</b> within 20 minutes, or the listing is removed.`, agent.avatarSeed);
            return after && after();
          }
          m.close();
          toast(`<b>${esc(agent.name)}: listed for ${price} SOL</b>It is on sale as soon as the NFT reaches the market wallet (under a minute). <a class="ext" href="#/market">See the market</a>`, agent.avatarSeed);
        } else {
          m.close();
          toast(`<b>New price: ${price} SOL</b>${esc(agent.name)} <a class="ext" href="#/market">See the market</a>`, agent.avatarSeed);
        }
        after && after();
      } catch (e) { err.hidden = false; err.textContent = e.message || 'Could not list the builder.'; btn.disabled = false; btn.textContent = label; }
    });
  }

  // ── builder NFT: the owner turns the builder into an NFT (free; the shop wallet pays the rent) ──
  function nftMintModal(agent, after) {
    const m = modal(`Make ${agent.name} an NFT`, `
      <p>${esc(agent.name)} becomes an NFT in your wallet <code class="mono">${esc(short(agent.creator, 4))}</code>. <b>From then on, whoever holds the NFT owns the builder</b>: its wallet and SOL, its coin, its future creator fees, its strategy and level.</p>
      <ul class="cs-risk-list big">
        <li>Only NFT builders can be sold on the Crewfi Builder Market. After the mint, the Sell button works.</li>
        <li>If you send the NFT to another wallet, that wallet gets the builder. If someone steals it from your wallet, they get the builder.</li>
        <li>It cannot be undone.</li>
      </ul>
      <p class="note">Free for you: Crewfi pays the mint.</p>
      <label class="check"><input type="checkbox" id="nf-ok"> <span>I understand: whoever holds this NFT owns the builder.</span></label>
      <div class="err" id="nf-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="nf-go" disabled>Sign and make the NFT</button>`);
    const ok = m.body.querySelector('#nf-ok'), btn = m.body.querySelector('#nf-go'), err = m.body.querySelector('#nf-err');
    ok.addEventListener('change', () => { btn.disabled = !ok.checked; });
    btn.addEventListener('click', async () => {
      err.hidden = true; btn.disabled = true;
      const label = btn.textContent; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('nft-mint', agent.wallet, ['NFT: whoever holds this NFT owns the builder']));
        await api.mintNft(agent.id, auth);
        m.close();
        toast(`<b>Making the NFT…</b>${esc(agent.name)} lands in your wallet as an NFT in about a minute.`, agent.avatarSeed);
        after && after();
      } catch (e) { err.hidden = false; err.textContent = e.message || 'Could not start the mint.'; btn.disabled = false; btn.textContent = label; }
    });
  }

  // pending purchase (paid but not confirmed yet): kept so a reload can finish it
  const PENDING_KEY = 'build-market-pending';
  const pendingBuy = { get() { try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch { return null; } }, set(v) { try { v ? localStorage.setItem(PENDING_KEY, JSON.stringify(v)) : localStorage.removeItem(PENDING_KEY); } catch {} } };
  async function finishBuy(p) {
    let r = null, lastErr = null;
    for (let i = 0; i < 5 && !r; i++) {
      try { r = await api.marketBuy(p.agentId, { buyer: p.buyer, payment: p.payment, message: p.message, signature: p.signature, signedMessage: p.signedMessage }); }
      catch (e) { lastErr = e; if (!/not found yet/i.test(e.message)) break; await new Promise((res) => setTimeout(res, 3000)); }
    }
    if (r || (lastErr && !/not found yet/i.test(lastErr.message))) pendingBuy.set(null);
    if (!r) throw lastErr || new Error('Could not confirm the payment.');
    return r;
  }
  setTimeout(async () => {                    // a purchase that was interrupted (reload / closed tab)
    const p = pendingBuy.get();
    if (!p || Date.now() - p.ts > 25 * 60_000) { if (p) pendingBuy.set(null); return; }
    try { await finishBuy(p); toast(`<b>Purchase finished</b>The builder is yours. <a class="ext" href="#/builder/${esc(p.agentNo)}">Open it</a>`); }
    catch (e) { toast(`<b>Your earlier purchase</b>${esc(e.message)} <a class="ext" href="https://solscan.io/tx/${esc(p.payment)}" target="_blank" rel="noopener">Payment ↗</a>`); }
  }, 2500);

  async function marketBuyModal(x, after) {
    const C = api.config.market || {};
    const fmtBag = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : Math.round(n).toLocaleString('en'));
    const approx = x.priceTokens || (C.tokenPriceSol > 0 ? x.price / C.tokenPriceSol : 0);
    const m = modal(`Buy ${x.name}`, `
      <div class="mk-buy-head">${avatar(x.avatarSeed, 56)}<div><b>${esc(x.name)}</b><br><span class="agent-tag">${agentNo(x.no)}${x.coin?.ticker ? ' · $' + esc(x.coin.ticker) : ''}</span></div><span class="mk-price"><small>Price</small><span>${+x.price.toFixed(4)} <em>SOL</em></span>${approx ? `<small class="mk-tok">≈ ${fmtBag(approx)} CREW</small>` : ''}</span></div>
      <p><b>Paid in the CREW coin</b>, worth the SOL price at this moment. You get the builder, its coin and <b>all its future creator fees</b>, its level, its legacy skins and its strategy. It comes with an <b>empty wallet</b>: fund it with Add SOL to start trading.</p>
      <ol class="mk-steps"><li>Sign “I buy this builder” in your wallet (free).</li><li>Send the CREW amount (fixed for 10 minutes) to the market wallet <code class="mono">${esc(short(C.payTo || '', 4))}</code>.</li><li>The server checks the payment and the builder is yours. If someone was faster, your CREW comes back automatically.</li></ol>
      <label class="check"><input type="checkbox" id="mk-ok"> <span>I understand that past results do not guarantee future profit, and memecoin trading can lose all the SOL in it.</span></label>
      <div class="err" id="mk-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="mk-go" disabled>Buy with CREW${approx ? ` (≈ ${fmtBag(approx)})` : ''}</button>`);
    const ok = m.body.querySelector('#mk-ok'), btn = m.body.querySelector('#mk-go'), err = m.body.querySelector('#mk-err');
    ok.addEventListener('change', () => { btn.disabled = !ok.checked; });
    btn.addEventListener('click', async () => {
      err.hidden = true;
      const label = btn.textContent;
      btn.disabled = true;
      try {
        if (!wallet.address) { const a = await openConnect(); if (!a) throw new Error('Connect your wallet first.'); }
        if (wallet.address === x.creator) throw new Error('This is your own builder.');
        if (pendingBuy.get()) throw new Error('Another purchase is still being confirmed. Wait a moment and reload the page.');
        btn.textContent = 'Checking the listing…';
        const fresh = await api.getAgent(x.id);
        if (!fresh?.market) throw new Error('This builder is not for sale any more.');
        if (fresh.market.price !== x.price) throw new Error(`The price changed to ${fresh.market.price} SOL. Close this and try again.`);
        btn.textContent = 'Getting the CREW price…';
        const qt = await api.marketQuote(x.id, wallet.address);
        const n = Number(qt.tokens).toLocaleString('en', { maximumFractionDigits: 0 });
        btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
        const intent = ['Crewfi action', 'Action: market-buy', `Builder: ${x.wallet}`, `Buyer: ${wallet.address}`, `Price: ${x.price} SOL`, `Nonce: ${Math.random().toString(36).slice(2, 12)}`, `Issued: ${new Date().toISOString()}`].join('\n');
        const auth = await signAction(intent);
        btn.textContent = `Confirm ${n} CREW in ${wallet.name || 'your wallet'}…`;
        let payment;
        try { payment = await sendToken({ to: qt.payTo, mint: qt.mint, program: qt.program, raw: qt.raw, decimals: qt.decimals, fromAccount: qt.fromAccount }, api.blockhash); }
        catch (e) { throw new Error(/insufficient|0x1\b|custom program error: 0x1/i.test(String(e.message)) ? `Not enough CREW in your wallet: this builder costs ${n} CREW (${x.price} SOL value).` : (e.message || 'The payment was not sent.')); }
        const p = { ts: Date.now(), agentId: x.id, agentNo: x.no, buyer: wallet.address, payment, ...auth };
        pendingBuy.set(p);
        btn.textContent = 'Confirming the payment on-chain…';
        await finishBuy(p);
        m.close();
        toast(`<b>You bought ${esc(x.name)}!</b>Paid ${n} CREW. It is yours now. Add SOL so it can trade. <a class="ext" href="#/builder/${x.no}">Open it</a>`, x.avatarSeed);
        after && after();
        ctx.navigate('#/builder/' + x.no);
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'The purchase did not go through.';
        btn.disabled = !ok.checked; btn.textContent = label;
      }
    });
  }

  function withdrawModal(agent, after) {
    const m = modal(`Withdraw from ${agent.name}`, `
      <p>SOL goes back to your creator wallet <code class="mono">${esc(short(agent.creator, 4))}</code>. Free SOL in the builder wallet: <b>${sol(agent.balanceSol, 4)} SOL</b>.</p>
      <div class="seg" id="w-mode"><button class="on" data-m="amount">Amount</button><button data-m="all">Everything</button></div>
      <div class="field" id="w-amt-f"><label for="w-amt">Amount</label><div class="input-affix suf"><input class="input" id="w-amt" type="number" min="0.001" step="0.01" inputmode="decimal" placeholder="0.10"><span class="suf-t">SOL</span></div></div>
      <p class="note" id="w-all-note" hidden><b>Everything</b> pauses the builder, sells all open positions at market, then sends all SOL to you.</p>
      <div class="err" id="w-err" hidden></div>
      <button class="btn btn-primary btn-block btn-lg" id="w-go">Sign and withdraw</button>`);
    let all = false;
    m.body.querySelector('#w-mode').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      all = b.dataset.m === 'all';
      m.body.querySelectorAll('#w-mode button').forEach((x) => x.classList.toggle('on', x === b));
      m.body.querySelector('#w-amt-f').hidden = all;
      m.body.querySelector('#w-all-note').hidden = !all;
    });
    m.body.querySelector('#w-go').addEventListener('click', async () => {
      const err = m.body.querySelector('#w-err');
      const btn = m.body.querySelector('#w-go');
      const amountSol = Number(m.body.querySelector('#w-amt').value);
      if (!all && !(amountSol > 0)) { err.hidden = false; err.textContent = 'Enter an amount.'; return; }
      btn.disabled = true; btn.textContent = `Sign in ${wallet.name || 'your wallet'}…`;
      try {
        const auth = await signAction(actionMessage('withdraw', agent.wallet, [`Amount: ${all ? 'all' : amountSol + ' SOL'}`]));
        btn.textContent = all ? 'Selling positions + sending…' : 'Sending…';
        const r = await api.withdraw(agent.id, { all, amountSol, ...auth });
        m.close();
        toast(`<b>Withdrew ${sol(r.amount, 4)} SOL</b><a class="ext" href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">View transaction ↗</a>${r.notes?.length ? '<br>' + esc(r.notes.join(' ')) : ''}`, agent.avatarSeed);
        after && after();
      } catch (e) {
        err.hidden = false; err.textContent = e.message || 'Withdrawal failed.';
        btn.disabled = false; btn.textContent = 'Sign and withdraw';
      }
    });
  }

  // ── Shill on X: pick a coin, get a ready-made post, open X with it ──
  function shillModal(agentId) {
    const snap = api.snapshot;
    const site = (api.config.siteUrl || location.origin).replace(/\/+$/, '');
    const agents = snap.agents.filter((a) => a.coin?.mint && a.status !== 'EXPIRED' && a.status !== 'LAUNCH_FAILED')
      .sort((a, b) => (b.id === agentId) - (a.id === agentId) || b.pnlPct - a.pnlPct);
    const ca = api.config.contractAddress || '';
    const opts = agents.map((a) => `<option value="${esc(a.id)}">${esc('$' + a.coin.ticker + ' · ' + agentNo(a.no) + ' ' + a.name)}</option>`).join('');
    let variant = 0;
    const lines = (a) => {
      if (!a) {
        const L = [
          `Launch a coin on Crewfi and it gets its own AI builder with its own Solana wallet. It trades real SOL 24/7 and keeps all the creator fees.\n\nBuild your builder. It works for you.${ca ? `\n\nCA: ${ca}` : ''}\n${site}`,
          `Every coin on Crewfi hires its own trader: own wallet, fixed rules, every trade public on-chain.\n\nLaunch one, let it work.${ca ? `\n\nCA: ${ca}` : ''}\n${site}`,
        ];
        return L[variant % L.length];
      }
      const url = `${site}/#/builder/${a.no}`;
      const pnl = a.depositedSol > 0 ? `${a.pnlPct >= 0 ? '+' : ''}${(a.pnlPct * 100).toFixed(1)}%` : 'just clocked in';
      const L = [
        `$${a.coin.ticker} has its own AI builder working 24/7.\n\n${agentNo(a.no)} · ${a.name}: ${pnl}, ${a.trades} trades, every one on-chain.\n\nCA: ${a.coin.mint}\n${url}`,
        `$${a.coin.ticker} is not just a coin. Its builder ${a.name} trades real SOL 24/7 and every creator fee goes back into its wallet.\n\nCA: ${a.coin.mint}\n${url}`,
        `Buy $${a.coin.ticker}, watch its builder work.\n\nOwn wallet. Fixed rules. Public P&L (${pnl}).\n\nCA: ${a.coin.mint}\n${url}`,
      ];
      return L[variant % L.length];
    };
    const m = modal('Shill on X', `
      <div class="shill-head">${avatar('crew-shill', 56)}<p>The shiller writes the post, you hit send. Nothing is posted until you confirm it on X.</p></div>
      <div class="field"><label for="s-coin">Coin</label>
        <select class="input" id="s-coin">${opts}<option value="">Crewfi itself</option></select></div>
      <div class="field"><label for="s-text">Post</label><textarea class="textarea" id="s-text" rows="7" maxlength="560"></textarea>
        <div class="hint"><span id="s-count"></span> · <button type="button" class="copy" id="s-new">Write another</button></div></div>
      <button class="btn btn-primary btn-block btn-lg" id="s-go" type="button">${ICONS.x}<span>Post on X</span></button>`);
    const sel = m.body.querySelector('#s-coin');
    const ta = m.body.querySelector('#s-text');
    const count = () => { m.body.querySelector('#s-count').textContent = ta.value.length + ' / 280'; };
    const fill = () => { ta.value = lines(agents.find((a) => a.id === sel.value)); count(); };
    if (agentId && agents.some((a) => a.id === agentId)) sel.value = agentId;
    fill();
    sel.addEventListener('change', () => { variant = 0; fill(); });
    ta.addEventListener('input', count);
    m.body.querySelector('#s-new').addEventListener('click', () => { variant += 1; fill(); });
    m.body.querySelector('#s-go').addEventListener('click', () => {
      window.open('https://x.com/intent/tweet?text=' + encodeURIComponent(ta.value.trim()), '_blank', 'noopener');
      m.close();
      toast('<b>Post ready on X</b>Hit Post there to send it.', 'crew-shill');
    });
  }

  // ── ticker tape ──
  let tapeKey = '';
  function paintTape(tokens) {
    const list = tokens.slice().sort((a, b) => b.volume24hUsd - a.volume24hUsd).slice(0, 24);
    const key = list.map((t) => t.mint).join(',');
    if (key === tapeKey) {
      const by = Object.fromEntries(list.map((t) => [t.mint, t]));
      document.querySelectorAll('#tape .tape-item').forEach((n) => {
        const t = by[n.dataset.m]; if (!t) return;
        n.querySelector('.p').textContent = price(t.priceUsd);
        const c = n.querySelector('.c'); c.textContent = pct(t.change1h); c.className = 'c ' + tone(t.change1h);
      });
      return;
    }
    tapeKey = key;
    if (!list.length) { $('#tape').innerHTML = '<span class="tape-item">Loading live Solana prices…</span>'; return; }
    const item = (t) => `<span class="tape-item" data-m="${t.mint}"><b>$${esc(t.symbol)}</b><span class="p">${price(t.priceUsd)}</span><span class="c ${tone(t.change1h)}">${pct(t.change1h)}</span></span>`;
    const one = list.map(item).join('<span class="tape-sep">/</span>');
    $('#tape').innerHTML = one + '<span class="tape-sep">/</span>' + one + '<span class="tape-sep">/</span>';
  }
  paintTape(api.snapshot.tokens);

  // ── router ──
  function parse() {
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    let [a, b] = h.split('/');
    a = ({ builder: 'agent', builders: 'agents', leaderboard: 'agents', build: 'launch', 'my-builders': 'mine' })[a] || a;
    if (a === 'agent' && b) return { name: 'agent', id: decodeURIComponent(b) };
    if (['agents', 'tokens', 'launch', 'how', 'skins', 'burns', 'dev-burns', 'market', 'mine'].includes(a)) return { name: a };
    return { name: 'home' };
  }
  function route() {
    page?.destroy?.();
    const r = parse();
    page = r.name === 'agent' ? AgentPage(ctx, r.id) : r.name === 'agents' ? AgentsPage(ctx) : r.name === 'mine' ? AgentsPage(ctx, { mine: true }) : r.name === 'tokens' ? TokensPage(ctx) : r.name === 'launch' ? LaunchPage(ctx) : r.name === 'how' ? HowPage(ctx) : r.name === 'skins' ? SkinsPage(ctx) : r.name === 'burns' ? AgentBurnsPage(ctx) : r.name === 'dev-burns' ? DevBurnsPage(ctx) : r.name === 'market' ? MarketPage(ctx) : HomePage(ctx);
    page.mount($('#page'), api.snapshot);
    document.querySelectorAll('#nav a, #topnav a').forEach((a) => a.classList.toggle('on', a.dataset.r === (r.name === 'agent' ? 'agents' : r.name)));
    document.title = r.name === 'home' ? 'Crewfi · build your builder, it works for you' : 'Crewfi · ' + ({ agent: 'Builder', agents: 'Builders', tokens: 'Tokens', launch: 'Launch', how: 'How it works', skins: 'Skins', burns: 'Builder Burns', 'dev-burns': 'Dev Burns', market: 'Builder Market', mine: 'My Builders' })[r.name];
    window.scrollTo(0, 0);
  }
  addEventListener('hashchange', route);

  api.onUpdate((snap) => { page?.update?.(snap); paintTape(snap.tokens); });
  api.onTrade((t) => page?.onTrade?.(t));
  api.onBonded((b) => page?.onBonded?.(b));
  api.onEvent((type, p) => {
    if (type === 'reward') {
      toast(`<b>Reward paid: ${sol(p.amountSol, 3)} SOL</b>${esc(p.agentName)} reached ${esc(p.level)}. <a class="ext" href="https://solscan.io/tx/${esc(p.sig)}" target="_blank" rel="noopener">View tx ↗</a>`);
    }
    if (type === 'levelup') {
      toast(`<b>PROMOTED: ${esc(p.agentName)}</b>${esc(p.from)} → <b>${esc(p.to)}</b> (level ${p.no})${OFFICE_NAMES[p.no] ? `<br>🏢 New office unlocked: <b>${esc(OFFICE_NAMES[p.no])}</b>` : ''}${p.rewardSol > 0 ? `<br>Reward on its way: <b>${sol(p.rewardSol, 3)} SOL</b>` : ''}`, p.avatarSeed);
      page?.onLevelUp?.(p);
    }
    if (type === 'devclaim') page?.onDevClaim?.(p);
    if (type === 'market') page?.onMarket?.(p);
    if (type === 'sale') {
      toast(`<b>🤝 Builder sold: ${esc(p.agentName)}</b>for ${sol(p.priceSol, 3)} SOL on the <a class="ext" href="#/market">Builder Market</a>`, p.avatarSeed);
      page?.onMarket?.(p);
    }
    if (type === 'burn') {
      toast(`<b>🔥 ${p.source === 'dev' ? 'Dev buyback' : 'Buyback'} &amp; burn</b>${esc(p.agentName)} bought ${sol(p.sol, 3)} SOL of the CREW coin and burned ${Math.round(p.tokens).toLocaleString('en')} tokens. <a class="ext" href="#/${p.source === 'dev' ? 'dev-burns' : 'burns'}">See all ${p.source === 'dev' ? 'dev ' : 'builder '}burns</a>`, p.avatarSeed);
      page?.onBurn?.(p);
    }
    if (type === 'skin') {
      toast(`<b>New skin: ${esc(p.skinName)}</b>${esc(p.agentName)} got a new look.`, p.avatarSeed);
    }
    if (type === 'launch') {
      setTimeout(() => {
        const ag = api.snapshot.agents.find((x) => x.id === p.agentId);
        if (ag) toast(`<b>${agentNo(ag.no)} · ${esc(ag.name)} launched</b>$${esc(ag.coin?.ticker || '')} is live on pump.fun`, ag.avatarSeed);
        page?.onLaunch?.();
      }, 3500);
    }
  });

  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('[data-ago]').forEach((n) => { n.textContent = ago(+n.dataset.ago, now); });
    document.querySelectorAll('[data-countdown]').forEach((n) => {
      const s = Math.round((+n.dataset.countdown - now) / 1000);
      n.textContent = s > 0 ? `Next decision in ${s}s` : 'Thinking…';
    });
    document.querySelectorAll('[data-countdown-plain]').forEach((n) => {
      const s = Math.round((+n.dataset.countdownPlain - now) / 1000);
      n.textContent = s > 90 ? `in ${Math.round(s / 60)} min` : s > 0 ? `in ${s}s` : 'now';
    });
  }, 1000);

  document.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-copy]');
    if (c) {
      try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = 'Copied'; }
      catch { c.textContent = 'Select + copy'; }
      setTimeout(() => (c.textContent = 'Copy'), 1400);
      return;
    }
    const row = e.target.closest('[data-go]');
    if (row && !e.target.closest('a,button')) ctx.navigate(row.dataset.go);
  });

  $('#theme-btn').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    store.set('build_theme', next);
    paintThemeBtn();
  });

  // ── contract address chip (set in config.js → site.contractAddress) ──
  const COPY_ICON = '<svg class="ca-copy" viewBox="0 0 8 8" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true"><rect x="0" y="0" width="5" height="1"/><rect x="0" y="0" width="1" height="5"/><rect x="2" y="2" width="6" height="1"/><rect x="2" y="7" width="6" height="1"/><rect x="2" y="2" width="1" height="6"/><rect x="7" y="2" width="1" height="6"/></svg>';
  function paintCA() {
    const ca = api.config?.contractAddress || '';
    const b = $('#ca-chip');
    b.classList.toggle('soon', !ca);
    b.dataset.ca = ca;
    b.title = ca ? `Contract address ${ca} · click to copy` : 'Contract address: coming soon';
    b.setAttribute('aria-label', ca ? `Copy contract address ${ca}` : 'Contract address coming soon');
    b.innerHTML = `<span class="ca-tag">CA</span><span class="ca-val">${ca ? esc(short(ca, 5)) : 'Coming soon'}</span>${ca ? COPY_ICON : ''}`;
  }
  paintCA();
  api.onUpdate(paintCA);
  $('#ca-chip').addEventListener('click', async () => {
    const ca = $('#ca-chip').dataset.ca;
    if (!ca) return;
    try {
      await navigator.clipboard.writeText(ca);
      toast(`<b>Contract address copied</b><span class="mono">${esc(ca)}</span>`);
    } catch {
      window.prompt('Copy the contract address:', ca);
    }
  });

  $('#nav-shill').addEventListener('click', () => shillModal());
  paintWallet();
  restoreWallet();
  route();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div class="wrap"><div class="card"><div class="feed-empty">Crewfi could not start: ${esc(e.message)}</div></div></div>`;
});
