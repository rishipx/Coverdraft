#!/usr/bin/env node
/**
 * Coverdraft build step (no dependencies).
 *
 * Generates, from the hand-edited sources:
 *   src/assets/js/data/templates.generated.js  <- src/templates/<id>/*   (template registry)
 *   src/precache.generated.js                  <- every deployable file  (service-worker precache + cache name)
 *
 * Usage:
 *   node scripts/build.mjs           write the generated files
 *   node scripts/build.mjs --check   fail if the committed generated files are stale
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(REPO, 'src');
const TEMPLATES_DIR = join(SRC, 'templates');
const REGISTRY_FILE = join(SRC, 'assets/js/data/templates.generated.js');
const PRECACHE_FILE = join(SRC, 'precache.generated.js');
const VERSION = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version;
const checkOnly = process.argv.includes('--check');

const errors = [];
const fail = (message) => errors.push(message);
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${relative(REPO, file)}: ${error.message}`);
    return null;
  }
};

// ---------------------------------------------------------------- templates

const ID_PATTERN = /^[a-z][a-z0-9]{0,23}$/;
const SEMESTER_PATTERN = /^[1-8](st|nd|rd|th)$/;
const REQUIRED_STRINGS = ['id', 'name', 'label', 'shortName', 'detect'];

function loadTemplate(id) {
  const dir = join(TEMPLATES_DIR, id);
  const where = `templates/${id}`;
  if (!ID_PATTERN.test(id)) fail(`${where}: folder name must match ${ID_PATTERN}`);

  const template = readJson(join(dir, 'template.json'));
  if (!template) return null;
  const courses = existsSync(join(dir, 'courses.json')) ? readJson(join(dir, 'courses.json')) : {};

  if (template.id !== id) fail(`${where}/template.json: "id" must equal the folder name "${id}"`);
  for (const key of REQUIRED_STRINGS) {
    if (typeof template[key] !== 'string' || !template[key].trim()) fail(`${where}/template.json: "${key}" is required`);
  }
  try {
    new RegExp(template.detect, 'i');
  } catch (error) {
    fail(`${where}/template.json: "detect" is not a valid regular expression (${error.message})`);
  }
  if (!Number.isFinite(template.order)) fail(`${where}/template.json: "order" must be a number`);
  if (!template.defaults || typeof template.defaults !== 'object') fail(`${where}/template.json: "defaults" is required`);
  if (!template.student || typeof template.student !== 'object') fail(`${where}/template.json: "student" is required`);
  if (!Array.isArray(template.fields) || !template.fields.length) fail(`${where}/template.json: "fields" must be a non-empty array`);
  const style = template.style;
  if (!style || !style.id || !style.name || !style.font || !style.border) fail(`${where}/template.json: "style" needs id, name, font and border`);
  if (!Array.isArray(template.cover) || !template.cover.length) fail(`${where}/template.json: "cover" must be a non-empty array`);
  const elementIds = new Set();
  for (const element of template.cover || []) {
    if (!element.id) fail(`${where}/template.json: every cover element needs an "id"`);
    else if (elementIds.has(element.id)) fail(`${where}/template.json: duplicate cover element id "${element.id}"`);
    elementIds.add(element.id);
  }
  for (const semester of Object.keys(courses || {})) {
    if (!SEMESTER_PATTERN.test(semester)) fail(`${where}/courses.json: "${semester}" is not a semester key like "1st" or "6th"`);
  }

  const png = join(dir, 'images/emblem.png');
  const svg = join(dir, 'images/emblem.svg');
  let emblem = null;
  if (existsSync(svg)) {
    emblem = readFileSync(svg, 'utf8').trim();
  } else if (existsSync(png)) {
    const data = readFileSync(png).toString('base64');
    emblem = `<img src="data:image/png;base64,${data}" alt="${String(template.name).replace(/"/g, '&quot;')} crest" style="width:100%;height:100%;object-fit:contain;">`;
  } else {
    fail(`${where}/images: add emblem.svg or emblem.png`);
  }

  return { template, courses: courses || {}, emblem };
}

function buildRegistry() {
  const ids = readdirSync(TEMPLATES_DIR).filter((name) => statSync(join(TEMPLATES_DIR, name)).isDirectory()).sort();
  const loaded = ids.map(loadTemplate).filter(Boolean);
  loaded.sort((a, b) => a.template.order - b.template.order || a.template.id.localeCompare(b.template.id));

  const styleIds = new Set();
  const configs = {};
  const layouts = {};
  const emblems = {};
  const courses = {};
  const universities = [];

  for (const { template: t, courses: semesterCourses, emblem } of loaded) {
    if (styleIds.has(t.style?.id)) fail(`templates/${t.id}: style id "${t.style.id}" is already used by another template`);
    styleIds.add(t.style?.id);

    configs[t.id] = { id: t.id, styleId: t.style?.id, name: t.name, ...t.defaults, student: t.student, fields: t.fields };
    layouts[t.style?.id] = { id: t.style?.id, name: t.style?.name, font: t.style?.font, border: t.style?.border, layout: t.cover };
    emblems[t.id] = emblem;
    courses[t.id] = semesterCourses;
    universities.push({ id: t.id, label: t.label, shortName: t.shortName, detect: t.detect });
  }
  if (!loaded.length) fail('templates/: no templates found');

  const literal = (value) => JSON.stringify(value, null, 2);
  return [
    '/* GENERATED FILE - do not edit by hand.',
    ' * Source: src/templates/<id>/   Rebuild: npm run build',
    ' */',
    `const UNIVERSITY_LIST = ${literal(universities)};`,
    '',
    `const UNI_CONFIGS = ${literal(configs)};`,
    '',
    `const TEMPLATES = ${literal(layouts)};`,
    '',
    `const UNI_CRESTS = ${literal(emblems)};`,
    '',
    `const UNIVERSITY_SEMESTER_COURSES = ${literal(courses)};`,
    ''
  ].join('\n');
}

// -------------------------------------------------------------- precache

const NOT_PRECACHED = [
  /^sw\.js$/,
  /^precache\.generated\.js$/,
  /^templates\/[^/]+\/(template|courses)\.json$/,
  /^templates\/[^/]+\/images\//
];

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function buildPrecache() {
  const files = listFiles(SRC)
    .map((file) => relative(SRC, file).split(sep).join('/'))
    .filter((file) => !NOT_PRECACHED.some((pattern) => pattern.test(file)))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(SRC, file)));
  }
  const urls = ['./', ...files.map((file) => `./${file}`)];
  return [
    '/* GENERATED FILE - do not edit by hand. Rebuild: npm run build */',
    `self.COVERDRAFT_CACHE = "coverdraft-static-v${VERSION}-${hash.digest('hex').slice(0, 10)}";`,
    `self.COVERDRAFT_PRECACHE = ${JSON.stringify(urls, null, 2)};`,
    ''
  ].join('\n');
}

// ------------------------------------------------------------------ main

const outputs = [];
outputs.push([REGISTRY_FILE, buildRegistry()]);
if (errors.length) {
  console.error(errors.map((message) => `  x ${message}`).join('\n'));
  process.exit(1);
}
// The precache hash covers the registry, so write the registry before hashing.
if (!checkOnly) {
  mkdirSync(dirname(REGISTRY_FILE), { recursive: true });
  writeFileSync(REGISTRY_FILE, outputs[0][1]);
}
const stale = [];
if (checkOnly && (!existsSync(REGISTRY_FILE) || readFileSync(REGISTRY_FILE, 'utf8') !== outputs[0][1])) stale.push(REGISTRY_FILE);
const precache = buildPrecache();
if (checkOnly) {
  if (!existsSync(PRECACHE_FILE) || readFileSync(PRECACHE_FILE, 'utf8') !== precache) stale.push(PRECACHE_FILE);
  if (stale.length) {
    console.error(`Generated files are out of date (run "npm run build"):\n${stale.map((f) => `  - ${relative(REPO, f)}`).join('\n')}`);
    process.exit(1);
  }
  console.log('Generated files are up to date.');
} else {
  writeFileSync(PRECACHE_FILE, precache);
  console.log('Built template registry and precache list.');
}
