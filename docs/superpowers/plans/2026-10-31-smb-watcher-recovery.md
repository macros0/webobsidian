# SMB watcher recovery installation plan

**Current state, 2026-10-31:** This custom plugin is now disabled, with files retained for rollback. The user subsequently requested testing SMB Vault Watcher; it passed external text-update tests and is enabled instead. See [community validation](2026-10-31-smb-watcher-community-validation.md).

> Execution: inline using superpowers:executing-plans. User approved installation of the previously described scoped workaround on 2026-10-31; no further design approval is needed.

**Goal:** Restore external file notifications in Windows Obsidian without restarting it after each change.

**Spec / agreed design:** Desktop-only local plugin, active only on DESKTOP-E4B34S6 and `\\10.10.1.5\obsidian\vaults`. Recreate a failed root watcher after layout readiness. Wrap the actual adapter.fs.watch just during creation, then restore it. Permit only the first native callback to suppress UNKNOWN (-4094), only in the first five seconds; later errors pass to the original handler. Restore callbacks on disable. Never write notes. Feature-detect private APIs and show a notice if incompatible. Android is excluded.

**Approaches:** User chose the previously tested native-watcher recovery. Alternative community project [SMB Vault Watcher](https://github.com/moorej2400/obsidian-smb-watcher) uses periodic scans and undocumented reconcileFile; its README says desktop only and manual installation. Folder Bridge provides external mounts and polling, a broader change than needed here. No claim that the community catalog has been exhaustively searched.

**Tech stack / files:** Standalone CommonJS main.js plus manifest.json and README.md under the session artifact directory `smb-watch-recovery`; Node test runner uses a mocked Obsidian host. Install only these three files into `.obsidian/plugins/synology-watch-recovery`, preserving the enabled-plugin list and backing it up outside the vault.

**Review focus:** First successful event prevents later suppression; a second error must close normally; other hosts/platforms/vaults must stay untouched; unsupported internals must fail visibly; unload must restore handlers even during startup.

- [x] Verify regression tests fail, implement plugin and pass scoped lifecycle/error tests.
- [x] Back up enabled-plugin config, install and enable plugin; preserve all existing IDs.
- [x] Test a fresh Obsidian startup, server-side create/modify/rename/delete of disposable notes, disable/enable, and a second startup. Clean up fixtures and diagnostic listener; leave normal Obsidian running. Modification has the separate limitation below.
- [x] Record results and rollback instructions. No commit, push, or WebObsidian product code changes.

## Verification ledger — 2026-10-31

Seven Node tests pass. Read-only reviewer identified an unclosed newly created watcher on an unsupported callback; regression failed before adding close(), then all seven passed. Reviewer verified the correction.

Installed main.js SHA256: `65099CE4AEE5569A140266D48C9A4C78A94BC37676BB176353F7F6D586D0E4B8`. Existing four enabled plugins retained. Backup: session artifact directory `smb-watch-recovery/community-plugins.before-install.json`. Disable under Settings → Community plugins → Synology Watch Recovery; restart to remove its startup effect. Normal runtime callbacks are restored on unload; an already healthy watcher remains active.

Actual Obsidian recovered once on each of two fresh starts. NFS create, rename and delete all reached Obsidian; the original deletion symptom passed again after the second start. Disable/enable retained a healthy watcher. Evidence: `smb-watch-recovery/live-result.json`; six successful checks and separate modification diagnostic. Fixtures were cleaned and the diagnostic app quit before normal Obsidian was launched without debugging flags.

**Known remaining limitation:** in-place NFS writes and atomic replacement (the WebObsidian text-save approach) did not refresh an already open note within 20 seconds. The native watcher delivered events, while Obsidian's stored stat remained old (76 bytes); later filesystem stat saw the new file (85 bytes). SMB metadata caching/reconciliation timing is a hypothesis, not a proven fix. No polling, delayed reconciliation, or NAS setting changes were added. Installation of the agreed startup workaround is complete; this broader modification issue remains open.

Community alternative found: SMB Vault Watcher polls whole-vault metadata (default 15 seconds) and calls internal reconcileFile. Its README specifies desktop-only support and manual installation. It was not installed or tested on this vault; catalog inclusion was not verified. Android still needs separate investigation of its synchronization mechanism.
