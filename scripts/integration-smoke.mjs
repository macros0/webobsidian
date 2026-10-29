// Cross-platform smoke test for the merged forks. Uses only a throwaway local vault.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const repo = fileURLToPath(new URL('../', import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-merged-smoke-'));
const vault = path.join(root, 'vault');
const socket = net.createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
let server;
let output = '';
try {
  await fs.mkdir(path.join(vault, 'notes', 'attachments'), { recursive: true });
  await fs.mkdir(path.join(vault, '_system'), { recursive: true });
  await fs.writeFile(path.join(vault, '_system', 'locks.json'), JSON.stringify({
    locked: [{ glob: 'notes/locked.md', reason: 'integration fixture' }], unlock: 'confirm',
  }));
  await fs.writeFile(path.join(vault, 'notes', 'locked.md'), '# Locked');
  await fs.writeFile(path.join(vault, 'notes', 'editable.md'), '# Editable');
  const pdf = Buffer.from('%PDF-1.4\n% smoke-test fixture\n%%EOF\n');
  await fs.writeFile(path.join(vault, 'notes', 'attachments', 'document.pdf'), pdf);
  server = spawn(process.execPath, ['server/dist/index.js'], {
    cwd: repo,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production',
      DATA_DIR: path.join(root, 'data'), VAULT_PATH: vault, ALLOWED_ROOTS: vault,
      WEBOBSIDIAN_PASSWORD: 'smoke-test-only-password', TRUST_PROXY: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  server.stdout.on('data', (data) => { output += data; });
  server.stderr.on('data', (data) => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`server exited: ${output}`);
    try { if ((await fetch(`${base}/healthz`)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, `server did not start: ${output}`);
  assert.equal((await fetch(`${base}/api/files/tree`)).status, 401);
  const login = await fetch(`${base}/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'smoke-test-only-password' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie);
  const request = (url, options = {}) => fetch(`${base}${url}`, {
    ...options, headers: { cookie, 'content-type': 'application/json', ...options.headers },
  });
  const settings = await (await request('/api/settings')).json();
  assert.equal(settings.vault.trashRetentionDays, 0);
  const locked = await (await request('/api/files/content?path=notes/locked.md')).json();
  assert.equal(locked.locked, true);
  assert.ok(locked.version);
  assert.equal((await request('/api/files/content?path=missing.md')).status, 404);
  const relative = '/api/files/content?path=attachments/document.pdf&from=notes/editable.md';
  const document = await request(relative);
  assert.equal(document.status, 200);
  assert.match(document.headers.get('content-type'), /application\/pdf/);
  assert.deepEqual(Buffer.from(await document.arrayBuffer()), pdf);
  const range = await request(relative, { headers: { range: 'bytes=0-3' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), '%PDF');
  const download = await request(`${relative}&download=1`);
  assert.match(download.headers.get('content-disposition'), /document\.pdf/);
  for (const [method, url, body] of [
    ['PUT', '/api/files/content', { path: 'notes/locked.md', content: 'bad' }],
    ['PATCH', '/api/files/rename', { from: 'notes/locked.md', to: 'notes/moved.md' }],
    ['POST', '/api/files/copy', { from: 'notes/editable.md', to: 'notes/locked.md' }],
    ['DELETE', '/api/files/?path=notes/locked.md&permanent=1', undefined],
  ]) assert.equal((await request(url, { method, body: body && JSON.stringify(body) })).status, 423);
  const original = await (await request('/api/files/content?path=notes/editable.md')).json();
  const write = (baseVersion, content) => request('/api/files/content', { method: 'PUT',
    body: JSON.stringify({ path: 'notes/editable.md', content, baseVersion }) });
  assert.equal((await write(original.version, '# Updated')).status, 200);
  assert.equal((await write(original.version, '# Stale')).status, 409);
  assert.equal(await fs.readFile(path.join(vault, 'notes', 'locked.md'), 'utf8'), '# Locked');
  assert.equal(await fs.readFile(path.join(vault, 'notes', 'editable.md'), 'utf8'), '# Updated');
  assert.equal((await request('/')).status, 200);
  console.log('PASS: auth, safe retention, relative PDF/ranges/downloads, locked mutations, CAS and SPA');
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
  await fs.rm(root, { recursive: true, force: true });
}
