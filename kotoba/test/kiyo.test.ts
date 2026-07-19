import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  submitPaper,
  getPaper,
  listPapers,
  listByAuthor,
  withdrawPaper,
  submitRevision,
  addReview,
  listReviews,
} from "../src/index.js";

describe("kiyo kotoba", () => {
  let e: any;

  beforeEach(() => {
    e = new MockEtzhayyim({ did: "did:web:kiyo.etzhayyim.com" });
  });

  describe("submitPaper", () => {
    it("submits a paper with valid input", async () => {
      const result = await submitPaper(e, {
        paperId: "kiyo:2026:abc123",
        title: "Research Paper Title",
        authorDids: ["did:plc:author1"],
      });

      expect(result.status).toBe("registered");
      expect(result.paperUri).toBeDefined();
      expect(result.did).toBeDefined();
      expect(result.paperId).toBe("kiyo:2026:abc123");
    });

    it("rejects paper with invalid paperId format", async () => {
      const result = await submitPaper(e, {
        paperId: "invalid-id",
        title: "Research Paper",
        authorDids: ["did:plc:author1"],
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("invalidPaperId");
    });

    it("rejects paper with missing authors", async () => {
      const result = await submitPaper(e, {
        paperId: "kiyo:2026:abc123",
        title: "Research Paper",
        authorDids: [],
      });

      expect(result.status).toBe("rejected");
      expect(result.error).toBe("missingRequiredFields");
    });

    it("is idempotent on paperId", async () => {
      const input = {
        paperId: "kiyo:2026:paper1",
        title: "Paper 1",
        authorDids: ["did:plc:author1"],
      };

      const first = await submitPaper(e, input);
      expect(first.status).toBe("registered");
      const firstDid = first.did;

      const second = await submitPaper(e, input);
      expect(second.status).toBe("alreadyExists");
      expect(second.did).toBe(firstDid);
    });

    it("supports optional metadata fields", async () => {
      const result = await submitPaper(e, {
        paperId: "kiyo:2026:meta1",
        title: "Paper with Metadata",
        titleLocal: "メタデータ付き論文",
        authorDids: ["did:plc:author1"],
        abstract: "This is an abstract",
        language: "en",
        field: "Computer Science",
        doi: "10.1234/test",
      });

      expect(result.status).toBe("registered");
      const paper = await getPaper(e, { paperId: "kiyo:2026:meta1" });
      expect(paper.paper?.titleLocal).toBe("メタデータ付き論文");
      expect(paper.paper?.field).toBe("Computer Science");
    });
  });

  describe("getPaper", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:get1",
        title: "Get Test Paper",
        authorDids: ["did:plc:author1"],
      });
    });

    it("retrieves an existing paper", async () => {
      const result = await getPaper(e, { paperId: "kiyo:2026:get1" });

      expect(result.error).toBeUndefined();
      expect(result.paper).toBeDefined();
      expect(result.paper?.paperId).toBe("kiyo:2026:get1");
      expect(result.paper?.status).toBe("submitted");
    });

    it("returns error for non-existent paper", async () => {
      const result = await getPaper(e, { paperId: "kiyo:2026:notfound" });

      expect(result.error).toBe("notFound");
      expect(result.paper).toBeUndefined();
    });

    it("returns error when paperId is missing", async () => {
      const result = await getPaper(e, { paperId: "" });

      expect(result.error).toBeDefined();
    });
  });

  describe("listPapers", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:paper1",
        title: "Computer Science Paper",
        authorDids: ["did:plc:author1"],
        field: "CS",
        language: "en",
      });
      await submitPaper(e, {
        paperId: "kiyo:2026:paper2",
        title: "Biology Paper",
        authorDids: ["did:plc:author2"],
        field: "Biology",
        language: "en",
      });
      await submitPaper(e, {
        paperId: "kiyo:2026:paper3",
        title: "日本語論文",
        authorDids: ["did:plc:author3"],
        language: "ja",
      });
    });

    it("lists all papers", async () => {
      const result = await listPapers(e, {});

      expect(result.items.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it("filters by field", async () => {
      const result = await listPapers(e, { field: "CS" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.field).toBe("CS");
    });

    it("filters by language", async () => {
      const result = await listPapers(e, { language: "ja" });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.language).toBe("ja");
    });

    it("filters by status", async () => {
      const result = await listPapers(e, { status: "submitted" });

      expect(result.items.every((p) => p.status === "submitted")).toBe(true);
    });

    it("respects limit parameter", async () => {
      const result = await listPapers(e, { limit: 2 });

      expect(result.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe("listByAuthor", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:author-paper1",
        title: "Author 1 Paper 1",
        authorDids: ["did:plc:author1", "did:plc:author2"],
      });
      await submitPaper(e, {
        paperId: "kiyo:2026:author-paper2",
        title: "Author 1 Paper 2",
        authorDids: ["did:plc:author1"],
      });
      await submitPaper(e, {
        paperId: "kiyo:2026:author-paper3",
        title: "Author 3 Paper",
        authorDids: ["did:plc:author3"],
      });
    });

    it("lists papers by author", async () => {
      const result = await listByAuthor(e, {
        authorDid: "did:plc:author1",
      });

      expect(result.items.length).toBe(2);
      expect(result.items.every((p) => p.authorDids.includes("did:plc:author1"))).toBe(true);
    });

    it("returns empty for non-existent author", async () => {
      const result = await listByAuthor(e, {
        authorDid: "did:plc:noauthor",
      });

      expect(result.items.length).toBe(0);
    });
  });

  describe("withdrawPaper", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:withdraw1",
        title: "Paper to Withdraw",
        authorDids: ["did:plc:author1"],
      });
    });

    it("withdraws an existing paper", async () => {
      const result = await withdrawPaper(e, {
        paperId: "kiyo:2026:withdraw1",
        reason: "Author request",
      });

      expect(result.status).toBe("withdrawn");
      expect(result.paperUri).toBeDefined();
      const paper = await getPaper(e, { paperId: "kiyo:2026:withdraw1" });
      expect(paper.paper?.status).toBe("withdrawn");
    });

    it("idempotently returns withdrawn status", async () => {
      await withdrawPaper(e, {
        paperId: "kiyo:2026:withdraw1",
        reason: "Author request",
      });

      const result = await withdrawPaper(e, {
        paperId: "kiyo:2026:withdraw1",
        reason: "Second withdrawal attempt",
      });

      expect(result.status).toBe("withdrawn");
    });

    it("rejects withdrawal with missing reason", async () => {
      const result = await withdrawPaper(e, {
        paperId: "kiyo:2026:withdraw1",
        reason: "",
      });

      expect(result.status).toBe("rejected");
    });
  });

  describe("submitRevision", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:orig1",
        title: "Original Paper",
        authorDids: ["did:plc:author1"],
      });
    });

    it("submits a revision linked to previous paper", async () => {
      const result = await submitRevision(e, {
        newPaperId: "kiyo:2026:rev1",
        prevPaperId: "kiyo:2026:orig1",
        title: "Revised Paper",
        authorDids: ["did:plc:author1"],
      });

      expect(result.status).toBe("registered");
      expect(result.newPaperId).toBe("kiyo:2026:rev1");
      expect(result.prevPaperId).toBe("kiyo:2026:orig1");
      const paper = await getPaper(e, { paperId: "kiyo:2026:rev1" });
      expect(paper.paper?.prevRevisionPaperId).toBe("kiyo:2026:orig1");
    });

    it("rejects revision when prevPaperId does not exist", async () => {
      const result = await submitRevision(e, {
        newPaperId: "kiyo:2026:rev2",
        prevPaperId: "kiyo:2026:notexist",
        title: "Revision",
        authorDids: ["did:plc:author1"],
      });

      expect(result.status).toBe("prevNotFound");
    });

    it("is idempotent on newPaperId", async () => {
      const input = {
        newPaperId: "kiyo:2026:rev3",
        prevPaperId: "kiyo:2026:orig1",
        title: "Revision",
        authorDids: ["did:plc:author1"],
      };

      const first = await submitRevision(e, input);
      expect(first.status).toBe("registered");

      const second = await submitRevision(e, input);
      expect(second.status).toBe("alreadyExists");
    });
  });

  describe("addReview", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:review1",
        title: "Paper for Review",
        authorDids: ["did:plc:author1"],
      });
    });

    it("adds a review to a paper", async () => {
      const result = await addReview(e, {
        paperId: "kiyo:2026:review1",
        seq: 1,
        reviewerDid: "did:plc:reviewer1",
        body: "This paper is well-written",
        recommendation: "accept",
      });

      expect(result.status).toBe("registered");
      expect(result.paperId).toBe("kiyo:2026:review1");
    });

    it("rejects review without body", async () => {
      const result = await addReview(e, {
        paperId: "kiyo:2026:review1",
        seq: 1,
        reviewerDid: "did:plc:reviewer1",
        body: "",
      });

      expect(result.status).toBe("rejected");
    });

    it("is idempotent on (paperId, seq)", async () => {
      const input = {
        paperId: "kiyo:2026:review1",
        seq: 2,
        reviewerDid: "did:plc:reviewer1",
        body: "Review text",
      };

      const first = await addReview(e, input);
      expect(first.status).toBe("registered");

      const second = await addReview(e, input);
      expect(second.status).toBe("alreadyExists");
    });
  });

  describe("listReviews", () => {
    beforeEach(async () => {
      await submitPaper(e, {
        paperId: "kiyo:2026:review-list",
        title: "Paper for Reviews",
        authorDids: ["did:plc:author1"],
      });
      await addReview(e, {
        paperId: "kiyo:2026:review-list",
        seq: 1,
        reviewerDid: "did:plc:reviewer1",
        body: "Good paper",
        recommendation: "accept",
      });
      await addReview(e, {
        paperId: "kiyo:2026:review-list",
        seq: 2,
        reviewerDid: "did:plc:reviewer2",
        body: "Needs revision",
        recommendation: "minor-revision",
      });
    });

    it("lists all reviews for a paper", async () => {
      const result = await listReviews(e, {
        paperId: "kiyo:2026:review-list",
      });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
    });

    it("filters reviews by recommendation", async () => {
      const result = await listReviews(e, {
        paperId: "kiyo:2026:review-list",
        recommendation: "accept",
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0]?.recommendation).toBe("accept");
    });
  });
});
