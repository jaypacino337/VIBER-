// Tiny SVG charts: sparklines + the builder equity chart (with hover crosshair).
import { sol, signedSol, pct, clock, tone } from './format.js';

let gid = 0;

export function sparkline(values, { w = 120, h = 34, cls } = {}) {
  if (!values || values.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || max * 0.01 || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
  const t = cls || (values[values.length - 1] >= values[0] ? 'up' : 'down');
  const id = 'sg' + ++gid;
  const last = pts[pts.length - 1];
  return `<svg class="spark ${t}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    <path d="${d}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2" fill="currentColor"/>
  </svg>`;
}

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-12; v += step) out.push(+v.toFixed(10));
  return out;
}

// points: [[ts, equitySol], ...], baseline: total deposited SOL
export function equityChart(el, points, baseline) {
  if (!el) return;
  const W = Math.max(280, el.clientWidth || 600);
  const H = 230;
  const pad = { l: 52, r: 14, t: 14, b: 26 };
  if (!points || points.length < 2 || points[points.length - 1][0] - points[0][0] < 90_000) {
    el.innerHTML = `<div class="chart-empty">Equity history appears after the first minutes of trading.</div>`;
    return;
  }
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  let yMin = Math.min(...ys, baseline), yMax = Math.max(...ys, baseline);
  const padY = (yMax - yMin) * 0.12 || yMax * 0.05 || 0.01;
  yMin = Math.max(0, yMin - padY); yMax += padY;
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const X = (t) => pad.l + ((t - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const last = points[points.length - 1];
  const t = tone(last[1] - baseline);
  const id = 'eq' + ++gid;

  const line = points.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join('');
  const area = line + `L${X(x1).toFixed(1)} ${H - pad.b}L${X(x0).toFixed(1)} ${H - pad.b}Z`;
  const yt = niceTicks(yMin, yMax, 4);
  const spanMin = (x1 - x0) / 60000;
  const xtCount = Math.max(2, Math.min(W < 480 ? 3 : 5, Math.floor(spanMin) + 1));
  const xt = Array.from({ length: xtCount }, (_, i) => x0 + ((x1 - x0) * i) / (xtCount - 1));
  const dec = yMax - yMin < 0.05 ? 4 : yMax - yMin < 1 ? 3 : 2;

  el.innerHTML = `
  <svg class="eq-chart ${t}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Portfolio value over time">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".2"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
    ${yt.map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${v.toFixed(dec)}</text>`).join('')}
    ${xt.map((v, i) => `<text class="axis" x="${X(v).toFixed(1)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === xt.length - 1 ? 'end' : 'middle'}">${clock(v)}</text>`).join('')}
    <line class="base" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(baseline).toFixed(1)}" y2="${Y(baseline).toFixed(1)}"/>
    <text class="base-label" x="${W - pad.r - 4}" y="${(Y(baseline) - 6).toFixed(1)}" text-anchor="end">deposited ${sol(baseline, 3)}</text>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" class="eq-line" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${X(last[0]).toFixed(1)}" cy="${Y(last[1]).toFixed(1)}" r="4.5" fill="currentColor" class="eq-end"/>
    <g class="hover" visibility="hidden">
      <line class="cross" y1="${pad.t}" y2="${H - pad.b}"/>
      <circle r="4.5" fill="currentColor" class="eq-end"/>
    </g>
    <rect class="hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}" fill="transparent"/>
  </svg>
  <div class="chart-tip" hidden></div>`;

  const svg = el.querySelector('svg');
  const hover = svg.querySelector('.hover');
  const cross = hover.querySelector('line');
  const dot = hover.querySelector('circle');
  const tip = el.querySelector('.chart-tip');
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const cx = ((ev.clientX - r.left) / r.width) * W;
    const tt = x0 + ((cx - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i][0] - tt) < Math.abs(points[best][0] - tt)) best = i;
    const p = points[best];
    const px = X(p[0]), py = Y(p[1]);
    hover.setAttribute('visibility', 'visible');
    cross.setAttribute('x1', px); cross.setAttribute('x2', px);
    dot.setAttribute('cx', px); dot.setAttribute('cy', py);
    const pnl = p[1] - baseline;
    tip.hidden = false;
    tip.innerHTML = `<div class="tip-time">${clock(p[0])}</div><div class="tip-val">${sol(p[1], 4)} SOL</div><div class="tip-pnl ${tone(pnl)}">${signedSol(pnl, 4)} SOL · ${pct(baseline ? pnl / baseline : 0)}</div>`;
    const left = (px / W) * r.width;
    tip.style.left = Math.min(r.width - 150, Math.max(0, left + 12)) + 'px';
    tip.style.top = Math.max(0, (py / H) * r.height - 30) + 'px';
  };
  const leave = () => { hover.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', move);
  hit.addEventListener('pointerleave', leave);
}
