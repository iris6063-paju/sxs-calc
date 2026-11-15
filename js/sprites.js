// Paper-standee characters.
// Monsters & weapons: silhouettes from game-icons.net (CC BY 3.0) re-coloured, outlined and animated here.
// Heroes: original procedural paper-doll rigs that hold the re-created weapon parts.
import { ICONS } from './icons.js';
import { CLASSES } from './gamedata.js';
import { heroArt, mobArt, hasMobArt } from './art.js';
import { designOf, sheet, sheetImg } from './sheets.js';

export const EL = {
  phy: { ko: '물리', c: '#c9c2b2' }, wind: { ko: '바람', c: '#6fd9a8' }, water: { ko: '물', c: '#4aa8ff' },
  fire: { ko: '불', c: '#ff7a3c' }, light: { ko: '빛', c: '#ffd75a' }, dark: { ko: '어둠', c: '#b07cff' }, chaos: { ko: '혼돈', c: '#e05cb0' }, none: { ko: '보조', c: '#9fb3a5' },
};
const OUT = '#2a1b14', CREAM = '#fff6e2';
const P2 = new Map();
const path = (n) => { let p = P2.get(n); if (!p) { p = new Path2D(ICONS[n] || ICONS.ghost); P2.set(n, p); } return p; };
const lerp = (a, b, k) => a + (b - a) * k;
const cl01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (k) => { k = cl01(k); return k * k * (3 - 2 * k); };
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; };

/* ───────────── monsters ───────────── */
const MOB_ICON = [
  [/stink bomb/i, 'unlit-bomb'], [/spider queen/i, 'hanging-spider'], [/spider/i, 'spider-alt'], [/rabbit/i, 'rabbit'], [/owl/i, 'owl'], [/mantis/i, 'praying-mantis'],
  [/antlered/i, 'stag-head'], [/bear/i, 'bear-head'], [/chieftain/i, 'direwolf'], [/shaman/i, 'cultist'], [/flinger|rider/i, 'wolf-head'], [/shield|sentinel/i, 'hound'], [/wolf/i, 'direwolf'],
  [/boar/i, 'boar'], [/golem/i, 'rock-golem'], [/lobster|crab/i, 'crab'], [/eagle/i, 'eagle-emblem'], [/serpent/i, 'snake'], [/viper/i, 'cobra'], [/meerkat/i, 'squirrel'],
  [/cactus/i, 'cactus'], [/scorpion/i, 'scorpion'], [/mechosaurus/i, 'dinosaur-rex'], [/bull/i, 'bull'], [/slime/i, 'slime'], [/geocrusher/i, 'cyclops'], [/coal/i, 'stone-block'],
  [/toad|frog/i, 'frog'], [/obake/i, 'paper-lantern'], [/fishling/i, 'piranha'], [/shellsprite/i, 'spiral-shell'], [/nine-tailed/i, 'fox-head'], [/fox/i, 'fox'], [/umibozu/i, 'octopus'],
  [/dorotabo/i, 'ghost'], [/samurai/i, 'samurai-helmet'], [/beetle/i, 'scarab-beetle'], [/vinegeist/i, 'carnivorous-plant'], [/gangi/i, 'imp'], [/^nue/i, 'griffin-symbol'],
  [/tengu/i, 'harpy'], [/kamaitachi/i, 'wolverine-claws'], [/wanyudo/i, 'fire-ring'], [/kappa/i, 'turtle'], [/general|guard/i, 'visored-helm'], [/amaterasu/i, 'sun-priest'],
  [/cloudshell/i, 'snail'], [/\brat/i, 'rat'], [/hound/i, 'hound'], [/puppet/i, 'puppet'], [/sage|arbiter/i, 'warlock-hood'], [/deer/i, 'deer'], [/qinyuan/i, 'bee'], [/bifang/i, 'eagle-head'],
  [/strawman/i, 'scarecrow'], [/clayling/i, 'voodoo-doll'], [/hoarder/i, 'amphora'], [/lion|suanni/i, 'lion'], [/ginseng/i, 'sprout'], [/taowu/i, 'ogre'], [/bronze face/i, 'totem-head'],
  [/burner|cauldron/i, 'cauldron'], [/sword soul/i, 'broadsword'], [/mirror/i, 'mirror-mirror'], [/white ape/i, 'gorilla'], [/thunderling/i, 'djinn'], [/inkape/i, 'monkey'], [/xin huan/i, 'oni'],
  [/goat/i, 'goat'], [/turtle/i, 'tortoise'], [/\box/i, 'minotaur'],
];
const MOB_TINT = [
  [/fire|pyro|flame|coal|wanyudo|burner/i, 14], [/water|aqua|tide|frost|fish|kappa|umibozu|steam|spring|cloud|blue/i, 208], [/bronze/i, 32],
  [/dusty|sand|mine|clay|straw/i, 42], [/rock|golem|geocrusher|stone/i, 95], [/mech/i, 200], [/fey|fox|phantom|obake|nue|kamaitachi|tengu/i, 280],
  [/sylvan|cactus|vine|ginseng|mantis|frog|toad|deer/i, 115], [/spider|stink|nether|ink|taowu|shadow/i, 268], [/thunder|amaterasu|lion|suanni/i, 46],
];
export const mobIconName = (mob) => (MOB_ICON.find(([re]) => re.test(mob.en)) || [0, 'ghost'])[1];
export function mobColors(mob) {
  const m = MOB_TINT.find(([re]) => re.test(mob.en));
  const h = m ? m[1] : 18 + hash(mob.en) * 26;
  const sat = /rock|golem|geocrusher|stone|mech/i.test(mob.en) ? 14 : 62;
  return { top: `hsl(${h} ${sat}% ${mob.ty === 2 ? 72 : 66}%)`, bot: `hsl(${(h + 340) % 360} ${sat + 8}% ${mob.ty === 2 ? 44 : 38}%)`, rim: mob.ty === 2 ? '#ffd24a' : mob.ty === 1 ? '#d9c2ff' : CREAM };
}
// GPT sprite used for each monster name (first match wins); anything unmatched keeps the icon sticker
const MOB_ART = [
  [/stink bomb|coal/i, 'bomb'], [/spider/i, 'spider'], [/rabbit/i, 'rabbit'], [/owl/i, 'owl'], [/mantis/i, 'mantis'], [/bear|raccoon/i, 'bear'], [/shaman/i, 'wolfmage'], [/wolf/i, 'wolf'],
  [/boar/i, 'boar'], [/eagle|bifang|phoenix|flamoenix|griffin/i, 'eagle'], [/serpent|viper|orochi/i, 'snake'], [/lobster|crab/i, 'crab'], [/meerkat|\brat/i, 'rodent'], [/cactus/i, 'cactus'],
  [/scorpion/i, 'scorpion'], [/mechosaurus/i, 'dino'], [/bull|\box|bovine/i, 'bull'], [/slime/i, 'slime'], [/cyclop|taowu|xin huan|plague|qiongqi/i, 'ogre'], [/golem|geocrusher|polyhedral/i, 'golem'],
  [/toad|frog/i, 'frog'], [/obake|dorotabo|phantom|myraface|aobozu/i, 'ghost'], [/fish/i, 'fish'], [/shell/i, 'shell'], [/fox/i, 'fox'], [/umibozu/i, 'octopus'], [/beetle/i, 'beetle'],
  [/vine|ginseng|withered/i, 'plant'], [/gangi|^nue/i, 'imp'], [/tengu/i, 'tengu'], [/kamaitachi|thunderling|wanyudo|amaterasu/i, 'spirit'], [/kappa|turtle/i, 'turtle'],
  [/general|guard|sword soul|blademon|hero|herald/i, 'knight'], [/puppet|strawman|clayling|sage|arbiter|hoarder/i, 'doll'], [/deer/i, 'deer'], [/lion|suanni|tiger/i, 'lion'],
  [/bronze|mirror|cauldron|burner/i, 'relic'], [/ape/i, 'ape'], [/qinyuan/i, 'bee'], [/goat/i, 'goat'], [/loong|dragon|wyrm|draconox|rimereaver|yoldra/i, 'dragon'], [/hound|爆雷/i, 'hound'],
  // guild conquest / Hieromon bosses beyond the Fantasia maps
  [/walrus/i, 'boar'], [/deepsea|shark/i, 'fish'], [/fixer|armament|clockwork|saucer|mecha/i, 'golem'], [/pirate ship|狂噬/i, 'ghost'], [/molten|magma|giant|灼热/i, 'ogre'],
  [/king dova|king aiur/i, 'knight'], [/tormentor/i, 'imp'], [/aeralith/i, 'spirit'], [/thalanima/i, 'octopus'], [/岩层/i, 'golem'],
];
const PET_ART = { Falko: 'eagle', Boaro: 'boar', Mandragora: 'plant', Zeioletus: 'spirit', Terragon: 'dino', Sylvaerie: 'spirit', Kels: 'fish', Armopi: 'turtle', Herbote: 'plant', Nyxarchon: 'dragon', Aegiswing: 'eagle', Pandarial: 'bear', Chomusuke: 'fox', 'Cabbage Dog': 'hound', Prismora: 'spirit', 'Luminarch Steed': 'deer', Yoldra: 'dragon', Hexitty: 'fox', Mumpkin: 'ghost' };
export const mobArtSlug = (mob) => (mob.art ? mob.art : (MOB_ART.find(([re]) => re.test(mob.en)) || [0, null])[1]);
export const petArtSlug = (pet) => PET_ART[pet.en] || 'spirit';
export const petPalette = (pet) => mobPalette({ en: pet.en, hue: Math.round(hash(pet.en) * 360) });
export function mobPalette(mob) {
  const m = MOB_TINT.find(([re]) => re.test(mob.en));
  const h = Math.round(mob.hue != null ? mob.hue : m ? m[1] : 18 + hash(mob.en) * 26), s = /rock|golem|geocrusher|stone|mech/i.test(mob.en) ? 12 : 58;
  return [`hsl(${h}, ${s}%, 52%)`, `hsl(${h}, ${s}%, 74%)`, `hsl(${(h + 345) % 360}, ${s + 6}%, 32%)`];
}
const TMP = {};
function tmp(n, w, h) { let c = TMP[n]; if (!c) c = TMP[n] = document.createElement('canvas'); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; }
/** draws drawFn's picture with a paper-sticker rim */
function sticker(ctx, w, h, rim, drawFn) {
  const a = tmp('a', w, h), ac = a.getContext('2d'); ac.clearRect(0, 0, w, h); drawFn(ac);
  const s = tmp('s', w, h), sc = s.getContext('2d'); sc.globalCompositeOperation = 'source-over'; sc.clearRect(0, 0, w, h); sc.drawImage(a, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = rim; sc.fillRect(0, 0, w, h);
  ctx.clearRect(0, 0, w, h); const r = Math.max(2, w * 0.022);
  for (let i = 0; i < 8; i++) ctx.drawImage(s, Math.cos(i * 0.785) * r, Math.sin(i * 0.785) * r);
  ctx.drawImage(a, 0, 0);
}
function crown(ctx, w, h) { ctx.save(); ctx.translate(w / 2, h * 0.07); const cs = (w * 0.26) / 512; ctx.scale(cs, cs); ctx.translate(-256, -256); const cp = path('laurel-crown'); ctx.lineJoin = 'round'; ctx.lineWidth = 60; ctx.strokeStyle = OUT; ctx.stroke(cp); ctx.fillStyle = '#ffd24a'; ctx.fill(cp); ctx.restore(); }
/** Fantomon standee (reuses a monster sprite, recoloured per pet) */
export function drawPet(ctx, w, h, pet) { drawMob(ctx, w, h, { en: pet.en, ty: 0, art: PET_ART[pet.en] || 'spirit', hue: Math.round(hash(pet.en) * 360) }); }
/** static sticker of a monster, feet at the bottom centre */
export function drawMob(ctx, w, h, mob) {
  const slug = mobArtSlug(mob);
  if (slug && hasMobArt(slug)) {
    const img = mobArt(slug, mobPalette(mob));
    if (img) { sticker(ctx, w, h, mobColors(mob).rim, (c) => c.drawImage(img, w * 0.07, h * (mob.ty === 2 ? 0.12 : 0.08), w * 0.86, h * 0.86)); if (mob.ty === 2) crown(ctx, w, h); return; }
  }
  const col = mobColors(mob), p = path(mobIconName(mob));
  const s = (Math.min(w, h) * 0.8) / 512;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2 - 256 * s, h * 0.94 - 512 * s);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 62; ctx.strokeStyle = col.rim; ctx.stroke(p);
  ctx.lineWidth = 40; ctx.strokeStyle = OUT; ctx.stroke(p);
  const g = ctx.createLinearGradient(0, 30, 0, 500); g.addColorStop(0, col.top); g.addColorStop(1, col.bot);
  ctx.fillStyle = g; ctx.fill(p);
  ctx.save(); ctx.clip(p);
  const hi = ctx.createRadialGradient(170, 120, 10, 170, 120, 330); hi.addColorStop(0, 'rgba(255,255,255,.55)'); hi.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hi; ctx.fillRect(0, 0, 512, 512);
  ctx.restore();
  ctx.restore();
  if (mob.ty === 2) { ctx.save(); ctx.translate(w / 2, h * 0.07); const cs = (w * 0.26) / 512; ctx.scale(cs, cs); ctx.translate(-256, -256); const cp = path('laurel-crown'); ctx.lineJoin = 'round'; ctx.lineWidth = 60; ctx.strokeStyle = OUT; ctx.stroke(cp); ctx.fillStyle = '#ffd24a'; ctx.fill(cp); ctx.restore(); }
}

/* ───────────── heroes ───────────── */
const PAL = {
  Zhanshi: ['#7f97b8', '#3b4a63', '#cfd9e6', '#d8483a', '#b33a30'], Huwei: ['#8fa6c9', '#33415c', '#e3ebf5', '#3f7fd9', '#2f5fae'],
  Dunjiashi: ['#e9e2cf', '#6b5b3e', '#fffaf0', '#e0aa2e', '#b98a1f'], Shouhuzhe: ['#59b8b0', '#1f4d55', '#d9f5f0', '#f0c04a', '#2c8f8a'],
  LegendShouhuzhe: ['#f3ead8', '#6e2b2b', '#ffffff', '#c9302c', '#8f1f24'],
  Doushi: ['#c8483f', '#4a1e1e', '#f0d7c8', '#2b2b33', '#7d2622'], Kuangzhanshi: ['#8f2a2a', '#2a1414', '#e8c7b0', '#e86a2a', '#541515'],
  Zhengfuzhe: ['#e08a2e', '#3a2414', '#f6dcc0', '#ffd24a', '#a8531a'], LegendZhengfuzhe: ['#5a3a86', '#1c1230', '#e7d6f2', '#e0453a', '#35204f'],
  Fashi: ['#5b78d6', '#27346b', '#dfe7ff', '#f2c14e', '#3c56ad'], Shushi: ['#8b5fd6', '#3a2470', '#efe3ff', '#ffd75a', '#6a41b3'],
  Modaoshi: ['#2f6fc4', '#12305c', '#d6ecff', '#63e0ff', '#1f4f93'], Huimiezhe: ['#d1483a', '#4f1717', '#ffe1d1', '#ffb13a', '#9c2f26'],
  LegendHuimiezhe: ['#2aa6a0', '#104548', '#d7fbf6', '#ffd24a', '#1b7873'],
  Xianzhe: ['#6fae5c', '#2c4a27', '#eef7e2', '#f3e2a0', '#4d8a41'], Mishushi: ['#5560c2', '#20254f', '#e2e5ff', '#c8d2ff', '#3b4496'],
  Zhangkongzhe: ['#7a3fa8', '#2a1340', '#f0dcff', '#ff6ad5', '#55297a'], LegendZhangkongzhe: ['#2b3470', '#0f1330', '#dfe3ff', '#ffd24a', '#1b2150'],
};
const SKIN = ['#ffd9b8', '#f7c9a3', '#e9b48b', '#ffe2c9'];
const HAIR = ['#3b2a22', '#6b4226', '#c98b3a', '#2a2a36', '#8e3b2e', '#e8e0d0'];
export function heroSpec(clsKey, seedStr = '') {
  const c = CLASSES.find((x) => x.key === clsKey) || CLASSES[0];
  const p = PAL[c.key] || PAL.Zhanshi, r = hash(c.key + seedStr);
  return { arche: c.arche, tier: c.tier, seed: r * 10, pal: { main: p[0], dark: p[1], light: p[2], accent: p[3], cape: p[4], skin: SKIN[Math.floor(r * 4)], hair: HAIR[Math.floor(hash(seedStr + c.key + 'h') * 6)] } };
}
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function fs(c, fill, lw = 4) { c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(); }
function icon(c, name, px, py, size, rot, fill, hx = 0.14, hy = 0.86, lw = 30) {
  c.save(); c.translate(px, py); c.rotate(rot); const s = size / 512; c.scale(s, s); c.translate(-512 * hx, -512 * hy);
  const p = path(name); c.lineJoin = 'round'; c.lineWidth = lw; c.strokeStyle = OUT; c.stroke(p); c.fillStyle = fill; c.fill(p); c.restore();
}
function face(c, x, y, t, seed) {
  const blink = Math.sin(t * 0.9 + seed * 7) > 0.985 ? 0.15 : 1;
  c.fillStyle = OUT; c.beginPath(); c.ellipse(x, y, 3.8, 5.8 * blink, 0, 0, 7); c.ellipse(x + 17, y, 3.8, 5.8 * blink, 0, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x + 1.2, y - 2.2, 1.4, 0, 7); c.arc(x + 18.2, y - 2.2, 1.4, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,110,100,.42)'; c.beginPath(); c.ellipse(x - 6, y + 9, 5, 3, 0, 0, 7); c.ellipse(x + 24, y + 9, 5, 3, 0, 0, 7); c.fill();
  c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.arc(x + 8.5, y + 9, 3, 0.2, Math.PI - 0.2); c.stroke();
}
function hand(c, x, y, fill) { c.beginPath(); c.arc(x, y, 7.5, 0, 7); fs(c, fill, 3); }
function glow(c, x, y, r, col, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = a; c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.globalAlpha = 1; }

const RIG = {
  knight(c, P) {
    const { x, y, bob, sway, swing, pal, t, seed } = P;
    c.beginPath(); c.moveTo(x - 16, y - 98 + bob); c.quadraticCurveTo(x - 54 - sway * 8, y - 56, x - 44 - sway * 12, y - 8); c.lineTo(x - 6, y - 16); c.closePath(); fs(c, pal.cape);
    rr(c, x - 21, y - 36, 16, 33, 6); fs(c, pal.dark); rr(c, x + 5, y - 36, 16, 33, 6); fs(c, pal.dark);
    c.beginPath(); c.moveTo(x - 27, y - 102 + bob); c.lineTo(x + 25, y - 102 + bob); c.quadraticCurveTo(x + 33, y - 62, x + 23, y - 30); c.lineTo(x - 25, y - 30); c.quadraticCurveTo(x - 35, y - 62, x - 27, y - 102 + bob); fs(c, pal.main);
    rr(c, x - 26, y - 50, 50, 10, 3); fs(c, pal.accent, 3);
    c.beginPath(); c.ellipse(x - 27, y - 96 + bob, 13, 10, 0, 0, 7); fs(c, pal.light, 3); c.beginPath(); c.ellipse(x + 26, y - 96 + bob, 13, 10, 0, 0, 7); fs(c, pal.light, 3);
    const hy = y - 132 + bob;
    c.beginPath(); c.moveTo(x - 6, hy - 30); c.quadraticCurveTo(x - 30, hy - 66, x - 48 - sway * 6, hy - 34); c.quadraticCurveTo(x - 24, hy - 42, x - 12, hy - 26); fs(c, pal.accent);
    c.beginPath(); c.arc(x, hy, 35, 0, 7); fs(c, pal.light);
    rr(c, x - 12, hy - 12, 44, 27, 11); fs(c, pal.skin, 3); face(c, x + 2, hy - 1, t, seed);
    rr(c, x - 36, hy - 3, 72, 6, 3); c.globalAlpha = 0.25; c.fillStyle = OUT; c.fill(); c.globalAlpha = 1;
    icon(c, 'templar-shield', x - 20, y - 56 + bob, 66, -0.1, pal.accent, 0.5, 0.5, 26);
    const sx = x + 30, sy = y - 74 + bob;
    icon(c, 'broadsword', sx, sy, 104, swing, '#eef2f6');
    hand(c, sx, sy, pal.light);
  },
  duelist(c, P) {
    const { x, y, bob, sway, swing, pal, t, seed } = P;
    icon(c, 'gladius', x - 24, y - 70 + bob, 84, -swing * 0.8 - 1.9, '#dfe5ea');
    c.beginPath(); c.moveTo(x - 8, y - 100 + bob); c.quadraticCurveTo(x - 50 - sway * 14, y - 96, x - 62 - sway * 18, y - 74); c.quadraticCurveTo(x - 40 - sway * 8, y - 84, x - 10, y - 88 + bob); fs(c, pal.accent === '#2b2b33' ? '#e9e2d0' : pal.accent, 3);
    rr(c, x - 17, y - 36, 13, 33, 6); fs(c, pal.dark); rr(c, x + 5, y - 36, 13, 33, 6); fs(c, pal.dark);
    c.beginPath(); c.moveTo(x - 20, y - 100 + bob); c.lineTo(x + 20, y - 100 + bob); c.quadraticCurveTo(x + 24, y - 62, x + 17, y - 32); c.lineTo(x - 19, y - 32); c.quadraticCurveTo(x - 26, y - 62, x - 20, y - 100 + bob); fs(c, pal.main);
    c.beginPath(); c.moveTo(x - 20, y - 98 + bob); c.lineTo(x + 16, y - 44); c.lineTo(x + 20, y - 54); c.lineTo(x - 12, y - 100 + bob); c.closePath(); fs(c, pal.dark, 3);
    rr(c, x - 20, y - 50, 38, 8, 3); fs(c, pal.cape, 3);
    const hy = y - 130 + bob;
    c.beginPath(); c.arc(x, hy, 33, 0, 7); fs(c, pal.skin);
    c.beginPath(); c.moveTo(x - 34, hy + 4); c.quadraticCurveTo(x - 44, hy - 30, x - 18, hy - 42); c.lineTo(x - 10, hy - 54); c.lineTo(x, hy - 40); c.lineTo(x + 12, hy - 52); c.lineTo(x + 18, hy - 36); c.lineTo(x + 34, hy - 38); c.quadraticCurveTo(x + 40, hy - 14, x + 30, hy - 12); c.quadraticCurveTo(x + 6, hy - 26, x - 14, hy - 12); c.quadraticCurveTo(x - 22, hy + 2, x - 34, hy + 4); fs(c, pal.hair);
    rr(c, x - 33, hy - 16, 66, 8, 3); fs(c, pal.accent === '#2b2b33' ? pal.main : pal.accent, 3);
    face(c, x + 3, hy + 4, t, seed);
    const sx = x + 26, sy = y - 72 + bob;
    icon(c, 'katana', sx, sy, 112, swing, '#f2f4f7');
    hand(c, sx, sy, pal.skin);
  },
  sorcerer(c, P) {
    const { x, y, bob, sway, swing, pal, t, seed, cast } = P;
    c.beginPath(); c.moveTo(x - 14, y - 104 + bob); c.lineTo(x + 14, y - 104 + bob); c.quadraticCurveTo(x + 32, y - 50, x + 38 + sway * 4, y - 4); c.quadraticCurveTo(x, y + 6, x - 38 + sway * 4, y - 4); c.quadraticCurveTo(x - 32, y - 50, x - 14, y - 104 + bob); fs(c, pal.main);
    c.beginPath(); c.moveTo(x - 4, y - 100 + bob); c.lineTo(x + 4, y - 100 + bob); c.lineTo(x + 8, y - 2); c.lineTo(x - 8, y - 2); c.closePath(); fs(c, pal.cape, 3);
    rr(c, x - 22, y - 62, 44, 8, 3); fs(c, pal.accent, 3);
    const hy = y - 130 + bob;
    const sx = x + 40, sy = y - 62 + bob - cast * 10, rot = swing * 0.5 - 0.62;
    icon(c, 'wizard-staff', sx, sy, 122, rot, '#b9824a', 0.3, 0.72, 26);
    glow(c, sx + Math.cos(rot - 0.83) * 76, sy + Math.sin(rot - 0.83) * 76, 24 + cast * 26 + Math.sin(t * 4 + seed) * 3, pal.accent, 0.8);
    c.beginPath(); c.arc(x, hy, 33, 0, 7); fs(c, pal.skin);
    c.beginPath(); c.moveTo(x - 34, hy + 6); c.quadraticCurveTo(x - 40, hy - 14, x - 26, hy - 16); c.lineTo(x - 6, hy - 14); c.quadraticCurveTo(x - 20, hy + 2, x - 34, hy + 6); fs(c, pal.hair, 3);
    face(c, x + 3, hy + 4, t, seed);
    c.beginPath(); c.ellipse(x, hy - 18, 52, 13, -0.06, 0, 7); fs(c, pal.dark);
    c.beginPath(); c.moveTo(x - 30, hy - 22); c.quadraticCurveTo(x - 12, hy - 72, x + 6 - sway * 6, hy - 92); c.quadraticCurveTo(x + 22 - sway * 10, hy - 84, x + 34 - sway * 12, hy - 70); c.quadraticCurveTo(x + 16, hy - 70, x + 30, hy - 22); c.closePath(); fs(c, pal.dark);
    rr(c, x - 31, hy - 32, 62, 9, 3); fs(c, pal.accent, 3);
    hand(c, sx, sy, pal.skin);
  },
  sage(c, P) {
    const { x, y, bob, sway, swing, pal, t, seed, cast } = P;
    c.beginPath(); c.moveTo(x - 16, y - 104 + bob); c.lineTo(x + 16, y - 104 + bob); c.quadraticCurveTo(x + 30, y - 52, x + 34 + sway * 4, y - 4); c.quadraticCurveTo(x, y + 5, x - 34 + sway * 4, y - 4); c.quadraticCurveTo(x - 30, y - 52, x - 16, y - 104 + bob); fs(c, pal.light);
    c.beginPath(); c.moveTo(x - 16, y - 102 + bob); c.quadraticCurveTo(x - 6, y - 60, x - 18, y - 6); c.lineTo(x - 32, y - 6); c.quadraticCurveTo(x - 30, y - 52, x - 16, y - 102 + bob); fs(c, pal.main, 3);
    c.beginPath(); c.moveTo(x + 16, y - 102 + bob); c.quadraticCurveTo(x + 6, y - 60, x + 18, y - 6); c.lineTo(x + 32, y - 6); c.quadraticCurveTo(x + 30, y - 52, x + 16, y - 102 + bob); fs(c, pal.main, 3);
    const hy = y - 130 + bob;
    c.beginPath(); c.moveTo(x - 4, hy - 44); c.quadraticCurveTo(x - 50, hy - 30, x - 40, hy + 22); c.quadraticCurveTo(x, hy + 40, x + 40, hy + 22); c.quadraticCurveTo(x + 50, hy - 30, x - 4, hy - 44); fs(c, pal.main);
    c.beginPath(); c.arc(x + 2, hy + 2, 28, 0, 7); fs(c, pal.skin, 3);
    c.beginPath(); c.moveTo(x - 24, hy - 10); c.quadraticCurveTo(x, hy - 30, x + 28, hy - 12); c.quadraticCurveTo(x + 2, hy - 20, x - 24, hy - 10); fs(c, pal.hair, 3);
    face(c, x + 4, hy + 5, t, seed);
    const by = y - 70 + bob + Math.sin(t * 2.4 + seed) * 4 - cast * 8;
    glow(c, x - 36, by, 30 + cast * 20, pal.accent, 0.5 + cast * 0.4);
    icon(c, 'spell-book', x - 36, by, 52, Math.sin(t * 1.3 + seed) * 0.12, pal.accent, 0.5, 0.5, 26);
    const sx = x + 28, sy = y - 68 + bob;
    icon(c, 'orb-wand', sx, sy, 92, swing * 0.6 - 0.3, pal.dark === '#0f1330' ? '#c9b26a' : '#e9dcc0', 0.16, 0.84, 26);
    glow(c, sx + Math.cos(swing * 0.6 - 0.3 - 0.78) * 70, sy + Math.sin(swing * 0.6 - 0.3 - 0.78) * 70, 18 + cast * 20, pal.accent, 0.8);
    hand(c, sx, sy, pal.skin);
  },
};

/** GPT-drawn hero layers animated like the procedural rig */
function drawArtHero(c, art, P, k) {
  const dx = P.x - 100, idle = P.bob / 1.6, L = art.L, px = art.pivot[0], py = art.pivot[1];
  let ang = idle * 0.05;
  if (k >= 0) ang = k < 0.35 ? lerp(0, -1.0, ease(k / 0.35)) : k < 0.62 ? lerp(-1.0, 1.25, ease((k - 0.35) / 0.27)) : lerp(1.25, 0, ease((k - 0.62) / 0.38));
  const sh = -P.sway * 0.035;
  if (L.back) { c.save(); c.translate(dx, 0); c.transform(1, 0, sh, 1, -sh * 222, 0); c.drawImage(L.back, 0, 0, 200, 240); c.restore(); }
  c.save(); c.translate(dx + 100, 222); c.scale(1, 1 + idle * 0.012); c.translate(-100, -222); c.drawImage(L.body, 0, 0, 200, 240); c.restore();
  c.save(); c.translate(dx + 100, 150 + P.bob); c.rotate(idle * 0.022 + (k >= 0 ? Math.sin(k * Math.PI) * 0.06 : 0)); c.translate(-100, -150); c.drawImage(L.head, 0, 0, 200, 240); c.restore();
  if (L.weapon) { c.save(); c.translate(dx + px, py + P.bob * 0.6); c.rotate(ang); c.translate(-px, -py); c.drawImage(L.weapon, 0, 0, 200, 240); c.restore(); }
}
/** Animated paper-doll hero. anim: {atk 0..1|-1, hit 0..1, flip, dead} */
export class HeroSprite {
  constructor(clsKey, name = '', px = 256) {
    this.cls = clsKey;
    this.spec = heroSpec(clsKey, name);
    this.w = px; this.h = Math.round(px * 1.2);
    this.canvas = document.createElement('canvas'); this.canvas.width = this.w; this.canvas.height = this.h;
    this.buf = document.createElement('canvas'); this.buf.width = this.w; this.buf.height = this.h;
    this.sil = document.createElement('canvas'); this.sil.width = this.w; this.sil.height = this.h;
  }
  setClass(clsKey, name = '') { this.cls = clsKey; this.spec = heroSpec(clsKey, name); }
  draw(t, a = {}, target) {
    const { spec, w, h } = this, b = this.buf.getContext('2d'), s = w / 200;
    const k = a.atk == null ? -1 : a.atk, seed = spec.seed;
    const idle = Math.sin(t * 2.2 + seed);
    let swing = idle * 0.07 - 0.12, lunge = 0, cast = 0;
    if (k >= 0) {
      swing = k < 0.35 ? lerp(-0.12, -1.45, ease(k / 0.35)) : k < 0.62 ? lerp(-1.45, 1.15, ease((k - 0.35) / 0.27)) : lerp(1.15, -0.12, ease((k - 0.62) / 0.38));
      lunge = Math.sin(Math.PI * cl01((k - 0.25) / 0.6)) * 16; cast = Math.sin(Math.PI * cl01(k));
    }
    b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, w, h);
    b.setTransform(a.flip ? -s : s, 0, 0, s, a.flip ? w : 0, 0);
    const P = { x: 100 + lunge - (a.hit ? Math.sin(a.hit * Math.PI) * 10 : 0), y: 222, bob: idle * 1.6, sway: Math.sin(t * 1.7 + seed * 2), swing, cast, pal: spec.pal, t, seed };
    if (spec.tier >= 3) glow(b, 100, 120, 96, spec.pal.accent, 0.16 + 0.05 * idle + (spec.tier - 3) * 0.05);
    const art = heroArt(this.cls);
    if (art) drawArtHero(b, art, P, k); else RIG[spec.arche](b, P);
    if (spec.tier >= 4 && !art) icon(b, 'laurel-crown', P.x, P.y - 176 + P.bob + (spec.arche === 'sorcerer' ? -44 : 0), spec.tier >= 5 ? 44 : 34, 0, '#ffd24a', 0.5, 0.5, 34);
    if (a.hit) { b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-atop'; b.fillStyle = `rgba(255,255,255,${0.75 * Math.sin(a.hit * Math.PI)})`; b.fillRect(0, 0, w, h); b.globalCompositeOperation = 'source-over'; }
    if (a.dead) { b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-atop'; b.fillStyle = 'rgba(70,72,90,.62)'; b.fillRect(0, 0, w, h); b.globalCompositeOperation = 'source-over'; }
    // sticker rim
    const si = this.sil.getContext('2d');
    si.globalCompositeOperation = 'source-over'; si.clearRect(0, 0, w, h); si.drawImage(this.buf, 0, 0);
    si.globalCompositeOperation = 'source-in'; si.fillStyle = CREAM; si.fillRect(0, 0, w, h);
    const c = (target || this.canvas).getContext('2d'), tw = (target || this.canvas).width, th = (target || this.canvas).height;
    c.clearRect(0, 0, tw, th);
    const r = Math.max(2, tw * 0.016);
    for (let i = 0; i < 8; i++) c.drawImage(this.sil, Math.cos(i * 0.785) * r, Math.sin(i * 0.785) * r, tw, th);
    c.drawImage(this.buf, 0, 0, tw, th);
  }
}
/* ── SD sheet sprite: frame animation cut from the user's class sheets ── */
const SHEET_FPS = { idle: 7, move: 12, attack: 13, skill: 12, hit: 14 };
const AURA = { warrior: '#ff6b5e', mage: '#a78bfa', knight: '#ffd24a', duelist: '#ff5b5b', sorcerer: '#c084fc', sage: '#8fd3ff' };
/** how long a one-shot state plays (seconds at ×1) */
export const sheetAnimLen = (design, st) => { const m = sheet(design); return m && m.anim[st] ? m.anim[st].length / SHEET_FPS[st] : 0.4; };
/** Wide canvas (effects and trails fit), feet at 90% height, idle character 62% of the height. Frames face left. */
export class SheetSprite {
  constructor(design, tier = 1, px = 300) {
    this.d = design; this.m = sheet(design); this.tier = tier;
    this.h = px; this.w = Math.round(px * 1.5); this.facesLeft = true; this.key = '';
    this.canvas = document.createElement('canvas'); this.canvas.width = this.w; this.canvas.height = this.h;
  }
  /** a: { st: idle|move|attack|skill|hit, el: seconds in state, flip, dead, hit 0..1 }; returns true when the canvas changed */
  draw(t, a = {}) {
    const m = this.m, atlas = m && sheetImg(this.d, m.atlas.f); if (!atlas) return false;
    let st = a.dead ? 'hit' : a.st && m.anim[a.st] ? a.st : 'idle';
    const fr = m.anim[st], n = fr.length;
    let k;
    if (a.dead) k = n - 1;
    else if (st === 'idle') k = Math.floor(t * SHEET_FPS.idle + this.tier * 1.7) % n;
    else if (st === 'move') k = Math.floor((a.el || 0) * SHEET_FPS.move) % n;
    else k = Math.min(n - 1, Math.floor((a.el || 0) * SHEET_FPS[st]));
    const flash = a.hit > 0.05 && !a.dead ? Math.round(a.hit * 4) : 0;
    const key = `${st}${k}${a.flip ? 1 : 0}${a.dead ? 1 : 0}${flash}`;
    if (key === this.key) return false;
    this.key = key;
    const c = this.canvas.getContext('2d'), W = this.w, H = this.h, s = (H * 0.62) / m.charH;
    const [x, y, w, h, ax, ay] = fr[k];
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    if (this.tier >= 3) { // promoted classes: a soft aura behind the feet
      const g = c.createRadialGradient(W / 2, H * 0.62, 4, W / 2, H * 0.62, H * (0.3 + 0.04 * this.tier));
      g.addColorStop(0, (AURA[this.d] || '#ffd24a') + '66'); g.addColorStop(1, (AURA[this.d] || '#ffd24a') + '00');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (a.flip) { c.translate(W, 0); c.scale(-1, 1); }
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(atlas, x, y, w, h, W / 2 - ax * s, H * 0.9 - ay * s, w * s, h * s);
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (flash) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(255,255,255,${0.16 * flash})`; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
    if (a.dead) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(70,72,90,.55)'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
    return true;
  }
}
const tierOf = (cls) => { const c = CLASSES.find((x) => x.key === cls); return c ? c.tier : 1; };
export const sheetSpriteFor = (cls, px) => { const d = designOf(cls); return d && sheet(d) ? new SheetSprite(d, tierOf(cls), px) : null; };

/** one-off avatar render used by UI cards */
export function renderAvatar(canvas, unit, mob, t = 0) {
  const ctx = canvas.getContext('2d');
  if (unit.kind === 'pet') { if (mob) drawPet(ctx, canvas.width, canvas.height, mob); return; }
  if (unit.kind === 'mob') { if (mob) drawMob(ctx, canvas.width, canvas.height, mob); return; }
  // heroes: the idle (대기) frames of the SD class sheet, mirrored to face right like the rest of the UI
  const d = designOf(unit.cls), m = d && sheet(d), atlas = m && sheetImg(d, m.atlas.f);
  if (atlas) {
    const fr = m.anim.idle, [x, y, w, h, ax, ay] = fr[Math.floor(t * 7) % fr.length];
    const W = canvas.width, H = canvas.height, wide = Math.max(...fr.map((f) => Math.max(f[4], f[2] - f[4]))) * 2;
    const s = Math.min((H * 0.8) / m.charH, W / wide);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H); ctx.imageSmoothingQuality = 'high';
    ctx.translate(W, 0); ctx.scale(-1, 1);
    ctx.drawImage(atlas, x, y, w, h, W / 2 - ax * s, H * 0.96 - ay * s, w * s, h * s);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return;
  }
  const key = unit.cls + '|' + (unit.name || '');
  let sp = canvas._sprite;
  if (!sp || canvas._key !== key) { sp = new HeroSprite(unit.cls, unit.name || '', 200); canvas._sprite = sp; canvas._key = key; }
  sp.draw(t, {}, canvas);
}
