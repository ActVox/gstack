# ActVox GStack maintenance

The team release is `ActVox/gstack:main`. Upstream is `garrytan/gstack:main`.
The tested runtime is pinned in `.mise.toml`; the central version-drift test
covers CI, images, bootstrap instructions and native qualification inputs.

## Keep the release current

1. Check the upstream version and commit at least daily. Record the actual
   executable, active checkout, generated host views and team branch separately.
   A higher fork version alone does not prove that upstream fixes were integrated.
2. Integrate a pinned upstream commit in a clean branch or checkout. Preserve
   unrelated edits and retain the previous runtime, configuration and renders.
3. Preserve the fork's GitHub-hosted runners, default paid-eval gate, opt-in lean
   profile, full methodology sections, host-specific naming and invocation policy.
   Review upstream renames before regenerating installed skill links.
4. Run the free suite and affected native/generator checks. Historical receipts
   remain historical; changed source or runtime inputs require fresh qualification.
   Promote through a reviewed PR and preserve upstream ancestry in the merge.
5. Build the runtime, render each host separately into a staging directory,
   validate every mapped skill and link, then activate the complete render.
   Keep the checkout and generated views separate. Verify fresh host discovery
   and a browser smoke test before recording activation as complete.

GStack itself does not synchronize arbitrary workstation customizations. A host
with a curated renderer must use that renderer for activation; generic setup or
`gstack-config gbrain-refresh` can relink skills and replace curated discovery.
Record the active source and upstream commit in the host's release manifest.

## GBrain boundary

A local GBrain executable may be a thin client of Team GBrain. Resolve the actual
endpoint, identity and source before reading or writing; two aliases for one
endpoint do not create two databases. Use one canonical alias per connection.
Keep private data separate and promote sanitized shared knowledge deliberately.

At task start, recall bounded relevant context. At completion, save a compact
durable result with evidence and source identity, and verify the receipt. Read
the canonical page before replacing it; serialize competing edits when revision
preconditions are unavailable. Git owns code and source files; assign one
ingestion owner to each repository-backed GBrain source.

Coordinate GBrain server, worker, cron and schema upgrades under its own
[fork deployment policy](https://github.com/ActVox/gbrain/blob/master/docs/operations/fork-upstream-production-branching.md).
Verify a database restore before migration and retain a compatible recovery
point. Updating GStack or Team GBrain does not update native agent applications
on other machines or prove their behavior; those hosts need their own evidence.
