# Crewfi backend: API contract (reverse-engineered from the frontend)

This document lists everything the static frontend in `public/` expects from the server. A new server that follows it can replace the old one without changes to the frontend. Every claim below was traced from the frontend source (`file:line`, relative to `public/`) and checked against the saved responses in `docs/reference/`.

Contents

1. [Conventions (transport, errors, ids, static files)](#1-conventions)
2. [Wallet-signed actions: the exact message format](#2-wallet-signed-actions)
3. [Endpoint reference](#3-endpoint-reference)
4. [On-chain flows: who builds, signs and sends each transaction](#4-on-chain-flows)
5. [SSE `/api/stream`](#5-sse-apistream)
6. [`GET /api/state` and the agent objects: the fields the frontend reads](#6-state-and-agent-objects)
7. [Error strings the frontend matches on](#7-error-strings-the-frontend-matches-on)
8. [Other server obligations](#8-other-server-obligations)
9. [Branding inventory (BUILD, Build, builder, buildagent)](#9-branding-inventory)
10. [Surprises and gotchas](#10-surprises-and-gotchas)

---

## 1. Conventions

### 1.1 Transport

All REST calls go through one helper, `app/api.js:3-9`:

```js
async function json(url, opts = {}) {
  const r = await fetch(url, { headers: { 'content-type': 'application/json' }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'Request failed (' + r.status + ')');
  return body;
}
const post = (url, body) => json(url, { method: 'POST', body: JSON.stringify(body || {}) });
```

What this means for the server:

* Every response body must be JSON, including error responses.
* **Errors must use a non-2xx status code and return `{ "error": "<human readable message>" }`.** The frontend shows `error` to the user as-is (in toasts and modal error boxes). A `200` response that contains `{error}` is treated as a **success**.
* All POST requests send `Content-Type: application/json`. The body is `JSON.stringify(obj)`, so keys whose value is `undefined` are left out.
* Calls are same-origin and relative (`/api/...`). No cookies, auth headers or CORS are involved.

### 1.2 Ids

* `agent.id` is a string such as `"ag_t1tshef7"`. `agent.no` is an integer (1, 2, …).
* **`GET /api/agents/:id` must accept both the id and the number.** The page route is `#/builder/<x>` (`app/main.js:983`: `if (a === 'agent' && b) return { name: 'agent', id: decodeURIComponent(b) }`), and `AgentPage` passes `<x>` straight to `getAgent(id)` (`app/pages/agent.js:576`). Most links use the number (`#/builder/${a.no}`), but the launch flow falls back to the id: `app.navigate('#/builder/' + (d?.no || prep.agentId))` (`app/pages/launch.js:340`, `:349`).
* The POST routes `/api/agents/:id/...` are always called with `agent.id`, never with the number.

### 1.3 Static files

The frontend is served from `public/` at the site root: `index.html`, `styles.css`, `app/**`, `shared/**` and `brand/**`. The pages use hash routes (`#/build`, `#/builder/7`, `#/market`, …), so the server only needs `/` to serve `index.html`. `shared/*.js` are ES modules that the old server also imported. The comment at `shared/risk-ack.js:1-2` says they are "Shared by the page and the server". A new server should import the same files so its validation and signed strings match the browser exactly. See §2.4.

External scripts that the page loads by itself (no server involvement): `@solana/web3.js@1.98.0` IIFE from unpkg/jsdelivr (`index.html:26`), a `buffer` polyfill (`index.html:29`, `app/wallet.js:249-259`), and `@metamask/connect-solana` (`app/wallet.js:153-166`).

---

## 2. Wallet-signed actions

### 2.1 How the signature is produced

`app/wallet.js:235-242`:

```js
// Signs a creator action. Free, moves no funds. Returns what the server needs to check it.
export async function signAction(message) {
  const bytes = new TextEncoder().encode(message);
  const { signature, signedMessage } = await requireActive().signMessage(bytes);
  const signed = new Uint8Array(signedMessage || bytes);
  const out = { message, signature: typeof signature === 'string' ? signature : base58Encode(new Uint8Array(signature)) };
  if (!sameBytes(signed, bytes)) out.signedMessage = toBase64(signed); // some wallets add a prefix before signing
  return out;
}
```

The result is spread into the POST body (`{ ...auth }`), so every signed request carries these fields:

| field | type | encoding | meaning |
|---|---|---|---|
| `message` | string | plain UTF-8 text, lines joined with `\n` | the exact text shown in the wallet |
| `signature` | string | **base58**, 64-byte ed25519 signature | from `solana:signMessage` (Wallet Standard) or the injected `provider.signMessage(bytes,'utf8')` |
| `signedMessage` | string, **optional** | **base64** | sent only when the wallet reports that it signed bytes different from `message` (some wallets add a prefix). When it is present, the signature covers *these* bytes. |

There is **no separate pubkey field.** The signer is the wallet address written inside the message (`Creator: …`, or `Buyer: …` for market-buy). The custom-strategy endpoint also sends `owner`. The server should:

1. Take the signing pubkey from the `Creator:` line (`Buyer:` for market-buy) and require it to equal the authorised wallet (`agent.creator`, which is the current owner, or `body.owner`/`body.buyer`).
2. Verify the ed25519 signature (`signature` base58-decoded) over `base64decode(signedMessage)` if present, otherwise over `utf8(message)`. When `signedMessage` is present, check that it contains `message`, normally as a suffix.
3. Parse the lines and check the first line, `Action:`, `Builder:` (= `agent.wallet`), the extra lines (which must match the body fields, see the table below), `Issued:` (freshness window) and `Nonce:` (single use).

### 2.2 The message builder

`app/wallet.js:336-347`:

```js
// Message format the server checks for creator-only actions
export function actionMessage(action, agentWallet, extra = []) {
  return [
    'BUILD action',
    `Action: ${action}`,
    `Builder: ${agentWallet}`,
    ...extra,
    `Creator: ${wallet.address}`,
    `Nonce: ${Math.random().toString(36).slice(2, 12)}`,
    `Issued: ${new Date().toISOString()}`,
  ].join('\n');
}
```

Example (withdraw everything):

```
BUILD action
Action: withdraw
Builder: HeftM84ULfLSqcdQ8Mm6UgDLgECyvpN3QeRpnoiJffsb
Amount: all
Creator: FjEX9wS5CA7gVVWLTth7Yz2grEFzqRRWgovshuDaN714
Nonce: k3j9x0a1qz
Issued: 2026-10-04T15:30:12.345Z
```

`Nonce` is up to 10 base-36 characters (it can be shorter, because `Math.random().toString(36)` can be short). `Issued` is `Date.prototype.toISOString()` (UTC, milliseconds, `Z`).

### 2.3 Every signed action

| `Action:` | `Builder:` | extra lines (in order) | endpoint | other body fields | call site |
|---|---|---|---|---|---|
| `pause` | agent.wallet | – | `POST /api/agents/:id/pause` | `paused: true` | `app/main.js:303-305` |
| `resume` | agent.wallet | – | `POST /api/agents/:id/pause` | `paused: false` | `app/main.js:303-305` |
| `retry` | agent.wallet | – | `POST /api/agents/:id/retry` | – | `app/main.js:303-304` |
| `withdraw` | agent.wallet | `Amount: all` or `Amount: <n> SOL` | `POST /api/agents/:id/withdraw` | `all` (bool), `amountSol` (number) | `app/main.js:894-896`, `:720-722` |
| `strategy` | agent.wallet | `Strategy: <id>` then, **only if the strategy has `risk === 'extreme'`**, `RISK_ACK` | `POST /api/agents/:id/strategy` | `strategy` | `app/main.js:397-398` |
| `skin-hold` | agent.wallet | `Skin: <skinId>` | `POST /api/agents/:id/skin/hold` | `skin` | `app/main.js:465-466` |
| `skin` | agent.wallet | `Skin: <skinId or "default">` | `POST /api/agents/:id/skin` | `skin` | `app/main.js:488-489` |
| `custom-strategy` | agent.wallet **or the literal `none`** | `Settings: {json}` then, only if risky, `CUSTOM_RISK_ACK` | `POST /api/custom-strategy` | `owner,name,base,params,prompt,applyTo?` | `app/main.js:668-669` |
| `market-list` | agent.wallet | `Price: <price> SOL` | `POST /api/agents/:id/market/list` | `price` | `app/main.js:752-753` |
| `market-delist` | agent.wallet | – | `POST /api/agents/:id/market/delist` | – | `app/main.js:271-272`, `:734-735` |
| `nft-mint` | agent.wallet | `NFT: whoever holds this NFT owns the builder` | `POST /api/agents/:id/nft/mint` | – | `app/main.js:792-793` |
| `x-connect` | agent.wallet | – | `POST /api/agents/:id/x/connect` | – | `app/main.js:277-278` |
| `x-disconnect` | agent.wallet | – | `POST /api/agents/:id/x/disconnect` | – | `app/main.js:283-284` |
| `x-post` | agent.wallet | – | `POST /api/agents/:id/x/post` | – | `app/main.js:289-290` |
| `x-settings` | agent.wallet | `X settings: trades=on recap=off promos=on images=off` | `POST /api/agents/:id/x/settings` | `settings` | `app/main.js:295-298` |
| `office` | agent.wallet | `Office: <n>` | `POST /api/agents/:id/office` | `office` | `app/pages/agent.js:180-181` |
| `market-buy` | listing.wallet | **custom layout, see §2.5** | `POST /api/agents/:id/market/buy` | `buyer, payment` | `app/main.js:850-851` |

Notes on the extra lines:

* `Amount`: `` [`Amount: ${all ? 'all' : amountSol + ' SOL'}`] `` (`app/main.js:894`). `amountSol` is `Number(input)` and is printed with JS number formatting, for example `0.1 SOL`. The market modal's "Withdraw everything now" sends `['Amount: all']` and body `{ all: true, ...auth }` with **no `amountSol`** (`app/main.js:720-722`). The withdraw modal always sends `amountSol`, which can be `0` when `all` is true.
* `Price` (market-list): `price = Math.round(Number(inp.value) * 1e4) / 1e4`, so the line is `` `Price: ${price} SOL` `` (`app/main.js:746`, `:752`).
* `X settings` (`app/main.js:296`):
  ```js
  const line = `X settings: ${['trades', 'recap', 'promos', 'images'].map((k) => `${k}=${s[k] ? 'on' : 'off'}`).join(' ')}`;
  ```
  `s` is `agent.__xSettings = { trades:false, recap:false, promos:false, images:false, ...(d.x?.settings || {}), ...checkboxes }` (`app/pages/agent.js:549`). The body is `{ settings: s, ...auth }`. Because of the spread, `settings` can contain more keys than the four in the signed line.
* `Settings:` (custom strategy) comes from `shared/custom-strategy.js:111-113`:
  ```js
  export function settingsLine(name, base, params) {
    return `Settings: ${JSON.stringify({ name, base, ...Object.fromEntries(fieldsFor(base).map((k) => [k, params[k]])) })}`;
  }
  ```
  Key order is `name`, `base`, then the `FIELDS` keys allowed for that base, in declaration order. The server should rebuild this line from the body (`name`, `base`, `params`) using the same shared module and compare.
* `Office: <n>` is an integer 1–6.

### 2.4 Fixed strings that are part of signed messages

These have to match byte-for-byte on the server, which is why the server should import `shared/`:

* `shared/risk-ack.js:3`
  `RISK_ACK = 'Risk: I understand this strategy is extreme risk and my builder can lose all of its SOL'`
* `shared/custom-strategy.js:39`
  `CUSTOM_RISK_ACK = 'Risk: I understand these custom settings are very risky and my builder can lose its SOL'`
* the first line `'BUILD action'` (`app/wallet.js:339`, `app/main.js:850`)
* `'NFT: whoever holds this NFT owns the builder'` (`app/main.js:792`)

The server decides whether a custom strategy is "risky" with `riskReasons(base, params)` from `shared/custom-strategy.js:42-57`. The browser adds `CUSTOM_RISK_ACK` when `reasons.length > 0` (`app/main.js:663-668`).

### 2.5 Market-buy intent (not built by `actionMessage`)

`app/main.js:850-851`:

```js
const intent = ['BUILD action', 'Action: market-buy', `Builder: ${x.wallet}`, `Buyer: ${wallet.address}`, `Price: ${x.price} SOL`, `Nonce: ${Math.random().toString(36).slice(2, 12)}`, `Issued: ${new Date().toISOString()}`].join('\n');
const auth = await signAction(intent);
```

This message has **no `Creator:` line**. The signer is `Buyer:`, and `Builder:` is the listed agent's **wallet** (so market listings must include `wallet`, see §3.21).

### 2.6 Unsigned writes (no wallet signature at all)

`prepareLaunch`, `confirmFunding`, `deposit`, `buySkin` and `promptStrategy` carry **no message signature**. The server has to trust the body (`creator` in prepareLaunch) or verify the referenced on-chain transaction (`signature` = transaction signature in funded/deposit/skin-buy). See §4.

---

## 3. Endpoint reference

Every method in `createApi()` (`app/api.js:22-61`) is listed below, plus `/api/stream`. A repo-wide search found no other `fetch(` or `EventSource(` in `public/`. The other network calls are the CDN imports listed in §1.3 and `x.com/intent/tweet`, pump.fun and solscan links.

Summary:

| # | method & path | api.js | called from | signed |
|---|---|---|---|---|
| 1 | `GET /api/state` | :21, :91 | boot + tab re-show | – |
| 2 | `GET /api/stream` (SSE) | :66 | boot | – |
| 3 | `GET /api/agents/:id` | :30 | agent page, launch poll, market buy, withdraw-all | – |
| 4 | `GET /api/blockhash` | :31 | before every wallet transaction | – |
| 5 | `POST /api/launch/prepare` | :33 | launch page | **no** |
| 6 | `POST /api/launch/:id/image` | :34 | **never called** | – |
| 7 | `POST /api/launch/:id/funded` | :35 | launch page, fund-launch modal | no (tx sig) |
| 8 | `POST /api/agents/:id/deposit` | :37 | Add SOL modal | no (tx sig) |
| 9 | `POST /api/agents/:id/withdraw` | :38 | withdraw modal, market modal | yes |
| 10 | `POST /api/agents/:id/pause` | :39 | pause/resume | yes |
| 11 | `POST /api/agents/:id/strategy` | :40 | strategy modal | yes |
| 12 | `POST /api/agents/:id/retry` | :41 | retry launch | yes |
| 13 | `POST /api/agents/:id/skin/buy` | :42 | skin modal | no (tx sig) |
| 14 | `POST /api/agents/:id/skin` | :43 | skin modal (wear owned/default) | yes |
| 15 | `POST /api/agents/:id/skin/hold` | :44 | skin modal (limited skins) | yes |
| 16 | `GET /api/agents/:id/skin/quote?skin=` | :45 | skin modal | – |
| 17 | `GET /api/burns?who=agent\|dev` | :46 | burns pages | – |
| 18 | `POST /api/agents/:id/office` | :47 | agent page office picker | yes |
| 19 | `GET /api/custom-strategy/:owner` | :48 | strategy modal, builder, launch | – |
| 20 | `POST /api/custom-strategy` | :49 | strategy builder | yes |
| 21 | `POST /api/custom-strategy/prompt` | :50 | strategy builder | no |
| 22 | `GET /api/market?wallet=` | :51 | market page | – |
| 23 | `POST /api/agents/:id/market/list` | :52 | sell modal | yes |
| 24 | `POST /api/agents/:id/market/delist` | :53 | sell modal / agent page | yes |
| 25 | `POST /api/agents/:id/market/buy` | :54 | buy modal + resume after reload | yes (market-buy intent) |
| 26 | `GET /api/agents/:id/market/quote?buyer=` | :55 | buy modal | – |
| 27 | `POST /api/agents/:id/nft/mint` | :56 | NFT modal | yes |
| 28 | `POST /api/agents/:id/x/connect` | :57 | X card | yes |
| 29 | `POST /api/agents/:id/x/settings` | :58 | X card | yes |
| 30 | `POST /api/agents/:id/x/disconnect` | :59 | X card | yes |
| 31 | `POST /api/agents/:id/x/post` | :60 | X card | yes |

`:id` in POST paths is put into the URL **without** `encodeURIComponent` (for example `` `/api/agents/${id}/deposit` ``), while the GETs at `:30`, `:45` and `:55` do encode it. Agent ids are URL-safe, so this is harmless.

---

### 3.1 `GET /api/state`

* Called once at boot. If it fails, the page shows `"BUILD could not start: <error>"` (`app/main.js:134`, `:1093-1096`). It is called again when a hidden tab becomes visible (`app/api.js:91`) and merged with `{ ...api.snapshot, ...s }`.
* The response is the full snapshot. The fields read are in §6. The reference sample is `docs/reference/state.json`, with top-level keys `now, stats, agents, coins, feed, tokens, flywheel, thoughts, thinking, config, bonded`.

### 3.2 `GET /api/stream`

SSE. See §5.

### 3.3 `GET /api/agents/:id`

```js
getAgent: (id) => json('/api/agents/' + encodeURIComponent(id)).catch((e) => (/not found/i.test(e.message) ? null : Promise.reject(e))),
```

* The response is the **agent detail object** (sample `docs/reference/agent.json`). The fields read are in §6.3.
* Unknown agent: return a non-2xx status (404) with `{"error":"Agent not found"}`. **The error text must match `/not found/i`**, which makes `getAgent` return `null`. The agent page then shows "Builder X not found" (`app/pages/agent.js:578`) and the market buy modal shows "This builder is not for sale any more." (`app/main.js:843-844`). Any other error rejects the promise.
* Callers:
  * `AgentPage.fetchDetail` (`app/pages/agent.js:576`) runs on mount, on every snapshot `update` (throttled to 2.5 s), after a trade by this agent (`onTrade`, matched by `t.agentNo === d.no`), and on `market` events.
  * Launch poll (`app/pages/launch.js:330`) runs every 2.5 s for up to 4 minutes and reads `rawStatus`, `coin.uri`, `error`, `no`, `coin.mint` and `coin.launchSig`.
  * Market buy pre-check (`app/main.js:843-845`) reads `fresh.market` and `fresh.market.price`.
  * Re-fetch after withdraw-all in the sell modal (`app/main.js:724`) reads `positions` and `balanceSol`.

### 3.4 `GET /api/blockhash`

* Called by `sendSol`, `sendToken` and `sendCoreAsset` before every wallet transaction (`app/wallet.js:267`, `:283`, `:317`): `const { blockhash, lastValidBlockHeight } = await getBlockhash();`
* Response (`docs/reference/blockhash.json`):
  ```json
  {"blockhash":"EkVjxCSJRajmfaUnBdSpo3TnWGWcT1gip6Z4hR8R2LAm","lastValidBlockHeight":431335894}
  ```
  `blockhash`: base58 string. `lastValidBlockHeight`: integer. Both are passed to `new w3.Transaction({ feePayer, blockhash, lastValidBlockHeight })`. Use commitment `confirmed` or `finalized` on mainnet.

### 3.5 `POST /api/launch/prepare`

Request (`app/pages/launch.js:300-309`):

```js
prep = await app.api.prepareLaunch({
  creator: wallet.address,
  coin: { name: f.name.trim(), ticker: f.ticker, description: f.description.trim(), twitter: f.twitter.trim(), website: f.website.trim(), telegram: f.telegram.trim() },
  agentName: f.agentName.trim(),
  startingCapital: capital,
  image: f.image || robotPNG(f.botSeed),
  avatarSeed: f.botSeed,
  strategy: f.strategy,
  riskAck: needsAck() ? f.riskAck === true : undefined,
});
```

| field | type | notes |
|---|---|---|
| `creator` | string (base58 pubkey) | the connected wallet. **Not signed.** |
| `coin.name` | string, 1–32 | |
| `coin.ticker` | string | `/^[A-Z0-9]{2,10}$/` (validated client-side, `launch.js:254`) |
| `coin.description` | string ≤ 280 | may be `""` |
| `coin.twitter` | string ≤ 120 | may be `""` |
| `coin.website` | string ≤ 160 | **always `""` when `config.siteUrl` is set**: the field is then a locked `<div>`, not an input (`launch.js:164`), so the server should set the website itself, e.g. `${siteUrl}/#/builder/<no>` |
| `coin.telegram` | string ≤ 120 | may be `""` |
| `agentName` | string 1–24 | |
| `startingCapital` | number (SOL) | `>= config.launch.minStartingCapital` and `<= maxStartingCapital` when that is set |
| `image` | string | **data URL** (`data:image/png;base64,…`, or `image/jpeg` if the PNG is over 1.3 MB). Either the user upload re-encoded at 512×512 (`launch.js:274-279`) or the generated robot PNG (`robotPNG`) |
| `avatarSeed` | string | robot seed, e.g. `"rpnoe39ib"` |
| `strategy` | string | built-in id (`classic`, `scalper`, …, `newpairs`) or a custom id `custom-…` |
| `riskAck` | boolean, optional | only present when the chosen strategy has `risk: 'extreme'` |

The client also collects `f.skin`, but it is **not** sent. The skin is bought after launch.

Response fields read (`launch.js:312-325`):

| field | type | use |
|---|---|---|
| `agentId` | string | used in `/api/launch/:id/funded`, `getAgent`, navigation |
| `wallet` | string | the new builder wallet; the SOL transfer goes here |
| `requiredSol` | number | the amount sent: `sendSol(prep.wallet, prep.requiredSol, ...)`. The page explains it as `startingCapital + config.launch.launchReserveSol` |

### 3.6 `POST /api/launch/:id/image`

`setLaunchImage: (id, image) => post(`/api/launch/${id}/image`, { image })` (`api.js:34`). **No call site in the frontend.** Optional; body would be `{ image }`.

### 3.7 `POST /api/launch/:id/funded`

Request: `{ "signature": "<base58 tx signature>" }`. This is the signature of the creator's SOL transfer to `prep.wallet`. Callers:

* Launch page (`launch.js:325`): `let r = await app.api.confirmFunding(prep.agentId, signature);`. Its errors are **not caught locally**, so a rejection fails the launch progress modal. After that the page polls `getAgent`; if `rawStatus` is still `AWAITING_FUNDS` after 30 s it calls `confirmFunding` again on every poll (`launch.js:332`, errors swallowed).
* "Send SOL" on an `AWAITING_FUNDS` agent (`app/main.js:338`): `if (isLaunch) await api.confirmFunding(agent.id, sig);` The error is shown to the user.

The response is not read. The server should verify that the transfer reached the builder wallet (it may not be confirmed yet), then move the agent to `LAUNCHING` → `ACTIVE`. **Do not return an error just because the tx is still unconfirmed**: the first call has no retry. Accept it, wait/poll, or rely on the wallet watcher. The page text says the server also detects SOL sent manually within 30 minutes (`launch.js:319`) and that unfunded launches expire after 30 minutes (`agent.js:197`, `config.launch.fundingTimeoutMs = 1800000`).

### 3.8 `POST /api/agents/:id/deposit`

Request: `{ "signature": "<base58 tx signature>" }` (`app/main.js:339`). This is the signature of a SOL transfer from the creator to `agent.wallet`. The response is not read. Errors are shown in the modal. The same "unconfirmed yet" consideration applies.

### 3.9 `POST /api/agents/:id/withdraw` (signed: `withdraw`)

Request: `{ all: boolean, amountSol?: number, message, signature, signedMessage? }`.
Response fields read (`app/main.js:898`, `:723`):

| field | type | use |
|---|---|---|
| `amount` | number (SOL) | toast "Withdrew X SOL" |
| `sig` | string | solscan link |
| `notes` | string[] (optional) | joined with a space and shown in the toast |

`all: true` means: pause, sell every position, then send all SOL (`main.js:876`). The withdraw tile shows "locked: for sale" when `agent.market` is set (`agent.js:71`), so the server should reject withdrawals while the agent is listed.

### 3.10 `POST /api/agents/:id/pause` (signed: `pause` / `resume`)

Request: `{ paused: boolean, message, signature, signedMessage? }`. The `Action:` line is `pause` when `paused: true` and `resume` when `paused: false`. The response is not read.

### 3.11 `POST /api/agents/:id/strategy` (signed: `strategy`)

Request: `{ strategy: "<id>", message, signature, signedMessage? }`. The `id` can be a built-in id or the creator's custom id. `RISK_ACK` is in the message when the strategy is extreme. The response is not read.

### 3.12 `POST /api/agents/:id/retry` (signed: `retry`)

Request: `{ message, signature, signedMessage? }`. Restarts a `LAUNCH_FAILED` launch. The response is not read.

### 3.13 `POST /api/agents/:id/skin/buy` (unsigned; tx signature)

Request: `{ skin: "<skinId>", signature: "<base58 tx signature of the token payment>" }` (`app/main.js:480`). **There is no `message` here: `signature` is the SPL-transfer transaction signature.**

Retry logic (`main.js:478-483`):

```js
for (let i = 0; i < 4 && !r; i++) {
  try { r = await api.buySkin(agent.id, { skin: sel, signature: sig }); }
  catch (e) { lastErr = e; if (!/not found yet/i.test(e.message)) break; }
}
```

The frontend retries up to 4 times **back-to-back with no delay**, and only when the error matches `/not found yet/i`. So the server itself should wait several seconds for the tx to confirm before giving up with "… not found yet …". The response is only checked for truthiness. Afterwards the client sets `agent.skin = sel` and adds `sel` to `agent.skins`, so **the server must auto-equip the bought skin**.

### 3.14 `POST /api/agents/:id/skin` (signed: `skin`)

Request: `{ skin: "<skinId>" | "default", message, signature, signedMessage? }`. Wears an owned skin, or `default` to remove the skin. The response is not read.

### 3.15 `POST /api/agents/:id/skin/hold` (signed: `skin-hold`)

Only used for limited skins (`it.stock` is set). Request: `{ skin, message, signature, signedMessage? }`. Response `h` is **merged into the skin's stock object**: `it.stock = { ...it.stock, ...h };` (`main.js:467`). It should return stock-shaped fields, `{ max, sold, held, left }` (plus anything else, e.g. an expiry). `sold` and `max` drive the "sold out" logic. Page text: the hold lasts 10 minutes.

### 3.16 `GET /api/agents/:id/skin/quote?skin=<skinId>`

**No buyer parameter**: the server must quote for `agent.creator`. Response fields read (`main.js:471-476`):

```js
const qt = await api.quoteSkin(agent.id, sel);
const n = Number(qt.tokens).toLocaleString('en', { maximumFractionDigits: 2 });
...
sig = await sendToken({ to: qt.payTo, mint: qt.mint, program: qt.program, raw: qt.raw, decimals: qt.decimals, fromAccount: qt.fromAccount }, api.blockhash);
```

| field | type | meaning |
|---|---|---|
| `tokens` | number or numeric string | UI amount of the token, for display |
| `payTo` | string (pubkey) | **owner** wallet that receives the tokens (the client derives that wallet's ATA itself) |
| `mint` | string | token mint (e.g. `config.skins.payWith.mint`) |
| `program` | string | token program id: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA` or Token-2022 `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb` |
| `raw` | string (integer) or number | base-unit amount, passed to `BigInt(raw)`. **A string is safest** (u64) |
| `decimals` | integer | used in `TransferChecked` |
| `fromAccount` | string, optional | the payer's source token account. If omitted, the client uses the payer's ATA for (`mint`, `program`) |

The UI says the price is "fixed for 10 minutes". The server should remember the quote (raw amount, payTo) per agent/skin and accept a matching payment within that window.

### 3.17 `GET /api/burns?who=agent|dev`

Called as `getBurns('agent')` (`pages/burns.js:45`) and `getBurns('dev')` (`pages/burns.js:107`). `/api/burns` without `who` is defined but never called this way. Sample `docs/reference/burns.json` (it has every key):

```json
{"enabled":false,"mint":null,"pct":0.1,"totalSol":0,"totalTokens":0,"count":0,"queuedSol":0,"recent":[],
 "agents":{"totalSol":0,"totalTokens":0,"count":0,"queuedSol":0,"skinTokens":0,"skinBurns":0},
 "dev":{"enabled":false},"burns":[]}
```

Fields read:

* `who=agent`: `r.agents.{totalSol,totalTokens,count,queuedSol}` (falls back to `snapshot.flywheel.agents`), plus `r.burns[]`.
* `who=dev`: `r.dev.{enabled,lastError,pendingSol,wallet,buybackSol,burnedTokens,burns(count, number),inProgress,maxBuySol,minBuySol,claimedSol,pct,claims[]}`, plus `r.burns[]` (dev burns). Mapping used: `{ totalSol: d.buybackSol, totalTokens: d.burnedTokens, count: d.burns, queuedSol: d.pendingSol }` (`burns.js:86`).
* `dev.claims[]`: `{ ts, claimedSol, buybackSol, sig }` (`burns.js:91`).
* `burns[]` row (`burns.js:20-32`): `{ id, ts, agentNo, avatarSeed, agentName, source ('agent'|'skin'|'dev'), skinName, coinTicker, sol, tokens, buySig?, burnSig }`. In the dev table only `ts, sol, tokens, buySig, burnSig` are shown. `burn` SSE events have the same row shape (§5).

### 3.18 `POST /api/agents/:id/office` (signed: `office`)

Request: `{ office: <1..6>, message, signature, signedMessage? }`. Allowed when `office <= agent.level.no`. The response is not read. Afterwards the client sets `d.office = n`.

### 3.19 `GET /api/custom-strategy/:owner`

`getCustom: (owner) => json('/api/custom-strategy/' + encodeURIComponent(owner)).then((r) => r.strategy)`

Response: `{ "strategy": null }` (`docs/reference/custom.json`), or `{ "strategy": { … } }`. Errors are caught and treated as `null` at every call site. Fields read from the strategy object:

* identity/UI: `id` (must start with `custom-`, see `ui.js:165` `isCustomStrat`), `name`, `custom: true`, `tagline`, `goal`, `base`, `baseName`, `risk`
* editor (`main.js:533-535`): `base`, `params` (the flat FIELDS object), `name`, `prompt`
* rules display (`ui.js:179-190`): `sizePct`, `takeProfitPct`, `stopLossPct`, `trail: {at,by}|null`, `maxHoldMin`, `maxOpen`, `cooldownMin`, `maxTradeSol`

So the object should be the runtime shape (`toRuntime` in `shared/custom-strategy.js:100-107`), plus `id`, `params`, `prompt`, `tagline`, `goal` and `baseName`.

### 3.20 `POST /api/custom-strategy` (signed: `custom-strategy`)

Request (`main.js:669`):

```js
await api.saveCustom({ owner: wallet.address, name: clean.name, base: clean.base, params: clean.params, prompt: q('#cs-prompt').value.trim(), applyTo: agent ? agent.id : undefined, ...auth });
```

`params` is already sanitised by `shared/custom-strategy.js` `sanitize()`. `applyTo` (agent id) is present only when the strategy is opened from an agent: apply it to that agent too (creator only). When `applyTo` is absent, the message has `Builder: none`.

Response read: `r.strategy` (the saved strategy object, same shape as §3.19). `r.strategy.name` is used in the toast and the object is passed to `onSaved`.

### 3.21 `POST /api/custom-strategy/prompt`

Request: `{ prompt: "<free text, ≤600 chars>" }` (unsigned). The prompt may be `""`.
Response read (`main.js:639-651`):

| field | type |
|---|---|
| `base` | one of `classic, scalper, trend, dip, sniper` |
| `params` | object (partial FIELDS; merged over the defaults) |
| `name` | string (suggested name) |
| `understood` | string[] (**required**: `.length` is read) |
| `notes` | string[] (**required**) |
| `risks` | string[] (optional) |

`config.promptAi` (boolean) only changes a label ("Read by AI" or "Read by the built-in reader").

### 3.22 `GET /api/market?wallet=<addr>`

`wallet` is sent only when a wallet is connected. Sample `docs/reference/market.json`:

```json
{"enabled":true,"payTo":"5n6h…Y1Gu","payWith":"BUILD","mint":"AXxR…pump","tokenPriceSol":0.000001136,
 "feePct":0.05,"minPriceSol":0.05,"maxPriceSol":1000,"maxWalletSol":0.01,
 "listed":0,"sold":0,"volumeSol":0,"listings":[],"sales":[],"refunds":[]}
```

Fields read (`pages/market.js`):

* top level: `enabled`, `listed`, `sold`, `volumeSol`, `feePct`, `payTo`, `listings[]`, `sales[]`, `refunds[]`
* `listings[]` (`market.js:18-39`, and `marketBuyModal` `main.js:821-869`): `id`, `no`, `name`, `avatarSeed`, `coin{ticker,mcapUsd}`, `level` (levelBadge: `no,color,max,name`), `strategy`, `strategyName`, `strategyPrompt`, `realizedPnlSol`, `closedTrades`, `wins`, `feesTotalSol`, `price` (SOL number, `.toFixed` is called on it), `priceTokens`, `creator`, `seller`, `listedAt`, **`wallet`** (signed into the market-buy intent)
* `sales[]` (`market.js:41-52`): `ts`, `agentNo`, `avatarSeed`, `agentName`, `priceSol`, `seller`, `buyer`, `paySig`, `payoutSig?`
* `refunds[]` (`market.js:67-68`): `status` (`'paid'`, …), `ts`, `tokens?`, `sol?`, `note`, `sig?`

The `wallet` query parameter presumably lets the server personalise (for example refunds for that wallet). The frontend does not depend on that.

### 3.23 `POST /api/agents/:id/market/list` (signed: `market-list`)

Request: `{ price: <number SOL, 4 dp>, message, signature, signedMessage? }`.
Response read: `r.listing?.escrow` (`main.js:754`). If it is falsy (a new listing whose NFT is not in escrow yet), the client immediately sends the agent's Core NFT to `config.market.payTo` (§4.5). If it is truthy (re-pricing an escrowed listing), it only shows a toast. Page text: the listing is removed if the NFT does not arrive within 20 minutes (`main.js:759`). Client-side pre-conditions the server should also enforce (`main.js:711-716`): `agent.nft.asset` is set, no open `positions`, `balanceSol <= config.market.maxWalletSol`, and `price >= minPriceSol`.

### 3.24 `POST /api/agents/:id/market/delist` (signed: `market-delist`)

Request: `{ message, signature, signedMessage? }`. The response is not read. Page text: the NFT comes back to the owner automatically within a minute.

### 3.25 `GET /api/agents/:id/market/quote?buyer=<addr>`

Same response shape as the skin quote (§3.16): `tokens`, `payTo`, `mint`, `program`, `raw`, `decimals`, `fromAccount?` (`main.js:847-854`). "Fixed for 10 minutes".

### 3.26 `POST /api/agents/:id/market/buy` (signed: market-buy intent)

Request (`main.js:807`):

```js
api.marketBuy(p.agentId, { buyer: p.buyer, payment: p.payment, message: p.message, signature: p.signature, signedMessage: p.signedMessage })
```

| field | meaning |
|---|---|
| `buyer` | buyer wallet (= `Buyer:` line) |
| `payment` | base58 **transaction signature** of the SPL token payment to the quote's `payTo` |
| `message`, `signature`, `signedMessage?` | the signed intent (§2.5) |

Retry: up to 5 times, 3 s apart, while the error matches `/not found yet/i` (`main.js:804-813`). The request body is saved in `localStorage['build-market-pending']` and re-posted up to 25 minutes later after a reload (`main.js:814-819`), so **the endpoint must be idempotent** (a second call for an already-completed purchase should succeed, or at least fail with something other than "not found yet"). The response is only checked for truthiness. Page text: if someone else bought first, or the price changed or was too low, the BUILD is refunded automatically (shown via `market.refunds`).

### 3.27 `POST /api/agents/:id/nft/mint` (signed: `nft-mint`)

Request: `{ message, signature, signedMessage? }`. The response is not read. Progress is then shown through `agent.nftJob` `{status, error}` and finally `agent.nft` `{asset, collection}`. The server pays the mint fee ("Free for you: BUILD pays the mint").

### 3.28 `POST /api/agents/:id/x/connect` (signed: `x-connect`)

Request: `{ message, signature, signedMessage? }`. Response read: **`url`** (string). The browser goes to it: `location.href = r.url; // X login, then X sends the creator back to the builder page` (`main.js:279`). See §8 for the callback redirect contract.

### 3.29 `POST /api/agents/:id/x/settings` (signed: `x-settings`)

Request: `{ settings: { trades, recap, promos, images, … }, message, signature, signedMessage? }`. The response is not read.

### 3.30 `POST /api/agents/:id/x/disconnect` / `POST /api/agents/:id/x/post`

Request: `{ message, signature, signedMessage? }`. The responses are not read. After `x/post` the page re-fetches the agent after 4 s.

---

## 4. On-chain flows

**The server never returns a serialized transaction.** Every wallet transaction is built in the browser with `@solana/web3.js` (`window.solanaWeb3`), given a server blockhash, and sent with the wallet's `signAndSendTransaction` (`app/wallet.js:99-105`, `:134-139`). That call returns the tx signature (base58). The client then posts the signature to the server, and the server verifies the transaction on-chain.

### 4.1 Launch funding

1. `POST /api/launch/prepare` → `{ agentId, wallet, requiredSol }`.
2. Client: `sendSol(prep.wallet, prep.requiredSol, app.api.blockhash)` (`launch.js:317`). `sendSol` (`wallet.js:262-273`):
   ```js
   const { blockhash, lastValidBlockHeight } = await getBlockhash();
   const from = new w3.PublicKey(wallet.address);
   const tx = new w3.Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
     w3.SystemProgram.transfer({ fromPubkey: from, toPubkey: new w3.PublicKey(to), lamports: Math.round(sol * 1e9) }),
   );
   return a.sendTransaction(tx);
   ```
3. `POST /api/launch/:agentId/funded {signature}`.
4. Poll `GET /api/agents/:agentId` every 2.5 s: `rawStatus` goes `AWAITING_FUNDS` → `LAUNCHING` (with `coin.uri` once the IPFS metadata is uploaded) → `ACTIVE`, or `LAUNCH_FAILED` with `error`. When it is `ACTIVE` the page shows `coin.mint` and `coin.launchSig`, then "Builder NNN is live" from `d.no`.

The server must: generate and custody the builder keypair, verify incoming SOL (the transfer can also be manual, without `/funded`), upload the image and metadata to IPFS (the old server used Pinata: "The operator needs to add PINATA_JWT", `launch.js:138`), and create the pump.fun coin from the builder wallet (with a `config.launch.devBuySol` dev buy).

### 4.2 Fund-launch top-up and Add SOL (deposit)

Same `sendSol` to `agent.wallet`. For an `AWAITING_FUNDS` agent the amount is `requiredSol - balanceSol` (read-only input) and the post goes to `/api/launch/:id/funded`. Otherwise it is a free amount (presets 0.1/0.25/0.5/1) posted to `/api/agents/:id/deposit` (`main.js:314-348`).

### 4.3 Skin purchase (BUILD token payment)

1. Limited skin only: signed `skin-hold` → `POST …/skin/hold`.
2. `GET …/skin/quote?skin=` → `{tokens,payTo,mint,program,raw,decimals,fromAccount?}`.
3. Client builds an SPL transfer (`wallet.js:278-307`):
   ```js
   const from = fromAccount ? P(fromAccount) : ata(owner), toAcc = ata(dest);
   // ix 1: Associated Token Account program, data [1] = CreateIdempotent (payer=owner, ata=toAcc, owner=dest, mint, system, tokenProgram)
   // ix 2: token program, data [12, u64 LE raw, decimals] = TransferChecked (source=from, mint, dest=toAcc, authority=owner)
   ```
   `dest` is `qt.payTo`, the **owner** wallet. The client derives the ATA with the `program` from the quote.
4. `POST …/skin/buy {skin, signature}`, retried while the error matches "not found yet".
5. The server verifies a TransferChecked of ≥ `raw` of `mint` to `ata(payTo)` from the creator. It then records the skin as owned and worn, burns `skins.payWith.burnPct` of it if `skins.payWith.burn` is set (a `burn` event with `source: 'skin'`), and for `nft` skins mints the skin NFT to the creator's wallet.

### 4.4 Builder market purchase (BUILD token payment)

1. `GET /api/agents/:id` (fresh `market.price` must equal the listing price).
2. `GET …/market/quote?buyer=`.
3. Sign the market-buy intent (§2.5).
4. `sendToken(...)` to `qt.payTo` (the market wallet), with the same instructions as §4.3.
5. `POST …/market/buy {buyer, payment, message, signature, signedMessage?}` (retry plus localStorage resume).

The server then: verifies the payment and that it is the first valid one; transfers ownership (sets `creator` = buyer and sends the escrowed Core NFT to the buyer); pays the seller `price × (1 − feePct)` in BUILD (`sales[].payoutSig`); refunds failed or late payments (`refunds[]`); and emits `sale` and `market` events.

### 4.5 Listing: NFT escrow transfer (Metaplex Core)

After `market/list` returns without `listing.escrow`, or when the "Send the NFT" (`market-escrow`) action is used, the client calls (`main.js:683-687`):

```js
return sendCoreAsset({ asset: agent.nft.asset, collection: agent.nft.collection, to: C.payTo }, api.blockhash);
```

`sendCoreAsset` (`wallet.js:309-334`) builds Core `TransferV1` (program `CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`, data `[14, 0]`) with accounts asset(w), collection or Core program as the "none" placeholder, payer(s,w), authority(s), newOwner = `config.market.payTo`, system program, and logWrapper = Core program. **The signature is not posted to the server.** The server must notice the NFT arriving in the market wallet (it watches, "under a minute") and then set `listing.escrow` truthy. `agent.nft` must provide `asset` and `collection` (which can be null).

### 4.6 Server-side only (no client transaction)

These are triggered by signed messages: withdraw (the server sells positions and sends SOL to the creator: `amount`, `sig`), NFT mint (the server pays), market delist (the server returns the NFT), and promotion rewards (`config.rewards.wallet` pays `reward` events).

---

## 5. SSE `/api/stream`

### 5.1 Client code

`app/api.js:63-93`:

```js
es = new EventSource('/api/stream');
es.addEventListener('snapshot', (ev) => {
  const s = JSON.parse(ev.data);
  api.snapshot = { ...api.snapshot, ...s, feed: api.snapshot.feed, bonded: api.snapshot.bonded || [] };
  if (s.config) api.config = s.config;
  h.emit('update', api.snapshot);
});
es.addEventListener('trade', (ev) => {
  const t = JSON.parse(ev.data);
  api.snapshot.feed = [t, ...(api.snapshot.feed || [])].slice(0, 60);
  h.emit('trade', t);
});
es.addEventListener('bonded', (ev) => {
  const b = JSON.parse(ev.data);
  api.snapshot.bonded = [b, ...(api.snapshot.bonded || []).filter((x) => x.mint !== b.mint)].slice(0, 12);
  h.emit('bonded', b);
});
for (const type of ['launch', 'fund', 'fees', 'levelup', 'reward', 'skin', 'burn', 'devclaim', 'market', 'sale']) es.addEventListener(type, (ev) => h.emit('event', type, JSON.parse(ev.data)));
```

* Only **named** events are handled. There is no `onmessage`, so unnamed `data:` lines are ignored. **There are no `thoughts`, `thinking` or `event` SSE event types**: `thoughts` and `thinking` are fields of the `snapshot` payload. Every `data:` must be a single line of valid JSON (`JSON.parse` throws otherwise).
* A background tab closes the stream after 60 s hidden and reopens it (plus a `GET /api/state`) when the tab is shown again.
* `snapshot` is a **shallow merge**. It may be partial (only the keys that changed). `feed` and `bonded` inside a snapshot are **ignored**: the client keeps the feed from `/api/state` plus `trade` events, and `bonded` from `/api/state` plus `bonded` events.
* Format in `stream.txt`: `retry: 3000`, then `event: <name>\ndata: <json>\n\n`, with `: ping` comment keep-alives.

### 5.2 Events and the payload fields read

| event | payload fields read | consumers |
|---|---|---|
| `snapshot` | any subset of the state keys (§6.1). The first event in `stream.txt` has `now, stats, agents, coins, tokens, flywheel, thoughts, thinking, arena, companies, config`; the next has only `now, agents, coins, tokens, thoughts, config` | every page `update(snap)`, ticker tape (`main.js:998`), CA chip (`main.js:1075`) |
| `trade` | same object as a `state.feed[]` item: `id, agentNo, agentName, avatarSeed, side ('BUY'/'SELL'), symbol, sol, pnlPct (SELL), source, sig, reason, ts`. The office uses `symbol, side, sol` | home feed `feedItem` (`ui.js:91-112`), home activity, `AgentPage.onTrade` (`t.agentNo === d.no`), 3D office |
| `bonded` | `mint` (dedupe key), `ts`, `name`, `symbol`, `image`, `mcapUsd` (`phone3d.js:184-199`) | home phone `push(b)` |
| `launch` | `agentId` (looked up in `snapshot.agents` 3.5 s later for `no, name, coin.ticker, avatarSeed`) | toast + home `onLaunch` (`main.js:1022-1028`) |
| `fund` | **ignored** (subscribed, no handler) | – |
| `fees` | **ignored** (subscribed, no handler) | – |
| `levelup` | `agentName, from, to, no, rewardSol, avatarSeed` | toast + `onLevelUp` (`main.js:1005-1008`) |
| `reward` | `amountSol, agentName, level, sig` | toast (`main.js:1002-1004`) |
| `skin` | `skinName, agentName, avatarSeed` | toast (`main.js:1019-1021`) |
| `burn` | `source ('dev'/'agent'/'skin'), agentName, sol, tokens, avatarSeed`, plus the full burn row (`id, ts, agentNo, coinTicker, skinName, buySig, burnSig`), because `AgentBurnsPage.onBurn` prepends it to the table (`burns.js:77`) | toast + burns pages |
| `devclaim` | nothing (reload trigger) | `DevBurnsPage.onDevClaim` → `getBurns('dev')` |
| `market` | `agentId` (optional; when absent, every agent page refreshes) | `AgentPage.onMarket`, `MarketPage.onMarket` → reload |
| `sale` | `agentName, priceSol, avatarSeed`, plus `agentId` (also forwarded to `onMarket`) | toast + reload |

### 5.3 Trimmed examples

From `docs/reference/stream.txt`:

```
retry: 3000

event: snapshot
data: {"now":1791127815615,"stats":{"agentsActive":3,"agentsTotal":9,"trades24h":131,"volume24hSol":8.112503335,"aumSol":2.285453588278775,"pnlSol":0.9002668362787749,"feesClaimedSol":1.045317676,"toCreatorsSol":0,"solUsd":121.78,"tradingEnabled":true,"marketReady":true},"agents":[{"id":"ag_dempar4q","no":9,"name":"Wolf of Wallstreet","avatarSeed":"r5aignhac","wallet":"9B8i…mn1s","creator":"E517…7nXd","skin":null,"skins":[],"baseSeed":"r5aignhac","office":1,"nft":null,"strategy":"newpairs","level":{"no":1,"name":"Apprentice","color":"#8E9199","bestProfitSol":0,"next":{"no":2,"name":"Bricklayer","minProfitSol":0.1,"color":"#2F6FE0","rewardSol":0.005},"progress":0,"max":6},"coin":{"name":"Wolf of Wallstreet","ticker":"WOLF","mint":"BVkV…9rpz","image":"https://ipfs.io/ipfs/bafy…","mcapUsd":3408.57},"balanceSol":0.490513771,"equitySol":0.490513771,"depositedSol":0.490513771,"pnlSol":0,"pnlPct":0,"trades":0,"openPositions":0,"winRate":null,"status":"LOW BALANCE","paused":false,"feesKeptSol":0,"feesToCreatorSol":0,"flywheelSol":0,"flywheelTokens":0,"createdAt":1791127409922,"lastTradeAt":0,"spark":[0.490514,0.490514],"rank":{…},"company":null,"inDuel":false}, …],"coins":[…],"tokens":[…],"flywheel":{"enabled":false,"mint":null,"pct":0.1,"totalSol":0,"totalTokens":0,"count":0,"queuedSol":0,"recent":[],"agents":{"totalSol":0,"totalTokens":0,"count":0,"queuedSol":0,"skinTokens":0,"skinBurns":0},"dev":{"enabled":false}},"thoughts":[{"id":"th_zk06kmm1","ts":1791127815335,"agentId":"ag_0suhmvqn","agentNo":6,"agentName":"Bob","ticker":"BOB","image":"https://ipfs.io/ipfs/bafk…","avatarSeed":"rubt24m6t","action":"BUY","symbol":"SA","text":"Best score on the board was $SA (+14.8% 5m, $83K liquidity). Position opened.","blocked":"Trade size 0.0194 SOL is below the 0.02 SOL minimum","failed":false,"note":false,"levelUp":null,"trade":null}, …],"thinking":5,"arena":{…},"companies":[…],"config":{…}}

: ping

event: market
data: {}

event: snapshot
data: {"now":1791127818046,"agents":[…9],"coins":[…9],"tokens":[…12],"thoughts":[…40],"config":{…}}
```

The `arena`, `companies`, `agent.rank`, `agent.company`, `agent.inDuel` and `config.{arena,companies,ranks}` fields in the stream are **not read by this frontend**. They can be dropped.

`stream.txt` contains no other event types. The examples below are built from the frontend reads and the `state.json` shapes (`trade` = a `feed[]` item, `bonded` = a `bonded[]` item):

```
event: trade
data: {"id":"tr_48xulj4a","agentId":"ag_hpgsnchu","side":"SELL","mint":"HKZD…pump","symbol":"MISTAKE","sol":0.019475205,"tokens":317.49,"priceUsd":0.007693,"pnlSol":-0.0054,"pnlPct":-0.2174,"heldMs":589701,"source":"ai","reason":"Sold $MISTAKE at -19.1%. Trend broken, early exit.","ts":1791125313812,"sig":"5AkJ…oki","url":"https://solscan.io/tx/5AkJ…","agentNo":7,"agentName":"Moelicious","avatarSeed":"ry0yfu7qx","coinTicker":"MOMONEY"}

event: bonded
data: {"mint":"Xs3o…pH8","ts":1791125319149,"name":"SpaceX xStock","symbol":"SPCXx","image":null,"mcapUsd":1603344645,"liquidityUsd":1078587.99,"pool":"raydium-cpmm"}

event: launch
data: {"agentId":"ag_dempar4q"}

event: levelup
data: {"agentId":"ag_…","agentName":"Bob","avatarSeed":"rubt24m6t","from":"Apprentice","to":"Bricklayer","no":2,"rewardSol":0.005}

event: reward
data: {"agentId":"ag_…","agentName":"Bob","level":"Bricklayer","amountSol":0.005,"sig":"…"}

event: skin
data: {"agentId":"ag_…","agentName":"Bob","avatarSeed":"rubt24m6t","skin":"welder","skinName":"The Welder"}

event: burn
data: {"id":"bn_…","ts":1791125319149,"source":"agent","agentId":"ag_…","agentNo":6,"agentName":"Bob","avatarSeed":"rubt24m6t","coinTicker":"BOB","sol":0.01,"tokens":10183.4,"buySig":"…","burnSig":"…"}

event: sale
data: {"agentId":"ag_…","agentName":"Bob","avatarSeed":"rubt24m6t","priceSol":2.5}

event: devclaim
data: {}

event: fund
data: {}

event: fees
data: {}
```

Feed `source` values seen: `ai`, `take-profit`, `trailing-stop`, `stop-loss` (state.json) and `withdraw` (agent.json). The frontend also knows `time-exit` and `rugged` (`ui.js:76-84`).

---

## 6. State and agent objects

Legend: **R** = required (missing or wrong type throws, or breaks a page); **F** = functional (used for logic; missing gives wrong behaviour but no crash); **C** = cosmetic (display only; missing shows `–`, `0` or blank).

### 6.1 Top-level snapshot (`GET /api/state`)

| key | type (sample) | status | read at |
|---|---|---|---|
| `config` | object | **R**: `api.config.tradingEnabled` is read right after boot (`main.js:137`); missing → boot crash | everywhere |
| `agents` | array | **R**: `snap.agents.filter/map` without a guard (`main.js:911`, `home.js:184`, `lists.js:49`) | home, lists, shill, skins, launch toast |
| `coins` | array | **R** on home (`snap.coins.length`, `home.js:185`) | home "New builds", activity, office bubbles |
| `tokens` | array | **R**: `paintTape(api.snapshot.tokens)` calls `tokens.slice()` (`main.js:959`, `:976`) | tape, tokens page, office |
| `stats` | object | **R** on the agent page (`app.api.snapshot.stats.solUsd`, `agent.js:241`, `:320`); the home page tolerates it missing | home stats |
| `feed` | array | C (guarded) | home feed and activity, office |
| `thoughts` | array | C (guarded) | home "Builders, right now", activity |
| `thinking` | integer | C ("N on shift") | home |
| `bonded` | array | C (`|| []`) | home phone |
| `flywheel` | object | F (burns-page fallback totals) | burns pages |
| `now` | integer ms | unused | – |

`stats` fields read (`home.js:59-63`, `agent.js:241`): `agentsTotal, volume24hSol, pnlSol, agentsActive, trades24h, aumSol` (C) and `solUsd` (**R** on the agent page, used as a number). Unused: `feesClaimedSol, toCreatorsSol, tradingEnabled, marketReady`.

`agents[]` (the list object, smaller than the detail object; sample in `state.json`):

| key | type | status | notes / read at |
|---|---|---|---|
| `id` | string | **R** | keys, shill select, skins picker, launch toast |
| `no` | int | **R** | every `#/builder/${no}` link, `agentNo()` |
| `name` | string | **R** (`a.name.toLowerCase()` in the leaderboard search, `lists.js:15`) | |
| `avatarSeed` | string | F | robot avatar |
| `baseSeed` | string | F | office figure (falls back to avatarSeed) |
| `creator` | string | **F** (ownership: "My builders", home, skins) | |
| `wallet` | string | present; not read from the list | |
| `status` | `ACTIVE`/`PAUSED`/`LOW BALANCE`/`AWAITING_FUNDS`/`LAUNCHING`/`LAUNCH_FAILED`/`EXPIRED` | F | pills and filters (`ui.js:60-72`) |
| `paused` | bool | F | |
| `strategy` | string id | F | `strategyById` |
| `skin` | string\|null | F | office model; `SKIN_MODELS[skin]` |
| `skins` | string[] | F | |
| `office` | int\|null | F | falls back to `level.no` |
| `level` | `{no,name,color,bestProfitSol,progress,max,next:{no,name,minProfitSol,color,rewardSol}\|null}` | C (guarded with `?.` / `if (!l)`) | badges and bars |
| `coin` | `{name,ticker,mint,image,mcapUsd}` or null | F (`a.coin?.…`) | shill requires `coin.mint` |
| `equitySol, pnlSol, pnlPct, depositedSol, trades, winRate (null ok), lastTradeAt, createdAt, openPositions` | numbers | C/F (sorting) | lists, home, shill |
| `spark` | number[] | C | sparkline |
| `nft` | null/object | not read from the list | |
| `balanceSol, feesKeptSol, feesToCreatorSol, flywheelSol, flywheelTokens` | numbers | unused in the list views | |

`coins[]`: `mint, ticker, name, image, createdAt, agentId, mcapUsd` (C; the `agentId` link is F). Extra keys in the sample: `description, twitter, telegram, website, uri, pendingMint, launchSig, athUsd, agentNo`.

`feed[]`: see the `trade` event. `ts` is ms since the epoch. `pnlPct` and `pnlSol` exist only on SELL.

`tokens[]` (`lists.js:74-105`, tape, office): `mint` (**R** as the tape key), `symbol` (**R**: `t.symbol` is escaped and `(t.symbol||'?')[0]`), `name, icon, dexId, url, priceUsd, mcapUsd, liquidityUsd, volume24hUsd, change5m, change1h, change24h, ageHours, agents, eligible, spark`. Fractions: `change1h: -0.0024` means −0.24%. Unused: `pair, priceSol, volume1hUsd, volume5mUsd, platformCoin`.

`thoughts[]` (`home.js:161-177`): `id, ts, agentNo, agentName, avatarSeed, image, ticker, action ('BUY'|'SELL'|'HOLD'…), text, blocked (string|null), failed (bool), note (bool), levelUp (string|null), trade ({side, sol, pnlPct, url}|null)`. All C, but `id` is used to flash new items. `(t.action || 'hold').toLowerCase()` is called.

`bonded[]`: `mint` (**R** dedupe key; `it.mint.slice` is used when there is no name or symbol), `ts, name, symbol, image, mcapUsd` (C). Unused: `liquidityUsd, pool`.

`flywheel` (snapshot) read by the burns pages: `agents.{totalSol,totalTokens,count,queuedSol}` and `dev.{enabled,…}` (same keys as §3.17).

### 6.2 `config`

| key | status | read at / notes |
|---|---|---|
| `tradingEnabled` | **R** (key access at boot) | `false` → pill "TRADING PAUSED" (`main.js:137`) |
| `launchEnabled` | F | `false` disables the launch button (`launch.js:129`) |
| `launch.{minStartingCapital, maxStartingCapital (null ok), capitalPresets[], defaultStartingCapital, launchReserveSol}` | **R** on the launch and how pages (`cfg.launch.…` without a guard) | `devBuySol, fundingTimeoutMs` unused |
| `trading.{tradeSizePct, maxOpenPositions, stopLossPct, takeProfitPct, minSolReserve, priorityFeeSol}` | **R** on the agent and how pages (`rules.minSolReserve`, `r.tradeSizePct` …) | the other trading keys are unused |
| `fees.creatorSharePct` | **R** on the agent and how pages (`cfg.fees.creatorSharePct`) | `claimEveryMs, minClaimSol` unused |
| `filters.{minLiquidityUsd, minVolume24hUsd, minAgeHours}` | C (`c.filters?.…`, how page) | `minMcapUsd` unused here |
| `levels[]` `{no,name,minProfitSol,color,rewardSol}` | F (guarded `|| []`) | home "Upgrade Office" also reads **`rewardPct`**, which is not in the sample, so it shows 0 (`home.js:146`) |
| `rewards.{enabled,payTo ('agent'|'creator'),wallet,balanceSol,paidSol}` | C (how page; `c.rewards?.enabled` guarded) | |
| `defaultStrategy` | F | |
| `strategies[]` `{id,name,tagline,goal,risk (null|'extreme'),maxTradeSol,sizePct,maxOpen,takeProfitPct,stopLossPct,trail({at,by}|null),maxHoldMin,cooldownMin,minLiquidityUsd,entry{},safety(null|{…})}` | F (guarded) | ids `classic, scalper, trend, dip, sniper, newpairs`. `safety` (newpairs) is read by the how page `safetyRules` (`minAgeSec,maxAgeSec,minMcapSol,maxMcapSol,minVolSol,minBuys,minUniqueBuyers,minBuySellRatio,minChange60s,maxSpike60s,maxDevPct,maxEarlyBuyers,maxUnseenPct,maxTopHolderPct,maxTop10Pct,maxAgentsPerCoin`). `entry` is merged into the custom-builder defaults (`main.js:532`) |
| `customStrategies[]` | F | lookup in `strategyById` (`ui.js:170-172`) |
| `customEnabled` | F | `=== false` hides custom strategies |
| `promptAi` | C | label only |
| `skins.{enabled,payTo,payWith:{symbol,mint,tokenPriceSol,burn,burnPct},items[]}` | F | `items[]`: `id` (asset file names `brand/skins/${id}-stand.png` / `-bust.png`, plus a 3D model in `skins3d.js`), `name, tagline, priceSol, rarity ('common'|'rare'|'epic'|'legendary'), maxSupply, maxPerWallet, stock:{max,sold,held,left}|null, nft`. **`payWith.symbol` and `payWith.mint` are never read** (the token name "BUILD" is hard-coded, §9) |
| `flywheel.{enabled, pct, minBuySol, mint}` | F | the sample only has `{enabled:false}`. When it is enabled, `pct` and `minBuySol` are read **without guards** in `agent.js:392-403` |
| `market.{enabled,payTo,payWith,mint,tokenPriceSol,feePct,minPriceSol,maxPriceSol,maxWalletSol,listed,sold,volumeSol}` | F | `payTo` is the NFT escrow and payment wallet. **The tokens page reads `c.market.minLiquidityUsd/minVolume24hUsd/minMcapUsd/minAgeHours`** (`lists.js:113`), which do not exist here (they are in `filters`); it renders "–" and "undefinedh". **It crashes if `config.market` is missing.** |
| `agentNft.enabled` | F | NFT card on the agent page. `collection, minted, royaltyBps` unused |
| `siteUrl` | F | shill links, launch website lock |
| `contractAddress` | C | CA chip, shill text |
| `xUrl` | C | header and footer X link |
| `mode, brain, xPosting` | unused | `x.enabled`/`images` come from the agent object instead |

### 6.3 Agent detail (`GET /api/agents/:id`)

This is everything in the list object (§6.1) plus the fields below. "Active view" = `rawStatus === 'ACTIVE'`.

| key | type | status | read at |
|---|---|---|---|
| `rawStatus` | `AWAITING_FUNDS`/`LAUNCHING`/`ACTIVE`/`LAUNCH_FAILED`/(`EXPIRED`) | **R** (drives the whole page and the launch poll) | `agent.js:64`, `launch.js:331` |
| `status` | display status (see the list) | F | hero pill, office state (`'LOW BALANCE'`) |
| `error` | string\|null | C | pending card, launch failure message |
| `requiredSol`, `balanceSol` | numbers | **R** for `AWAITING_FUNDS` (`requiredSol - balanceSol`) | `agent.js:92`, `main.js:315` |
| `coin` | object | **R**: `coinHTML` reads `d.coin.twitter` without a guard (`agent.js:356-358`), and pending mode reads `d.coin.ticker`. Must be an object (mint may be null before launch) | |
| `coin.{name,ticker,description,image,mint,mcapUsd,athUsd,createdAt,launchSig,twitter,website,uri}` | | C, except `uri` (launch progress step) and `mint` (pump link, shill) | |
| `positions[]` | array | **R** in the active view (`d.positions.length`) | `{mint,symbol,icon,url,recovered,sellFails,costSol,valueSol,entryPriceSol,priceUsd,pnlPct,pnlSol,openedAt}` |
| `history[]` | array | **R** in the active view (`d.history.slice`) | `{id,ts,side,symbol,sol,priceUsd,pnlPct,pnlSol,source,sig}` |
| `decisions[]` | array | **R** in the active view (`d.decisions.length`) | `{ts,action,symbol,reason,blocked,failed,count,note,levelUp}`. `action` goes into `sidePill()`, which calls `.toLowerCase()`, so it **must be a string** |
| `deposits[]`, `withdrawals[]` | arrays | **R** (spread in `walletHTML`, both views) | `{ts,amount,sig}` (+`from`/`kind`, `to` unused) |
| `feeClaims[]` | array | **R** in the active view (`d.feeClaims.map`) | `{ts,claimedSol,sig,toCreatorSol,shareSig}` |
| `equity` | `[ [tsMs, equitySol], … ]` | **R** in the active view (`d.equity.filter`) | chart |
| `equitySol, pnlSol, pnlPct, depositedSol, trades, closedTrades, winRate, feesKeptSol, feesToCreatorSol` | numbers | C | stats |
| `withdrawnSol, launchCostSol` | numbers | C | |
| `nextDecisionAt` | ms (float ok) | C | countdown |
| `nextFeeClaimAt` | ms | C | |
| `custody` | string | C | "Keys" row |
| `level` | object | C/F (`level.no` gates the office picker) | |
| `office` | int | F | |
| `skin`, `skins`, `baseSeed` | | F | |
| `strategy` | string | F | |
| `customStrategy` | object\|null | F (`strategyById` extra) | |
| `rewards[]` | `{level,amountSol,status('paid'|'waiting_funds'|…),sig}` | C (guarded `|| []`) | |
| `flywheel` | `{sol,tokens,pendingSol,burns:[{ts,sol,tokens,burnSig}]}` | **R** when `config.flywheel.enabled` and `d.flywheel` is truthy (`burns.slice` is called) | |
| `nft` | `{asset, collection}`\|null | F | NFT card, sell gating, escrow transfer |
| `nftJob` | `{status ('failed'|…), error}`\|null | F | |
| `market` | `{price, priceTokens, escrow (bool), listedAt, seller}`\|null | F | `L.price.toFixed` (number), withdraw lock, buy flow |
| `sales[]` | `{priceSol, ts, paySig}` | C (guarded) | |
| `x` | `{enabled, connected, images, handle, postsToday, maxPerDay, nextPostAt, queued[], error, settings:{trades,recap,promos,images}, posts:[{url,text,ts,image}]}` | F (`d.x?.…`; `x.posts` is guarded) | sample when not connected: `{"connected":false,"enabled":true,"images":false}` |
| `realizedPnlSol, wins, startingCapital, owners, rank, company, inDuel, arena` | | unused by this frontend | |

`creator` is the ownership field for every creator-only check (`isCreator()` is `wallet.address === d.creator`). After an NFT transfer or market sale, the server must update `creator` to the new holder.

---

## 7. Error strings the frontend matches on

| pattern | where | effect |
|---|---|---|
| `/not found/i` | `app/api.js:30` (`getAgent`) | `null` instead of throwing. **`GET /api/agents/:id` must answer unknown agents with non-2xx + an `error` matching this.** |
| `/not found yet/i` | `app/main.js:481` (skin buy), `:808`, `:810` (market buy) | keep retrying (skin: 4 tries, no delay; market: 5 tries, 3 s). Use it for "payment tx not visible on-chain yet". Market buy: any other error clears the pending localStorage entry. |
| `/insufficient\|0x1\b\|custom program error: 0x1/i` | `app/main.js:476`, `:855` | applied to **wallet/RPC** errors from `sendToken` (not server errors) → "Not enough BUILD in your wallet…" |
| `/reject\|cancel\|denied\|closed/i` and `code === 4001` | `app/main.js:202` | wallet connect errors (client only) |
| `'Request failed (' + status + ')'` | `app/api.js:6` | fallback when the error body has no `error` |

All other server `error` strings are shown verbatim in toasts or modals, so write them for end users.

---

## 8. Other server obligations

* **X OAuth callback.** `x/connect` returns `{url}` (the X authorize URL). When X redirects back, the server's callback must redirect the browser to the agent page with a query in the hash: `/#/builder/<no>?x=connected`, `?x=cancelled`, or any other value for failure. The page reads it in `app/pages/agent.js:598-601`:
  ```js
  const xq = (location.hash.split('?')[1] || '').match(/x=(\w+)/)?.[1];
  if (xq) { app.toast(xq === 'connected' ? '<b>X connected</b>…' : xq === 'cancelled' ? '<b>X login cancelled</b>…' : '<b>X could not be connected</b>…'); … }
  ```
* **Launch deep link.** `#/build?s=<strategyId>` preselects a strategy (`launch.js:74`); this is client-only.
* **Shill links** use `${config.siteUrl || location.origin}/#/builder/<no>` (`main.js:910`, `:924`).
* **Token board** expects `tokens[].url` to be a DexScreener pair URL; rows open it in a new tab (`lists.js:140`).
* **localStorage keys** written by the frontend (no server impact): `af_wallet`, `build_theme`, `build-home-builder`, `build-market-pending`.
* **Background jobs implied by the UI**: trading loop (`nextDecisionAt` / `decisions` / `thoughts`), creator-fee claims every `fees.claimEveryMs` (`feeClaims`, `fees` event), flywheel buyback and burn (`burn`), dev-wallet claims (`devclaim`), promotions and rewards (`levelup`, `reward`), bonded-coin watcher (`bonded`), DexScreener token board (`tokens`), funding watcher, market escrow watcher, refunds, NFT minter (`nftJob`), X poster.

---

## 9. Branding inventory

The search covered `public/` for `BUILD`, `Build`, `buildagent` and `builder`. Results are grouped by what the text is, because they need different treatment. Line numbers are 1-based.

### 9.1 Product brand name "BUILD" (rebrand to "Crewfi")

| file:line | text |
|---|---|
| `index.html:6` | `<title>BUILD</title>` |
| `index.html:7` | meta description "Build your AI builder and let it work for you…" |
| `index.html:13` | `og:title` "BUILD" |
| `index.html:14` | `og:description` "Build your builder. It works for you 24/7…" |
| `index.html:15`, `:17` | `https://buildagent.fun/brand/og.jpg` (**domain**, og and twitter image) |
| `app/main.js:46-47` | `WORDMARK = <span class="brand-name">BUIL<span class="brand-d">D</span></span>` (last letter styled yellow by `.brand-d`, `styles.css:1850`) |
| `app/main.js:55` | `aria-label="BUILD home"` |
| `app/main.js:90` | footer `<b>BUILD</b> · build your builder, it works for you` |
| `app/main.js:133` | boot screen `alt="BUILD"`, "stacking bricks at BUILD" |
| `app/main.js:418` | "Give X a new look everywhere on BUILD." |
| `app/main.js:778` | "…sold on the BUILD Builder Market." |
| `app/main.js:782` | "Free for you: BUILD pays the mint." |
| `app/main.js:919`, `:920` | shill post texts "Launch a coin on BUILD…", "Every coin on BUILD hires its own trader…" (`:919` also "Build your builder. It works for you.") |
| `app/main.js:936` | shill coin select option "BUILD itself" |
| `app/main.js:993` | `document.title`: `'BUILD · build your builder, it works for you'` and `'BUILD · ' + …` (also "Builder", "Builders", "Builder Burns", "Builder Market", "My Builders") |
| `app/main.js:1095` | "BUILD could not start:" |
| `app/wallet.js:157` | MetaMask connector `dapp: { name: 'BUILD', … }` (shown in MetaMask) |
| `app/pages/home.js:45` | `alt="The BUILD site office"` |
| `app/pages/home.js:120` | `alt="A BUILD site office"` |
| `app/pages/home.js:202` | hero wordmark `<h1 class="brick-word" aria-label="BUILD"><span>B</span><span>U</span><span>I</span><span>L</span><span class="y">D</span></h1>` (one span per letter; needs restructuring) |
| `app/pages/home.js:203`, `:206` | "Build your AI builder", "Build Your Builder" (tagline/CTA) |
| `app/pages/skins.js:79` | `alt="The BUILD skin shop"` |
| `app/pages/skins.js:83` | "Works everywhere on BUILD" |
| `app/pages/agent.js:427` | "Free: BUILD pays the mint." |
| `app/pages/lists.js:37` | "Every builder launched on BUILD, ranked." |
| `app/pages/how.js:19` | "max N BUILD builders in the same coin" |
| `app/pages/burns.js:114` | "the **BUILD dev wallet's** pump.fun creator fees" (brand; the same line also says "buys the BUILD coin", see 9.2) |
| `app/boss3d.js:51` | `aria-label` "The BUILD builder. Drag to spin it around." |
| `app/office3d.js:937` | `word = 'BUILD'` (3D sign on the office wall) |
| `app/office3d.js:1046` | `word = 'BUILD'` (big 3D sign on the tower) |
| `app/format.js:68` | `agentNo = (no) => 'BUILDER ' + String(no).padStart(3, '0')` (label shown everywhere, e.g. "BUILDER 007") |
| `app/pages/agent.js:216` | `'BUILDER #' + …` / `'NEW BUILDER'` |

**Watch out with the 3D sign:** `office3d.js:399-405` defines `GLYPHS` only for `B, U, I, L, D`. Setting `word = 'CREWFI'` without adding glyphs for `C, R, E, W, F` throws (`GLYPHS[ch][0]` is undefined). `createOffice` then fails, and the pages fall back to the flat `brand/banner.jpg`.

Image assets that probably show the BUILD brand (check visually): `brand/logo-96.png`, `brand/mascot.png`, `brand/banner.jpg`, `brand/og.jpg`, `favicon.png`, `apple-touch-icon.png`, `brand/pages/*.jpg` (`launch-hero`, `skins-hero`, `how-hero`, `builder-hero` (used in CSS, `styles.css:2505`, `:2615`)).

Code comments only (optional): `app/api.js:1`, `app/main.js:1`, `:43`, `:46`, `app/robot.js:1`, `app/ui.js:25`, `app/office3d.js:1`, `:3`, `:471`, `:501`, `:935`, `:1041`, `:1044`, `app/boss3d.js:1`, `app/phone3d.js:1`, `app/skins3d.js:2`, `app/pages/home.js:1`, `app/pages/burns.js:35`, `:81`, `app/pages/agent.js:417`, `app/wallet.js:275`, `styles.css:2`, `:407`, `:870`, `:1063`, `:1682`, `:1769`, `:1965`.

localStorage keys (renaming them resets saved theme and selection; optional): `index.html:22` and `app/main.js:1059` `build_theme`, `app/pages/home.js:12` `build-home-builder`, `app/main.js:802` `build-market-pending`.

### 9.2 "BUILD" as the platform **token symbol** (hard-coded, not read from config)

The server config has the symbol (`config.skins.payWith.symbol: "BUILD"`, `config.market.payWith: "BUILD"`, `GET /api/market` → `payWith: "BUILD"`), **but the frontend never reads it**. Every one of these is a literal. Replace them with the new token's ticker, or wire them to `config.skins.payWith.symbol`:

* `app/main.js:418` ("Skins are paid only in the BUILD coin", plus the burn sentence), `:450` (`Buy with BUILD (…)`), `:470` ("Getting the BUILD price…"), `:473` (`Confirm ${n} BUILD …`), `:476` ("Not enough BUILD … costs ${n} BUILD"), `:485` (`Paid ${n} BUILD`), `:701` ("the buyer pays in BUILD"), `:742` ("The buyer pays in BUILD. You receive the BUILD worth … ≈ N BUILD"), `:826` (`≈ … BUILD`), `:827` ("Paid in the BUILD coin"), `:828` ("Send the BUILD amount"), `:831` (`Buy with BUILD`), `:846` ("Getting the BUILD price…"), `:852` (`Confirm ${n} BUILD`), `:855` ("Not enough BUILD … ${n} BUILD"), `:861` (`Paid ${n} BUILD`), `:1016` ("bought … SOL of the BUILD coin")
* `app/ui.js:207` `skinPriceLabel`: `` `≈ ${…} BUILD` `` / `` `${item.priceSol} SOL in BUILD` ``
* `app/pages/launch.js:94` "(… SOL in BUILD)"
* `app/pages/skins.js:63` "paid in BUILD", `:76` "bought with the BUILD coin", `:82` "Paid in BUILD coin", `:110` "Paid in BUILD to …"
* `app/pages/agent.js:371` "Builders never trade BUILD coins.", `:436` `≈ … BUILD`, `:437` "you get the BUILD worth", `:447` "the buyer pays in BUILD. You get the BUILD minus …"
* `app/pages/market.js:34` `≈ … BUILD`, `:68` refund "… BUILD", `:96` "pay in the BUILD coin … send the BUILD", `:97` "The seller gets the BUILD", `:98` "your BUILD is sent back"
* `app/pages/burns.js:52`, `:68`, `:70`, `:114` "the BUILD coin" / "paid in BUILD"
* `app/pages/lists.js:113` "Builders never trade BUILD coins."

(`app/pages/home.js` has none.) The 10-minute quote and the payment flows themselves are symbol-agnostic, because they use `mint` and `program` from the quote.

### 9.3 Protocol strings inside signed messages (change client and server together)

* `app/wallet.js:339` `'BUILD action'` (first line of every signed action)
* `app/main.js:850` `'BUILD action'` (market-buy intent)
* `app/wallet.js:341` and `app/main.js:850` `` `Builder: ${…}` `` (line label)
* `shared/risk-ack.js:3` `RISK_ACK` ("…my builder can lose all of its SOL")
* `shared/custom-strategy.js:39` `CUSTOM_RISK_ACK` ("…my builder can lose its SOL")
* `app/main.js:792` `'NFT: whoever holds this NFT owns the builder'`

Changing these is fine as long as the new server checks the new strings. `shared/` is imported by both, so edit it once. Remember the first line is hard-coded in two places.

### 9.4 "Build"/"builder" as the product noun and in routes

The product calls each AI agent a "builder". This term (and the hash routes) runs through the whole UI. Renaming it, for example to "crew"/"crewmate", is a copywriting decision. Routes:

* `app/main.js:982` route aliases `{ builder: 'agent', builders: 'agents', leaderboard: 'agents', build: 'launch', 'my-builders': 'mine' }`. Links use `#/build`, `#/builder/<no>`, `#/builders` and `#/my-builders` in `main.js:55-86`, `:817`, `:861`, `:863`, `:924`, and in `pages/*.js` (`home.js`, `lists.js`, `market.js`, `burns.js`, `agent.js:477`, `:578`, `launch.js:340`, `:346`, `:349`). The server's X callback redirect (§8) and the coin website (`${siteUrl}/builder/…`, `launch.js:164`) also use `builder`.
* Nav labels: `app/main.js:58` "Build", `:59` "My Builders", `:76` "Build Builder", `:77` "My Builders", `:82` "Builder Burns", `:86` side card "Your builders work 24/7. Build, customize…".

Capitalised "Build…/Builder…" UI strings (file:line):
`app/main.js:58, 59, 76, 77, 82, 86, 362, 576, 581, 993, 1012`; `app/pages/launch.js:133, 147, 187, 198, 205, 206, 290, 346`; `app/pages/home.js:22, 60, 73, 94, 203, 206, 220, 221, 227`; `app/pages/agent.js:143, 216, 227, 236, 263, 294, 340, 378, 555, 578`; `app/pages/how.js:59, 62, 74, 101, 147`; `app/pages/burns.js:51, 59, 115`; `app/pages/market.js:59, 78, 90`; `app/pages/lists.js:37, 48`; `app/pages/skins.js:28, 74 ("CUSTOMIZE YOUR BUILDER")`; `app/ui.js:123` (level bar "Master Builder reached"); `index.html:7, 14`.

Lowercase "builder" (copy, aria labels, toasts) by file:
* `app/main.js`: 59, 77, 80, 86, 90, 173, 242, 250, 279, 318, 391, 418, 433, 491, 511, 522, 523, 531, 572, 577, 671, 681, 682, 693, 701, 705, 710, 714, 759, 769, 773, 776, 778, 779, 783, 792, 817, 827, 828, 840, 844, 855, 861, 863, 873, 876, 919, 924, 927, 928, 929, 982, 993, 1016
* `app/pages/agent.js`: 2, 67, 79, 81, 82, 101, 124, 195, 199, 201, 240, 244, 269, 289, 290, 298, 313, 317, 371, 394, 416, 417, 422, 427, 438, 442, 447, 448, 470, 477, 578, 600, 603
* `app/pages/launch.js`: 1, 2, 3, 88, 94, 95, 118, 133, 134, 148, 164, 176, 187, 204, 205, 210, 223, 236, 243, 255, 290, 312, 335, 339, 340, 345, 346, 349
* `app/pages/home.js`: 1, 2, 12, 61, 68, 70, 71, 73, 89, 93, 94, 99, 103, 115, 121, 156, 160, 166, 168, 176, 190, 203, 204, 217, 245, 247
* `app/pages/how.js`: 1, 19, 59, 61, 83, 84, 86, 90, 96, 106, 111, 173, 174, 175, 176
* `app/pages/burns.js`: 1, 25, 35, 42, 43, 52, 57, 64, 66, 67, 68
* `app/pages/market.js`: 1, 22, 35, 44, 65, 79, 80, 95, 96, 98, 100
* `app/pages/lists.js`: 17, 18, 37, 38, 45, 73, 113, 118
* `app/pages/skins.js`: 28, 32, 76, 83, 101, 102, 110
* `app/ui.js`: 6, 38, 41, 92, 130, 197, 199
* `app/office3d.js`: 4, 6, 224, 456 (in-scene chat bubble "gm builders"), 1041, 1427
* `app/boss3d.js`: 1, 51, 75; `app/robot.js`: 1, 3, 231, 249; `app/charts.js`: 1; `app/skins3d.js`: 2; `app/wallet.js`: 2, 309; `app/api.js`: 1
* `shared/custom-strategy.js`: 18, 39, 46, 48 (39 is signed, see 9.3); `shared/risk-ack.js`: 1, 3 (3 is signed)
* `styles.css`: 1495, 2004, 2019, 2082, 2377, 2505, 2615, 2662 (comments, plus the `builder-hero.jpg` URL)
* `index.html`: 7, 14

### 9.5 Server-provided names (rebrand on the server, not in `public/`)

These strings come from the server and only need changing there: level names (`config.levels[].name`, e.g. "Bricklayer" … "Master Builder"), strategy names and taglines (`Blueprint`, `Riveter`, `Highrise`, `Excavator`, `Surveyor`, `Demolition (New Pairs)`), skin names (`"Hard Hat Hero"`, `"The Golden Builder"`, …), `config.siteUrl` (`https://buildagent.fun`), `config.xUrl` (`https://x.com/usebuildagent`), `config.contractAddress`, `config.skins.payWith.symbol` / `config.market.payWith` (`"BUILD"`), `agent.custody` text, and default agent names such as "Builder Agent" (user data).

---

## 10. Surprises and gotchas

1. **No server-built transactions.** Every on-chain action the user signs (SOL transfer, SPL `TransferChecked` with idempotent ATA create, Metaplex Core `TransferV1`) is assembled in the browser. The server only supplies `/api/blockhash`, recipient addresses, and token quotes (`payTo`, `mint`, `program`, `raw`, `decimals`, `fromAccount`), then verifies the resulting tx signature on-chain.
2. **Unsigned endpoints that move or allocate value:** `POST /api/launch/prepare` trusts `creator` from the body with no signature. `funded`, `deposit` and `skin/buy` carry only a tx signature. The server must derive everything from the on-chain transaction (sender = creator, amount, destination).
3. **The NFT escrow transfer is never reported to the server.** After `market/list` the client sends the Core NFT to `config.market.payTo` and does not post the signature. The server has to watch the market wallet and set `listing.escrow`.
4. **The skin quote has no buyer parameter**: quote for `agent.creator`.
5. **Retry semantics depend on the exact text `not found yet`.** Skin-buy retries have no delay, so the server should wait for confirmation itself. The market-buy request is persisted in localStorage and replayed for up to 25 minutes, so it must be idempotent.
6. **The first `/api/launch/:id/funded` call must not fail on "unconfirmed"**: its error aborts the launch UI.
7. **`GET /api/agents/:id` must accept the agent number as well as the id**, and must use an error message containing "not found" for unknown agents.
8. **SSE snapshots are shallow-merged deltas.** `feed` and `bonded` inside a snapshot are ignored. `thoughts`/`thinking` are snapshot fields, not event types. `fund` and `fees` events are subscribed but unused. The `market` event payload can be `{}`.
9. **Crash-level requirements:** `config` (with `tradingEnabled`, `launch.*`, `trading.*`, `fees.creatorSharePct`, `market` object), `agents[]`, `coins[]`, `tokens[]`, `stats.solUsd`; on agent detail, `coin` (object), `positions`, `history`, `decisions`, `deposits`, `withdrawals`, `feeClaims`, `equity`; and `decisions[].action` / `feed[].side` as strings.
10. **Existing frontend bugs a drop-in server will reproduce:** the tokens page reads `config.market.min*` filters that only exist in `config.filters` (shows "–" and "undefinedh"). The home "Upgrade Office" reward reads `levels[].rewardPct`, which the server does not send (it sends `rewardSol`), so the reward line is hidden. `setLaunchImage` / `POST /api/launch/:id/image` is dead code.
11. **Rebranding traps:** the 3D sign glyph table only covers `BUILD`. The signed-message prefix `BUILD action` and the risk-ack sentences are verified server-side. The token symbol "BUILD" is hard-coded in about 40 UI strings even though the server sends `payWith.symbol`.
12. The old server's SSE and config also carried `arena`, `companies`, `ranks`, and agent `rank`/`company`/`inDuel` (a duel/companies feature). This frontend ignores all of them.
