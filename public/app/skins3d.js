// ─────────────────────────────────────────────────────────────
//  VIBER skins: paid viber outfits in the same toy-brick style as the office crew.
//  Each model returns meshes for the parts posed() expects (torso, head, armL, armR, leg)
//  plus a resting pose. Rendered by boss3d.js (3D viewer) and the agent's own office,
//  and pre-rendered to brand/skins/<id>-stand.png / -bust.png for avatars.
//  Names + prices live in config.js → skins.
// ─────────────────────────────────────────────────────────────
import { characterMeshes } from './office3d.js';

const YEL = 0xFFD21F, BLK = 0x151515, SILVER = 0xE2E5E8;

// ───────── Hard Hat Hero: classic yellow hat, yellow/black hi-vis vest, tool belt, hammer ─────────
function hardhat() {
  const m = characterMeshes({ skin: 0xF2C38F, hair: 0x6E3B1F, style: 'short', top: BLK, pants: 0x2A2A2A, kind: 'vest', vest: YEL, stripes: BLK, cap: YEL, belt: true, tool: 'hammer' });
  m.torso.vox(1.2, 4.2, 2.35, 2.0, 5.6, 2.5, 0xF7F7F5);                               // name badge
  return { parts: m, pose: { armL: 0.06, armR: -0.25, armRZ: 0.12, headYaw: 0.12, headPitch: -0.03 }, headTop: 13 };
}

// ───────── Night Shift: black hard hat with a headlamp, dark hoodie, reflective stripes ─────────
function nightshift() {
  const R = SILVER;
  const m = characterMeshes({ skin: 0x8D5A3B, hair: 0x1A1412, style: 'short', top: 0x232326, pants: 0x1C1C1F, kind: 'hoodie', cap: BLK, headlamp: true, stripes: R, stripesGlow: true, boots: 0x111111 });
  m.torso.vox(-4.3, 4.6, -2.3, 4.3, 5.1, 2.35, R, 1);                                  // second band
  for (const a of [m.armL, m.armR]) a.vox(-1.15, -3.6, -1.15, 1.15, -3.0, 1.15, R, 1);
  m.leg.vox(-2.05, -4.4, -2.05, 2.05, -3.8, 2.05, R, 1);
  m.leg.vox(-2.05, -2.8, -2.05, 2.05, -2.4, 2.05, YEL);
  return { parts: m, pose: { armL: 0.04, armR: -0.06, headYaw: -0.1, headPitch: 0.02 }, headTop: 13 };
}

// ───────── The Welder: mask flipped up, leather apron, gloves, torch with orange sparks ─────────
function welder() {
  const LEATHER = 0x7A4A28, LEATHERd = 0x5A3418;
  const m = characterMeshes({ skin: 0xE0A57A, hair: 0xA0522D, style: 'short', top: 0x3A4048, pants: 0x2F3640, kind: 'tee', gloves: LEATHER, boots: 0x3A2414 });
  // welding mask, flipped up on top of the head
  const MASK = 0x2E3338;
  m.head.vox(-4.7, 6.8, -3.9, 4.7, 7.6, 4.8, MASK);                                    // headband
  m.head.vox(-4.6, 7.6, -3.2, 4.6, 9.4, 4.6, MASK);
  m.head.vox(-4.4, 9.4, -2.8, 4.4, 10.4, 6.6, MASK);                                   // the shield, tipped back over the crown
  m.head.vox(-4.2, 9.6, 6.6, 4.2, 12.4, 7.4, MASK);
  m.head.vox(-2.4, 10.4, 7.4, 2.4, 11.6, 7.6, 0x1E5A3A);                               // dark green glass
  m.head.vox(-4.9, 7.4, 0.2, -4.6, 8.4, 1.4, 0x55595E); m.head.vox(4.6, 7.4, 0.2, 4.9, 8.4, 1.4, 0x55595E); // hinges
  // leather apron over the chest and down the legs
  m.torso.vox(-3.4, 0.2, 2.15, 3.4, 6.4, 2.45, LEATHER);
  m.torso.vox(-3.6, 5.6, 2.1, -2.6, 7.2, 2.5, LEATHERd); m.torso.vox(2.6, 5.6, 2.1, 3.6, 7.2, 2.5, LEATHERd);
  m.torso.vox(-1.6, 2.2, 2.45, 1.6, 3.6, 2.6, LEATHERd);                                // pocket
  m.leg.vox(-1.9, -4.6, 2.0, 1.9, 0, 2.3, LEATHER);
  // torch in the right hand + sparks
  m.armR.vox(-0.4, -10.5, -0.4, 0.4, -6.4, 0.4, 0x55595E);
  m.armR.vox(-0.25, -11.4, 0.3, 0.25, -10.4, 2.4, 0x9AA0A6);
  m.armR.vox(-0.3, -11.6, 2.4, 0.3, -11.0, 2.9, 0xFF8A1F, 1);
  for (const [x, y, z] of [[1.4, -12.2, 3.6], [-1.2, -13.0, 3.2], [0.4, -13.8, 4.2], [2.0, -11.0, 2.8], [-1.8, -11.6, 4.4], [0.9, -14.6, 3.0]]) m.armR.vox(x - 0.25, y - 0.25, z - 0.25, x + 0.25, y + 0.25, z + 0.25, x > 0 ? 0xFF8A1F : 0xFFC94A, 1);
  return { parts: m, pose: { armL: 0.04, armR: -0.75, armRZ: 0.05, headYaw: 0.15, headPitch: -0.04 }, headTop: 14 };
}

// ───────── Blueprint Architect: white hard hat, blue shirt, glasses, rolled blueprint ─────────
function architect() {
  const BLUE = 0x2F6FD0;
  const m = characterMeshes({ skin: 0xF5D0B0, hair: 0x2A1E19, style: 'side', top: 0x3B7DD8, pants: 0x2A2A2A, kind: 'shirt', cap: 0xF7F7F5, glasses: true, lens: 0x9FC4E6, boots: 0x1A1A1A });
  m.torso.vox(1.6, 4.0, 2.25, 2.6, 5.8, 2.4, 0xF7F7F5); m.torso.vox(1.8, 5.2, 2.4, 2.0, 6.2, 2.5, YEL);  // pocket + pencil
  // rolled blueprint held under the left arm
  m.armL.vox(-1.0, -6.8, -5.2, 1.0, -4.8, 4.8, BLUE);
  m.armL.vox(-0.8, -6.6, 4.8, 0.8, -5.0, 5.1, 0xEAF2FF); m.armL.vox(-0.8, -6.6, -5.5, 0.8, -5.0, -5.2, 0xEAF2FF);
  m.armL.vox(-1.05, -6.9, -0.6, 1.05, -4.7, 0.2, 0xEF4444);                                 // band
  return { parts: m, pose: { armL: -0.12, armLZ: 0.16, armR: 0.05, headYaw: -0.12, headPitch: 0.02 }, headTop: 13 };
}

// ───────── Diamond Drill (epic): icy diamond-blue armour suit with a diamond drill ─────────
function drill() {
  const ICE = [0xE9FCFF, 0xBDEFFF, 0x8FDDF7, 0x62C4EE, 0xA9E6FF, 0xD2F6FF];
  const hash = (x, y, z) => Math.abs(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1;
  const gem = (x, y, z) => ICE[Math.floor(hash(x, y, z) * ICE.length)];
  const m = characterMeshes({ skin: 0xF0C9A0, hair: 0x1E2A3A, style: 'short', top: 0x7FD6F5, pants: 0x4FA9DB, kind: 'tee', cap: 0xBDEFFF, boots: 0x2A6FB8, gloves: 0x62C4EE });
  // faceted chest plate + shoulder pads + knee guards
  for (let x = -3; x < 3; x++) for (let y = 1; y < 6; y++) m.torso.vox(x, y, 2.1, x + 1, y + 1, 2.45, gem(x, y, 1), hash(y, x, 2) > 0.9 ? 1 : 0);
  m.torso.vox(-1.2, 6, 2.1, 1.2, 7, 2.4, 0xE9FCFF);
  for (const a of [m.armL, m.armR]) { a.vox(-1.4, -1.8, -1.4, 1.4, 0.9, 1.4, 0xA9E6FF); a.vox(-1.45, -1.0, -1.45, 1.45, -0.6, 1.45, 0xE9FCFF, 1); }
  m.leg.vox(-2.15, -4, 2.0, 2.15, -2, 2.45, 0xBDEFFF);
  m.head.vox(-0.9, 7.9, 5.0, 0.9, 9.4, 5.6, 0x62C4EE);                                   // helmet crest
  m.head.vox(-0.5, 8.3, 5.6, 0.5, 9.0, 5.75, 0xFFFFFF, 1);
  // the drill: handle in the hand, body pointing forward, a cut diamond bit
  const R = m.armR;
  R.vox(-0.5, -9.2, -0.5, 0.5, -6.2, 0.6, 0x1E2A3A);
  R.vox(-0.9, -10.8, -1.8, 0.9, -8.8, 3.2, 0x2A6FB8);
  R.vox(-1.0, -9.4, -1.6, 1.0, -9.0, 1.0, YEL);
  R.vox(-0.6, -10.5, 3.2, 0.6, -9.1, 4.2, 0x1E2A3A);
  const bit = [[1.0, 4.2, 5.0, 0x62C4EE], [0.8, 5.0, 5.8, 0x8FDDF7], [0.6, 5.8, 6.6, 0xBDEFFF], [0.4, 6.6, 7.4, 0xE9FCFF], [0.2, 7.4, 8.2, 0xFFFFFF]];
  for (const [r, z0, z1, c] of bit) R.vox(-r, -9.8 - r, z0, r, -9.8 + r, z1, c, c === 0xFFFFFF ? 1 : 0);
  for (const [x, y, z] of [[1.6, -8.4, 7.4], [-1.6, -11.2, 6.6], [0.2, -12.0, 8.6]]) { R.vox(x - 0.12, y - 0.6, z, x + 0.12, y + 0.6, z + 0.2, 0xFFFFFF, 1); R.vox(x - 0.6, y - 0.12, z, x + 0.6, y + 0.12, z + 0.2, 0xFFFFFF, 1); }
  return { parts: m, pose: { armL: 0.06, armR: -0.32, armRZ: 0.08, headYaw: 0.08, headPitch: -0.05 }, headTop: 13 };
}

// ───────── The Golden Viber (legendary): the whole figure in shining gold ─────────
function golden() {
  const G = 0xF2C230, Gd = 0xC8952E, Gl = 0xFFE38A;
  const m = characterMeshes({ skin: 0xE8B84A, hair: Gd, style: 'short', top: 0xD9A53A, pants: Gd, kind: 'vest', vest: G, stripes: Gl, cap: 0xFFD84A, belt: true, boots: 0xB07F22, tool: 'hammer' });
  // shine: bright edges on the hat and shoulders, a crown of studs, sparkles around the figure
  m.head.vox(-4.85, 9.6, 4.8, 4.85, 10.0, 5.05, 0xFFF4C2, 1);
  for (const x of [-2.4, 0, 2.4]) m.head.vox(x - 0.7, 11.3, -0.7, x + 0.7, 12.1, 0.7, Gl);
  for (const a of [m.armL, m.armR]) a.vox(-1.25, 0.2, -1.25, 1.25, 0.8, 1.25, Gl);
  const sparkle = (mesh, x, y, z, s = 0.6) => { mesh.vox(x - 0.12, y - s, z, x + 0.12, y + s, z + 0.2, 0xFFFFFF, 1); mesh.vox(x - s, y - 0.12, z, x + s, y + 0.12, z + 0.2, 0xFFFFFF, 1); };
  sparkle(m.torso, -5.4, 6.8, 2.6); sparkle(m.torso, 5.2, 2.2, 2.8, 0.45); sparkle(m.head, 5.6, 11.4, 3.2, 0.5); sparkle(m.head, -6.0, 8.6, 2.0, 0.4);
  m.torso.vox(-0.9, 3.8, 2.35, 0.9, 5.2, 2.55, 0xFFF4C2, 1);                              // gold badge glint
  return { parts: m, pose: { armL: 0.04, armR: -0.2, armRZ: 0.1, headYaw: 0, headPitch: -0.02 }, headTop: 13 };
}

export const SKIN_MODELS = { hardhat, nightshift, welder, architect, drill, golden };
