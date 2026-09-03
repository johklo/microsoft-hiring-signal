/**
 * Downloads the Archivo variable font from Google Fonts into public/fonts so
 * the dashboard renders identically with no network access.
 * Run once: node src/vendor-fonts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE_DIR } from './store.mjs';

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Archivo:wght@400..800&display=swap';
// A modern UA is required for Google to serve woff2 rather than legacy formats.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const outDir = path.join(SITE_DIR, 'fonts');
fs.mkdirSync(outDir, { recursive: true });

const css = await (await fetch(CSS_URL, { headers: { 'user-agent': UA } })).text();

const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((m) => m[1]);
const wanted = faces.filter((f) => /unicode-range:[^;]*U\+0000-00FF/.test(f) || !/unicode-range/.test(f));
const blocks = [];

for (const face of wanted.length ? wanted : faces) {
  const url = face.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!url) continue;
  const file = 'archivo-' + path.basename(new URL(url).pathname);
  const buf = Buffer.from(await (await fetch(url, { headers: { 'user-agent': UA } })).arrayBuffer());
  fs.writeFileSync(path.join(outDir, file), buf);
  const range = face.match(/unicode-range:\s*([^;]+);/)?.[1];
  blocks.push(
    `@font-face {\n  font-family: 'Archivo';\n  font-style: normal;\n  font-weight: 400 800;\n` +
      `  font-display: swap;\n  src: url('../fonts/${file}') format('woff2');` +
      (range ? `\n  unicode-range: ${range};` : '') +
      `\n}`
  );
  console.log('saved', file, (buf.length / 1024).toFixed(1) + ' KB');
}

fs.writeFileSync(
  path.join(SITE_DIR, 'css', 'fonts.css'),
  `/* Vendored from Google Fonts so the dashboard works offline. */\n${blocks.join('\n\n')}\n`
);
console.log('wrote public/css/fonts.css with', blocks.length, 'face(s)');

