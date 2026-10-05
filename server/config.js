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
export const DATA_DIR = str('DATA_DIR', str('RAILWAY_VOLUME_MOUNT_PATH', 'data'));
export const RPC_URL = str('RPC_URL', 'https://api.mainnet-beta.solana.com');
// 32-byte hex key that encrypts every agent's wallet secret at rest. Required in live mode.
export const MASTER_KEY = str('MASTER_KEY');
if (MODE === 'live' && (!MASTER_KEY || MASTER_KEY.length < 32)) {
  throw new Error('MODE=live needs MASTER_KEY (32+ characters, e.g. `openssl rand -hex 32`). It encrypts every viber wallet key.');
}
export const PUMPPORTAL_URL = str('PUMPPORTAL_URL', 'https://pumpportal.fun/api/trade-local');

export const SITE = {
  name: 'VIBER',
  url: str('SITE_URL', env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : 'http://localhost:' + num('PORT', 3000)),
  xUrl: str('X_URL'),
  // Your platform token (paid for skins / market). Null until you launch it.
  tokenMint: str('TOKEN_MINT'),
  tokenSymbol: str('TOKEN_SYMBOL', 'VIBE'),
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
};

// VIBER fee model (see README "Fees"). Fractions of each flow.
export const FEES = {
  // $VIBE's own pump.fun creator fees (claimed by the dev wallet)
  vibe: { burnVibe: 0.5, aiCredits: 0.5 },
  // each agent coin's creator fees (claimed by the agent's wallet)
  agent: { bankroll: 0.7, burnVibe: 0.2, aiCredits: 0.1 },
  // every realized trading profit of an agent
  profit: { creator: 0.15, burnOwn: 0.85 },
  // payouts and buybacks wait until a bucket holds at least this much (saves gas)
  minFlushSol: num('MIN_FLUSH_SOL', 0.01),
  // free AI credits every new agent starts with (granted by the platform, not the creator)
  starterCreditsSol: num('STARTER_AI_CREDITS_SOL', MODE === 'live' ? 0.01 : 0.05),
};

// Platform dev wallet that owns $VIBE's creator fees (base58 secret). Optional.
export const DEV_WALLET_SECRET = str('DEV_WALLET_SECRET');

export const AI = {
  model: str('AI_MODEL', 'claude-opus-5-5'),
  enabled: Boolean(str('ANTHROPIC_API_KEY') || str('ANTHROPIC_AUTH_TOKEN')),
  // USD per million tokens for the chosen model, used to meter AI credits
  inputUsdPerM: num('AI_INPUT_USD_PER_M', 4),
  outputUsdPerM: num('AI_OUTPUT_USD_PER_M', 20),
  cacheReadUsdPerM: num('AI_CACHE_READ_USD_PER_M', 0.2),
};

export const LAMPORTS = 1e9;
export const SOL_MINT = 'So11111111111111111111111111111111111111112';
