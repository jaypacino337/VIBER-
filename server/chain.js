// Everything that touches Solana: agent keypairs (encrypted at rest), RPC,
// PumpPortal trade/create/claim transactions, and verifying user payments.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { Connection, Keypair, PublicKey, VersionedTransaction, SystemProgram, TransactionMessage, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { RPC_URL, MASTER_KEY, PUMPPORTAL_URL, LIVE } from './config.js';

export const connection = new Connection(RPC_URL, 'confirmed');

// ---------------------------------------------------------------- key vault
function masterKey() {
  if (MASTER_KEY) return createHash('sha256').update(MASTER_KEY).digest();
  if (LIVE) throw new Error('MASTER_KEY is required in live mode');
  return createHash('sha256').update('viber-paper-mode-not-secret').digest();
}

export function sealSecret(secretKey) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([c.update(Buffer.from(secretKey)), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}

export function openSecret(sealed) {
  const [iv, tag, enc] = sealed.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', masterKey(), iv);
  d.setAuthTag(tag);
  return Keypair.fromSecretKey(new Uint8Array(Buffer.concat([d.update(enc), d.final()])));
}

export function newWallet() {
  const kp = Keypair.generate();
  return { address: kp.publicKey.toBase58(), sealed: sealSecret(kp.secretKey) };
}

export const isAddress = (s) => {
  try { return Boolean(new PublicKey(s)); } catch { return false; }
};

// ------------------------------------------------------- signed user actions
/** Verify a wallet signMessage: message is utf8 text, signature base58 or base64. */
export function verifyMessage(wallet, message, signature) {
  try {
    const sig = /^[1-9A-HJ-NP-Za-km-z]+$/.test(signature) ? bs58.decode(signature) : Buffer.from(signature, 'base64');
    return nacl.sign.detached.verify(new TextEncoder().encode(message), sig, new PublicKey(wallet).toBytes());
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------- RPC
export async function balanceSol(address) {
  return (await connection.getBalance(new PublicKey(address))) / LAMPORTS_PER_SOL;
}

export async function tokenBalance(owner, mint) {
  const r = await connection.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) });
  return r.value.reduce((a, x) => a + Number(x.account.data.parsed.info.tokenAmount.uiAmount || 0), 0);
}

async function sendAndConfirm(tx) {
  const sig = await connection.sendTransaction(tx, { skipPreflight: false, maxRetries: 3 });
  const bh = await connection.getLatestBlockhash();
  const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (res.value.err) throw new Error('Transaction failed: ' + JSON.stringify(res.value.err));
  return sig;
}

/**
 * Check that `signature` is a confirmed transaction in which `from` paid at
 * least `minSol` to `to`. Used for launch funding, deposits, skin buys.
 */
export async function verifySolTransfer(signature, { from, to, minSol }) {
  const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx) throw new Error('Transaction not found yet. Wait a few seconds and try again.');
  if (tx.meta?.err) throw new Error('That transaction failed on-chain.');
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const ti = keys.indexOf(to);
  if (ti < 0) throw new Error('Transaction does not pay the expected wallet.');
  const received = (tx.meta.postBalances[ti] - tx.meta.preBalances[ti]) / LAMPORTS_PER_SOL;
  if (from && keys[0] !== from) throw new Error('Transaction was not sent by your wallet.');
  if (received + 1e-9 < minSol) throw new Error(`Expected ${minSol} SOL, received ${received.toFixed(4)}.`);
  return { received, payer: keys[0], slot: tx.slot };
}

/** Like verifySolTransfer but for an SPL token payment (e.g. skins paid in the platform token). */
export async function verifyTokenTransfer(signature, { from, to, mint, minAmount }) {
  const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx) throw new Error('Transaction not found yet. Wait a few seconds and try again.');
  if (tx.meta?.err) throw new Error('That transaction failed on-chain.');
  const delta = (list, owner) => list.filter((b) => b.mint === mint && b.owner === owner).reduce((a, b) => a + Number(b.uiTokenAmount.uiAmount || 0), 0);
  const got = delta(tx.meta.postTokenBalances || [], to) - delta(tx.meta.preTokenBalances || [], to);
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  if (from && keys[0] !== from) throw new Error('Transaction was not sent by your wallet.');
  if (got + 1e-9 < minAmount) throw new Error(`Expected ${minAmount} tokens, received ${got}.`);
  return { received: got };
}

/** Agent wallet pays SOL out (withdrawals, level rewards). */
export async function sendSol(sealed, to, sol) {
  const kp = openSecret(sealed);
  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: kp.publicKey,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: new PublicKey(to), lamports: Math.floor(sol * LAMPORTS_PER_SOL) })],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([kp]);
  return sendAndConfirm(tx);
}

// -------------------------------------------------------------- PumpPortal
async function portalTx(body) {
  const r = await fetch(PUMPPORTAL_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status !== 200) throw new Error(`PumpPortal ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return VersionedTransaction.deserialize(new Uint8Array(await r.arrayBuffer()));
}

/** Buy (amount in SOL) or sell (amount = token count or "100%") from an agent wallet. */
export async function swap(sealed, { side, mint, amount, slippagePct, priorityFeeSol }) {
  const kp = openSecret(sealed);
  const tx = await portalTx({
    publicKey: kp.publicKey.toBase58(),
    action: side === 'BUY' ? 'buy' : 'sell',
    mint,
    amount,
    denominatedInSol: side === 'BUY' ? 'true' : 'false',
    slippage: slippagePct,
    priorityFee: priorityFeeSol,
    pool: 'auto',
  });
  tx.sign([kp]);
  const sig = await sendAndConfirm(tx);
  return { sig, ...(await fillFromTx(sig, kp.publicKey.toBase58(), mint)) };
}

/** Read what a swap actually did from the confirmed transaction. */
async function fillFromTx(sig, owner, mint) {
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx?.meta) return { solDelta: 0, tokenDelta: 0 };
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
  const i = keys.indexOf(owner);
  const solDelta = i >= 0 ? (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / LAMPORTS_PER_SOL : 0;
  const sum = (l) => (l || []).filter((b) => b.mint === mint && b.owner === owner).reduce((a, b) => a + Number(b.uiTokenAmount.uiAmount || 0), 0);
  return { solDelta, tokenDelta: sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances) };
}

/** Upload coin metadata to pump.fun's IPFS endpoint. image is a data: URL or http URL. */
export async function uploadMetadata({ name, ticker, description, twitter, telegram, website, image }) {
  const form = new FormData();
  let blob;
  if (image?.startsWith('data:')) {
    const [head, b64] = image.split(',');
    blob = new Blob([Buffer.from(b64, 'base64')], { type: head.slice(5).split(';')[0] });
  } else if (image) {
    const r = await fetch(image);
    blob = await r.blob();
  } else {
    throw new Error('A coin image is required.');
  }
  form.append('file', blob, 'image');
  form.append('name', name);
  form.append('symbol', ticker);
  form.append('description', description || '');
  form.append('twitter', twitter || '');
  form.append('telegram', telegram || '');
  form.append('website', website || '');
  form.append('showName', 'true');
  const r = await fetch('https://pump.fun/api/ipfs', { method: 'POST', body: form });
  if (!r.ok) throw new Error('Metadata upload failed (' + r.status + ')');
  const j = await r.json();
  return { uri: j.metadataUri, image: j.metadata?.image || null };
}

/** Create the coin on pump.fun from the agent wallet (the agent is the creator, so it earns creator fees). */
export async function createCoin(sealed, { name, ticker, uri, devBuySol, priorityFeeSol = 0.0005 }) {
  const kp = openSecret(sealed);
  const mintKp = Keypair.generate();
  const tx = await portalTx({
    publicKey: kp.publicKey.toBase58(),
    action: 'create',
    tokenMetadata: { name, symbol: ticker, uri },
    mint: mintKp.publicKey.toBase58(),
    denominatedInSol: 'true',
    amount: devBuySol,
    slippage: 10,
    priorityFee: priorityFeeSol,
    pool: 'pump',
  });
  tx.sign([mintKp, kp]);
  const sig = await sendAndConfirm(tx);
  return { mint: mintKp.publicKey.toBase58(), sig };
}

/** Claim accumulated pump.fun creator fees into the agent wallet. */
export async function claimCreatorFees(sealed) {
  const kp = openSecret(sealed);
  const before = await connection.getBalance(kp.publicKey);
  const tx = await portalTx({ publicKey: kp.publicKey.toBase58(), action: 'collectCreatorFee', priorityFee: 0.000005 });
  tx.sign([kp]);
  const sig = await sendAndConfirm(tx);
  const after = await connection.getBalance(kp.publicKey);
  return { sig, sol: Math.max(0, (after - before) / LAMPORTS_PER_SOL) };
}

export const solscan = (sig) => `https://solscan.io/tx/${sig}`;
export const fakeSig = () => bs58.encode(randomBytes(64));
