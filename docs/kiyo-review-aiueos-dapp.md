# app-kiyo（紀要の査読）— itonami（dapp）上の分散型設計

状態: 第 1 スライス実装（2026-10-20）。正本はこの文書。
追跡: Linear JUN-128（親 JUN-116）。

## 位置づけ

app-kiyo は**自前研究アーカイブ（紀要）** —— paper_id は `kiyo:{YYYY}:{TID}`、
本文は IPFS CIDv1 の content-addressed。論文の状態遷移と査読（recommendation
+ score）を持つ。

## このスライス: 査読判定コア

| 層 | 実体 | 状態 |
|---|---|---|
| 判定コア guest | `aiueos/kiyo_review.cljk` — paper-status-ok（**PaperStatus の 6 つ**: submitted / under-review / accepted / withdrawn / rejected / published）/ recommendation-ok（**ReviewRecommendation の 4 つ**: accept / minor-revision / major-revision / reject）/ review-admission（**scorePermille 0..1000** / missingRequiredFields / scoreOutOfRange / invalidRecommendation）/ dedup-take（(paperId, seq) は冪等） | **実装済み・実測** |
| 記述子 | `aiueos/kiyo-review.edn` | **実装済み** |
| parity | `kotoba/test/kiyo/review_parity_test.cljk` — 正本（types.ts / reviewRegistry.ts）の閉じた集合・score 範囲・拒否名と一致 | **実装済み・実測** |

実測: `amu test aiueos/kiyo_review.cljk` → **18/18**（jvm-kir / js / wasm）。
parity → 2 tests / 14 assertions / 0 failures。

## 正本の正確な規則（guest はこれに追従）

- **PaperStatus** = submitted / under-review / accepted / withdrawn /
  rejected / published（6 つ）。
- **ReviewRecommendation** = accept / minor-revision / major-revision /
  reject（4 つ）。
- 査読の score は **scorePermille（0..1000）** —— 範囲外は scoreOutOfRange
  で拒否。登録は (paperId, seq) の rkey で**冪等**（alreadyExists）。
- endorsement（endorsePaper）は paperId + endorserDid 必須（同族の規則）。

## 未実装境界

- PaperStatus の**遷移規則**（submitted → under-review → accepted/... の
  適否判定）—— reviewRegistry の外（final.ts / paperRegistry）に実体がある
  候補。次スライス。
- paper_id 形（`kiyo:{YYYY}:{TID}`）と CIDv1 の判定。
- mon（DNA）化、aiueos session 載せ（fleet 共通）。
