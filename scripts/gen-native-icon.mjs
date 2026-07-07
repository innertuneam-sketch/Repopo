// Produces resources/icon.png (1024, full-bleed) + resources/splash.png
// for @capacitor/assets to turn into Android launcher/splash resources.
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons', 'icon.svg'), 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
mkdirSync(join(root, 'resources'), { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage();

async function render(size, innerRatio, out, bg) {
  const inner = Math.round(size * innerRatio);
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0}
    .w{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;
       background:${bg}}
    img{width:${inner}px;height:${inner}px}
  </style></head><body><div class="w"><img src="${dataUri}"></div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'networkidle' });
  writeFileSync(join(root, 'resources', out), await page.screenshot());
  console.log('wrote resources/' + out);
}

const grad = 'linear-gradient(135deg,#ffb3d1,#c9a6ff 55%,#8ec5ff)';
// full-bleed icon (figure padded so the circular adaptive mask won't clip it)
await render(1024, 0.66, 'icon.png', grad);
// splash: small centered logo on a soft background
await render(2732, 0.22, 'splash.png', '#fdeff4');

await browser.close();
