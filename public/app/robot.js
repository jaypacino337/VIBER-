// VIBER crew: every agent is a little toy-brick viber (hard hat, face, hair, outfit, gear),
// drawn as pixel blocks with a darker side face so it reads like a 3D brick figure.
// Everything is generated from a seed (the agent's avatar seed): same agent, same viber.
// API: robotSVG(seed, { stand }), robotPNG(seed, size), robotTraits(seed), robotParts(seed, full).
// robotParts(...).spec is a ready buildCharacter() spec (office3d.js) for the 3D figure.
import { seededRng } from '../shared/util.js';

const W = 20;            // grid width
const BUST_H = 20;       // head + shoulders (square avatar)
const BODY_H = 31;       // full body on a floor tile (stand: true)

const SKINS = [['#F6C9A2', 3], ['#F2C38F', 3], ['#D39A6E', 2], ['#A86F4A', 2], ['#7A4F34', 1], ['#FCDCC2', 2]];
const HAIRS = [
  ['#6E3B1F', 4, 'Brown'], ['#2A1E19', 4, 'Black'], ['#E2B85A', 2, 'Blonde'], ['#9A3F1E', 1, 'Ginger'],
  ['#B9BCC2', 1, 'Grey'], ['#4A3326', 2, 'Dark brown'], ['#E05A8C', 0.3, 'Pink'], ['#3F6FE0', 0.3, 'Blue'],
];
const HATS = [['#FFD21F', 8, 'Yellow hard hat'], ['#151515', 2, 'Black hard hat'], ['#F4F4F2', 2, 'White hard hat'], ['#F97316', 1, 'Orange hard hat'], [null, 1.6, '']];
// [kind, weight, name, top colour, trouser colour, vest colour]
const OUTFITS = [
  ['vest', 5, 'Hi-vis vest', '#151515', '#2A2A2A', '#FFD21F'],
  ['vest', 1, 'Orange hi-vis vest', '#F4F4F2', '#2A3550', '#F97316'],
  ['hoodie', 2, 'Black hoodie', '#1E1E20', '#2A2A2A'],
  ['hoodie', 1, 'Grey hoodie', '#8A8D94', '#2A2A2A'],
  ['hoodie', 1, 'Green hoodie', '#2F9E57', '#2A2A2A'],
  ['tee', 2, 'White tee', '#F4F4F2', '#2A3550'],
  ['tee', 1, 'Yellow tee', '#FFD21F', '#2A2A2A'],
  ['overalls', 2, 'Grey overalls', '#F4F4F2', '#5A6068'],
  ['overalls', 1, 'Denim overalls', '#FFD21F', '#2F5FA0'],
  ['shirt', 1, 'Blue work shirt', '#3B7DD8', '#2A2A2A'],
];
const STYLES = ['short', 'short', 'side', 'messy', 'long', 'curly', 'bun', 'buzz'];

function wpick(list, rand) {
  const total = list.reduce((s, x) => s + x[1], 0);
  let r = rand() * total;
  for (const x of list) { r -= x[1]; if (r < 0) return x; }
  return list[list.length - 1];
}
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

function mix(hex, to, amt) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - amt) + ((b >> 16) & 255) * amt);
  const g = Math.round(((a >> 8) & 255) * (1 - amt) + ((b >> 8) & 255) * amt);
  const bl = Math.round((a & 255) * (1 - amt) + (b & 255) * amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}
const hx = (c) => (c ? parseInt(String(c).replace('#', ''), 16) : null);

// the office crew always looks like the 3D characters (office3d.js VIBE)
const PRESETS = {
  'crew-launch': { skin: '#F2C38F', hair: '#3A2A1E', hairName: 'Dark brown', style: 'short', kind: 'vest', outfitName: 'Hi-vis vest', top: '#151515', pants: '#2A2A2A', vest: '#FFD21F', hat: '#FFD21F', hatName: 'Yellow hard hat' },
  'crew-shill': { skin: '#C98E62', hair: '#1E1814', hairName: 'Black', style: 'short', kind: 'hoodie', outfitName: 'White hoodie', top: '#F4F4F2', pants: '#151515', hat: '#151515', hatName: 'Black hard hat', headset: true },
  'crew-trade': { skin: '#F0C9A0', hair: '#6E3B1F', hairName: 'Brown', style: 'side', kind: 'hoodie', outfitName: 'Green hoodie', top: '#2F9E57', pants: '#2A2A2A', hat: '#FFD21F', hatName: 'Yellow hard hat', glasses: true },
  'crew-research': { skin: '#E8B48A', hair: '#B9BCC2', hairName: 'Grey', style: 'short', kind: 'overalls', outfitName: 'Grey overalls', top: '#F4F4F2', pants: '#5A6068', hat: '#FFD21F', hatName: 'Yellow hard hat', glasses: true },
  'crew-boss': { skin: '#D9A27A', hair: '#5A3A22', hairName: 'Brown', style: 'short', kind: 'vest', outfitName: 'Foreman vest', top: '#151515', pants: '#2A2A2A', vest: '#FFD21F', stripes: '#151515', hat: '#FFD21F', hatName: 'Yellow hard hat', beard: true, belt: true, clipboard: true },
  'crew-dev': { skin: '#F6C9A2', hair: '#1E1814', hairName: 'Black', style: 'messy', kind: 'hoodie', outfitName: 'Black hoodie', top: '#1E1E20', pants: '#2A2A2A', hat: null, hatName: '', glasses: true },
  'crew-custom': { skin: '#FCDCC2', hair: '#E2B85A', hairName: 'Blonde', style: 'long', kind: 'tee', outfitName: 'Yellow tee', top: '#FFD21F', pants: '#2A2A2A', hat: '#FFD21F', hatName: 'Yellow hard hat', belt: true },
};

// buildCharacter() spec for the 3D figure (office3d.js)
function specOf(p) {
  return {
    skin: hx(p.skin), hair: hx(p.hair), style: p.style, top: hx(p.top), pants: hx(p.pants),
    kind: p.kind, vest: hx(p.vest), stripes: hx(p.stripes), cap: hx(p.hat), glasses: !!p.glasses,
    headphones: !!p.headset, beard: p.beard ? hx(p.hair) : null, headlamp: !!p.headlamp, belt: !!p.belt, clipboard: !!p.clipboard,
  };
}
// fields kept for older callers: gear ('cap' = wearing a hard hat → its colour in cap), tie, bag
function finish(p, full) {
  const gear = p.hat ? 'cap' : p.glasses ? 'glasses' : p.headset ? 'headphones' : 'none';
  const out = { vest: null, stripes: null, glasses: false, headset: false, beard: false, headlamp: false, belt: false, clipboard: false, ...p, gear, cap: p.hat || '#FFD21F', tie: null, bag: false, full };
  out.spec = specOf(out);
  return out;
}

// ── traits ──
export function robotParts(seed, full = false) {
  if (PRESETS[seed]) return finish(PRESETS[seed], full);
  const rand = seededRng('build-' + seed);
  const skin = wpick(SKINS, rand)[0];
  const [hair, , hairName] = wpick(HAIRS, rand);
  const [hat, , hatName] = wpick(HATS, rand);
  const [kind, , outfitName, top, pants, vest] = wpick(OUTFITS, rand);
  const style = pick(STYLES, rand);
  const glasses = rand() < 0.26;
  const headset = rand() < 0.16;
  const beard = rand() < 0.2;
  const headlamp = hat === '#151515' && rand() < 0.7;
  const belt = rand() < 0.3;
  return finish({ skin, hair, hairName, hat, hatName, kind, outfitName, top, pants, vest: vest || null, style, glasses, headset, beard, headlamp, belt }, full);
}

export function robotTraits(seed) {
  const p = robotParts(seed);
  const extras = [p.glasses && 'Glasses', p.headset && 'Headset', p.beard && 'Beard', p.headlamp && 'Headlamp', p.belt && 'Tool belt'].filter(Boolean);
  const gear = [p.hatName, ...extras].filter(Boolean).join(' · ');
  // kept the old keys (casing / screen) so older callers still work
  return { outfit: p.outfitName, hair: p.hairName + ' hair', hat: p.hatName || 'No hat', gear, casing: p.outfitName, screen: p.hairName + ' hair' };
}

// ── pixel grid ──
function buildGrid(p) {
  const H = p.full ? BODY_H : BUST_H;
  const g = Array.from({ length: H }, () => Array(W).fill(''));
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };

  // head block: front cols 5..13, side 14..15, rows 4..13
  const hy0 = 4, hy1 = 13;
  rect(5, hy0, 13, hy1, 'S');
  rect(14, hy0, 15, hy1, 's');
  put(4, 9, 'S'); put(4, 10, 's');                        // ear
  // hair
  if (p.hat) {
    rect(4, 6, 4, 8, 'H'); rect(15, 6, 15, 9, 'd');      // peeking out under the hat
    if (p.style === 'long') { rect(3, 7, 4, 15, 'H'); rect(15, 6, 16, 15, 'd'); }
    if (p.style === 'bun' || p.style === 'curly') rect(15, 9, 16, 11, 'd');
  } else if (p.style === 'buzz') {
    rect(5, 3, 15, 4, 'H'); rect(5, 3, 15, 3, 'h'); put(5, 5, 'H'); put(15, 5, 'd');
  } else {
    rect(5, 1, 14, 1, 'h'); rect(4, 2, 15, 4, 'H'); rect(4, 5, 5, 7, 'H'); rect(14, 5, 15, 8, 'd');
    if (p.style === 'side') { rect(6, 5, 10, 5, 'H'); put(6, 6, 'H'); }
    if (p.style === 'messy' || p.style === 'curly') { put(6, 0, 'H'); put(9, 0, 'h'); put(12, 0, 'H'); rect(6, 5, 13, 5, 'H'); put(8, 6, 'H'); put(11, 6, 'H'); }
    if (p.style === 'long') { rect(3, 5, 4, 15, 'H'); rect(15, 5, 16, 15, 'd'); rect(6, 5, 13, 5, 'H'); }
    if (p.style === 'bun') { rect(8, 0, 11, 1, 'H'); rect(6, 5, 13, 5, 'H'); }
  }
  // face: dot eyes, brows, classic smile
  rect(7, 8, 7, 9, 'E'); rect(11, 8, 11, 9, 'E');
  put(7, 7, 'b'); put(11, 7, 'b');
  rect(8, 12, 10, 12, 'E'); put(7, 11, 'E'); put(11, 11, 'E');
  if (p.beard) { rect(5, 11, 13, 13, 'H'); rect(7, 10, 11, 10, 'H'); rect(8, 11, 10, 11, 'm'); rect(14, 11, 15, 13, 'd'); }
  if (p.glasses) {
    rect(6, 7, 8, 7, 'G'); rect(10, 7, 12, 7, 'G'); rect(6, 10, 8, 10, 'G'); rect(10, 10, 12, 10, 'G');
    rect(6, 8, 8, 9, 'w'); rect(10, 8, 12, 9, 'w'); put(7, 9, 'E'); put(11, 9, 'E');
    put(9, 8, 'G'); rect(13, 8, 15, 8, 'G');
  }
  // hard hat: dome, ridge, brim
  if (p.hat) {
    rect(6, 1, 14, 1, 'C'); rect(5, 2, 15, 4, 'C'); rect(14, 2, 15, 4, 'k');
    rect(9, 0, 10, 4, 'c'); rect(7, 0, 12, 0, 'C'); rect(9, 0, 10, 0, 'c');
    rect(3, 5, 16, 5, 'k'); rect(3, 5, 13, 5, 'C'); put(2, 5, 'k');
    if (p.headlamp) { rect(8, 3, 11, 4, 'P'); rect(9, 3, 10, 4, 'Y'); }
  }
  if (p.headset) {
    if (!p.hat) { rect(4, 1, 15, 1, 'P'); put(4, 2, 'P'); }
    rect(3, 8, 4, 11, 'P'); put(4, 9, 'y');
    rect(5, 12, 6, 12, 'P');                              // mic
  }

  // neck + torso
  const by = 15;
  rect(8, 14, 11, 14, 's');
  const torsoBottom = p.full ? 23 : BUST_H - 1;
  rect(3, by, 14, torsoBottom, 'T');
  rect(15, by, 16, torsoBottom, 't');
  if (!p.full) { rect(1, by + 1, 2, torsoBottom, 'A'); rect(17, by + 1, 18, torsoBottom, 'a'); rect(2, by, 2, by, 'A'); rect(17, by, 17, by, 'a'); }
  if (p.kind === 'vest') {
    rect(3, by, 6, torsoBottom, 'V'); rect(11, by, 14, torsoBottom, 'V'); rect(15, by, 16, torsoBottom, 'v');
    rect(3, by + 3, 6, by + 3, 'R'); rect(11, by + 3, 16, by + 3, 'R'); rect(5, by, 5, by + 2, 'R'); rect(12, by, 12, by + 2, 'R');
    if (p.full) { rect(3, by + 6, 6, by + 6, 'R'); rect(11, by + 6, 16, by + 6, 'R'); }
    if (!p.full) { rect(1, by + 1, 2, by + 1, 'V'); rect(17, by + 1, 18, by + 1, 'v'); }
  } else if (p.kind === 'hoodie') {
    rect(5, by, 13, by, 'L'); put(8, by + 1, 'W'); put(8, by + 2, 'W'); put(11, by + 1, 'W'); put(11, by + 2, 'W');
    rect(6, by + 5, 13, by + 5, 'L');
  } else if (p.kind === 'overalls') {
    rect(6, by + 2, 11, torsoBottom, 'K'); rect(6, by, 6, by + 1, 'K'); rect(11, by, 11, by + 1, 'K');
    put(6, by + 2, 'Y'); put(11, by + 2, 'Y'); rect(8, by + 4, 9, by + 4, 'k');
  } else if (p.kind === 'shirt') {
    rect(7, by, 12, by, 'W'); for (let y = by + 2; y <= torsoBottom; y += 2) put(9, y, 'L');
  } else {
    rect(8, by, 11, by, 'S');
  }
  if (p.full) {
    rect(1, by + 1, 2, 22, 'A'); rect(17, by + 1, 18, 22, 'a');
    rect(1, 23, 2, 24, 'S'); rect(17, 23, 18, 24, 's');
    if (p.kind === 'vest') { rect(1, by + 1, 2, by + 2, 'V'); rect(17, by + 1, 18, by + 2, 'v'); }
    if (p.belt) { rect(3, 22, 16, 22, 'Q'); put(9, 22, 'Y'); rect(3, 23, 5, 24, 'q'); rect(13, 23, 15, 24, 'q'); }
    if (p.clipboard) { rect(18, 19, 19, 25, 'q'); rect(19, 20, 19, 24, 'W'); }
    // legs + boots
    rect(4, 24, 8, 27, 'K'); rect(10, 24, 14, 27, 'K'); rect(15, 24, 15, 27, 'k'); rect(9, 24, 9, 24, 'K');
    rect(3, 28, 8, 29, 'B'); rect(10, 28, 15, 29, 'B'); rect(15, 28, 16, 29, 'b');
    rect(2, 30, 17, 30, 'Z');
  }
  return g;
}

function colours(p) {
  const sleeve = p.top;
  return {
    S: p.skin, s: mix(p.skin, '#5A2E14', 0.22), m: mix(p.skin, '#5A2E14', 0.42),
    E: '#17120F', b: mix(p.hair, '#000000', 0.25),
    H: p.hair, h: mix(p.hair, '#FFFFFF', 0.16), d: mix(p.hair, '#000000', 0.28),
    G: '#141416', w: '#BFE3F7',
    C: p.hat || '#FFD21F', c: mix(p.hat || '#FFD21F', '#FFFFFF', 0.25), k: mix(p.hat || '#FFD21F', '#000000', 0.22),
    P: '#1C1C20', y: '#FFD21F', Y: p.headlamp ? '#FFF4C2' : '#FFD21F',
    T: p.top, t: mix(p.top, '#000000', 0.3), L: mix(p.top, p.kind === 'shirt' || p.kind === 'tee' ? '#8A8272' : '#000000', 0.3),
    A: sleeve, a: mix(sleeve, '#000000', 0.3),
    V: p.vest || '#FFD21F', v: mix(p.vest || '#FFD21F', '#000000', 0.25), R: p.stripes || '#D9DCE0',
    W: '#F7F5F0',
    K: p.pants, k: mix(p.pants, '#000000', 0.3), B: '#2B2117', b: '#17110B',
    Q: '#7A4A24', q: '#5A3418',
    Z: 'rgba(0,0,0,0.16)',
  };
}

// brick seams: every block gets a faint darker outline and a light top edge, like toy bricks
function gridToSVG(g, col, id) {
  const H = g.length;
  let body = '';
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let w = 1;
      while (x + w < W && g[y][x + w] === c) w++;
      body += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${col[c]}"/>`;
      x += w;
    }
  }
  const seams = `<pattern id="${id}" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M0 0H1V1" fill="none" stroke="rgba(0,0,0,.12)" stroke-width=".12"/><path d="M0 1V0.06H0.94" fill="none" stroke="rgba(255,255,255,.2)" stroke-width=".12"/></pattern>`;
  let mask = '';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] && g[y][x] !== 'Z') mask += `M${x} ${y}h1v1h-1z`;
  return { body, defs: `<defs>${seams}</defs>`, overlay: `<path d="${mask}" fill="url(#${id})"/>`, H };
}

const cache = new Map();
let uid = 0;

// Inline SVG string. stand: true draws the whole viber standing on the floor.
export function robotSVG(seed, { stand = false } = {}) {
  // paid skins: the server sends avatarSeed "skin:<id>" for agents wearing one
  if (typeof seed === 'string' && seed.startsWith('skin:')) {
    const id = seed.slice(5).replace(/[^a-z0-9-]/g, '');
    const H = stand ? BODY_H : BUST_H;
    return `<svg class="bot skin-bot" viewBox="0 0 ${W} ${H}" aria-hidden="true"><image href="brand/skins/${id}-${stand ? 'stand' : 'bust'}.png" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMax meet"/></svg>`;
  }
  const key = seed + (stand ? ':s' : '');
  if (cache.has(key)) return cache.get(key).replace(/__ID__/g, 'vx' + (++uid));
  const p = robotParts(seed, stand);
  const g = buildGrid(p);
  const r = gridToSVG(g, colours(p), '__ID__');
  const svg = `<svg class="bot" viewBox="0 0 ${W} ${r.H}" shape-rendering="crispEdges" aria-hidden="true">${r.defs}${r.body}${r.overlay}</svg>`;
  cache.set(key, svg);
  return svg.replace(/__ID__/g, 'vx' + (++uid));
}

// PNG of an agent's viber (default coin image): full body, centred on a yellow studded
// baseplate so it survives pump.fun's round crop.
export function robotPNG(seed, size = 512) {
  const p = robotParts(seed, true);
  const g = buildGrid(p);
  const col = colours(p);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#FFD21F';
  ctx.fillRect(0, 0, size, size);
  const tile = size / 8;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = (x + 0.5) * tile, cy = (y + 0.5) * tile, r = tile * 0.26;
    ctx.fillStyle = '#E3B800'; ctx.beginPath(); ctx.arc(cx, cy + tile * 0.05, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFE15C'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  const cell = Math.floor((size * 0.74) / BODY_H);
  const ox = Math.round((size - cell * W) / 2);
  const oy = Math.round((size - cell * BODY_H) / 2) + cell;
  g.forEach((row, y) => row.forEach((ch, x) => {
    if (!ch) return;
    ctx.fillStyle = col[ch];
    ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    if (ch === 'Z') return;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(ox + x * cell, oy + (y + 1) * cell - Math.max(1, cell / 9), cell, Math.max(1, cell / 9));
    ctx.fillRect(ox + (x + 1) * cell - Math.max(1, cell / 9), oy + y * cell, Math.max(1, cell / 9), cell);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(ox + x * cell, oy + y * cell, cell, Math.max(1, cell / 10));
  }));
  return c.toDataURL('image/png');
}
