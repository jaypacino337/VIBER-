import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exitSignal, entryReason, levelFor, decide } from '../server/brain.js';
import { CONFIG } from '../server/config.js';

const classic = CONFIG.strategies.find((s) => s.id === 'classic');
const tok = (o = {}) => ({ mint: 'M', symbol: 'TST', priceSol: 1e-6, priceUsd: 1e-4, eligible: true, liquidityUsd: 80000, volume5mUsd: 20000, volume1hUsd: 200000, change5m: 0.05, change1h: 0.1, spark: [], ...o });

test('stop-loss and take-profit fire at the plan thresholds', () => {
  const pos = { tokens: 1000, costSol: 0.001, openedAt: Date.now() };
  assert.match(exitSignal({ ...pos }, tok({ priceSol: 0.7e-6 }), classic).reason, /Stop-loss/i);
  assert.match(exitSignal({ ...pos }, tok({ priceSol: 1.5e-6 }), classic).reason, /profit/i);
  assert.equal(exitSignal({ ...pos }, tok({ priceSol: 1.05e-6, change5m: 0.01 }), classic), null);
});

test('classic entry wants steady momentum, not a blow-off', () => {
  assert.ok(entryReason(tok(), classic));
  assert.equal(entryReason(tok({ change5m: 0.4 }), classic), null);
  assert.equal(entryReason(tok({ eligible: false }), classic), null);
});

test('decide sizes the buy from equity and respects the reserve', () => {
  const agent = { strategy: 'classic', positions: {}, balanceSol: 0.5, equitySol: 0.5, blockedMints: {} };
  const acts = decide(agent, [tok()], () => tok(), null);
  const b = acts.find((a) => a.type === 'BUY');
  assert.ok(b && b.sol > 0 && b.sol <= 0.05 + 1e-9);
  const poor = decide({ ...agent, balanceSol: 0.03, equitySol: 0.03 }, [tok()], () => tok(), null);
  assert.ok(!poor.some((a) => a.type === 'BUY'));
});

test('levels follow best profit', () => {
  assert.equal(levelFor(0).no, 1);
  assert.equal(levelFor(0.6).name, 'Carpenter');
  assert.equal(levelFor(100).next, null);
});
