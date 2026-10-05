// Launch your viber: appearance (base / skin / hat / outfit / accessories), coin details,
// starting capital and strategy on the left; a live 3D preview, the viber summary and
// what happens next on the right. One SOL transfer launches the coin + viber.
import { robotSVG, robotPNG, robotTraits, robotParts } from '../robot.js';
import { esc, sol, pct, short, STRAT_ICONS, strategyById, strategyRules, stratIcon, stratKey, riskTag, riskWarning } from '../ui.js';
import { wallet, sendSol } from '../wallet.js';
import { createOffice } from '../office3d.js';
import { SKIN_MODELS } from '../skins3d.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const newSeed = () => 'r' + Math.random().toString(36).slice(2, 10);
const PAGE = 5;
const sv = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  prev: sv('<path d="M15 6l-6 6 6 6"/>', 2.6), next: sv('<path d="M9 6l6 6-6 6"/>', 2.6),
  coin: sv('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>'),
  upload: sv('<path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><path d="M12 4v11M7 9l5-5 5 5"/>'),
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  web: sv('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'),
  tg: sv('<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l9-7"/>'),
  sol: sv('<ellipse cx="12" cy="12" rx="8" ry="8"/><path d="M8 9h8M8 12h8M8 15h8"/>'),
  wallet: sv('<path d="M3 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 13.5h2"/>'),
  rocket: sv('<path d="M12 3c3 2 5 6 5 10l-2 3H9l-2-3c0-4 2-8 5-10z"/><circle cx="12" cy="10" r="1.6"/><path d="M9 16l-2 4 3-1M15 16l2 4-3-1"/>'),
  chart: sv('<path d="M4 20V4M4 20h16"/><path d="M7 16l4-5 3 3 5-7"/>'),
  eye: sv('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  shield: sv('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16v.01"/>'),
  info: sv('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 2.4),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  brick: '<svg viewBox="0 0 32 24" aria-hidden="true"><rect x="2" y="8" width="28" height="14" rx="2" fill="currentColor"/><rect x="5" y="3" width="8" height="6" rx="2" fill="currentColor"/><rect x="19" y="3" width="8" height="6" rx="2" fill="currentColor"/></svg>',
};
const RAR = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const GEAR = [['none', 'None'], ['glasses', 'Glasses'], ['headset', 'Headset'], ['beard', 'Beard'], ['headlamp', 'Headlamp'], ['belt', 'Tool belt']];

// find seeds that match the chosen hat / outfit / accessory
function findSeeds(want, n, avoid = new Set()) {
  const out = [];
  for (let i = 0; i < 6000 && out.length < n; i++) {
    const s = newSeed();
    if (avoid.has(s)) continue;
    const t = robotTraits(s), p = robotParts(s);
    if (want.hat && t.hat !== want.hat) continue;
    if (want.outfit && t.outfit !== want.outfit) continue;
    if (want.gear && (want.gear === 'none' ? GEAR.slice(1).some(([k]) => p[k]) : !p[want.gear])) continue;
    out.push(s);
  }
  while (out.length < n) out.push(newSeed());
  return out;
}
// one sample seed for every hat and outfit (cards on the Hat / Outfit tabs)
function catalog() {
  const hats = new Map(), outfits = new Map(), gear = new Map();
  for (let i = 0; i < 3000; i++) {
    const s = 'cat' + i;
    const t = robotTraits(s), p = robotParts(s);
    if (!hats.has(t.hat)) hats.set(t.hat, s);
    if (!outfits.has(t.outfit)) outfits.set(t.outfit, s);
    for (const [k] of GEAR.slice(1)) if (p[k] && !gear.has(k)) gear.set(k, s);
    if (!gear.has('none') && !GEAR.slice(1).some(([k]) => p[k])) gear.set('none', s);
  }
  return { hats: [...hats], outfits: [...outfits], gear: GEAR.filter(([k]) => gear.has(k)).map(([k, label]) => [k, label, gear.get(k)]) };
}

export function LaunchPage(app) {
  const cfg = app.api.config;
  const skins = cfg.skins?.enabled ? (cfg.skins.items || []) : [];
  const CAT = catalog();
  let tab = 'base';
  const want = { hat: null, outfit: null, gear: null };
  let pages = [findSeeds(want, PAGE)], pageNo = 0;
  const f = {
    image: null, name: '', ticker: '', description: '', twitter: '', website: '', telegram: '', agentName: '', vibe: '',
    capital: cfg.launch.defaultStartingCapital, botSeed: pages[0][2], skin: null,
    strategy: (() => { const w = new URLSearchParams(location.hash.split('?')[1] || '').get('s'); return w && (cfg.strategies || []).some((x) => x.id === w && x.risk !== 'extreme') ? w : cfg.defaultStrategy || 'classic'; })(),
  };
  let el, mine = null, preview = null, previewKey = '', pvState = 'idle';

  const total = () => Math.round(((Number(f.capital) || 0) + cfg.launch.launchReserveSol) * 10000) / 10000;
  const curStrat = () => strategyById(cfg, f.strategy, [mine]);
  const needsAck = () => curStrat()?.risk === 'extreme';
  const skinOf = (id) => skins.find((x) => x.id === id) || null;
  const rarity = () => (f.skin ? skinOf(f.skin)?.rarity || 'common' : 'common');

  // ── 1. appearance ──
  const card = (on, data, img, title, sub) => `<button type="button" class="bb-pick${on ? ' on' : ''}" ${data}><span class="bb-pick-img">${img}</span><b>${esc(title)}</b><small>${esc(sub)}</small></button>`;
  const cardsHTML = () => {
    if (tab === 'base') return pages[pageNo].map((s, i) => { const t = robotTraits(s); return card(s === f.botSeed && !f.skin, `data-seed="${s}"`, robotSVG(s, { stand: true }), i === 2 && pageNo === 0 ? 'Default' : t.outfit, t.hat); }).join('');
    if (tab === 'skin') return [card(!f.skin, 'data-skin=""', robotSVG(f.botSeed, { stand: true }), 'Your viber', 'Common'), ...skins.map((x) => card(f.skin === x.id, `data-skin="${esc(x.id)}"`, `<img src="brand/skins/${esc(x.id)}-stand.png" alt="">`, x.name, RAR[x.rarity || 'common']))].join('');
    if (tab === 'hat') return [card(!want.hat, 'data-hat=""', robotSVG(f.botSeed, { stand: true }), 'Any hat', 'Random'), ...CAT.hats.map(([h, s]) => card(want.hat === h, `data-hat="${esc(h)}"`, robotSVG(s, { stand: true }), h, 'Hat'))].join('');
    if (tab === 'outfit') return [card(!want.outfit, 'data-outfit=""', robotSVG(f.botSeed, { stand: true }), 'Any outfit', 'Random'), ...CAT.outfits.map(([o, s]) => card(want.outfit === o, `data-outfit="${esc(o)}"`, robotSVG(s, { stand: true }), o, 'Outfit'))].join('');
    return [card(!want.gear, 'data-gear=""', robotSVG(f.botSeed, { stand: true }), 'Any', 'Random'), ...CAT.gear.map(([k, label, s]) => card(want.gear === k, `data-gear="${k}"`, robotSVG(s, { stand: true }), label, 'Accessory'))].join('');
  };
  const appearanceNote = () => tab === 'skin'
    ? (f.skin ? `<b>${esc(skinOf(f.skin)?.name || '')}</b> is a paid skin (${skinOf(f.skin)?.priceSol} SOL in VIBE). You buy it for your viber right after launch, from its page or the Skins page. Your coin logo stays your viber.` : 'Paid skins are bought after launch, from the viber page or the Skins page.')
    : (() => { const t = robotTraits(f.botSeed); return `<b>${esc(t.outfit)}</b> · ${esc(t.hair)} · ${esc(t.gear || 'no gear')}. It becomes your viber and, unless you upload a logo, your coin logo.`; })();

  // ── 4. strategy ──
  const stratList = () => (cfg.strategies || []).map((st) => `<button type="button" class="bb-sitem strat-${esc(stratKey(st))}${st.id === f.strategy ? ' on' : ''}" data-s="${esc(st.id)}"><span class="so-ic">${stratIcon(st)}</span><span><b>${esc(st.name.replace(' (New Pairs)', ''))}${st.risk === 'extreme' ? ' (New Pairs)' : ''}</b><small>${esc(st.risk === 'extreme' ? 'High risk · early trades' : st.tagline)}</small></span></button>`).join('')
    + (cfg.customEnabled === false ? '' : mine
      ? `<button type="button" class="bb-sitem strat-custom${f.strategy === mine.id ? ' on' : ''}" data-s="${esc(mine.id)}"><span class="so-ic">${STRAT_ICONS.custom}</span><span><b>${esc(mine.name)}</b><small>Your custom strategy · <u data-edit="1">edit</u></small></span></button>`
      : `<button type="button" class="bb-sitem strat-custom" data-build="1"><span class="so-ic">${STRAT_ICONS.custom}</span><span><b>Custom</b><small>Set your own rules</small></span></button>`);
  const bars = (seed) => { let x = 0, out = ''; for (let i = 0; i < 34; i++) { x = (Math.sin(i * 1.7 + seed) + Math.sin(i * 0.45 + seed * 2) + 2) / 4; const h = 8 + Math.round((x * 0.6 + (i / 34) * 0.4) * 52); out += `<i style="height:${h}px;opacity:${0.35 + (i / 34) * 0.65}"></i>`; } return out; };
  const stratInfoHTML = () => {
    const st = curStrat(); if (!st) return '';
    const R = Object.fromEntries(strategyRules(st));
    return `<div class="bb-sd-head"><span class="bb-sd-ic">${IC.chart}</span><div><b>${esc(st.name)}</b><small>${esc(st.custom ? 'Your own strategy.' : st.tagline + ' strategy.')}</small></div>${st.id === (cfg.defaultStrategy || 'classic') ? '<span class="bb-pop">POPULAR</span>' : riskTag(st)}</div>
      <div class="bb-bars" aria-hidden="true">${bars(st.id.length)}</div>
      <div class="bb-sd-nums"><div><b>${Math.round(st.sizePct * 100)}%</b><small>Per trade</small></div><div><b>${pct(st.takeProfitPct, 0)} / ${pct(st.stopLossPct, 0)}</b><small>Take profit / stop</small></div><div><b>${esc(R['Trailing stop'] || (st.trail ? 'on' : 'none'))}</b><small>Trailing stop</small></div><div><b>${st.cooldownMin ? st.cooldownMin + ' min' : st.maxHoldMin ? st.maxHoldMin + ' min' : 'none'}</b><small>${st.cooldownMin ? 'Cooldown' : 'Max hold'}</small></div></div>
      <p class="bb-sd-note"><span>${IC.info}</span>${esc(st.goal)}</p>
      ${riskWarning(st, { checkbox: true, checked: f.riskAck })}`;
  };

  // ── right column ──
  const summaryHTML = () => {
    const st = curStrat();
    const r = rarity();
    const row = (ic, k, v) => `<div class="bb-row"><span class="bb-ri">${ic}</span><span class="bb-rk">${k}</span><span class="bb-rv">${v}</span></div>`;
    return `<div class="bb-who"><span class="av av-56">${f.skin ? `<img src="brand/skins/${esc(f.skin)}-bust.png" alt="">` : robotSVG(f.botSeed)}</span><b>${esc(f.agentName || 'Your viber')}</b><span class="bb-chip bb-${r}">${RAR[r]}</span><span class="bb-chip bb-lv">Level 1</span></div>
      ${row(IC.brick, 'Coin name', esc(f.name || '–'))}
      ${row(IC.brick, 'Ticker', f.ticker ? '$' + esc(f.ticker) : '–')}
      ${row(IC.brick, 'Description', esc(f.description ? (f.description.length > 40 ? f.description.slice(0, 40) + '…' : f.description) : '–'))}
      ${row(IC.brick, 'Starting capital', `${sol(Number(f.capital) || 0, 3)} SOL`)}
      ${row(IC.brick, 'You send', `<b>${sol(total(), 4)} SOL</b>`)}
      ${row(IC.brick, 'Strategy', esc(st?.name || ''))}
      ${row(IC.brick, 'Socials', [f.twitter && IC.x, (f.website || cfg.siteUrl) && IC.web, f.telegram && IC.tg].filter(Boolean).join('') || '–')}`;
  };

  function html() {
    const off = !cfg.launchEnabled;
    return `<div class="wrap bb">
      <section class="pg-hero bb-hero">
        <div class="pg-hero-copy">
          <h1 class="pg-big">Build your<br><em>viber</em></h1>
          <p class="pg-lede">Give it a coin, a look and a job. Your coin launches on pump.fun and your viber gets its own Solana wallet. It trades with the strategy you pick, 24/7 and in public.</p>
        </div>
        <div class="pg-hero-art"><img src="brand/pages/launch-hero.jpg" alt="Create, customize, launch"></div>
      </section>
      ${off ? `<div class="card" style="padding:14px 18px"><b class="down">Launching is switched off on this server.</b> <span class="muted">The operator needs to add PINATA_JWT to the server's .env.</span></div>` : ''}
      <div class="bb-grid">
        <form class="bb-form" id="l-form" novalidate>
          <section class="card bb-sec">
            <h2><span class="bb-num">1</span>Appearance</h2>
            <div class="bb-tabs" id="bb-tabs">${[['base', 'Base'], ['skin', 'Skin'], ['hat', 'Hat'], ['outfit', 'Outfit'], ['gear', 'Accessories']].filter(([k]) => k !== 'skin' || skins.length).map(([k, t]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'on' : ''}">${k === 'skin' ? IC.brick : ''}${t}</button>`).join('')}</div>
            <div class="bb-carousel"><button type="button" class="bb-arrow" id="bb-prev" aria-label="Previous">${IC.prev}</button><div class="bb-cards" id="bb-cards">${cardsHTML()}</div><button type="button" class="bb-arrow" id="bb-next" aria-label="More">${IC.next}</button></div>
            <p class="bb-note" id="bb-note">${appearanceNote()}</p>
            <div class="row2">
              ${field('l-agent', 'Viber name', `<input class="input" id="l-agent" maxlength="24" placeholder="e.g. Viber OG" autocomplete="off">`)}
              ${field('l-vibe', 'Its vibe (optional)', `<textarea class="input" id="l-vibe" maxlength="400" rows="2" placeholder="Who is it? e.g. a calm surfer who buys dips and explains every trade like a beach report"></textarea>`)}
              <div class="field"><label>Coin logo</label><div class="bb-logo-row"><span class="av av-42" id="l-logo">${logoHTML()}</span><span class="hint">Logo: <span id="l-logo-src">your viber</span> <button type="button" class="copy" id="l-logo-reset" hidden>Use my viber</button></span></div></div>
            </div>
          </section>

          <section class="card bb-sec">
            <h2><span class="bb-num">2</span>Coin details</h2>
            <div class="row2">
              ${field('l-name', 'Coin name', `<div class="input-affix"><span class="pre">${IC.coin}</span><input class="input" id="l-name" maxlength="32" placeholder="e.g. James Bond" autocomplete="off"></div>`)}
              ${field('l-ticker', 'Ticker', `<input class="input" id="l-ticker" maxlength="10" placeholder="BOND" autocomplete="off" style="text-transform:uppercase">`)}
            </div>
            ${field('l-desc', 'Description', `<div class="bb-count-wrap"><textarea class="textarea" id="l-desc" maxlength="280" placeholder="What is this coin about? (optional)"></textarea><span class="bb-count" id="l-desc-n">0/280</span></div>`)}
            <div class="bb-row2">
              <div class="field"><label>Logo (optional)</label><label class="bb-upload" for="l-image">${IC.upload}<span><b>Upload image</b><small>PNG, JPG or GIF up to 1MB</small></span></label><input id="l-image" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="sr"><div class="err" id="l-image-err" hidden></div></div>
              <div class="field"><label>Socials (optional)</label>
                <div class="input-affix"><span class="pre">${IC.x}</span><input class="input" id="l-tw" maxlength="120" placeholder="https://x.com/..." autocomplete="off"></div>
                <div class="bb-row2 tight">
                  ${cfg.siteUrl ? `<div class="input-affix"><span class="pre">${IC.web}</span><div class="input locked" id="l-web" title="Set automatically: links your coin to its viber here">${esc(cfg.siteUrl.replace(/^https?:\/\//, ''))}/viber/…</div></div>` : `<div class="input-affix"><span class="pre">${IC.web}</span><input class="input" id="l-web" maxlength="160" placeholder="https://..." autocomplete="off"></div>`}
                  <div class="input-affix"><span class="pre">${IC.tg}</span><input class="input" id="l-tg" maxlength="120" placeholder="https://t.me/..." autocomplete="off"></div>
                </div>
              </div>
            </div>
          </section>

          <section class="card bb-sec">
            <h2><span class="bb-num">3</span>Starting capital</h2>
            <div class="bb-caps" id="l-presets">${cfg.launch.capitalPresets.map((v) => `<button type="button" data-v="${v}" class="${v === Number(f.capital) ? 'on' : ''}"><span class="bb-solic">${IC.sol}</span>${v} SOL</button>`).join('')}
              <div class="bb-capin input-affix suf"><input class="input" id="l-cap" type="number" step="0.01" min="${cfg.launch.minStartingCapital}" ${cfg.launch.maxStartingCapital ? `max="${cfg.launch.maxStartingCapital}"` : ''} value="${f.capital}" inputmode="decimal" aria-label="Custom amount"><span class="suf-t">SOL</span></div></div>
            <div class="err" id="l-cap-err" hidden></div>
            <p class="hint">This will be sent from your wallet to the viber's wallet to launch the coin and start trading (+ ${cfg.launch.launchReserveSol} SOL launch reserve). Minimum ${cfg.launch.minStartingCapital} SOL. <b>Real SOL.</b></p>
          </section>

          <section class="card bb-sec">
            <h2><span class="bb-num">4</span>Strategy</h2>
            <div class="bb-strat">
              <div class="bb-slist" id="l-strat" role="radiogroup" aria-label="Trading strategy">${stratList()}</div>
              <div class="bb-sdetail" id="l-strat-info">${stratInfoHTML()}</div>
            </div>
          </section>

          <button class="btn btn-primary btn-lg btn-block bb-go" type="submit" id="l-submit" ${off ? 'disabled' : ''}>${IC.rocket}<span>Build it – Launch coin + viber</span>${IC.arrow}</button>
          <p class="note" style="text-align:center" id="l-from">${fromHTML()}</p>
        </form>

        <aside class="bb-side">
          <section class="card bb-pv">
            <header class="card-head"><h2><span class="bb-dot">${IC.brick}</span>Live preview</h2><span class="live-dot">Live</span></header>
            <div class="bb-stage office" id="bb-stage"></div>
            <div class="bb-states" id="bb-states">${[['idle', 'Idle'], ['work', 'Trading'], ['party', 'Celebration']].map(([k, t]) => `<button type="button" data-st="${k}" class="${pvState === k ? 'on' : ''}">${t}</button>`).join('')}</div>
          </section>
          <section class="card bb-sum">
            <header class="card-head"><h2>Viber summary</h2><button type="button" class="btn btn-sm" id="bb-edit">${IC.edit}<span>Edit</span></button></header>
            <div id="l-preview">${summaryHTML()}</div>
          </section>
          <section class="card bb-next">
            <header class="card-head"><h2>What happens next?</h2></header>
            <ol>
              <li><span class="bb-num">1</span><span class="bb-nic">${IC.wallet}</span><span><b>You send the starting capital</b><small>We create the viber's wallet, you send ${sol(total(), 4)} SOL to it.</small></span></li>
              <li><span class="bb-num">2</span><span class="bb-nic">${IC.rocket}</span><span><b>Viber launches the coin</b><small>Your coin goes live on pump.fun, the viber is its creator.</small></span></li>
              <li><span class="bb-num">3</span><span class="bb-nic">${IC.chart}</span><span><b>Viber starts trading</b><small>Follows your chosen strategy 24/7 and explains every move.</small></span></li>
              <li><span class="bb-num">4</span><span class="bb-nic">${IC.eye}</span><span><b>You can watch everything</b><small>All trades, PnL and activity are public on-chain. Pause or withdraw any time.</small></span></li>
            </ol>
          </section>
          <section class="bb-risk"><span>${IC.shield}</span><div><b>Risk: high volatility</b><p>Meme coins are extremely volatile. The viber can lose some or all of its SOL. Only send what you can afford to lose.</p></div></section>
        </aside>
      </div>
    </div>`;
  }

  const field = (id, label, input, hint = '') => `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err" id="${id}-err" hidden></div></div>`;
  function logoHTML() { return f.image ? `<img src="${f.image}" alt="Coin logo">` : robotSVG(f.botSeed); }
  function fromHTML() { return wallet.address ? 'Launching from <b>' + esc(short(wallet.address, 4)) + '</b>' + (wallet.name ? ' (' + esc(wallet.name) + ')' : '') : 'You will connect your wallet and approve one SOL transfer.'; }

  const q = (s) => el.querySelector(s);
  const refresh = () => { q('#l-preview').innerHTML = summaryHTML(); };

  // live 3D preview: the chosen viber (or skin) alone at its desk
  function mountPreview() {
    const key = f.skin ? 'skin:' + f.skin : f.botSeed;
    const stage = q('#bb-stage');
    if (preview && key === previewKey) return applyState();
    preview?.destroy(); preview = null; previewKey = key;
    stage.innerHTML = '';
    try {
      const model = f.skin && SKIN_MODELS[f.skin] ? SKIN_MODELS[f.skin]() : null;
      preview = createOffice(stage, { level: 2, agent: { model, spec: model ? null : robotParts(f.botSeed).spec, ...stateObj() } });
      applyState();
    } catch { stage.innerHTML = `<div class="bb-flat">${f.skin ? `<img src="brand/skins/${esc(f.skin)}-stand.png" alt="">` : robotSVG(f.botSeed, { stand: true })}</div>`; }
  }
  const stateObj = () => ({ state: pvState === 'idle' ? 'idle' : 'work', title: f.agentName || 'Your viber', sub: pvState === 'idle' ? 'On-chain, 24/7' : pvState === 'party' ? 'First profit!' : (curStrat()?.name || '') + ' · trading' });
  function applyState() { preview?.setAgent?.(stateObj()); if (pvState === 'party') preview?.celebrate?.('launch'); }

  const paintCards = () => { q('#bb-cards').innerHTML = cardsHTML(); q('#bb-note').innerHTML = appearanceNote(); };
  const paintBot = () => {
    paintCards();
    q('#l-logo').innerHTML = logoHTML();
    q('#l-logo-src').textContent = f.image ? 'your upload' : 'your viber';
    q('#l-logo-reset').hidden = !f.image;
    refresh(); mountPreview();
  };
  const reseed = () => { pages = [findSeeds(want, PAGE)]; pageNo = 0; f.botSeed = pages[0][0]; f.skin = null; };
  const setErr = (id, msg) => { const e = q('#' + id + '-err'); if (!e) return; e.hidden = !msg; e.textContent = msg || ''; };

  function validate() {
    let ok = true;
    const need = (id, cond, msg) => { setErr(id, cond ? '' : msg); if (!cond) ok = false; };
    need('l-name', f.name.trim().length >= 1, 'Give your coin a name.');
    need('l-ticker', /^[A-Z0-9]{2,10}$/.test(f.ticker), 'Ticker must be 2–10 letters or numbers.');
    need('l-agent', f.agentName.trim().length >= 1, 'Give your viber a name.');
    const c = Number(f.capital);
    const max = cfg.launch.maxStartingCapital;
    need('l-cap', c >= cfg.launch.minStartingCapital && (!max || c <= max), `Enter at least ${cfg.launch.minStartingCapital} SOL${max ? ` and at most ${max} SOL` : ''}.`);
    if (needsAck() && !f.riskAck) {
      ok = false;
      const box = el.querySelector('#l-strat-info .risk-warn');
      if (box) { box.classList.add('shake'); setTimeout(() => box.classList.remove('shake'), 600); box.querySelector('.risk-ok')?.classList.add('need'); }
    }
    return ok;
  }

  async function onImage(file) {
    setErr('l-image', '');
    if (!file) return;
    if (file.size > 1024 * 1024) return setErr('l-image', 'That image is over 1 MB. Pick a smaller one.');
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = new Image();
    img.onload = () => {
      const s = 512, c = document.createElement('canvas');
      c.width = s; c.height = s;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
      f.image = c.toDataURL('image/png');
      if (f.image.length > 1_300_000) f.image = c.toDataURL('image/jpeg', 0.9);
      paintBot();
    };
    img.onerror = () => setErr('l-image', 'Could not read that image. Try a PNG or JPG.');
    img.src = url;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) { el.querySelector('.err:not([hidden]), .risk-ok.need')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const capital = Number(f.capital);
    const steps = ['Connect wallet', 'Create viber + viber wallet', `Send ${sol(total(), 4)} SOL to the viber`, 'Confirm the transfer on-chain', 'Upload coin image + metadata', 'Create the coin on pump.fun', 'Viber is live'];
    const prog = app.progressModal('Launching $' + f.ticker, steps);
    let prep = null;
    try {
      prog.step(0);
      if (!wallet.address) {
        const addr = await app.openConnect();
        if (!addr) { prog.fail(0, 'Your wallet is not connected.'); return; }
      }
      prog.step(1);
      prep = await app.api.prepareLaunch({
        creator: wallet.address,
        coin: { name: f.name.trim(), ticker: f.ticker, description: f.description.trim(), twitter: f.twitter.trim(), website: f.website.trim(), telegram: f.telegram.trim() },
        agentName: f.agentName.trim(),
        vibe: f.vibe.trim(),
        startingCapital: capital,
        image: f.image || robotPNG(f.botSeed),
        avatarSeed: f.botSeed,
        strategy: f.strategy,
        riskAck: needsAck() ? f.riskAck === true : undefined,
      });

      prog.step(2);
      const paper = cfg.mode === 'paper';
      if (paper) prog.note('<p><b>Paper mode:</b> no SOL leaves your wallet. The viber starts with simulated SOL.</p>');
      else prog.note(`<p>Your viber's wallet: <code class="mono">${esc(prep.wallet)}</code></p>
        <p>Send <b>${sol(prep.requiredSol, 4)} SOL</b>: ${sol(capital, 3)} SOL starting capital + ${sol(cfg.launch.launchReserveSol, 3)} SOL launch reserve.</p>`);
      if (!paper) await prog.ask(`Send ${sol(prep.requiredSol, 4)} SOL with ${wallet.name || 'your wallet'}`);
      let signature = 'paper';
      if (!paper) try {
        signature = await sendSol(prep.wallet, prep.requiredSol, app.api.blockhash);
      } catch (err) {
        prog.fail(2, (err.message || 'Transfer was rejected in the wallet.') + ' Nothing was sent. You can also send the SOL to the wallet above within 30 minutes and the launch continues automatically.');
        return;
      }
      if (!paper) prog.note(`<p>Transfer sent: <a class="ext mono" href="https://solscan.io/tx/${esc(signature)}" target="_blank" rel="noopener">${esc(short(signature, 6))} ↗</a></p>`);

      prog.step(3);
      let r = await app.api.confirmFunding(prep.agentId, signature);
      // wait for the server to launch the coin
      const start = Date.now();
      let d = null;
      while (Date.now() - start < 4 * 60_000) {
        d = await app.api.getAgent(prep.agentId).catch(() => null);
        const st = d?.rawStatus;
        if (st === 'AWAITING_FUNDS') { prog.step(3); if (Date.now() - start > 30000) r = await app.api.confirmFunding(prep.agentId, signature).catch(() => r); }
        else if (st === 'LAUNCHING') prog.step(d.coin?.uri ? 5 : 4);
        else if (st === 'ACTIVE') break;
        else if (st === 'LAUNCH_FAILED') throw new Error('Coin creation failed: ' + (d.error || 'unknown error') + '. Your SOL is safe in the viber wallet: open the viber page to retry or withdraw.');
        await sleep(2500);
      }
      if (d?.rawStatus !== 'ACTIVE') {
        prog.failCurrent('This is taking longer than usual. The server keeps trying; check the viber page in a minute.');
        prog.link('Open viber page', () => app.navigate('#/viber/' + (d?.no || prep.agentId)));
        return;
      }
      prog.step(steps.length);
      if (paper) prog.note('<p>Paper coin: simulated, not on pump.fun.</p>');
      else prog.note(`<p>Coin: <a class="ext" href="https://pump.fun/coin/${esc(d.coin.mint)}" target="_blank" rel="noopener">view on pump.fun ↗</a> · <a class="ext" href="https://solscan.io/tx/${esc(d.coin.launchSig)}" target="_blank" rel="noopener">launch tx ↗</a></p>`);
      if (f.skin) prog.note(`<p>Want the <b>${esc(skinOf(f.skin)?.name || '')}</b> look? Open the viber page and tap <b>Skins</b>.</p>`);
      prog.done(`Viber ${String(d.no).padStart(3, '0')} is live`, () => app.navigate('#/viber/' + d.no));
    } catch (err) {
      prog.failCurrent(err.message || 'Launch failed.');
      if (prep) prog.link('Open viber page', () => app.navigate('#/viber/' + prep.agentId));
    }
  }


  function paintStrat() {
    if (!el) return;
    q('#l-strat').innerHTML = stratList();
    q('#l-strat-info').innerHTML = stratInfoHTML();
    refresh(); applyState();
  }
  function loadMine() {
    const addr = wallet.address;
    if (!addr || cfg.customEnabled === false) { if (mine) { if (f.strategy === mine.id) f.strategy = cfg.defaultStrategy || 'classic'; mine = null; paintStrat(); } return; }
    app.api.getCustom(addr).then((c) => {
      if (wallet.address !== addr) return;
      if (mine && f.strategy === mine.id && !c) f.strategy = cfg.defaultStrategy || 'classic';
      mine = c; paintStrat();
    }).catch(() => {});
  }

  return {
    mount(root) {
      el = root;
      el.innerHTML = html();
      loadMine();
      mountPreview();
      const bindText = (id, key, fn = (v) => v) => q(id)?.addEventListener('input', (e) => { f[key] = fn(e.target.value); setErr(id.slice(1), ''); refresh(); if (key === 'agentName') applyState(); });
      bindText('#l-name', 'name');
      bindText('#l-ticker', 'ticker', (v) => v.replace(/[^a-z0-9]/gi, '').toUpperCase());
      bindText('#l-desc', 'description');
      bindText('#l-tw', 'twitter');
      bindText('#l-web', 'website');
      bindText('#l-tg', 'telegram');
      bindText('#l-agent', 'agentName');
      bindText('#l-vibe', 'vibe');
      q('#l-desc').addEventListener('input', (e) => { q('#l-desc-n').textContent = e.target.value.length + '/280'; });
      q('#l-ticker').addEventListener('blur', (e) => { e.target.value = f.ticker; });
      q('#l-cap').addEventListener('input', (e) => {
        f.capital = e.target.value; setErr('l-cap', '');
        el.querySelectorAll('#l-presets button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === Number(f.capital)));
        refresh();
      });
      q('#l-presets').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-v]'); if (!b) return;
        f.capital = Number(b.dataset.v); q('#l-cap').value = f.capital; setErr('l-cap', '');
        el.querySelectorAll('#l-presets button').forEach((x) => x.classList.toggle('on', x === b));
        refresh();
      });
      q('#l-image').addEventListener('change', (e) => onImage(e.target.files[0]));
      q('#l-logo-reset').addEventListener('click', () => { f.image = null; q('#l-image').value = ''; paintBot(); });
      // appearance
      q('#bb-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab]'); if (!b) return;
        tab = b.dataset.tab;
        el.querySelectorAll('#bb-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        paintCards();
      });
      q('#bb-cards').addEventListener('click', (e) => {
        const b = e.target.closest('.bb-pick'); if (!b) return;
        const d = b.dataset;
        if (d.seed != null) { f.botSeed = d.seed; f.skin = null; }
        else if (d.skin != null) f.skin = d.skin || null;
        else if (d.hat != null) { want.hat = d.hat || null; reseed(); }
        else if (d.outfit != null) { want.outfit = d.outfit || null; reseed(); }
        else if (d.gear != null) { want.gear = d.gear || null; reseed(); }
        paintBot();
      });
      const page = (dir) => {
        if (tab !== 'base') { const box = q('#bb-cards'); box.scrollBy({ left: dir * box.clientWidth * 0.8, behavior: 'smooth' }); return; }
        pageNo += dir;
        if (pageNo < 0) pageNo = 0;
        if (pageNo >= pages.length) pages.push(findSeeds(want, PAGE));
        paintCards();
      };
      q('#bb-prev').addEventListener('click', () => page(-1));
      q('#bb-next').addEventListener('click', () => page(1));
      // preview states
      q('#bb-states').addEventListener('click', (e) => {
        const b = e.target.closest('[data-st]'); if (!b) return;
        pvState = b.dataset.st;
        el.querySelectorAll('#bb-states button').forEach((x) => x.classList.toggle('on', x === b));
        applyState();
      });
      q('#bb-edit').addEventListener('click', () => q('#l-form').scrollIntoView({ behavior: 'smooth', block: 'start' }));
      // strategy
      q('#l-strat').addEventListener('click', (e) => {
        const b = e.target.closest('.bb-sitem'); if (!b) return;
        if (b.dataset.build || e.target.closest('[data-edit]')) {
          app.strategyBuilder({ existing: mine || undefined, onSaved: (st) => { mine = st; f.strategy = st.id; paintStrat(); } });
          return;
        }
        if (f.strategy !== b.dataset.s) f.riskAck = false;
        f.strategy = b.dataset.s;
        paintStrat();
      });
      q('#l-strat-info').addEventListener('change', (e) => {
        if (!e.target.matches('[data-risk-ok]')) return;
        f.riskAck = e.target.checked;
        e.target.closest('.risk-ok')?.classList.remove('need');
      });
      q('#l-form').addEventListener('submit', submit);
    },
    onWallet() { loadMine(); if (el) q('#l-from').innerHTML = fromHTML(); },
    update() {},
    destroy() { preview?.destroy(); preview = null; el = null; },
  };
}
