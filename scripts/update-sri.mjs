#!/usr/bin/env node
/**
 * Fills or verifies the Subresource Integrity hashes in src/assets/js/data/cdn-libraries.js.
 * Needs internet access (it downloads each pinned library from cdnjs).
 *
 *   node scripts/update-sri.mjs            download, hash, and write the hashes
 *   node scripts/update-sri.mjs --verify   download and fail if a recorded hash no longer matches
 *
 * Options for testing or mirrors: --origin=<url> replaces https://cdnjs.cloudflare.com, --file=<path> edits another file.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const FILE = option('file') || join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'src/assets/js/data/cdn-libraries.js');
const ORIGIN = option('origin');
const verify = process.argv.includes('--verify');
let source = readFileSync(FILE, 'utf8');
const entries = [...source.matchAll(/url:\s*'([^']+)',\s*integrity:\s*'([^']*)'/g)];
if (!entries.length) {
  console.error('No libraries found in cdn-libraries.js');
  process.exit(1);
}

let failed = false;
for (const [, url, recorded] of entries) {
  const response = await fetch(ORIGIN ? url.replace('https://cdnjs.cloudflare.com', ORIGIN) : url).catch((error) => ({ ok: false, status: error.cause?.code || error.message }));
  if (!response.ok) {
    console.error(`x ${url}: HTTP ${response.status}`);
    failed = true;
    continue;
  }
  const hash = `sha384-${createHash('sha384').update(Buffer.from(await response.arrayBuffer())).digest('base64')}`;
  if (verify) {
    if (!recorded) { console.error(`x ${url}: no hash recorded`); failed = true; }
    else if (recorded !== hash) { console.error(`x ${url}: hash changed\n    recorded ${recorded}\n    current  ${hash}`); failed = true; }
    else console.log(`ok ${url}`);
  } else {
    source = source.replace(`url: '${url}', integrity: '${recorded}'`, `url: '${url}', integrity: '${hash}'`);
    console.log(`${recorded === hash ? 'ok' : 'updated'} ${url}`);
  }
}
if (!verify && !failed) writeFileSync(FILE, source);
process.exit(failed ? 1 : 0);
