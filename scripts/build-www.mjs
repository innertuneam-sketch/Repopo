// Assembles the web assets into ./www for Capacitor to wrap.
// Copies the PWA files and the Capacitor core runtime (so the native
// bridge / plugins are reachable from the plain-HTML app, no bundler needed).
import { mkdirSync, rmSync, copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

const files = ['index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.json'];
for (const f of files) copyFileSync(join(root, f), join(www, f));
cpSync(join(root, 'icons'), join(www, 'icons'), { recursive: true });

// Capacitor core runtime → www/capacitor.js
copyFileSync(
  join(root, 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js'),
  join(www, 'capacitor.js')
);

// Inject the capacitor runtime <script> into index.html (before app.js)
// so window.Capacitor exists in the native WebView.
const idx = join(www, 'index.html');
let html = readFileSync(idx, 'utf8');
if (!html.includes('capacitor.js')) {
  html = html.replace(
    '<script src="app.js"></script>',
    '<script src="capacitor.js"></script>\n  <script src="app.js"></script>'
  );
  writeFileSync(idx, html);
}

console.log('www/ built:', files.concat(['icons/', 'capacitor.js']).join(', '));
