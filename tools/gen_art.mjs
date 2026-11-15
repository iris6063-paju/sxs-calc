// Generates the character / monster sprites with GPT (Codex CLI) and saves them as SVG files.
//   node tools/gen_art.mjs [--only id,id] [--force] [--jobs 4] [--model gpt-6.1-sol]
// Each sprite is one `codex exec` call (read-only sandbox, empty working dir); the reply is saved raw and the <svg> is extracted.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'gpt');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1] === undefined || process.argv[i + 1].startsWith('--') ? true : process.argv[i + 1]; };
const MODEL = arg('model', 'gpt-6.1-sol'), JOBS = +arg('jobs', 4), FORCE = !!arg('force', false);
const ONLY = arg('only', '') ? String(arg('only', '')).split(',') : null;

const STYLE = `STYLE: cute chibi "paper sticker" game sprite. Flat colour fills with one darker shade tone for simple cel shading. Every shape has a dark brown outline (stroke="#2a1b14" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"). Bold, readable silhouette; charming and a little heroic.
RULES: output ONE standalone SVG and nothing else (start with <svg, end with </svg>). Allowed elements only: svg, g, path, circle, ellipse, rect, polygon, polyline, line. No text, no <style>, no <script>, no <defs>, no gradients, no filters, no <image>, no <use>, no external references, no background rectangle, no XML comments. Keep the whole SVG under 7000 characters.`;

const HERO = (who, palette) => `Draw a game hero sprite.
${STYLE}
CANVAS: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240">. The hero stands with the feet on y=222, centred on x=100, facing RIGHT in a 3/4 view, fully inside the canvas with about 8px margin. Chibi proportions: the head is big (about 40% of the height), the body small.
LAYERS (required; exactly these four groups, in this order, as direct children of <svg>):
1. <g id="back"> — things behind the body: cape, back hair, anything carried on the back or in the far hand that sits behind the torso.
2. <g id="body"> — legs, torso, both arms (the near arm ends at the weapon hand), and a shield if the hero has one.
3. <g id="head"> — head, face (two tall oval eyes with a small white highlight each, light blush, tiny smile), hair / helmet / hat.
4. <g id="weapon" data-pivot="X,Y"> — the item held in the near (front) hand, drawn in a resting pose pointing up and slightly forward (to the right). Include the gripping hand. X,Y must be the hand position in canvas coordinates (around x=128..140, y=140..160).
HERO: ${who}
PALETTE: ${palette}. Skin #ffd9b8. Keep the outline colour #2a1b14.`;

const MOB = (what) => `Draw a game monster sprite.
${STYLE}
CANVAS: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">. The creature stands on y=188, centred on x=100, facing LEFT, and fills most of the canvas (about 12px margin). Wrap everything in a single <g id="body">.
COLOURS: the creature's main body colours must be EXACTLY these three placeholder colours so the game can recolour it: MAIN #b5694a, LIGHT #e0a27f (belly / highlights), DARK #7a3f28 (shade / markings). Besides them you may use white #ffffff, the outline #2a1b14, a bright accent #ffd24a, and pink #ff9aa8 for a mouth or blush. Eyes: cute but a little fierce.
CREATURE: ${what}`;

const P = (main, dark, light, accent, cape) => `main ${main}, dark ${dark}, light ${light}, accent ${accent}, cape/secondary ${cape}`;
const HEROES = {
  Zhanshi: ['a young Warrior: light steel-blue armour over a tunic, short messy hair with a red headband, a red scarf, holding a straight broadsword; a small round shield strapped to the far arm', P('#7f97b8', '#3b4a63', '#cfd9e6', '#d8483a', '#b33a30')],
  Fashi: ['an apprentice Mage: blue robe with a gold belt, a soft pointy blue wizard hat with a gold band, holding a wooden staff topped with a glowing pale-blue orb', P('#5b78d6', '#27346b', '#dfe7ff', '#f2c14e', '#3c56ad')],
  Huwei: ['a Knight: rounded silver-blue plate armour, a helmet with an open visor and a blue plume, a blue cape, holding a knightly sword; a blue kite shield with a white cross on the far arm', P('#8fa6c9', '#33415c', '#e3ebf5', '#3f7fd9', '#2f5fae')],
  Doushi: ['a Duelist: agile fighter in a crimson sleeveless tunic with a dark sash, spiky hair, a long white headband whose tails flutter behind, holding a curved katana', P('#c8483f', '#4a1e1e', '#f0d7c8', '#2b2b33', '#7d2622')],
  Shushi: ['a Sorcerer: violet robe scattered with small gold stars, a wide-brimmed pointy witch hat, holding a staff topped with a gold star crystal', P('#8b5fd6', '#3a2470', '#efe3ff', '#ffd75a', '#6a41b3')],
  Xianzhe: ['a Sage: cream robe under a green hooded cloak (hood up), a leaf brooch, gentle face, holding a short wand with a green gem; a small open spellbook tucked under the far arm', P('#6fae5c', '#2c4a27', '#eef7e2', '#f3e2a0', '#4d8a41')],
  Dunjiashi: ['a Paladin: heavy white-and-gold plate armour, a winged helmet, a gold-trimmed white cape, holding a broad holy sword; a tall tower shield with a gold sun emblem on the far arm', P('#e9e2cf', '#6b5b3e', '#fffaf0', '#e0aa2e', '#b98a1f')],
  Kuangzhanshi: ['a Berserker: wild fighter in dark red and black with a fur collar, a horned helmet, bare arms with wraps, holding a huge jagged greatsword', P('#8f2a2a', '#2a1414', '#e8c7b0', '#e86a2a', '#541515')],
  Modaoshi: ['an Archmage: deep-blue layered robe with cyan trim, a tall elegant wizard hat with a cyan gem, long white-blue hair, holding a long staff with a floating cyan crystal', P('#2f6fc4', '#12305c', '#d6ecff', '#63e0ff', '#1f4f93')],
  Mishushi: ['an Arcanist: indigo hooded robe with silver runes, a silver half-mask, holding a wand tipped with a silver-violet orb; a small floating tome beside the far shoulder (put the tome in the back layer)', P('#5560c2', '#20254f', '#e2e5ff', '#c8d2ff', '#3b4496')],
  Shouhuzhe: ['a Guardian: massive teal-and-gold fortress armour with big rounded pauldrons, a crown-like helm, a teal cape, holding a short broad blade; a huge round-topped great shield on the far arm', P('#59b8b0', '#1f4d55', '#d9f5f0', '#f0c04a', '#2c8f8a')],
  Zhengfuzhe: ['a Conqueror: orange-and-black armour with gold edges, a tattered black cape, swept-back hair with a gold circlet, holding a blazing flame-bladed sword', P('#e08a2e', '#3a2414', '#f6dcc0', '#ffd24a', '#a8531a')],
  Huimiezhe: ['a Destroyer: crimson-and-orange battle robe with flame patterns, a pointed hat whose tip burns like a flame, holding a staff topped with a fire orb', P('#d1483a', '#4f1717', '#ffe1d1', '#ffb13a', '#9c2f26')],
  Zhangkongzhe: ['a Dominator: dark-violet robe with magenta lining, a hood with two small curved horns, a mysterious smile, holding a sceptre topped with a dark magenta orb', P('#7a3fa8', '#2a1340', '#f0dcff', '#ff6ad5', '#55297a')],
  LegendShouhuzhe: ['an Oath Paladin: ivory armour with crimson and gold trim, a small golden halo behind the helmet (halo in the back layer), a crimson cape, holding a radiant holy longsword; an ornate shield on the far arm', P('#f3ead8', '#6e2b2b', '#ffffff', '#c9302c', '#8f1f24')],
  LegendZhengfuzhe: ['a Dawnbringer: sleek purple-black armour with glowing red seams, a long dark scarf, silver hair, holding a great curved dawn-blade with a red edge', P('#5a3a86', '#1c1230', '#e7d6f2', '#e0453a', '#35204f')],
  LegendHuimiezhe: ['a Darkmoon Mage: dark teal robe with gold crescents, a hat shaped like a crescent moon, holding a staff topped with a golden crescent moon', P('#2aa6a0', '#104548', '#d7fbf6', '#ffd24a', '#1b7873')],
  LegendZhangkongzhe: ['an Arcane Sage: midnight-blue and gold star-patterned robe, a gold circlet, long hair, holding a star-tipped wand; a glowing star tome floating beside the far shoulder (tome in the back layer)', P('#2b3470', '#0f1330', '#dfe3ff', '#ffd24a', '#1b2150')],
};
const MOBS = {
  wolf: 'a wolf-folk warrior standing upright: pointed ears, bushy tail, tribal loincloth, holding a crude club',
  wolfmage: 'a hooded wolf-folk shaman: long hooded cloak, glowing eyes under the hood, a gnarled staff with a dangling charm',
  boar: 'a stocky wild boar on four legs with big curved tusks and a bristly mane',
  rabbit: 'a fierce rabbit with long ears and one oversized blade-like front tooth, hopping pose',
  spider: 'a round spider with eight legs, several shiny eyes and a patterned abdomen',
  owl: 'a plump owl with big round eyes, small ear tufts and spread wings',
  mantis: 'a praying mantis with two large sickle arms raised, triangular head',
  bear: 'a big bear warrior standing upright with a shoulder strap, claws out, roaring',
  golem: 'a rock golem: body of stacked boulders, tiny head with glowing eyes, huge fists, a little moss',
  crab: 'a crab with two big claws raised, eyes on stalks, small steam puffs',
  eagle: 'a mechanical eagle: riveted metal feathers, a gear on the chest, sharp beak, wings spread',
  snake: 'a coiled snake rearing up with its tongue out, patterned scales',
  rodent: 'a small alert meerkat-like rodent standing upright with a tiny helmet and a pickaxe',
  cactus: 'a round cactus monster with two arm-like branches, spines, a small flower on top and an angry face',
  scorpion: 'a scorpion with big pincers and a raised stinger tail',
  dino: 'a mechanical tyrannosaur: plated metal body, bolts, small arms, big jaw with teeth',
  bull: 'a muscular bull with large curved horns, a nose ring and gemstones on its back, pawing the ground',
  slime: 'a jiggly slime blob with a shiny highlight, two eyes, a happy-evil smile and a little drip on top',
  ogre: 'a one-eyed cyclops ogre with a big belly, one horn and a stone club',
  frog: 'a chunky frog sitting, wide mouth, bulging eyes, spots on its back',
  ghost: 'a floating paper-lantern ghost: a round paper lantern body with one big eye, a long tongue and a small flame inside',
  fish: 'a fish soldier standing on its tail fins, holding a small trident, fins flared',
  shell: 'a spiral sea-shell creature with two eyes peeking out and small feet',
  fox: 'a slender fox spirit with several fluffy tails and a small wisp of flame',
  octopus: 'a bulbous sea-monk octopus with a big dome head, heavy brows and curling tentacles',
  beetle: 'a rhinoceros beetle wearing samurai-style armour plates, big horn, standing proud',
  plant: 'a carnivorous vine plant: a big toothy flower-bulb head on a twisting vine with leafy arms',
  imp: 'a mischievous little imp with small horns, bat wings and a pointed tail',
  tengu: 'a crow tengu: a bird-headed warrior with black wings, a small cap and a fan',
  spirit: 'an elemental thunder spirit: a floating cloud-like body with small arms, a swirl tail and sparks',
  turtle: 'a kappa-like turtle creature standing upright: shell on its back, a small dish on its head, a beak',
  knight: 'a hollow armoured general: bulky ornate armour with a horned helmet, glowing eyes in the visor, a great halberd',
  doll: 'a ragged puppet / scarecrow doll with button eyes, stitched mouth, straw poking out and dangling strings',
  deer: 'a deer with large branching antlers that glow slightly, standing alert',
  lion: 'a guardian lion with a thick curly mane, a bell on its collar and one paw raised',
  relic: 'an animated ancient bronze vessel: a three-legged bronze cauldron with a fierce face mask on the front and a little smoke rising',
  ape: 'a big ape with long arms, knuckles on the ground, a serious face',
  bomb: 'a round bomb-shaped stink creature with a lit fuse, little feet, squinting eyes and stink waves',
  bee: 'a bee-like wasp creature with a big stinger, translucent wings and striped abdomen',
  goat: 'a mountain goat with four long curved horns and a shaggy beard',
  dragon: 'a small proud dragon with horns, wings folded, a long whiskered snout and a gem on its forehead',
  hound: 'a fierce hound with spiky fur along its back and small flames at its paws',
};

const jobs = [];
for (const [k, [who, pal]] of Object.entries(HEROES)) jobs.push({ id: 'hero_' + k, prompt: HERO(who, pal), need: ['id="back"', 'id="body"', 'id="head"', 'id="weapon"', 'data-pivot'] });
for (const [k, what] of Object.entries(MOBS)) jobs.push({ id: 'mob_' + k, prompt: MOB(what), need: ['id="body"', '#b5694a'] });
const todo = jobs.filter((j) => (!ONLY || ONLY.includes(j.id)) && (FORCE || !fs.existsSync(path.join(OUT, j.id + '.svg'))));
fs.mkdirSync(path.join(OUT, '_raw'), { recursive: true });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sxs-gpt-'));

function runOne(job, attempt = 1) {
  return new Promise((resolve) => {
    const raw = path.join(OUT, '_raw', job.id + '.txt');
    const t0 = Date.now();
    const child = spawn('codex', ['exec', '-m', MODEL, '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-C', work, '-o', raw, '-'], { shell: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; if (err.length > 4000) err = err.slice(-4000); });
    const timer = setTimeout(() => child.kill(), 8 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      let ok = false, why = 'exit ' + code;
      try {
        const txt = fs.readFileSync(raw, 'utf8');
        const m = /<svg[\s\S]*<\/svg>/.exec(txt);
        if (!m) why = 'no svg in reply';
        else if (/<script|<style|<image|<foreignObject|href=/i.test(m[0])) why = 'disallowed content';
        else { const miss = job.need.filter((n) => !m[0].includes(n)); if (miss.length) why = 'missing ' + miss.join(','); else { fs.writeFileSync(path.join(OUT, job.id + '.svg'), m[0]); ok = true; why = m[0].length + ' chars'; } }
      } catch (e) { why += ' / ' + e.message + ' / ' + err.slice(-300).replace(/\s+/g, ' '); }
      console.log(`${ok ? 'OK  ' : 'FAIL'} ${job.id} (${((Date.now() - t0) / 1000).toFixed(0)}s, try ${attempt}) ${why}`);
      if (!ok && attempt < 2) resolve(runOne(job, attempt + 1)); else resolve(ok);
    });
    child.stdin.end(job.prompt);
  });
}
console.log(`generating ${todo.length} of ${jobs.length} sprites with ${MODEL}, ${JOBS} at a time`);
let next = 0, okN = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, todo.length) }, async () => { while (next < todo.length) { const j = todo[next++]; if (await runOne(j)) okN++; } }));
console.log(`done: ${okN}/${todo.length} ok`);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(fs.readdirSync(OUT).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, ''))));
