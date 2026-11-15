// GPT 6.1 sol designs the cel-shaded 3D models (assets/toon/<id>.json) as primitive part lists, js/toon.js assembles them.
//   node tools/gen_toon.mjs [--only id,id] [--force] [--jobs 6] [--model gpt-6.1-sol]
// Heroes get the user's SD sheet (art_src/toonref/<design>.png: master model + turnaround) attached as the reference image.
// Each model is one `codex exec` call (read-only sandbox, empty working dir); the JSON reply is validated, retried once on errors.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'toon');
const REF = path.join(ROOT, 'art_src', 'toonref');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const MODEL = arg('model', 'gpt-6.1-sol'), JOBS = +arg('jobs', 6), FORCE = !!arg('force', false);
const ONLY = arg('only', '') ? String(arg('only', '')).split(',') : null;

const SHAPES = `SHAPES (every shape is centred on its "p" position; "s" is its size, "r" its rotation in DEGREES [x,y,z]):
- "sphere": ellipsoid, s = [radiusX, radiusY, radiusZ]
- "half": top half of an ellipsoid (dome, flat side down), s = radii — good for hair caps, helmets, mushroom caps, domes
- "box": s = [width X, height Y, depth Z]
- "cyl": cylinder / frustum along Y, s = [topRadius, height, bottomRadius]
- "cone": cone along +Y (point up), s = [radiusX, height, radiusZ]; "spike": 6-sided cone; "pyramid": 4-sided cone (gems, crystals, ears)
- "capsule": rounded tube along Y, s = [radius, straightLength, radius]
- "torus": ring in the XY plane, s = [ringRadius, tubeRadius, depthScale]
- "disc": flat cylinder along Y, s = [radiusX, thickness, radiusZ]
- "cape": a curved sheet (open cylinder arc) hanging along Y, curving around the BACK (-Z) side, s = [radius, height, arcDegrees]
PART FIELDS: {"bone","shape","s","p","r","c","mirror","glow","face","outline"}
- "c": a palette key or a "#rrggbb" colour. "glow": true for glowing, unlit bits (gems, flames, magic orbs, eyes of monsters). "outline": false only for tiny details.
- "mirror": true duplicates the part mirrored to the other side (x → -x, and a bone ending in L ↔ R). Use it for every left/right pair; give only the LEFT one (x > 0).
STYLE: cute cel-shaded toy figure, chunky readable silhouettes, smooth rounded forms (prefer spheres / capsules over boxes for anything organic), a few strong accents. The renderer adds toon shading and black ink outlines.`;

const HERO_RIG = `HERO SKELETON (fixed; positions are relative to the parent bone, in metres; the model faces +Z, +X is the model's LEFT side):
root [0,0,0] → hips [0,0.5,0]
  hips → legL [0.12,0,0], legR [-0.12,0,0]   (legs hang DOWN from the hip pivot; the feet touch the ground at bone-local y = -0.5)
  hips → chest [0,0.06,0]   (torso from chest-local y ≈ -0.1 to +0.34)
    chest → head [0,0.42,0]   (neck pivot; the HEAD is a big chibi sphere centred at head-local [0,0.36,0], radii about [0.40,0.37,0.38])
    chest → armL [0.22,0.34,0], armR [-0.22,0.34,0]   (shoulder pivots; arms hang DOWN about 0.34)
      armL → handL [0.02,-0.34,0.02], armR → handR [-0.02,-0.34,0.02]   (hands; items held in a hand point FORWARD along +Z from the hand)
    chest → back [0,0.3,-0.14]   (capes, quivers, wings, things on the back)
RULES: exactly ONE part has "face": true — the head sphere (bone "head", p ≈ [0,0.36,0]); the renderer paints big anime eyes on its front at head-local y 0.30–0.42, so keep hair OFF the face front below head-local y 0.5 (bangs may hang from above y 0.5, side locks at |x| > 0.3). Hair should be voluminous and characterful (cap + bangs + side locks + back hair + ponytail / braids / ahoge as in the reference). The main weapon is held in handR (bone "handR"); an off-hand item (shield, second blade, book) in handL. Give the full body: legs with boots, torso, skirt / coat, arms, hands, head, hair, accessories, weapon(s). 30–60 parts.`;

const HERO_EXAMPLE = fs.readFileSync(path.join(ROOT, 'tools', 'toon_example_hero.json'), 'utf8').replace(/\s*\n\s*/g, ' ');

const HERO = (design, what, style) => `Design a cel-shaded 3D chibi game hero as a JSON part list for a three.js renderer.
REFERENCE: the attached image is the official SD design (master model on the left, turnaround front / 3/4 / side / back views on the right). Match its hair style and colour, eye colour, outfit layers, colours, accessories and weapon as closely as primitive shapes allow.
CHARACTER: ${what}
${HERO_RIG}
${SHAPES}
OUTPUT: ONLY one JSON object, no markdown, no comments:
{"id":"${design}","kind":"hero","style":"${style}","palette":{ "key":"#hex", ... },"eyes":{"color":"#hex iris colour"},"parts":[ ... ]}
"style" is fixed to "${style}". Use descriptive palette keys (skin, hair, hairShade, coat, trim, metal, ...).
FORMAT EXAMPLE (a different character, for structure and scale only — do not copy its look): ${HERO_EXAMPLE}`;

const CREATURE_EXAMPLE = JSON.stringify({ id: 'boar', kind: 'creature', palette: { MAIN: '#b5694a', LIGHT: '#e0a27f', DARK: '#7a3f28' }, bones: [{ name: 'body', parent: 'root', p: [0, 0.55, 0] }, { name: 'head', parent: 'body', p: [0, 0.12, 0.42] }, { name: 'legFL', parent: 'body', p: [0.2, -0.15, 0.25] }, { name: 'legBL', parent: 'body', p: [0.2, -0.15, -0.25] }, { name: 'legFR', parent: 'body', p: [-0.2, -0.15, 0.25] }, { name: 'legBR', parent: 'body', p: [-0.2, -0.15, -0.25] }, { name: 'tail', parent: 'body', p: [0, 0.1, -0.5] }],
  parts: [{ bone: 'body', shape: 'sphere', s: [0.42, 0.36, 0.55], p: [0, 0, 0], r: [0, 0, 0], c: 'MAIN' }, { bone: 'body', shape: 'sphere', s: [0.32, 0.22, 0.4], p: [0, -0.12, 0.05], r: [0, 0, 0], c: 'LIGHT' }, { bone: 'head', shape: 'sphere', s: [0.3, 0.28, 0.3], p: [0, 0, 0.1], r: [0, 0, 0], c: 'MAIN' }, { bone: 'head', shape: 'cyl', s: [0.12, 0.12, 0.14], p: [0, -0.06, 0.38], r: [90, 0, 0], c: 'LIGHT' }, { bone: 'head', shape: 'spike', s: [0.04, 0.22, 0.04], p: [0.12, -0.02, 0.36], r: [-60, 0, -20], c: '#f3ead2', mirror: true }, { bone: 'head', shape: 'sphere', s: [0.07, 0.08, 0.04], p: [0.13, 0.08, 0.32], r: [0, 0, 0], c: '#ffffff', mirror: true }, { bone: 'head', shape: 'sphere', s: [0.04, 0.05, 0.03], p: [0.13, 0.07, 0.35], r: [0, 0, 0], c: '#1d1520', mirror: true }, { bone: 'legFL', shape: 'capsule', s: [0.08, 0.16, 0.08], p: [0, -0.18, 0], r: [0, 0, 0], c: 'DARK', mirror: true }, { bone: 'legBL', shape: 'capsule', s: [0.08, 0.16, 0.08], p: [0, -0.18, 0], r: [0, 0, 0], c: 'DARK', mirror: true }, { bone: 'tail', shape: 'capsule', s: [0.03, 0.18, 0.03], p: [0, 0, -0.08], r: [-60, 0, 0], c: 'DARK' }],
  anim: { hover: 0, idle: [{ bone: 'tail', axis: 'z', amp: 0.4, freq: 1.5, phase: 0 }, { bone: 'head', axis: 'x', amp: 0.05, freq: 0.6, phase: 0 }], move: [{ bone: 'legFL', axis: 'x', amp: 0.7, freq: 2.2, phase: 0 }, { bone: 'legBR', axis: 'x', amp: 0.7, freq: 2.2, phase: 0 }, { bone: 'legFR', axis: 'x', amp: 0.7, freq: 2.2, phase: 3.14 }, { bone: 'legBL', axis: 'x', amp: 0.7, freq: 2.2, phase: 3.14 }], attack: [{ bone: 'head', axis: 'x', amp: 0.5 }], skill: [{ bone: 'head', axis: 'x', amp: -0.6 }, { bone: 'body', axis: 'x', amp: -0.2 }] } });

const CREATURE_RULES = (big) => `CREATURE RIG: you define the bones. {"name","parent","p"}: "parent" is "root" or an earlier bone; "p" is the pivot position relative to the parent (metres). The creature faces +Z, +X is its LEFT side, the ground is y = 0 (feet / lowest point touch y = 0 unless it hovers). Overall size about ${big ? '2.0 m tall and up to 2.4 m long/wide (it is a boss: impressive, detailed, 45–80 parts)' : '1.4 m tall and up to 1.6 m long/wide (18–45 parts)'}. A bone named "body" is required. Up to 22 bones (legs, arms, head / jaw, neck segments, tail segments, wings, tentacles, ears...). Pivot each limb where it joins the body so rotating the bone swings it naturally.
EYES: model them as parts (white sphere + dark pupil + tiny white highlight; or "glow": true for glowing eyes). Cute but a little fierce.
ANIM (procedural, all angles in radians, freq in Hz): {"hover": metres above ground for flyers / floaters (0 for walkers), "idle":[{"bone","axis":"x|y|z","amp","freq","phase"}], "move":[same, e.g. legs swinging in alternating phase, wings flapping], "attack":[{"bone","axis","amp"} — the strike motion: e.g. head / jaw / arm / tail lunging], "skill":[{"bone","axis","amp"} — a bigger special move]}.`;

const CREATURE = (id, what, recolor, big) => `Design a cel-shaded 3D monster for a cute chibi tactics game as a JSON part list for a three.js renderer.
MONSTER: ${what}
${recolor ? 'COLOURS: the main body colours must use exactly these palette keys so the game can recolour the monster per variant: "MAIN" (main body), "LIGHT" (belly / highlights / lighter areas), "DARK" (shade, markings, hooves, darker areas). Set the palette to {"MAIN":"#b5694a","LIGHT":"#e0a27f","DARK":"#7a3f28"}; besides these keys you may use fixed "#hex" colours for eyes, teeth, horns, metal, flames, gems.' : 'COLOURS: choose a striking fixed palette (keys of your choice) that fits the description.'}
${CREATURE_RULES(big)}
${SHAPES}
OUTPUT: ONLY one JSON object, no markdown, no comments:
{"id":"${id}","kind":"creature","palette":{...},"bones":[...],"parts":[...],"anim":{...}}
FORMAT EXAMPLE (a simple boar, for structure and scale only — your monster should be richer): ${CREATURE_EXAMPLE}`;

/* ── targets ── */
const HEROES = {
  warrior: ['전사 (Warrior): silver-white short messy hair with a red ribbon, red eyes, light silver plate armour over a red-and-dark tunic, a long red cape with gold cross embroidery, armoured gloves and greaves, a straight longsword with a gold guard', 'sword'],
  mage: ['마법사 (Mage): long wavy dark-purple hair, round glasses, violet eyes, a big purple witch hat with gold trim, stars and a tassel, purple-and-white layered robe with gold patterns, a long golden staff topped with a glowing violet crystal inside a gold ring', 'staff'],
  knight: ['기사 (Knight): blonde hair in a long side braid with blue ribbons, blue eyes, white-and-silver plate armour with gold trim, a blue cape and blue skirt with gold fleur-de-lis, a longsword and a blue kite shield with a gold cross', 'shield'],
  duelist: ['투사 (Duelist): long crimson-red hair in a high ponytail with a black ribbon, amber eyes, dark leather-and-black outfit with red accents, red scarf / sash, fingerless gloves, tall boots, TWO short swords (one in each hand)', 'dual'],
  sorcerer: ['주술사 (Sorcerer): very long silver-lavender hair, violet eyes, dark curved horns with a small skull ornament and purple bow on the head, dark purple robe with gold trim and white fur cuffs, thigh boots, an open grimoire with a glowing pentagram held in the off hand and purple flame magic', 'book'],
  sage: ['현자 (Sage): very long wavy light-blonde hair with a white flower crown and blue ribbons, green eyes, white-and-blue holy robe with gold trim, white boots, a golden staff topped with a glowing violet orb inside a gold ring, a small floating book', 'staff'],
};
const src = fs.readFileSync(path.join(ROOT, 'tools', 'gen_art.mjs'), 'utf8');
const MOBS = new Function('return ' + /const MOBS = (\{[\s\S]*?\n\});/.exec(src)[1])();
const BOSSES = {
  griffin: 'Storm Griffin (폭풍 그리핀), a legendary boss: eagle head with a hooked golden beak and fierce glowing cyan eyes, white and storm-blue feathers, a feathery crest, HUGE outspread wings with blue-white tips, lion-like body and hind legs with a tufted tail, sharp talons, crackling cyan lightning accents (glow)',
  phoenix: 'Flamoenix (불사조), a legendary boss: a fire phoenix with crimson, orange and gold plumage, a golden crest of flame feathers, long flowing tail plumes of fire, huge wings spread wide, hovering in the air, glowing flame bits (glow) along wings and tail, burning golden eyes',
  orochi: 'Yamata no Orochi (야마타노 오로치), a legendary boss: an EIGHT-headed giant serpent — eight long necks (each with its own neck bone and head bone) rising and fanning out from one massive coiled body, each head with small horns, a toothy jaw and glowing red eyes, deep teal-blue scales with a pale cream belly, water splashes',
  loong: 'Primordial Loong (태고의 용), a legendary boss: an ancient eastern dragon with a long serpentine body coiling in an S-curve (several body segments as bones), four short legs with golden claws, long whiskers, branching antlers, a flowing red mane, golden scales, a glowing pearl orb held near a claw, lightning sparks (glow)',
  mecha: 'Galactic Mecha (은하 메카), a legendary boss: a cosmic battle mech — white and navy armour plates with gold trim, a glowing cyan core in the chest, a star-shaped glowing visor, big shoulder cannons, floating thruster wing-fins with cyan glow, chunky armoured legs',
  yoldra: 'Yoldra (욜드라), a legendary boss: a twin-element dragon — the left half icy blue with crystal ice spikes, the right half crimson with flame spikes, large horns, membranous wings, a long spiked tail, glowing blue and orange eyes',
};
const jobs = [];
for (const [d, [what, style]] of Object.entries(HEROES)) jobs.push({ id: d, kind: 'hero', prompt: HERO(d, what, style), images: [path.join(REF, d + '.png')] });
for (const [k, what] of Object.entries(BOSSES)) jobs.push({ id: 'boss_' + k, kind: 'creature', prompt: CREATURE('boss_' + k, what, false, true), images: [] });
for (const [k, what] of Object.entries(MOBS)) jobs.push({ id: 'mob_' + k, kind: 'creature', prompt: CREATURE('mob_' + k, what, true, false), images: [] });

/* ── validation ── */
const HERO_BONES = ['root', 'hips', 'legL', 'legR', 'chest', 'head', 'armL', 'armR', 'handL', 'handR', 'back'];
const SHAPE_SET = new Set(['sphere', 'half', 'box', 'cyl', 'cone', 'spike', 'pyramid', 'capsule', 'torus', 'disc', 'cape']);
const v3 = (a, lim) => Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === 'number' && isFinite(x) && Math.abs(x) <= lim);
function validate(j, kind) {
  if (!j || typeof j !== 'object') return 'not an object';
  if (j.kind !== kind) return `kind must be ${kind}`;
  if (!Array.isArray(j.parts) || j.parts.length < 10 || j.parts.length > 110) return 'parts count out of range';
  let bones = HERO_BONES;
  if (kind === 'creature') {
    if (!Array.isArray(j.bones) || j.bones.length < 1 || j.bones.length > 26) return 'bones count out of range';
    const names = new Set(['root']);
    for (const b of j.bones) { if (!b.name || names.has(b.name)) return 'bad/duplicate bone ' + b.name; if (!names.has(b.parent || 'root')) return `bone ${b.name} parent ${b.parent} must be defined earlier`; if (!v3(b.p, 4)) return 'bad bone p ' + b.name; names.add(b.name); }
    if (!names.has('body')) return 'missing body bone';
    bones = [...names];
    const A = j.anim || {}; for (const k of ['idle', 'move', 'attack', 'skill']) if (A[k] && !Array.isArray(A[k])) return 'anim.' + k + ' must be a list';
  }
  let faces = 0;
  for (const p of j.parts) {
    if (!bones.includes(p.bone)) return 'unknown bone ' + p.bone;
    if (!SHAPE_SET.has(p.shape)) return 'unknown shape ' + p.shape;
    if (!v3(p.s, p.shape === 'cape' ? 360 : 4) || !v3(p.p, 4) || !v3(p.r || [0, 0, 0], 720)) return 'bad s/p/r on a ' + p.shape + ' at ' + p.bone;
    if (p.face) faces++;
  }
  if (kind === 'hero' && faces !== 1) return 'exactly one face part is required';
  return null;
}

/* ── runner ── */
fs.mkdirSync(path.join(OUT, '_raw'), { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sxs-toon-'));
const todo = jobs.filter((j) => (!ONLY || ONLY.includes(j.id)) && (FORCE || !fs.existsSync(path.join(OUT, j.id + '.json'))));
function runOne(job, attempt = 1, fix = '') {
  return new Promise((resolve) => {
    const raw = path.join(OUT, '_raw', job.id + '.txt'), t0 = Date.now();
    const args = ['exec', '-m', MODEL, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-C', work, '-o', raw, ...job.images.filter((f) => fs.existsSync(f)).map((f) => `--image=${f}`), '-'];
    const child = spawn('codex', args, { shell: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; child.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    const timer = setTimeout(() => child.kill(), 12 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      let ok = false, why = 'exit ' + code;
      try {
        const txt = fs.readFileSync(raw, 'utf8'), a = txt.indexOf('{'), b = txt.lastIndexOf('}');
        const j = JSON.parse(txt.slice(a, b + 1));
        const bad = validate(j, job.kind);
        if (bad) why = 'invalid: ' + bad;
        else { j.id = job.id; fs.writeFileSync(path.join(OUT, job.id + '.json'), JSON.stringify(j)); ok = true; why = j.parts.length + ' parts' + (j.bones ? ', ' + j.bones.length + ' bones' : ''); }
      } catch (e) { why += ' / ' + e.message.slice(0, 120) + ' / ' + err.slice(-200).replace(/\s+/g, ' '); }
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${job.id} (${((Date.now() - t0) / 1000).toFixed(0)}s, try ${attempt}) ${why}`);
      if (!ok && attempt < 3) resolve(runOne(job, attempt + 1, why)); else resolve(ok);
    });
    child.stdin.end(job.prompt + (fix ? `\n\nYOUR PREVIOUS ANSWER WAS REJECTED (${fix}). Fix that and answer again with only the JSON.` : ''));
  });
}
console.log(`designing ${todo.length} of ${jobs.length} toon models with ${MODEL}, ${JOBS} at a time`);
let next = 0, okN = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, async () => { while (next < todo.length) { const j = todo[next++]; if (await runOne(j)) okN++; } }));
console.log(`done: ${okN}/${todo.length} ok`);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(fs.readdirSync(OUT).filter((f) => f.endsWith('.json') && f !== 'index.json').map((f) => f.replace(/\.json$/, ''))));
