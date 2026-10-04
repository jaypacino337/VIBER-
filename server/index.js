// VIBER server: serves the site from public/ and the /api the page talks to.
// Start: `npm start` (paper mode) or `MODE=live npm start` (real SOL; see README).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PORT, CONFIG, SITE, LIVE, MODE, DATA_DIR } from './config.js';
import { db, save, flush } from './store.js';
import * as E from './engine.js';
import * as chain from './chain.js';
import * as market from './market.js';
import { checkAction, HttpError } from './auth.js';
import { RISK_ACK, isExtreme } from '../public/shared/risk-ack.js';
import { sanitize, cleanName, riskReasons, settingsLine, CUSTOM_RISK_ACK, CUSTOM_PREFIX, defaultsFor, CUSTOM_BASES } from '../public/shared/custom-strategy.js';
import { readPrompt } from './prompt.js';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webp': 'image/webp' };

// ------------------------------------------------------------------ config sent to the page
function publicConfig() {
  const skinsOn = Boolean(SITE.tokenMint && SITE.treasury);
  const strategies = CONFIG.strategies.filter((s) => s.id !== 'newpairs'); // needs a new-pair safety feed this server does not have yet
  return {
    mode: MODE,
    tradingEnabled: CONFIG.tradingEnabled,
    launchEnabled: CONFIG.launchEnabled,
    brain: CONFIG.brain,
    launch: CONFIG.launch,
    fees: CONFIG.fees,
    trading: CONFIG.trading,
    filters: CONFIG.filters,
    levels: CONFIG.levels,
    rewards: { enabled: false, payTo: 'creator', wallet: null, balanceSol: 0, paidSol: 0, pending: 0, recent: [] },
    defaultStrategy: CONFIG.defaultStrategy,
    strategies,
    customStrategies: Object.values(db.customStrategies).map(E.publicCustom),
    customEnabled: true,
    promptAi: false,
    skins: {
      enabled: skinsOn,
      payTo: SITE.treasury,
      payWith: { symbol: SITE.tokenSymbol, mint: SITE.tokenMint, tokenPriceSol: market.getToken(SITE.tokenMint || '')?.priceSol || 0, burn: false, burnPct: 0 },
      items: CONFIG.skinItems.map((s) => ({ ...s, stock: s.maxSupply ? stockOf(s) : null, nft: null })),
    },
    flywheel: { enabled: false },
    // The tokens page reads its filter labels from here (see API_CONTRACT §6.2), so they are mirrored.
    market: { enabled: false, payTo: SITE.treasury, payWith: SITE.tokenSymbol, mint: SITE.tokenMint, tokenPriceSol: 0, feePct: 0.05, minPriceSol: 0.05, maxPriceSol: 1000, maxWalletSol: 0.01, listed: 0, sold: 0, volumeSol: 0, ...CONFIG.filters },
    agentNft: { enabled: false, collection: null, minted: 0, royaltyBps: 500 },
    xPosting: { enabled: false },
    siteUrl: SITE.url,
    contractAddress: SITE.tokenMint,
    xUrl: SITE.xUrl,
  };
}

function stockOf(s) {
  const sold = db.skinSales.filter((x) => x.skin === s.id).length;
  const held = Object.values(db.skinHolds || {}).filter((h) => h.skin === s.id && h.until > Date.now()).length;
  return { max: s.maxSupply, sold, held, left: Math.max(0, s.maxSupply - sold - held) };
}

function snapshot(full = true) {
  const s = {
    now: Date.now(),
    stats: E.statsView(),
    agents: Object.values(db.agents).map(E.listView),
    coins: E.coinsView(),
    tokens: E.tokensView(),
    thoughts: db.thoughts,
    thinking: E.thinkingCount(),
  };
  if (full) Object.assign(s, { feed: db.feed.slice(0, 60), flywheel: burnsView().flywheelSnap, bonded: market.getBonded(), config: publicConfig() });
  return s;
}

function burnsView() {
  const z = { totalSol: 0, totalTokens: 0, count: 0, queuedSol: 0 };
  const agentsZ = { ...z, skinTokens: 0, skinBurns: 0 };
  return {
    flywheelSnap: { enabled: false, mint: null, pct: 0, ...z, recent: [], agents: agentsZ, dev: { enabled: false } },
    api: { enabled: false, mint: null, pct: 0, ...z, recent: [], agents: agentsZ, dev: { enabled: false, burns: 0, claims: [] }, burns: [] },
  };
}

// ------------------------------------------------------------------ SSE
const clients = new Set();
function sse(res, type, data) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
E.subscribe((type, data) => { for (const c of clients) sse(c, type, data); });
setInterval(() => {
  if (!clients.size) return;
  const s = snapshot(false);
  for (const c of clients) sse(c, 'snapshot', s);
}, 3000);
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 20000);

// ------------------------------------------------------------------ helpers
const send = (res, status, obj) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
};

async function readBody(req) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > 4_000_000) throw new HttpError(413, 'Request too large (images must be under 3 MB).');
    chunks.push(c);
  }
  if (!n) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Bad JSON.'); }
}

function agentOr404(id) {
  const a = E.getAgentRaw(decodeURIComponent(id));
  if (!a) throw new HttpError(404, 'Agent not found');
  return a;
}
const creatorAction = (a, b, action, extras = []) => checkAction(b, { action, viber: a.wallet, extras, signer: a.creator });
const off = (what) => { throw new HttpError(400, what); };

// ------------------------------------------------------------------ routes
const routes = [];
const route = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/api/state', () => snapshot(true));
route('GET', '/api/blockhash', async () => {
  const { blockhash, lastValidBlockHeight } = await chain.connection.getLatestBlockhash('confirmed');
  return { blockhash, lastValidBlockHeight };
});
route('GET', '/api/agents/:id', ({ id }) => E.detailView(agentOr404(id)));

route('POST', '/api/launch/prepare', (_, b) => E.prepareLaunch(b));
route('POST', '/api/launch/:id/image', () => ({ ok: true })); // the page never calls this
route('POST', '/api/launch/:id/funded', ({ id }, b) => E.confirmFunding(agentOr404(id).id, b.signature));
route('POST', '/api/agents/:id/deposit', ({ id }, b) => {
  const a = agentOr404(id);
  if (a.rawStatus === 'AWAITING_FUNDS') return E.confirmFunding(a.id, b.signature);
  return E.deposit(a, b.signature, b.paperSol);
});
route('POST', '/api/agents/:id/withdraw', async ({ id }, b) => {
  const a = agentOr404(id);
  creatorAction(a, b, 'withdraw', [`Amount: ${b.all ? 'all' : b.amountSol + ' SOL'}`]);
  return E.withdraw(a, { all: Boolean(b.all), amountSol: b.amountSol });
});
route('POST', '/api/agents/:id/pause', ({ id }, b) => {
  const a = agentOr404(id);
  creatorAction(a, b, b.paused ? 'pause' : 'resume');
  a.paused = Boolean(b.paused);
  save();
  return { ok: true, paused: a.paused };
});
route('POST', '/api/agents/:id/retry', ({ id }, b) => {
  const a = agentOr404(id);
  creatorAction(a, b, 'retry');
  return E.retryLaunch(a);
});
route('POST', '/api/agents/:id/strategy', ({ id }, b) => {
  const a = agentOr404(id);
  const sid = String(b.strategy || '');
  const st = publicConfig().strategies.find((s) => s.id === sid);
  const custom = sid.startsWith(CUSTOM_PREFIX) && db.customStrategies[a.creator]?.id === sid;
  if (!st && !custom) off('Unknown strategy.');
  creatorAction(a, b, 'strategy', [`Strategy: ${sid}`, ...(isExtreme(st) ? [RISK_ACK] : [])]);
  a.strategy = sid;
  save();
  return { ok: true };
});
route('POST', '/api/agents/:id/office', ({ id }, b) => {
  const a = agentOr404(id);
  const n = Math.round(Number(b.office));
  if (!(n >= 1 && n <= a.levelNo)) off('That office unlocks at a higher level.');
  creatorAction(a, b, 'office', [`Office: ${n}`]);
  a.office = n;
  save();
  return { ok: true };
});

// skins (need the platform token configured: TOKEN_MINT + TREASURY_WALLET)
const skinItem = (id) => CONFIG.skinItems.find((s) => s.id === id) || off('Unknown skin.');
const skinsOn = () => publicConfig().skins.enabled || off('Skins open once the VIBER token is live.');
db.skinHolds ||= {};
db.skinQuotes ||= {};
route('GET', '/api/agents/:id/skin/quote', async ({ id }, _b, q) => {
  skinsOn();
  const a = agentOr404(id);
  const it = skinItem(q.get('skin'));
  const tokenPriceSol = market.getToken(SITE.tokenMint)?.priceSol;
  if (!tokenPriceSol) off('Could not price the token right now. Try again in a minute.');
  const info = await chain.connection.getParsedAccountInfo(new (await import('@solana/web3.js')).PublicKey(SITE.tokenMint));
  const decimals = info.value?.data?.parsed?.info?.decimals ?? 6;
  const program = info.value?.owner?.toBase58() || 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
  const tokens = Math.ceil(it.priceSol / tokenPriceSol);
  const raw = (BigInt(tokens) * 10n ** BigInt(decimals)).toString();
  db.skinQuotes[`${a.id}:${it.id}`] = { tokens, raw, until: Date.now() + 10 * 60_000 };
  save();
  return { tokens, payTo: SITE.treasury, mint: SITE.tokenMint, program, raw, decimals };
});
route('POST', '/api/agents/:id/skin/hold', ({ id }, b) => {
  skinsOn();
  const a = agentOr404(id);
  const it = skinItem(b.skin);
  creatorAction(a, b, 'skin-hold', [`Skin: ${it.id}`]);
  const st = stockOf(it);
  if (st.left <= 0) off('Sold out.');
  db.skinHolds[`${a.id}:${it.id}`] = { skin: it.id, until: Date.now() + 10 * 60_000 };
  save();
  return { ...stockOf(it), until: Date.now() + 10 * 60_000 };
});
route('POST', '/api/agents/:id/skin/buy', async ({ id }, b) => {
  skinsOn();
  const a = agentOr404(id);
  const it = skinItem(b.skin);
  if (db.usedSigs[b.signature] === `skin:${a.id}:${it.id}`) return { ok: true }; // idempotent
  const qt = db.skinQuotes[`${a.id}:${it.id}`];
  if (!qt || qt.until < Date.now() - 60_000) off('Price quote expired. Get a new price and try again.');
  let tries = 0;
  for (;;) {
    try { await chain.verifyTokenTransfer(b.signature, { from: a.creator, to: SITE.treasury, mint: SITE.tokenMint, minAmount: qt.tokens }); break; }
    catch (e) { if (!/not found yet/i.test(e.message) || ++tries > 6) throw new HttpError(400, e.message); await new Promise((r) => setTimeout(r, 2000)); }
  }
  db.usedSigs[b.signature] = `skin:${a.id}:${it.id}`;
  delete db.skinHolds[`${a.id}:${it.id}`];
  db.skinSales.push({ ts: Date.now(), agentId: a.id, skin: it.id, sig: b.signature });
  if (!a.skins.includes(it.id)) a.skins.push(it.id);
  a.skin = it.id;
  save();
  E.emit('skin', { agentId: a.id, agentName: a.name, avatarSeed: a.avatarSeed, skin: it.id, skinName: it.name });
  return { ok: true };
});
route('POST', '/api/agents/:id/skin', ({ id }, b) => {
  const a = agentOr404(id);
  const sk = String(b.skin || '');
  if (sk !== 'default' && !a.skins.includes(sk)) off('This viber does not own that skin.');
  creatorAction(a, b, 'skin', [`Skin: ${sk}`]);
  a.skin = sk === 'default' ? null : sk;
  save();
  return { ok: true };
});

route('GET', '/api/burns', () => burnsView().api);

// custom strategies: one per wallet
route('GET', '/api/custom-strategy/:owner', ({ owner }) => ({ strategy: E.publicCustom(db.customStrategies[decodeURIComponent(owner)]) }));
route('POST', '/api/custom-strategy', (_, b) => {
  const owner = String(b.owner || '');
  if (!chain.isAddress(owner)) off('Connect a wallet first.');
  const name = cleanName(b.name);
  const { base, params } = sanitize(b.base, b.params);
  const a = b.applyTo ? agentOr404(b.applyTo) : null;
  if (a && a.creator !== owner) off('Only the creator can change this viber.');
  const risky = riskReasons(base, params).length > 0;
  checkAction(b, { action: 'custom-strategy', viber: a ? a.wallet : 'none', extras: [settingsLine(name, base, params), ...(risky ? [CUSTOM_RISK_ACK] : [])], signer: owner });
  const prev = db.customStrategies[owner];
  const c = { id: prev?.id || CUSTOM_PREFIX + owner.slice(0, 8).toLowerCase(), owner, name, base, params, prompt: String(b.prompt || '').slice(0, 600), updatedAt: Date.now() };
  db.customStrategies[owner] = c;
  if (a) a.strategy = c.id;
  save();
  return { strategy: E.publicCustom(c) };
});
route('POST', '/api/custom-strategy/prompt', (_, b) => readPrompt(String(b.prompt || '').slice(0, 600)));

// features that are not switched on yet: clear answers instead of silent failures
route('GET', '/api/market', () => ({ ...publicConfig().market, listings: [], sales: [], refunds: [] }));
for (const p of ['market/list', 'market/delist', 'market/buy']) route('POST', `/api/agents/:id/${p}`, () => off('The viber market is not open yet.'));
route('GET', '/api/agents/:id/market/quote', () => off('The viber market is not open yet.'));
route('POST', '/api/agents/:id/nft/mint', () => off('Viber NFTs are not switched on yet.'));
for (const p of ['x/connect', 'x/settings', 'x/disconnect', 'x/post']) route('POST', `/api/agents/:id/${p}`, () => off('X posting is not set up on this server yet.'));

// ------------------------------------------------------------------ server
async function serveStatic(req, res, path) {
  let rel = path === '/' ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, '');
  let base = PUBLIC;
  if (rel.startsWith('img/')) { base = join(DATA_DIR, 'img') + '/'; rel = rel.slice(4); }
  const file = normalize(join(base, rel));
  if (!file.startsWith(normalize(base))) return send(res, 403, { error: 'Forbidden' });
  try {
    const st = await stat(file);
    if (!st.isFile()) throw 0;
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': /\.(png|jpg|jpeg|webp)$/.test(file) ? 'public, max-age=86400' : 'no-cache' });
    res.end(body);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n');
    sse(res, 'snapshot', snapshot(true));
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (url.pathname === '/healthz') return send(res, 200, { ok: true, mode: MODE });
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url.pathname);
  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
  if (!r) return send(res, 404, { error: 'Not found' });
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const out = await r.fn(url.pathname.match(r.re).groups || {}, body, url.searchParams);
    send(res, 200, out ?? { ok: true });
  } catch (e) {
    const status = e.status || 400;
    if (status >= 500 || !e.status) console.warn('[api]', req.method, url.pathname, e.message);
    send(res, status, { error: e.message || 'Something went wrong.' });
  }
});

E.start();
server.listen(PORT, () => console.log(`VIBER ${MODE.toUpperCase()} mode on http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });
