// Renders launcher icons straight into the android res folders using Chromium.
// Replaces the default Capacitor logo with our own icon.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const res = join(root, 'android', 'app', 'src', 'main', 'res');
const svg = readFileSync(join(root, 'icons', 'icon.svg'), 'utf8');
const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const grad = 'linear-gradient(135deg,#ffb3d1,#c9a6ff 55%,#8ec5ff)';

// density -> [legacy launcher px, adaptive foreground px]
const dens = {
  'mdpi':    [48, 108],
  'hdpi':    [72, 162],
  'xhdpi':   [96, 216],
  'xxhdpi':  [144, 324],
  'xxxhdpi': [192, 432],
};

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const page = await browser.newPage();

async function render(size, innerRatio, bg) {
  const inner = Math.round(size * innerRatio);
  const html = `<!doctype html><html><head><style>
    html,body{margin:0;padding:0}
    .w{width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg}}
    img{width:${inner}px;height:${inner}px}
  </style></head><body><div class="w"><img src="${dataUri}"></div></body></html>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'networkidle' });
  return page.screenshot({ omitBackground: bg === 'transparent' });
}

for (const [d, [launch, fg]] of Object.entries(dens)) {
  const dir = join(res, `mipmap-${d}`);
  // legacy launcher = full rounded icon (svg already has the rounded card)
  const launcher = await render(launch, 1.0, 'transparent');
  writeFileSync(join(dir, 'ic_launcher.png'), launcher);
  writeFileSync(join(dir, 'ic_launcher_round.png'), launcher);
  // adaptive foreground = full-bleed gradient art, figure inside the safe zone
  const foreground = await render(fg, 0.6, grad);
  writeFileSync(join(dir, 'ic_launcher_foreground.png'), foreground);
  console.log('icons written for', d);
}

await browser.close();
