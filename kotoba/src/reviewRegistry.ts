/**
 * kiyo kotoba — review + endorsement tier (slice 2, +3 → 9/12).
 *
 *   addReview      — single review record per (paperId, seq) tuple
 *                    (rkey=review-{paperId}-{seq:06d} — append-only per paper)
 *   endorsePaper   — single endorsement record per (paperId, endorser-slug)
 *                    (rkey=endorsement-{paperId}-{endorser})
 *   listReviews    — cursor over reviews for one paper
 *
 * Append-only semantics: reviews never overwrite. Sequence number is
 * caller-supplied (the operator increments per submission), idempotent
 * on (paperId, seq) pair. Endorsements idempotent on (paperId, endorser).
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  KIYO_DID_PREFIX,
  paperSlug,
  type AddReviewInput,
  type AddReviewOutput,
  type EndorsePaperInput,
  type EndorsePaperOutput,
  type EndorsementRecord,
  type ListReviewsInput,
  type ListReviewsOutput,
  type ReviewRecord,
  type ReviewView,
} from "./types.js";

const REVIEW_COLLECTION = "com.etzhayyim.kiyo.review";
const ENDORSEMENT_COLLECTION = "com.etzhayyim.kiyo.endorsement";

function reviewRkey(paperId: string, seq: number): string {
  const padded = String(seq).padStart(6, "0");
  return `review-${paperSlug(paperId)}-${padded}`;
}

function reviewDid(paperId: string, seq: number): string {
  const padded = String(seq).padStart(6, "0");
  return `${KIYO_DID_PREFIX}review:${paperSlug(paperId)}-${padded}`;
}

function endorserSlug(endorserDid: string): string {
  return endorserDid.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

function endorsementRkey(paperId: string, endorserDid: string): string {
  return `endorsement-${paperSlug(paperId)}-${endorserSlug(endorserDid)}`;
}

function endorsementDid(paperId: string, endorserDid: string): string {
  return `${KIYO_DID_PREFIX}endorsement:${paperSlug(paperId)}-${endorserSlug(
    endorserDid
  )}`;
}

export async function addReview(
  e: Etzhayyim,
  input: AddReviewInput
): Promise<AddReviewOutput> {
  if (
    !input.paperId ||
    typeof input.seq !== "number" ||
    input.seq < 1 ||
    !input.reviewerDid ||
    !input.body
  ) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (typeof input.scorePermille === "number") {
    if (input.scorePermille < 0 || input.scorePermille > 1000) {
      return { status: "rejected", error: "scoreOutOfRange" };
    }
  }
  const rkey = reviewRkey(input.paperId, input.seq);
  const existing = await e
    .read<ReviewRecord>({ collection: REVIEW_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      reviewUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      paperId: input.paperId,
      seq: input.seq,
    };
  }
  const record: ReviewRecord = {
    did: reviewDid(input.paperId, input.seq),
    paperId: input.paperId,
    seq: input.seq,
    reviewerDid: input.reviewerDid,
    body: input.body,
    bodyLocal: input.bodyLocal,
    /** 0-1000 (permille — no float). */
    scorePermille: input.scorePermille,
    recommendation: input.recommendation,
    language: input.language,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: REVIEW_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    reviewUri: receipt.uri,
    did: record.did,
    paperId: input.paperId,
    seq: input.seq,
  };
}

export async function endorsePaper(
  e: Etzhayyim,
  input: EndorsePaperInput
): Promise<EndorsePaperOutput> {
  if (!input.paperId || !input.endorserDid) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  const rkey = endorsementRkey(input.paperId, input.endorserDid);
  const existing = await e
    .read<EndorsementRecord>({ collection: ENDORSEMENT_COLLECTION, rkey })
    .catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return {
      status: "alreadyExists",
      endorsementUri: existing.records[0].uri,
      did: existing.records[0].value.did,
      paperId: input.paperId,
      endorserDid: input.endorserDid,
    };
  }
  const record: EndorsementRecord = {
    did: endorsementDid(input.paperId, input.endorserDid),
    paperId: input.paperId,
    endorserDid: input.endorserDid,
    endorsementBody: input.endorsementBody,
    endorsedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  const receipt = await e.write({
    collection: ENDORSEMENT_COLLECTION,
    record: record as unknown as Record<string, unknown>,
    rkey,
  });
  return {
    status: "registered",
    endorsementUri: receipt.uri,
    did: record.did,
    paperId: input.paperId,
    endorserDid: input.endorserDid,
  };
}

export async function listReviews(
  e: Etzhayyim,
  input: ListReviewsInput
): Promise<ListReviewsOutput> {
  if (!input.paperId) return { items: [], total: 0, error: "missingPaperId" };
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ReviewRecord>({
    collection: REVIEW_COLLECTION,
    cursor: input.cursor,
    limit,
  });
  const items: ReviewView[] = resp.records
    .filter((r) => r.value.paperId === input.paperId)
    .filter((r) => {
      if (
        input.recommendation &&
        r.value.recommendation !== input.recommendation
      ) {
        return false;
      }
      return true;
    })
    .map((r) => ({ ...r.value, reviewUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}
