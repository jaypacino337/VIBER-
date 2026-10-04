import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'viber-'));
const { Keypair } = await import('@solana/web3.js');
const nacl = (await import('tweetnacl')).default;
const bs58 = (await import('bs58')).default;
const { checkAction } = await import('../server/auth.js');

const kp = Keypair.generate(), me = kp.publicKey.toBase58();
const sign = (lines, k = kp) => { const message = lines.join('\n'); return { message, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), k.secretKey)) }; };
const msg = (action, nonce, extra = []) => ['VIBER action', `Action: ${action}`, 'Viber: W', ...extra, `Creator: ${me}`, `Nonce: ${nonce}`, `Issued: ${new Date().toISOString()}`];

test('accepts a valid signed action once', () => {
  const b = sign(msg('pause', 'n1'));
  assert.doesNotThrow(() => checkAction(b, { action: 'pause', viber: 'W', signer: me }));
  assert.throws(() => checkAction(b, { action: 'pause', viber: 'W', signer: me }), /already used/);
});
test('rejects another action, other extras, or another signer', () => {
  assert.throws(() => checkAction(sign(msg('pause', 'n2')), { action: 'withdraw', viber: 'W', signer: me }), /does not match/);
  assert.throws(() => checkAction(sign(msg('withdraw', 'n3', ['Amount: 1 SOL'])), { action: 'withdraw', viber: 'W', extras: ['Amount: all'], signer: me }), /does not match/);
  assert.throws(() => checkAction(sign(msg('pause', 'n4'), Keypair.generate()), { action: 'pause', viber: 'W', signer: me }), /not valid/);
});
test('rejects expired messages', () => {
  const lines = msg('pause', 'n5'); lines[lines.length - 1] = 'Issued: ' + new Date(Date.now() - 3600_000).toISOString();
  assert.throws(() => checkAction(sign(lines), { action: 'pause', viber: 'W', signer: me }), /expired/);
});
