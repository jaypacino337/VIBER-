// The creator's wallet (Phantom, Solflare, MetaMask or any Solana wallet that follows
// the Wallet Standard). It is always separate from the viber wallets on the server.
// Sending SOL builds the transaction with @solana/web3.js (window.solanaWeb3, loaded in index.html).
import { base58Encode } from '../shared/util.js';

export const wallet = { address: null, name: null, icon: null };

const listeners = new Set();
const listListeners = new Set();
export function onWallet(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onWalletList(fn) { listListeners.add(fn); return () => listListeners.delete(fn); }
const emit = () => listeners.forEach((fn) => { try { fn(wallet); } catch (e) { console.error(e); } });
const emitList = () => listListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

// Solana mainnet is written two ways by different wallets
const MAINNET = ['solana:mainnet', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'];
const NEEDED = ['standard:connect', 'solana:signAndSendTransaction', 'solana:signMessage'];

// Shown in the picker even when not installed (MetaMask also works without the extension, via its mobile app)
const KNOWN = [
  { name: 'Phantom', url: 'https://phantom.com/download' },
  { name: 'Solflare', url: 'https://solflare.com/download' },
  { name: 'MetaMask', url: 'https://metamask.io/download', sdk: true },
];

// ── Wallet Standard discovery ──
const standard = new Map(); // name -> wallet
function addStandard(w) {
  try {
    if (!w || typeof w.name !== 'string' || !w.features) return;
    if (!(w.chains || []).some((c) => String(c).startsWith('solana:'))) return;
    if (!NEEDED.every((f) => w.features[f])) return;
    standard.set(w.name, w);
    emitList();
  } catch {}
}
const registry = Object.freeze({
  register: (...ws) => {
    ws.forEach(addStandard);
    return () => ws.forEach((w) => { if (standard.get(w?.name) === w) { standard.delete(w.name); emitList(); } });
  },
});
if (typeof window !== 'undefined') {
  // wallets that load after us announce themselves; wallets already loaded answer app-ready
  window.addEventListener('wallet-standard:register-wallet', ({ detail }) => { try { detail(registry); } catch {} });
  try { window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: registry })); } catch {}
}

// Older injected providers (in case a wallet version does not use the standard)
const injectedPhantom = () => { const p = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null); return p?.isPhantom ? p : null; };
const injectedSolflare = () => (window.solflare?.isSolflare ? window.solflare : null);

const safeIcon = (icon) => (typeof icon === 'string' && /^data:image\/(svg\+xml|png|jpeg|webp|gif)[;,]/.test(icon) ? icon : null);

// Everything the connect dialog shows, in a stable order
export function listWallets() {
  const out = [];
  for (const w of standard.values()) out.push({ id: 'std:' + w.name, name: w.name, icon: safeIcon(w.icon), installed: true });
  const has = (n) => out.some((w) => w.name.toLowerCase() === n);
  if (!has('phantom') && injectedPhantom()) out.push({ id: 'inj:phantom', name: 'Phantom', icon: null, installed: true });
  if (!has('solflare') && injectedSolflare()) out.push({ id: 'inj:solflare', name: 'Solflare', icon: null, installed: true });
  for (const k of KNOWN) {
    if (has(k.name.toLowerCase())) continue;
    out.push(k.sdk
      ? { id: 'sdk:metamask', name: k.name, icon: null, installed: false, sdk: true, url: k.url }
      : { id: 'get:' + k.name.toLowerCase(), name: k.name, icon: null, installed: false, url: k.url });
  }
  const rank = (w) => { const i = KNOWN.findIndex((k) => k.name.toLowerCase() === w.name.toLowerCase()); return (w.installed ? 0 : 10) + (i < 0 ? 5 : i); };
  return out.sort((a, b) => rank(a) - rank(b));
}

// ── adapters: one shape for every kind of wallet ──
function standardAdapter(w) {
  let account = null;
  const pick = (accounts) => {
    const list = accounts || [];
    return list.find((a) => (a.chains?.length ? a.chains : w.chains).some((c) => MAINNET.includes(c))) || list[0] || null;
  };
  const chainOf = (a) => (a?.chains?.length ? a.chains : w.chains).find((c) => MAINNET.includes(c)) || 'solana:mainnet';
  return {
    name: w.name,
    icon: safeIcon(w.icon),
    async connect(silent) {
      const r = await w.features['standard:connect'].connect(silent ? { silent: true } : undefined);
      account = pick(r?.accounts?.length ? r.accounts : w.accounts);
      if (!account) throw Object.assign(new Error(`No Solana account in ${w.name}. Add a Solana account in the wallet, then try again.`), { code: 'NO_ACCOUNT' });
      return account.address;
    },
    async disconnect() { try { await w.features['standard:disconnect']?.disconnect(); } catch {} account = null; },
    async signMessage(bytes) {
      const [out] = await w.features['solana:signMessage'].signMessage({ account, message: bytes });
      return { signature: out.signature, signedMessage: out.signedMessage || bytes };
    },
    async sendTransaction(tx) {
      const bytes = new Uint8Array(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
      const [out] = await w.features['solana:signAndSendTransaction'].signAndSendTransaction({
        account, transaction: bytes, chain: chainOf(account), options: { preflightCommitment: 'confirmed' },
      });
      return typeof out.signature === 'string' ? out.signature : base58Encode(out.signature);
    },
    watch(fn) {
      const off = w.features['standard:events']?.on('change', (props) => {
        if (!props || !('accounts' in props)) return;
        account = pick(props.accounts);
        fn(account ? account.address : null);
      });
      return typeof off === 'function' ? off : () => {};
    },
  };
}

function injectedAdapter(name, getProvider, { silentOk }) {
  const p = () => { const x = getProvider(); if (!x) throw Object.assign(new Error(`${name} is not installed in this browser.`), { code: 'NOT_INSTALLED' }); return x; };
  return {
    name,
    icon: null,
    async connect(silent) {
      if (silent && !silentOk) throw new Error('silent connect not supported');
      const r = await p().connect(silent ? { onlyIfTrusted: true } : undefined);
      const pk = r?.publicKey || p().publicKey;
      if (!pk) throw new Error(`${name} did not share an address.`);
      return pk.toString();
    },
    async disconnect() { try { await getProvider()?.disconnect(); } catch {} },
    async signMessage(bytes) {
      const r = await p().signMessage(bytes, 'utf8');
      return { signature: r?.signature || r, signedMessage: bytes };
    },
    async sendTransaction(tx) {
      if (typeof p().signAndSendTransaction !== 'function') throw new Error(`This version of ${name} cannot send the transfer. Update ${name} or use another wallet.`);
      const r = await p().signAndSendTransaction(tx);
      const s = r?.signature || r;
      return typeof s === 'string' ? s : base58Encode(s);
    },
    watch(fn) {
      const x = getProvider();
      const h = (pk) => fn(pk ? pk.toString() : null);
      x?.on?.('accountChanged', h);
      return () => { try { x?.off?.('accountChanged', h); } catch {} try { x?.removeListener?.('accountChanged', h); } catch {} };
    },
  };
}

// MetaMask: the extension may register itself; if not, load MetaMask's own connector on demand
let metaMaskLoad = null;
function loadMetaMask() {
  if (standard.has('MetaMask')) return Promise.resolve(standard.get('MetaMask'));
  metaMaskLoad ||= (async () => {
    for (const url of ['https://cdn.jsdelivr.net/npm/@metamask/connect-solana/+esm', 'https://esm.sh/@metamask/connect-solana']) {
      try {
        const m = await import(url);
        const client = await m.createSolanaClient({ dapp: { name: 'VIBER', url: location.origin }, skipAutoRegister: true });
        const w = await client.getWallet();
        addStandard(w);
        if (standard.has(w.name)) return w;
      } catch (e) { console.warn('[wallet] MetaMask connector', url, e); }
    }
    throw new Error('Could not load MetaMask support. Check your connection and try again.');
  })();
  metaMaskLoad.catch(() => { metaMaskLoad = null; });
  return metaMaskLoad;
}

async function adapterFor(id) {
  if (id === 'sdk:metamask') return standardAdapter(await loadMetaMask());
  if (id.startsWith('std:')) {
    const name = id.slice(4);
    if (!standard.has(name) && name === 'MetaMask') return standardAdapter(await loadMetaMask());
    const w = standard.get(name);
    if (!w) throw Object.assign(new Error(`${name} is not available in this browser.`), { code: 'NOT_INSTALLED' });
    return standardAdapter(w);
  }
  if (id === 'inj:phantom') return injectedAdapter('Phantom', injectedPhantom, { silentOk: true });
  if (id === 'inj:solflare') return injectedAdapter('Solflare', injectedSolflare, { silentOk: false });
  throw Object.assign(new Error('That wallet is not installed in this browser.'), { code: 'NOT_INSTALLED' });
}

// ── connection ──
let active = null;
let unwatch = () => {};

export async function connectWallet(id, { silent = false } = {}) {
  const adapter = await adapterFor(id);
  const address = await adapter.connect(silent);
  unwatch();
  active = adapter;
  wallet.address = address;
  wallet.name = adapter.name;
  wallet.icon = adapter.icon;
  store.set('af_wallet', id === 'sdk:metamask' ? 'std:MetaMask' : id);
  unwatch = adapter.watch((addr) => {
    if (addr) { wallet.address = addr; emit(); } else disconnect();
  });
  emit();
  return address;
}

export async function disconnect() {
  unwatch(); unwatch = () => {};
  const a = active;
  active = null;
  wallet.address = null; wallet.name = null; wallet.icon = null;
  store.set('af_wallet', null);
  emit();
  try { await a?.disconnect(); } catch {}
}

// Reconnect to the wallet used last time, without a popup when the wallet allows it
export async function restoreWallet() {
  let id = store.get('af_wallet');
  if (!id) return null;
  if (id === 'phantom') id = 'std:Phantom'; // saved by older versions of this site
  // extensions can register a moment after the page loads
  for (let i = 0; i < 10 && id.startsWith('std:') && !standard.has(id.slice(4)); i++) await new Promise((r) => setTimeout(r, 100));
  if (id === 'std:Phantom' && !standard.has('Phantom') && injectedPhantom()) id = 'inj:phantom';
  // MetaMask through its web connector could show a QR popup on page load: let the user click Connect instead
  if (id === 'std:MetaMask' && !standard.has('MetaMask')) return null;
  try { return await connectWallet(id, { silent: true }); } catch { return null; }
}

function requireActive() {
  if (!active || !wallet.address) throw new Error('Connect your wallet first');
  return active;
}

const toBase64 = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Signs a creator action. Free, moves no funds. Returns what the server needs to check it.
export async function signAction(message) {
  const bytes = new TextEncoder().encode(message);
  const { signature, signedMessage } = await requireActive().signMessage(bytes);
  const signed = new Uint8Array(signedMessage || bytes);
  const out = { message, signature: typeof signature === 'string' ? signature : base58Encode(new Uint8Array(signature)) };
  if (!sameBytes(signed, bytes)) out.signedMessage = toBase64(signed); // some wallets add a prefix before signing
  return out;
}

export async function signMessage(message) {
  return (await signAction(message)).signature;
}

// @solana/web3.js needs a global Buffer in the browser; load a small polyfill if missing
async function ensureBuffer() {
  if (window.Buffer) return;
  for (const url of ['https://cdn.jsdelivr.net/npm/buffer@6.0.3/+esm', 'https://esm.sh/buffer@6.0.3']) {
    try {
      const m = await import(url);
      const B = m.Buffer || (m.default && m.default.Buffer);
      if (B) { window.Buffer = B; return; }
    } catch {}
  }
  throw new Error('Could not load the Buffer helper. Check your internet connection and reload the page.');
}

// Real SOL transfer from the connected wallet to an address. Returns the tx signature.
export async function sendSol(to, sol, getBlockhash) {
  await ensureBuffer();
  const w3 = window.solanaWeb3;
  if (!w3) throw new Error('Solana library did not load. Check your connection and reload the page.');
  const a = requireActive();
  const { blockhash, lastValidBlockHeight } = await getBlockhash();
  const from = new w3.PublicKey(wallet.address);
  const tx = new w3.Transaction({ feePayer: from, blockhash, lastValidBlockHeight }).add(
    w3.SystemProgram.transfer({ fromPubkey: from, toPubkey: new w3.PublicKey(to), lamports: Math.round(sol * 1e9) }),
  );
  return a.sendTransaction(tx);
}

// Send SPL tokens (e.g. VIBE for a skin): creates the receiver's token account if it is missing
// (idempotent), then TransferChecked. `raw` is the integer token amount (string or bigint).
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export async function sendToken({ to, mint, program, raw, decimals, fromAccount }, getBlockhash) {
  await ensureBuffer();
  const w3 = window.solanaWeb3;
  if (!w3) throw new Error('Solana library did not load. Check your connection and reload the page.');
  const a = requireActive();
  const { blockhash, lastValidBlockHeight } = await getBlockhash();
  const P = (x) => new w3.PublicKey(x);
  const owner = P(wallet.address), dest = P(to), mintPk = P(mint), tokenProg = P(program), ataProg = P(ATA_PROGRAM);
  const ata = (who) => w3.PublicKey.findProgramAddressSync([who.toBuffer(), tokenProg.toBuffer(), mintPk.toBuffer()], ataProg)[0];
  const from = fromAccount ? P(fromAccount) : ata(owner), toAcc = ata(dest);
  const amt = new Uint8Array(8);
  new DataView(amt.buffer).setBigUint64(0, BigInt(raw), true);
  const create = new w3.TransactionInstruction({
    programId: ataProg, data: window.Buffer.from([1]),
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true }, { pubkey: toAcc, isSigner: false, isWritable: true },
      { pubkey: dest, isSigner: false, isWritable: false }, { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: w3.SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: tokenProg, isSigner: false, isWritable: false },
    ],
  });
  const transfer = new w3.TransactionInstruction({
    programId: tokenProg, data: window.Buffer.from([12, ...amt, decimals]),
    keys: [
      { pubkey: from, isSigner: false, isWritable: true }, { pubkey: mintPk, isSigner: false, isWritable: false },
      { pubkey: toAcc, isSigner: false, isWritable: true }, { pubkey: owner, isSigner: true, isWritable: false },
    ],
  });
  const tx = new w3.Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(create, transfer);
  return a.sendTransaction(tx);
}

// Send a Metaplex Core NFT (a viber NFT) to another wallet: TransferV1 (data [14, 0]).
// Accounts: asset (w), collection, payer (s, w), authority (s) = the owner, newOwner, system, logWrapper (none).
const CORE_PROGRAM = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
export async function sendCoreAsset({ asset, collection, to }, getBlockhash) {
  await ensureBuffer();
  const w3 = window.solanaWeb3;
  if (!w3) throw new Error('Solana library did not load. Check your connection and reload the page.');
  const a = requireActive();
  const { blockhash, lastValidBlockHeight } = await getBlockhash();
  const P = (x) => new w3.PublicKey(x);
  const owner = P(wallet.address), core = P(CORE_PROGRAM);
  const ix = new w3.TransactionInstruction({
    programId: core, data: window.Buffer.from([14, 0]),
    keys: [
      { pubkey: P(asset), isSigner: false, isWritable: true },
      { pubkey: collection ? P(collection) : core, isSigner: false, isWritable: false },
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: P(to), isSigner: false, isWritable: false },
      { pubkey: w3.SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: core, isSigner: false, isWritable: false },
    ],
  });
  const tx = new w3.Transaction({ feePayer: owner, blockhash, lastValidBlockHeight }).add(ix);
  return a.sendTransaction(tx);
}

// Message format the server checks for creator-only actions
export function actionMessage(action, agentWallet, extra = []) {
  return [
    'VIBER action',
    `Action: ${action}`,
    `Viber: ${agentWallet}`,
    ...extra,
    `Creator: ${wallet.address}`,
    `Nonce: ${Math.random().toString(36).slice(2, 12)}`,
    `Issued: ${new Date().toISOString()}`,
  ].join('\n');
}
