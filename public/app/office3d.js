// Crewfi site office: a live, animated 3D brick diorama drawn with plain WebGL2 (no libraries).
// Everything is made of toy bricks with round studs on top. One look per career level
// (createOffice(el, { level: 1..6 })); level 2 is the CREW Site Office everyone sees.
// Four builders sit at their desks (Launcher, Content Creator, Trader, Researcher) and the
// foreman walks the floor. Speech bubbles above their heads are real buttons; clicking a
// builder does the same thing.
//
//   const office = createOffice(el, { onAction(role) {} });   // role: launch | shill | trade | research | how
//   office.setData({ trades, coins, tokens })   // live snapshot bits for screens + bubbles
//   office.celebrate('launch' | 'trade')          // burst of bricks / coins / candles
//   office.destroy()

const V = 0.07;                       // one character voxel (world units)
const ROOM = { w: 10, d: 7.6, h: 3.0 };
const BRK = 0.15;                     // wall brick course height (bricks are 2:1)

// ─────────────── tiny mat4 (column-major) ───────────────
const m4 = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
const T = (x, y, z) => { const m = m4(); m[12] = x; m[13] = y; m[14] = z; return m; };
const RX = (a) => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; };
const RY = (a) => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; };
const RZ = (a) => { const m = m4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
const S = (s) => { const m = m4(); m[0] = m[5] = m[10] = s; return m; };
const S3 = (x, y, z) => { const m = m4(); m[0] = x; m[5] = y; m[10] = z; return m; };
const chain = (...ms) => ms.reduce((a, b) => mul(a, b));
function xf(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function lookAt(eye, at, up = [0, 1, 0]) {
  const z = norm([eye[0] - at[0], eye[1] - at[1], eye[2] - at[2]]);
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}
function ortho(l, r, b, t, n, f) {
  const m = m4();
  m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n);
  m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n);
  return m;
}
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
function darken(h, a) { const c = hex(h).map((x) => Math.round(x * (1 - a) * 255)); return (c[0] << 16) | (c[1] << 8) | c[2]; }
function lighten(h, a) { const c = hex(h).map((x) => Math.round((x + (1 - x) * a) * 255)); return (c[0] << 16) | (c[1] << 8) | c[2]; }

// ─────────────── geometry ───────────────
// seam > 0: square voxel seam grid of that size; seam < 0: brick courses (|seam| high, 2x as long, staggered)
class Mesh {
  constructor(seam = V) { this.v = []; this.i = []; this.n = 0; this.seam = seam; }
  // axis-aligned box from (x0,y0,z0) to (x1,y1,z1)
  box(x0, y0, z0, x1, y1, z1, color, seam = 0, emit = 0, skip = '') {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const c = hex(color);
    const F = [
      ['px', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      ['nx', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      ['py', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
      ['ny', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ['pz', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['nz', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ];
    for (const [k, nrm, q] of F) {
      if (skip.includes(k)) continue;
      const b = this.n;
      for (const p of q) this.v.push(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], c[0], c[1], c[2], seam, emit);
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.n += 4;
    }
    return this;
  }
  // box in voxel units (x V)
  vox(x0, y0, z0, x1, y1, z1, color, emit = 0) { return this.box(x0 * V, y0 * V, z0 * V, x1 * V, y1 * V, z1 * V, color, this.seam, emit); }
  // upright n-sided prism (a stud): base centre (cx, y0, cz), radius r, height h
  cyl(cx, y0, cz, r, h, color, sides = 8, emit = 0) {
    const c = hex(color), y1 = y0 + h;
    const P = (a) => [cx + Math.cos(a) * r, cz + Math.sin(a) * r];
    for (let k = 0; k < sides; k++) {
      const a0 = (k / sides) * Math.PI * 2, a1 = ((k + 1) / sides) * Math.PI * 2, am = (a0 + a1) / 2;
      const [x0, z0] = P(a0), [x1, z1] = P(a1);
      const nx = Math.cos(am), nz = Math.sin(am), b = this.n;
      for (const [x, y, z] of [[x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1]]) this.v.push(x, y, z, nx, 0, nz, c[0], c[1], c[2], 0, emit);
      this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
      this.n += 4;
    }
    const b = this.n;
    this.v.push(cx, y1, cz, 0, 1, 0, c[0], c[1], c[2], 0, emit);
    for (let k = 0; k < sides; k++) { const [x, z] = P((k / sides) * Math.PI * 2); this.v.push(x, y1, z, 0, 1, 0, c[0], c[1], c[2], 0, emit); }
    for (let k = 0; k < sides; k++) this.i.push(b, b + 1 + ((k + 1) % sides), b + 1 + k);
    this.n += sides + 1;
    return this;
  }
  // a grid of studs on a top face (x0..x1, z0..z1 at height y), about one stud per pitch p
  studs(x0, z0, x1, z1, y, color, p = 0.16, sides = 8, emit = 0) {
    const nx = Math.max(1, Math.round((x1 - x0) / p)), nz = Math.max(1, Math.round((z1 - z0) / p));
    const px = (x1 - x0) / nx, pz = (z1 - z0) / nz, s = Math.min(px, pz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) this.cyl(x0 + (i + 0.5) * px, y, z0 + (j + 0.5) * pz, s * 0.31, s * 0.19, color, sides, emit);
    return this;
  }
  // a toy brick: nx x nz studs of pitch p, standing at (x, y, z) (min corner)
  brick(x, y, z, nx, nz, color, p = 0.16, h = p * 1.2, emit = 0) {
    this.box(x, y, z, x + nx * p, y + h, z + nz * p, color, 0, emit);
    return this.studs(x, z, x + nx * p, z + nz * p, y + h, color, p, 8, emit);
  }
}

// ─────────────── shaders ───────────────
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in float aSeam; layout(location=4) in float aEmit;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vW, vN, vLP, vMN, vCol; out float vSeam, vEmit; out vec4 vL;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  vW = w.xyz; vN = normalize(mat3(uModel) * aNrm); vLP = aPos; vMN = aNrm; vCol = aCol; vSeam = aSeam; vEmit = aEmit;
  vL = uLightVP * w;
  gl_Position = uVP * w;
}`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vW, vN, vLP, vMN, vCol; in float vSeam, vEmit; in vec4 vL;
uniform sampler2DShadow uShadow; uniform vec2 uShadowTexel;
uniform vec3 uSunDir, uSunCol, uSky, uGround; uniform float uNight;
uniform vec3 uLP[6]; uniform vec3 uLC[6];
out vec4 o;
float shadow(){
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0;
  for (int x=-1; x<=1; x++) for (int y=-1; y<=1; y++) s += texture(uShadow, vec3(p.xy + vec2(x,y)*uShadowTexel, p.z - 0.0022));
  return s / 9.0;
}
void main(){
  vec3 col = vCol;
  if (vSeam != 0.0) {
    vec3 an = abs(vMN);
    float sz = abs(vSeam);
    vec2 q = an.x > 0.5 ? vLP.zy : (an.y > 0.5 ? vLP.xz : vLP.xy);
    vec2 cell = vec2(sz);
    if (vSeam < 0.0 && an.y < 0.5) { cell = vec2(sz * 2.0, sz); q.x += mod(floor(q.y / sz + 0.0001), 2.0) * sz; }
    vec2 f = fract(q / cell + 0.0001); vec2 e = min(f, 1.0 - f) * cell;
    float d = min(e.x, e.y);
    float aa = max(fwidth(d), 0.0008);
    float line = 1.0 - smoothstep(0.0025, 0.0025 + aa * 1.2, d);
    float top = (vSeam < 0.0 && an.y < 0.5) ? (1.0 - smoothstep(0.0, 0.012, (1.0 - f.y) * cell.y)) : 0.0;
    col *= 1.0 - line * (vSeam < 0.0 ? 0.24 : 0.2);
    col = mix(col, min(col * 1.12 + 0.03, vec3(1.0)), top * 0.6);
  }
  if (vEmit > 3.5) { vec3 c = col * (0.86 + 0.14 * normalize(vN).y + 0.06 * normalize(vN).x); c = mix(c, c * 0.5, uNight); float a = mix(0.2, 0.1, uNight); o = vec4(c * a, a); return; }  // distant city
  if (vEmit > 1.5 && vEmit < 2.5) { o = vec4(mix(col, vec3(0.09, 0.11, 0.2), uNight * 0.9), 1.0); return; }
  if (vEmit > 0.5 && vEmit < 1.5) { o = vec4(col * (1.0 + uNight * 0.15), 1.0); return; }
  vec3 N = normalize(vN);
  float sh = shadow();
  float diff = max(dot(N, uSunDir), 0.0) * sh;
  vec3 amb = mix(uGround, uSky, N.y * 0.5 + 0.5);
  float side = N.x > 0.5 ? 0.97 : (N.z > 0.5 ? 1.0 : (N.y < -0.5 ? 0.75 : 0.92));
  vec3 light = amb * side + uSunCol * diff;
  for (int i=0;i<6;i++){
    vec3 d = uLP[i] - vW; float l = length(d);
    light += uLC[i] * max(dot(N, d / l), 0.0) / (1.0 + l*l*1.4);
  }
  o = vec4(pow(col * light, vec3(0.97)), 1.0);
  if (vEmit > 2.5) o.rgb = mix(max(o.rgb, col * 0.97), vec3(1.0, 0.82, 0.12), uNight * 0.95);   // sign faces: always bright, neon at night
}`;
const VS_DEPTH = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP * uModel * vec4(aPos,1.0); }`;
const FS_DEPTH = `#version 300 es
precision mediump float; out vec4 o; void main(){ o = vec4(1.0); }`;
const VS_TEX = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUV;
uniform mat4 uVP, uModel; out vec2 vUV;
void main(){ vUV = aUV; gl_Position = uVP * uModel * vec4(aPos,1.0); }`;
const FS_TEX = `#version 300 es
precision mediump float; in vec2 vUV; uniform sampler2D uTex; uniform float uBright; out vec4 o;
void main(){ o = vec4(texture(uTex, vUV).rgb * uBright, 1.0); }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

function upload(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const vb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.v), gl.STATIC_DRAW);
  const st = 11 * 4;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, st, 36);
  gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, st, 40);
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.i), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: mesh.i.length, bufs: [vb, ib] };
}

// ─────────────── the builders (toy-figure style) ───────────────
// spec: { skin, hair, style: 'short'|'side'|'messy'|'buzz'|'long'|'bun'|'curly', top, pants,
//   kind: 'tee'|'vest'|'hoodie'|'overalls'|'shirt'|'sweater', vest, stripes, sleeves,
//   cap (hard hat colour; alias: hat), headlamp, headphones (headset), glasses, beard,
//   belt (tool belt), clipboard, tool: 'hammer'|'wrench', print (chest brick print colour) }
// Old keys (tie, capBack, bag, kind 'suit') are accepted and ignored / mapped.
const YEL = 0xFFD21F, BLK = 0x151515, SILVER = 0xD9DCE0;
function characterMeshes(sp = {}) {
  const SK = sp.skin ?? 0xF2C38F, H = sp.hair ?? 0x2A1E19, TOP = sp.top ?? 0x2A2A2A, PANTS = sp.pants ?? 0x2A2A2A;
  const kind = sp.kind === 'suit' ? 'vest' : (sp.kind || 'tee');
  const HAT = sp.hat ?? sp.cap ?? null;
  const VEST = sp.vest ?? YEL;
  const SLEEVE = sp.sleeves ?? TOP;
  // torso: x -4..4, y 0..7, z -2..2 (pivot = hips). Hip piece + a figure torso, a touch wider at the bottom
  const torso = new Mesh(0);                                                      // smooth plastic: no voxel seams
  torso.vox(-4, 0, -2, 4, 1, 2, PANTS);
  torso.vox(-4.2, 1, -2.1, 4.2, 4, 2.1, TOP);
  torso.vox(-3.9, 4, -2, 3.9, 7, 2, TOP);
  if (kind === 'vest') {
    const SC = sp.stripes ?? SILVER;
    torso.vox(-4.4, 1, -2.3, 4.4, 4, 2.3, VEST); torso.vox(-4.1, 4, -2.2, 4.1, 7, 2.2, VEST);
    torso.vox(-0.8, 1.2, 2.2, 0.8, 7, 2.35, TOP);                                    // open front shows the shirt
    torso.vox(-4.45, 2.4, -2.35, -0.8, 3.1, 2.4, SC); torso.vox(0.8, 2.4, -2.35, 4.45, 3.1, 2.4, SC); // reflective band
    torso.vox(-2.9, 3.1, 2.2, -2.2, 7, 2.4, SC); torso.vox(2.2, 3.1, 2.2, 2.9, 7, 2.4, SC);              // shoulder straps
    torso.vox(-2.9, 3.1, -2.4, -2.2, 7, -2.2, SC); torso.vox(2.2, 3.1, -2.4, 2.9, 7, -2.2, SC);
  } else if (kind === 'hoodie') {
    torso.vox(-3.2, 6, -2.5, 3.2, 7.5, 2.2, darken(TOP, 0.12));                    // hood around the neck
    torso.vox(-2.2, 1, 2.1, 2.2, 2.8, 2.3, darken(TOP, 0.14));                     // pocket
    if (!sp.print) { torso.vox(-1.2, 4.6, 2, -0.8, 6.2, 2.3, lighten(TOP, 0.5)); torso.vox(0.8, 4.6, 2, 1.2, 6.2, 2.3, lighten(TOP, 0.5)); } // strings
  } else if (kind === 'overalls') {
    torso.vox(-2.8, 1, 2.1, 2.8, 5.2, 2.3, PANTS);                                 // bib
    torso.vox(-2.8, 5.2, 2, -1.9, 7, 2.25, PANTS); torso.vox(1.9, 5.2, 2, 2.8, 7, 2.25, PANTS); // straps
    torso.vox(-2.8, 3, -2.25, 2.8, 7, -2.05, PANTS);
    torso.vox(-2.6, 4.6, 2.3, -1.9, 5.3, 2.4, YEL); torso.vox(1.9, 4.6, 2.3, 2.6, 5.3, 2.4, YEL); // buttons
    torso.vox(-1.4, 2.4, 2.3, 1.4, 3.8, 2.38, darken(PANTS, 0.18));                // pocket
  } else if (kind === 'shirt') {
    torso.vox(-1.6, 6.2, 2, 1.6, 7, 2.3, lighten(TOP, 0.45));                       // collar
    for (let y = 1.6; y < 6; y += 1.4) torso.vox(-0.25, y, 2.1, 0.25, y + 0.5, 2.25, lighten(TOP, 0.6));
  } else if (kind === 'sweater') {
    torso.vox(-1.8, 6.2, 2, 1.8, 7, 2.25, lighten(TOP, 0.4));
  } else {
    torso.vox(-1.4, 6.1, 2, 1.4, 7, 2.15, SK);                                     // tee neckline
  }
  if (sp.stripes && kind !== 'vest') {                                             // reflective tape on any outfit
    torso.vox(-4.3, 2.4, -2.3, 4.3, 3.0, 2.35, sp.stripes, sp.stripesGlow ? 1 : 0);
  }
  if (sp.print) {                                                                  // a little 2x2 brick printed on the chest
    torso.vox(-1.5, 3.4, 2.1, 1.5, 5.6, 2.3, sp.print);
    torso.vox(-1.1, 5.6, 2.1, -0.3, 6.0, 2.3, sp.print); torso.vox(0.3, 5.6, 2.1, 1.1, 6.0, 2.3, sp.print);
  }
  if (sp.belt) {                                                                   // tool belt with pouches + a hammer
    const BR = 0x7A4A24, BRd = 0x5A3418;
    torso.vox(-4.5, 0.4, -2.4, 4.5, 1.4, 2.4, BR);
    torso.vox(-0.7, 0.5, 2.4, 0.7, 1.3, 2.55, 0xC9CDD2);                            // buckle
    torso.vox(-4.2, -1.4, 1.2, -2.2, 1.4, 3.1, BRd); torso.vox(2.2, -1.4, 1.2, 4.2, 1.4, 3.1, BRd);
    torso.vox(2.6, 1.4, 1.6, 3.0, 3.4, 2.0, 0xB07A3F); torso.vox(2.1, 3.0, 1.5, 3.6, 3.6, 2.1, 0x555A60); // hammer
  }
  torso.vox(-1.5, 7, -1.5, 1.5, 7.6, 1.5, SK);                                     // neck

  // head: x -4.5..4.5, y 0..8, z -3.5..4.5 (pivot = top of the neck); rounded block like a toy figure
  const head = new Mesh(0);
  head.vox(-4, 0, -3.5, 4, 8, 4.5, SK);
  head.vox(-4.5, 0.6, -3, 4.5, 7.4, 4, SK);
  head.vox(-3.5, 0.6, 4.5, 3.5, 7.4, 4.7, SK);
  head.vox(-2.6, 3.9, 4.7, -1.4, 5.5, 4.85, 0x17120F);                             // eyes
  head.vox(1.4, 3.9, 4.7, 2.6, 5.5, 4.85, 0x17120F);
  head.vox(-2.8, 3.4, 4.7, -1.7, 3.7, 4.8, darken(SK, 0.08)); head.vox(1.7, 3.4, 4.7, 2.8, 3.7, 4.8, darken(SK, 0.08)); // cheeks
  if (!sp.beard) {
    head.vox(-1.6, 1.7, 4.7, 1.6, 2.2, 4.85, 0x17120F);                            // classic smile
    head.vox(-2.2, 2.2, 4.7, -1.6, 2.8, 4.85, 0x17120F); head.vox(1.6, 2.2, 4.7, 2.2, 2.8, 4.85, 0x17120F);
  } else {
    const B = sp.beard;
    head.vox(-4.1, 0, 3.0, 4.1, 2.6, 4.95, B); head.vox(-4.6, 0.6, -0.5, -4.0, 4.6, 4.2, B); head.vox(4.0, 0.6, -0.5, 4.6, 4.6, 4.2, B);
    head.vox(-1.8, 2.6, 4.7, 1.8, 3.2, 5.0, B);                                     // moustache
    head.vox(-1.0, 1.3, 4.95, 1.0, 1.8, 5.05, 0x17120F);
  }
  head.vox(-2.8, 5.9, 4.7, -1.2, 6.3, 4.85, darken(H, 0.1)); head.vox(1.2, 5.9, 4.7, 2.8, 6.3, 4.85, darken(H, 0.1)); // brows
  const style = sp.style || 'short';
  if (HAT != null) {
    // hair peeking out under the hat
    head.vox(-4.7, 4.2, -3.3, -4.4, 7.4, 1.6, H); head.vox(4.4, 4.2, -3.3, 4.7, 7.4, 1.6, H);
    head.vox(-4.1, 3.2, -3.8, 4.1, 7.4, -3.5, H);
    if (style === 'long') { head.vox(-4.8, -3, -3.6, -4.2, 6, 1, H); head.vox(4.2, -3, -3.6, 4.8, 6, 1, H); head.vox(-4.2, -3, -4.1, 4.2, 6, -3.5, H); }
    if (style === 'bun' || style === 'curly') head.vox(-1.6, 3.2, -5, 1.6, 6, -3.6, H);
    // hard hat: brim, dome, ridge
    const C = HAT, Cd = darken(C, 0.18), Cl = lighten(C, 0.12);
    head.vox(-5.4, 7.2, -4.6, 5.4, 7.9, 5.5, Cd);
    head.vox(-4.2, 7.2, 5.5, 4.2, 7.8, 6.8, Cd);                                   // front peak
    head.vox(-4.8, 7.9, -4.0, 4.8, 10.4, 5.0, C);
    head.vox(-3.8, 10.4, -3.0, 3.8, 11.3, 4.0, C);
    head.vox(-0.9, 7.9, -4.3, 0.9, 11.7, 5.3, Cl);                                 // centre ridge
    if (sp.headlamp) {
      head.vox(-4.85, 8.2, -3.6, 4.85, 8.9, 5.1, BLK);                            // strap
      head.vox(-1.3, 8.3, 5.0, 1.3, 10.0, 5.8, 0x2A2A2A);
      head.vox(-0.9, 8.6, 5.8, 0.9, 9.7, 5.95, 0xFFF4C2, 1);
    }
  } else if (style === 'buzz') {
    head.vox(-4.2, 7, -3.7, 4.2, 8.4, 4.7, H); head.vox(-4.6, 4.5, -3.2, -4.4, 7.4, 1, H); head.vox(4.4, 4.5, -3.2, 4.6, 7.4, 1, H);
  } else {
    head.vox(-4.6, 7, -4, 4.6, 9.2, 4.9, H);                                        // top
    head.vox(-4.8, 3.6, -4, -4.4, 8, 1.8, H); head.vox(4.4, 3.6, -4, 4.8, 8, 1.8, H); // sides
    head.vox(-4.4, 1.6, -4, 4.4, 8, -3.5, H);                                       // back
    if (style === 'side') { head.vox(-4.4, 6.4, 4.5, 1.8, 7.4, 4.95, H); head.vox(-1.8, 9.2, -3, 3.6, 9.9, 3.6, lighten(H, 0.08)); }
    else if (style === 'messy' || style === 'curly') { head.vox(-4.4, 6.6, 4.5, 4.4, 7.4, 4.95, H); for (let i = -4; i < 4; i += 2) head.vox(i, 9.2, -3 + ((i + 4) % 3), i + 1.6, 10.3, 1 + ((i + 4) % 4), lighten(H, 0.06)); }
    else if (style === 'long') { head.vox(-4.4, 6.6, 4.5, 4.4, 7.4, 4.95, H); head.vox(-5, -3, -4.2, -4.2, 8, 2, H); head.vox(4.2, -3, -4.2, 5, 8, 2, H); head.vox(-4.4, -3, -4.6, 4.4, 8, -3.6, H); }
    else if (style === 'bun') { head.vox(-4.4, 6.6, 4.5, 4.4, 7.4, 4.95, H); head.vox(-1.8, 8.4, -4.4, 1.8, 11.4, -1.2, H); }
    else head.vox(-4.4, 6.6, 4.5, 4.4, 7.4, 4.95, H);
  }
  if (sp.glasses) {
    const G = 0x141416, L = sp.lens ?? 0x6E8FAE;
    head.vox(-3.4, 3.4, 4.85, -0.5, 6.0, 5.1, G); head.vox(0.5, 3.4, 4.85, 3.4, 6.0, 5.1, G);
    head.vox(-2.9, 3.9, 4.9, -1.0, 5.5, 5.18, L); head.vox(1.0, 3.9, 4.9, 2.9, 5.5, 5.18, L);
    head.vox(-0.5, 4.8, 4.85, 0.5, 5.3, 5.05, G);
    head.vox(-4.7, 4.9, -1, -4.5, 5.5, 4.9, G); head.vox(4.5, 4.9, -1, 4.7, 5.5, 4.9, G);
  }
  if (sp.headphones) {
    const P = 0x1A1A1D;
    if (HAT == null) head.vox(-4.9, 9.2, -1, 4.9, 10.0, 1, P);
    head.vox(-5.9, 2.8, -1.6, -4.5, 6.4, 1.6, P); head.vox(4.5, 2.8, -1.6, 5.9, 6.4, 1.6, P);
    head.vox(4.6, 2.4, 1.2, 5.2, 3.0, 4.4, P); head.vox(3.4, 2.2, 4.0, 4.8, 3.0, 5.0, 0x2A2A2E); // mic boom
    head.vox(-6.0, 3.6, -0.8, -5.8, 5.6, 0.8, YEL); head.vox(5.8, 3.6, -0.8, 6.0, 5.6, 0.8, YEL);
  }

  // arm: x -1..1, y -7..0, z -1..1 (pivot = shoulder)
  const arm = (side) => {
    const a = new Mesh(0);
    a.vox(-1.1, -4.6, -1.1, 1.1, 0.6, 1.1, SLEEVE);
    if (kind === 'vest') a.vox(-1.2, -1.6, -1.2, 1.2, 0.7, 1.2, VEST);             // vest shoulder
    a.vox(-1, -5.4, -1, 1, -4.6, 1, darken(SLEEVE, 0.15));
    a.vox(-0.9, -7.2, -0.9, 0.9, -5.4, 0.9, sp.gloves ?? SK);                      // hand
    if (side === 'R' && sp.clipboard) {
      a.vox(0.9, -11, -1.6, 1.3, -5.2, 2.6, 0x8A5A2B);                             // board
      a.vox(1.3, -10.6, -1.2, 1.4, -5.8, 2.2, 0xF7F7F5);                           // paper
      for (let y = -9.8; y < -6.5; y += 0.9) a.vox(1.4, y, -0.7, 1.45, y + 0.3, 1.7, 0x9AA0A6);
      a.vox(0.8, -5.6, -0.3, 1.5, -5.0, 1.3, 0x2A2A2E);                             // clip
    }
    if (side === 'R' && sp.tool === 'hammer') {
      a.vox(-0.35, -11, 0.6, 0.35, -5.6, 1.3, 0xB07A3F);
      a.vox(-0.6, -12, -0.6, 0.6, -10.8, 2.8, 0x555A60);
    }
    if (side === 'R' && sp.tool === 'wrench') {
      a.vox(-0.3, -11.5, 0.5, 0.3, -6, 1.2, 0x9AA0A6);
      a.vox(-0.4, -12.6, 0, 0.4, -11.2, 1.8, 0x9AA0A6); a.vox(-0.45, -12.2, 0.6, 0.45, -11.6, 1.2, BLK);
    }
    return a;
  };
  // leg: x -2..2, y -7..0, z -2..2 (pivot = hip); work boots
  const leg = new Mesh(0);
  leg.vox(-2, -5.8, -2, 2, 0, 2, PANTS);
  leg.vox(-2.2, -7, -2.2, 2.2, -5.8, 3.4, sp.boots ?? 0x2B2117);
  leg.vox(-2.25, -7.05, 2.4, 2.25, -6.4, 3.45, darken(sp.boots ?? 0x2B2117, 0.3));
  return { torso, head, armL: arm('L'), armR: arm('R'), leg };
}
function buildCharacter(gl, sp) {
  const m = characterMeshes(sp);
  return { torso: upload(gl, m.torso), head: upload(gl, m.head), armL: upload(gl, m.armL), armR: upload(gl, m.armR), leg: upload(gl, m.leg) };
}

// pose → list of [part, matrix]
function posed(parts, root, pose) {
  const hip = 7 * V;
  const base = mul(root, T(0, hip + (pose.bounce || 0), 0));
  const torso = mul(base, RY(pose.twist || 0));
  const head = chain(torso, T(0, 7.6 * V, 0), RY(pose.headYaw || 0), RX(pose.headPitch || 0));
  const armL = chain(torso, T(-5 * V, 6.5 * V, 0), RZ(pose.armLZ || 0.06), RX(pose.armL || 0));
  const armR = chain(torso, T(5 * V, 6.5 * V, 0), RZ(-(pose.armRZ || 0.06)), RX(pose.armR || 0));
  const legL = chain(base, T(-2 * V, 0, 0), RX(pose.legL || 0));
  const legR = chain(base, T(2 * V, 0, 0), RX(pose.legR || 0));
  return {
    draws: [[parts.torso, torso], [parts.head, head], [parts.armL, armL], [parts.armR, armR], [parts.leg, legL], [parts.leg, legR]],
    headTop: xf(head, [0, 13 * V, 0]),
  };
}

// ─────────────── chunky brick letters for the sign ───────────────
const GLYPHS = {
  B: ['#####.', '##..##', '##..##', '#####.', '##..##', '##..##', '#####.'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  L: ['##...', '##...', '##...', '##...', '##...', '##...', '#####'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  C: ['.####.', '##..##', '##....', '##....', '##....', '##..##', '.####.'],
  R: ['#####.', '##..##', '##..##', '#####.', '##.##.', '##..##', '##..##'],
  E: ['#####', '##...', '##...', '####.', '##...', '##...', '#####'],
  W: ['##...##', '##...##', '##...##', '##.#.##', '#######', '###.###', '##...##'],
  F: ['#####', '##...', '##...', '####.', '##...', '##...', '##...'],
};
const SIGN_WORD = 'CREWFI';
const SIGN_HIGHLIGHT = 2; // the last N letters get the accent colour ("FI")

// ─────────────── canvas textures ───────────────
function canvasTex(gl, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { c, ctx: c.getContext('2d'), t, push() { gl.bindTexture(gl.TEXTURE_2D, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); } };
}
function pixRows(ctx, rows, x0, y0, s, color) {
  ctx.fillStyle = color;
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') ctx.fillRect(x0 + x * s, y0 + y * s, s, s); }));
}
function drawRocket(tx) {
  const { ctx, c } = tx;
  ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#2A2A2A'; for (let i = 0; i < 18; i++) ctx.fillRect((i * 53) % c.width, (i * 29) % c.height, 3, 3);
  const R = ['....#....', '...###...', '..#####..', '..##.##..', '..##.##..', '..#####..', '..#####..', '.#######.', '##.###.##', '#..###..#', '...#.#...'];
  pixRows(ctx, R, c.width / 2 - 45, 22, 10, '#FFD21F');
  pixRows(ctx, ['..##.##..', '..##.##..'], c.width / 2 - 45, 52, 10, '#151515');
  pixRows(ctx, ['...#.#...', '....#....'], c.width / 2 - 45, 22 + 110, 10, '#F97316');
}
function drawX(tx) {
  const { ctx, c } = tx;
  ctx.fillStyle = '#0B0B0C'; ctx.fillRect(0, 0, c.width, c.height);
  const X = ['##.....##', '.##...##.', '..##.##..', '...###...', '...###...', '..##.##..', '.##...##.', '##.....##'];
  pixRows(ctx, X, c.width / 2 - 54, c.height / 2 - 48, 12, '#F4F4F2');
}
function drawSearch(tx, t = 0) {
  const { ctx, c } = tx;
  ctx.fillStyle = '#121212'; ctx.fillRect(0, 0, c.width, c.height);
  // trend lines behind the lens
  ctx.strokeStyle = '#2C2C2C'; ctx.lineWidth = 1;
  for (let y = 24; y < c.height; y += 28) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(c.width, y + 0.5); ctx.stroke(); }
  ctx.strokeStyle = '#22C55E'; ctx.lineWidth = 5; ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const x = 14 + i * 19, y = 120 - i * 6 - Math.sin(i * 1.3 + t) * 10; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  const M = ['..####....', '.#....#...', '#......#..', '#......#..', '#......#..', '#......#..', '.#....#...', '..####.#..', '.......##.', '........##'];
  pixRows(ctx, M, c.width - 128, 22, 11, '#FFD21F');
  ctx.fillStyle = '#FFD21F'; ctx.font = 'bold 20px monospace'; ctx.fillText('TRENDS', 12, 28);
}

function drawChat(tx, t = 0) {
  const { ctx, c } = tx;
  ctx.fillStyle = '#17171A'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#232327'; ctx.fillRect(0, 0, 46, c.height);
  ['#FFD21F', '#22C55E', '#5865F2', '#EF4444'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(23, 22 + i * 36, 13, 0, Math.PI * 2); ctx.fill(); });
  const msgs = [['#FFD21F', 'gm builders'], ['#22C55E', 'wen next launch?'], ['#5865F2', 'LFG'], ['#F2F2F0', 'welcome aboard!']];
  const k = Math.floor(t) % msgs.length;
  for (let i = 0; i < 4; i++) {
    const [col, txt] = msgs[(i + k) % msgs.length], y = 16 + i * 36;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(66, y + 10, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2C2C31'; ctx.fillRect(82, y, 160, 22);
    ctx.fillStyle = '#E8E8E6'; ctx.font = 'bold 15px monospace'; ctx.fillText(txt, 88, y + 16);
  }
}

// ─────────────── one office per career level ───────────────
// c = palette, windows = garage | std | tall | skyline, props() adds the furniture that makes the level
const GREENS = [0x3DBE4E, 0x2FA43F, 0x55D060];
// names shown on the site (Home office switcher, level-up toasts, career ladder)
export const OFFICE_NAMES = { 1: 'The Garage', 2: 'Site Office', 3: 'The Workshop', 4: 'Studio Loft', 5: 'Tower Floor', 6: 'The Skyscraper' };
export const MAIN_OFFICE = 2; // the CREW Site Office everyone sees
const OFFICE_LEVELS = {
  // 1 · the garage: concrete, a roll-up door, folding tables, boxes, a bare bulb, bricks piled in the corner
  1: {
    windows: 'garage', folding: true, crane: false,
    c: { floor: 0x9C9B97, floorSeam: 0.6, wall: 0xBDBBB5, wallR: 0xB3B1AB, accent: 0x9A9892, cap: 0x8E8C86, rim: 0xA6A49E,
      glass: 0xC9D6DC, frame: 0x3A3A3A, letter: 0x3A3A3A, signBase: 0x8E8C86,
      deskTop: 0xD8D6D0, deskLeg: 0x6E6E70, chair: 0x2A2A2A, chairBase: 0x3A3A3A, shelf: 0x6E6E70, shelfBoard: 0x8E8E90,
      pot: 0x8A6A4A, leaves: [0x7B8B3A, 0x6B7A30, 0x8F9A48], monitor: 0x2A2A2A },
    props({ room, walls, RW, RH, box, brick, pile, cone, plant }) {
      // roll-up garage door on the back wall
      walls.box(0.35, 0, 0, 2.75, 2.25, 0.04, 0x5A5A5C);
      for (let y = 0.05; y < 2.15; y += 0.16) walls.box(0.42, y, 0.04, 2.68, y + 0.13, 0.07, 0x8D9196);
      walls.box(1.4, 0.2, 0.07, 1.7, 0.27, 0.11, 0x2A2A2A);
      // pipes along the top of the walls
      walls.box(0, RH - 0.25, 0.05, RW, RH - 0.17, 0.13, 0x6F6B64); walls.box(RW - 0.13, RH - 0.25, 0, RW - 0.05, RH - 0.17, 7.6, 0x6F6B64);
      // bare bulb on a cord
      room.box(4.97, 2.05, 3.97, 5.03, RH, 4.03, 0x1B1B1B); room.box(4.92, 1.92, 3.92, 5.08, 2.07, 4.08, 0xFFE9A8, 0, 1);
      // workbench + pegboard with tools
      room.box(5.9, 0.85, 0.08, 7.5, 0.93, 0.7, 0xB98A55, 0.1); [[5.95, 0.12], [7.38, 0.12]].forEach(([x, z]) => room.box(x, 0, z, x + 0.08, 0.85, z + 0.5, 0x5A5A5C));
      walls.box(6.0, 1.15, 0, 7.4, 2.05, 0.03, 0xC9A46E);
      [[6.2, 0x555A60], [6.55, 0xB07A3F], [6.9, 0xE4453A], [7.15, 0x555A60]].forEach(([x, c]) => walls.box(x, 1.35, 0.03, x + 0.1, 1.85, 0.07, c));
      // cardboard boxes, a bucket of bricks, a cone
      box(8.3, 0.12, 0.55, 0.5, 0.45); box(8.35, 0.17, 0.45, 0.4, 0.35, 0.45); box(9.0, 0.15, 0.5, 0.5, 0.4);
      box(9.2, 6.8, 0.5, 0.5, 0.35); box(0.2, 6.6, 0.5, 0.5, 0.35);
      pile(0.5, 3.0, [0xFFD21F, 0xBDBBB5, 0x151515]); cone(9.4, 1.4); cone(0.5, 5.3);
      brick(5.6, 0, 6.6, 2, 4, 0xFFD21F); brick(2.4, 0, 6.9, 2, 2, 0x151515);
      plant(9.55, 4.4, 0.8);
    },
  },
  // 2 · the site office (everyone's default): white brick, yellow accents, crane, the big CREW sign
  2: {
    windows: 'std', crane: true,
    c: { floor: 0xE9E9E6, floorSeam: 0.5, wall: 0xF3F3F1, wallR: 0xEDEDEA, accent: 0xFFD21F, cap: 0xFFD21F, rim: 0xFFD21F,
      glass: 0xDCEAF2, frame: 0x151515, letter: 0x151515, signBase: 0xFFD21F,
      deskTop: 0xF7F7F5, deskLeg: 0x151515, cabinet: 0xFFD21F, chair: 0x1E1E20, chairBase: 0x1E1E20, shelf: 0x151515, shelfBoard: 0xF2F2F0,
      pot: 0x151515, leaves: GREENS, monitor: 0x151515, crane: 0xFFD21F },
    props({ room, walls, shelf, plant, brick, pile, cone, barrier, chartBoard, blueprint }) {
      chartBoard(7.1, 1.25, 8.45, 2.45, 0x151515);
      blueprint(2.75, 1.4, 3.35, 2.2);
      shelf(5.85, 0.02);
      plant(9.55, 0.45, 1.15, true); plant(0.45, 6.9, 1.1, true); plant(9.5, 6.95, 1.0, true); plant(5.5, 0.35, 0.85);
      room.box(1.8, 0, 4.3, 4.6, 0.02, 6.5, 0xD9D9D6, 0.1);                         // grey mat under the foreman's path
      room.box(1.9, 0.02, 4.4, 4.5, 0.03, 4.48, 0xFFD21F); room.box(1.9, 0.02, 6.32, 4.5, 0.03, 6.4, 0xFFD21F);
      pile(0.45, 3.4, [0xFFD21F, 0xFFD21F, 0x151515, 0xFFFFFF]);
      brick(5.8, 0, 6.7, 2, 4, 0xFFD21F); brick(6.3, 0, 7.05, 2, 2, 0x151515); brick(8.8, 0, 2.1, 4, 2, 0xFFD21F);
      cone(0.45, 5.0); barrier(8.25, 6.75);
    },
    deskLaunch({ room, top, x, z, brick }) { brick(x + 0.5, top, z, 2, 2, 0xFFD21F, 0.1); room.box(x - 0.72, top, z + 0.05, x - 0.56, top + 0.12, z + 0.2, 0xF7F7F5); },
    deskShill({ top, x, z, brick }) { brick(x + 0.42, top, z - 0.12, 2, 4, 0x151515, 0.08); },
    deskTrade({ plantSmall, x, z }) { plantSmall(x - 0.9, z - 0.2); },
  },
  // 3 · the workshop: warm wood floor, white brick with a yellow band, pegboard, sawhorses, more plants
  3: {
    windows: 'std', crane: true,
    c: { floor: 0xC8955E, floorSeam: 0.28, wall: 0xF5F2EC, wallR: 0xEFEBE4, accent: 0xFFD21F, cap: 0x151515, rim: 0xFFD21F,
      band: [0.9, 1.05, 0xFFD21F], glass: 0xDDEEE6, frame: 0x151515, letter: 0x151515, signBase: 0xFFD21F,
      deskTop: 0xE9D3B0, deskLeg: 0x151515, cabinet: 0x2A2A2A, chair: 0x2A2A2A, chairBase: 0x2A2A2A, shelf: 0x2A2A2A, shelfBoard: 0xE9D3B0,
      pot: 0xF7F6F2, leaves: GREENS, monitor: 0x151515, crane: 0xFFD21F },
    props({ room, walls, shelf, plant, brick, pile, cone, chartBoard, blueprint }) {
      walls.box(1.55, 1.25, 0, 3.25, 2.25, 0.03, 0xC9A46E);                         // pegboard + tools
      [[1.75, 0x555A60], [2.05, 0xB07A3F], [2.35, 0xFFD21F], [2.65, 0x555A60], [2.95, 0x22C55E]].forEach(([x, c]) => walls.box(x, 1.45, 0.03, x + 0.12, 2.05, 0.07, c));
      chartBoard(7.1, 1.3, 8.4, 2.45, 0x151515);
      shelf(5.85, 0.02, [0xFFD21F, 0x22C55E, 0x151515, 0xFFFFFF, 0xFFD21F, 0xEF4444]);
      // workbench with a vice by the window
      room.box(8.6, 0, 0.1, 9.75, 0.88, 0.62, 0x2A2A2A, 0.15); room.box(8.55, 0.88, 0.06, 9.8, 0.95, 0.68, 0xE9D3B0);
      room.box(8.75, 0.95, 0.2, 9.05, 1.12, 0.45, 0x555A60); brick(9.25, 0.95, 0.2, 2, 2, 0xFFD21F, 0.12);
      // sawhorses with a plank
      [0.35, 1.25].forEach((z) => { room.box(0.25, 0, 2.3 + z, 0.3, 0.55, 2.35 + z, 0xB07A3F); room.box(0.95, 0, 2.3 + z, 1.0, 0.55, 2.35 + z, 0xB07A3F); room.box(0.2, 0.5, 2.28 + z, 1.05, 0.56, 2.38 + z, 0xB07A3F); });
      room.box(0.3, 0.56, 2.45, 0.95, 0.6, 3.7, 0xE9C48F);
      plant(0.45, 0.45, 1.2, true); plant(0.45, 6.9, 1.2, true); plant(9.5, 6.95, 1.2, true); plant(9.55, 2.3, 0.9); plant(5.5, 0.35, 0.9);
      room.box(1.8, 0, 4.3, 4.6, 0.02, 6.5, 0x2A2A2A, 0.1); room.box(1.9, 0.02, 4.4, 4.5, 0.025, 6.4, 0xFFD21F, 0.1);
      pile(0.5, 5.1, [0xFFD21F, 0x151515, 0x22C55E]); brick(5.8, 0, 6.8, 2, 4, 0xFFD21F); cone(9.45, 4.3);
    },
    deskLaunch({ top, x, z, brick }) { brick(x + 0.5, top, z, 2, 2, 0xFFD21F, 0.1); },
    deskShill({ top, x, z, brick }) { brick(x + 0.42, top, z - 0.12, 2, 4, 0x22C55E, 0.08); },
  },
  // 4 · the studio loft: dark exposed brick, walnut floor, tall windows, yellow couch, wall screen
  4: {
    windows: 'tall', crane: true,
    c: { floor: 0x6E4B33, floorSeam: 0.3, wall: 0x38383B, wallR: 0x323235, accent: 0xFFD21F, cap: 0xFFD21F, rim: 0x2A2A2C,
      glass: 0xCFD8F0, frame: 0x101010, letter: 0x151515, letterFace: 0xFFD21F, signBase: 0xFFD21F,
      deskTop: 0x4A3222, deskEdge: 0xFFD21F, deskLeg: 0x101010, cabinet: 0x2A2A2C, chair: 0x1E1B24, chairBase: 0x1E1B24, chairTall: true,
      shelf: 0x2A2A2C, shelfBoard: 0x4A3222, pot: 0xFFD21F, leaves: GREENS, monitor: 0x101010, crane: 0xFFD21F },
    props({ room, walls, shelf, plant, brick, pile, chartBoard }) {
      chartBoard(1.5, 1.15, 3.3, 2.15, 0x0E0E10, true);
      // yellow brick couch along the left + side table
      room.box(0.1, 0.12, 2.3, 0.95, 0.48, 4.5, 0xFFD21F); room.studs(0.1, 2.3, 0.35, 4.5, 0.98, 0xFFD21F, 0.25);
      room.box(0.1, 0.48, 2.3, 0.35, 0.98, 4.5, 0xFFD21F); room.box(0.1, 0.48, 2.3, 0.95, 0.72, 2.5, 0xF2B705); room.box(0.1, 0.48, 4.3, 0.95, 0.72, 4.5, 0xF2B705);
      [2.55, 3.45].forEach((z) => room.box(0.35, 0.48, z, 0.9, 0.6, z + 0.85, 0xFFE15C, 0.1));
      room.box(0.35, 0.6, 3.0, 0.5, 0.85, 3.6, 0x151515, 0.05);
      [[0.15, 2.4], [0.8, 2.4], [0.15, 4.4], [0.8, 4.4]].forEach(([x, z]) => room.box(x, 0, z, x + 0.06, 0.12, z + 0.06, 0x101010));
      shelf(5.85, 0.02, [0xFFD21F, 0x151515, 0xFFFFFF, 0xFFD21F, 0x22C55E, 0x151515]);
      chartBoard(7.15, 1.35, 8.35, 2.45, 0xFFD21F);
      room.box(9.3, 0, 0.3, 9.4, 1.8, 0.4, 0x101010); room.box(9.15, 1.8, 0.15, 9.55, 2.1, 0.55, 0xFFF3C4, 0.05, 1);
      plant(0.45, 6.9, 1.2, true); plant(0.4, 0.45, 1.15, true); plant(9.5, 6.95, 1.1, true);
      room.box(1.7, 0, 4.1, 4.7, 0.02, 6.6, 0xFFD21F, 0.1); room.box(1.85, 0.02, 4.25, 4.55, 0.025, 6.45, 0x2A2A2C, 0.1);
      pile(9.4, 5.0, [0xFFD21F, 0x151515, 0xFFFFFF]); brick(5.8, 0, 6.8, 2, 4, 0xFFD21F);
    },
    deskLaunch({ top, x, z, brick }) { brick(x + 0.5, top, z, 2, 2, 0xFFD21F, 0.1); },
  },
  // 5 · the tower floor: black floor, charcoal walls, city skyline, a brick model of a tower, three screens
  5: {
    windows: 'skyline', crane: true, threeScreens: true,
    c: { floor: 0x1E1E20, floorSeam: 0.9, wall: 0x2A2A2C, wallR: 0x252527, accent: 0xFFD21F, cap: 0xFFD21F, rim: 0x2A2A2C,
      glass: 0x0F1A33, glassEmit: 1, frame: 0x101010, building: 0x0A0F1E, cityLight: 0xFFD27A,
      letter: 0x151515, letterFace: 0xFFD21F, signBase: 0xFFD21F, letterEmit: 0,
      deskTop: 0x141416, deskEdge: 0xFFD21F, deskLeg: 0x101010, cabinet: 0x2A2A2C, chair: 0x151515, chairBase: 0x101010, chairTall: true,
      shelf: 0x151515, shelfBoard: 0x2A2A2C, pot: 0xFFD21F, leaves: GREENS, monitor: 0x101010, crane: 0xFFD21F },
    props({ room, walls, plant, brick, chartBoard, tower }) {
      [1.5, 3.5, 5.5].forEach((z) => room.box(0, 0, z, 10, 0.006, z + 0.03, 0xFFD21F));
      chartBoard(7.1, 1.3, 8.4, 2.45, 0xFFD21F);
      chartBoard(5.85, 1.3, 6.9, 2.45, 0x151515);
      // brick model of a tower on a plinth
      room.box(8.6, 0, 0.15, 9.7, 0.6, 0.7, 0x151515, 0.15);
      tower(8.75, 0.6, 0.25, 6);
      // lounge chairs
      [2.4, 4.2].forEach((z) => { room.box(0.15, 0, z, 0.95, 0.45, z + 0.8, 0x151515, 0.1); room.box(0.15, 0.45, z, 0.4, 0.95, z + 0.8, 0x151515, 0.1); room.box(0.4, 0.45, z + 0.05, 0.9, 0.5, z + 0.75, 0xFFD21F); });
      room.box(0.35, 0, 3.35, 0.85, 0.35, 3.95, 0xFFD21F); brick(0.45, 0.35, 3.5, 2, 2, 0x151515, 0.12);
      plant(0.45, 6.9, 1.2, true); plant(0.4, 0.45, 1.15, true); plant(9.5, 6.95, 1.1, true);
      room.box(1.7, 0, 4.1, 4.7, 0.02, 6.6, 0xFFD21F, 0.1); room.box(1.8, 0.02, 4.2, 4.6, 0.025, 6.5, 0x2A2A2C, 0.1);
    },
    deskLaunch({ top, x, z, brick }) { brick(x + 0.5, top, z, 2, 2, 0xFFD21F, 0.1); brick(x + 0.53, top + 0.12, z + 0.03, 2, 2, 0xFFD21F, 0.08); },
  },
  // 6 · the skyscraper: black and gold, golden sign and crane, skyline, a golden brick pyramid
  6: {
    windows: 'skyline', crane: true, threeScreens: true,
    c: { floor: 0x121214, floorSeam: 1.2, wall: 0x18181A, wallR: 0x151517, accent: 0xE8B32E, cap: 0xF2C230, rim: 0x18181A,
      glass: 0x0B1030, glassEmit: 1, frame: 0x0A0A0C, building: 0x060918, cityLight: 0xFFB04A,
      letter: 0xF2C230, letterFace: 0xFFE38A, signBase: 0x151515, letterEmit: 1,
      deskTop: 0xD9A53A, deskEdge: 0xFFE38A, deskLeg: 0x0A0A0C, cabinet: 0x151515, chair: 0x151515, chairBase: 0x0A0A0C, chairTall: true,
      shelf: 0x0A0A0C, shelfBoard: 0x2A2A2C, pot: 0xF2C230, leaves: GREENS, monitor: 0x0A0A0C, crane: 0xF2C230 },
    props({ room, walls, RH, plant, brick, chartBoard, tower }) {
      room.box(1.5, 0, 3.9, 4.9, 0.02, 6.8, 0xF2C230, 0.1); room.box(1.62, 0.02, 4.02, 4.78, 0.025, 6.68, 0x151515, 0.1);
      // golden brick pyramid by the window
      for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - r; i++) brick(8.55 + i * 0.32 + r * 0.16, r * 0.192, 0.3, 2, 2, r % 2 ? 0xF2C230 : 0xE8B32E);
      tower(8.8, 0, 1.4, 9, 0xF2C230);
      // brick chandelier over the carpet
      const cx = 5.6, cz = 6.4;
      room.box(cx - 0.03, 2.3, cz - 0.03, cx + 0.03, RH, cz + 0.03, 0xF2C230);
      room.box(cx - 0.4, 2.22, cz - 0.4, cx + 0.4, 2.3, cz + 0.4, 0xF2C230, 0.08);
      [[-0.35, -0.35], [0.25, -0.35], [-0.35, 0.25], [0.25, 0.25], [-0.05, -0.05]].forEach(([a, b]) => room.box(cx + a, 2.02, cz + b, cx + a + 0.1, 2.22, cz + b + 0.1, 0xFFF3C4, 0, 1));
      chartBoard(6.0, 1.3, 7.0, 2.3, 0xF2C230);
      chartBoard(7.2, 1.35, 8.35, 2.5, 0xF2C230);
      // lounge: black sofa with gold trim
      room.box(0.1, 0.15, 2.2, 0.95, 0.5, 4.6, 0x151515, 0.12); room.box(0.1, 0.5, 2.2, 0.35, 1.05, 4.6, 0x151515, 0.12);
      room.box(0.1, 0.5, 2.2, 0.95, 0.75, 2.4, 0xF2C230); room.box(0.1, 0.5, 4.4, 0.95, 0.75, 4.6, 0xF2C230);
      brick(0.3, 0, 4.9, 2, 2, 0xF2C230); brick(0.36, 0.192, 4.96, 1, 1, 0xF2C230);
      plant(0.4, 0.45, 1.2, true); plant(9.5, 6.95, 1.2, true); plant(5.55, 0.4, 1.0);
    },
    deskLaunch({ top, x, z, brick }) { brick(x + 0.45, top, z - 0.05, 2, 2, 0xF2C230, 0.1); brick(x + 0.48, top + 0.12, z - 0.02, 2, 2, 0xF2C230, 0.08); },
    deskShill({ top, x, z, brick }) { brick(x + 0.4, top, z - 0.1, 2, 4, 0xF2C230, 0.08); },
    deskTrade({ top, x, z, brick }) { brick(x + 0.7, top, z + 0.05, 2, 2, 0xF2C230, 0.1); },
  },
};

// the crew on the main floor (robot.js presets 'crew-*' draw the same people in 2D)
const CREW = {
  launch: { skin: 0xF2C38F, hair: 0x3A2A1E, style: 'short', top: 0x151515, pants: 0x2A2A2A, kind: 'vest', vest: YEL, cap: YEL },
  shill: { skin: 0xC98E62, hair: 0x1E1814, style: 'short', top: 0xF4F4F2, pants: 0x151515, kind: 'hoodie', cap: BLK, headphones: true },
  trade: { skin: 0xF0C9A0, hair: 0x6E3B1F, style: 'side', top: 0x2F9E57, pants: 0x2A2A2A, kind: 'hoodie', cap: YEL, glasses: true },
  research: { skin: 0xE8B48A, hair: 0xB9BCC2, style: 'short', top: 0xF4F4F2, pants: 0x5A6068, kind: 'overalls', cap: YEL, glasses: true },
  community: { skin: 0xF6C9A2, hair: 0x9A3F1E, style: 'bun', top: 0x151515, pants: 0x2A2A2A, kind: 'tee', cap: YEL, glasses: true, headphones: true },
  boss: { skin: 0xD9A27A, hair: 0x5A3A22, style: 'short', top: 0x151515, pants: 0x2A2A2A, kind: 'vest', vest: YEL, stripes: BLK, cap: YEL, beard: 0x5A3A22, clipboard: true, belt: true },
};

// agent: solo mode for an agent's own page. { model?: SKIN_MODELS[id](), spec?: buildCharacter spec,
//        state: 'work' | 'sleep' | 'idle', title, sub } → only this agent, at its own desk
export function createOffice(host, { onAction, level = MAIN_OFFICE, agent = null } = {}) {
  const solo = agent || null;
  const canvas = document.createElement('canvas');
  canvas.className = 'office-gl';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
  if (!gl) { canvas.remove(); throw new Error('no webgl2'); }

  const prog = compile(gl, VS, FS);
  const depthProg = compile(gl, VS_DEPTH, FS_DEPTH);
  const texProg = compile(gl, VS_TEX, FS_TEX);

  // ── shadow map ──
  const SM = 2048;
  const shadowTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, shadowTex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const shadowFB = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, shadowTex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // ── static room (casts shadows) + walls (don't) ── themed per career level
  const LV = OFFICE_LEVELS[Math.min(6, Math.max(1, Math.round(level) || MAIN_OFFICE))];
  const K = LV.c;
  const room = new Mesh();
  const walls = new Mesh();
  const city = new Mesh();                                                        // faint brick skyline behind the building (not lit, see-through)
  let RW = ROOM.w, RD = ROOM.d, RH = ROOM.h;
  const SP = 0.25;                                                                // stud pitch on walls / rims

  // right wall windows
  const skyline = (z0, z1, y0, y1) => {                                           // city painted on the glass
    let s = Math.floor(z0 * 97);
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let z = z0 + 0.02; z < z1 - 0.1;) {
      const w = 0.14 + rnd() * 0.22, h = (y1 - y0) * (0.25 + rnd() * 0.6);
      const zz = Math.min(z + w, z1 - 0.02);
      walls.box(RW - 0.045, y0, z, RW - 0.035, y0 + h, zz, K.building, 0, 1);
      for (let yy = y0 + 0.08; yy < y0 + h - 0.08; yy += 0.11) for (let q = z + 0.03; q < zz - 0.05; q += 0.07) {
        if (rnd() < 0.45) walls.box(RW - 0.05, yy, q, RW - 0.044, yy + 0.045, q + 0.035, K.cityLight, 0, 1);
      }
      z = zz + 0.02 + rnd() * 0.05;
    }
  };
  const pane = (z0, z1, y0, y1) => {
    walls.box(RW - 0.03, y0, z0, RW, y1, z1, K.glass, 0, K.glassEmit ?? 2);
    walls.box(RW - 0.09, y0 - 0.06, z0 - 0.07, RW, y0 + 0.01, z1 + 0.07, K.frame);
    walls.box(RW - 0.09, y1, z0 - 0.07, RW, y1 + 0.07, z1 + 0.07, K.frame);
    walls.box(RW - 0.09, y0 - 0.06, z0 - 0.07, RW, y1 + 0.07, z0, K.frame);
    walls.box(RW - 0.09, y0 - 0.06, z1, RW, y1 + 0.07, z1 + 0.07, K.frame);
    walls.box(RW - 0.12, y0 - 0.09, z0 - 0.09, RW - 0.06, y0 - 0.03, z1 + 0.09, K.frame); // sill
    if (LV.windows !== 'skyline') {
      walls.box(RW - 0.06, (y0 + y1) / 2 - 0.025, z0, RW, (y0 + y1) / 2 + 0.025, z1, K.frame);
      walls.box(RW - 0.06, y0, (z0 + z1) / 2 - 0.025, RW, y1, (z0 + z1) / 2 + 0.025, K.frame);
    }
    if (LV.windows === 'skyline') skyline(z0, z1, y0, y1);
  };

  // helpers every level uses
  const brick = (x, y, z, nx, nz, color, p = 0.16) => room.brick(x, y, z, nx, nz, color, p);
  const pile = (x, z, cols) => {                                                  // a little heap of loose bricks
    const B = [[0, 0, 0, 2, 4], [0.36, 0, 0.05, 2, 2], [0.06, 0.192, 0.1, 2, 2], [0.4, 0, 0.42, 2, 2], [-0.05, 0, 0.7, 4, 2], [0.1, 0.192, 0.72, 2, 2]];
    B.forEach(([dx, y, dz, a, b], i) => brick(x + dx - 0.3, y, z + dz - 0.4, a, b, cols[i % cols.length]));
  };
  const cone = (x, z) => {                                                        // traffic cone
    room.box(x - 0.17, 0, z - 0.17, x + 0.17, 0.05, z + 0.17, 0x151515);
    [[0.12, 0.05, 0.2, 0xF97316], [0.1, 0.2, 0.3, 0xFFFFFF], [0.08, 0.3, 0.42, 0xF97316], [0.055, 0.42, 0.5, 0xFFFFFF], [0.04, 0.5, 0.58, 0xF97316]]
      .forEach(([r, a, b, c]) => room.box(x - r, a, z - r, x + r, b, z + r, c));
  };
  const barrier = (x, z) => {                                                     // striped site barrier
    [x - 0.5, x + 0.44].forEach((a) => { room.box(a, 0, z - 0.08, a + 0.06, 0.62, z + 0.08, 0x2A2A2A); room.box(a - 0.06, 0, z - 0.12, a + 0.12, 0.05, z + 0.12, 0x2A2A2A); });
    for (let i = 0; i < 6; i++) room.box(x - 0.5 + i * 0.167, 0.42, z - 0.025, x - 0.5 + (i + 1) * 0.167, 0.58, z + 0.025, i % 2 ? 0x151515 : 0xFFD21F);
  };
  const tower = (x, y, z, n, col = 0xFFD21F) => {                                 // a skyscraper built from bricks
    for (let i = 0; i < n; i++) {
      const c = i % 3 === 2 ? 0x151515 : col, s = i > n - 3 ? 1 : 2, o = s === 1 ? 0.08 : 0;
      room.box(x + o, y + i * 0.15, z + o, x + o + s * 0.16, y + (i + 1) * 0.15, z + o + s * 0.16, c);
    }
    room.studs(x + 0.08, z + 0.08, x + 0.24, z + 0.24, y + n * 0.15, col, 0.16);
    room.box(x + 0.15, y + n * 0.15, z + 0.15, x + 0.17, y + n * 0.15 + 0.3, z + 0.17, 0x9AA0A6);
  };
  const chartBoard = (x0, y0, x1, y1, frame, tv = false) => {                    // framed candle chart on the back wall
    walls.box(x0, y0, 0, x1, y1, 0.05, frame); walls.box(x0 + 0.08, y0 + 0.08, 0.05, x1 - 0.08, y1 - 0.08, 0.06, 0x101012, 0, tv ? 1 : 0);
    const n = Math.floor((x1 - x0 - 0.3) / 0.18);
    let v = y0 + 0.35;
    for (let i = 0; i < n; i++) {
      const up = (i * 7 + 3) % 5 !== 0, d = 0.1 + ((i * 13) % 5) * 0.035, x = x0 + 0.17 + i * 0.18;
      const a = v, b = up ? v + d : v - d * 0.6;
      walls.box(x + 0.045, Math.min(a, b) - 0.04, 0.06, x + 0.065, Math.max(a, b) + 0.04, 0.07, up ? 0x22C55E : 0xEF4444, 0, 1);
      walls.box(x, Math.min(a, b), 0.06, x + 0.11, Math.max(a, b) + 0.01, 0.08, up ? 0x22C55E : 0xEF4444, 0, 1);
      v = Math.min(y1 - 0.2, Math.max(y0 + 0.2, b));
    }
  };
  const blueprint = (x0, y0, x1, y1) => {                                         // blueprint poster
    walls.box(x0, y0, 0, x1, y1, 0.02, 0x2F6FD0);
    for (let y = y0 + 0.1; y < y1 - 0.05; y += 0.12) walls.box(x0 + 0.08, y, 0.02, x1 - 0.08, y + 0.012, 0.025, 0xBFD8FF);
    walls.box(x0 + 0.15, y0 + 0.2, 0.025, x0 + 0.17, y1 - 0.2, 0.03, 0xFFFFFF); walls.box(x0 + 0.15, y1 - 0.22, 0.025, x1 - 0.15, y1 - 0.2, 0.03, 0xFFFFFF);
    walls.box(x0 - 0.03, y1 - 0.06, 0.02, x0 + 0.05, y1 + 0.02, 0.04, 0xEF4444); walls.box(x1 - 0.05, y1 - 0.06, 0.02, x1 + 0.03, y1 + 0.02, 0.04, 0xEF4444);
  };
  const shelf = (x, z, c = [0xFFD21F, 0x151515, 0xFFFFFF, 0xFFD21F, 0x22C55E, 0x151515]) => {
    room.box(x, 0, z, x + 1.1, 1.3, z + 0.42, K.shelf, 0.13);
    [0.42, 0.85].forEach((y) => room.box(x + 0.05, y, z + 0.02, x + 1.05, y + 0.04, z + 0.44, K.shelfBoard || 0x3A3A40));
    room.box(x - 0.01, 1.3, z - 0.01, x + 1.11, 1.33, z + 0.43, K.shelfBoard || 0x3A3A40);
    c.forEach((col, i) => room.brick(x + 0.08 + (i % 3) * 0.34, 1.33 + (i === 1 ? 0.144 : 0), z + 0.06 + Math.floor(i / 3) * 0.16 + (i === 1 ? 0.04 : 0), 2, 1, col, 0.12, 0.144));
    room.box(x + 0.12, 0.89, z + 0.1, x + 0.5, 1.15, z + 0.4, 0x2F6FD0, 0.07); room.box(x + 0.6, 0.89, z + 0.1, x + 0.95, 1.05, z + 0.4, 0xFFD21F, 0.07);
    room.brick(x + 0.12, 0.46, z + 0.1, 2, 2, 0xFFD21F, 0.13); room.brick(x + 0.15, 0.62, z + 0.13, 2, 2, 0x151515, 0.11);
    room.box(x + 0.6, 0.46, z + 0.1, x + 0.95, 0.58, z + 0.4, 0xF1EFEA, 0.07);
    room.box(x + 0.15, 0.04, z + 0.1, x + 0.95, 0.36, z + 0.4, 0x2F6FD0, 0.07);  // blueprint box
  };
  const plant = (x, z, s = 1, tall = false, pot = K.pot, leaves = K.leaves) => {
    const p = 0.34 * s;
    room.box(x - p / 2, 0, z - p / 2, x + p / 2, p * 1.05, z + p / 2, pot, 0);
    room.studs(x - p / 2, z - p / 2, x + p / 2, z - p / 2 + 0.08 * s, p * 1.05, pot, 0.08 * s, 6);
    room.box(x - p / 2 + 0.02, p * 1.05, z - p / 2 + 0.02, x + p / 2 - 0.02, p * 1.08, z + p / 2 - 0.02, 0x4A3120);
    const k = 0.08 * s;
    const levels = tall ? 9 : 5;
    const cells = new Set(), list = [];
    for (let l = 0; l < levels; l++) {
      const r = (tall ? [2, 3, 3, 2, 3, 2, 2, 1, 1] : [2, 3, 2, 1, 1])[l];
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.abs(a) + Math.abs(b) > r + (l % 2)) continue;
        if ((a * 7 + b * 13 + l * 5) % 5 === 0 && Math.abs(a) + Math.abs(b) === r) continue;
        cells.add(a + ',' + b + ',' + l); list.push([a, b, l]);
      }
    }
    for (const [a, b, l] of list) {
      const y = p * 1.08 + l * k, col = leaves[(a + b + l + 9) % 3];
      room.box(x + a * k - k / 2, y, z + b * k - k / 2, x + a * k + k / 2, y + k, z + b * k + k / 2, col, 0);
      if (!cells.has(a + ',' + b + ',' + (l + 1))) room.cyl(x + a * k, y + k, z + b * k, k * 0.3, k * 0.22, col, 6);
    }
  };
  const box = (x, z, w, d, h, y = 0, c = 0xB98A55) => {                          // cardboard box
    room.box(x, y, z, x + w, y + h, z + d, c, 0.07);
    room.box(x + w * 0.45, y + h, z - 0.001, x + w * 0.55, y + h + 0.004, z + d + 0.001, 0xD9C38E);
  };

  // desks
  const desk = (x, z, w = 1.8, d = 0.86) => {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
    if (LV.folding) {                                                             // garage: folding tables
      room.box(x0, 0.72, z0, x1, 0.76, z1, K.deskTop, 0.09);
      [[x0 + 0.08, z0 + 0.08], [x1 - 0.12, z0 + 0.08], [x0 + 0.08, z1 - 0.12], [x1 - 0.12, z1 - 0.12]].forEach(([a, b]) => room.box(a, 0, b, a + 0.04, 0.72, b + 0.04, K.deskLeg));
      return 0.76;
    }
    room.box(x0, 0.72, z0, x1, 0.79, z1, K.deskTop, 0);
    room.box(x0 - 0.005, 0.715, z1 - 0.025, x1 + 0.005, 0.795, z1 + 0.005, K.deskEdge || darken(K.deskTop, 0.08));
    room.box(x0 + 0.04, 0, z0 + 0.05, x0 + 0.1, 0.72, z1 - 0.05, K.deskLeg);
    room.box(x0 + 0.04, 0.02, z0 + 0.05, x0 + 0.1, 0.08, z1 - 0.05, K.deskLeg);
    room.box(x1 - 0.55, 0, z0 + 0.06, x1 - 0.04, 0.72, z1 - 0.06, K.cabinet || K.deskLeg, -0.12);
    room.box(x1 - 0.35, 0.55, z1 - 0.06, x1 - 0.24, 0.58, z1 - 0.03, 0x151515);
    room.box(x1 - 0.35, 0.33, z1 - 0.06, x1 - 0.24, 0.36, z1 - 0.03, 0x151515);
    return 0.79;
  };
  const chair = (x, z, face) => {
    const s = face;
    if (LV.folding) {                                                             // plastic stool-chair
      room.box(x - 0.22, 0.42, z - 0.22, x + 0.22, 0.46, z + 0.22, K.chair, 0.07);
      room.box(x - 0.22, 0.46, z - s * 0.24, x + 0.22, 0.85, z - s * 0.2, K.chair, 0.07);
      [[-0.19, -0.19], [0.16, -0.19], [-0.19, 0.16], [0.16, 0.16]].forEach(([a, b]) => room.box(x + a, 0, z + b, x + a + 0.03, 0.42, z + b + 0.03, 0x6E6E6E));
      return;
    }
    const tall = K.chairTall ? 0.35 : 0;
    room.box(x - 0.26, 0.4, z - 0.26, x + 0.26, 0.47, z + 0.26, K.chair, 0.07);
    room.box(x - 0.25, 0.47, z - s * 0.3, x + 0.25, 1.05 + tall, z - s * 0.22, K.chair, 0.07);
    room.box(x - 0.03, 0.08, z - 0.03, x + 0.03, 0.4, z + 0.03, 0x4A4A50);
    room.box(x - 0.3, 0.05, z - 0.03, x + 0.3, 0.09, z + 0.03, K.chairBase);
    room.box(x - 0.03, 0.05, z - 0.3, x + 0.03, 0.09, z + 0.3, K.chairBase);
    [[-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]].forEach(([a, b]) => room.box(x + a - 0.035, 0, z + b - 0.035, x + a + 0.035, 0.05, z + b + 0.035, 0x151517));
  };

  function plantSmall(x, z, y = 0.79) {
    room.box(x - 0.07, y, z - 0.07, x + 0.07, y + 0.14, z + 0.07, K.pot, 0);
    const k = 0.045;
    const L = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [1, 1, 0], [0, 1, -1], [0, 2, 0], [-1, 1, 1]];
    const has = new Set(L.map(([a, l, b]) => a + ',' + l + ',' + b));
    L.forEach(([a, l, b], i) => {
      const yy = y + 0.14 + l * k;
      room.box(x + a * k - k / 2, yy, z + b * k - k / 2, x + a * k + k / 2, yy + k, z + b * k + k / 2, K.leaves[i % 3], 0);
      if (!has.has(a + ',' + (l + 1) + ',' + b)) room.cyl(x + a * k, yy + k, z + b * k, k * 0.3, k * 0.22, K.leaves[i % 3], 6);
    });
  }

  // screens (textured quads) collected here
  const quads = [];
  const quad = (tex, cx, cy, cz, w, h, facing) => quads.push({ tex, cx, cy, cz, w, h, facing });   // facing: 1 / -1 along z, 'x' = faces -x (cz is then the x plane, cx the z centre)
  const monitor = (x, y, z, face, w = 0.66, h = 0.42) => {
    const zb = z - face * 0.03, zf = z + face * 0.03;
    room.box(x - w / 2, y + 0.16, zb, x + w / 2, y + 0.16 + h, zf, K.monitor || 0x151515, 0);
    room.box(x - 0.04, y, z - face * 0.07, x + 0.04, y + 0.2, z - face * 0.03, 0x2A2A2F);
    room.box(x - 0.16, y, z - 0.12, x + 0.16, y + 0.02, z + 0.08, 0x2A2A2F);
    return { cx: x, cy: y + 0.16 + h / 2, zFront: zf + face * 0.002, zBack: zb - face * 0.002, w: w - 0.06, h: h - 0.06 };
  };

  const tex = {
    chart: canvasTex(gl, 320, 200), list: canvasTex(gl, 320, 200),
    rocket: canvasTex(gl, 256, 160), x: canvasTex(gl, 256, 160), search: canvasTex(gl, 256, 160), chat: canvasTex(gl, 256, 160),
  };
  drawRocket(tex.rocket); tex.rocket.push();
  drawX(tex.x); tex.x.push();
  drawSearch(tex.search); tex.search.push();
  drawChat(tex.chat); tex.chat.push();

  // everything built inside fn() is lifted by dy (an upper floor reuses the ground-floor helpers)
  function lift(dy, fn) {
    const a = room.v.length, b = walls.v.length, c = quads.length;
    fn();
    for (let i = a + 1; i < room.v.length; i += 11) room.v[i] += dy;
    for (let i = b + 1; i < walls.v.length; i += 11) walls.v[i] += dy;
    for (let i = c; i < quads.length; i++) quads[i].cy += dy;
  }

  // ── the crane ──
  let CR = null, jibGL = null, hookGL = null, cableGL = null;
  // ── the crane (a tower crane standing in the back-left corner) ──
  function crane(cx, cz, ch) {
    CR = { x: cx, z: cz, h: ch };
    const C = K.crane || 0xFFD21F, s = 0.19, t = 0.045;
    room.box(CR.x - 0.36, 0, CR.z - 0.36, CR.x + 0.36, 0.12, CR.z + 0.36, 0x8E8E8C);
    room.studs(CR.x - 0.36, CR.z - 0.36, CR.x + 0.36, CR.z + 0.36, 0.12, 0x8E8E8C, 0.18);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) room.box(CR.x + dx * s - t, 0.12, CR.z + dz * s - t, CR.x + dx * s + t, CR.h, CR.z + dz * s + t, C);
    for (let y = 0.3; y < CR.h - 0.1; y += 0.34) {
      room.box(CR.x - s, y, CR.z + s - 0.02, CR.x + s, y + 0.035, CR.z + s + 0.02, C);
      room.box(CR.x - s, y, CR.z - s - 0.02, CR.x + s, y + 0.035, CR.z - s + 0.02, C);
      room.box(CR.x - s - 0.02, y, CR.z - s, CR.x - s + 0.02, y + 0.035, CR.z + s, C);
      room.box(CR.x + s - 0.02, y, CR.z - s, CR.x + s + 0.02, y + 0.035, CR.z + s, C);
      for (let k = 1; k < 6; k++) {                                               // diagonal bracing
        const f = k / 6, yy = y + f * 0.34, q = -s + f * 2 * s;
        room.box(CR.x + q - 0.018, yy - 0.018, CR.z + s - 0.015, CR.x + q + 0.018, yy + 0.018, CR.z + s + 0.015, C);
        room.box(CR.x - s - 0.015, yy - 0.018, CR.z - q - 0.018, CR.x - s + 0.015, yy + 0.018, CR.z - q + 0.018, C);
      }
    }
    // jib (slewing part) in its own space: mast axis at the origin, the jib points along +x
    const J = new Mesh();
    J.box(-0.26, -0.06, -0.26, 0.26, 0.06, 0.26, 0x2A2A2A);
    J.box(-0.06, 0.06, -0.06, 0.06, 0.78, 0.06, C);                              // tower peak
    J.box(0.12, -0.44, 0.21, 0.5, 0.0, 0.55, C, 0); J.box(0.5, -0.36, 0.25, 0.505, -0.08, 0.51, 0x151515); J.box(0.16, -0.36, 0.55, 0.46, -0.08, 0.555, 0x151515); // cab
    J.studs(0.12, 0.21, 0.5, 0.55, 0.0, C, 0.19);
    for (const zz of [-0.1, 0.1]) J.box(0.2, 0.06, zz - 0.022, 3.35, 0.1, zz + 0.022, C);    // bottom chords
    J.box(0.2, 0.3, -0.022, 3.2, 0.34, 0.022, C);                                // top chord
    for (let x = 0.3; x < 3.3; x += 0.26) { J.box(x - 0.018, 0.1, -0.1, x + 0.018, 0.3, -0.07, C); J.box(x - 0.018, 0.1, 0.07, x + 0.018, 0.3, 0.1, C); J.box(x - 0.018, 0.26, -0.1, x + 0.018, 0.3, 0.1, C); }
    J.box(3.3, 0.06, -0.12, 3.4, 0.2, 0.12, 0x151515);
    J.box(-1.15, 0.06, -0.13, -0.2, 0.14, 0.13, C);                                // counter jib + weights
    J.box(-1.1, -0.22, -0.14, -0.72, 0.3, 0.14, 0x8E8E8C, 0); J.studs(-1.1, -0.14, -0.72, 0.14, 0.3, 0x8E8E8C, 0.19);
    for (let i = 1; i < 18; i++) { const f = i / 18; J.box(f * 2.4 - 0.012, 0.78 - f * 0.44 - 0.012, -0.012, f * 2.4 + 0.012, 0.78 - f * 0.44 + 0.012, 0.012, 0x3A3A3A); }  // pendant lines
    for (let i = 1; i < 8; i++) { const f = i / 8; J.box(-f * 1.0 - 0.012, 0.78 - f * 0.62 - 0.012, -0.012, -f * 1.0 + 0.012, 0.78 - f * 0.62 + 0.012, 0.012, 0x3A3A3A); }
    J.box(2.15, 0.0, -0.1, 2.45, 0.07, 0.1, 0x2A2A2A);                              // trolley
    jibGL = upload(gl, J);
    const cab = new Mesh(); cab.box(-0.01, -1, -0.01, 0.01, 0, 0.01, 0x2A2A2A); cableGL = upload(gl, cab);
    const hk = new Mesh();
    hk.box(-0.06, -0.1, -0.06, 0.06, 0, 0.06, 0x151515); hk.box(-0.015, -0.17, -0.015, 0.015, -0.1, 0.015, 0x151515);
    hk.brick(-0.32, -0.36, -0.16, 4, 2, 0xFFD21F, 0.16);
    hookGL = upload(gl, hk);
  }

  // ── the single open room (an agent's own office, one look per level) ──
  function roomScene() {
  const SP = 0.25;                                                                // stud pitch on walls / rims
  room.box(-0.25, -0.3, -0.25, RW + 0.25, 0, RD + 0.25, K.floor, K.floorSeam ?? 0.5);
  walls.box(-0.25, 0, -0.25, RW + 0.25, RH, 0, K.wall, -BRK);                     // back wall (brick courses)
  walls.box(RW, 0, -0.25, RW + 0.25, RH, RD + 0.25, K.wallR, -BRK);               // right wall
  // wall caps: one course of bricks with studs (the sign stands on the back one)
  walls.box(-0.26, RH, -0.26, RW + 0.26, RH + 0.08, 0.01, K.cap, 0);
  walls.box(RW - 0.01, RH, -0.26, RW + 0.26, RH + 0.08, RD + 0.26, K.cap, 0);
  walls.studs(-0.25, -0.25, 1.75, 0, RH + 0.08, K.cap, SP);
  walls.studs(8.25, -0.25, RW + 0.25, 0, RH + 0.08, K.cap, SP);
  walls.studs(RW, 0, RW + 0.25, RD + 0.25, RH + 0.08, K.cap, SP);
  // low cut-away rims with studs (the open sides of the diorama)
  walls.box(-0.25, 0, 0, 0, 0.42, RD + 0.25, K.rim, -BRK * 0.7);
  walls.box(0, 0, RD, RW, 0.42, RD + 0.25, K.rim, -BRK * 0.7);
  walls.studs(-0.25, 0, 0, RD + 0.25, 0.42, K.rim, SP);
  walls.studs(0, RD, RW, RD + 0.25, 0.42, K.rim, SP);
  // corner quoins: alternating long / short accent bricks up every edge
  for (let r = 0, y = 0; y < RH - 0.01; r++, y += BRK) {
    const L = r % 2 ? 0.3 : 0.6, y1 = Math.min(RH, y + BRK);
    walls.box(-0.262, y, -0.262, -0.25 + L, y1, 0.012, K.accent, -BRK);         // back wall, left end
    walls.box(RW - 0.012, y, RD + 0.25 - L, RW + 0.262, y1, RD + 0.262, K.accent, -BRK); // right wall, front end
    walls.box(RW - L, y, 0, RW, y1, 0.012, K.accent, -BRK);                       // inner corner
    walls.box(RW - 0.012, y, 0, RW, y1, L, K.accent, -BRK);
  }
  walls.box(0, 0, -0.01, RW, 0.1, 0.02, darken(K.wall, 0.12), 0);                 // skirting
  walls.box(RW - 0.02, 0, 0, RW + 0.01, 0.1, RD, darken(K.wallR, 0.12), 0);
  if (K.band) {                                                                   // accent brick course
    const [y0, y1, c] = K.band;
    walls.box(0, y0, 0, RW, y1, 0.015, c, -BRK);
    walls.box(RW - 0.015, y0, 0, RW, y1, RD, c, -BRK);
  }

  // the CREW sign on top of the back wall: chunky bricks with studs
  {
    const word = SIGN_WORD;
    const widths = [...word].map((ch) => GLYPHS[ch][0].length);
    const total = widths.reduce((a, b) => a + b, 0) + word.length - 1;
    const L = 0.175 * Math.min(1, 31 / total); // sized for the 31-column CREW sign; longer words shrink
    const x0 = RW / 2 - (total * L) / 2, y0 = RH + 0.08 + 0.16, z0 = -0.24, z1 = -0.02;
    room.box(x0 - 0.22, RH + 0.08, -0.26, x0 + total * L + 0.22, y0, 0.02, K.signBase, 0);   // base beam
    room.studs(x0 - 0.22, -0.26, x0 + total * L + 0.22, 0.02, y0, K.signBase, 0.2);
    for (let x = x0 - 0.1; x < x0 + total * L + 0.15; x += 0.2) room.box(x - 0.025, RH + 0.135, 0.02, x + 0.025, RH + 0.185, 0.035, 0xFFF1B0, 0, 1); // marquee bulbs
    let cx = 0;
    [...word].forEach((ch, i) => {
      const G = GLYPHS[ch];
      G.forEach((row, r) => [...row].forEach((px, c) => {
        if (px !== '#') return;
        const x = x0 + (cx + c) * L, y = y0 + (6 - r) * L;
        room.box(x, y, z0, x + L, y + L, z1, K.letter, 0, K.letterEmit || 0);
        room.box(x + 0.03, y + 0.03, z1, x + L - 0.03, y + L - 0.03, z1 + 0.012, K.letterFace ?? lighten(K.letter, 0.06), 0, K.letterEmit || 3);
        if (r === 0 || G[r - 1][c] !== '#') room.cyl(x + L / 2, y + L, (z0 + z1) / 2, L * 0.3, L * 0.2, K.letter, 8, K.letterEmit || 0);
      }));
      cx += widths[i] + 1;
    });
  }
  if (LV.windows === 'garage') {                                                  // one small window high up
    const z0 = 3.2, z1 = 4.4, y0 = 1.85, y1 = 2.55, F = K.frame;
    walls.box(RW - 0.03, y0, z0, RW, y1, z1, K.glass, 0, 2);
    walls.box(RW - 0.08, y0 - 0.06, z0 - 0.06, RW, y0, z1 + 0.06, F); walls.box(RW - 0.08, y1, z0 - 0.06, RW, y1 + 0.06, z1 + 0.06, F);
    walls.box(RW - 0.08, y0, z0 - 0.06, RW, y1, z0, F); walls.box(RW - 0.08, y0, z1, RW, y1, z1 + 0.06, F);
    for (let k = 1; k < 5; k++) { const z = z0 + k * (z1 - z0) / 5; walls.box(RW - 0.06, y0, z - 0.015, RW - 0.03, y1, z + 0.015, F); }
  } else if (LV.windows === 'tall' || LV.windows === 'skyline') {
    for (let k = 0; k < 3; k++) { const z0 = 0.45 + k * 2.3, z1 = z0 + 2.12; pane(z0, z1, 0.25, 2.7); }
  } else {
    for (let k = 0; k < 3; k++) { const z0 = 0.75 + k * 2.2, z1 = z0 + 1.8; pane(z0, z1, 0.45, 2.4); }
  }
    if (LV.crane) crane(0.5, 0.5, 4.45);
  // ── level props (behind / around the desks; the foreman's floor path stays free) ──
  LV.props({ room, walls, RW, RD, RH, K, shelf, plant, box, brick, pile, cone, barrier, tower, chartBoard, blueprint });
  // LAUNCH desk
  const LD = { x: 4.35, z: 1.75 };
  let top = desk(LD.x, LD.z);
  chair(LD.x - 0.1, LD.z - 0.85, 1);
  room.box(LD.x - 0.34, top, LD.z - 0.05, LD.x + 0.26, top + 0.025, LD.z + 0.3, 0x2A2A2F);
  room.box(LD.x - 0.34, top, LD.z + 0.3, LD.x + 0.26, top + 0.4, LD.z + 0.33, 0x151515, 0);
  quad(solo ? 'chart' : 'rocket', LD.x - 0.04, top + 0.2, LD.z + 0.332, 0.54, 0.34, 1);
  LV.deskLaunch?.({ room, top, x: LD.x, z: LD.z, brick: (x, y, z, a, b, c, p) => room.brick(x, y, z, a, b, c, p), plantSmall });

  // RESEARCH desk (left of the launcher)
  const RS = { x: 1.95, z: 1.75 };
  top = desk(RS.x, RS.z, 1.6);
  chair(RS.x - 0.15, RS.z - 0.85, 1);
  const rsM = monitor(RS.x + 0.38, top, RS.z + 0.2, 1, 0.66, 0.42);
  quad('search', rsM.cx, rsM.cy, rsM.zFront, rsM.w, rsM.h, 1);
  room.box(RS.x - 0.55, top, RS.z + 0.0, RS.x - 0.2, top + 0.015, RS.z + 0.3, 0xF7F7F5);       // notes
  room.box(RS.x - 0.5, top + 0.015, RS.z + 0.05, RS.x - 0.25, top + 0.02, RS.z + 0.07, 0x2F6FD0);
  room.cyl(RS.x - 0.68, top, RS.z + 0.25, 0.05, 0.11, 0xFFD21F, 8);                           // mug
  if (!solo) LV.deskResearch?.({ room, top, x: RS.x, z: RS.z });

  // SHILL desk
  const SD = { x: 7.35, z: 3.35 };
  top = desk(SD.x, SD.z);
  chair(SD.x, SD.z - 0.85, 1);
  const shM = monitor(SD.x - 0.05, top, SD.z + 0.18, -1, LV.folding ? 0.62 : 0.92, LV.folding ? 0.4 : 0.56);
  quad('x', shM.cx, shM.cy, shM.zBack + 0.004, shM.w * 0.92, shM.h * 0.9, 1);
  room.box(SD.x - 0.35, top, SD.z - 0.3, SD.x + 0.25, top + 0.02, SD.z - 0.1, 0x1B1B1E);
  LV.deskShill?.({ room, top, x: SD.x, z: SD.z, brick: (x, y, z, a, b, c, p) => room.brick(x, y, z, a, b, c, p), plantSmall });

  // TRADE desk
  const TD = { x: 7.0, z: 5.55 };
  top = desk(TD.x, TD.z, 2.0);
  chair(TD.x - 0.05, TD.z + 0.85, -1);
  const m1 = monitor(TD.x - 0.4, top, TD.z - 0.12, 1, 0.74, 0.46);
  quad('chart', m1.cx, m1.cy, m1.zFront, m1.w, m1.h, 1);
  if (!LV.folding) {
    const m2 = monitor(TD.x + 0.42, top, TD.z - 0.16, 1, 0.66, 0.46);
    quad('list', m2.cx, m2.cy, m2.zFront, m2.w, m2.h, 1);
  }
  if (LV.threeScreens) {
    const m3 = monitor(TD.x, top + 0.5, TD.z - 0.2, 1, 0.9, 0.4);
    quad('list', m3.cx, m3.cy, m3.zFront, m3.w, m3.h, 1);
  }
  room.box(TD.x - 0.38, top, TD.z + 0.12, TD.x + 0.2, top + 0.02, TD.z + 0.3, 0x1B1B1E);
  LV.deskTrade?.({ room, top, x: TD.x, z: TD.z, brick: (x, y, z, a, b, c, p) => room.brick(x, y, z, a, b, c, p), plantSmall });
  return {
    order: ['research', 'launch', 'shill', 'trade'],
    seats: {
      launch: { x: LD.x - 0.1, y: 0, z: LD.z - 0.72, yaw: 0, phase: 0 },
      research: { x: RS.x - 0.15, y: 0, z: RS.z - 0.72, yaw: 0, phase: 2.4 },
      shill: { x: SD.x, y: 0, z: SD.z - 0.72, yaw: 0, phase: 1.7 },
      trade: { x: TD.x - 0.05, y: 0, z: TD.z + 0.72, yaw: Math.PI, phase: 3.1 },
    },
    foreman: { y: 0, path: [[3.1, 5.2], [2.4, 3.7], [4.4, 3.2], [5.4, 4.6], [4.6, 6.2], [2.6, 6.3]] },
    spawn: { launch: [LD.x - 0.04, 1.15, LD.z + 0.2], shill: [SD.x - 0.05, 1.45, SD.z + 0.25], trade: [TD.x, 1.35, TD.z - 0.1, 1.2], research: [RS.x + 0.38, 1.4, RS.z + 0.25] },
    lights: [[LD.x, 1.5, LD.z + 0.9, 1.0, 0.92, 0.6], [SD.x, 1.5, SD.z + 0.7, 0.9, 0.95, 1.1], [TD.x, 1.4, TD.z + 0.6, 0.45, 1.1, 0.6], [RS.x + 0.3, 1.5, RS.z + 0.9, 1.0, 0.92, 0.6], [3.4, 2.4, 4.8, 1.2, 1.0, 0.7], [5.0, RH + 0.9, 1.0, 2.6, 2.2, 1.0]],
    center: [5.0, 1.2, 3.6], yaw: -0.62, pitch: 0.6,
    frame: (() => { const f = []; for (const x of [-0.25, RW + 0.25]) for (const y of [-0.3, RH + 0.1]) for (const z of [-0.25, RD + 0.25]) f.push([x, y, z]); f.push([2.2, RH + 1.55, -0.25], [7.8, RH + 1.55, -0.25]); if (CR) f.push([CR.x, CR.h + 0.85, CR.z]); return f; })(),
    shadow: [-0.3, RW + 0.3, 0, RH + 2.2, -0.3, RD + 0.3],
    focus: [4.6, 0.9, 2.6],
    swing: (t) => 0.75 + Math.sin(t * 0.18) * 0.42, hookAt: 2.3, drop: 1.55,
    floats: [
      { k: 'brick4', x: -1.6, y: 2.2, z: -0.4, ph: 0.0 }, { k: 'brick', x: -1.4, y: 0.9, z: 1.2, ph: 1.7 },
      { k: 'brickK', x: -1.8, y: 0.25, z: 4.2, ph: 2.9 }, { k: 'brick', x: 10.8, y: 2.5, z: 8.4, ph: 4.1 },
      { k: 'brickK', x: 8.5, y: -0.2, z: 9.0, ph: 5.3 },
      { k: 'brick4', x: 11.3, y: 3.2, z: 4.8, ph: 0.8, fall: true }, { k: 'brick', x: -1.5, y: 3.0, z: 2.6, ph: 2.2, fall: true },
    ],
  };
  }

  // ── the CREW tower: a two-storey brick cutaway with a room per builder (the home page scene) ──
  function towerScene() { return buildTower(); }

  // the CREW sign: white bricks with a black outline and sides, the last letter in yellow, studs on top
  function bigSign(cx, y0, zf, L, depth) {
    const word = SIGN_WORD;
    const widths = [...word].map((ch) => GLYPHS[ch][0].length);
    const total = widths.reduce((a, b) => a + b, 0) + word.length - 1;
    L *= Math.min(1, 31 / total);
    const x0 = cx - (total * L) / 2, z0 = zf - depth, O = 0.035;
    const night = K.letterEmit || 3;
    let col = 0;
    [...word].forEach((ch, i) => {
      const G = GLYPHS[ch], last = i >= word.length - SIGN_HIGHLIGHT;
      const face = last ? (K.signLast ?? 0xFFD21F) : (K.signFace ?? 0xF7F6F1);
      const on = (r, c) => r >= 0 && r < 7 && c >= 0 && c < G[0].length && G[r][c] === '#';
      G.forEach((row, r) => [...row].forEach((px, c) => {
        if (px !== '#') return;
        const x = x0 + (col + c) * L, y = y0 + (6 - r) * L;
        room.box(x, y, z0, x + L, y + L, zf, K.signSide ?? 0x151515, 0);             // black body
        const l = on(r, c - 1) ? 0 : O, rr = on(r, c + 1) ? 0 : O, tp = on(r - 1, c) ? 0 : O, bt = on(r + 1, c) ? 0 : O;
        room.box(x + l, y + bt, zf, x + L - rr, y + L - tp, zf + 0.02, face, 0, night);   // light face, outline only on the letter edge
        if (!on(r - 1, c)) { room.box(x + 0.02, y + L, z0 + 0.02, x + L - 0.02, y + L + 0.004, zf - 0.02, face, 0); room.cyl(x + L / 2, y + L, zf - depth / 2, L * 0.28, L * 0.2, face, 10); }
      }));
      col += widths[i] + 1;
    });
    return { x0, x1: x0 + total * L, top: y0 + 7 * L + L * 0.2 };
  }

  // a window in a wall facing +z (back walls): black frame with a cross
  function windowZ(x0, x1, y0, y1) {
    walls.box(x0, y0, 0.0, x1, y1, 0.015, K.glass, 0, K.glassEmit ?? 2);
    const F = K.frame;
    walls.box(x0 - 0.07, y0 - 0.07, 0, x1 + 0.07, y0, 0.07, F); walls.box(x0 - 0.07, y1, 0, x1 + 0.07, y1 + 0.07, 0.07, F);
    walls.box(x0 - 0.07, y0, 0, x0, y1, 0.07, F); walls.box(x1, y0, 0, x1 + 0.07, y1, 0.07, F);
    walls.box((x0 + x1) / 2 - 0.025, y0, 0, (x0 + x1) / 2 + 0.025, y1, 0.05, F); walls.box(x0, (y0 + y1) / 2 - 0.025, 0, x1, (y0 + y1) / 2 + 0.025, 0.05, F);
  }
  // a framed screen on a back wall (textured)
  function wallScreen(texName, cx, cy, w, h, frame = 0x151515) {
    walls.box(cx - w / 2 - 0.06, cy - h / 2 - 0.06, 0, cx + w / 2 + 0.06, cy + h / 2 + 0.06, 0.06, frame);
    quad(texName, cx, cy, 0.065, w, h, 1);
  }
  // faint brick city in the distance (drawn see-through)
  function skylineCity(seed) {
    let s0 = seed;
    const rnd = () => ((s0 = (s0 * 9301 + 49297) % 233280) / 233280);
    const put = (x, z, w, d, h) => {
      const c = [0xFFFFFF, 0xF4F4F2, 0xE9E9E6, 0xFBFAF4][Math.floor(rnd() * 4)];
      city.box(x, -0.3, z, x + w, h, z + d, c, 0, 4);
      for (let y = 0.6; y < h - 0.3; y += 0.7) {
        city.box(x + 0.1, y, z + d, x + w - 0.1, y + 0.18, z + d + 0.01, darken(c, 0.1), 0, 4);
      }
      city.box(x + w * 0.25, h, z + d * 0.25, x + w * 0.75, h + 0.25, z + d * 0.75, c, 0, 4);
    };
    for (let i = 0; i < 34; i++) {
      const z = -5 - rnd() * 10, x = -14 + rnd() * 36, w = 1.0 + rnd() * 1.4, d = 1.0 + rnd() * 1.4, h = 3 + rnd() * 9;
      if (x > -2 && x < RW + 2 && z > -5) continue;                                // keep the spot right behind the tower clear
      put(x, z, w, d, h);
    }

  }

  function buildTower() {
    const lv = Math.min(6, Math.max(1, Math.round(level) || MAIN_OFFICE));
    RW = 11; const GD = 3.6, FH = 2.9, SL = 0.24, UY = FH + SL, UD = 2.8, UH = 2.3, TOP = UY + UH;
    RD = GD; RH = TOP;
    const W = K.wall, WR = K.wallR, A = K.accent, PL = K.plinth ?? 0xF1F1EE;
    const dark = (hex(W)[0] + hex(W)[1] + hex(W)[2]) < 1.2;
    const P1 = 3.65, P2 = 7.35, PU = 5.5;                                        // partitions: ground floor x2, upper floor x1

    // baseplate the building stands on (studs along the open edges)
    room.box(-0.6, -0.35, -0.5, RW + 0.6, 0, GD + 1.0, PL, 0);
    walls.studs(-0.6, GD + 0.25, RW + 0.6, GD + 1.0, 0, PL, 0.25, 6);
    walls.studs(-0.6, -0.5, -0.1, GD + 0.25, 0, PL, 0.25, 6);
    room.box(0, 0, 0, RW, 0.03, GD, K.floor, K.floorSeam ?? 0.5);

    // ground floor shell
    walls.box(-0.25, 0, -0.25, RW + 0.25, FH, 0, W, -BRK);
    walls.box(RW, 0, -0.25, RW + 0.25, FH, GD, WR, -BRK);
    for (const x of [P1, P2]) { walls.box(x - 0.09, 0, 0, x + 0.09, FH, GD - 0.3, W, -BRK); walls.box(x - 0.16, 0, GD - 0.32, x + 0.16, FH, GD + 0.01, A, -BRK); }
    walls.box(-0.26, 0, GD - 0.32, 0.08, FH, GD + 0.01, A, -BRK);                  // corner columns
    walls.box(RW - 0.08, 0, GD - 0.32, RW + 0.26, FH, GD + 0.01, A, -BRK);
    walls.box(0, 0, -0.01, RW, 0.1, 0.02, darken(W, 0.12), 0);

    // upper floor slab: white edge with a yellow course, yellow studded floor in the rooms, a tiled terrace
    walls.box(-0.27, FH, -0.27, RW + 0.27, UY, GD + 0.06, 0xF4F4F2, 0);
    walls.box(-0.28, FH + 0.07, -0.28, RW + 0.28, FH + 0.17, GD + 0.07, A, 0);
    walls.box(0, UY, 0, RW, UY + 0.02, UD, A, 0);
    walls.studs(0, 0, RW, UD, UY + 0.02, A, 0.25, 6);
    walls.box(0, UY, UD, RW, UY + 0.025, GD, dark ? 0x2A2A2C : 0xEDEDEA, 0.45);
    // railing on the terrace edge
    for (let x = -0.15; x <= RW + 0.16; x += 0.55) walls.box(x - 0.035, UY, GD - 0.08, x + 0.035, UY + 0.55, GD - 0.01, A);
    walls.box(-0.2, UY + 0.5, GD - 0.1, RW + 0.2, UY + 0.58, GD + 0.01, 0x151515);
    walls.box(-0.2, UY + 0.24, GD - 0.07, RW + 0.2, UY + 0.28, GD - 0.02, 0x151515);
    for (let z = UD + 0.1; z < GD; z += 0.45) walls.box(-0.2, UY, z - 0.035, -0.13, UY + 0.55, z + 0.035, A);
    walls.box(-0.22, UY + 0.5, UD, -0.11, UY + 0.58, GD, 0x151515);

    // upper floor shell
    walls.box(-0.25, UY, -0.25, RW + 0.25, TOP, 0, W, -BRK);
    walls.box(RW, UY, -0.25, RW + 0.25, TOP, UD, WR, -BRK);
    walls.box(PU - 0.09, UY, 0, PU + 0.09, TOP, UD - 0.3, W, -BRK); walls.box(PU - 0.16, UY, UD - 0.32, PU + 0.16, TOP, UD + 0.01, A, -BRK);
    walls.box(RW - 0.08, UY, UD - 0.32, RW + 0.26, TOP, UD + 0.01, A, -BRK);
    walls.box(-0.26, UY, -0.26, 0.08, TOP, 0.3, A, -BRK);
    // caps with studs
    walls.box(-0.27, TOP, -0.27, RW + 0.27, TOP + 0.08, 0.02, K.cap, 0);
    walls.box(RW - 0.02, TOP, -0.27, RW + 0.27, TOP + 0.08, UD + 0.02, K.cap, 0);
    walls.box(PU - 0.17, TOP, 0, PU + 0.17, TOP + 0.08, UD + 0.02, K.cap, 0);
    walls.studs(RW, 0, RW + 0.25, UD, TOP + 0.08, K.cap, 0.25, 8);
    walls.studs(PU - 0.12, 0.05, PU + 0.12, UD, TOP + 0.08, K.cap, 0.25, 8);
    // corner quoins up both storeys
    for (let r = 0, y = 0; y < TOP - 0.01; r++, y += BRK) {
      if (y > FH - 0.01 && y < UY) continue;
      const L = r % 2 ? 0.3 : 0.6, y1 = Math.min(TOP, y + BRK);
      walls.box(-0.262, y, -0.262, -0.25 + L, y1, 0.012, A, -BRK);
      walls.box(RW - L, y, 0, RW, y1, 0.012, A, -BRK);
      walls.box(RW - 0.012, y, 0, RW, y1, L, A, -BRK);
      walls.box(RW + 0.25 - L, y, -0.262, RW + 0.262, y1, -0.25 + 0.01, A, -BRK);
    }

    // the sign on the roof + its base course
    const S = bigSign(RW / 2, TOP + 0.3, -0.02, 0.27, 0.32);
    walls.box(S.x0 - 0.3, TOP + 0.08, -0.3, S.x1 + 0.3, TOP + 0.3, 0.06, K.signBase ?? 0x151515, 0);
    walls.studs(S.x0 - 0.3, 0.02, S.x1 + 0.3, 0.06, TOP + 0.3, K.signBase ?? 0x151515, 0.25, 8);
    for (let x = S.x0 - 0.15; x < S.x1 + 0.2; x += 0.25) walls.box(x - 0.03, TOP + 0.16, 0.06, x + 0.03, TOP + 0.22, 0.075, 0xFFF1B0, 0, 1);
    walls.studs(-0.25, -0.25, S.x0 - 0.35, 0, TOP + 0.08, K.cap, 0.25, 8);
    walls.studs(S.x1 + 0.35, -0.25, RW + 0.25, 0, TOP + 0.08, K.cap, 0.25, 8);

    // windows: on the right walls (facing into the rooms) and the ground back wall
    pane(0.5, 2.5, 0.75, 2.3);
    pane(0.4, 2.3, UY + 0.45, UY + 1.95);

    // ── ground floor: Researcher | Launcher | Community Manager ──
    const seats = {}, spawn = {}, lights = [];
    const room3 = (role, x0, x1, opts) => {
      const cx = (x0 + x1) / 2, dz = GD - 0.72;                                  // desk near the front so it shows under the slab
      const top = desk(cx, dz, Math.min(1.9, x1 - x0 - 0.6));
      chair(cx - 0.1, dz - 0.85, 1);
      seats[role] = { x: cx - 0.1, y: 0, z: dz - 0.72, yaw: 0 };
      lights.push([cx, 1.6, GD + 0.4, 1.0, 0.92, 0.6]);
      opts(cx, dz, top);
    };
    room3('research', 0, P1, (cx, dz, top) => {
      const m = monitor(cx + 0.5, top, dz + 0.2, 1, 0.62, 0.4); quad('search', m.cx, m.cy, m.zFront, m.w, m.h, 1);
      room.box(cx - 0.6, top, dz, cx - 0.25, top + 0.015, dz + 0.3, 0xF7F7F5); room.cyl(cx - 0.72, top, dz + 0.25, 0.05, 0.11, 0xFFD21F, 8);
      shelf(0.35, 0.05); plant(3.15, 0.45, 0.9, true);
      spawn.research = [m.cx, 1.4, dz + 0.3];
    });
    room3('launch', P1, P2, (cx, dz, top) => {
      room.box(cx - 0.34, top, dz - 0.05, cx + 0.26, top + 0.025, dz + 0.3, 0x2A2A2F);
      room.box(cx - 0.34, top, dz + 0.3, cx + 0.26, top + 0.4, dz + 0.33, 0x151515, 0);
      quad('rocket', cx - 0.04, top + 0.2, dz + 0.332, 0.54, 0.34, 1);
      room.brick(cx + 0.45, top, dz, 2, 2, 0xFFD21F, 0.1); room.brick(cx + 0.48, top + 0.12, dz + 0.03, 2, 2, 0x151515, 0.08);
      pile(P1 + 0.7, 0.9, [0xFFD21F, 0x151515, 0xFFFFFF]); plant(P2 - 0.45, 0.45, 0.9);
      spawn.launch = [cx - 0.04, 1.15, dz + 0.25];
    });
    room3('community', P2, RW, (cx, dz, top) => {
      const m = monitor(cx + 0.5, top, dz + 0.2, 1, 0.62, 0.4); quad('chat', m.cx, m.cy, m.zFront, m.w, m.h, 1);
      room.box(cx - 0.7, top, dz + 0.05, cx - 0.4, top + 0.05, dz + 0.3, 0x5865F2);
      plantSmall(cx - 0.62, dz - 0.15, top); plant(P2 + 0.4, 0.4, 0.95, true);
      spawn.community = [m.cx, 1.4, dz + 0.3];
    });

    // ── upper floor: Content Creator | Trader ──
    lift(UY, () => {
      // content creator
      let cx = PU / 2, dz = 1.7;
      wallScreen('x', 1.3, 1.45, 1.0, 0.62); wallScreen('x', 3.9, 1.45, 1.0, 0.62);
      windowZ(2.2, 3.0, 0.9, 2.0);
      let top = desk(cx, dz, 1.8);
      chair(cx - 0.1, dz - 0.85, 1);
      seats.shill = { x: cx - 0.1, y: UY, z: dz - 0.72, yaw: 0 };   // sits well back so the foreman's bubble on the terrace stays below
      const m = monitor(cx + 0.55, top, dz + 0.2, 1, 0.62, 0.4); quad('x', m.cx, m.cy, m.zFront, m.w, m.h, 1);
      room.cyl(cx - 0.6, top, dz + 0.15, 0.13, 0.03, 0x151515, 12); room.box(cx - 0.61, top, dz + 0.14, cx - 0.59, top + 0.5, dz + 0.16, 0x151515);   // ring light
      room.cyl(cx - 0.6, top + 0.5, dz + 0.15, 0.17, 0.04, 0xFFF6CF, 14, 1);
      plant(0.4, 0.4, 1.0, true); plant(PU - 0.4, 0.4, 0.8);
      room.brick(0.2, 0, 2.2, 2, 4, 0xFFD21F); room.brick(0.25, 0.192, 2.3, 2, 2, 0x151515);
      spawn.shill = [m.cx, UY + 1.45, dz + 0.3];
      lights.push([cx, UY + 1.6, dz + 1.2, 0.9, 0.95, 1.1]);
      // trader
      cx = (PU + RW) / 2; dz = 1.7;
      wallScreen('chart', cx - 1.2, 1.5, 1.35, 0.85); wallScreen('list', cx + 0.6, 1.5, 1.1, 0.85); wallScreen('chart', cx + 2.0, 1.3, 0.8, 0.5);
      top = desk(cx, dz, 2.2);
      chair(cx - 0.05, dz - 0.85, 1);
      seats.trade = { x: cx - 0.05, y: UY, z: dz - 0.72, yaw: 0 };
      const a = monitor(cx - 0.72, top, dz + 0.18, 1, 0.6, 0.4); quad('chart', a.cx, a.cy, a.zFront, a.w, a.h, 1);
      const b = monitor(cx + 0.66, top, dz + 0.18, 1, 0.6, 0.4); quad('list', b.cx, b.cy, b.zFront, b.w, b.h, 1);
      if (lv >= 5) { const c = monitor(cx, top + 0.62, dz + 0.3, 1, 0.7, 0.32); quad('chart', c.cx, c.cy, c.zFront, c.w, c.h, 1); }
      plant(RW - 0.45, 0.45, 1.05, true); plantSmall(cx + 0.15, dz + 0.25, top);
      room.brick(PU + 0.3, 0, 2.3, 2, 2, 0xFFD21F);
      spawn.trade = [cx, UY + 1.4, dz + 0.3, 1.4];
      lights.push([cx, UY + 1.6, dz + 1.2, 0.45, 1.1, 0.6]);
    });
    // loose bricks on the ledges + extras for higher offices
    room.brick(RW - 0.9, UY + 0.6, GD - 0.12, 2, 1, 0xFFD21F, 0.14);
    room.brick(1.2, 0, GD + 0.35, 2, 4, 0xFFD21F); room.brick(1.7, 0, GD + 0.5, 2, 2, 0x151515); room.brick(8.3, 0, GD + 0.45, 4, 2, 0xFFD21F);
    room.brick(-0.5, 0, 1.2, 2, 2, 0xFFD21F); room.brick(-0.55, 0.192, 1.25, 2, 2, 0xFFFFFF, 0.15);
    if (lv >= 3) { plant(-0.3, GD + 0.65, 0.8); plant(RW + 0.3, GD + 0.65, 0.8); }
    if (lv >= 6) for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) room.brick(9.0 + i * 0.32 + r * 0.16, r * 0.192, GD + 0.35, 2, 2, 0xF2C230);
    lights.push([RW / 2, TOP + 1.2, 1.2, 2.6, 2.2, 1.0]);

    if (LV.crane) crane(RW + 1.5, -0.6, TOP + 1.25);
    skylineCity(lv * 37 + 11);

    const fy = UY + 0.025, fz = GD - 0.42;
    return {
      order: ['shill', 'trade', 'research', 'launch', 'community'],
      seats: Object.fromEntries(Object.entries(seats).map(([k, v], i) => [k, { ...v, phase: i * 1.37 }])),
      foreman: { y: fy, path: [[5.4, fz], [4.2, fz], [6.6, fz], [9.6, fz], [5.6, fz], [1.2, fz]] },
      spawn, lights: lights.slice(0, 6),
      center: [RW / 2, 3.2, GD / 2], yaw: -0.62, pitch: 0.52,
      frame: [[-0.6, -0.35, GD + 1.0], [RW + 0.6, -0.35, GD + 1.0], [-0.6, -0.35, -0.5], [RW + 0.6, 0, -0.5], [S.x0, S.top + 0.15, -0.3], [S.x1, S.top + 0.15, -0.3], ...(CR ? [[CR.x + 0.3, CR.h + 0.85, CR.z]] : []), [RW + 0.6, TOP, GD]],
      shadow: [-0.8, RW + 2.0, 0, S.top + 0.5, -0.6, GD + 1.1],
      focus: [5.5, 1.0, 2.0], narrowZoom: 1.07, narrowShift: [0, 0.1],
      swing: (t) => Math.PI - 0.55 + Math.sin(t * 0.17) * 0.32, hookAt: 2.5, drop: 0.9,
      floats: [
        { k: 'brick4', x: -2.6, y: 4.2, z: 1.0, ph: 0.0 }, { k: 'brick', x: -2.2, y: 1.6, z: 3.4, ph: 1.7 },
        { k: 'brickK', x: -1.5, y: 0.4, z: 5.6, ph: 2.9 }, { k: 'brick', x: RW + 1.8, y: 4.4, z: 4.6, ph: 4.1 },
        { k: 'brickK', x: RW + 1.2, y: 1.4, z: 6.0, ph: 5.3 }, { k: 'brick4', x: 4.0, y: 0.3, z: GD + 2.6, ph: 3.3 },
        { k: 'brick', x: -3.4, y: 7.6, z: -1.5, ph: 0.6 }, { k: 'brickK', x: 2.0, y: 9.6, z: -3.0, ph: 2.0 },
        { k: 'brick4', x: RW + 2.8, y: 2.6, z: 1.6, ph: 0.8, fall: true }, { k: 'brick', x: -2.0, y: 5.6, z: 3.2, ph: 2.2, fall: true },
      ],
    };
  }


  const LAY = solo ? roomScene() : towerScene();
  const roomGL = upload(gl, room);
  const wallsGL = upload(gl, walls);
  const cityGL = city.n ? upload(gl, city) : null;

  // quads → one VAO each (few, simple)
  const quadGL = quads.map((q) => {
    const hw = q.w / 2, hh = q.h / 2, f = q.facing;
    const v = f === 'x'
      ? [q.cz, q.cy - hh, q.cx - hw, 0, 0, q.cz, q.cy - hh, q.cx + hw, 1, 0, q.cz, q.cy + hh, q.cx + hw, 1, 1, q.cz, q.cy + hh, q.cx - hw, 0, 1]
      : f > 0
      ? [q.cx - hw, q.cy - hh, q.cz, 0, 0, q.cx + hw, q.cy - hh, q.cz, 1, 0, q.cx + hw, q.cy + hh, q.cz, 1, 1, q.cx - hw, q.cy + hh, q.cz, 0, 1]
      : [q.cx + hw, q.cy - hh, q.cz, 0, 0, q.cx - hw, q.cy - hh, q.cz, 1, 0, q.cx - hw, q.cy + hh, q.cz, 1, 1, q.cx + hw, q.cy + hh, q.cz, 0, 1];
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, tex: q.tex };
  });

  // particles: coin, brick, post card, candle, zz
  const coinMesh = new Mesh();
  for (let a = -3; a < 3; a++) for (let b = -3; b < 3; b++) {
    if ((a === -3 || a === 2) && (b === -3 || b === 2)) continue;
    coinMesh.vox(a, b, -0.5, a + 1, b + 1, 0.5, (a + b) % 3 === 0 ? 0xFFE15C : 0xF2B705);
  }
  coinMesh.vox(-1, -2, 0.5, 0, 2, 0.8, 0xFFF0A0); coinMesh.vox(-1, -2, -0.8, 0, 2, -0.5, 0xFFF0A0);
  const brickMesh = new Mesh(); brickMesh.brick(-0.11, -0.065, -0.11, 2, 2, 0xFFD21F, 0.11, 0.13);
  const brickBMesh = new Mesh(); brickBMesh.brick(-0.22, -0.065, -0.11, 4, 2, 0xFFD21F, 0.11, 0.13);
  const brickKMesh = new Mesh(); brickKMesh.brick(-0.11, -0.065, -0.11, 2, 2, 0x151515, 0.11, 0.13);
  const postMesh = new Mesh();
  postMesh.vox(-3, -2, -0.4, 3, 2, 0.4, 0xF7F7F5);
  postMesh.vox(-2.5, 0.5, 0.4, -1, 1.5, 0.6, 0x151515); postMesh.vox(-0.5, 0.8, 0.4, 2.5, 1.2, 0.6, 0x9A9AA0); postMesh.vox(-2.5, -1.2, 0.4, 2.5, -0.8, 0.6, 0xFFD21F);
  const upMesh = new Mesh(); upMesh.vox(-0.8, -3, -0.8, 0.8, 3, 0.8, 0x22C55E); upMesh.vox(-0.3, 3, -0.3, 0.3, 4.2, 0.3, 0x22C55E); upMesh.vox(-0.3, -4.2, -0.3, 0.3, -3, 0.3, 0x22C55E);
  const downMesh = new Mesh(); downMesh.vox(-0.8, -3, -0.8, 0.8, 3, 0.8, 0xEF4444); downMesh.vox(-0.3, 3, -0.3, 0.3, 4.2, 0.3, 0xEF4444); downMesh.vox(-0.3, -4.2, -0.3, 0.3, -3, 0.3, 0xEF4444);
  const lensMesh = new Mesh();
  for (let a = -3; a < 3; a++) for (let b = -3; b < 3; b++) { const d = Math.hypot(a + 0.5, b + 0.5); if (d < 3.1 && d > 1.9) lensMesh.vox(a, b, -0.4, a + 1, b + 1, 0.4, 0xFFD21F); }
  lensMesh.vox(2, -5, -0.4, 3, -2.5, 0.4, 0x151515); lensMesh.vox(1.4, -4, -0.4, 2.4, -3, 0.4, 0x151515);
  const zzMesh = new Mesh();
  ['#####', '...#.', '..#..', '.#...', '#####'].forEach((row, r) => [...row].forEach((c, i) => { if (c === '#') zzMesh.vox(i - 2.5, 2 - r, -0.4, i - 1.5, 3 - r, 0.4, 0xF1EFEA, 1); }));
  const P = { zz: upload(gl, zzMesh), coin: upload(gl, coinMesh), post: upload(gl, postMesh), up: upload(gl, upMesh), down: upload(gl, downMesh), brick: upload(gl, brickMesh), brick4: upload(gl, brickBMesh), brickK: upload(gl, brickKMesh), lens: upload(gl, lensMesh) };
  const particles = [];
  const spawnAt = (kind, p) => spawn(kind, p[0] + (p[3] ? (Math.random() - 0.5) * p[3] : 0), p[1], p[2]);
  const spawn = (kind, x, y, z) => particles.push({ kind, x, y, z, vx: (Math.random() - 0.5) * 0.25, vy: 0.55 + Math.random() * 0.3, vz: (Math.random() - 0.5) * 0.25 + 0.15, life: 0, max: 1.9 + Math.random() * 0.6, spin: Math.random() * 6 });

  // loose bricks floating gently around the diorama (some drift slowly down and start over)
  const FLOAT = solo ? [] : LAY.floats;

  // ── characters ──
  const soloParts = solo ? (solo.model ? Object.fromEntries(Object.entries(solo.model.parts).map(([k, m]) => [k, upload(gl, m)])) : buildCharacter(gl, solo.spec || {})) : null;
  const ST = LAY.seats;
  const crew = {};
  if (solo) {
    crew.solo = { role: 'solo', parts: soloParts, ...ST.launch, phase: 0 };
    crew.boss = { role: 'how', parts: soloParts, x: -99, y: 0, z: -99, yaw: 0, phase: 0 };
  } else {
    for (const r of LAY.order) crew[r] = { role: r, parts: buildCharacter(gl, CREW[r]), ...ST[r] };
    crew.boss = { role: 'how', parts: buildCharacter(gl, CREW.boss), x: LAY.foreman.path[0][0], y: LAY.foreman.y, z: LAY.foreman.path[0][1], yaw: 0.5, phase: 0 };
  }
  const bossPath = LAY.foreman.path;
  const boss = crew.boss;
  let bossLeg = 0, bossWait = 1.5, bossTarget = 1, bossStep = 0;
  const SEATED = solo ? ['solo'] : LAY.order;

  // ── speech bubbles (HTML) ──
  const ICON = {
    launch: ['....#....', '...###...', '..#####..', '..##.##..', '..#####..', '.#######.', '##.###.##', '...#.#...'],
    shill: ['#.....#', '##...##', '.##.##.', '..###..', '.##.##.', '##...##', '#.....#'],
    trade: ['......##', '.....###', '....##..', '#..##...', '##.#....', '.###....', '..#.....', '........'],
    research: ['.###....', '#...#...', '#...#...', '#...#...', '.###....', '....##..', '.....##.', '......##'],
    community: ['#######.', '#.....#.', '#.#.#.#.', '#.....#.', '#######.', '.##.....', '.#......'],
    how: ['.####.', '##..##', '....##', '...##.', '..##..', '......', '..##..'],
  };
  const svgIcon = (rows) => {
    let r = '';
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') r += `<rect x="${x}" y="${y}" width="1" height="1"/>`; }));
    return `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges" fill="currentColor" aria-hidden="true">${r}</svg>`;
  };
  const layer = document.createElement('div');
  layer.className = 'office-bubbles';
  if (solo) ICON.solo = ICON.trade;
  const BUB = {
    solo: { t: solo?.title || 'Agent', s: solo?.sub || '' },
    launch: { t: 'Launcher', s: 'Launching coins' },
    shill: { t: 'Content Creator', s: 'Posting on X' },
    trade: { t: 'Trader', s: 'Trading 24/7' },
    research: { t: 'Researcher', s: 'Finding trends' },
    community: { t: 'Community Manager', s: 'Replying & engaging' },
    how: { t: 'Foreman', s: 'How it works' },
  };
  const bubbles = {};
  for (const role of solo ? ['solo'] : [...LAY.order, 'how']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ob ob-' + role;
    b.dataset.role = role;
    b.innerHTML = `<span class="ob-ic">${svgIcon(ICON[role])}</span><span class="ob-t"><b>${BUB[role].t}</b><small>${BUB[role].s}</small></span>`;
    b.addEventListener('click', () => onAction && onAction(role));
    b.addEventListener('pointerenter', () => { hover = role; });
    b.addEventListener('pointerleave', () => { if (hover === role) hover = null; });
    b.addEventListener('focus', () => { hover = role; });
    b.addEventListener('blur', () => { if (hover === role) hover = null; });
    layer.appendChild(b);
    bubbles[role] = b;
  }
  host.appendChild(layer);
  let hover = null;
  let soloState = solo?.state || 'work';

  // ── camera ──
  let cssW = 1, cssH = 1, dpr = 1;
  let VP = m4(), view = m4(), proj = m4();
  const YAW0 = LAY.yaw;
  let yaw = YAW0, yawTarget = YAW0;
  const pitch = LAY.pitch;
  const center = LAY.center;
  // what has to stay in frame: the building / room, the sign and the crane top
  const FRAME = LAY.frame;
  function fit() {
    const eye = [center[0] + Math.sin(yaw) * Math.cos(pitch) * 30, center[1] + Math.sin(pitch) * 30, center[2] + Math.cos(yaw) * Math.cos(pitch) * 30];
    view = lookAt(eye, center);
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity;
    for (const q of FRAME) { const p = xf(view, q); l = Math.min(l, p[0]); r = Math.max(r, p[0]); b = Math.min(b, p[1]); t = Math.max(t, p[1]); }
    const aspect = cssW / cssH;
    const narrow = cssW < 640;
    // fit with a little crop of the outer rim, keep the aspect
    const zoom = solo ? (narrow ? 0.5 : 0.62) : narrow ? (LAY.narrowZoom ?? 0.88) : 1.0;
    let hw = (r - l) / 2 * zoom, hh = (t - b) / 2 * zoom * (narrow ? 1 : 1.04);
    if (hw / hh > aspect) hh = hw / aspect; else hw = hh * aspect;
    let mx = (l + r) / 2 + (narrow ? (LAY.narrowShift ?? [-0.12, -0.15])[0] : 0.0), my = (b + t) / 2 + (narrow ? (LAY.narrowShift ?? [-0.12, -0.15])[1] : 0.0);
    if (solo) { // frame the agent's desk (the room stays around it)
      const f = xf(view, LAY.focus);
      mx += (f[0] - mx) * 0.6; my += (f[1] - my) * 0.6;
    }
    proj = ortho(mx - hw, mx + hw, my - hh, my + hh, 1, 80);
    VP = mul(proj, view);
  }
  // sun through the right-hand windows
  const sunDir = norm([0.75, 1.0, 0.42]);
  const lightView = lookAt([center[0] + sunDir[0] * 20, center[1] + sunDir[1] * 20, center[2] + sunDir[2] * 20], center);
  const lightVP = (() => {
    const pts = [];
    const [x0, x1, y0, y1, z0, z1] = LAY.shadow;
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) pts.push(xf(lightView, [x, y, z]));
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, f = -Infinity;
    for (const p of pts) { l = Math.min(l, p[0]); r = Math.max(r, p[0]); b = Math.min(b, p[1]); t = Math.max(t, p[1]); n = Math.min(n, -p[2]); f = Math.max(f, -p[2]); }
    return mul(ortho(l - 0.5, r + 0.5, b - 0.5, t + 0.5, n - 5, f + 5), lightView);
  })();

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    fit();
    dirty = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  // pointer: gentle parallax + clicking the builders themselves
  let anchors = {};
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    yawTarget = YAW0 + (px - 0.5) * 0.16;
    const hit = pickAt(e.clientX - r.left, e.clientY - r.top);
    canvas.style.cursor = hit ? 'pointer' : '';
    if (hit !== hoverCanvas) { hoverCanvas = hit; }
  };
  let hoverCanvas = null;
  const onLeave = () => { yawTarget = YAW0; hoverCanvas = null; canvas.style.cursor = ''; };
  const onClick = (e) => {
    const r = host.getBoundingClientRect();
    const hit = pickAt(e.clientX - r.left, e.clientY - r.top);
    if (hit && onAction) onAction(hit);
  };
  function pickAt(x, y) {
    let best = null, bd = Infinity;
    for (const [role, a] of Object.entries(anchors)) {
      const dx = x - a.x, dy = y - (a.y + a.h * 0.45);
      const d = Math.abs(dx) / (a.h * 0.28) + Math.abs(dy) / (a.h * 0.55);
      if (d < 1 && d < bd) { bd = d; best = role; }
    }
    return best;
  }
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  // ── live data for screens + bubbles ──
  const series = [];
  let price = 1;
  for (let i = 0; i < 40; i++) { const o = price; price *= 1 + (Math.random() - 0.46) * 0.05; series.push([o, price]); }
  let chartLabel = '$SOL', chartChg = 0, lastTrades = [];
  function paintChart() {
    const { ctx, c } = tex.chart;
    ctx.fillStyle = '#0E0E0F'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#222224'; ctx.lineWidth = 1;
    for (let y = 30; y < c.height; y += 34) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(c.width, y + 0.5); ctx.stroke(); }
    const vals = series.flat(); const mn = Math.min(...vals), mx = Math.max(...vals);
    const Y = (v) => 40 + (1 - (v - mn) / (mx - mn || 1)) * (c.height - 56);
    const cw = (c.width - 16) / series.length;
    series.forEach(([o, cl], i) => {
      const up = cl >= o; ctx.fillStyle = up ? '#22C55E' : '#EF4444';
      const x = 8 + i * cw;
      ctx.fillRect(x + cw / 2 - 1, Math.min(Y(o), Y(cl)) - 5, 2, Math.abs(Y(o) - Y(cl)) + 10);
      ctx.fillRect(x + 1, Math.min(Y(o), Y(cl)), cw - 2, Math.max(3, Math.abs(Y(o) - Y(cl))));
    });
    ctx.fillStyle = '#FFD21F'; ctx.font = 'bold 22px monospace'; ctx.fillText(chartLabel, 10, 26);
    ctx.fillStyle = chartChg >= 0 ? '#22C55E' : '#EF4444'; ctx.textAlign = 'right';
    ctx.fillText((chartChg >= 0 ? '+' : '') + (chartChg * 100).toFixed(1) + '%', c.width - 10, 26); ctx.textAlign = 'left';
    tex.chart.push();
  }
  function paintList() {
    const { ctx, c } = tex.list;
    ctx.fillStyle = '#0E0E0F'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#FFD21F'; ctx.fillRect(0, 0, c.width, 30);
    ctx.fillStyle = '#151515'; ctx.font = 'bold 17px monospace'; ctx.fillText('AGENT TRADES', 10, 21);
    const rows = lastTrades.length ? lastTrades.slice(0, 6) : [{ side: 'BUY', symbol: '...', sol: 0 }];
    rows.forEach((t, i) => {
      const y = 56 + i * 25;
      ctx.fillStyle = t.side === 'BUY' ? '#22C55E' : '#EF4444';
      ctx.fillRect(10, y - 15, 44, 19);
      ctx.fillStyle = '#0E0E0F'; ctx.font = 'bold 14px monospace'; ctx.fillText(t.side, 14, y);
      ctx.fillStyle = '#F2F2F0'; ctx.font = 'bold 16px monospace'; ctx.fillText('$' + String(t.symbol || '').slice(0, 8), 64, y);
      ctx.fillStyle = '#A9A9A6'; ctx.textAlign = 'right'; ctx.fillText(t.sol ? t.sol.toFixed(3) : '', c.width - 10, y); ctx.textAlign = 'left';
    });
    tex.list.push();
  }
  paintChart(); paintList();
  let screenTick = 0, searchT = 0;
  function tickScreens(dt) {
    screenTick += dt;
    if (screenTick < 0.6) return;
    screenTick = 0;
    const last = series[series.length - 1];
    const nextClose = last[1] * (1 + (Math.random() - 0.47) * 0.035);
    if (Math.random() < 0.35) { series.push([last[1], nextClose]); if (series.length > 40) series.shift(); }
    else last[1] = nextClose;
    paintChart();
    searchT += 0.6; drawSearch(tex.search, searchT); tex.search.push();
    if (searchT % 2.4 < 0.6) { drawChat(tex.chat, searchT / 2.4); tex.chat.push(); }
  }

  // ── theme (day / night shift) ──
  const isDark = () => {
    const t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  let night = isDark() ? 1 : 0, nightTarget = night;
  const mo = new MutationObserver(() => { nightTarget = isDark() ? 1 : 0; dirty = true; });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ── render ──
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dirty = true, running = false, raf = 0, last = performance.now(), t = 0, visible = true;
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { threshold: 0 });
  io.observe(host);
  const onVis = () => { if (!document.hidden) start(); };
  document.addEventListener('visibilitychange', onVis);

  function drawMesh(p, g, model) {
    gl.uniformMatrix4fv(p.u.uModel, false, model);
    gl.bindVertexArray(g.vao);
    gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduce) t += dt;
    yaw += (yawTarget - yaw) * Math.min(1, dt * 3);
    night += (nightTarget - night) * Math.min(1, dt * 4);
    fit();
    if (!reduce) tickScreens(dt);

    // ── animate the crew ──
    const draws = [];
    anchors = {};
    for (const k of SEATED) {
      const c = crew[k];
      const active = hover === k || hoverCanvas === k;
      const ph = t * 13 + c.phase;
      const pose = {
        armL: -1.28 + Math.sin(ph) * 0.07, armR: -1.28 + Math.sin(ph + 1.9) * 0.07,
        legL: -1.45, legR: -1.45,
        headYaw: Math.sin(t * 0.6 + c.phase) * 0.18, headPitch: 0.08 + Math.sin(t * 1.7 + c.phase) * 0.03,
      };
      if (solo && soloState === 'sleep') {           // paused: head on the desk, slow breathing
        Object.assign(pose, { armL: -1.45, armR: -1.45, armLZ: -0.35, armRZ: -0.35, headYaw: 0.25, headPitch: 0.85, bounce: Math.sin(t * 1.4) * 0.006 });
      } else if (solo && soloState === 'idle') {     // waiting: leaning back, looking around
        Object.assign(pose, { armL: -0.45, armR: -0.45, headYaw: Math.sin(t * 0.5) * 0.45, headPitch: -0.08 });
      }
      if (active) { pose.armR = -2.9 + Math.sin(t * 9) * 0.25; pose.armRZ = 0.25; pose.headYaw = c.yaw === 0 ? -0.35 : 0.5; pose.headPitch = -0.05; pose.bounce = Math.abs(Math.sin(t * 6)) * 0.02; }
      const root = chain(T(c.x, (c.y || 0) + 0.47 - 7 * V, c.z), RY(c.yaw));
      const r = posed(c.parts, root, pose);
      draws.push(...r.draws);
      anchors[k] = r.headTop;
    }
    // the foreman walks between waypoints, stops to check his clipboard, waves when you hover him
    if (!solo) {
      const bActive = hover === 'how' || hoverCanvas === 'how';
      let moving = false;
      if (bActive) { let diff = yaw - boss.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; boss.yaw += diff * Math.min(1, dt * 6); }
      else if (bossWait > 0) { bossWait -= dt; let diff = yaw - boss.yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2; boss.yaw += diff * Math.min(1, dt * 4); }
      else {
        const [tx, tz] = bossPath[bossTarget];
        const dx = tx - boss.x, dz = tz - boss.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { bossTarget = (bossTarget + 1) % bossPath.length; bossWait = 1.2 + Math.random() * 2.2; }
        else {
          moving = true;
          const sp = Math.min(d, dt * 0.75);
          boss.x += dx / d * sp; boss.z += dz / d * sp;
          let want = Math.atan2(dx, dz), diff = want - boss.yaw;
          while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
          boss.yaw += diff * Math.min(1, dt * 6);
        }
      }
      bossStep += moving ? dt * 7.5 : 0;
      bossLeg += ((moving ? 1 : 0) - bossLeg) * Math.min(1, dt * 6);
      const sw = Math.sin(bossStep) * 0.55 * bossLeg;
      const bpose = {
        legL: sw, legR: -sw, armL: -sw * 0.8, armR: moving ? sw * 0.3 : -0.55 + Math.sin(t * 1.3) * 0.05,
        bounce: Math.abs(Math.cos(bossStep)) * 0.025 * bossLeg,
        headYaw: moving ? 0 : Math.sin(t * 0.8) * 0.3, headPitch: moving ? 0 : 0.18,
      };
      if (bActive) { bpose.armL = -2.9 + Math.sin(t * 9) * 0.25; bpose.armLZ = 0.25; bpose.headPitch = -0.05; bpose.bounce = Math.abs(Math.sin(t * 6)) * 0.02; }
      const br = posed(boss.parts, chain(T(boss.x, boss.y, boss.z), RY(boss.yaw)), bpose);
      draws.push(...br.draws);
      anchors.how = br.headTop;
    }

    // the crane slowly slews back and forth, the hook sways
    if (jibGL) {
      const th = LAY.swing(t);                                                    // angle from +x toward +z
      const J = chain(T(CR.x, CR.h, CR.z), RY(-th));
      draws.push([jibGL, J]);
      const hp = xf(J, [LAY.hookAt, 0, 0]);
      const drop = LAY.drop + Math.sin(t * 0.31) * 0.25;
      const sway = Math.sin(t * 1.1) * 0.05;
      draws.push([cableGL, chain(T(hp[0], hp[1], hp[2]), RZ(sway), S3(1, drop, 1))]);
      draws.push([hookGL, chain(T(hp[0], hp[1], hp[2]), RZ(sway), T(0, -drop, 0), RY(-th + Math.sin(t * 0.5) * 0.2))]);
    }
    // floating bricks
    for (const f of FLOAT) {
      let y = f.y, s = 1;
      if (f.fall) { const u = ((t * 0.07 + f.ph * 0.13) % 1); y = f.y + 0.9 - u * 1.8; s = Math.min(1, u * 6, (1 - u) * 6); }
      else y += Math.sin(t * 0.9 + f.ph) * 0.12;
      draws.push([P[f.k], chain(T(f.x, y, f.z), RY(t * 0.35 + f.ph), RX(Math.sin(t * 0.5 + f.ph) * 0.35 + 0.2), S(Math.max(0.001, s) * 1.5))]);
    }

    // particles
    if (!reduce) {
      if (solo) {
        const [lx, ly, lz] = LAY.spawn.launch;
        if (soloState === 'work' && Math.random() < dt * 0.5) spawn(Math.random() < 0.6 ? 'up' : 'down', lx + (Math.random() - 0.5) * 0.6, ly + 0.15, lz + 0.05);
        if (soloState === 'sleep' && Math.random() < dt * 0.6) spawn('zz', lx - 0.16, ly + 0.1, lz - 0.7);
      } else {
        const SPN = LAY.spawn;
        if (Math.random() < dt * 0.55) spawnAt(Math.random() < 0.5 ? 'brick' : 'coin', SPN.launch);
        if (Math.random() < dt * 0.45) spawnAt('post', SPN.shill);
        if (Math.random() < dt * 0.5) spawnAt(Math.random() < 0.6 ? 'up' : 'down', SPN.trade);
        if (Math.random() < dt * 0.3) spawnAt('lens', SPN.research);
        if (SPN.community && Math.random() < dt * 0.4) spawnAt('post', SPN.community);
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt; if (p.life > p.max) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 1 - dt * 0.6;
      const k = p.life / p.max;
      const s = Math.min(1, p.life * 6) * (1 - Math.max(0, k - 0.7) / 0.3);
      const flat = p.kind === 'zz' || p.kind === 'lens';
      draws.push([P[p.kind], chain(T(p.x, p.y, p.z), RY(flat ? yaw : p.spin + t * (p.kind === 'coin' ? 5 : 1.5)), S(Math.max(0.001, s) * (p.kind === 'post' ? 1.1 : 1)))]);
    }

    // ── shadow pass ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadowFB);
    gl.viewport(0, 0, SM, SM);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.useProgram(depthProg.p);
    gl.uniformMatrix4fv(depthProg.u.uLightVP, false, lightVP);
    const I = m4();
    drawMesh(depthProg, roomGL, I);
    for (const [g, m] of draws) drawMesh(depthProg, g, m);

    // ── main pass ──
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uVP, false, VP);
    gl.uniformMatrix4fv(prog.u.uLightVP, false, lightVP);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadowTex);
    gl.uniform1i(prog.u.uShadow, 0);
    gl.uniform2f(prog.u.uShadowTexel, 1 / SM, 1 / SM);
    gl.uniform3fv(prog.u.uSunDir, sunDir);
    const n = night;
    const lerp3 = (a, b) => a.map((x, i) => x + (b[i] - x) * n);
    gl.uniform3fv(prog.u.uSunCol, lerp3([0.6, 0.57, 0.52], [0.09, 0.11, 0.2]));
    gl.uniform3fv(prog.u.uSky, lerp3([0.7, 0.71, 0.75], [0.3, 0.31, 0.43]));
    gl.uniform3fv(prog.u.uGround, lerp3([0.52, 0.51, 0.52], [0.14, 0.14, 0.2]));
    gl.uniform1f(prog.u.uNight, n);
    const lp = LAY.lights.flatMap((l) => l.slice(0, 3));
    const lc = LAY.lights.flatMap((l) => l.slice(3, 6)).map((x) => x * n * 0.7);
    gl.uniform3fv(prog.u.uLP, lp); gl.uniform3fv(prog.u.uLC, lc);
    if (cityGL) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      drawMesh(prog, cityGL, I);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
    drawMesh(prog, wallsGL, I);
    drawMesh(prog, roomGL, I);
    for (const [g, m] of draws) drawMesh(prog, g, m);

    // screens
    gl.useProgram(texProg.p);
    gl.uniformMatrix4fv(texProg.u.uVP, false, VP);
    gl.uniformMatrix4fv(texProg.u.uModel, false, I);
    gl.uniform1f(texProg.u.uBright, 1.0);
    gl.uniform1i(texProg.u.uTex, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.disable(gl.CULL_FACE);
    for (const q of quadGL) {
      gl.bindTexture(gl.TEXTURE_2D, tex[q.tex].t);
      gl.bindVertexArray(q.vao);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }
    gl.bindVertexArray(null);

    // ── bubbles follow the heads ──
    const scale = Math.max(0.72, Math.min(1.12, cssW / 1100));
    for (const [role, p] of Object.entries(anchors)) {
      const c = xf(VP, p);
      const x = (c[0] / c[3] * 0.5 + 0.5) * cssW;
      const y = (1 - (c[1] / c[3] * 0.5 + 0.5)) * cssH;
      const foot = xf(VP, role === 'how' ? [boss.x, boss.y, boss.z] : [crew[role].x, (crew[role].y || 0) + 0.3, crew[role].z]);
      const fy = (1 - (foot[1] / foot[3] * 0.5 + 0.5)) * cssH;
      anchors[role] = { x, y, h: Math.max(30, fy - y) };
      const bob = reduce ? 0 : Math.sin(t * 2.2 + (role.length * 1.3)) * 3;
      const b = bubbles[role];
      b.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - 8 + bob).toFixed(1)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
      b.classList.toggle('hot', hover === role || hoverCanvas === role);
    }
    dirty = false;
    if (running && visible && !document.hidden && !reduce) raf = requestAnimationFrame(frame);
    else running = false;
  }

  function start() {
    if (raf) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  resize();
  start();
  const reduceIv = reduce ? setInterval(() => { if (dirty || Math.abs(night - nightTarget) > 0.01) { night = nightTarget; start(); } }, 500) : 0;

  return {
    setData({ trades = [], tokens = [], coins = [] } = {}) {
      lastTrades = trades.slice(0, 6);
      paintList();
      const tr = trades[0];
      const tk = (tr && tokens.find((x) => x.symbol === tr.symbol)) || tokens.slice().sort((a, b) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0))[0];
      if (tk) { chartLabel = '$' + String(tk.symbol).slice(0, 9); chartChg = tk.change1h || 0; }
      const small = (el, s) => { const n = el.querySelector('small'); if (n.textContent !== s) n.textContent = s; };
      if (tr && bubbles.trade) small(bubbles.trade, `${tr.side} $${String(tr.symbol).slice(0, 10)} · ${Number(tr.sol).toFixed(3)} SOL`);
      if (coins[0] && bubbles.launch) small(bubbles.launch, `Latest: $${String(coins[0].ticker).slice(0, 10)}`);
      if (reduce) start();
    },
    // solo mode: change what the agent is doing + its bubble (no rebuild)
    setAgent({ state, title, sub } = {}) {
      if (!solo) return;
      if (state) soloState = state;
      const b = bubbles.solo;
      if (title != null) b.querySelector('b').textContent = title;
      if (sub != null) b.querySelector('small').textContent = sub;
      b.classList.toggle('ob-sleep', soloState === 'sleep');
      start();
    },
    celebrate(kind) {
      if (reduce) return;
      const SPN = LAY.spawn;
      if (solo) { for (let i = 0; i < 8; i++) spawn(kind === 'trade' ? (Math.random() < 0.6 ? 'up' : 'down') : 'brick', SPN.launch[0] + (Math.random() - 0.5) * 0.6, SPN.launch[1] + 0.05, SPN.launch[2]); return; }
      const n = 8;
      for (let i = 0; i < n; i++) {
        if (kind === 'launch') spawnAt(['brick', 'brick4', 'coin', 'brickK'][i % 4], SPN.launch);
        else if (kind === 'shill') spawnAt('post', SPN.shill);
        else if (kind === 'community' && SPN.community) spawnAt('post', SPN.community);
        else if (kind === 'research') spawnAt('lens', SPN.research);
        else spawnAt(Math.random() < 0.6 ? 'up' : 'down', SPN.trade);
      }
    },
    destroy() {
      running = false; if (raf) cancelAnimationFrame(raf);
      if (reduceIv) clearInterval(reduceIv);
      ro.disconnect(); io.disconnect(); mo.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave);
      layer.remove(); canvas.remove();
      const ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext();
    },
  };
}

// shared with the big rotating mascot (boss3d.js), the skins, the phone and the laptop
export { V, Mesh, compile, upload, buildCharacter, characterMeshes, posed, mul, T, RX, RY, RZ, S, chain, xf, lookAt, ortho, norm, darken, lighten };
