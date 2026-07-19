# kiyo kotoba

Phase E Option B reference implementation of kiyo (紀要 / research archive) on the etzhayyim substrate.

Per [ADR-2605203000](../../../90-docs/adr/2605203000-kotoba-write-target-options.md) and the [kiyo design spec](../CLAUDE.md), kiyo migrates from vendor's `createKyselyDb` pattern (RW direct write) to **Option B** — PDS XRPC writes via `@etzhayyim/sdk e.write()`.

Coverage: **12 of 12 (100%)** kiyo canonical XRPC commands ported. Plus 1 helper (`listReviews`).

| Tier | Commands | Slice |
|---|---|---|
| Paper | submitPaper, getPaper, listPapers, listByAuthor, withdrawPaper, submitRevision | 1 |
| Review + Endorsement | addReview, endorsePaper, listReviews | 2 |
| Citation + Stats + Search | getCitationGraph, getPaperFile, getStats, searchPapers | **3** |

All 12 canonical kiyo lexicons now have kotoba reference impl. Wire-up
to a Worker / LangServer pod XRPC handler is the next operator task per
ADR-2605203000.

## Authority-chain DIDs (per kiyo CLAUDE.md)

```
did:web:kiyo.etzhayyim.com                            — controller
did:web:kiyo.etzhayyim.com:paper:{paperId-slug}       — this slice (Paper)
did:web:kiyo.etzhayyim.com:review:{paperId}-{seq}     — Review (future)
did:web:kiyo.etzhayyim.com:endorsement:{paperId}-{endorser-slug}  — Endorsement (future)
did:web:kiyo.etzhayyim.com:citation:{src}-{dst}       — Citation edge (future)
```

## paperId convention

```
kiyo:{YYYY}:{TID}
  e.g. kiyo:2026:lzxy1a
```

## Storage

Paper PDFs/contents are content-addressed on IPFS (`ipfs.etzhayyim.com`); the
Paper record stores the **CIDv1 only** — no inline blob. Phase 3 mst-projector
adds IPFS pin index for availability tracking.

## Pattern translation (Option B)

| Vendor (`kiyo.etzhayyim.com`) | etzhayyim (this PR) |
|---|---|
| `const db = createKyselyDb();` | `import type { Etzhayyim } from "@etzhayyim/sdk"` |
| `db.insertInto("vertex_kiyo_paper").values({...}).execute()` | `e.write({ collection: "com.etzhayyim.kiyo.paper", record, rkey })` |
| `db.selectFrom("vertex_kiyo_paper").where("paper_id","=",id).execute()` | `e.read({ collection, rkey: \`paper-${paperSlug(id)}\` })` |

## Usage

```ts
import { Etzhayyim } from "@etzhayyim/sdk";
import { submitPaper, getPaper, submitRevision } from "@etzhayyim/kiyo-kotoba";

const e = new Etzhayyim({
  did: "did:web:kiyo.etzhayyim.com",
  pdsUrl: "https://pds.etzhayyim.com",
  l2RpcUrl: "https://mainnet.base.org",
});

// Submit
const r = await submitPaper(e, {
  paperId: "kiyo:2026:lzxy1a",
  title: "Bonsai Cultivar Layer Above Myco-Yeast Substrate",
  authorDids: ["did:plc:abc...", "did:plc:def..."],
  abstract: "We propose ...",
  language: "en",
  ipfsCid: "bafybeih...",
  field: "computer-science.distributed-systems",
});
// → { status: "registered", paperUri: "at://...", did: "did:web:kiyo...paper:kiyo-2026-lzxy1a" }
```

## Why Option B for kiyo

Per ADR-2605203000 Phase E decision matrix:
- **Catalog**: structured paper metadata + IPFS-backed blob storage (open standards)
- **Write cadence**: low — manuscript submissions + revisions, not high-frequency
- **Query pattern**: by paperId / authorDid / citation edges (Phase 3 indexed views)

Option A (vendor RW mirror) rejected — ADR-2605172000 mandates kotoba.
Option C (IPFS-only) hybrid: blob → IPFS, metadata → PDS (this PR).

## What this package IS / ISN'T

**IS**:
- Reference impl of 6 kiyo commands on Option B (PDS XRPC + IPFS pointer pattern).
- Documentation of the createKyselyDb → e.write() translation.

**ISN'T**:
- A deployed Worker (scaffold-only).
- Full 12-command parity — Review / Citation / Stats tiers ship in follow-up slices.
- IPFS pinning logic — pin is a separate Worker / cron concern.

## Related

- [kiyo design spec](../CLAUDE.md) — actor architecture (XRPC + LangServer + RisingWave UDF + LangGraph)
- [ADR-2605203000](../../../90-docs/adr/2605203000-kotoba-write-target-options.md) — Phase E write-target options
- [sbom kotoba](../../etzhayyim-project-sbom/kotoba/) — sibling Option B reference (17/N)
- [hanrei kotoba](../../etzhayyim-project-hanrei/kotoba/) — Option B reference (31/31 ✓)
- [ipaddress kotoba](../../etzhayyim-project-ipaddress/kotoba/) — Option B reference (37/37 ✓)
