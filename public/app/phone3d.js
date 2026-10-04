// The Crewfi phone: a black toy-brick smartphone (the back is a yellow studded brick plate)
// that you can turn any way you like. Its screen shows live "Just bonded" notifications:
// pump.fun coins that finished the bonding curve.
//
//   const phone = createPhone(el, { items, onOpen(item) {} });
//   phone.push(item)      // new notification (phone buzzes)
//   phone.destroy()
import { Mesh, compile, upload, mul, T, RX, RY, lookAt, ortho, norm, xf } from './office3d.js';

const K = 0.05;           // one phone voxel
const SW = 360, SH = 780; // screen texture size
const ROW = 104, TOP = 196;

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in float aSeam; layout(location=4) in float aEmit;
uniform mat4 uVP, uModel;
out vec3 vN, vLP, vMN, vCol; out float vSeam, vEmit;
void main(){
  vN = normalize(mat3(uModel) * aNrm); vLP = aPos; vMN = aNrm; vCol = aCol; vSeam = aSeam; vEmit = aEmit;
  gl_Position = uVP * uModel * vec4(aPos,1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN, vLP, vMN, vCol; in float vSeam, vEmit;
uniform vec3 uKey; uniform float uNight;
out vec4 o;
void main(){
  vec3 col = vCol;
  if (vSeam > 0.0) {
    vec3 an = abs(vMN);
    vec2 q = an.x > 0.5 ? vLP.yz : (an.y > 0.5 ? vLP.xz : vLP.xy);
    vec2 f = fract(q / vSeam + 0.0001); vec2 e = min(f, 1.0 - f) * vSeam;
    float d = min(e.x, e.y); float aa = max(fwidth(d), 0.0006);
    col *= 1.0 - (1.0 - smoothstep(0.002, 0.002 + aa * 1.2, d)) * 0.22;
  }
  if (vEmit > 0.5) { o = vec4(col, 1.0); return; }
  vec3 N = normalize(vN);
  float key = max(dot(N, uKey), 0.0);
  float rim = pow(1.0 - abs(N.z), 2.0) * 0.1;
  vec3 amb = mix(vec3(0.4, 0.4, 0.44), vec3(0.72, 0.72, 0.78), N.y * 0.5 + 0.5) * mix(1.0, 0.75, uNight);
  o = vec4(col * (amb + vec3(0.65, 0.6, 0.55) * key) + rim * vec3(0.9, 0.85, 0.8), 1.0);
}`;
const VS_TEX = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uVP, uModel; out vec2 vUV;
void main(){ vUV = aUV; gl_Position = uVP * uModel * vec4(aPos,1.0); }`;
const FS_TEX = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main(){ o = vec4(texture(uTex, vUV).rgb, 1.0); }`;

// a stud standing out of a -z facing face (the back of the device): base centre (x, y, z), pointing -z
function backStud(m, x, y, z, r, h, color, sides = 12) {
  const t = new Mesh();
  t.cyl(x, -z, y, r, h, color, sides);
  // (x, y, z) → (x, z, -y): turns +y (stud up) into -z, keeps the winding
  for (let i = 0; i < t.v.length; i += 11) {
    const py = t.v[i + 1], pz = t.v[i + 2], ny = t.v[i + 4], nz = t.v[i + 5];
    t.v[i + 1] = pz; t.v[i + 2] = -py; t.v[i + 4] = nz; t.v[i + 5] = -ny;
  }
  const b = m.n;
  m.v.push(...t.v); m.i.push(...t.i.map((k) => k + b)); m.n += t.n;
}

// ── phone model (x -0.5..0.5, y -1..1, z -0.075..0.075) ──
function buildPhone() {
  const m = new Mesh();
  const W = 20, H = 40, D = 3;
  const x0 = -W / 2, y0 = -H / 2, z0 = -D / 2;
  const BODY = 0x151515, YEL = 0xFFD21F;
  const cut = (y) => (y === 0 || y === H - 1 ? 2 : y === 1 || y === H - 2 ? 1 : 0); // rounded corners
  for (let y = 0; y < H; y++) {
    const c = cut(y);
    m.box((x0 + c) * K, (y0 + y) * K, z0 * K, (x0 + W - c) * K, (y0 + y + 1) * K, (z0 + D) * K, BODY, 0);
  }
  // front bezel frame (slightly raised ring around the screen)
  m.box(x0 * K + K, y0 * K + K, (z0 + D) * K, (x0 + W) * K - K, y0 * K + 2 * K, (z0 + D + 0.25) * K, 0x0E0E0E, K);
  m.box(x0 * K + K, (y0 + H) * K - 2 * K, (z0 + D) * K, (x0 + W) * K - K, (y0 + H) * K - K, (z0 + D + 0.25) * K, 0x0E0E0E, K);
  // side buttons: yellow power (right), dark volume (left)
  m.box((x0 + W) * K, 7 * K, -0.6 * K, (x0 + W + 0.5) * K, 11 * K, 0.6 * K, YEL, K);
  m.box((x0 - 0.5) * K, 9 * K, -0.6 * K, x0 * K, 12 * K, 0.6 * K, 0x2A2A2A, K);
  m.box((x0 - 0.5) * K, 4 * K, -0.6 * K, x0 * K, 7 * K, 0.6 * K, 0x2A2A2A, K);
  // back: a yellow studded brick plate with a black 2x2 brick logo and the camera block
  const bz = z0 * K - 0.5 * K;
  m.box((x0 + 1) * K, (y0 + 2) * K, bz, (x0 + W - 1) * K, (y0 + H - 2) * K, z0 * K, YEL, 0);
  const P = 4;                                                 // stud pitch (voxels)
  for (let gy = 0; gy < 9; gy++) for (let gx = 0; gx < 4; gx++) {
    const sx = x0 + 3 + gx * P, sy = y0 + 3.5 + gy * P;
    const cx = (sx + 1.5) * K, cy = (sy + 1.5) * K;
    const inCam = gx >= 2 && gy >= 7;                          // camera corner (top right seen from the back = left)
    const inLogo = gx >= 1 && gx <= 2 && gy >= 3 && gy <= 4;
    if (inCam || inLogo) continue;
    backStud(m, cx, cy, bz, 1.0 * K, 0.6 * K, YEL);
  }
  // logo: a black 2x2 brick with yellow studs in the middle
  const lx0 = (x0 + 6.5) * K, lx1 = (x0 + 13.5) * K, ly0 = (y0 + 15) * K, ly1 = (y0 + 22) * K;
  m.box(lx0, ly0, bz - 1.4 * K, lx1, ly1, bz, BODY, 0);
  for (const [a, b] of [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]]) backStud(m, lx0 + (lx1 - lx0) * a, ly0 + (ly1 - ly0) * b, bz - 1.4 * K, 0.95 * K, 0.6 * K, YEL);
  // camera block
  const cb = (x0 + 11) * K, ct = (y0 + 30) * K;
  m.box(cb, ct, bz - 0.6 * K, (x0 + W - 2) * K, (y0 + H - 3) * K, bz, 0x1E1E1E, K);
  m.box(cb + 1 * K, ct + 4 * K, bz - 1.2 * K, cb + 4 * K, ct + 6.5 * K, bz - 0.6 * K, 0x0B0B0D, K);
  m.box(cb + 1 * K, ct + 0.5 * K, bz - 1.2 * K, cb + 4 * K, ct + 3 * K, bz - 0.6 * K, 0x0B0B0D, K);
  m.box(cb + 1.8 * K, ct + 4.8 * K, bz - 1.3 * K, cb + 3.2 * K, ct + 5.7 * K, bz - 1.2 * K, 0x4B6BD8, K, 1);
  m.box(cb + 1.8 * K, ct + 1.3 * K, bz - 1.3 * K, cb + 3.2 * K, ct + 2.2 * K, bz - 1.2 * K, 0x4B6BD8, K, 1);
  m.box(cb + 5 * K, ct + 5 * K, bz - 0.9 * K, cb + 6 * K, ct + 6 * K, bz - 0.6 * K, 0xFFF4C2, K, 1);   // flash
  return m;
}

// ── screen drawing (2D canvas → texture) ──
const imgCache = new Map();
function coinImg(url, redraw) {
  if (!url) return null;
  let e = imgCache.get(url);
  if (!e) {
    e = { img: new Image(), ok: false };
    e.img.crossOrigin = 'anonymous';
    e.img.referrerPolicy = 'no-referrer';
    e.img.onload = () => { e.ok = true; redraw(); };
    e.img.onerror = () => { e.ok = false; };
    e.img.src = url;
    imgCache.set(url, e);
  }
  return e.ok ? e.img : null;
}
const COLORS = ['#F2B705', '#2F6FD0', '#22C55E', '#EF4444', '#8B5CF6', '#0EA5A4'];
const usd = (x) => (x >= 1e6 ? '$' + (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? '$' + (x / 1e3).toFixed(1) + 'K' : x > 0 ? '$' + Math.round(x) : '');
const ago = (ts, now) => { const s = Math.max(0, Math.round((now - ts) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.floor(s / 60) + 'm' : Math.floor(s / 3600) + 'h'; };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

export const F = (w, s, fam = 'Outfit') => `${w} ${s}px ${fam}, system-ui, sans-serif`;
export { SW, SH, rr };

// wallpaper + status bar (every screen shares this)
export function phoneChrome(ctx, now) {
  const g = ctx.createLinearGradient(0, 0, 0, SH);
  g.addColorStop(0, '#121212'); g.addColorStop(1, '#1C1C1C');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let x = 0; x < SW; x += 24) ctx.fillRect(x, 0, 1, SH);
  for (let y = 0; y < SH; y += 24) ctx.fillRect(0, y, SW, 1);
  // status bar + island
  const d = new Date(now);
  ctx.fillStyle = '#F1EFEA'; ctx.font = F(700, 17); ctx.textBaseline = 'middle';
  ctx.fillText(String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), 26, 30);
  ctx.fillStyle = '#000'; rr(ctx, SW / 2 - 52, 16, 104, 30, 15); ctx.fill();
  ctx.fillStyle = '#F1EFEA';
  [6, 9, 12, 15].forEach((h, i) => ctx.fillRect(SW - 92 + i * 6, 37 - h, 4, h));
  rr(ctx, SW - 58, 23, 32, 15, 4); ctx.strokeStyle = '#F1EFEA'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#5BE38A'; ctx.fillRect(SW - 55, 26, 22, 9); ctx.fillStyle = '#F1EFEA'; ctx.fillRect(SW - 25, 28, 3, 5);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(241,239,234,0.75)'; rr(ctx, SW / 2 - 60, SH - 22, 120, 6, 3); ctx.fill();
}

function drawBonded(ctx, items, now, redraw) {
  phoneChrome(ctx, now);
  // header
  ctx.fillStyle = '#F1EFEA'; ctx.font = F(400, 30, 'Bungee'); ctx.textBaseline = 'alphabetic';
  ctx.fillText('JUST BONDED', 24, 104);
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  ctx.fillStyle = `rgba(255,210,31,${0.35 + pulse * 0.65})`; ctx.beginPath(); ctx.arc(30, 132, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#9AA3B2'; ctx.font = F(600, 15);
  ctx.fillText('live · pump.fun → PumpSwap', 44, 137);
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(24, 160, SW - 48, 2);

  if (!items.length) {
    ctx.fillStyle = '#9AA3B2'; ctx.font = F(600, 17); ctx.textAlign = 'center';
    ctx.fillText('Waiting for the next coin', SW / 2, 360);
    ctx.fillText('to finish its bonding curve', SW / 2, 384);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = `rgba(241,239,234,${0.25 + 0.75 * Math.max(0, Math.sin(now / 250 - i))})`; ctx.beginPath(); ctx.arc(SW / 2 - 18 + i * 18, 424, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.textAlign = 'left';
  }
  const rows = [];
  items.slice(0, 5).forEach((it, i) => {
    const age = now - (it.shownAt || 0);
    const slide = Math.max(0, 1 - age / 450);
    const y = TOP + i * ROW - slide * 60;
    ctx.globalAlpha = 1 - slide;
    const fresh = i === 0 && now - it.shownAt < 8000;
    ctx.fillStyle = fresh ? 'rgba(255,210,31,0.16)' : 'rgba(255,255,255,0.06)';
    rr(ctx, 16, y, SW - 32, ROW - 12, 18); ctx.fill();
    if (fresh) { ctx.strokeStyle = 'rgba(255,210,31,0.85)'; ctx.lineWidth = 2; rr(ctx, 16, y, SW - 32, ROW - 12, 18); ctx.stroke(); }
    // coin image or letter tile
    const img = coinImg(it.image, redraw);
    ctx.save(); rr(ctx, 30, y + 14, 64, 64, 14); ctx.clip();
    if (img) ctx.drawImage(img, 30, y + 14, 64, 64);
    else {
      const sym = String(it.symbol || it.mint || '?');
      ctx.fillStyle = COLORS[sym.charCodeAt(0) % COLORS.length]; ctx.fillRect(30, y + 14, 64, 64);
      ctx.fillStyle = '#fff'; ctx.font = F(400, 30, 'Bungee'); ctx.textAlign = 'center'; ctx.fillText(sym[0].toUpperCase(), 62, y + 58); ctx.textAlign = 'left';
    }
    ctx.restore();
    ctx.fillStyle = '#F4F2EE'; ctx.font = F(800, 19);
    const name = String(it.name || it.symbol || it.mint.slice(0, 6) + '…');
    ctx.fillText(name.length > 16 ? name.slice(0, 15) + '…' : name, 108, y + 40);
    ctx.fillStyle = '#9AA3B2'; ctx.font = F(600, 15);
    ctx.fillText(`$${String(it.symbol || '???').slice(0, 10)}${it.mcapUsd ? '  ·  ' + usd(it.mcapUsd) : ''}`, 108, y + 66);
    ctx.fillStyle = fresh ? '#FFD21F' : '#7A7A7A'; ctx.font = F(700, 14); ctx.textAlign = 'right';
    ctx.fillText(fresh ? 'NEW' : ago(it.ts, now), SW - 30, y + 40); ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    rows.push({ x0: 16, x1: SW - 16, y0: y, y1: y + ROW - 12, item: it });
  });
  ctx.fillStyle = '#6F7887'; ctx.font = F(600, 13); ctx.textAlign = 'center';
  ctx.fillText('tap a coin to open it on pump.fun', SW / 2, SH - 42); ctx.textAlign = 'left';
  return rows;
}

// screen: optional custom app { draw(ctx, now, redraw) -> hits[{x0,y0,x1,y1,...}], tap(hit) }
// without it the phone runs the "Just bonded" notifications app (items / onOpen / push)
export function createPhone(host, { items = [], onOpen, screen: app = null, zoom = 1 } = {}) {
  const list = items.map((x) => ({ ...x, shownAt: 0 }));
  const drawScreen = app ? (ctx, _l, now, redraw) => app.draw(ctx, now, redraw) : drawBonded;
  const onHit = (hit) => { if (!hit) return; if (app) app.tap(hit); else if (onOpen) onOpen(hit.item); };
  const hitAt = (x, y) => rows.find((r) => y >= r.y0 && y <= r.y1 && x >= (r.x0 ?? 0) && x <= (r.x1 ?? SW));
  const screen = document.createElement('canvas');
  screen.width = SW; screen.height = SH;
  const sctx = screen.getContext('2d');
  let rows = [];
  let screenDirty = true;
  const redraw = () => { screenDirty = true; kick(); };

  const canvas = document.createElement('canvas');
  canvas.className = 'phone-gl';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Phone with live notifications of pump.fun coins that just bonded. Drag to turn it.');
  host.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) {
    // flat fallback: the same screen in a CSS phone frame
    canvas.remove();
    host.classList.add('flat');
    screen.className = 'phone-flat';
    host.appendChild(screen);
    const tick = () => { rows = drawScreen(sctx, list, Date.now(), redraw); };
    tick();
    const iv = setInterval(tick, 1000);
    screen.addEventListener('click', (e) => {
      const r = screen.getBoundingClientRect();
      onHit(hitAt((e.clientX - r.left) / r.width * SW, (e.clientY - r.top) / r.height * SH));
    });
    return {
      push(it) { list.unshift({ ...it, shownAt: Date.now() }); list.length = Math.min(list.length, 12); tick(); },
      refresh() { tick(); }, buzz() {},
      destroy() { clearInterval(iv); screen.remove(); },
    };
  }

  const prog = compile(gl, VS, FS);
  const tprog = compile(gl, VS_TEX, FS_TEX);
  const phone = upload(gl, buildPhone());
  // screen quad on the front face
  const zf = 1.5 * K + 0.003, sx = 0.44, sy = 0.94;
  const quadPts = [[-sx, -sy, zf], [sx, -sy, zf], [sx, sy, zf], [-sx, sy, zf]];
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-sx, -sy, zf, 0, 0, sx, -sy, zf, 1, 0, sx, sy, zf, 1, 1, -sx, sy, zf, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const pushTex = () => {
    rows = drawScreen(sctx, list, Date.now(), redraw);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen); }
    catch { imgCache.forEach((e) => { e.ok = false; }); rows = drawScreen(sctx, list, Date.now(), () => {}); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen); }
    screenDirty = false;
  };
  document.fonts?.ready.then(redraw);

  // ── state + input ──
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let yaw = -0.35, pitch = 0.1, vy = 0, vp = 0, t = 0, last = performance.now(), buzz = -10, lastTex = 0;
  let dragging = false, lx = 0, ly = 0, moved = 0, idleAt = 0, lastT = 0;
  let cssW = 1, cssH = 1, raf = 0, alive = true, visible = true, model = new Float32Array(16), VP = new Float32Array(16);

  const down = (e) => { dragging = true; moved = 0; lx = e.clientX; ly = e.clientY; lastT = performance.now(); canvas.setPointerCapture?.(e.pointerId); host.classList.add('grabbing'); kick(); };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly, now = performance.now(), dt = Math.max(8, now - lastT) / 1000;
    moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.012; pitch = Math.max(-1.35, Math.min(1.35, pitch + dy * 0.012));
    vy = dx * 0.012 / dt * 0.5; vp = dy * 0.012 / dt * 0.5;
    lx = e.clientX; ly = e.clientY; lastT = now; kick();
  };
  const up = (e) => {
    if (!dragging) return;
    dragging = false; host.classList.remove('grabbing'); idleAt = performance.now() + 2500;
    if (moved < 6) tap(e);
    kick();
  };
  function tap(e) {
    // which notification did you tap? (project the screen quad, invert the hit point to a uv)
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const M = mul(VP, model);
    const P = quadPts.map((q) => { const c = xf(M, q); return [(c[0] / c[3] * 0.5 + 0.5) * cssW, (1 - (c[1] / c[3] * 0.5 + 0.5)) * cssH]; });
    const facing = model[10] > 0.05; // screen normal (model z axis) points at the camera
    if (!facing) return;
    const uvOf = (a, b, c, ua, ub, uc) => {
      const v0 = [b[0] - a[0], b[1] - a[1]], v1 = [c[0] - a[0], c[1] - a[1]], v2 = [px - a[0], py - a[1]];
      const den = v0[0] * v1[1] - v1[0] * v0[1]; if (!den) return null;
      const v = (v2[0] * v1[1] - v1[0] * v2[1]) / den, w = (v0[0] * v2[1] - v2[0] * v0[1]) / den, u = 1 - v - w;
      if (u < 0 || v < 0 || w < 0) return null;
      return [ua[0] * u + ub[0] * v + uc[0] * w, ua[1] * u + ub[1] * v + uc[1] * w];
    };
    const uv = uvOf(P[0], P[1], P[2], [0, 0], [1, 0], [1, 1]) || uvOf(P[0], P[2], P[3], [0, 0], [1, 1], [0, 1]);
    if (!uv) return;
    onHit(hitAt(uv[0] * SW, (1 - uv[1]) * SH));
  }
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    kick();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); }); io.observe(host);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);
  const isDark = () => { const th = document.documentElement.getAttribute('data-theme'); return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (!dragging) {
      yaw += vy * dt; pitch = Math.max(-1.35, Math.min(1.35, pitch + vp * dt));
      vy *= Math.pow(0.05, dt); vp *= Math.pow(0.05, dt);
      if (now > idleAt && !reduce) { // drift back to a relaxed three-quarter view
        const ty = -0.35 + Math.sin(t * 0.45) * 0.28, tp = 0.1 + Math.sin(t * 0.7) * 0.05;
        let d = ty - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw += d * Math.min(1, dt * 2); pitch += (tp - pitch) * Math.min(1, dt * 2);
      }
    }
    const b = t - buzz;
    const roll = b >= 0 && b < 0.7 ? Math.sin(b * 70) * 0.05 * (1 - b / 0.7) : 0;
    const bob = reduce ? 0 : Math.sin(t * 1.3) * 0.03;
    model = mul(T(0, bob, 0), mul(RY(yaw), mul(RX(pitch), RZrot(roll))));

    const aspect = cssW / cssH;
    let hh = 1.1 / zoom, hw = hh * aspect;
    if (hw < 0.62 / zoom) { hw = 0.62 / zoom; hh = hw / aspect; }
    VP = mul(ortho(-hw, hw, -hh, hh, 1, 30), lookAt([0, 0, 10], [0, 0, 0]));

    if (screenDirty || now - lastTex > (b < 1.5 ? 33 : 1000)) { pushTex(); lastTex = now; }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uVP, false, VP);
    gl.uniformMatrix4fv(prog.u.uModel, false, model);
    gl.uniform3fv(prog.u.uKey, norm([-0.5, 0.7, 0.8]));
    gl.uniform1f(prog.u.uNight, isDark() ? 1 : 0);
    gl.bindVertexArray(phone.vao);
    gl.drawElements(gl.TRIANGLES, phone.count, gl.UNSIGNED_INT, 0);
    gl.useProgram(tprog.p);
    gl.uniformMatrix4fv(tprog.u.uVP, false, VP);
    gl.uniformMatrix4fv(tprog.u.uModel, false, model);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(tprog.u.uTex, 0);
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);

    if (alive && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function RZrot(a) { const c = Math.cos(a), s = Math.sin(a); const m = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function kick() { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  resize();

  return {
    refresh() { screenDirty = true; kick(); },
    buzz() { buzz = t; screenDirty = true; kick(); },
    push(it) {
      const i = list.findIndex((x) => x.mint === it.mint);
      if (i >= 0) list.splice(i, 1);
      list.unshift({ ...it, shownAt: Date.now() });
      list.length = Math.min(list.length, 12);
      buzz = t; screenDirty = true; kick();
    },
    destroy() {
      alive = false; if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
