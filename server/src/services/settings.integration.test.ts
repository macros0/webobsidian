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
