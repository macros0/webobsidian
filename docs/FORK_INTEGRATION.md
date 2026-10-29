# Community integration — 2026-10-29

Repository: `macros0/webobsidian`. This import does not deploy to any existing service or access
the operator's vault. Local checkout: `C:\Users\alexey\ai-workspace\webobsidian`.

## Pinned sources and attribution

| Remote | Revision | Role |
| --- | --- | --- |
| `upstream` (`xnohat/webobsidian`) | `c41967a93317b2a0f08511c349ef3dbaf78fc882` | Original project |
| `phamtruonghung` | `80106c6818fa44f7f92c8d894c7da71717c1980b` | Integration base |
| `lakylekidd` | `340af34a98bbc47e5a72fbf7976bb22cddb99f48` | Second merge parent |

Both source tips remain ancestors through a real merge. Original commit authors and MIT license
are retained. Source-specific deployment/issue documents are historical; use this fork explicitly
for GitHub operations. Deployment and scheduled upstream-issue workflows are guarded to the
Pham source repository. Desktop release publishing targets `macros0` and requires a tag/manual run.

## Preserved features and conflict decisions

- Pham: auth and path safeguards, locks and unlock flows, versioned writes, PDF viewer and binary
  downloads, tasks/board/timeline, templates, preview tabs, themes, CLI, MCP and existing tests.
- Lakyle: manual explorer sorting, rename and quick actions, floating outline, multi-cursor and
  hanging-indent editing, local attachment folders, link cards, external embeds and trash retention.
- File content routes resolve note-relative attachments while retaining missing-file 404s,
  lock metadata, content versions, PDF MIME/range responses and explicit download disposition.
- Editor contains both the lock banner and outline; PDF and external-media live widgets coexist.
  Local image references preserve subdirectories rather than collapsing to a basename.
- Tree retains lock badges and new quick-delete actions. Rename hook and unlock header plumbing
  coexist in the store; preview-tab behavior is preserved.
- Markdown keeps the PDF handler and adds the external-embed transform. Theme styles from both
  forks are retained with Pham's theme variables. Source documentation histories are retained.
- Trash retention defaults to **0 (keep forever)** in the schema and UI. Existing positive
  settings remain effective. Cleanup is opt-in for new and pre-retention settings files.

## Verification

All local runtime checks use temporary directories and a loopback-only server.

| Check | Result |
| --- | --- |
| Clean `npm ci --ignore-scripts` | Pass, merged lockfile installs 955 packages |
| `npm run typecheck` | Pass: server, web, CLI, MCP |
| Desktop typecheck | Pass |
| `npm test` | Pass after review fixes: 163 server tests and 168 web tests on Windows |
| Windows symlinks | 7 tests skipped; six use an EPERM capability probe, one inherited platform skip |
| `npm run build` | Pass: web production assets, server, CLI and MCP |
| Desktop bundle build | Pass; installer packaging/signing not requested |
| `node scripts/integration-smoke.mjs` | Pass: auth, default retention, relative PDF, ranges/downloads, lock-protected mutations, stale-write rejection, SPA |

The same six symlink fixture creations failed on the unmerged Pham baseline because Windows lacks
symlink privilege. Linux CI runs those tests without the Windows capability skip, plus the inherited
auth/symlink/Agent API/MCP/graceful-shutdown smoke script and Docker build.

`npm audit` reports **43 affected dependency entries** (9 critical, 23 high, 9 moderate, 2 low)
at integration time. These are inherited dependencies, not 43 validated reachable exploits.
They include runtime and development/desktop dependencies; remediation needs a separate dependency
review, including major upgrades of simple-git, Vitest and electron-builder. No automatic audit fix
or production upgrade was performed. Passing tests do not establish that the fork is safe to expose.

## Updating the integration

Fetch `upstream`, `phamtruonghung` and `lakylekidd` explicitly. Merge reviewed source commits into
a feature branch, record their new SHAs here, rerun the checks above, and review before changing
the main branch. Do not use source-repository GitHub sync for a notes vault.

## Execution ledger

- Baseline: Pham typecheck passed; six Windows symlink fixture failures predated the merge.
- RED/GREEN: safe-retention regressions failed before importing the retention setting and passed
  after defaulting it to zero. New cross-feature rename/unlock/preview tests passed.
- Ruling: capability-skip Windows EPERM only; keep full symlink assertions active on Linux.
- Ruling: use a dedicated clone as isolation; no separate worktree is needed for a new repository.
- Ruling: publish a reviewable branch/PR; existing installations stay unchanged.
- Independent review found three integration regressions, now covered and fixed:
  image deletion from locked/reading notes (including locking/navigation during confirmation),
  PDF tab paths losing the originating note context, and inline-created notes/canvases replacing
  a preview instead of opening permanently. Image deletion logic was extracted for behavioral
  tests; the widget hides/guards its delete control in read-only views.
- Review considered but deferred inherited HTML split/transclusion attachment-directory resolution
  and the inherited unlock-compartment effect dependency. These are source-fork limitations rather
  than merge regressions; dependency advisories remain a separate follow-up.
- First Linux CI: Docker build passed; unit tests and 30/31 inherited smoke assertions passed.
  The sole failure was the old hardcoded health version `0.1.1` versus imported `0.3.0`.
  The smoke test now reads the expected version from the package manifest.
- Final Linux CI and full regression results are recorded after the fix commit.
