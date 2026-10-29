// Guard every nested lockfile copy against the critical advisories remediated in October 2026.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const floors = {
  '@simple-git/argv-parser': '2.0.1', 'simple-git': '4.0.2',
  dompurify: '3.4.17', 'proxy-addr': '2.0.8', 'shell-quote': '1.11.0',
  tar: '7.5.22', tinypool: '2.1.2', vitest: '4.1.12', concurrently: '9.2.5',
};
const compare = (actual, minimum) => {
  assert.match(actual, /^\d+\.\d+\.\d+$/, `Unexpected dependency version: ${actual}`);
  const a = actual.split('.').map(Number), b = minimum.split('.').map(Number);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
};
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
assert.equal(lock.lockfileVersion, 3);
const failures = [];
let checked = 0;
for (const [location, entry] of Object.entries(lock.packages)) {
  for (const [name, minimum] of Object.entries(floors)) {
    if (!`/${location}`.endsWith(`/node_modules/${name}`)) continue;
    checked++;
    // concurrently 10.0.0–10.0.5 reintroduced a vulnerable shell-quote dependency.
    const vulnerableNextMajor = name === 'concurrently' && entry.version.startsWith('10.0.')
      && compare(entry.version, '10.0.6') < 0;
    if (compare(entry.version, minimum) < 0 || vulnerableNextMajor) {
      failures.push(`${location}: ${entry.version} (minimum secure baseline ${minimum})`);
    }
  }
}
assert.ok(checked > 0, 'No protected dependencies found; check the lockfile format');
assert.deepEqual(failures, [], 'Known critical dependency versions remain in the lockfile');
console.log(`PASS: ${checked} dependency copies satisfy the remediated critical-advisory baselines`);
