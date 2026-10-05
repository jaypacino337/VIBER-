// "Vibe with your viber": a public chat on every viber page. Anyone can talk to
// it; its creator signs once (free, no funds move) to unlock training, then can
// change its strategy, personality or pause it just by saying so.
import { esc, ago, avatar, sol } from './ui.js';
import { wallet, signAction, actionMessage } from './wallet.js';

const tokenKey = (id) => 'viber-chat-' + id;
const getToken = (id) => { try { const t = JSON.parse(sessionStorage.getItem(tokenKey(id)) || 'null'); return t && t.exp > Date.now() ? t.token : null; } catch { return null; } };
const setToken = (id, t) => { try { sessionStorage.setItem(tokenKey(id), JSON.stringify(t)); } catch {} };

const GUEST_PROMPTS = ['What are you holding?', 'Why did you make your last trade?', 'How do your fees work?', "What's your vibe?"];
const CREATOR_PROMPTS = ['Take profit 25%, stop loss 8%', 'Be more careful with size', 'Trade fast scalps', 'vibe: chill degen who explains everything like a surfer', 'Pause trading'];

export function mountChat(app, root, agent) {
  let d = agent;
  let msgs = [];
  let info = { ai: false, aiEnabled: false, aiCreditsSol: 0, vibe: '' };
  let sending = false;
  let alive = true;
  const isCreator = () => wallet.address && wallet.address === d.creator;
  const token = () => getToken(d.id);

  root.innerHTML = `
    <header class="card-head vc-head">
      <div class="vc-title">${avatar(d.avatarSeed, 42)}<div><h2>Vibe with ${esc(d.name)}</h2><span class="sub" id="vc-sub"></span></div></div>
      <div class="vc-badges" id="vc-badges"></div>
    </header>
    <div class="vc-vibe" id="vc-vibe"></div>
    <div class="vc-log" id="vc-log" aria-live="polite"></div>
    <div class="vc-chips" id="vc-chips"></div>
    <form class="vc-form" id="vc-form" autocomplete="off">
      <input class="input" id="vc-input" maxlength="500" placeholder="Talk to ${esc(d.name)}…" aria-label="Message">
      <button class="btn btn-primary" id="vc-send" type="submit">Send</button>
    </form>
    <div class="vc-train" id="vc-train"></div>`;
  const $ = (s) => root.querySelector(s);

  function paintHead() {
    $('#vc-sub').textContent = info.vibe ? 'Talks in its own vibe · replies in public' : 'Public chat · everyone sees the replies';
    $('#vc-badges').innerHTML = `<span class="vc-pill ${info.ai ? 'on' : ''}">${info.ai ? 'AI LIVE' : info.aiEnabled ? 'NO CREDITS' : 'BUILT-IN BRAIN'}</span>
      <span class="vc-pill" title="10% of this viber's coin fees refill its AI credits">⚡ ${sol(info.aiCreditsSol, 4)} SOL credits</span>`;
    $('#vc-vibe').innerHTML = info.vibe ? `<b>Vibe</b> ${esc(info.vibe)}` : (isCreator() ? '<b>No vibe yet.</b> Unlock training below and tell it who to be.' : '');
    $('#vc-vibe').hidden = !$('#vc-vibe').innerHTML;
  }

  function paintTrain() {
    const t = $('#vc-train');
    if (!isCreator()) { t.innerHTML = wallet.address ? '' : '<p class="muted">Creators: connect your wallet to train your viber.</p>'; return; }
    t.innerHTML = token()
      ? '<p class="vc-unlocked">✔ <b>Training unlocked.</b> Tell it how to trade or who to be. Risky settings are refused; use the Strategy Builder for those.</p>'
      : `<button class="btn btn-block" id="vc-unlock">🔓 Unlock training (one free signature)</button>
         <p class="muted">You are this viber's creator. Sign once and you can retrain it just by talking: “take profit 30%”, “be more careful”, “pause trading”.</p>`;
  }

  function paintChips() {
    const list = isCreator() && token() ? CREATOR_PROMPTS : GUEST_PROMPTS;
    $('#vc-chips').innerHTML = list.map((p) => `<button type="button" class="vc-chip" data-p="${esc(p)}">${esc(p)}</button>`).join('');
  }

  function bubble(m) {
    const mine = m.role === 'user';
    const who = m.role === 'agent' ? esc(d.name) : m.creator ? 'Creator' : esc(m.who || 'guest');
    const applied = (m.applied || []).length ? `<span class="vc-applied">✔ ${m.applied.map((x) => ({ update_strategy: 'strategy updated', strategy: 'strategy updated', set_vibe: 'vibe updated', vibe: 'vibe updated', set_paused: 'pause changed', paused: 'paused', resumed: 'resumed' })[x] || esc(x)).join(' · ')}</span>` : '';
    return `<div class="vc-msg ${mine ? 'you' : 'agent'}${m.creator ? ' creator' : ''}" data-id="${esc(m.id)}">
      ${mine ? '' : avatar(d.avatarSeed, 36)}
      <div class="vc-bubble"><span class="vc-who">${who} · <span data-ago="${m.ts}">${ago(m.ts)}</span></span><p>${esc(m.text)}</p>${applied}</div>
    </div>`;
  }

  function paintLog(scroll = true) {
    const log = $('#vc-log');
    log.innerHTML = msgs.length ? msgs.map(bubble).join('') : `<div class="vc-empty">${avatar(d.avatarSeed, 56)}<p>Say gm to <b>${esc(d.name)}</b>. Ask what it is trading and why.</p></div>`;
    if (scroll) log.scrollTop = log.scrollHeight;
  }

  function add(list) {
    for (const m of list) if (!msgs.some((x) => x.id === m.id)) msgs.push(m);
    msgs = msgs.slice(-60);
    paintLog();
  }

  async function load() {
    try {
      const r = await app.api.getChat(d.id);
      if (!alive) return;
      msgs = r.messages || [];
      info = r;
      paintHead(); paintLog(); paintChips(); paintTrain();
    } catch {}
  }

  async function send(text) {
    if (sending || !text.trim()) return;
    sending = true;
    const btn = $('#vc-send'), input = $('#vc-input');
    btn.disabled = true; btn.textContent = '…';
    const pending = { id: 'tmp-' + Date.now(), ts: Date.now(), role: 'user', who: 'you', creator: Boolean(token()), text };
    msgs.push(pending); paintLog();
    $('#vc-log').insertAdjacentHTML('beforeend', `<div class="vc-msg agent typing">${avatar(d.avatarSeed, 36)}<div class="vc-bubble"><span class="vc-dots"><i></i><i></i><i></i></span></div></div>`);
    $('#vc-log').scrollTop = $('#vc-log').scrollHeight;
    try {
      const r = await app.api.chat(d.id, { text, token: token() || undefined });
      msgs = msgs.filter((m) => m !== pending);
      add([r.message, r.reply]);
      info.aiCreditsSol = r.aiCreditsSol; info.ai = r.ai;
      paintHead();
      input.value = '';
      if ((r.applied || []).length) { app.toast(`<b>${esc(d.name)} retrained</b>${esc(r.reply.text).slice(0, 140)}`, d.avatarSeed); refreshVibe(); }
    } catch (e) {
      msgs = msgs.filter((m) => m !== pending);
      paintLog();
      app.toast(`<b>Could not send</b>${esc(e.message)}`);
    } finally {
      sending = false; btn.disabled = false; btn.textContent = 'Send';
      root.querySelector('.vc-msg.typing')?.remove();
    }
  }

  async function refreshVibe() { try { const r = await app.api.getChat(d.id); info = r; paintHead(); } catch {} }

  async function unlock() {
    try {
      const auth = await signAction(actionMessage('chat-session', d.wallet));
      const r = await app.api.chatSession(d.id, auth);
      setToken(d.id, r);
      paintTrain(); paintChips();
      app.toast(`<b>Training unlocked</b>Talk to ${esc(d.name)} to change how it trades. Works for 12 hours.`, d.avatarSeed);
    } catch (e) {
      app.toast(`<b>Not unlocked</b>${esc(e.message || 'Signature cancelled.')}`);
    }
  }

  root.addEventListener('submit', (e) => { e.preventDefault(); send($('#vc-input').value); });
  root.addEventListener('click', (e) => {
    const c = e.target.closest('.vc-chip');
    if (c) { const p = c.dataset.p; if (/^vibe:/i.test(p)) { $('#vc-input').value = p; $('#vc-input').focus(); } else send(p); return; }
    if (e.target.closest('#vc-unlock')) unlock();
  });

  paintHead(); paintLog(); paintChips(); paintTrain();
  load();

  return {
    update(next) { d = next; },
    onChat(p) { if (p?.agentId === d.id) add(p.messages || []); },
    destroy() { alive = false; },
  };
}
