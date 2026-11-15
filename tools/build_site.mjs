// Copies the files the site needs into ./public (the folder Render publishes). No bundling, no dependencies.
//   node tools/build_site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public');
const INCLUDE = ['index.html', 'manifest.webmanifest', 'CREDITS.md', 'css', 'js', 'assets', 'vendor'];
const SKIP = (rel) => /\.report\.txt$/.test(rel) || /(^|[\\/])_raw([\\/]|$)/.test(rel);

fs.rmSync(OUT, { recursive: true, force: true });
let files = 0, bytes = 0;
function copy(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) throw new Error('missing ' + rel);
  if (SKIP(rel)) return;
  if (fs.statSync(src).isDirectory()) { for (const f of fs.readdirSync(src)) copy(path.join(rel, f)); return; }
  const dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  files++; bytes += fs.statSync(src).size;
}
for (const rel of INCLUDE) copy(rel);
console.log(`public/: ${files} files, ${(bytes / 1024).toFixed(0)} KB`);
