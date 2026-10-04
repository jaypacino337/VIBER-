// Every tunable in one place. Values come from the environment so the same
// code runs in paper mode (simulated SOL, the default) and live mode (real SOL).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const defaults = JSON.parse(readFileSync(fileURLToPath(new URL('./defaults.json', import.meta.url)), 'utf8'));

const env = process.env;
const num = (k, d) => (env[k] != null && env[k] !== '' ? Number(env[k]) : d);
const str = (k, d = null) => (env[k] != null && env[k] !== '' ? env[k] : d);
const bool = (k, d) => (env[k] == null || env[k] === '' ? d : /^(1|true|yes|on)$/i.test(env[k]));

export const MODE = str('MODE', 'paper') === 'live' ? 'live' : 'paper';
export const LIVE = MODE === 'live';

export const PORT = num('PORT', 3000);
export const DATA_DIR = str('DATA_DIR', 'data');
export const RPC_URL = str('RPC_URL', 'https://api.mainnet-beta.solana.com');
// 32-byte hex key that encrypts every agent's wallet secret at rest. Required in live mode.
export const MASTER_KEY = str('MASTER_KEY');
if (MODE === 'live' && (!MASTER_KEY || MASTER_KEY.length < 32)) {
  throw new Error('MODE=live needs MASTER_KEY (32+ characters, e.g. `openssl rand -hex 32`). It encrypts every builder wallet key.');
}
export const PUMPPORTAL_URL = str('PUMPPORTAL_URL', 'https://pumpportal.fun/api/trade-local');

export const SITE = {
  name: 'Crewfi',
  url: str('SITE_URL', 'http://localhost:' + num('PORT', 3000)),
  xUrl: str('X_URL'),
  // Your platform token (paid for skins / market). Null until you launch it.
  tokenMint: str('TOKEN_MINT'),
  tokenSymbol: str('TOKEN_SYMBOL', 'CREW'),
  // Treasury that receives skin and market payments.
  treasury: str('TREASURY_WALLET'),
};

export const CONFIG = {
  mode: MODE,
  tradingEnabled: bool('TRADING_ENABLED', true),
  launchEnabled: bool('LAUNCH_ENABLED', true),
  brain: { ...defaults.brain },
  launch: { ...defaults.launch, minStartingCapital: num('MIN_CAPITAL_SOL', defaults.launch.minStartingCapital) },
  fees: { ...defaults.fees },
  trading: { ...defaults.trading },
  filters: { ...defaults.filters },
  levels: defaults.levels,
  strategies: defaults.strategies,
  defaultStrategy: 'classic',
  skinItems: defaults.skins,
  // Paper mode: every new agent starts with this much simulated SOL so the
  // whole loop can be tried without a wallet.
  paperStartSol: num('PAPER_START_SOL', 1),
  promptAi: Boolean(str('ANTHROPIC_API_KEY')),
  anthropicKey: str('ANTHROPIC_API_KEY'),
  anthropicModel: str('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001'),
};

export const LAMPORTS = 1e9;
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
