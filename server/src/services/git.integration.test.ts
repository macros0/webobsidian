import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { simpleGit } from 'simple-git';

const exec = promisify(execFile);
const T = 20_000; // generous per-test timeout — these shell out to real git

// Full git settings; vault.path is set per test to a fresh temp repo.
const { settings } = vi.hoisted(() => ({
  settings: {
    vault: { path: '', trash: '.trash' },
    git: {
      enabled: true,
      autoSync: false,
      autoCommitOnSave: false,
      remote: '',
      token: '',
      branch: 'main',
      authorName: 'Tester',
      authorEmail: 'tester@example.com',
      lfsPatterns: [] as string[],
      intervalSec: 60,
    },
  },
}));
vi.mock('./settings.js', () => ({ getSettings: vi.fn(async () => settings) }));

const git = await import('./git.js');

const gitOnPath = await exec('git', ['--version']).then(() => true).catch(() => false);

// simple-git 4 removes ambient GIT_* variables. Isolate HOME/XDG as well as the
// direct Git CLI's config path so neither can read the developer's global config.
let cfgHome: string;
let prevGlobal: string | undefined;
let prevHome: string | undefined;
let prevXdg: string | undefined;
beforeAll(async () => {
  cfgHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitcfg-'));
  const cfg = path.join(cfgHome, '.gitconfig');
  await fs.writeFile(
    cfg,
    '[init]\n  defaultBranch = main\n[user]\n  name = CI\n  email = ci@example.com\n[core]\n  editor = false\n',
  );
  prevGlobal = process.env.GIT_CONFIG_GLOBAL;
  prevHome = process.env.HOME;
  prevXdg = process.env.XDG_CONFIG_HOME;
  process.env.GIT_CONFIG_GLOBAL = cfg;
  process.env.HOME = cfgHome;
  process.env.XDG_CONFIG_HOME = path.join(cfgHome, 'xdg');
});
afterAll(async () => {
  if (prevGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL;
  else process.env.GIT_CONFIG_GLOBAL = prevGlobal;
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
  await fs.rm(cfgHome, { recursive: true, force: true });
});

let work: string;
let bare: string;
beforeEach(async () => {
  work = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitwork-'));
  bare = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitbare-'));
  await exec('git', ['init', '--bare', '-b', 'main', bare]);
  settings.vault.path = work;
  Object.assign(settings.git, {
    enabled: true,
    remote: bare,
    token: '',
    branch: 'main',
    authorName: 'Tester',
    authorEmail: 'tester@example.com',
    lfsPatterns: [],
  });
});
afterEach(async () => {
  await fs.rm(work, { recursive: true, force: true });
  await fs.rm(bare, { recursive: true, force: true });
});

describe.skipIf(!gitOnPath)('git integration (real repo)', () => {
  it('uses the temporary global Git configuration for simple-git child processes', async () => {
    const origin = await simpleGit({ baseDir: work }).raw(['config', '--global', '--show-origin', '--get', 'user.name']);
    expect(origin.replace(/\\/g, '/').includes(cfgHome.replace(/\\/g, '/'))).toBe(true);
  }, T);

  it('clones a local remote into an empty vault and configures its identity', async () => {
    const seed = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-gitseed-'));
    try {
      await exec('git', ['init', '-b', 'main', seed]);
      await fs.writeFile(path.join(seed, 'cloned.md'), '# local fixture');
      await exec('git', ['-C', seed, 'add', 'cloned.md']);
      await exec('git', ['-C', seed, 'commit', '-m', 'seed']);
      await exec('git', ['-C', seed, 'push', bare, 'main']);
      await git.clone();
      expect(await fs.readFile(path.join(work, 'cloned.md'), 'utf8')).toBe('# local fixture');
      const { stdout } = await exec('git', ['-C', work, 'config', 'user.name']);
      expect(stdout.trim()).toBe('Tester');
      expect((await git.status()).clean).toBe(true);
    } finally {
      await fs.rm(seed, { recursive: true, force: true });
    }
  }, T);

  it(
    'init creates a repo, configures identity, and sets origin',
    async () => {
      await git.init();
      const { stdout: origin } = await exec('git', ['-C', work, 'remote', 'get-url', 'origin']);
      expect(origin.trim()).toBe(bare);
      const { stdout: name } = await exec('git', ['-C', work, 'config', 'user.name']);
      expect(name.trim()).toBe('Tester');
    },
    T,
  );

  it(
    'authedRemote injects the PAT into an https origin (no network)',
    async () => {
      settings.git.remote = 'https://github.com/o/r.git';
      settings.git.token = 'ghp_SECRET';
      await git.init();
      const { stdout } = await exec('git', ['-C', work, 'remote', 'get-url', 'origin']);
      expect(stdout.trim()).toBe('https://ghp_SECRET@github.com/o/r.git');
    },
    T,
  );

  it(
    'commitAll stages everything; subject = describeChanges and body lists the file',
    async () => {
      await git.init();
      await fs.writeFile(path.join(work, 'Hello.md'), '# Hi');
      const res = await git.commitAll();
      expect(res).toContain('Add Hello');
      const { stdout: body } = await exec('git', ['-C', work, 'log', '-1', '--pretty=%B']);
      expect(body).toContain('Add Hello'); // subject
      expect(body).toContain('Hello.md'); // body file list
    },
    T,
  );

  it(
    'status maps repo state (clean -> notAdded -> clean)',
    async () => {
      await git.init();
      expect((await git.status()).isRepo).toBe(true);
      expect((await git.status()).clean).toBe(true);

      await fs.writeFile(path.join(work, 'a.md'), 'x');
      const dirty = await git.status();
      expect(dirty.notAdded).toBe(1);
      expect(dirty.clean).toBe(false);

      await git.commitAll();
      expect((await git.status()).clean).toBe(true);
    },
    T,
  );

  it(
    'log + showFile round-trip a committed file',
    async () => {
      await git.init();
      await fs.writeFile(path.join(work, 'note.md'), 'v1');
      await git.commitAll();
      const commits = await git.log('note.md');
      expect(commits).toHaveLength(1);
      expect(await git.showFile(commits[0].hash, 'note.md')).toBe('v1');
    },
    T,
  );

  it(
    'sync pushes to the bare remote and merges a peer change (no conflict)',
    async () => {
      // device 1: init + commit + sync (push to bare)
      await git.init();
      await fs.writeFile(path.join(work, 'a.md'), 'A');
      expect((await git.sync()).ok).toBe(true);

      // a peer clones the bare, adds b.md, pushes
      const peer = await fs.mkdtemp(path.join(os.tmpdir(), 'wo-peer-'));
      try {
        await exec('git', ['clone', '-b', 'main', bare, peer]);
        expect(await fs.readFile(path.join(peer, 'a.md'), 'utf8')).toBe('A');
        await fs.writeFile(path.join(peer, 'b.md'), 'B');
        await exec('git', ['-C', peer, 'add', '.']);
        await exec('git', ['-C', peer, 'commit', '-m', 'peer adds b']);
        await exec('git', ['-C', peer, 'push', 'origin', 'main']);

        // device 1: add c.md, sync -> pulls b, merges, pushes c
        await fs.writeFile(path.join(work, 'c.md'), 'C');
        expect((await git.sync()).ok).toBe(true);
        expect(await fs.readFile(path.join(work, 'b.md'), 'utf8')).toBe('B');
        expect(await fs.readFile(path.join(work, 'c.md'), 'utf8')).toBe('C');
      } finally {
        await fs.rm(peer, { recursive: true, force: true });
      }
    },
    T,
  );
});
