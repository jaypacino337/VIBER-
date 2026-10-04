// Tiny durable store: one JSON file, written atomically, debounced.
// Fine for hundreds of agents; swap for Postgres if Crewfi gets big.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, MODE } from './config.js';

mkdirSync(DATA_DIR, { recursive: true });
const FILE = join(DATA_DIR, `crewfi-${MODE}.json`);

const empty = () => ({ seq: 0, agents: {}, coins: {}, launches: {}, feed: [], thoughts: [], customStrategies: {}, market: { listings: {}, sales: [] }, skinSales: [], usedSigs: {}, nonces: {}, stats: { feesClaimedSol: 0, rewardsPaidSol: 0 } });

export const db = existsSync(FILE) ? { ...empty(), ...JSON.parse(readFileSync(FILE, 'utf8')) } : empty();

let timer = null;
export function save() {
  if (timer) return;
  timer = setTimeout(flush, 500);
}
export function flush() {
  clearTimeout(timer);
  timer = null;
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(db));
  renameSync(tmp, FILE);
}

/** Each on-chain signature may only be credited once (no double-counting a deposit). */
export function claimSig(sig, purpose) {
  if (db.usedSigs[sig]) throw new Error('That transaction was already used.');
  db.usedSigs[sig] = purpose;
  save();
}

const ALPH = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const rid = (prefix, n = 8) => prefix + '_' + Array.from({ length: n }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
