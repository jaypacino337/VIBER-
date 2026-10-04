// Checks the wallet-signed "Crewfi action" messages the page sends for
// creator-only actions (see docs/API_CONTRACT.md §2). The exact text is
// rebuilt here and compared line by line, so a signature for one action can
// never be replayed as another.
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { db, save } from './store.js';

export const HEADER = 'Crewfi action';
const MAX_AGE_MS = 10 * 60_000;
const MAX_SKEW_MS = 2 * 60_000;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const deny = (msg) => { throw new HttpError(401, msg); };

function verifySig(signer, body) {
  let bytes;
  if (body.signedMessage) {
    bytes = Buffer.from(body.signedMessage, 'base64');
    if (!bytes.toString('utf8').endsWith(body.message)) deny('Signed text does not match the message.');
  } else {
    bytes = Buffer.from(String(body.message), 'utf8');
  }
  let sig;
  try { sig = bs58.decode(String(body.signature)); } catch { deny('Bad signature encoding.'); }
  let pk;
  try { pk = new PublicKey(signer).toBytes(); } catch { deny('Bad wallet address in the message.'); }
  if (!nacl.sign.detached.verify(new Uint8Array(bytes), sig, pk)) deny('Wallet signature is not valid.');
}

function useNonce(nonce, issuedMs) {
  const now = Date.now();
  for (const [k, t] of Object.entries(db.nonces)) if (now - t > 24 * 3600_000) delete db.nonces[k];
  if (db.nonces[nonce]) deny('This signed request was already used. Try again.');
  db.nonces[nonce] = issuedMs;
  save();
}

/**
 * Verify a signed action.
 *   expect: { action, builder, extras: [lines], signerLabel: 'Creator'|'Buyer', signer }
 * The signer's line sits after the extras for Creator messages; for the
 * market-buy intent the layout is fixed by the caller via `lines`.
 */
export function checkAction(body, { action, builder, extras = [], signer, signerLabel = 'Creator', layout }) {
  if (!body || typeof body.message !== 'string' || typeof body.signature !== 'string') deny('This action needs a wallet signature.');
  const lines = body.message.split('\n');
  const expected = layout || [HEADER, `Action: ${action}`, `Builder: ${builder}`, ...extras, `${signerLabel}: ${signer}`];
  const tail = lines.slice(expected.length);
  for (let i = 0; i < expected.length; i++) {
    if (lines[i] !== expected[i]) deny(`Signed message does not match this action (expected "${expected[i]}").`);
  }
  if (tail.length !== 2 || !tail[0].startsWith('Nonce: ') || !tail[1].startsWith('Issued: ')) deny('Signed message is missing its nonce or time.');
  const issued = Date.parse(tail[1].slice(8));
  if (!Number.isFinite(issued) || Date.now() - issued > MAX_AGE_MS || issued - Date.now() > MAX_SKEW_MS) deny('Signed request expired. Try again.');
  verifySig(signer, body);
  useNonce(signer + ':' + tail[0].slice(7), issued);
}
