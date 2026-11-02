# Marker and media follow-up parity

Scope: follow-up screenshots of heading hashes, inline code in callout titles, consecutive images, embedded-note open icon, repeated PDF instances and external HTML frames. Preserve note bytes and established embed interactions.

Native evidence: isolated Obsidian 1.14.5 with copied polygon and attachments. Active heading hashes are text-faint (dark 102,102,102), callout title code is text-normal (dark 218,218,218). Consecutive 300px images touch exactly (first y250.046875 + height168.75 = second y418.796875). Single and combined page=3/rect PDF references show page3 with the page3 rectangle; raw rect does not introduce a crop in native.

Root causes and fixes:
- Nested CodeMirror syntax highlighting painted heading hashes with its meta orange despite the outer formatting mark. Scope faint color to formatting-header descendants.
- Inline code inherited its callout title color; explicitly use text-normal, matching native code behavior.
- Live Preview image base theme added 6px top/bottom margins. Remove margins, align wrapper to top; adjacent rows have zero gap and an authored blank row remains visible.
- Authored YouTube iframe was treated as a generic opaque-origin frame. Canonicalize verified YouTube hosts/11-character IDs and reuse existing trusted player permissions/referrer policy. Support privacy-host embed URLs in both provider resolvers and preserve that host. Unknown frames remain opaque; all note-supplied privileged attributes are discarded.

Confirmed browser boundary: obsidian.md sends X-Frame-Options SAMEORIGIN. Native app permits its loading; web styling cannot override that remote restriction. No proxy or framing-header bypass introduced.

Unreproduced reports: native fresh same-file PDF refs render correct page3, whereas screenshot left shows page1 and right page3; requested which embed is pictured. Embedded-note icon has two complete arrows in both original screenshot and fresh pixel crop, independently reviewed. SVG geometry, four-corner hit-testing, quoted blocks at 12/16/19px, wide editor/outline and three modes pass; no speculative icon or PDF runtime modification.

Checks: failing tests recorded before marker/image/YouTube fixes; focused browser tests pass. Real headless Chrome A/B shows old policy black, new policy native-equivalent unavailable-video message. Typecheck/build/integration pass. Independent review found no material issue in provider trust boundaries or style changes. Final full regression and deployment results are recorded with the release.

Final pre-deployment regression: 390 server tests passed (10 Windows skips), 517 web tests passed, 907 total passing; no failures. Typecheck, full build and local integration smoke passed.

Post-package record: full copied native polygon was also opened at its exact third PDF source line (page=3&rect); page3 rectangle and footer rendered. No code change needed. Deployed marker-media-b093484ffadd with backup /opt/webobsidian/backups/marker-media-b093484ffadd-20261102T062541Z; HTTPS plus seven asset hashes and both module hashes verified, YouTube policy verified inside running container, original note and fixtures unchanged.

Pre-merge review caught an additional code-fence edge case: a longer outer fence can contain literal shorter fences, and an unclosed block has no closing delimiter. Use the syntax node's CodeMark boundaries for concealment rather than a line-prefix regex. A real browser regression fails before the fix and passes afterward for backticks, tildes and unclosed blocks in both Live and Reading, with unchanged source. This correction is additional to the deployed marker/media snapshot.
