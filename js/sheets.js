// SD class sprites cut from the user's asset sheets (tools/extract_sheets.py → assets/sheets).
// 6 designs cover the 18 classes by line: 전사 · 마법사 · 기사 계열 · 투사 계열 · 주술사 계열 · 현자 계열.
const BASE = new URL('../assets/sheets/', import.meta.url);
let man = null;
const imgs = new Map();
const load = (d, f) => new Promise((res) => {
  const im = new Image();
  im.onload = () => { imgs.set(d + '/' + f, im); res(im); };
  im.onerror = () => res(null);
  im.src = new URL(d + '/' + f, BASE).href;
});
export async function loadSheets() {
  try { const r = await fetch(new URL('manifest.json', BASE)); if (!r.ok) return; man = await r.json(); } catch (e) { return; }
  await Promise.all(Object.entries(man.designs).flatMap(([d, m]) => [m.atlas.f, m.master.f, m.faces.f, ...m.turn.map((t) => t.f), ...m.fx.map((x) => x.f)].map((f) => load(d, f))));
  window.dispatchEvent(new Event('sxs-art'));
}
export const designOf = (cls) => (man && man.classes[cls]) || null;
export const sheet = (d) => (man && man.designs[d]) || null;
export const sheetImg = (d, f) => imgs.get(d + '/' + f) || null;
export const sheetURL = (d, f) => new URL(d + '/' + f, BASE).href;
export const sheetsReady = () => !!man && imgs.size > 0;

/* expression index by battle mood (labels differ a little per sheet: 투사 has 집중·피로·교만·투지) */
export function faceIndex(design, mood) {
  const m = sheet(design); if (!m) return 0;
  const L = m.faces.labels, at = (...names) => { for (const n of names) { const i = L.indexOf(n); if (i >= 0) return i; } return 0; };
  switch (mood) {
    case 'joy': return at('웃음');
    case 'cast': return at('신남');
    case 'focus': return at('집중', '결의', '감탄', '신남');
    case 'hit': return at('놀람');
    case 'panic': return at('당황');
    case 'angry': return at('투지', '화남');
    case 'down': return at('피로', '졸림', '슬픔');
    case 'sad': return at('슬픔', '피로');
    default: return 0;
  }
}
