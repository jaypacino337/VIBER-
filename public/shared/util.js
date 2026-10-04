// Small shared helpers: seeded randomness, hashing, base58.

export function hashString(str, seed = 0) {
  // cyrb53: fast, well-distributed 53-bit hash
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(str) {
  return mulberry32(hashString(String(str)) % 4294967296);
}

// Gaussian (Box–Muller)
export function gauss(rand = Math.random) {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
export const between = (a, b, rand = Math.random) => a + (b - a) * rand();

// ── Base58 (Bitcoin alphabet, same as Solana) ──
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

export function base58Encode(bytes) {
  const digits = [];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  for (const byte of bytes) { if (byte === 0) out += '1'; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]];
  return out;
}

export function base58Decode(str) {
  const bytes = [];
  for (const c of str) {
    const val = MAP[c];
    if (val === undefined) throw new Error('Invalid base58 character');
    let carry = val;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  for (const c of str) { if (c === '1') bytes.push(0); else break; }
  return new Uint8Array(bytes.reverse());
}

export function randomBytes(n) {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
}

// Deterministic 32-byte "address" from a seed (demo data only, no private key exists)
export function seededAddress(seed, suffix = '') {
  const rand = seededRng(seed);
  const b = new Uint8Array(32);
  for (let i = 0; i < 32; i++) b[i] = Math.floor(rand() * 256);
  b[0] = b[0] || 1;
  let addr = base58Encode(b);
  if (suffix) addr = addr.slice(0, addr.length - suffix.length) + suffix;
  return addr;
}

export function randomAddress(suffix = '') {
  const b = randomBytes(32);
  b[0] = b[0] || 1;
  let addr = base58Encode(b);
  if (suffix) addr = addr.slice(0, addr.length - suffix.length) + suffix;
  return addr;
}

// Fake transaction signature for paper trades (clearly never sent on-chain)
export function paperSig(rand = Math.random) {
  const b = new Uint8Array(64);
  for (let i = 0; i < 64; i++) b[i] = Math.floor(rand() * 256);
  b[0] = b[0] || 1;
  return base58Encode(b);
}

export function uid(prefix = 'id', rand = Math.random) {
  return prefix + '_' + Math.floor(rand() * 36 ** 8).toString(36).padStart(8, '0');
}
