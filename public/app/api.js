// Talks to the VIBER server. The server runs the vibers 24/7 on mainnet;
// the browser only watches and asks the creator's wallet to sign.
async function json(url, opts = {}) {
  const r = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Request failed (' + r.status + ')');
  return body;
}
const post = (url, body) => json(url, { method: 'POST', body: JSON.stringify(body || {}) });

function hub() {
  const sets = { update: new Set(), trade: new Set(), event: new Set(), bonded: new Set() };
  return {
    on: (k, fn) => { sets[k].add(fn); return () => sets[k].delete(fn); },
    emit: (k, ...a) => sets[k].forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }),
  };
}

export async function createApi() {
  const h = hub();
  const first = await json('/api/state');
  const api = {
    config: first.config,
    snapshot: first,
    onUpdate: (fn) => h.on('update', fn),
    onTrade: (fn) => h.on('trade', fn),
    onEvent: (fn) => h.on('event', fn),
    onBonded: (fn) => h.on('bonded', fn),

    getAgent: (id) => json('/api/agents/' + encodeURIComponent(id)).catch((e) => (/not found/i.test(e.message) ? null : Promise.reject(e))),
    blockhash: () => json('/api/blockhash'),

    prepareLaunch: (p) => post('/api/launch/prepare', p),
    setLaunchImage: (id, image) => post(`/api/launch/${id}/image`, { image }),
    confirmFunding: (id, signature) => post(`/api/launch/${id}/funded`, { signature }),

    deposit: (id, signature, paperSol) => post(`/api/agents/${id}/deposit`, { signature, paperSol }),
    withdraw: (id, p) => post(`/api/agents/${id}/withdraw`, p),
    pause: (id, p) => post(`/api/agents/${id}/pause`, p),
    setStrategy: (id, p) => post(`/api/agents/${id}/strategy`, p),
    retry: (id, p) => post(`/api/agents/${id}/retry`, p),
    buySkin: (id, p) => post(`/api/agents/${id}/skin/buy`, p),
    setSkin: (id, p) => post(`/api/agents/${id}/skin`, p),
    holdSkin: (id, p) => post(`/api/agents/${id}/skin/hold`, p),
    quoteSkin: (id, skin) => json(`/api/agents/${encodeURIComponent(id)}/skin/quote?skin=${encodeURIComponent(skin)}`),
    getBurns: (who) => json('/api/burns' + (who ? '?who=' + encodeURIComponent(who) : '')),
    setOffice: (id, p) => post(`/api/agents/${id}/office`, p),
    getCustom: (owner) => json('/api/custom-strategy/' + encodeURIComponent(owner)).then((r) => r.strategy),
    saveCustom: (p) => post('/api/custom-strategy', p),
    promptStrategy: (prompt) => post('/api/custom-strategy/prompt', { prompt }),
    getMarket: (w) => json('/api/market' + (w ? '?wallet=' + encodeURIComponent(w) : '')),
    marketList: (id, p) => post(`/api/agents/${id}/market/list`, p),
    marketDelist: (id, p) => post(`/api/agents/${id}/market/delist`, p),
    marketBuy: (id, p) => post(`/api/agents/${id}/market/buy`, p),
    marketQuote: (id, buyer) => json(`/api/agents/${encodeURIComponent(id)}/market/quote?buyer=${encodeURIComponent(buyer)}`),
    mintNft: (id, p) => post(`/api/agents/${id}/nft/mint`, p),
    xConnect: (id, p) => post(`/api/agents/${id}/x/connect`, p),
    xSettings: (id, p) => post(`/api/agents/${id}/x/settings`, p),
    xDisconnect: (id, p) => post(`/api/agents/${id}/x/disconnect`, p),
    xPost: (id, p) => post(`/api/agents/${id}/x/post`, p),
    // vibe chat: anyone can talk to a viber; its creator signs once to train it
    getChat: (id) => json(`/api/agents/${encodeURIComponent(id)}/chat`),
    chat: (id, p) => post(`/api/agents/${id}/chat`, p),
    chatSession: (id, p) => post(`/api/agents/${id}/chat/session`, p),
  };

  // live stream; background tabs close it after a minute and reopen it when shown again
  let es = null, hideTimer = 0;
  function connect() {
    es = new EventSource('/api/stream');
    es.addEventListener('snapshot', (ev) => {
      const s = JSON.parse(ev.data);
      api.snapshot = { ...api.snapshot, ...s, feed: api.snapshot.feed, bonded: api.snapshot.bonded || [] };
      if (s.config) api.config = s.config;
      h.emit('update', api.snapshot);
    });
    es.addEventListener('trade', (ev) => {
      const t = JSON.parse(ev.data);
      api.snapshot.feed = [t, ...(api.snapshot.feed || [])].slice(0, 60);
      h.emit('trade', t);
    });
    es.addEventListener('bonded', (ev) => {
      const b = JSON.parse(ev.data);
      api.snapshot.bonded = [b, ...(api.snapshot.bonded || []).filter((x) => x.mint !== b.mint)].slice(0, 12);
      h.emit('bonded', b);
    });
    for (const type of ['launch', 'fund', 'fees', 'levelup', 'reward', 'skin', 'burn', 'devclaim', 'market', 'sale', 'chat']) es.addEventListener(type, (ev) => h.emit('event', type, JSON.parse(ev.data)));
  }
  connect();
  document.addEventListener('visibilitychange', () => {
    clearTimeout(hideTimer);
    if (document.hidden) hideTimer = setTimeout(() => { es?.close(); es = null; }, 60_000);
    else if (!es) {
      connect();
      json('/api/state').then((s) => { api.snapshot = { ...api.snapshot, ...s }; if (s.config) api.config = s.config; h.emit('update', api.snapshot); }).catch(() => {});
    }
  });
  return api;
}
