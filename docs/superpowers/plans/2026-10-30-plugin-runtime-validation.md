# Plugin runtime validation and deployment record

Date: 2026-10-30, Europe/Moscow. Status: implemented and deployed at 19:30 MSK as `plugin-runtime-9661c2201e71`.

## Fixture and boundaries

Read-only snapshots of four installed plugin versions were copied into gitignored
`.superpowers/sdd/2026-10-30-plugin-runtime-fixes/fixtures`. Their manifests, main
JavaScript and optional CSS were copied; data.json, desktop enable preferences,
user notes and production credentials were excluded. SHA-256 inventory is stored
in the fixture directory for reproducibility.

| Id | Version | main.js bytes |
|---|---|---:|
| advanced-canvas | 6.0.0 | 368265 |
| automatic-table-of-contents | 1.8.0 | 9307 |
| editing-toolbar | 3.2.7 | 668076 |
| templater-obsidian | 2.18.1 | 339564 |

The original diagnosis used a synthetic plugin under production-equivalent CSP.
It reproduced EvalError/blocked eval; a control without CSP loaded the plugin.
A 401 HTML asset was misclassified as incompatible API. See the earlier review
document and its diagnostic evidence for that baseline.

## Compiler validation

All four real main.js files passed `compilePluginModule` using Node vm.Script as
a syntax-only parser and producing an ESM default factory. Their code was not
executed on the server. This approach is a recorded implementation ruling: it
avoids adding an esbuild native runtime dependency while retaining syntax
validation and same-origin module loading under the existing CSP.

Command: `node --import tsx .superpowers/sdd/2026-10-30-plugin-runtime-fixes/compile-fixtures.mjs`.

## Isolated browser validation

The actual new loadPlugins/manager/shim ran in a sandboxed Electron browser with
Node integration disabled, context isolation enabled, production-equivalent CSP
and all requests outside the local fixture origin blocked. The API used only a
synthetic Markdown note and canvas entry. It did not receive production cookies,
keys, settings or data.

Initial results:

| Plugin | Stage | Actual failure |
|---|---|---|
| Advanced Canvas | instantiate | unsupported-module: @codemirror/view |
| Automatic Table Of Contents | onload | unsupported-api: plugin settings tabs |
| Editing Toolbar | instantiate | unsupported-api: obsidian.moment |
| Templater | instantiate | unsupported-api: obsidian.FuzzySuggestModal (after interop correction) |

Every case had zero CSP violations, zero synthetic note writes and zero remaining
command registrations after stop. None reached its feature action, so none is
claimed compatible. An initial Templater probe caught __esModule packaging metadata being mistaken
for a missing API. The interop flag was corrected. A second probe exposed a
TypeError from a copied module namespace losing missing-export diagnostics;
throwing enumerable capability descriptors now expose the real limitation,
obsidian.FuzzySuggestModal. The final four-plugin run reports the table above.
No real plugin feature action completed, so no full plugin is claimed supported.

Command: `node .superpowers/sdd/2026-10-30-plugin-runtime-fixes/real-browser-probe.mjs`.
Evidence JSON and the fixture runner remain in the gitignored task workspace.

## Release gates

- Targeted server/browser tests, broad suites, typecheck and builds.
- Independent final review of module delivery, lifecycle, versioned writes and
  DATA_DIR isolation.
- A separate Linux container using the exact final runtime: strict CSP, actual
  compiler endpoint, authenticated/unauthenticated access, fixture data roundtrip,
  MCP compatibility, and offline/warm indexing.
- Backup DATA_DIR/config before production replacement; preserve settings bytes,
  runtime memory limits, polling/MCP configuration and prior image for rollback.
- After activation verify ready index, exact ЕЦП note path, public HTTPS health,
  CSP and unauthenticated MCP protection. No production note writes.

Deployment preparation is in gitignored `pack-release.py` and `final-deploy.py`.
Their final preflight and production activation are recorded below.

## Functional synthetic-plugin browser regression

`web/tests/pluginApiBrowser.test.ts` passes in an isolated sandboxed Electron
browser using the real shim and registration registry. It verifies a command
callback executes, a Markdown processor changes the DOM, unload removes both,
Setting.setValue().onChange() drives a real input, Markdown filtering and missing
lookup work, and plugin data survives a new instance. Writes require the captured
vault scope. Create-existing uses baseVersion empty and fails without overwriting;
read then external edit then modify fails with 409. Re-reading the same TFile with
a changed version is rejected rather than replacing its unconsumed pin; an
explicit fresh TFile/read can then modify using the new version.

This verifies actual actions of the supported API subset; it does not substitute
for the real-plugin limitations in the matrix.

## Final validation and independent review

Parent-coordinated release gates: server **283 passed / 10 skipped** (38 files),
web **417 passed**, MCP **3 passed**; workspace typechecks, full build and desktop
bundle build passed. Windows-skipped symlink behavior was additionally exercised
in the Linux release preflight.

The server code was reviewed independently by the validation agent; the browser
code was reviewed independently by the server agent. Server review found two
material diagnostic integration issues: broken enabled bundles disappeared from
the catalog, and compile errors could be shown as plain HTTP errors. Broken
entries now retain sanitized availability errors, and the web loader recognizes
the compiler error prefix as syntax. A missing enabled entry can be disabled.

The final real-plugin browser matrix was repeated using the exact copied manifest
metadata as well as exact main.js bytes. All four limitations remained as in the
table, with zero CSP violations, zero synthetic note writes, and zero remaining
commands after cleanup. No tested real plugin is claimed functionally compatible.

## Exact release Linux preflight

The final archive SHA-256 is
`9661c2201e71dd176c36caf2e6ec2598632176324ffbaff5ca47b698c7e41eff`.
Image: `webobsidian:plugin-runtime-9661c2201e71`.
Image ID: `sha256:9dca67150ba55e28a461bc3cb3baa23a39c727df408d5a2887b4e1de9249d69a`.

The exact runtime was tested in a disposable Linux container with a synthetic
vault under the existing 384 MiB container / 256 MiB heap constraints:

- A fixture CommonJS plugin compiled through the real authenticated runtime.mjs
  route; an unauthenticated request was rejected with 401.
- The fixture plugin's web data round-tripped. An application/json PUT exceeding
  1 MiB was rejected with 413 before replacing stored data.
- A symlink planted only in the fixture web-data path was rejected with 400;
  its external synthetic target remained unchanged. The fixture file was restored.
- The fixture desktop `.obsidian/plugins/preflight-plugin/data.json` remained
  byte-for-byte unchanged after web data operations.
- The served CSP retained its strict script policy without unsafe-eval.
- Remote MCP initialize, all 10 tools and actual search passed.
- An addition while stopped was found after warm restart; ready status had zero
  errors. The second startup indexed both synthetic notes.

The temporary container, anonymous volumes and synthetic vault were removed.
No production note or plugin data was used in this preflight.

## Production activation — 19:30 MSK

Source/runtime release directory:
`/opt/webobsidian/releases/plugin-runtime-9661c2201e71`.
Backup:
`/opt/webobsidian/backups/plugin-runtime-9661c2201e71-20261030T163021Z`.

Production was stopped gracefully; settings bytes were captured after shutdown,
and DATA_DIR plus environment/Compose/revision files were backed up. The previous
image `webobsidian:indexing-watch-85f8953589ac` remains available. The script can
restore the previous Compose/revision/settings and restart the previous image if
any acceptance check fails. Rollback was not needed.

Verified after activation:

- Docker healthy, OOMKilled=false; observed memory 43.92 MiB / 384 MiB.
- Index ready: 65 notes, empty queue, zero errors and no persistence error.
- Authenticated web search ЕЦП returned `Работа/СЭДО СФР/ЕЦП.md`.
- Catalog returned the four exact enabled plugin versions. Their runtime module
  routes compiled successfully; this did not execute their code on the server.
- Existing CSP remained without unsafe-eval. Public HTTPS health reported the new
  build, and public unauthenticated MCP remained protected with 401.
- Settings compared byte-for-byte unchanged. Container memory/swap/heap, polling,
  MCP URL and MCP enabled configuration were preserved.

Acceptance requests used a short-lived owner JWT minted and consumed only inside
one container process from the existing secret. Neither secret nor token was
printed or saved. No production API key or password was created or changed.
Production notes, desktop plugin code/data/enable preferences, Nginx Proxy Manager
and MikroTik configuration were not modified by deployment. No git commits or
pushes were performed in the shared dirty checkout.
