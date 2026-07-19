/**
 * kiyo kotoba — paper registry (slice 1, 5/N).
 *
 *   submitPaper      — initial paper submission (rkey=paper-{paperId})
 *   getPaper         — rkey-direct read
 *   listPapers       — cursor + status/field/language filter
 *   listByAuthor     — cursor + authorDid filter (post-fetch — Phase 3 mst-projector
 *                      adds author inverted index)
 *   withdrawPaper    — state transition: status → withdrawn (re-emit record)
 *   submitRevision   — new paper record with prevRevisionPaperId chain link
 *
 * Idempotency: paper rkey = paper-{paperId-slug}. paperId follows the
 * convention `kiyo:{YYYY}:{TID}` per `60-apps/etzhayyim-project-kiyo/CLAUDE.md`.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  paperDid,
  paperRkey,
  type GetPaperInput,
  type GetPaperOutput,
  type ListByAuthorInput,
  type ListByAuthorOutput,
  type ListPapersInput,
  type ListPapersOutput,
  type PaperRecord,
  type PaperView,
  type SubmitPaperInput,
  type SubmitPaperOutput,
  type SubmitRevisionInput,
  type SubmitRevisionOutput,
  type WithdrawPaperInput,
  type WithdrawPaperOutput,
} from "./types.js";

const PAPER_COLLECTION = "com.etzhayyim.kiyo.paper";

function isPaperId(id: string): boolean {
  return /^kiyo:\d{4}:[a-z0-9-]{1,32}$/i.test(id);
}

export async function submitPaper(
  e: Etzhayyim,
  input: SubmitPaperInput
): Promise<SubmitPaperOutput> {
  if (!input.paperId || !isPaperId(input.paperId)) {
    return { status: "rejected", error: "invalidPaperId" };
  }
  if (!input.title || !input.authorDids || input.authorDids.length === 0) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = paperRkey(input.paperId);
  const existing = await e
    .read<PaperRecord>({ collection: PAPER_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      paperUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      paperId: input.paperId,
    };
  }
  const did = paperDid(input.paperId);
  const now = new Date().toISOString();
  const record: PaperRecord = {
    did,
    paperId: input.paperId,
    title: input.title,
    titleLocal: input.titleLocal,
    authorDids: input.authorDids,
    abstract: input.abstract,
    abstractLocal: input.abstractLocal,
    language: input.language,
    ipfsCid: input.ipfsCid,
    status: "submitted",
    submittedAt: now,
    tags: input.tags,
    field: input.field,
    doi: input.doi,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: PAPER_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    paperUri: receipt.uri,
    did,
    paperId: input.paperId,
  };
}

export async function getPaper(
  e: Etzhayyim,
  input: GetPaperInput
): Promise<GetPaperOutput> {
  if (!input.paperId) return { error: "missingPaperId" };
  const resp = await e
    .read<PaperRecord>({
      collection: PAPER_COLLECTION,
      rkey: paperRkey(input.paperId),
    })
    .catch(() => ({ records: [] }));
  const r = resp.records[0];
  if (!r) return { error: "notFound" };
  const view: PaperView = { ...r.value, paperUri: r.uri };
  return { paper: view };
}

export async function listPapers(
  e: Etzhayyim,
  input: ListPapersInput = {}
): Promise<ListPapersOutput> {
  const limit = Math.min(input.limit ?? 50, 100);
  const resp = await e.read<PaperRecord>({
    collection: PAPER_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: PaperView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (input.status && v.status !== input.status) return false;
      if (input.field && v.field !== input.field) return false;
      if (input.language && v.language !== input.language) return false;
      return true;
    })
    .map((r) => ({ ...r.value, paperUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function listByAuthor(
  e: Etzhayyim,
  input: ListByAuthorInput
): Promise<ListByAuthorOutput> {
  if (!input.authorDid) return { items: [], total: 0 };
  const limit = Math.min(input.limit ?? 50, 100);
  const resp = await e.read<PaperRecord>({
    collection: PAPER_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: PaperView[] = resp.records
    .filter((r) => {
      const v = r.value;
      if (!v.authorDids.includes(input.authorDid)) return false;
      if (input.status && v.status !== input.status) return false;
      return true;
    })
    .map((r) => ({ ...r.value, paperUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function withdrawPaper(
  e: Etzhayyim,
  input: WithdrawPaperInput
): Promise<WithdrawPaperOutput> {
  if (!input.paperId || !input.reason) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = paperRkey(input.paperId);
  const resp = await e
    .read<PaperRecord>({ collection: PAPER_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  const existing = resp.records[0]?.value;
  if (!existing) {
    return { status: "rejected", error: "paperNotFound" };
  }
  if (existing.status === "withdrawn") {
    return {
      status: "withdrawn",
      paperUri: resp.records[0].uri,
      paperId: input.paperId,
    };
  }
  const merged: PaperRecord = {
    ...existing,
    status: "withdrawn",
    withdrawnAt: new Date().toISOString(),
    withdrawalReason: input.reason,
  };
  const receipt = await e.write({
    collection: PAPER_COLLECTION,
    record: merged as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "withdrawn",
    paperUri: receipt.uri,
    paperId: input.paperId,
  };
}

export async function submitRevision(
  e: Etzhayyim,
  input: SubmitRevisionInput
): Promise<SubmitRevisionOutput> {
  if (!input.newPaperId || !isPaperId(input.newPaperId)) {
    return { status: "rejected", error: "invalidNewPaperId" };
  }
  if (!input.prevPaperId || !isPaperId(input.prevPaperId)) {
    return { status: "rejected", error: "invalidPrevPaperId" };
  }
  // Verify prev exists.
  const prevResp = await e
    .read<PaperRecord>({
      collection: PAPER_COLLECTION,
      rkey: paperRkey(input.prevPaperId),
    })
    .catch(() => ({ records: [] }));
  if (!prevResp.records[0]?.value) {
    return { status: "prevNotFound", prevPaperId: input.prevPaperId };
  }
  const rkey = paperRkey(input.newPaperId);
  const existing = await e
    .read<PaperRecord>({ collection: PAPER_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      newPaperUri: existing.records[0].uri,
      newPaperId: input.newPaperId,
      prevPaperId: input.prevPaperId,
    };
  }
  const did = paperDid(input.newPaperId);
  const now = new Date().toISOString();
  const record: PaperRecord = {
    did,
    paperId: input.newPaperId,
    title: input.title,
    titleLocal: input.titleLocal,
    authorDids: input.authorDids,
    abstract: input.abstract,
    abstractLocal: input.abstractLocal,
    language: input.language,
    ipfsCid: input.ipfsCid,
    status: "submitted",
    submittedAt: now,
    prevRevisionPaperId: input.prevPaperId,
    tags: input.tags,
    field: input.field,
    doi: input.doi,
    createdAt: now,
  };
  const receipt = await e.write({
    collection: PAPER_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    newPaperUri: receipt.uri,
    newPaperId: input.newPaperId,
    prevPaperId: input.prevPaperId,
  };
}
