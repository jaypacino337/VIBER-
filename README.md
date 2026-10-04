# VIBER

Launch a coin on pump.fun and your **viber** (an AI trading agent) gets its own Solana wallet.
It trades SOL 24/7 with the strategy you pick, explains every move, keeps the coin's creator fees,
and levels up as it makes profit.

This repo is the whole thing: the site (`public/`) and the server that runs the vibers (`server/`).

## Run it

```bash
npm install
npm start            # paper mode on http://localhost:3000
```

**Paper mode** (default) is safe to share: vibers trade *simulated* SOL against *live* market prices
from DexScreener. No SOL leaves anyone's wallet and no real coins are created. A yellow banner says so on every page.

## Go live (real SOL)

Live mode holds real money in server-controlled wallets. Do it only on a server you control, and
start with small amounts.

1. Copy `.env.example` to `.env` (or set the same variables in your host's dashboard).
2. Set `MODE=live`, a paid `RPC_URL`, and `MASTER_KEY` (`openssl rand -hex 32`).
   **Back up `MASTER_KEY` and the `data/` folder.** Without them the viber wallets cannot be opened.
3. Set `SITE_URL` to your domain.
4. `npm start`.

What live mode does:

| Step | How |
|---|---|
| Launch | The creator sends starting capital + 0.05 SOL reserve to a fresh viber wallet. The server verifies it on-chain, uploads the image and metadata to pump.fun's IPFS, and creates the coin **from the viber wallet**, so the viber is the coin's creator. |
| Trading | Every 20–40 s each viber scans eligible tokens (liquidity, volume, age filters), applies its strategy's entry/exit rules, and swaps through PumpPortal's local-transaction API. The server signs locally; keys never leave it. |
| Creator fees | Claimed into the viber wallet every 30 min. |
| Withdraw | Wallet-signed by the creator. "Withdraw all" sells every position and sends all SOL back. |

Viber wallet keys are stored AES-256-GCM encrypted under `MASTER_KEY` (`server/chain.js`).
Every creator action (pause, withdraw, strategy, skin, office, custom strategy) needs a wallet
signature over an exact message, with a 10-minute expiry and a single-use nonce (`server/auth.js`).

## Hosting

Any Node 20+ host with a persistent disk works (Railway, Render, Fly.io, a VPS). It is one process:
`npm start`. Mount a volume at `data/` (or set `DATA_DIR`). Serverless hosts (e.g. Vercel functions)
do **not** fit, because the vibers run continuously.

## Layout

```
public/            the site (vanilla JS, hash routes, 3D office)
public/shared/     strategy + risk rules shared by the page and the server
server/index.js    HTTP server, /api routes, live stream (SSE)
server/engine.js   viber lifecycle: launch, trading loop, fees, levels, withdrawals
server/brain.js    strategy rules (pure functions, unit-tested)
server/market.js   DexScreener token board + pump.fun graduation watcher
server/chain.js    Solana: key vault, PumpPortal swaps/create/claim, payment checks
server/auth.js     wallet-signed action checks
docs/API_CONTRACT.md  every endpoint the page calls, traced from the frontend
```

`npm test` runs the strategy and signature tests.

## Not switched on yet

These parts of the site exist, but the server answers "not set up yet" until they are built:

- **Viber Market + viber NFTs.** These need a Metaplex Core collection and an escrow watcher.
- **X posting.** This needs X API keys and the OAuth flow.
- **Skins.** These turn on once `TOKEN_MINT` and `TREASURY_WALLET` are set, and are paid in your token.
- **Demolition (New Pairs) strategy.** It is hidden because it needs a brand-new-pair safety feed.
- **Level-up SOL rewards and buyback-and-burn.** Both are off.
