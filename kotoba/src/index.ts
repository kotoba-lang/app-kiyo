/**
 * kiyo kotoba — barrel.
 *
 * Per ADR-2605203000 Option B Phase E reference implementation.
 * Per `60-apps/etzhayyim-project-kiyo/CLAUDE.md` kiyo: research archive
 * (紀要) on the etzhayyim substrate. paper_id = `kiyo:{YYYY}:{TID}`.
 *
 * Slice 1: 6 of 12 lexicons ported.
 *   submitPaper + getPaper + listPapers + listByAuthor +
 *   withdrawPaper + submitRevision
 *
 * Follow-up slices: review (addReview / endorsePaper) +
 * citation graph (getCitationGraph) + stats (getStats).
 */

export * from "./types.js";
export {
  submitPaper,
  getPaper,
  listPapers,
  listByAuthor,
  withdrawPaper,
  submitRevision,
} from "./paperRegistry.js";
export { addReview, endorsePaper, listReviews } from "./reviewRegistry.js";
export {
  getPaperFile,
  getCitationGraph,
  getStats,
  searchPapers,
} from "./final.js";
