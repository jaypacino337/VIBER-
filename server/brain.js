// The decision rules. Pure functions: given an agent's book and the market,
// return what to do and a plain-English reason. No I/O here, so it is testable.
import { CONFIG } from './config.js';

const pct = (x) => (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const usd = (x) => (x >= 1e6 ? '$' + (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? '$' + Math.round(x / 1e3) + 'K' : '$' + Math.round(x));

export function strategyFor(agent, custom) {
  if (custom) {
    // custom strategies are flat (shared/custom-strategy.js); entry rules live under .entry here
    const ENTRY = ['minVol5mUsd', 'minChange5m', 'maxChange5m', 'maxSpike5m', 'minVol1hUsd', 'minRun1h', 'pullbackMin', 'pullbackMax', 'bounceFromLow'];
    const entry = Object.fromEntries(ENTRY.filter((k) => custom[k] != null).map((k) => [k, custom[k]]));
    return { ...CONFIG.strategies.find((s) => s.id === custom.base), ...custom, entry, id: agent.strategy };
  }
  return CONFIG.strategies.find((s) => s.id === agent.strategy) || CONFIG.strategies.find((s) => s.id === CONFIG.defaultStrategy);
}

/** Exit check for one open position. Returns { reason } to sell, or null to hold. */
export function exitSignal(pos, token, s, now = Date.now()) {
  if (!token || !token.priceSol) return null;
  const value = pos.tokens * token.priceSol;
  const pnl = pos.costSol > 0 ? value / pos.costSol - 1 : 0;
  const peak = Math.max(pos.peakPnl ?? pnl, pnl);
  pos.peakPnl = peak;
  if (pnl <= s.stopLossPct) return { reason: `Cut $${token.symbol} at ${pct(pnl)}. Stop-loss is ${pct(s.stopLossPct)}; protect the bankroll.`, pnl };
  if (pnl >= s.takeProfitPct) return { reason: `Took profit on $${token.symbol} at ${pct(pnl)}. Target was ${pct(s.takeProfitPct)}.`, pnl };
  if (s.trail && peak >= s.trail.at && peak - pnl >= s.trail.by) return { reason: `Trailing stop on $${token.symbol}: peaked ${pct(peak)}, now ${pct(pnl)}. Locking it in.`, pnl };
  if (s.maxHoldMin && now - pos.openedAt > s.maxHoldMin * 60000) return { reason: `Held $${token.symbol} ${s.maxHoldMin} min, the plan's limit. Out at ${pct(pnl)}.`, pnl };
  // classic: trend fading after a gain
  if (!s.trail && pnl > 0.1 && token.change5m < -0.04) return { reason: `$${token.symbol} trend is fading (5m ${pct(token.change5m)}). Banking ${pct(pnl)}.`, pnl };
  return null;
}

/** Does this token pass the strategy's entry rules? Returns a reason string or null. */
export function entryReason(t, s) {
  if (!t.eligible || t.liquidityUsd < (s.minLiquidityUsd || 0)) return null;
  const e = s.entry || {};
  if (e.minVol5mUsd && t.volume5mUsd < e.minVol5mUsd) return null;
  if (e.minVol1hUsd && t.volume1hUsd < e.minVol1hUsd) return null;
  if (e.minChange5m != null && t.change5m < e.minChange5m) return null;
  if (e.maxChange5m != null && t.change5m > e.maxChange5m) return null;
  if (e.maxSpike5m != null && t.change5m > e.maxSpike5m) return null;
  if (e.minRun1h != null) {
    // dip buyer: ran up over the hour, now pulled back within the band and bouncing
    const sp = t.spark.filter(Boolean);
    if (t.change1h < e.minRun1h || sp.length < 6) return null;
    const hi = Math.max(...sp), lo = Math.min(...sp.slice(-6)), last = sp[sp.length - 1];
    const pull = 1 - last / hi;
    if (pull < e.pullbackMin || pull > e.pullbackMax) return null;
    if (last / lo - 1 < e.bounceFromLow) return null;
    return `Bought the dip on $${t.symbol}: 1h ${pct(t.change1h)}, pulled back ${pct(-pull)}, bouncing. Liquidity ${usd(t.liquidityUsd)}.`;
  }
  if (!Object.keys(e).length) {
    // classic blueprint: steady momentum, not a blow-off
    if (t.change5m <= 0.01 || t.change5m > 0.25 || t.change1h < -0.05) return null;
  }
  return `Bought $${t.symbol}. 5m ${pct(t.change5m)}, liquidity ${usd(t.liquidityUsd)}. Meets the plan.`;
}

/**
 * One brain tick for one agent. Returns a list of actions:
 *   { type: 'SELL', mint, reason } | { type: 'BUY', mint, sol, reason } | { type: 'NOTE', text }
 */
export function decide(agent, tokens, getToken, custom, now = Date.now()) {
  const s = strategyFor(agent, custom);
  const T = CONFIG.trading;
  const actions = [];
  for (const [mint, pos] of Object.entries(agent.positions)) {
    const sig = exitSignal(pos, getToken(mint), s, now);
    if (sig) actions.push({ type: 'SELL', mint, reason: sig.reason, pnl: sig.pnl });
  }
  const open = Object.keys(agent.positions).length - actions.length;
  if (open >= (s.maxOpen || T.maxOpenPositions)) return actions;
  if (s.cooldownMin && agent.lastBuyAt && now - agent.lastBuyAt < s.cooldownMin * 60000) return actions;

  const free = agent.balanceSol - T.minSolReserve - T.sellGasSol * (open + 1);
  let size = Math.min(agent.equitySol * (s.sizePct || T.tradeSizePct), free);
  if (s.maxTradeSol) size = Math.min(size, s.maxTradeSol);
  if (size < T.minTradeSol) {
    if (open === 0) actions.push({ type: 'NOTE', text: `Not enough free SOL for a ${T.minTradeSol} SOL trade. Waiting for a deposit or fees.` });
    return actions;
  }
  const blocked = agent.blockedMints || {};
  const picks = tokens
    .filter((t) => !agent.positions[t.mint] && !(blocked[t.mint] > now))
    .map((t) => ({ t, why: entryReason(t, s) }))
    .filter((x) => x.why)
    .sort((a, b) => b.t.volume5mUsd - a.t.volume5mUsd || b.t.change5m - a.t.change5m);
  if (picks.length) {
    const { t, why } = picks[0];
    actions.push({ type: 'BUY', mint: t.mint, sol: Number(size.toFixed(4)), reason: why });
  } else if (Math.random() < 0.25) {
    actions.push({ type: 'NOTE', text: `Scanned ${tokens.length} tokens. Nothing fits the ${s.name} plan right now; sitting tight.` });
  }
  return actions;
}

export function levelFor(bestProfitSol) {
  const L = CONFIG.levels;
  let i = 0;
  for (let k = 0; k < L.length; k++) if (bestProfitSol >= L[k].minProfitSol) i = k;
  const cur = L[i], next = L[i + 1] || null;
  const progress = next ? Math.max(0, Math.min(1, (bestProfitSol - cur.minProfitSol) / (next.minProfitSol - cur.minProfitSol))) : 1;
  return {
    no: cur.no, name: cur.name, color: cur.color, bestProfitSol,
    next: next ? { no: next.no, name: next.name, minProfitSol: next.minProfitSol, color: next.color, rewardSol: next.rewardSol } : null,
    progress, max: L.length,
  };
}
