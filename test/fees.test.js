import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'viber-fees-'));
const E = await import('../server/engine.js');
const market = await import('../server/market.js');
const { FEES } = await import('../server/config.js');
const { Keypair } = await import('@solana/web3.js');

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
async function activeAgent() {
  const p = await E.prepareLaunch({ creator: Keypair.generate().publicKey.toBase58(), coin: { name: 'Fee Test', ticker: 'FEET' }, agentName: 'Fee', startingCapital: 0.5, image: png, strategy: 'classic' });
  await E.confirmFunding(p.agentId, 'paper');
  const a = E.getAgentRaw(p.agentId);
  for (let i = 0; i < 40 && a.rawStatus !== 'ACTIVE'; i++) await new Promise((r) => setTimeout(r, 100));
  assert.equal(a.rawStatus, 'ACTIVE');
  return a;
}
const near = (x, y) => assert.ok(Math.abs(x - y) < 1e-9, `${x} != ${y}`);

test('a winning trade sends 15% to the creator and burns 85% of the agent coin', async () => {
  const a = await activeAgent();
  market._setToken({ mint: 'TOK', symbol: 'TOK', priceSol: 2e-6, priceUsd: 0 });
  a.positions.TOK = { tokens: 100000, costSol: 0.1, entryPriceSol: 1e-6, openedAt: Date.now(), symbol: 'TOK' };
  a.balanceSol -= 0.1;
  const pnlBefore = E._test.pnlOf(a);
  await E._test.sell(a, 'TOK', 'test', 'ai');
  const profit = 100000 * 2e-6 * 0.99 - 0.0002 - 0.1;
  near(a.pendingRoyaltySol, profit * 0.15);
  near(a.pendingOwnBurnSol, profit * 0.85);
  // reserved profit is not free to trade or withdraw...
  near(E._test.freeSol(a), a.balanceSol - profit);
  // ...but still counts as profit made: P&L only moves by the exit cost (pool fee + gas)
  const solOut = 100000 * 2e-6 * 0.99 - 0.0002;
  near(E._test.pnlOf(a), pnlBefore - (100000 * 2e-6 - solOut));
  await E._test.flushPayouts(a);
  near(a.royaltiesPaidSol, profit * 0.15);
  near(a.ownBurnSol, profit * 0.85);
  assert.equal(a.pendingRoyaltySol, 0);
  assert.ok(a.ownBurnTokens > 0);
});

test('losing trades pay no royalty', async () => {
  const a = await activeAgent();
  market._setToken({ mint: 'LOSS', symbol: 'LOSS', priceSol: 0.5e-6, priceUsd: 0 });
  a.positions.LOSS = { tokens: 100000, costSol: 0.1, entryPriceSol: 1e-6, openedAt: Date.now(), symbol: 'LOSS' };
  await E._test.sell(a, 'LOSS', 'test', 'stop-loss');
  assert.equal(a.pendingRoyaltySol, 0);
  assert.equal(a.pendingOwnBurnSol, 0);
});

test('coin fees split 70% bankroll / 20% $VIBE burn / 10% AI credits', async () => {
  const a = await activeAgent();
  const credits = a.aiCreditsSol, pnl0 = E._test.pnlOf(a);
  a.balanceSol += 1;
  E._test.splitAgentFees(a, 1);
  near(a.pendingVibeBurnSol, FEES.agent.burnVibe);
  near(a.aiCreditsSol - credits, FEES.agent.aiCredits);
  near(E._test.pnlOf(a) - pnl0, FEES.agent.bankroll);
});
