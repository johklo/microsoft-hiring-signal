/**
 * Vendors the page's typefaces from Google Fonts into docs/fonts, then writes
 * docs/css/fonts.css, so the dashboard renders identically with no network
 * access. Run after changing the type stack:
 *
 *   npm run fonts
 *
 * Each family is fetched as its own CSS2 request and every @font-face the
 * response carries is preserved verbatim except for the src URL — weight,
 * style and unicode-range come from Google rather than being guessed, which is
 * what makes static families (IBM Plex Sans ships one file per weight) work
 * alongside variable ones (Newsreader, Source Serif 4).
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE_DIR } from './store.mjs';

/** Display serif · body serif · label voice. Three families, 2+1 discipline. */
const FAMILIES = [
  {
    family: 'Newsreader',
    slug: 'newsreader',
    url: 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400..600&display=swap',
  },
  {
    family: 'Source Serif 4',
    slug: 'source-serif',
    url: 'https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400..600&display=swap',
  },
  {
    family: 'IBM Plex Sans',
    slug: 'plex-sans',
    url: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400..600&display=swap',
  },
];

// A modern UA is required for Google to serve woff2 rather than legacy formats.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const outDir = path.join(SITE_DIR, 'fonts');
fs.mkdirSync(outDir, { recursive: true });

const decl = (face, prop) => face.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1]?.trim() ?? null;

const blocks = [];
let bytes = 0;

for (const { family, slug, url } of FAMILIES) {
  const css = await (await fetch(url, { headers: { 'user-agent': UA } })).text();
  const faces = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((m) => m[1]);

  // Latin only. The dashboard is English; the other subsets are dead weight.
  const latin = faces.filter(
    (f) => !/unicode-range/.test(f) || /unicode-range:[^;]*U\+0000-00FF/.test(f)
  );

  let n = 0;
  // A variable family serves one file for the whole weight range, so the same
  // URL can appear under several @font-face blocks. Fetch each file once.
  const seen = new Set();
  for (const face of latin.length ? latin : faces) {
    const src = face.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
    if (!src || seen.has(src)) continue;
    seen.add(src);

    const weight = decl(face, 'font-weight') ?? '400';
    const style = decl(face, 'font-style') ?? 'normal';
    const range = decl(face, 'unicode-range');

    const file = `${slug}-${weight.replace(/\s+/g, '-')}-${path.basename(new URL(src).pathname)}`;
    const buf = Buffer.from(await (await fetch(src, { headers: { 'user-agent': UA } })).arrayBuffer());
    fs.writeFileSync(path.join(outDir, file), buf);
    bytes += buf.length;
    n++;

    blocks.push(
      `@font-face {\n  font-family: '${family}';\n  font-style: ${style};\n` +
        `  font-weight: ${weight};\n  font-display: swap;\n` +
        `  src: url('../fonts/${file}') format('woff2');` +
        (range ? `\n  unicode-range: ${range};` : '') +
        `\n}`
    );
    console.log('saved', file, (buf.length / 1024).toFixed(1) + ' KB');
  }
  console.log(`  ${family}: ${n} face(s)`);
}

fs.writeFileSync(
  path.join(SITE_DIR, 'css', 'fonts.css'),
  '/* Vendored from Google Fonts so the dashboard works offline.\n' +
    ' * Regenerate with `npm run fonts` after changing the type stack. */\n' +
    `${blocks.join('\n\n')}\n`
);
console.log(
  `\nwrote docs/css/fonts.css with ${blocks.length} face(s), ${(bytes / 1024).toFixed(1)} KB total`
);
