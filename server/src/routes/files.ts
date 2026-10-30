import {getDraftScope} from '../services/draftScopes.js';
import { Router, type Request, type Response } from 'express';
import { indexing } from '../services/indexing/coordinator.js';
import multer from 'multer';
import path from 'node:path';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import * as vault from '../services/vault.js';
import { getSettings } from '../services/settings.js';
import { qmd } from '../services/search.js';
import { updateLinkGraphForFile } from '../services/links.js';
import { scheduleAutoCommitOnSave } from '../services/git.js';
import { resolveFile } from '../services/fileindex.js';
import { onFileRenamed } from '../services/shares.js';
import { mimeFor, attachmentDisposition } from '../services/mime.js';
import { sendFileWithRange } from '../services/httpfile.js';
import { contentVersion, checkVersion } from '../services/noteversion.js';
import { annotateTree, loadLocks, lockFor, sessionMayWrite, targetsOf } from '../services/locks.js';

export const filesRouter = Router();
filesRouter.use(requireAuth);
filesRouter.get('/draft-scope',asyncHandler(async(_req,res)=>{res.json({scopeId:await getDraftScope((await getSettings()).vault.path)});}));

// Locked paths (the areas the agent maintains: raw evidence, generated pages, `_system/`) are
// readable but not writable from a browser session. The agent is unaffected — it writes through
// the API-key router (`/api/v1`), which never passes this middleware. The list is
// `_system/locks.json`; see `services/locks.ts` for the glob syntax and the unlock modes.
filesRouter.use(
  asyncHandler(async (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      next();
      return;
    }
    for (const rel of targetsOf(req)) {
      const verdict = await sessionMayWrite(req, rel);
      if (!verdict.ok) {
        const { unlock } = await loadLocks();
        res.status(423).json({ error: 'locked', path: rel, reason: verdict.reason, unlock });
        return;
      }
    }
    next();
  }),
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 * 1024 } });

const isMd = (p: string) => /\.(md|markdown)$/i.test(p);

// Refresh derived indexes after a mutation (best-effort, non-blocking).
// Incremental: only the touched file(s) are reparsed, not the whole vault.
async function reindex(opts: { upsert?: string; added?: string; removed?: string } = {}) {
  if (indexing.isStarted) {
    indexing.notify({ root: await vault.getVaultRoot(), paths: [...new Set(Object.values(opts).filter((p): p is string => !!p))], source: 'web' });
  } else {
    if (opts.upsert) void qmd.upsert(opts.upsert).catch(() => {});
    if (opts.removed) qmd.remove(opts.removed);
    if (opts.added && isMd(opts.added)) void updateLinkGraphForFile(opts.added).catch(() => {});
    if (opts.removed && isMd(opts.removed)) void updateLinkGraphForFile(opts.removed, true).catch(() => {});
  }
  scheduleAutoCommitOnSave();
}

// Keep both the write and its index notification bound to the same captured vault.
function mutationHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return asyncHandler(async (req, res) => vault.withVaultMutation(() => fn(req, res)));
}

/** `?download`, `?download=1`, `?download=true` (FR-22). */
function wantsDownload(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(wantsDownload);
  return value === '' || value === '1' || value === 'true' || value === 'yes';
}

filesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    // Lock flags ride along so the tree can badge the agent-owned paths without a second request.
    res.json(await annotateTree(await vault.listTree()));
  }),
);

// Resolve a link/embed target to a real vault path. Relative references
// (`attachments/x.png`) resolve against the folder of the note that embeds them
// (`from`) first, then fall back to the Obsidian-style vault-wide basename lookup.
async function resolveRef(target: string, from: string): Promise<string> {
  let rel = target;
  if (from && !rel.startsWith('/')) {
    const dir = path.posix.dirname(from);
    const cand = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, rel));
    if (!cand.startsWith('..') && (await vault.exists(cand))) return cand;
  }
  if (!(await vault.exists(rel))) {
    if (indexing.isStarted) indexing.assertReady();
    const resolved = resolveFile(rel);
    if (resolved) rel = resolved;
  }
  return rel;
}

filesRouter.get(
  '/resolve',
  asyncHandler(async (req, res) => {
    const target = String(req.query.path ?? '');
    if (!target) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const rel = await resolveRef(target, typeof req.query.from === 'string' ? req.query.from : '');
    res.json({ path: (await vault.exists(rel)) ? rel : null });
  }),
);

/** Scope check and operation share the vault's captured settings and mutation queue. */
async function withDraftScope<T>(scope: unknown, action: () => Promise<T>): Promise<T> {
  if(scope===undefined)return action();
  return vault.withVaultMutation(async()=>{
    if(typeof scope!=='string'||scope!==await getDraftScope(await vault.getVaultRoot()))throw Object.assign(new Error('draft_scope_changed'),{status:409});
    return action();
  });
}

filesRouter.get(
  '/content',
  asyncHandler(async (req, res) => withDraftScope(req.method==='GET'?req.query.draftScopeId:req.body?.draftScopeId,async()=>{
    const target = String(req.query.path ?? '');
    if (!target) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const rel = await resolveRef(target, typeof req.query.from === 'string' ? req.query.from : '');
    // Still missing: a text-looking path that is not there is a 404. Without this the read fell
    // through to readFileText and surfaced ENOENT as a 500 (found by the deploy smoke).
    if (!(await vault.exists(rel))) {
      res.status(404).json({ error: 'not_found', path: rel });
      return;
    }
    if (vault.isTextFile(rel)) {
      const content = await vault.readFileText(rel);
      // Additive: existing clients that ignore `version` are unaffected. Used as
      // the compare-and-set base for PUT (e.g. the Tasks board's write-back).
      const rule = await lockFor(rel);
      const { unlock } = await loadLocks();
      res.json({
        path: rel,
        content,
        encoding: 'utf8',
        version: contentVersion(content),
        locked: !!rule,
        lockReason: rule?.reason,
        unlock,
      });
    } else {
      // Stream with Range support so embedded <video>/<audio> can seek.
      const abs = await vault.resolveInVault(rel);
      const headers: Record<string, string> = {};
      // `?download=1` (FR-22): save it under its own name instead of letting the
      // browser name it after the URL — `/api/files/content?path=…` otherwise
      // lands as `content`, with no extension, and nothing can open it.
      if (wantsDownload(req.query.download)) {
        headers['Content-Disposition'] = attachmentDisposition(path.posix.basename(rel));
      }
      await sendFileWithRange(req, res, abs, mimeFor(rel), headers);
    }
  })),
);

filesRouter.put(
  '/content',
  mutationHandler(async (req, res) => withDraftScope(req.method==='GET'?req.query.draftScopeId:req.body?.draftScopeId,async()=>{
    const { path: rel, content, baseVersion } = req.body ?? {};
    if (typeof rel !== 'string' || typeof content !== 'string') {
      res.status(400).json({ error: 'path and content required' });
      return;
    }
    // Optimistic lock (compare-and-set), same contract as the Agent API's
    // base_version: only checked when the caller sends baseVersion — omitting
    // it keeps the old last-writer-wins autosave behaviour byte-for-byte. When
    // baseVersion IS sent, a missing file only satisfies baseVersion === '' —
    // otherwise a card move racing a delete would silently recreate the note.
    let conflict: string | undefined;
    await vault.mutateFileText(rel, current => {
      if (typeof baseVersion === 'string') {
        const check = checkVersion(current, baseVersion);
        if (!check.ok) {
          conflict = check.currentVersion;
          throw Object.assign(new Error('version_conflict'), { status: 409, currentVersion: conflict });
        }
      }
      return { content, result: undefined };
    }).catch(error => {
      if (conflict === undefined) throw error;
    });
    if (conflict !== undefined) {
      res.status(409).json({ error: 'version_conflict', currentVersion: conflict });
      return;
    }
    await reindex({ upsert: rel, added: rel });
    res.json({ ok: true, path: rel, version: contentVersion(content) });
  })),
);

filesRouter.post(
  '/folder',
  mutationHandler(async (req, res) => {
    const { path: rel } = req.body ?? {};
    if (typeof rel !== 'string') {
      res.status(400).json({ error: 'path required' });
      return;
    }
    await vault.createFolder(rel);
    await reindex({added:rel});
    res.json({ ok: true, path: rel });
  }),
);

filesRouter.post(
  '/upload',
  upload.single('file'),
  mutationHandler(async (req, res) => {
    const dir = String(req.body?.dir ?? '');
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'file required' });
      return;
    }
    // `dir` arrives in the multipart body, which only exists after multer has run — so unlike
    // every other write route this one is checked here rather than in the router middleware.
    const verdict = await sessionMayWrite(req, path.posix.join(dir, file.originalname));
    if (!verdict.ok) {
      const { unlock } = await loadLocks();
      res.status(423).json({ error: 'locked', path: dir, reason: verdict.reason, unlock });
      return;
    }
    // Reuse an existing folder that differs only in case (e.g. an Obsidian vault's
    // "Attachments") instead of creating a duplicate "attachments". See vault.ts.
    const rel = await vault.withVaultMutation(async () => {
    const resolvedDir = dir ? await vault.resolveDirCaseInsensitive(dir) : '';
    // Never overwrite an existing attachment: pick image.png, image-1.png, image-2.png, …
    const original = path.posix.basename(file.originalname.replace(/\\/g, '/')) || 'file';
    const ext = path.posix.extname(original);
    const stem = ext ? original.slice(0, -ext.length) : original;
    let rel = path.posix.join(resolvedDir, original);
    for (let i = 1; await vault.exists(rel); i++) {
      rel = path.posix.join(resolvedDir, `${stem}-${i}${ext}`);
    }
    await vault.writeFileBuffer(rel, file.buffer);
    await reindex({added:rel});
    return rel;
    });
    res.json({ ok: true, path: rel, size: file.size });
  }),
);

filesRouter.patch(
  '/rename',
  mutationHandler(async (req, res) => {
    const { from, to } = req.body ?? {};
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from and to required' });
      return;
    }
    await vault.rename(from, to);
    if (!indexing.isStarted) await qmd.rename(from, to);
    await onFileRenamed(from, to).catch(() => {}); // keep public share links pointing at the note
    await reindex({ added: to, removed: from });
    res.json({ ok: true, from, to });
  }),
);

filesRouter.post(
  '/copy',
  mutationHandler(async (req, res) => {
    const { from, to } = req.body ?? {};
    if (typeof from !== 'string' || typeof to !== 'string') {
      res.status(400).json({ error: 'from and to required' });
      return;
    }
    const copied = await vault.copy(from, to);
    for (const f of copied) await reindex({upsert:f,added:f});
    res.json({ ok: true, from, to });
  }),
);

// --- Trash (FR-1) -----------------------------------------------------------
// Listed/mutated via dedicated /trash* routes; the plain DELETE / below either
// trashes or permanently removes depending on settings.vault.deleteMode.

filesRouter.get(
  '/trash',
  asyncHandler(async (_req, res) => {
    res.json({ items: await vault.listTrash() });
  }),
);

filesRouter.post(
  '/trash/restore',
  mutationHandler(async (req, res) => {
    const rel = String(req.body?.path ?? '');
    if (!rel) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const restored = await vault.restoreFromTrash(rel);
    await reindex({ upsert: restored, added: restored });
    res.json({ ok: true, restored });
  }),
);

// Permanently delete one trashed item.
filesRouter.delete(
  '/trash/item',
  mutationHandler(async (req, res) => {
    const rel = String(req.query.path ?? '');
    if (!rel) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    await vault.deleteFromTrash(rel);
    res.json({ ok: true });
  }),
);

// Empty the whole trash.
filesRouter.delete(
  '/trash',
  asyncHandler(async (_req, res) => {
    await vault.emptyTrash();
    res.json({ ok: true });
  }),
);

// Notes (other than `exclude`) that still reference the given attachment — used
// to protect shared attachments before deleting the file from an image's trash icon.
filesRouter.get(
  '/references',
  asyncHandler(async (req, res) => {
    const target = String(req.query.path ?? '');
    const exclude = String(req.query.exclude ?? '');
    if (!target) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const abs = target.toLowerCase();
    const base = (abs.split('/').pop() ?? abs).toLowerCase();
    const refs: string[] = [];
    for (const note of await vault.listMarkdownFiles()) {
      if (note === exclude) continue;
      let text: string;
      try {
        text = await vault.readFileText(note);
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      if (!lower.includes(base) && !lower.includes(base.replace(/ /g, '%20'))) continue;
      const dir = path.posix.dirname(note);
      const targets: string[] = [];
      for (const m of text.matchAll(/\[\[([^\]|#]+)[^\]]*\]\]/g)) targets.push(m[1]);
      for (const m of text.matchAll(/\]\(([^)\s][^)]*?)(?:\s+"[^"]*")?\)/g)) targets.push(m[1]);
      const hit = targets.some((raw) => {
        let t = raw.trim().replace(/^<|>$/g, '').split('#')[0];
        try {
          t = decodeURIComponent(t);
        } catch {
          /* keep raw */
        }
        if ((t.split('/').pop() ?? t).toLowerCase() !== base) return false;
        // Bare basename (wikilink / vault-wide lookup) → conservatively a reference.
        if (!t.includes('/')) return true;
        const fromRoot = path.posix.normalize(t.replace(/^\/+/, '')).toLowerCase();
        const fromNote = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, t)).toLowerCase();
        return fromRoot === abs || fromNote === abs;
      });
      if (hit) refs.push(note);
    }
    res.json({ references: refs });
  }),
);

filesRouter.delete(
  '/',
  mutationHandler(async (req, res) => {
    const rel = String(req.query.path ?? '');
    if (!rel) {
      res.status(400).json({ error: 'path required' });
      return;
    }
    const s = await getSettings();
    if (s.vault.deleteMode === 'permanent' || req.query.permanent === '1') {
      await vault.remove(rel);
      await vault.pruneEmptyAttachmentsDir(rel);
      await reindex({ removed: rel });
      res.json({ ok: true, deleted: rel });
      return;
    }
    const dest = await vault.trash(rel);
    await vault.pruneEmptyAttachmentsDir(rel);
    await reindex({ removed: rel });
    res.json({ ok: true, trashed: dest });
  }),
);
