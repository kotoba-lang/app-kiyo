# app-kiyo（撤回・ID 形）— itonami（dapp）上の分散型設計

状態: 第 1 スライス実装（2026-10-20）。正本はこの文書。
追跡: Linear JUN-128（親 JUN-116）。app-kiyo の第 2 スライス。

## このスライス: paper_id 形・撤回判定コア

| 層 | 実体 | 状態 |
|---|---|---|
| 判定コア guest | `aiueos/kiyo_withdraw.cljk` — paper-id-ok（**`kiyo:` + 4 桁年 + 1..32 文字の英小数字とハイフン**）/ withdraw-judgment（paperId + reason 必須 / paperNotFound / **撤回済みは冪等**）/ citation-depth-ok（**既定 2 / 上限 5**） | **実装済み・実測** |
| 記述子 | `aiueos/kiyo-withdraw.edn` | **実装済み** |
| parity | `kotoba/test/kiyo/withdraw_parity_test.cljk` — 正本（paperRegistry.ts / final.ts）の ID 形・撤回・深さ上限と一致 | **実装済み・実測** |

実測: `amu test aiueos/kiyo_withdraw.cljk` → **18/18**（jvm-kir / js / wasm）。
parity → 10 assertions / 0 failures。

## 正本の正確な規則（guest はこれに追従）

- **isPaperId**: `^kiyo:\d{4}:[a-z0-9-]{1,32}$`（大文字小文字非区別）。
  AGENTS.md の `kiyo:{YYYY}:{TID}`（例: `kiyo:2026:lzxy1a`）の実装。
- **withdrawPaper**: paperId + reason 必須（missingRequiredFields）、
  論文が無い場合は paperNotFound、**撤回済みは冪等**（その場で withdrawn を
  返し、再発行しない）。それ以外の状態から status → withdrawn を再発行
  （re-emit record）。
- **引用グラフの N-hop walk**: DEFAULT_DEPTH 2 / **MAX_DEPTH 5**。

## 未実装境界

- 状態遷移の**網羅的判定**（accepted / published への遷移規則は getStats の
  集計に存在するが、遷移関数の実体は submit/withdraw の外にあり未特定）。
- paper_id の TID 部分の生成（nanoid 系）。
- IPFS CIDv1 の判定。
- mon（DNA）化、aiueos session 載せ（fleet 共通）。
