# Indexing implementation validation and deployment record

Date: 2026-10-30. **Deployment status: deployed and verified at 18:43 MSK.**

This record concerns the new cached startup/index coordinator. The production
image previously deployed for the startup search fix remains the rollback release.
See `2026-10-30-remote-mcp-deployment.md` for the actual server topology and image.

## Local validation

Web targeted checks: `node --import tsx --test web/tests/indexStatus.test.ts
web/tests/searchRefreshBrowser.test.ts` — 4 passed. Actual Electron rendering
covers unchanged-query refresh after external revision, late result/snippet
suppression, reconnect invalidation and readiness errors instead of zero notes.
`npm --workspace web run typecheck` passed.

The Windows sandbox fails inside Node/tsx `os.userInfo` with
`uv_os_get_passwd ENOMEM`; the same commands succeed with approved execution
outside the sandbox. This is separate from benchmark resource measurements.

## Synthetic resource measurements

Command: `node scripts/indexing-benchmark.mjs`. Node v26.3.0, Windows, local
temporary disk, worker heap limit 256 MiB. HTTP probes use a minimal in-process
status endpoint; they measure event-loop responsiveness, not a real reverse proxy
or the complete production request path. Watcher is disabled to isolate indexing.
Source TypeScript runs through tsx, so repeat compiled-production measurements
on Linux and the intended NAS before deployment.

Initial full dataset run (10,000 × 4 KiB plus 100 × 128 KiB):

| Mode | Time | Markdown reads | Peak RSS | Observed heap | HTTP p95 / max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold, initial implementation | 13.00 s | 10,100 | 418.44 MiB | 250.02 MiB | 0.84 / 213.96 ms |
| Cold, compiled initial implementation | 14.41 s | 10,100 | 448.19 MiB | 251.71 MiB | 0.89 / 197.96 ms |

**This run exceeded the 384 MiB RSS acceptance limit and stopped before warm/churn
checks. It is not deployment acceptance.** Investigate retained strings and
snapshot/restore duplication, then rerun the same benchmark. Do not increase
production memory limits silently.

The compiled run uses `npm --workspace server run build` followed by
`node scripts/indexing-benchmark.mjs --compiled`, avoiding tsx loader overhead.
Investigation identified gray-matter's default global cache retaining full input
strings and parsed results (`matter(raw)` caches, `matter(raw, {})` bypasses this
cache). The implementation team must verify the parser fix with regression tests
and rerun measurements; this record does not treat the diagnosis as a passed gate.

### After memory corrections

Rebuilt the server and repeated `node scripts/indexing-benchmark.mjs --compiled`
with the full dataset and 10 churn cycles. Exit code **0**; the temporary fixture
was removed. The parser bypasses gray-matter's global text cache, short snippets
own their short strings, and snapshot restore/serialization avoids duplicated
full-index allocations.

| Mode | Time to initial verification | Initial Markdown reads | Peak RSS | Observed heap | HTTP p95 / max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Cold | 13.86 s | 10,100 | 325.04 MiB | 192.14 MiB | 1.02 / 147.99 ms |
| Warm | 1.66 s | 0 | 344.76 MiB | 209.77 MiB | 1.13 / 126.68 ms |
| Churn, initial warm verification | 1.62 s | 0 | 369.69 MiB | 215.65 MiB | 0.71 / 337.41 ms |

Every churn cycle deleted/recreated/modified 20% of small notes, processed queued
updates, performed a complete rebuild, then closed/reopened the coordinator from
its saved snapshot. All ten cycles retained 10,100 indexed notes. Cycle-end RSS
was 334.71, 333.70, 341.45, 341.24, 337.47, 344.24, 345.18, 346.73, 342.55 and
344.84 MiB; heap was approximately 149–160 MiB. Cycle times ranged 16.71–26.47 s.
This run passed the 384 MiB RSS/256 MiB heap gate for this synthetic Windows test.
It does not establish Linux-container or real-NAS acceptance, and a 337 ms
synchronous stall remains observable during heavier maintenance.

Small smoke fixture (100 × 4 KiB plus the same 100 × 128 KiB) passed:
cold 827 ms/200 reads, warm 106 ms/0 reads, one churn cycle 735 ms. These numbers
validate the harness and cache reuse; they do not replace full-dataset checks.

## Before deployment

- Complete final test/build and independent review evidence in the implementation
  ledger, including all unresolved limits and skipped checks.
- Pass resource checks for cold, warm, repeated churn/restarts and concurrent
  rebuilding under the existing 384 MiB container/256 MiB heap limits.
- In a separate NAS fixture test SMB writes observed through Linux NFS: add,
  edit, rename, delete, offline changes and warm restart; verify web and MCP.
  Do not interrupt the production mount to simulate failures.
- Save DATA_DIR/configuration backup and current image, deploy a distinct image,
  compare settings, verify health, readiness, ЕЦП search and an external fixture.
- Record the image, backup, actual measurements and cleanup. Roll back to the
  previous image if acceptance fails; keep the previous cache for compatibility.

## Isolated Linux/NAS verification — 2026-10-30, 18:34–18:38 MSK

Built and ran a separate image `webobsidian:indexing-watch-check-20261030`
(`sha256:5c780e960eaca5ed8bb138bd97d0ac18d97d61a55655428763defcb306a77e6a`)
from the existing production image plus the current compiled runtime bundle
`.superpowers/sdd/2026-10-30-indexing-watch/runtime/server/index.mjs`, SPA assets,
and MCP dist. Production was not activated, stopped, or reconfigured.

The temporary container used 384 MiB memory, 768 MiB memory+swap,
`NODE_OPTIONS=--max_old_space_size=256`, polling, and loopback-only port 18787.
Its own empty NAS folder lived outside the production vault:
`\\DiskStation\obsidian\.indexing-watch-check-20261030T1832` on Windows,
`/mnt/obsidian/.indexing-watch-check-20261030T1832` in CT102. Windows wrote over
SMB; the Linux container observed the same files through NFS. All content and
credentials were disposable fixtures.

Verified the same query through Agent REST, session-authenticated web search API,
and an actual remote MCP `initialize` + `tools/call search_notes` exchange:

| Scenario | Result | Observed poll wait |
| --- | --- | ---: |
| SMB add `External.md` | Correct new path in all three APIs | 20.41 s |
| SMB edit | New term found; old term no longer found | 6.93 s / 0.03 s |
| SMB rename to `Renamed.md` | Correct new path; old path absent | Eventually passed after confirmation period |
| SMB delete | No remaining matches | 31.28 s |
| Add `Offline.md` while container stopped, then warm restart | Ready, one indexed note, correct result in all three APIs | 0.08 s after readiness |
| Second warm restart without changes | New generation, ready, same correct result | 0.08 s after readiness |

These are fixture poll waits after an SSH invocation, not end-to-end latency
bounds. A single-file rename/delete meets the >=50% disappearance safeguard and
therefore deliberately waits for another successful scan. The rename harness's
initial 25-second convergence window was too short; a later repeat passed. The
first high-frequency polling sequence also hit the normal 120/min API limit;
only the disposable container's limit was increased to 1000/min. Production's
limit was untouched. Readiness polling waits for `initialScanComplete` and
`phase=ready`; search polling treats 503 as retryable, never as a zero-result
success. No claim is made that this tiny fixture observed the startup 503 window
itself; route/MCP tests cover that contract.

The small fixture persisted `/data/vault-index-v1.json` (1569 bytes with one note).
After the offline-change restart the status had no errors or persistence failure.
Observed Docker memory was 41.96 MiB / 384 MiB, `OOMKilled=false`; this is a small
fixture measurement and does not replace the full-dataset resource benchmark.
This check exercised the web API, not visual browser rendering.

Cleanup verified: removed only the temporary container with its anonymous data
volumes, temporary key/cookie state file, fixture note, and now-empty NAS folder.
The test image and nonsecret diagnostic script were retained for reproducibility.
At the end of this isolated check production still used `webobsidian:search-refresh-f466341e0d32`; the later activation is recorded below.


## Final release preflight and production activation — 2026-10-30, 18:43 MSK

Deployed image: `webobsidian:indexing-watch-85f8953589ac`.
Image ID: `sha256:cfcf0751a489e0c831ac37c9307370494ecf39e244ccccf4075412fab21e0c23`.
Source/runtime archive SHA-256:
`85f8953589ac49a670da2bea1f8a10522ae86580c213cd9e7884425e391eebf5`.
Release directory: `/opt/webobsidian/releases/indexing-watch-85f8953589ac`.
The release contains the final compiled runtime from 18:42, including the
note-count-based maintenance threshold, latest SPA/MCP dist, and source files.

Before activation, the exact final image passed a separate Linux container
preflight under 384 MiB / 256 MiB heap: ready status, authenticated session search,
remote MCP initialize, all ten tools, and actual MCP search. An offline fixture
addition followed by warm restart was found with ready status and zero errors.
The first preflight attempt had a test-client Host/port mismatch (MCP 403); the
fixture URL was corrected to match its internal request port and the complete
preflight then passed. This was a diagnostic harness correction, not a server
configuration change. The disposable preflight container, volumes and files were
removed before production activation.

Production was stopped gracefully for a consistent backup; settings bytes were
captured after shutdown. Backup:
`/opt/webobsidian/backups/indexing-watch-85f8953589ac-20261030T154336Z`.
It contains DATA_DIR and the existing environment/Compose/revision files; access
to the backup directory is restricted to its owner. The prior image is retained:
`webobsidian:search-refresh-f466341e0d32`. The deploy script implements automatic
rollback on failed health, readiness, expected note search, settings comparison,
resource comparison or public HTTPS checks. Rollback was not needed.

Post-activation verification:

- `/healthz` reports the new release locally and through public HTTPS.
- Docker healthcheck is `healthy`.
- Index status: `ready`, 65 indexed notes, polling, empty queue, zero errors,
  `initialScanComplete=true`, no persistence error.
- The actual authenticated web search for `ЕЦП` returns
  `Работа/СЭДО СФР/ЕЦП.md`.
- Authentication validation used a short-lived owner JWT created and consumed
  only in a container process from the existing signing secret. Neither secret
  nor token was printed or written to a credential file; no production API keys
  were created and no password/settings changes were made.
- Public unauthenticated `/mcp` returns 401, preserving authentication.
- Settings compare byte-for-byte unchanged. Container memory/swap limits,
  NODE_OPTIONS, polling and MCP configuration match their pre-deployment values.
- Observed production Docker memory: 41.98 MiB / 384 MiB after startup.

Production notes, MikroTik rules and Nginx Proxy Manager settings were not edited
by this deployment. `DEPLOYED_REVISION` now names the new release. Git commits or
pushes were not performed because this checkout includes other ongoing changes.
