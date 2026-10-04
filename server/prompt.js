// The built-in reader for "describe your strategy in words". No AI needed:
// it picks an entry style from keywords and pulls numbers like "stop loss 8%".
import { CONFIG } from './config.js';
import { defaultsFor } from '../public/shared/custom-strategy.js';

const STYLES = [
  ['scalper', /\b(scalp|quick|fast|flip|in and out|short trades?)\b/i, 'Quick in-and-out trades on momentum (Riveter style).'],
  ['dip', /\b(dip|pullback|buy the dip|retrace|bounce)\b/i, 'Buys pullbacks after a run (Excavator style).'],
  ['trend', /\b(trend|ride|hold longer|momentum rider|swing)\b/i, 'Rides stronger trends and holds longer (Highrise style).'],
  ['sniper', /\b(careful|selective|strongest|rarely|patient|sniper|picky)\b/i, 'Trades rarely and only the strongest setups (Surveyor style).'],
];

const num = (re, text) => { const m = text.match(re); return m ? Number(m[1]) : null; };

export function readPrompt(text) {
  const understood = [], notes = [], risks = [];
  let base = 'classic';
  for (const [id, re, say] of STYLES) if (re.test(text)) { base = id; understood.push(say); break; }
  if (base === 'classic') understood.push(text ? 'No clear style word found, so it starts from the balanced Blueprint plan.' : 'Empty description: starting from the balanced Blueprint plan.');
  const st = CONFIG.strategies.find((s) => s.id === base);
  const params = defaultsFor(base, { ...st, ...st.entry });
  const sl = num(/stop[ -]?loss[^0-9]{0,12}(\d+(?:\.\d+)?)\s*%/i, text);
  const tp = num(/take[ -]?profit[^0-9]{0,12}(\d+(?:\.\d+)?)\s*%/i, text) ?? num(/(?:target|sell at)[^0-9]{0,12}\+?(\d+(?:\.\d+)?)\s*%/i, text);
  const size = num(/(\d+(?:\.\d+)?)\s*%\s*(?:of|per)\s*(?:the\s*)?(?:sol|balance|bankroll|trade)/i, text);
  const open = num(/(\d+)\s*(?:open\s*)?positions?/i, text);
  const hold = num(/(?:hold|max hold)[^0-9]{0,12}(\d+)\s*(?:min|minutes)/i, text);
  if (sl != null) { params.stopLossPct = -sl / 100; understood.push(`Stop loss at −${sl}%.`); }
  if (tp != null) { params.takeProfitPct = tp / 100; understood.push(`Take profit at +${tp}%.`); }
  if (size != null) { params.sizePct = size / 100; understood.push(`Uses ${size}% of its SOL per trade.`); }
  if (open != null) { params.maxOpen = open; understood.push(`Up to ${open} open positions.`); }
  if (hold != null) { params.maxHoldMin = hold; understood.push(`Closes trades after ${hold} minutes.`); }
  if (/\b(safe|conservative|low risk)\b/i.test(text)) { params.sizePct = Math.min(params.sizePct, 0.08); params.stopLossPct = Math.max(params.stopLossPct, -0.1); understood.push('Kept sizes small and the stop tight (you asked for low risk).'); }
  if (/\b(degen|aggressive|high risk|yolo)\b/i.test(text)) { params.sizePct = Math.max(params.sizePct, 0.2); risks.push('Aggressive sizing: losses add up fast.'); }
  notes.push('Every number can still be changed with the sliders before you save.');
  return { base, params, name: base === 'classic' ? 'My Blueprint' : 'My ' + CONFIG.strategies.find((s) => s.id === base).name, understood, notes, risks };
}
