import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let root: string;
let settingsFile: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-integration-settings-'));
  settingsFile = path.join(root, 'data', 'settings.json');
  vi.resetModules();
  vi.doMock('../config.js', () => ({
    config: {
      dataDir: path.dirname(settingsFile),
      defaultVaultPath: path.join(root, 'vault'),
      allowedRoots: [path.join(root, 'vault')],
    },
    SETTINGS_FILE: settingsFile,
  }));
});

afterEach(async () => {
  vi.doUnmock('../config.js');
  vi.resetModules();
  await fs.rm(root, { recursive: true, force: true });
});

describe('community integration: preserve existing trash by default', () => {
  it('fills every settings group when starting with a fresh file', async () => {
    const { loadSettings } = await import('./settings.js');
    const s = await loadSettings();
    expect(s.auth).toMatchObject({ userPasswordHash: '', passwordHash: '' });
    expect(s.auth.jwtSecret).toMatch(/^[a-f0-9]{96}$/);
    expect(s.vault).toMatchObject({ trash: '.trash', deleteMode: 'trash', trashRetentionDays: 0, attachmentDir: 'attachments' });
    expect(s.git).toMatchObject({ enabled: false, branch: 'main', autoSync: false, autoCommitOnSave: false, intervalSec: 300 });
    expect(s.git.lfsPatterns).toContain('*.pdf');
    expect(s.search).toEqual({ fuzzy: 0.2, prefix: true, indexFrontmatter: true });
    expect(s.api).toEqual({ keys: [], rateLimitPerMin: 120 });
    expect(s.ui).toEqual({ theme: 'obsidian-light', defaultView: 'live', showInlineTitle: true });
    expect(s.plugins).toEqual({ enabled: [], installed: [] });
  });

  it('preserves explicit legacy values, migrates the password and fills omitted defaults', async () => {
    const vaultPath = path.join(root, 'custom-vault');
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify({
      auth: { passwordHash: 'fixture-password-hash', jwtSecret: 'fixture-existing-secret' },
      vault: { path: vaultPath, trashRetentionDays: 17 },
      git: { remote: 'https://example.invalid/notes.git', token: 'fixture-token' },
      api: { keys: [{ id: 'fixture', name: 'test', hash: 'fixture-key-hash', prefix: 'fixture', createdAt: '2026-10-29' }] },
      ui: { showInlineTitle: false },
    }));
    const { loadSettings, updateSettings } = await import('./settings.js');
    const s = await loadSettings();
    expect(s.auth).toEqual({ userPasswordHash: 'fixture-password-hash', passwordHash: '', jwtSecret: 'fixture-existing-secret' });
    expect(s.vault).toMatchObject({ path: vaultPath, trashRetentionDays: 17, attachmentDir: 'attachments' });
    expect(s.git).toMatchObject({ remote: 'https://example.invalid/notes.git', token: 'fixture-token', branch: 'main', autoSync: false });
    expect(s.api.keys[0]).toMatchObject({ hash: 'fixture-key-hash', scopes: ['read', 'search'], lastUsed: null });
    expect(s.ui).toMatchObject({ theme: 'obsidian-light', showInlineTitle: false });
    expect(s.search.prefix).toBe(true);
    expect(s.plugins).toEqual({ enabled: [], installed: [] });
    await updateSettings(draft => { draft.ui.defaultView = 'source'; });
    const persisted = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
    expect(persisted.auth.userPasswordHash).toBe('fixture-password-hash');
    expect(persisted.vault.path).toBe(vaultPath);
    expect(persisted.vault.trashRetentionDays).toBe(17);
  });

  it('keeps a fresh vault trash indefinitely until retention is explicitly enabled', async () => {
    const { loadSettings } = await import('./settings.js');
    expect((await loadSettings()).vault).toMatchObject({ trashRetentionDays: 0 });
  });

  it('does not silently enable cleanup when loading an older settings file', async () => {
    await fs.mkdir(path.dirname(settingsFile), { recursive: true });
    await fs.writeFile(settingsFile, JSON.stringify({
      vault: { path: path.join(root, 'vault') },
    }));
    const { loadSettings } = await import('./settings.js');
    expect((await loadSettings()).vault).toMatchObject({ trashRetentionDays: 0 });
  });
});
