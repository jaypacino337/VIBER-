// The VIBER mascot: a big toy-brick viber you can spin in 3D (drag / swipe), idling on a
// round studded baseplate with loose bricks orbiting. Same WebGL2 brick style as the office.
// Also the skin preview: createBoss(el, { skin: 'golden' }) shows a skin from SKIN_MODELS.
//
//   const boss = createBoss(el, { onClick() {} });  boss.wave();  boss.destroy();
import { Mesh, compile, upload, buildCharacter, posed, mul, T, RX, RY, S, chain, lookAt, ortho, norm } from './office3d.js';
import { SKIN_MODELS } from './skins3d.js';

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec3 aCol;
layout(location=3) in float aSeam; layout(location=4) in float aEmit;
uniform mat4 uVP, uModel;
out vec3 vN, vLP, vMN, vCol; out float vSeam, vEmit;
void main(){
  vec4 w = uModel * vec4(aPos,1.0);
  vN = normalize(mat3(uModel) * aNrm); vLP = aPos; vMN = aNrm; vCol = aCol; vSeam = aSeam; vEmit = aEmit;
  gl_Position = uVP * w;
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vN, vLP, vMN, vCol; in float vSeam, vEmit;
uniform vec3 uKey, uFill; uniform float uNight;
out vec4 o;
void main(){
  vec3 col = vCol;
  if (vSeam > 0.0) {
    vec3 an = abs(vMN);
    vec2 q = an.x > 0.5 ? vLP.yz : (an.y > 0.5 ? vLP.xz : vLP.xy);
    vec2 f = fract(q / vSeam + 0.0001); vec2 e = min(f, 1.0 - f) * vSeam;
    float d = min(e.x, e.y);
    float aa = max(fwidth(d), 0.0006);
    col *= 1.0 - (1.0 - smoothstep(0.0022, 0.0022 + aa * 1.2, d)) * 0.2;
  }
  if (vEmit > 0.5) { o = vec4(col, 1.0); return; }   // glowing bits (lamps, sparkles, reflective tape)
  vec3 N = normalize(vN);
  float key = max(dot(N, uKey), 0.0);
  float fill = max(dot(N, uFill), 0.0);
  float up = N.y * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.42, 0.40, 0.42), vec3(0.72, 0.72, 0.78), up) * mix(1.0, 0.72, uNight);
  vec3 light = amb + vec3(0.62, 0.59, 0.54) * key + mix(vec3(0.16, 0.14, 0.08), vec3(0.3, 0.24, 0.06), uNight) * fill;
  o = vec4(col * light, 1.0);
}`;

// the default mascot: yellow hard hat, black hoodie with a yellow brick on the chest, tool belt
const MASCOT = { skin: 0xF2C38F, hair: 0x3A2A1E, style: 'short', top: 0x151515, pants: 0x2A2A2A, kind: 'hoodie', print: 0xFFD21F, cap: 0xFFD21F, belt: true, tool: 'wrench' };

export function createBoss(host, { onClick, skin = null, label } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'boss-gl';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label || 'The VIBER viber. Drag to spin it around.');
  host.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) { canvas.remove(); throw new Error('no webgl2'); }
  const prog = compile(gl, VS, FS);
  // a paid skin replaces the mascot model (same skeleton, its own meshes + resting pose)
  const model = skin && SKIN_MODELS[skin] ? SKIN_MODELS[skin]() : null;
  const parts = model ? Object.fromEntries(Object.entries(model.parts).map(([k, m]) => [k, upload(gl, m)])) : buildCharacter(gl, MASCOT);
  const rest = model?.pose || {};

  // round studded baseplate with a yellow rim
  const plat = new Mesh();
  const k = 0.1, R = 6.6;
  for (let x = -7; x < 7; x++) for (let z = -7; z < 7; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d > R) continue;
    const rim = d > R - 1.2;
    const col = rim ? 0xFFD21F : 0xF2F2F0;
    plat.box(x * k, -0.22, z * k, (x + 1) * k, 0, (z + 1) * k, col, 0);
    plat.cyl((x + 0.5) * k, 0, (z + 0.5) * k, k * 0.3, k * 0.18, col, 8);
  }
  plat.box(-0.62, -0.3, -0.62, 0.62, -0.22, 0.62, 0x151515);
  const platGL = upload(gl, plat);

  // loose bricks orbiting the viber
  const coin = new Mesh();
  coin.brick(-0.16, -0.1, -0.08, 4, 2, 0xFFD21F, 0.08, 0.1);
  const coinGL = upload(gl, coin);
  const coin2 = new Mesh();
  coin2.brick(-0.08, -0.1, -0.08, 2, 2, 0x151515, 0.08, 0.1);
  const coin2GL = upload(gl, coin2);

  // ── state ──
  let yaw = -0.5, pitch = 0.22, vel = 0.35;
  let dragging = false, lastX = 0, lastY = 0, lastMove = 0, idleUntil = 0, moved = 0;
  let waveT = -10, t = 0, last = performance.now();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cssW = 1, cssH = 1, raf = 0, visible = true, alive = true;

  const isDark = () => {
    const th = document.documentElement.getAttribute('data-theme');
    return th ? th === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };

  function resize() {
    const r = host.getBoundingClientRect();
    cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    kick();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; kick(); });
  io.observe(host);
  const onVis = () => kick();
  document.addEventListener('visibilitychange', onVis);

  // ── input: drag to spin, click to make him wave ──
  const down = (e) => {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY; lastMove = performance.now();
    canvas.setPointerCapture?.(e.pointerId);
    host.classList.add('grabbing');
    kick();
  };
  const move = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    const now = performance.now(), dt = Math.max(1, now - lastMove);
    moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.012;
    pitch = Math.max(-0.05, Math.min(0.75, pitch + dy * 0.006));
    vel = (dx * 0.012) / (dt / 1000) * 0.6;
    lastX = e.clientX; lastY = e.clientY; lastMove = now;
    kick();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('grabbing');
    idleUntil = performance.now() + 2500;
    if (moved < 6) { waveT = t; onClick && onClick(); }
    kick();
  };
  const key = (e) => {
    if (e.key === 'ArrowLeft') { yaw -= 0.3; kick(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { yaw += 0.3; kick(); e.preventDefault(); }
    if (e.key === 'Enter' || e.key === ' ') { waveT = t; onClick && onClick(); kick(); e.preventDefault(); }
  };
  canvas.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  host.addEventListener('keydown', key);

  function drawMesh(g, model) {
    gl.uniformMatrix4fv(prog.u.uModel, false, model);
    gl.bindVertexArray(g.vao);
    gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, 0);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    t += dt;
    const m = reduce ? 0 : 1;
    // spin: inertia after a drag, then a slow turntable
    if (!dragging) {
      const target = reduce ? 0 : 0.35;
      if (now > idleUntil) vel += (target - vel) * Math.min(1, dt * 1.2);
      else vel *= Math.pow(0.08, dt);
      yaw += vel * dt;
    }

    // camera: fixed, the figure turns
    const center = [0, 0.86, 0];
    const eye = [0, center[1] + Math.sin(pitch) * 10, Math.cos(pitch) * 10];
    const view = lookAt(eye, center);
    const aspect = cssW / cssH;
    let hh = 1.36, hw = hh * aspect;
    if (hw < 1.05) { hw = 1.05; hh = hw / aspect; }
    const VP = mul(ortho(-hw, hw, -hh, hh, 1, 30), view);

    // pose
    const w = t - waveT;
    const waving = w >= 0 && w < 2.2;
    const breathe = Math.sin(t * 1.8);
    const pose = {
      bounce: reduce ? 0 : Math.abs(breathe) * 0.012,
      headYaw: Math.sin(t * 0.7) * 0.25 * m, headPitch: Math.sin(t * 1.1) * 0.04 * m,
      armL: Math.sin(t * 1.8) * 0.06 * m, armR: -Math.sin(t * 1.8) * 0.05 * m + 0.04,
      legL: 0, legR: 0,
    };
    for (const [k2, v] of Object.entries(rest)) pose[k2] = (k2 === 'headYaw' || k2 === 'headPitch' || k2 === 'armL' || k2 === 'armR') ? (pose[k2] || 0) + v : v;
    if (waving) { pose.armL = -2.9 + Math.sin(w * 11) * 0.28; pose.armLZ = 0.3; pose.headPitch = -0.08; pose.bounce = Math.abs(Math.sin(w * 7)) * 0.03; }
    const root = chain(RY(yaw), T(0, 0, 0));
    const r = posed(parts, root, pose);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.useProgram(prog.p);
    gl.uniformMatrix4fv(prog.u.uVP, false, VP);
    gl.uniform3fv(prog.u.uKey, norm([-0.55, 0.85, 0.65]));
    gl.uniform3fv(prog.u.uFill, norm([0.8, 0.2, -0.6]));
    gl.uniform1f(prog.u.uNight, isDark() ? 1 : 0);
    drawMesh(platGL, RY(yaw));
    for (const [g, m] of r.draws) drawMesh(g, m);
    for (let i = 0; i < 3; i++) {
      const a = t * 0.9 + i * (Math.PI * 2 / 3);
      const y = 0.35 + i * 0.45 + Math.sin(t * 1.6 + i * 2) * 0.08;
      drawMesh(i === 1 ? coin2GL : coinGL, chain(T(Math.cos(a) * 0.86, y, Math.sin(a) * 0.86), RY(t * 1.6 + i), RX(0.35 + Math.sin(t + i) * 0.2), S(1.0)));
    }

    const animating = !reduce || dragging || waving || Math.abs(vel) > 0.01;
    if (alive && visible && !document.hidden && animating) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  resize();

  return {
    wave() { waveT = t; kick(); },
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
