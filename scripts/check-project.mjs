#!/usr/bin/env node
/**
 * Static project checks (no dependencies). Run with `npm run check`.
 * Browser behaviour is covered separately by tests/*.py.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO, 'src');
const failures = [];
const fail = (message) => failures.push(message);
const read = (file) => readFileSync(join(REPO, file), 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});
const rel = (file) => relative(REPO, file).split(sep).join('/');

// --- required files
for (const file of [
  'README.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'package.json', '.gitignore', '.editorconfig', '.gitattributes',
  'src/index.html', 'src/manifest.webmanifest', 'src/sw.js', 'src/assets/css/app.css', 'src/assets/icons/icon.svg',
  '.github/workflows/ci.yml', '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug-report.yml', '.github/ISSUE_TEMPLATE/template-request.yml',
  'docs/screenshots/simple-mode.png', 'src/assets/icons/apple-touch-icon.png'
]) {
  if (!existsSync(join(REPO, file))) fail(`Missing required file: ${file}`);
}
if (failures.length) finish();

// --- generated files are current
const build = spawnSync(process.execPath, [join(REPO, 'scripts/build.mjs'), '--check'], { encoding: 'utf8' });
if (build.status !== 0) fail((build.stderr || build.stdout || 'build check failed').trim());

// --- licensing and notices
if (!/^MIT License/.test(read('LICENSE'))) fail('LICENSE must be the MIT license');
if (JSON.parse(read('package.json')).license !== 'MIT') fail('package.json license must be MIT');
if (!/not affiliated with, endorsed by, or sponsored by any university/i.test(read('README.md'))) fail('README.md must keep the "not affiliated with any university" disclaimer');

// --- third-party scripts: pinned URLs and well-formed integrity hashes
const cdnSource = read('src/assets/js/data/cdn-libraries.js');
const cdnEntries = [...cdnSource.matchAll(/url:\s*'([^']+)',\s*integrity:\s*'([^']*)'/g)];
if (!cdnEntries.length) fail('cdn-libraries.js lists no libraries');
let missingIntegrity = 0;
for (const [, url, integrity] of cdnEntries) {
  if (!/\/\d+\.\d+\.\d+\//.test(url)) fail(`CDN library is not pinned to an exact version: ${url}`);
  if (!integrity) missingIntegrity++;
  else if (!/^sha384-[A-Za-z0-9+/]{64}$/.test(integrity)) fail(`Malformed integrity hash for ${url}`);
}
if (missingIntegrity) console.warn(`Note: ${missingIntegrity} CDN librar${missingIntegrity === 1 ? 'y has' : 'ies have'} no integrity hash yet. Run "npm run sri" (needs internet) and commit the result.`);

// --- package / manifest
const pkg = JSON.parse(read('package.json'));
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) fail(`package.json version is not semver: ${pkg.version}`);
const manifest = JSON.parse(read('src/manifest.webmanifest'));
for (const icon of manifest.icons || []) {
  if (!existsSync(join(SRC, icon.src))) fail(`Manifest icon is missing: ${icon.src}`);
}
const iconSizes = new Set((manifest.icons || []).filter((icon) => icon.type === 'image/png').map((icon) => icon.sizes));
for (const size of ['192x192', '512x512']) {
  if (!iconSizes.has(size)) fail(`Manifest needs a ${size} PNG icon for installability`);
}

// --- index.html
const html = read('src/index.html');
if (!/<html\b[^>]*\blang=/i.test(html)) fail('index.html: <html> needs a lang attribute');
if (!/<meta\b[^>]*name="viewport"/i.test(html)) fail('index.html: viewport meta tag is missing');
if (/<style\b/i.test(html)) fail('index.html: inline <style> is not allowed');
if (/\son[a-z]+\s*=/i.test(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ''))) fail('index.html: inline event handlers are not allowed');
const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
const scriptSources = [];
for (const tag of scriptTags) {
  const src = /\bsrc="([^"]+)"/i.exec(tag)?.[1];
  if (!src) fail('index.html: inline <script> is not allowed');
  else if (!/\bdefer\b/i.test(tag) && !/^https?:/i.test(src)) fail(`index.html: script must use defer: ${src}`);
  else if (!/^https?:/i.test(src)) scriptSources.push(src);
}
for (const src of scriptSources) {
  if (!existsSync(join(SRC, src))) fail(`index.html references a missing script: ${src}`);
}
for (const href of [...html.matchAll(/<link\b[^>]*\bhref="(\.\/[^"]+)"/gi)].map((m) => m[1])) {
  if (!existsSync(join(SRC, href))) fail(`index.html references a missing file: ${href}`);
}
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
for (const id of new Set(ids.filter((value, index) => ids.indexOf(value) !== index))) fail(`index.html: duplicate id "${id}"`);
for (const image of html.match(/<img\b[^>]*>/gi) || []) {
  if (!/\balt=/i.test(image)) fail(`index.html: <img> without alt text: ${image.slice(0, 80)}`);
}

// --- accessibility: names for form controls, label references, focus, motion, touch targets
const attribute = (tag, name) => new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i').exec(tag)?.[2] || '';
const labels = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)];
const labelledIds = new Set(labels.map((m) => attribute(m[0].slice(0, m[0].indexOf('>') + 1), 'for')).filter(Boolean));
for (const match of html.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
  const tag = match[0];
  if (['hidden', 'submit', 'button', 'reset', 'image'].includes(attribute(tag, 'type').toLowerCase())) continue;
  const id = attribute(tag, 'id');
  const named = attribute(tag, 'aria-label') || attribute(tag, 'aria-labelledby') || attribute(tag, 'title');
  const insideLabel = labels.some((l) => match.index > l.index && match.index < l.index + l[0].length && l[0].replace(/<[^>]*>/g, ' ').trim());
  if (!named && !(id && labelledIds.has(id)) && !insideLabel) fail(`index.html: form control without an accessible name: ${id || match[1]}`);
}
for (const match of html.matchAll(/aria-labelledby=["']([^"']+)["']/gi)) {
  for (const reference of match[1].trim().split(/\s+/)) {
    if (!ids.includes(reference)) fail(`index.html: aria-labelledby references a missing id: ${reference}`);
  }
}
const css = read('src/assets/css/app.css');
if (!/:focus-visible/.test(css)) fail('app.css: visible keyboard focus styles are required');
if (!/@media \(pointer:\s*coarse\)[\s\S]*?min-height:\s*44px/.test(css)) fail('app.css: coarse-pointer controls need 44px touch targets');
if (!/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:[^;]*!important[\s\S]*?transition-duration:[^;]*!important/.test(css)) fail('app.css: reduced-motion preference must disable animations and transitions');

const luminance = (hex) => {
  const [r, g, b] = hex.replace('#', '').match(/.{2}/g).map((part) => parseInt(part, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (foreground, background) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};
const tokens = (selector) => Object.fromEntries([...css.matchAll(selector)].flatMap((block) => [...block[1].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]])));
const dark = tokens(/:root\s*\{([^}]+)\}/g);
const light = tokens(/:root\[data-theme="light"\]\s*\{([^}]+)\}/g);
for (const [label, foreground, background, minimum] of [
  ['dark text', dark['--text-primary'], dark['--bg-surface-1'], 4.5],
  ['dark muted text', dark['--text-muted'], dark['--bg-surface-2'], 4.5],
  ['dark dim text', dark['--text-dim'], dark['--bg-surface-2'], 4.5],
  ['dark accent', dark['--accent-cyan'], dark['--bg-surface-2'], 4.5],
  ['light text', light['--text-primary'], light['--bg-surface-1'], 4.5],
  ['light muted text', light['--text-muted'], light['--bg-surface-2'], 4.5],
  ['light dim text', light['--text-dim'], light['--bg-surface-2'], 4.5],
  ['light accent', light['--accent-cyan'], light['--bg-surface-2'], 4.5],
  ['light control boundary', light['--border-subtle'], light['--bg-surface-2'], 3],
  ['light primary button', '#ffffff', light['--accent-cyan'], 4.5]
]) {
  if (!foreground || !background || contrast(foreground, background) < minimum) fail(`Theme contrast below ${minimum}:1 for ${label}`);
}

// --- icons: every referenced Lucide icon exists in the registry, and no icon artwork is inlined elsewhere
const registry = new Set([...read('src/assets/js/core/icons.js').matchAll(/^  '([a-z0-9-]+)':/gm)].map((m) => m[1]));
const referenced = new Set([...html.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]));
for (const file of walk(join(SRC, 'assets/js')).filter((f) => f.endsWith('.js') && !f.endsWith('icons.js') && !f.endsWith('generated.js'))) {
  const source = readFileSync(file, 'utf8');
  for (const m of source.matchAll(/lucideSvg\(\s*(['"])([^'"]+)\1/g)) referenced.add(m[2]);
  if (/<svg\b/.test(source)) fail(`${rel(file)}: inline <svg> found; use lucideSvg() from core/icons.js`);
  if (!file.endsWith('confirm-dialog.js') && /(^|[^.\w])(window\.)?confirm\(/m.test(source)) fail(`${rel(file)}: native confirm() found; use coverdraftConfirm() from core/confirm-dialog.js`);
}
for (const name of referenced) {
  if (!registry.has(name)) fail(`Icon "${name}" is not in src/assets/js/core/icons.js`);
}
if (/<svg\b/.test(html)) fail('index.html: inline <svg> found; use <i data-icon="..."> (see core/icons.js)');

// --- every application script is loaded, and every script parses
const appScripts = walk(join(SRC, 'assets/js')).map((file) => rel(file).replace(/^src\//, './'));
for (const script of appScripts) {
  if (!scriptSources.includes(script)) fail(`Script is not loaded by index.html: ${script}`);
}
for (const file of [...walk(join(SRC, 'assets/js')), join(SRC, 'sw.js'), ...walk(join(REPO, 'scripts')).filter((f) => f.endsWith('.mjs'))]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`Syntax error in ${rel(file)}:\n${result.stderr.trim()}`);
}

// --- hygiene: no leftovers, secrets or personal paths in tracked sources
const textFiles = [...walk(SRC), ...walk(join(REPO, 'scripts')), ...walk(join(REPO, 'tests')), ...walk(join(REPO, 'docs')), ...walk(join(REPO, '.github'))]
  .filter((file) => /\.(js|mjs|py|css|html|json|md|yml|webmanifest|svg)$/.test(file) && !/generated\.js$/.test(file));
const isAppCode = (file) => /\.(js|css|html)$/.test(file) && rel(file).startsWith('src/');
const hygiene = [
  [/\b(?:TODO|FIXME|HACK)\b/, 'unfinished marker', isAppCode],
  [/\bconsole\.(?:log|debug)\(/, 'console logging', isAppCode],
  [/\bdebugger\b/, 'debugger statement', isAppCode],
  [/(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/, 'credential-like string'],
  [/(?:\/Users\/|\/home\/[a-z]|[A-Z]:\\Users\\)/, 'personal filesystem path'],
  [/localhost|127\.0\.0\.1/, 'local address']
];
for (const file of textFiles) {
  if (rel(file) === 'scripts/check-project.mjs') continue;
  const text = readFileSync(file, 'utf8');
  for (const [pattern, label, applies = () => true] of hygiene) {
    if (applies(file) && pattern.test(text)) fail(`${rel(file)}: ${label}`);
  }
}
for (const file of walk(REPO)) {
  const name = rel(file);
  if (/(^|\/)(\.env(\..*)?|.*\.pem|.*\.key|\.DS_Store)$/.test(name) && !name.includes('node_modules')) fail(`Should not be committed: ${name}`);
}

finish();

function finish() {
  if (failures.length) {
    console.error(`Project check failed (${failures.length}):\n${failures.map((message) => `  - ${message}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Project check passed.');
}
