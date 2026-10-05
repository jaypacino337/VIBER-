// The engine: owns every agent ("viber") and runs its life — funding,
// coin launch, the trading loop, fee claims, levels, withdrawals.
// In paper mode nothing touches the chain; balances and fills are simulated
// against live market prices so the whole product can be tried for free.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, LIVE, DATA_DIR, SITE, FEES, DEV_WALLET_SECRET } from './config.js';
import { db, save, claimSig, rid } from './store.js';
import * as market from './market.js';
import * as chain from './chain.js';
import { decide, levelFor, strategyFor } from './brain.js';
import { RISK_ACK, isExtreme } from '../public/shared/risk-ack.js';
import { toRuntime } from '../public/shared/custom-strategy.js';

const T = CONFIG.trading;
const L = CONFIG.launch;
const IMG_DIR = join(DATA_DIR, 'img');
mkdirSync(IMG_DIR, { recursive: true });

// ------------------------------------------------------------------ events
const subs = new Set();
export const subscribe = (fn) => (subs.add(fn), () => subs.delete(fn));
export const emit = (type, data) => subs.forEach((fn) => { try { fn(type, data); } catch {} });

const now = () => Date.now();
const agents = () => Object.values(db.agents);
export const getAgentRaw = (key) => db.agents[key] || agents().find((a) => String(a.no) === String(key)) || null;

// ------------------------------------------------------------------ helpers
function priceSol(mint, pos) {
  const t = market.getToken(mint);
  return t?.priceSol || pos?.lastPriceSol || pos?.entryPriceSol || 0;
}
// SOL the agent still holds but already owes out: creator royalty, buybacks, AI credits.
const owedSol = (a) => a.pendingRoyaltySol + a.pendingOwnBurnSol + a.pendingVibeBurnSol + a.pendingAiSol;
const freeSol = (a) => Math.max(0, a.balanceSol - owedSol(a));
function equityOf(a) {
  let e = freeSol(a);
  for (const [m, p] of Object.entries(a.positions)) e += p.tokens * priceSol(m, p);
  return e;
}
// Trading performance: profit paid out as royalty or burned still counts as profit made.
function pnlOf(a) {
  return equityOf(a) + a.withdrawnSol + a.royaltiesPaidSol + a.pendingRoyaltySol + a.ownBurnSol + a.pendingOwnBurnSol - a.depositedSol;
}
function displayStatus(a) {
  if (a.rawStatus !== 'ACTIVE') return a.rawStatus;
  if (a.paused) return 'PAUSED';
  if (!Object.keys(a.positions).length && freeSol(a) < T.minTradeSol + T.minSolReserve + T.sellGasSol) return 'LOW BALANCE';
  return 'ACTIVE';
}

/** Fill in fields added after an agent was created, so old data keeps working. */
export function ensure(a) {
  const d = {
    pendingRoyaltySol: 0, pendingOwnBurnSol: 0, pendingVibeBurnSol: 0, pendingAiSol: 0,
    royaltiesPaidSol: 0, royalties: [], ownBurnSol: 0, ownBurnTokens: 0, vibeBurnSol: 0, vibeBurnTokens: 0,
    aiCreditsSol: FEES.starterCreditsSol, aiSpentSol: 0, feesClaimedSol: 0,
    vibe: '', trained: null, chat: [],
  };
  for (const [k, v] of Object.entries(d)) if (a[k] === undefined) a[k] = Array.isArray(v) ? [] : v;
  return a;
}
db.burns ||= [];
db.devClaims ||= [];
db.stats.aiPoolSol ||= 0;
db.stats.vibeBurnSol ||= 0;
db.stats.vibeBurnTokens ||= 0;
for (const a of Object.values(db.agents)) ensure(a);

function customFor(a) {
  if (a.trained && a.strategy === a.trained.id) return toRuntime(a.trained);
  if (!a.strategy?.startsWith('custom-')) return null;
  const c = db.customStrategies[a.creator];
  return c && c.id === a.strategy ? toRuntime(c) : null;
}
function think(a, entry) {
  const d = { ts: now(), action: 'HOLD', symbol: null, reason: '', approved: true, blocked: null, failed: false, note: false, levelUp: null, ...entry };
  a.decisions.unshift(d);
  a.decisions.length = Math.min(a.decisions.length, 60);
  db.thoughts.unshift({
    id: rid('th'), ts: d.ts, agentId: a.id, agentNo: a.no, agentName: a.name, ticker: a.coin.ticker, image: a.coin.image, avatarSeed: a.avatarSeed,
    action: d.action, symbol: d.symbol, text: d.reason, blocked: d.blocked, failed: d.failed, note: d.note, levelUp: d.levelUp, trade: d.trade || null,
  });
  db.thoughts.length = Math.min(db.thoughts.length, 40);
}
function recordEquity(a) {
  a.equity.push([now(), Number(equityOf(a).toFixed(6))]);
  if (a.equity.length > 600) a.equity.splice(0, a.equity.length - 600);
}

// ------------------------------------------------------------------ views
export function listView(a) {
  const eq = equityOf(a), pnl = pnlOf(a);
  return {
    id: a.id, no: a.no, name: a.name, avatarSeed: a.avatarSeed, wallet: a.wallet, creator: a.creator,
    skin: a.skin, skins: a.skins, baseSeed: a.baseSeed, office: a.office, nft: null, strategy: a.strategy,
    level: levelFor(a.bestProfitSol),
    coin: { name: a.coin.name, ticker: a.coin.ticker, mint: a.coin.mint, image: a.coin.image, mcapUsd: a.coin.mcapUsd || 0 },
    balanceSol: a.balanceSol, equitySol: eq, depositedSol: a.depositedSol, pnlSol: pnl,
    pnlPct: a.depositedSol > 0 ? pnl / a.depositedSol : 0,
    trades: a.trades, openPositions: Object.keys(a.positions).length,
    winRate: a.closedTrades ? a.wins / a.closedTrades : null,
    status: displayStatus(a), paused: a.paused,
    feesKeptSol: a.feesKeptSol, feesToCreatorSol: 0, flywheelSol: a.vibeBurnSol, flywheelTokens: a.vibeBurnTokens,
    aiCreditsSol: a.aiCreditsSol, royaltiesPaidSol: a.royaltiesPaidSol, ownBurnTokens: a.ownBurnTokens,
    createdAt: a.createdAt, lastTradeAt: a.lastTradeAt,
    spark: a.equity.slice(-45).map((x) => x[1]),
  };
}

export function detailView(a) {
  return {
    ...listView(a),
    rawStatus: a.rawStatus, error: a.error, requiredSol: a.requiredSol, startingCapital: a.startingCapital,
    launchCostSol: a.launchCostSol, withdrawnSol: a.withdrawnSol, realizedPnlSol: a.realizedPnlSol,
    closedTrades: a.closedTrades, wins: a.wins,
    coin: { ...a.coin },
    positions: Object.entries(a.positions).map(([mint, p]) => {
      const t = market.getToken(mint);
      const px = priceSol(mint, p);
      const valueSol = p.tokens * px;
      return {
        mint, symbol: p.symbol, icon: p.icon, url: p.url, recovered: false, sellFails: p.sellFails || 0,
        costSol: p.costSol, valueSol, entryPriceSol: p.entryPriceSol, priceUsd: t?.priceUsd || 0,
        pnlSol: valueSol - p.costSol, pnlPct: p.costSol ? valueSol / p.costSol - 1 : 0, openedAt: p.openedAt,
      };
    }),
    history: a.history.slice(0, 100),
    decisions: a.decisions.slice(0, 40),
    deposits: a.deposits, withdrawals: a.withdrawals, feeClaims: a.feeClaims,
    equity: a.equity,
    nextDecisionAt: a.nextDecisionAt, nextFeeClaimAt: LIVE ? a.nextFeeClaimAt : null,
    custody: LIVE ? 'server vault (AES-256-GCM encrypted)' : 'paper mode: simulated wallet, no real SOL',
    customStrategy: a.trained && a.strategy === a.trained.id ? publicCustom(a.trained) : customFor(a) ? publicCustom(db.customStrategies[a.creator]) : null,
    vibe: a.vibe,
    economy: {
      freeSol: freeSol(a),
      aiCreditsSol: a.aiCreditsSol, aiSpentSol: a.aiSpentSol, feesClaimedSol: a.feesClaimedSol,
      royaltiesPaidSol: a.royaltiesPaidSol, pendingRoyaltySol: a.pendingRoyaltySol, royalties: a.royalties.slice(0, 10),
      ownBurnSol: a.ownBurnSol, ownBurnTokens: a.ownBurnTokens, pendingOwnBurnSol: a.pendingOwnBurnSol,
      vibeBurnSol: a.vibeBurnSol, vibeBurnTokens: a.vibeBurnTokens, pendingVibeBurnSol: a.pendingVibeBurnSol,
      burns: db.burns.filter((b) => b.agentId === a.id).slice(0, 10),
    },
    rewards: [], flywheel: { sol: a.vibeBurnSol, tokens: a.vibeBurnTokens, pendingSol: a.pendingVibeBurnSol, burns: db.burns.filter((b) => b.agentId === a.id && b.source === 'agent').slice(0, 5) }, nftJob: null, market: null, sales: [], owners: [],
    x: { connected: false, enabled: false, images: false },
  };
}

export function coinsView() {
  return agents()
    .filter((a) => a.coin.mint)
    .sort((x, y) => y.coin.createdAt - x.coin.createdAt)
    .map((a) => ({ ...a.coin, agentId: a.id, agentNo: a.no, pendingMint: null }));
}

export function statsView() {
  const list = agents().filter((a) => a.rawStatus === 'ACTIVE');
  const dayAgo = now() - 86400_000;
  const trades = db.feed.filter((t) => t.ts > dayAgo);
  return {
    agentsActive: list.filter((a) => displayStatus(a) === 'ACTIVE').length,
    agentsTotal: agents().length,
    trades24h: trades.length,
    volume24hSol: trades.reduce((s, t) => s + t.sol, 0),
    aumSol: list.reduce((s, a) => s + equityOf(a), 0),
    pnlSol: list.reduce((s, a) => s + pnlOf(a), 0),
    feesClaimedSol: db.stats.feesClaimedSol,
    toCreatorsSol: 0,
    solUsd: market.getSolUsd(),
    tradingEnabled: CONFIG.tradingEnabled,
    marketReady: market.lastRefreshAt() > 0,
  };
}

export function tokensView() {
  const held = {};
  for (const a of agents()) for (const m of Object.keys(a.positions)) held[m] = (held[m] || 0) + 1;
  return market.board().map((t) => ({ ...t, agents: held[t.mint] || 0 }));
}

export function thinkingCount() {
  return agents().filter((a) => a.rawStatus === 'ACTIVE' && !a.paused).length;
}

export function publicCustom(c) {
  if (!c) return null;
  const base = CONFIG.strategies.find((s) => s.id === c.base);
  return { ...toRuntime(c), id: c.id, params: c.params, prompt: c.prompt || '', tagline: 'Custom strategy', goal: `Your own settings, starting from ${base?.name || c.base}.`, baseName: base?.name || c.base, risk: null };
}

// ------------------------------------------------------------------ launch
export async function prepareLaunch(b) {
  if (!CONFIG.launchEnabled) throw new Error('Launches are paused right now.');
  if (!chain.isAddress(b.creator)) throw new Error('Connect a wallet first.');
  const coin = b.coin || {};
  const name = String(coin.name || '').trim().slice(0, 32);
  const ticker = String(coin.ticker || '').trim().toUpperCase();
  if (!name) throw new Error('Give your coin a name.');
  if (!/^[A-Z0-9]{2,10}$/.test(ticker)) throw new Error('Ticker must be 2–10 letters or numbers.');
  const agentName = String(b.agentName || '').trim().slice(0, 24) || name;
  const capital = Number(b.startingCapital);
  if (!(capital >= L.minStartingCapital)) throw new Error(`Starting capital must be at least ${L.minStartingCapital} SOL.`);
  if (L.maxStartingCapital && capital > L.maxStartingCapital) throw new Error(`Starting capital is capped at ${L.maxStartingCapital} SOL.`);
  const strategy = String(b.strategy || CONFIG.defaultStrategy);
  const st = CONFIG.strategies.find((s) => s.id === strategy);
  if (!st && !(strategy.startsWith('custom-') && db.customStrategies[b.creator]?.id === strategy)) throw new Error('Unknown strategy.');
  if (isExtreme(st) && b.riskAck !== true) throw new Error('Tick the risk box to use this strategy.');
  if (typeof b.image !== 'string' || !b.image.startsWith('data:image/')) throw new Error('Coin image is missing.');

  const id = rid('ag');
  const no = ++db.seq;
  const w = chain.newWallet();
  const imgFile = `${id}.${b.image.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`;
  writeFileSync(join(IMG_DIR, imgFile), Buffer.from(b.image.split(',')[1], 'base64'));
  const required = Number((capital + L.launchReserveSol).toFixed(4));
  db.agents[id] = {
    id, no, name: agentName, avatarSeed: String(b.avatarSeed || id).slice(0, 24), baseSeed: String(b.avatarSeed || id).slice(0, 24),
    wallet: w.address, sealed: w.sealed, creator: b.creator, strategy, skin: null, skins: [], office: 1,
    rawStatus: 'AWAITING_FUNDS', paused: false, error: null,
    coin: {
      name, ticker, description: String(coin.description || '').slice(0, 280), twitter: String(coin.twitter || '').slice(0, 120),
      telegram: String(coin.telegram || '').slice(0, 120), website: `${SITE.url}/#/viber/${no}`,
      image: `/img/${imgFile}`, imageFile: imgFile, uri: null, mint: null, launchSig: null, createdAt: null, mcapUsd: 0, athUsd: 0,
    },
    startingCapital: capital, requiredSol: required, balanceSol: 0, depositedSol: 0, withdrawnSol: 0, launchCostSol: 0,
    positions: {}, history: [], decisions: [], deposits: [], withdrawals: [], feeClaims: [], equity: [],
    realizedPnlSol: 0, closedTrades: 0, wins: 0, trades: 0, bestProfitSol: 0, levelNo: 1, feesKeptSol: 0,
    lastTradeAt: 0, lastBuyAt: 0, createdAt: now(), nextDecisionAt: 0, nextFeeClaimAt: 0, blockedMints: {},
  };
  ensure(db.agents[id]);
  db.agents[id].vibe = String(b.vibe || '').trim().slice(0, 400);
  save();
  return { agentId: id, no, wallet: w.address, requiredSol: required };
}

/** Called by /funded, /deposit and the funding watcher. Never throws for "not confirmed yet". */
export async function confirmFunding(id, signature) {
  const a = getAgentRaw(id);
  if (!a) throw notFound();
  if (a.rawStatus !== 'AWAITING_FUNDS') return { ok: true, status: a.rawStatus };
  if (!LIVE) {
    // Paper mode: the page skips the wallet transfer; credit the simulated SOL.
    creditDeposit(a, a.requiredSol, 'paper-' + chain.fakeSig().slice(0, 20), a.creator, 'launch');
    return startLaunch(a);
  }
  if (signature) {
    try {
      const r = await chain.verifySolTransfer(signature, { to: a.wallet, minSol: 0 });
      if (!db.usedSigs[signature]) { claimSig(signature, 'launch:' + a.id); creditDeposit(a, r.received, signature, r.payer, 'launch'); }
    } catch (e) {
      // not visible yet: the watcher picks it up from the balance
    }
  }
  return checkFunded(a);
}

async function checkFunded(a) {
  if (a.rawStatus !== 'AWAITING_FUNDS') return { ok: true };
  if (LIVE) {
    const bal = await chain.balanceSol(a.wallet).catch(() => null);
    if (bal != null && bal > a.balanceSol + 1e-6) {
      // SOL sent manually (no /funded call): count the difference as a deposit
      creditDeposit(a, bal - a.balanceSol, 'balance-' + now(), a.creator, 'launch');
    }
  }
  if (a.balanceSol + 1e-6 >= a.requiredSol) return startLaunch(a);
  if (now() - a.createdAt > L.fundingTimeoutMs) {
    a.rawStatus = a.balanceSol > 0 ? 'LAUNCH_FAILED' : 'EXPIRED';
    a.error = a.balanceSol > 0 ? `Only ${a.balanceSol.toFixed(4)} of ${a.requiredSol} SOL arrived in time. Add the rest or withdraw.` : 'No SOL arrived within 30 minutes.';
    save();
  }
  return { ok: true, status: a.rawStatus };
}

function creditDeposit(a, sol, sig, from, kind) {
  a.balanceSol += sol;
  a.depositedSol += sol;
  a.deposits.unshift({ ts: now(), amount: sol, from, sig, kind });
  emit('fund', { agentId: a.id, amount: sol });
  save();
}

async function startLaunch(a) {
  a.rawStatus = 'LAUNCHING';
  a.error = null;
  save();
  launchCoin(a).catch((e) => {
    a.rawStatus = 'LAUNCH_FAILED';
    a.error = e.message;
    think(a, { action: 'HOLD', reason: 'Coin launch failed: ' + e.message, failed: true, note: true });
    save();
  });
  return { ok: true, status: 'LAUNCHING' };
}

async function launchCoin(a) {
  const before = a.balanceSol;
  if (LIVE) {
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync(join(IMG_DIR, a.coin.imageFile));
    const meta = await chain.uploadMetadata({ ...a.coin, image: `data:image/${a.coin.imageFile.endsWith('jpg') ? 'jpeg' : 'png'};base64,${buf.toString('base64')}` });
    a.coin.uri = meta.uri;
    if (meta.image) a.coin.image = meta.image;
    save();
    const { mint, sig } = await chain.createCoin(a.sealed, { name: a.coin.name, ticker: a.coin.ticker, uri: meta.uri, devBuySol: L.devBuySol });
    a.coin.mint = mint;
    a.coin.launchSig = sig;
    a.balanceSol = await chain.balanceSol(a.wallet);
  } else {
    await new Promise((r) => setTimeout(r, 1500));
    a.coin.uri = `${SITE.url}/img/${a.coin.imageFile}`;
    save();
    await new Promise((r) => setTimeout(r, 1500));
    a.coin.mint = 'paper' + chain.fakeSig().slice(0, 39);
    a.coin.launchSig = chain.fakeSig();
    a.coin.mcapUsd = 4000;
    a.balanceSol -= L.launchReserveSol; // simulated launch cost
  }
  a.launchCostSol = Math.max(0, before - a.balanceSol);
  a.depositedSol -= a.launchCostSol; // the reserve pays for the launch; it is not trading capital
  a.coin.createdAt = now();
  a.rawStatus = 'ACTIVE';
  a.nextDecisionAt = now() + 5000;
  a.nextFeeClaimAt = now() + CONFIG.fees.claimEveryMs;
  recordEquity(a);
  think(a, { action: 'HOLD', reason: `Clocked in. $${a.coin.ticker} is live and I trade the ${strategyFor(a, customFor(a))?.name || a.strategy} plan with ${a.balanceSol.toFixed(3)} SOL.`, note: true });
  save();
  emit('launch', { agentId: a.id });
}

export async function retryLaunch(a) {
  if (a.rawStatus !== 'LAUNCH_FAILED') throw new Error('Nothing to retry.');
  if (a.balanceSol + 1e-6 < a.requiredSol - a.launchCostSol && !a.coin.mint) {
    a.rawStatus = 'AWAITING_FUNDS';
    a.createdAt = now();
    save();
    return checkFunded(a);
  }
  return startLaunch(a);
}

// ------------------------------------------------------------------ money in/out
export async function deposit(a, signature, paperSol) {
  if (!LIVE) {
    const sol = Math.min(10, Math.max(0.001, Number(paperSol) || 0.25));
    creditDeposit(a, sol, 'paper-' + chain.fakeSig().slice(0, 20), a.creator, 'deposit');
    return { ok: true, amount: sol };
  }
  if (!signature) throw new Error('Missing transaction signature.');
  if (db.usedSigs[signature]) return { ok: true };
  let r, tries = 0;
  for (;;) {
    try { r = await chain.verifySolTransfer(signature, { to: a.wallet, minSol: 0.000001 }); break; }
    catch (e) { if (!/not found yet/i.test(e.message) || ++tries > 8) throw e; await new Promise((x) => setTimeout(x, 2500)); }
  }
  claimSig(signature, 'deposit:' + a.id);
  creditDeposit(a, r.received, signature, r.payer, 'deposit');
  if (a.rawStatus === 'AWAITING_FUNDS') await checkFunded(a);
  return { ok: true, amount: r.received };
}

async function sell(a, mint, reason, source) {
  const p = a.positions[mint];
  if (!p) return null;
  const t = market.getToken(mint);
  let solOut, sig, tokensSold = p.tokens;
  if (LIVE) {
    const r = await chain.swap(a.sealed, { side: 'SELL', mint, amount: '100%', slippagePct: T.exitSlippagePct, priorityFeeSol: T.exitPriorityFeeSol });
    sig = r.sig;
    solOut = Math.max(0, r.solDelta);
    a.balanceSol = await chain.balanceSol(a.wallet).catch(() => a.balanceSol + solOut);
  } else {
    const px = priceSol(mint, p);
    solOut = p.tokens * px * (1 - 0.01) - T.priorityFeeSol; // ~1% pool fee + gas
    sig = chain.fakeSig();
    a.balanceSol += solOut;
  }
  const pnlSol = solOut - p.costSol;
  if (pnlSol > 0) {
    // every winning trade: 15% creator royalty, 85% buys back + burns the agent's own coin
    a.pendingRoyaltySol += pnlSol * FEES.profit.creator;
    a.pendingOwnBurnSol += pnlSol * FEES.profit.burnOwn;
  }
  delete a.positions[mint];
  a.realizedPnlSol += pnlSol;
  a.closedTrades++;
  if (pnlSol > 0) a.wins++;
  const tr = trade(a, { side: 'SELL', mint, symbol: p.symbol, sol: solOut, tokens: tokensSold, priceUsd: t?.priceUsd || 0, pnlSol, pnlPct: p.costSol ? pnlSol / p.costSol : 0, heldMs: now() - p.openedAt, source, reason, sig });
  return tr;
}

async function buy(a, mint, sol, reason) {
  const t = market.getToken(mint);
  if (!t) return null;
  let tokens, sig, cost = sol;
  if (LIVE) {
    const r = await chain.swap(a.sealed, { side: 'BUY', mint, amount: sol, slippagePct: T.slippagePct, priorityFeeSol: T.priorityFeeSol });
    sig = r.sig;
    tokens = r.tokenDelta;
    cost = Math.max(sol, -r.solDelta);
    a.balanceSol = await chain.balanceSol(a.wallet).catch(() => a.balanceSol - cost);
    if (!(tokens > 0)) throw new Error('Buy confirmed but no tokens arrived.');
  } else {
    tokens = ((sol - T.priorityFeeSol) * (1 - 0.01)) / t.priceSol;
    sig = chain.fakeSig();
    a.balanceSol -= sol;
  }
  a.positions[mint] = { tokens, costSol: cost, entryPriceSol: t.priceSol, lastPriceSol: t.priceSol, openedAt: now(), symbol: t.symbol, icon: t.icon, url: t.url, peakPnl: 0, sellFails: 0 };
  a.lastBuyAt = now();
  return trade(a, { side: 'BUY', mint, symbol: t.symbol, sol: cost, tokens, priceUsd: t.priceUsd, source: 'ai', reason, sig });
}

function trade(a, x) {
  const tr = {
    id: rid('tr'), agentId: a.id, ...x, ts: now(), url: LIVE ? chain.solscan(x.sig) : null,
    agentNo: a.no, agentName: a.name, avatarSeed: a.avatarSeed, coinTicker: a.coin.ticker,
  };
  a.history.unshift(tr);
  a.history.length = Math.min(a.history.length, 300);
  a.trades++;
  a.lastTradeAt = tr.ts;
  db.feed.unshift(tr);
  db.feed.length = Math.min(db.feed.length, 500);
  think(a, { action: x.side, symbol: x.symbol, reason: x.reason, trade: { side: x.side, sol: x.sol, pnlPct: x.pnlPct ?? null, url: tr.url } });
  recordEquity(a);
  checkLevel(a);
  save();
  emit('trade', tr);
  return tr;
}

function checkLevel(a) {
  a.bestProfitSol = Math.max(a.bestProfitSol, a.realizedPnlSol);
  const lv = levelFor(a.bestProfitSol);
  if (lv.no > a.levelNo) {
    const from = CONFIG.levels.find((l) => l.no === a.levelNo)?.name;
    a.levelNo = lv.no;
    think(a, { action: 'HOLD', reason: `Promoted to ${lv.name}. Best profit so far: ${a.bestProfitSol.toFixed(3)} SOL.`, levelUp: lv.name, note: true });
    emit('levelup', { agentId: a.id, agentName: a.name, avatarSeed: a.avatarSeed, from, to: lv.name, no: lv.no, rewardSol: 0 });
  }
}

export async function withdraw(a, { all, amountSol }) {
  if (a.rawStatus === 'LAUNCHING') throw new Error('Wait for the launch to finish.');
  const notes = [];
  if (all) {
    a.paused = true;
    for (const mint of Object.keys(a.positions)) {
      try { await sell(a, mint, 'Creator withdrawal: closing position', 'withdraw'); }
      catch (e) { notes.push(`Could not sell ${a.positions[mint]?.symbol}: ${e.message}`); }
    }
  }
  const fee = LIVE ? 0.000005 : 0;
  // royalties and buybacks the agent already owes stay put; only free SOL can leave
  const max = Math.max(0, freeSol(a) - fee);
  const amount = all ? max : Number(amountSol);
  if (!(amount > 0)) throw new Error('Nothing to withdraw.');
  if (amount > max + 1e-9) throw new Error(`Only ${max.toFixed(4)} SOL is free to withdraw.`);
  const sig = LIVE ? await chain.sendSol(a.sealed, a.creator, amount) : chain.fakeSig();
  a.balanceSol -= amount + fee;
  if (a.balanceSol < 1e-9) a.balanceSol = 0;
  a.withdrawnSol += amount;
  a.withdrawals.unshift({ ts: now(), amount, to: a.creator, sig });
  think(a, { action: 'HOLD', reason: `Sent ${amount.toFixed(4)} SOL back to my creator.`, note: true });
  recordEquity(a);
  save();
  return { amount, sig, notes };
}

// ------------------------------------------------------------------ loops
let ticking = false;
async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const open = new Set(agents().flatMap((a) => Object.keys(a.positions)));
    await market.refresh([...open]).catch((e) => console.warn('[market]', e.message));
    for (const a of agents()) {
      for (const [m, p] of Object.entries(a.positions)) { const t = market.getToken(m); if (t) p.lastPriceSol = t.priceSol; }
      if (a.rawStatus === 'AWAITING_FUNDS') { await checkFunded(a).catch(() => {}); continue; }
      if (a.rawStatus !== 'ACTIVE' || a.paused || !CONFIG.tradingEnabled) continue;
      if (now() < a.nextDecisionAt) continue;
      const [lo, hi] = CONFIG.brain.decisionEveryMs;
      a.nextDecisionAt = now() + lo + Math.random() * (hi - lo);
      const view = { ...a, balanceSol: freeSol(a), equitySol: equityOf(a) };
      const acts = decide(view, market.allTokens(), market.getToken, customFor(a));
      for (const x of acts) {
        try {
          if (x.type === 'SELL') {
            const src = /stop-loss/i.test(x.reason) ? 'stop-loss' : /trailing/i.test(x.reason) ? 'trailing-stop' : /profit/i.test(x.reason) ? 'take-profit' : /Held/.test(x.reason) ? 'time-exit' : 'ai';
            await sell(a, x.mint, x.reason, src);
          } else if (x.type === 'BUY') {
            await buy(a, x.mint, x.sol, x.reason);
          } else {
            think(a, { action: 'HOLD', reason: x.text, note: true });
          }
        } catch (e) {
          const p = a.positions[x.mint];
          if (p) p.sellFails = (p.sellFails || 0) + 1;
          a.blockedMints[x.mint] = now() + 30 * 60_000;
          think(a, { action: x.type, symbol: market.getToken(x.mint)?.symbol || null, reason: x.reason || x.text, failed: true, blocked: e.message.slice(0, 160) });
        }
      }
      recordEquity(a);
    }
    for (const a of agents()) if (a.rawStatus === 'ACTIVE') await flushPayouts(a).catch((e) => console.warn('[payouts]', a.id, e.message));
    save();
  } finally {
    ticking = false;
  }
}

// ------------------------------------------------------------------ payouts & burns
const paperCoinPriceSol = (a) => (a.coin.mcapUsd || 4000) / (market.getSolUsd() || 150) / 1e9; // pump.fun supply is 1B

function recordBurn(a, row) {
  const b = { id: rid('bn'), ts: now(), agentId: a?.id || null, agentNo: a?.no || null, agentName: a?.name || 'VIBER', avatarSeed: a?.avatarSeed || null, coinTicker: row.coinTicker, ...row };
  db.burns.unshift(b);
  db.burns.length = Math.min(db.burns.length, 500);
  emit('burn', b);
  return b;
}

/** Pay out what an agent owes once each bucket is big enough to be worth the gas. */
async function flushPayouts(a) {
  const min = FEES.minFlushSol;
  if (a.pendingRoyaltySol >= min) {
    const sol = a.pendingRoyaltySol;
    const sig = LIVE ? await chain.sendSol(a.sealed, a.creator, sol) : chain.fakeSig();
    a.pendingRoyaltySol = 0;
    a.royaltiesPaidSol += sol;
    if (!LIVE) a.balanceSol -= sol;
    a.royalties.unshift({ ts: now(), sol, to: a.creator, sig });
    think(a, { action: 'HOLD', reason: `Paid my creator a ${sol.toFixed(4)} SOL royalty (15% of my trading profit).`, note: true });
  }
  if (a.pendingOwnBurnSol >= min && a.coin.mint) {
    const sol = a.pendingOwnBurnSol;
    let r;
    if (LIVE && !a.coin.mint.startsWith('paper')) r = await chain.buyAndBurn(a.sealed, { mint: a.coin.mint, sol });
    else { r = { sol, tokens: sol / paperCoinPriceSol(a), buySig: chain.fakeSig(), burnSig: chain.fakeSig() }; a.balanceSol -= sol; }
    a.pendingOwnBurnSol = 0;
    a.ownBurnSol += r.sol;
    a.ownBurnTokens += r.tokens;
    recordBurn(a, { source: 'profit', coinTicker: a.coin.ticker, mint: a.coin.mint, sol: r.sol, tokens: r.tokens, buySig: r.buySig, burnSig: r.burnSig });
    think(a, { action: 'HOLD', reason: `Bought back and burned ${Math.round(r.tokens).toLocaleString('en')} $${a.coin.ticker} with ${r.sol.toFixed(4)} SOL of profit. 🔥`, note: true });
  }
  if (a.pendingVibeBurnSol >= min && SITE.tokenMint) {
    const sol = a.pendingVibeBurnSol;
    let r;
    if (LIVE) r = await chain.buyAndBurn(a.sealed, { mint: SITE.tokenMint, sol });
    else {
      const px = market.getToken(SITE.tokenMint)?.priceSol;
      if (!px) return; // stays queued until $VIBE has a price
      r = { sol, tokens: sol / px, buySig: chain.fakeSig(), burnSig: chain.fakeSig() };
      a.balanceSol -= sol;
    }
    a.pendingVibeBurnSol = 0;
    a.vibeBurnSol += r.sol;
    a.vibeBurnTokens += r.tokens;
    db.stats.vibeBurnSol += r.sol;
    db.stats.vibeBurnTokens += r.tokens;
    recordBurn(a, { source: 'agent', coinTicker: SITE.tokenSymbol, mint: SITE.tokenMint, sol: r.sol, tokens: r.tokens, buySig: r.buySig, burnSig: r.burnSig });
  }
  if (a.pendingAiSol >= min && LIVE && SITE.treasury) {
    // the AI share pays the operator's model bill; the credits were granted when the fee came in
    const sol = a.pendingAiSol;
    await chain.sendSol(a.sealed, SITE.treasury, sol);
    a.pendingAiSol = 0;
  }
}

/** Split one creator-fee claim of an agent's coin (see FEES.agent). */
function splitAgentFees(a, sol) {
  const F = FEES.agent;
  a.feesClaimedSol += sol;
  a.feesKeptSol += sol * F.bankroll;
  a.pendingVibeBurnSol += sol * F.burnVibe;
  a.pendingAiSol += sol * F.aiCredits;
  a.aiCreditsSol += sol * F.aiCredits;
}

/** $VIBE's own creator fees, claimed by the platform dev wallet: 50% burns $VIBE, 50% funds AI credits. */
let devSealed = null;
async function claimPlatformFees() {
  if (!LIVE || !DEV_WALLET_SECRET) return;
  devSealed ||= chain.sealBase58(DEV_WALLET_SECRET);
  try {
    const r = await chain.claimCreatorFees(devSealed);
    if (r.sol < CONFIG.fees.minClaimSol) return;
    const claim = { ts: now(), claimedSol: r.sol, sig: r.sig, buybackSol: 0, aiSol: r.sol * FEES.vibe.aiCredits };
    db.stats.aiPoolSol += claim.aiSol;
    if (SITE.tokenMint) {
      const b = await chain.buyAndBurn(devSealed, { mint: SITE.tokenMint, sol: r.sol * FEES.vibe.burnVibe });
      claim.buybackSol = b.sol;
      db.stats.vibeBurnSol += b.sol;
      db.stats.vibeBurnTokens += b.tokens;
      recordBurn(null, { source: 'dev', coinTicker: SITE.tokenSymbol, mint: SITE.tokenMint, sol: b.sol, tokens: b.tokens, buySig: b.buySig, burnSig: b.burnSig });
    }
    db.devClaims.unshift(claim);
    db.devClaims.length = Math.min(db.devClaims.length, 100);
    emit('devclaim', {});
    save();
  } catch (e) {
    console.warn('[dev fees]', e.message);
  }
}

/** Data for the burns pages. */
export function burnsData(who) {
  const rows = db.burns.filter((b) => (who === 'dev' ? b.source === 'dev' : b.source !== 'dev'));
  const sum = (list, k) => list.reduce((s, x) => s + (x[k] || 0), 0);
  const agentRows = db.burns.filter((b) => b.source === 'agent');
  const devRows = db.burns.filter((b) => b.source === 'dev');
  const pendingVibe = agents().reduce((s, a) => s + a.pendingVibeBurnSol, 0);
  return {
    enabled: true, mint: SITE.tokenMint, pct: FEES.agent.burnVibe,
    totalSol: db.stats.vibeBurnSol, totalTokens: db.stats.vibeBurnTokens, count: agentRows.length + devRows.length, queuedSol: pendingVibe, recent: rows.slice(0, 10),
    agents: { totalSol: sum(agentRows, 'sol'), totalTokens: sum(agentRows, 'tokens'), count: agentRows.length, queuedSol: pendingVibe, skinTokens: 0, skinBurns: 0 },
    dev: {
      enabled: Boolean(LIVE && DEV_WALLET_SECRET), pct: FEES.vibe.burnVibe, wallet: null, pendingSol: 0,
      buybackSol: sum(devRows, 'sol'), burnedTokens: sum(devRows, 'tokens'), burns: devRows.length,
      claimedSol: sum(db.devClaims, 'claimedSol'), claims: db.devClaims.slice(0, 20), inProgress: false, minBuySol: FEES.minFlushSol, maxBuySol: null, lastError: null,
    },
    burns: rows.slice(0, 100),
  };
}

async function claimFees() {
  if (!LIVE) return;
  for (const a of agents()) {
    if (a.rawStatus !== 'ACTIVE' || !a.coin.mint || now() < a.nextFeeClaimAt) continue;
    a.nextFeeClaimAt = now() + CONFIG.fees.claimEveryMs;
    try {
      const r = await chain.claimCreatorFees(a.sealed);
      if (r.sol >= CONFIG.fees.minClaimSol) {
        a.balanceSol += r.sol;
        splitAgentFees(a, r.sol); // 70% bankroll · 20% buys + burns $VIBE · 10% AI credits
        db.stats.feesClaimedSol += r.sol;
        a.feeClaims.unshift({ ts: now(), claimedSol: r.sol, sig: r.sig, toCreatorSol: 0, shareSig: null });
        think(a, { action: 'HOLD', reason: `Claimed ${r.sol.toFixed(4)} SOL of creator fees from $${a.coin.ticker}: ${(r.sol * FEES.agent.bankroll).toFixed(4)} to trade with, ${(r.sol * FEES.agent.burnVibe).toFixed(4)} to burn $VIBE, ${(r.sol * FEES.agent.aiCredits).toFixed(4)} to my AI credits.`, note: true });
        emit('fees', { agentId: a.id, sol: r.sol });
      }
    } catch (e) {
      console.warn('[fees]', a.id, e.message);
    }
  }
  save();
}

async function refreshCoins() {
  for (const a of agents()) {
    if (!a.coin.mint || a.coin.mint.startsWith('paper')) continue;
    try {
      const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${a.coin.mint}`);
      if (!r.ok) continue;
      const j = await r.json();
      a.coin.mcapUsd = j.usd_market_cap || a.coin.mcapUsd;
      a.coin.athUsd = Math.max(a.coin.athUsd || 0, a.coin.mcapUsd);
    } catch {}
  }
  if (LIVE) {
    for (const a of agents()) {
      if (a.rawStatus !== 'ACTIVE' || ticking) continue;
      const bal = await chain.balanceSol(a.wallet).catch(() => null);
      if (bal == null) continue;
      // every balance change the engine makes is re-read from chain right away,
      // so a rise it cannot explain is SOL someone sent straight to the wallet
      if (bal > a.balanceSol + 0.001) creditDeposit(a, bal - a.balanceSol, 'manual-' + now(), null, 'deposit');
      else a.balanceSol = bal;
    }
  }
  save();
}

export function start() {
  market.watchMigrations();
  market.onBonded((b) => emit('bonded', b));
  tick();
  setInterval(tick, 10_000);
  setInterval(claimFees, 60_000);
  setInterval(claimPlatformFees, CONFIG.fees.claimEveryMs);
  setInterval(refreshCoins, 60_000);
}

export const notFound = () => Object.assign(new Error('Agent not found'), { status: 404 });
export { RISK_ACK };

// exposed for unit tests only
export const _test = { sell, flushPayouts, splitAgentFees, freeSol, pnlOf, equityOf };
