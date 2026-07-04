import { chromium } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const buf = await readFile(join(root, p));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404); res.end('nf');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: 'he-IL',
  reducedMotion: 'reduce',
});
await ctx.grantPermissions(['notifications'], { origin: base });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

async function visible(id) {
  return await page.evaluate((i) => {
    const el = document.getElementById(i);
    return el && !el.hidden;
  }, id);
}

await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
console.log('onboarding visible:', await visible('screen-onboarding'));
await page.screenshot({ path: join(root, 'scripts', 'shot-1-onboarding.png') });

await page.click('#btn-start', { force: true });
await page.waitForTimeout(400);
console.log('morning visible:', await visible('screen-morning'));
await page.screenshot({ path: join(root, 'scripts', 'shot-2-morning.png') });

// pick a chip and set time far in the future so we stay on "waiting"
await page.fill('#time-input', '23:59');
await page.click('#btn-set-time', { force: true });
await page.waitForTimeout(500);
console.log('waiting visible:', await visible('screen-waiting'));
console.log('scheduled-time text:', await page.textContent('#scheduled-time'));
console.log('countdown text:', await page.textContent('#countdown'));
await page.screenshot({ path: join(root, 'scripts', 'shot-3-waiting.png') });

await page.click('#btn-done-now', { force: true });
await page.waitForTimeout(500);
console.log('done visible:', await visible('screen-done'));
console.log('streak text:', await page.textContent('#streak-num'));
await page.screenshot({ path: join(root, 'scripts', 'shot-4-done.png') });

// reload → should stay on "done" for today (persistence)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
console.log('after reload, done still visible:', await visible('screen-done'));

// test notification button
await page.click('#btn-notif-test', { force: true });
await page.waitForTimeout(300);

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');

await browser.close();
server.close();
console.log('DONE');
