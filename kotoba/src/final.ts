/**
 * kiyo kotoba — final tier (slice 3, +4 → 13/12 = 12 vendor + 1 helper).
 *
 *   getCitationGraph  — N-hop walk over Paper.{citedPaperIds} fields
 *   getPaperFile      — Paper.ipfsCid → URL pointer (no blob fetch)
 *   getStats          — aggregate counts (papers / reviews / endorsements / by status)
 *   searchPapers      — Phase 2 client-side text match across title/abstract/tags
 *
 * Closes kiyo kotoba at canonical 12/12 vendor lexicons. citedPaperIds
 * field is added to PaperRecord here — submitPaper/submitRevision already
 * accept any extra fields via the open shape.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  paperRkey,
  type CitationEdge,
  type EndorsementRecord,
  type GetCitationGraphInput,
  type GetCitationGraphOutput,
  type GetPaperFileInput,
  type GetPaperFileOutput,
  type GetStatsInput,
  type GetStatsOutput,
  type PaperRecord,
  type PaperView,
  type ReviewRecord,
  type SearchPapersInput,
  type SearchPapersOutput,
  type PaperStatus,
} from "./types.js";

const PAPER_COLLECTION = "com.etzhayyim.kiyo.paper";
const REVIEW_COLLECTION = "com.etzhayyim.kiyo.review";
const ENDORSEMENT_COLLECTION = "com.etzhayyim.kiyo.endorsement";

const IPFS_GATEWAY = "https://ipfs.etzhayyim.com/ipfs/";
const DEFAULT_MAX_SCAN = 10_000;
const PAGE_LIMIT = 100;
const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 5;

export async function getPaperFile(
  e: Etzhayyim,
  input: GetPaperFileInput
): Promise<GetPaperFileOutput> {
  if (!input.paperId) return { error: "missingPaperId" };
  const resp = await e
    .read<PaperRecord>({
      collection: PAPER_COLLECTION,
      rkey: paperRkey(input.paperId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "paperNotFound" };
  if (!r.value.ipfsCid) return { error: "noIpfsCid" };
  return {
    paperId: input.paperId,
    ipfsCid: r.value.ipfsCid,
    url: `${IPFS_GATEWAY}${r.value.ipfsCid}`,
  };
}

export async function getCitationGraph(
  e: Etzhayyim,
  input: GetCitationGraphInput
): Promise<GetCitationGraphOutput> {
  if (!input.paperId) return { error: "missingPaperId" };
  const depth = Math.min(input.depth ?? DEFAULT_DEPTH, MAX_DEPTH);
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);

  // 1. Build a paperId → record map by scanning once.
  let cursor: string | undefined;
  let scanned = 0;
  const allPapers = new Map<string, PaperRecord>();
  while (scanned < maxScan) {
    const page = await e.read<PaperRecord>({
      collection: PAPER_COLLECTION,
      cursor,
      limit: PAGE_LIMIT,
    });
    for (const r of page.records) {
      allPapers.set(r.value.paperId, r.value);
    }
    scanned += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }

  if (!allPapers.has(input.paperId)) {
    return { error: "paperNotFound" };
  }

  // 2. BFS up to `depth` hops on citedPaperIds.
  const edges: CitationEdge[] = [];
  const visited = new Set<string>([input.paperId]);
  let frontier = [input.paperId];
  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const nextFrontier: string[] = [];
    for (const src of frontier) {
      const paper = allPapers.get(src);
      if (!paper?.citedPaperIds) continue;
      for (const dst of paper.citedPaperIds) {
        edges.push({ src, dst });
        if (!visited.has(dst)) {
          visited.add(dst);
          if (allPapers.has(dst)) nextFrontier.push(dst);
        }
      }
    }
    frontier = nextFrontier;
  }

  return {
    paperId: input.paperId,
    depth,
    nodeCount: visited.size,
    edges,
    truncated: scanned >= maxScan,
  };
}

export async function getStats(
  e: Etzhayyim,
  input: GetStatsInput = {}
): Promise<GetStatsOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);

  const [paperScan, reviewScan, endorseScan] = await Promise.all([
    scanCollection<PaperRecord>(e, PAPER_COLLECTION, maxScan),
    scanCollection<ReviewRecord>(e, REVIEW_COLLECTION, maxScan),
    scanCollection<EndorsementRecord>(e, ENDORSEMENT_COLLECTION, maxScan),
  ]);

  const byStatus: Record<PaperStatus, number> = {
    submitted: 0,
    "under-review": 0,
    accepted: 0,
    withdrawn: 0,
    rejected: 0,
    published: 0,
  };
  const byLanguage: Record<string, number> = {};
  const byField: Record<string, number> = {};
  for (const p of paperScan.records) {
    byStatus[p.value.status] = (byStatus[p.value.status] ?? 0) + 1;
    if (p.value.language) {
      byLanguage[p.value.language] = (byLanguage[p.value.language] ?? 0) + 1;
    }
    if (p.value.field) {
      byField[p.value.field] = (byField[p.value.field] ?? 0) + 1;
    }
  }

  return {
    paperCount: paperScan.records.length,
    reviewCount: reviewScan.records.length,
    endorsementCount: endorseScan.records.length,
    byStatus,
    byLanguage,
    byField,
    truncated:
      paperScan.truncated || reviewScan.truncated || endorseScan.truncated,
  };
}

export async function searchPapers(
  e: Etzhayyim,
  input: SearchPapersInput
): Promise<SearchPapersOutput> {
  if (!input.query) return { items: [], total: 0 };
  const limit = Math.min(input.limit ?? 20, 50);
  const resp = await e.read<PaperRecord>({
    collection: PAPER_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const q = input.query.toLowerCase();
  const items: PaperView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.status && v.status !== input.status) return false;
      if (input.field && v.field !== input.field) return false;
      const hay = [v.title, v.titleLocal, v.abstract, v.abstractLocal]
        .filter((s): s is string => !!s)
        .map((s) => s.toLowerCase());
      const tagHay = (v.tags ?? []).map((s) => s.toLowerCase());
      return hay.some((h) => h.includes(q)) || tagHay.some((h) => h === q);
    })
    .map((r) => ({ ...r.value, paperUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── helpers ────────────────────────────────────────────────────────

async function scanCollection<T>(
  e: Etzhayyim,
  collection: string,
  maxScan: number
): Promise<{ records: { value: T }[]; truncated: boolean }> {
  const out: { value: T }[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < maxScan) {
    const page = await e.read<T>({ collection, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ value: r.value });
    scanned += page.records.length;
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return { records: out, truncated: scanned >= maxScan };
}
