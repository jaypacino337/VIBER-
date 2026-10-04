// Formatting helpers
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SUB = '₀₁₂₃₄₅₆₇₈₉';
const toSub = (n) => String(n).split('').map((d) => SUB[+d]).join('');

export function price(x) {
  if (!x && x !== 0) return '–';
  if (x >= 1) return '$' + x.toFixed(x >= 100 ? 2 : 3);
  if (x >= 0.001) return '$' + x.toFixed(4);
  const zeros = Math.floor(-Math.log10(x));
  const sig = Math.round(x * 10 ** (zeros + 3));
  return '$0.0' + toSub(zeros) + String(sig).slice(0, 3); // DEX style: $0.0₄420 = 0.0000420
}

export function usd(x) {
  if (x == null || isNaN(x)) return '–';
  const a = Math.abs(x), s = x < 0 ? '-' : '';
  if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e4) return s + '$' + (a / 1e3).toFixed(1) + 'K';
  if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(2) + 'K';
  return s + '$' + a.toFixed(2);
}

export function sol(x, d) {
  if (x == null || isNaN(x)) return '–';
  const a = Math.abs(x);
  const digits = d ?? (a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4);
  return x.toFixed(digits);
}

export function signedSol(x, d) {
  return (x > 0 ? '+' : x < 0 ? '−' : '') + sol(Math.abs(x), d);
}

export function pct(x, d = 1) {
  if (x == null || isNaN(x)) return '–';
  const v = x * 100;
  const digits = Math.abs(v) >= 1000 ? 0 : d;
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';
}

export const tone = (x) => (x > 0.00005 ? 'up' : x < -0.00005 ? 'down' : 'flat');

export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export function age(ts, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 48) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

export const hours = (h) => (h < 1 ? Math.round(h * 60) + 'm' : h < 48 ? Math.round(h) + 'h' : Math.round(h / 24) + 'd');

export const short = (a, n = 4) => (a ? a.slice(0, n) + '…' + a.slice(-n) : '');
export const agentNo = (no) => 'BUILDER ' + String(no).padStart(3, '0');
export const clock = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
export const clockSec = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const dur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm'; };
