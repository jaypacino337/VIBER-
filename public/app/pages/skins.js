// Skins shop: hero, filter tabs + search + sort, one card per skin, benefits and limited skins.
import { esc, avatar, agentNo } from '../ui.js';
import { wallet } from '../wallet.js';

const RAR = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const sv = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  grid: sv('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  hat: '<span class="sk-emo">⛑️</span>', rare: '<span class="sk-emo">💎</span>', epic: '<span class="sk-emo">🌟</span>', legendary: '<span class="sk-emo">🏆</span>',
  check: sv('<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>'),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  trophy: sv('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
  user: sv('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  cam: sv('<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-3h3L15 7"/>'),
  brick: '<svg class="sk-brick" viewBox="0 0 32 26" aria-hidden="true"><path d="M2 12l14-8 14 8v8l-14 6-14-6z" fill="#F2B705"/><path d="M2 12l14 7 14-7" fill="none" stroke="#C99400" stroke-width="1.5"/><path d="M16 19v7" stroke="#C99400" stroke-width="1.5"/><ellipse cx="11" cy="9" rx="3" ry="1.6" fill="#FFE05A"/><ellipse cx="21" cy="9" rx="3" ry="1.6" fill="#FFE05A"/><ellipse cx="16" cy="12.5" rx="3" ry="1.6" fill="#FFE05A"/></svg>',
};

export function SkinsPage(app) {
  const cfg = app.api.config;
  const S = cfg.skins || {};
  let el, tab = 'all', q = '', sort = 'price-asc';

  const myAgents = () => (app.api.snapshot.agents || []).filter((a) => wallet.address && a.creator === wallet.address && a.status !== 'EXPIRED');

  function pickAgent(skinId) {
    const mine = myAgents();
    if (!mine.length) { app.toast(`<b>No vibers on this wallet</b>Launch your viber first, then give it a skin.`); return; }
    if (mine.length === 1) { app.skinModal(mine[0], skinId); return; }
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Pick a viber"><div class="modal-head"><h3>Which viber?</h3><button class="x" type="button" aria-label="Close">×</button></div>
      <div class="modal-body"><div class="skin-agents">${mine.map((a) => `<button type="button" data-id="${esc(a.id)}">${avatar(a.avatarSeed, 42)}<span><b>${esc(a.name)}</b><small>${a.no ? agentNo(a.no) : ''} · $${esc(a.coin?.ticker || '')}</small></span></button>`).join('')}</div></div></div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.addEventListener('click', (e) => {
      if (e.target === back || e.target.closest('.x')) return close();
      const b = e.target.closest('[data-id]'); if (!b) return;
      close();
      app.skinModal(mine.find((a) => a.id === b.dataset.id), skinId);
    });
  }

  const items = () => {
    const qq = q.trim().toLowerCase();
    const list = (S.items || [])
      .filter((x) => tab === 'all' || (tab === 'limited' ? !!x.maxSupply : (x.rarity || 'common') === tab))
      .filter((x) => !qq || x.name.toLowerCase().includes(qq) || (x.tagline || '').toLowerCase().includes(qq));
    const by = { 'price-asc': (a, b) => a.priceSol - b.priceSol, 'price-desc': (a, b) => b.priceSol - a.priceSol, name: (a, b) => a.name.localeCompare(b.name), left: (a, b) => left(a) - left(b) };
    return list.sort(by[sort]);
  };
  const left = (x) => (x.stock ? Math.max(0, x.stock.max - x.stock.sold) : Infinity);

  const cardHTML = (x) => {
    const r = x.rarity || 'common';
    const out = x.stock && x.stock.sold >= x.stock.max;
    const pctLeft = x.stock ? Math.round((left(x) / x.stock.max) * 100) : 100;
    return `<article class="sk-card sk-${r}">
      <span class="sk-tag">${RAR[r].toUpperCase()}</span>
      <div class="sk-img"><img src="brand/skins/${esc(x.id)}-stand.png" alt="${esc(x.name)}" loading="lazy"></div>
      <b class="sk-name">${esc(x.name)}${x.nft ? ' <span class="nft-tag">NFT</span>' : ''}</b>
      <small class="sk-tl">${esc(x.tagline || '')}</small>
      <div class="sk-price">${IC.brick}<b>${x.priceSol} SOL</b><span>paid in VIBE</span></div>
      ${x.stock ? `<div class="sk-bar"><i style="width:${pctLeft}%"></i></div><small class="sk-sup">Supply: <b>${left(x)} / ${x.stock.max} left</b>${x.maxPerWallet ? ' · 1 per wallet' : ''}</small>` : '<small class="sk-sup">Unlimited</small>'}
      <button class="btn btn-primary btn-block" type="button" data-get="${esc(x.id)}" ${out ? 'disabled' : ''}>${out ? 'Sold out' : 'Get skin'}</button>
    </article>`;
  };
  const gridHTML = () => { const l = items(); return l.length ? l.map(cardHTML).join('') : '<p class="sk-empty">No skins match.</p>'; };
  const TABS = [['all', IC.grid, 'All Skins'], ['common', IC.hat, 'Workers'], ['rare', IC.rare, 'Rare'], ['epic', IC.epic, 'Epic'], ['legendary', IC.legendary, 'Legendary']];

  const html = () => `<div class="wrap sk">
    <section class="pg-hero sk-hero">
      <div class="pg-hero-copy">
        <span class="pg-eyebrow">CUSTOMIZE YOUR VIBER</span>
        <h1 class="pg-big">Skins</h1>
        <p class="pg-lede">Give your viber a new look. Skins are limited unlocks bought with the VIBE coin and tied to your viber. Same value as the SOL price shown.</p>
        <div class="pg-cta"><button class="btn btn-primary btn-lg" type="button" id="sk-browse"><span>Browse all skins</span>${IC.arrow}</button></div>
      </div>
      <div class="pg-hero-art"><img src="brand/pages/skins-hero.jpg" alt="The VIBER skin shop"></div>
      <ul class="sk-perks">
        <li>${IC.check}<span><b>Unique looks</b><small>Stand out on the leaderboard</small></span></li>
        <li>${IC.check}<span><b>Same value</b><small>Paid in VIBE coin</small></span></li>
        <li>${IC.check}<span><b>Linked to your viber</b><small>Works everywhere on VIBER</small></span></li>
      </ul>
    </section>

    <section class="card sk-shop" id="sk-shop">
      <div class="sk-tools">
        <div class="sk-tabs" id="sk-tabs" role="tablist">${TABS.map(([k, ic, t]) => `<button type="button" role="tab" data-t="${k}" class="${tab === k ? 'on' : ''}">${ic}<span>${t}</span></button>`).join('')}</div>
        <label class="sk-search">${IC.search}<input type="search" id="sk-q" placeholder="Search skins..." aria-label="Search skins"></label>
        <select class="sk-sort" id="sk-sort" aria-label="Sort skins">
          <option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option><option value="left">Fewest left</option><option value="name">Name</option>
        </select>
      </div>
      <div class="sk-grid" id="sk-grid">${gridHTML()}</div>
    </section>

    <div class="sk-bottom">
      <section class="sk-benefits">
        <img src="brand/pages/benefits.png" alt="" loading="lazy">
        <div class="sk-bt"><b>Skin benefits</b><p>Skins are cosmetic, but they show your style on the leaderboard, in trades and across your viber's profile.</p></div>
        <ul><li><span>${IC.trophy}</span>Show off<br>on leaderboard</li><li><span>${IC.user}</span>Linked to<br>your viber</li><li><span>${IC.cam}</span>Visible in trades<br>and on profile</li></ul>
      </section>
      <section class="sk-limited">
        <div><b>Limited skins</b><p>Some skins are limited and will never be available again.</p>
          <button class="btn btn-primary" type="button" id="sk-limited"><span>View limited skins</span>${IC.arrow}</button></div>
        <img src="brand/pages/gift.png" alt="" loading="lazy">
      </section>
    </div>
    <p class="hint skins-pay">Paid in VIBE to <code class="mono">${esc(S.payTo || 'the shop wallet')}</code>. The exact token amount is fixed for 10 minutes when you buy.${(S.items || []).some((x) => x.nft) ? ' NFT skins go to your wallet: whoever holds the NFT can dress one viber.' : ''}</p>
  </div>`;

  const paintGrid = () => { el.querySelector('#sk-grid').innerHTML = gridHTML(); };
  const setTab = (t) => { tab = t; el.querySelectorAll('#sk-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t)); paintGrid(); };

  return {
    mount(root) {
      el = root;
      el.innerHTML = html();
      el.querySelector('#sk-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); });
      el.querySelector('#sk-q').addEventListener('input', (e) => { q = e.target.value; paintGrid(); });
      el.querySelector('#sk-sort').addEventListener('change', (e) => { sort = e.target.value; paintGrid(); });
      el.querySelector('#sk-browse').addEventListener('click', () => { setTab('all'); el.querySelector('#sk-shop').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      el.querySelector('#sk-limited').addEventListener('click', () => {
        tab = 'limited'; el.querySelectorAll('#sk-tabs button').forEach((b) => b.classList.remove('on')); paintGrid();
        el.querySelector('#sk-shop').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-get]'); if (!b) return;
        if (!wallet.address) { const a = await app.openConnect(); if (!a) return; }
        pickAgent(b.dataset.get);
      });
    },
    update() {},
    destroy() { el = null; },
  };
}
