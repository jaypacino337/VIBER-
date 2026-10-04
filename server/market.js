// Market data: which Solana tokens are worth looking at right now, and what
// they cost. DexScreener supplies prices/liquidity/volume; PumpPortal's public
// websocket tells us when pump.fun coins graduate ("bonded").
import { CONFIG, SOL_MINT } from './config.js';

const DS = 'https://api.dexscreener.com';
const SPARK_LEN = 57;
const BONDED_MAX = 12;

const tokens = new Map(); // mint -> token
const sparks = new Map(); // mint -> [priceUsd...]
const bonded = [];
const listeners = { bonded: new Set() };
let solUsd = 0;
let lastRefresh = 0;

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'crewfi/0.1' } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

function bestPair(pairs) {
  return pairs
    .filter((p) => p.chainId === 'solana' && p.quoteToken?.address === SOL_MINT)
    .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
}

function toToken(p) {
  const mint = p.baseToken.address;
  const priceUsd = Number(p.priceUsd) || 0;
  const s = sparks.get(mint) || [];
  s.push(priceUsd);
  while (s.length > SPARK_LEN) s.shift();
  sparks.set(mint, s);
  const f = CONFIG.filters;
  const t = {
    mint,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    icon: p.info?.imageUrl || null,
    dexId: p.dexId,
    url: p.url,
    pair: p.pairAddress,
    priceUsd,
    priceSol: Number(p.priceNative) || 0,
    mcapUsd: p.marketCap || p.fdv || 0,
    liquidityUsd: p.liquidity?.usd || 0,
    volume24hUsd: p.volume?.h24 || 0,
    volume1hUsd: p.volume?.h1 || 0,
    volume5mUsd: p.volume?.m5 || 0,
    change5m: (p.priceChange?.m5 || 0) / 100,
    change1h: (p.priceChange?.h1 || 0) / 100,
    change24h: (p.priceChange?.h24 || 0) / 100,
    ageHours: p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3.6e6 : 0,
    platformCoin: false,
    agents: 0,
    spark: s.slice(),
  };
  t.eligible =
    t.liquidityUsd >= f.minLiquidityUsd &&
    t.volume24hUsd >= f.minVolume24hUsd &&
    t.mcapUsd >= f.minMcapUsd &&
    t.ageHours >= f.minAgeHours;
  return t;
}

async function candidateMints() {
  const lists = await Promise.allSettled([
    getJson(`${DS}/token-boosts/top/v1`),
    getJson(`${DS}/token-boosts/latest/v1`),
    getJson(`${DS}/token-profiles/latest/v1`),
  ]);
  const mints = new Set(tokens.keys()); // keep tracking what we already watch
  for (const l of lists) {
    if (l.status !== 'fulfilled' || !Array.isArray(l.value)) continue;
    for (const x of l.value) if (x.chainId === 'solana' && x.tokenAddress) mints.add(x.tokenAddress);
  }
  return [...mints].slice(0, 90);
}

/** Refresh prices for everything we watch, plus a list of mints that must be priced (open positions). */
export async function refresh(extraMints = []) {
  const mints = [...new Set([...extraMints, ...(await candidateMints())])];
  const fresh = new Map();
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    try {
      const pairs = await getJson(`${DS}/tokens/v1/solana/${chunk.join(',')}`);
      const byMint = new Map();
      for (const p of pairs) {
        const m = p.baseToken?.address;
        if (!m) continue;
        (byMint.get(m) || byMint.set(m, []).get(m)).push(p);
      }
      for (const [m, ps] of byMint) {
        const p = bestPair(ps);
        if (p) fresh.set(m, toToken(p));
      }
    } catch (e) {
      console.warn('[market]', e.message);
    }
  }
  // drop tokens that vanished from every list and are not needed
  tokens.clear();
  for (const [m, t] of fresh) tokens.set(m, t);
  try {
    const sol = await getJson(`${DS}/tokens/v1/solana/${SOL_MINT}`);
    const p = sol.filter((x) => /USDC|USDT/.test(x.quoteToken?.symbol || '')).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    if (p) solUsd = Number(p.priceUsd) || solUsd;
  } catch {}
  lastRefresh = Date.now();
  return tokens;
}

export const getToken = (mint) => tokens.get(mint) || null;
export const getSolUsd = () => solUsd;
export const lastRefreshAt = () => lastRefresh;

/** The public token board: eligible tokens first, by 24h volume. */
export function board(limit = 13) {
  return [...tokens.values()]
    .filter((t) => t.eligible)
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
    .slice(0, limit);
}
export const allTokens = () => [...tokens.values()];

export const getBonded = () => bonded.slice();
export const onBonded = (fn) => (listeners.bonded.add(fn), () => listeners.bonded.delete(fn));

/** Watch pump.fun graduations. Reconnects on its own. */
export function watchMigrations() {
  if (typeof WebSocket === 'undefined') return;
  let ws;
  const open = () => {
    try {
      ws = new WebSocket('wss://pumpportal.fun/api/data');
    } catch {
      return setTimeout(open, 15000);
    }
    ws.onopen = () => ws.send(JSON.stringify({ method: 'subscribeMigration' }));
    ws.onmessage = async (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (!m?.mint || m.txType !== 'migrate') return;
      const b = { mint: m.mint, ts: Date.now(), name: null, symbol: null, image: null, mcapUsd: 0, liquidityUsd: 0, pool: m.pool || 'pump-amm' };
      try {
        const pairs = await getJson(`${DS}/tokens/v1/solana/${m.mint}`);
        const p = bestPair(pairs) || pairs[0];
        if (p) Object.assign(b, { name: p.baseToken.name, symbol: p.baseToken.symbol, image: p.info?.imageUrl || null, mcapUsd: p.marketCap || 0, liquidityUsd: p.liquidity?.usd || 0 });
      } catch {}
      const i = bonded.findIndex((x) => x.mint === b.mint);
      if (i >= 0) bonded.splice(i, 1);
      bonded.unshift(b);
      bonded.length = Math.min(bonded.length, BONDED_MAX);
      listeners.bonded.forEach((fn) => fn(b));
    };
    ws.onclose = () => setTimeout(open, 10000);
    ws.onerror = () => { try { ws.close(); } catch {} };
  };
  open();
}
