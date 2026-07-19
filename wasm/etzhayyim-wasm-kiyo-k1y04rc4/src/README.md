# kiyo src — Phase E rewrite pending

Vendor `60-apps/etzhayyim-project-kiyo/wasm/etzhayyim-wasm-kiyo-*/src/app.ts` is the production source that uses `createKyselyDb()` (RW direct write, forbidden on etzhayyim per [ADR-2605172000](../../../../90-docs/adr/2605172000-etzhayyim-kotoba-substrate.md)).

Per [ADR-2605203000](../../../../90-docs/adr/2605203000-kotoba-write-target-options.md) Phase E, **Option B** (PDS XRPC) was picked for kiyo. Rewrite follows the pattern established by:
- [ipaddress/kotoba](../../../etzhayyim-project-ipaddress/kotoba/)
- [hanrei/kotoba](../../../etzhayyim-project-hanrei/kotoba/)
- [tsukuru/kotoba](../../../etzhayyim-project-tsukuru/kotoba/)

Vendor source NOT carried over — wave-3 follow-up sub-PRs will port each command using `@etzhayyim/sdk` `e.write()` / `e.read()` replacements.

## Status

- Scaffold (this PR): CLAUDE.md, kotodama.jsonld, package.json, svelte/, wrangler.jsonc copied with sed
- Lexicons: 13 files migrated to `00-contracts/lexicons/com/etzhayyim/kiyo/`
- kotoba reference impl: deferred (Option B pattern follows etz #89 / #90)
- kiyo.etzhayyim.com deploy: NOT yet (operator stage)
- kiyo.etzhayyim.com (vendor) status: **LIVE** — wait for operator Stage 4 (routing-gateway 301) + 1-week observation before vendor rm

## Related
- ADR-2605172000 — kotoba substrate
- ADR-2605203000 — Phase E decision matrix
- vendor deps.toml [[migrations]] phase-e-kotoba-write-target-decision-2026-05-20
