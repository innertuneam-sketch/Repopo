// Rasterizes icons/icon.svg into PNG app icons using the pre-installed Chromium.
// Run: node scripts/gen-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons', 'icon.svg'), 'utf8');
const svgB64 = Buffer.from(svg).toString('base64');
const dataUri = `data:image/svg+xml;base64,${svgB64}`;

// [filename, size, maskable?] — maskable adds safe-zone padding so Android can crop.
const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-192.png', 192, true],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, false],
];

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
});
const page = await browser.newPage();

for (const [name, size, maskable] of targets) {
  const pad = maskable ? Math.round(size * 0.12) : 0;
  const inner = size - pad * 2;
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0}
    .wrap{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
      background:${maskable ? 'linear-gradient(135deg,#ffb3d1,#c9a6ff 55%,#8ec5ff)' : 'transparent'}}
    img{width:${inner}px;height:${inner}px;display:block}
  </style></head><body><div class="wrap"><img src="${dataUri}"></div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const buf = await page.screenshot({ omitBackground: !maskable });
  writeFileSync(join(root, 'icons', name), buf);
  console.log('wrote icons/' + name);
}

await browser.close();
