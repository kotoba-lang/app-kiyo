# kiyo.etzhayyim.com — 自前研究アーカイブ (紀要)

| 項目 | 値 |
|---|---|
| **AT Layer** | L3 Dispatcher (CF Worker thin) + L7 LangServer (LangServer) + L6 RisingWave UDF |
| **Tier** | T3 (専用 CF Worker) |
| **DID** | `did:web:kiyo.etzhayyim.com` |
| **nanoid** | `k1y04rc4` |
| **NSID prefix** | `com.etzhayyim.kiyo.*` |
| **paper_id** | `kiyo:{YYYY}:{TID}` (e.g. `kiyo:2026:lzxy1a`) |
| **Storage** | `ipfs.etzhayyim.com` — CIDv1 content-addressed, URL = `https://ipfs.etzhayyim.com/ipfs/{cid}` |
| **ADR** | this CLAUDE.md is authoritative; `ADR-2605203000-kotoba-write-target-options.md` for write-target choice (PDS XRPC Option B) |

## Component Map

```
60-apps/etzhayyim-project-kiyo/
└── wasm/etzhayyim-wasm-kiyo-k1y04rc4/
    ├── src/app.ts           ← thin CF Worker (L3): XRPC facade only
    ├── kotodama.jsonld
    └── wrangler.jsonc

50-infra/k8s/kiyo-worker/
    ├── kiyo_worker.py       ← LangServer task handlers (L7)
    ├── kiyo_langgraph.py    ← LangGraph chains
    └── requirements.txt

30-graph/risingwave-udf/kiyo_udf.py  ← RisingWave Python External UDF (L6)

etzhayyim-root/00-contracts/bpmn/com/etzhayyim/kiyo/     ← 5 BPMN files
00-contracts/lexicons/com/etzhayyim/apps/kiyo/  ← 12 Lexicon JSONs

30-graph/graph-schema/migrations/
    20260430230000_vertex_kiyo.ts    ← tables + 3 MVs
    20260430230100_seed_kiyo_bpmn.ts ← BPMN seed rows
```

## Architecture

```
Client / LLM actor
  → XRPC POST com.etzhayyim.kiyo.submitPaper
    → CF Worker (L3 thin): validate schema + dispatchBpmn()
      → BPMN dispatcher HTTP → LangServer process instance
        → kiyo.validateAuthor  (LangServer, RisingWave SELECT)
        → generic.http.fetch   (ipfs.etzhayyim.com Publish → CIDv1)
        → kiyo.insertPaper     (psycopg3 → RisingWave INSERT)
        → generic.pds.dispatch (AT post announcement)

Client
  → XRPC GET com.etzhayyim.kiyo.searchPapers?q=autopoiesis
    → CF Worker (L3): Kysely raw SQL
        SELECT ... list_cosine_similarity(embedding, kiyo_embed_query(%q)) ...
        FROM vertex_kiyo_paper
      → RisingWave executes kiyo_embed_query Python External UDF (io_threads=100)
        → Murakumo /v1/embeddings
      → returns ranked papers

Timer R/P1D → citationSync.bpmn
  → kiyo.extractCitations (LangServer)
    → KiyoCitationExtractGraph (LangGraph)
      → fetch IPFS text → LLM extract refs → bunken DOI resolve
    → kiyo.insertCitationEdges → edge_kiyo_cites

Timer R/P1D → embeddingIndex.bpmn
  → kiyo.embedAbstracts (LangServer)
    → KiyoAbstractEmbedGraph (LangGraph)
      → Murakumo /v1/embeddings (asyncio.gather 並列)
    → kiyo.persistEmbeddings → vertex_kiyo_paper.embedding

Timer R/P7D → weeklyDigest.bpmn
  → generic.db.select top papers
  → generic.llm.json → digest text
  → generic.pds.dispatch → AT post
```

## RisingWave UDFs (kiyo_udf.py)

| 関数 | io_threads | 用途 |
|---|---|---|
| `kiyo_embed_query(query)` | 100 | searchPapers の cosine search |
| `kiyo_classify_subject(title, abstract)` | 50 | 自動 subject 分類 (future streaming MV) |

UDF を RisingWave に登録:
```sql
CREATE FUNCTION kiyo_embed_query(VARCHAR) RETURNS DOUBLE PRECISION[]
  LANGUAGE python AS kiyo_embed_query
  USING LINK 'http://risingwave-python-udf.risingwave.svc:8815';

CREATE FUNCTION kiyo_classify_subject(VARCHAR, VARCHAR) RETURNS VARCHAR[]
  LANGUAGE python AS kiyo_classify_subject
  USING LINK 'http://risingwave-python-udf.risingwave.svc:8815';
```

## LangGraph chains (kiyo_langgraph.py)

| Graph | State | Nodes |
|---|---|---|
| `citation_graph` | `CitationState` | fetch_text → extract_refs → resolve_dois → build_edges |
| `embed_graph` | `EmbedState` | embed_batch (asyncio.gather 並列) |

## Deploy

```bash
# 1. graph migration
cd 30-graph/graph-schema && pnpm db:migrate latest && pnpm db:gen && pnpm db:drift

# 2. register RisingWave UDFs (risingwave-udf pod に kiyo_udf.py 追加後)
psql $RW_DSN -f sql/register_kiyo_udfs.sql

# 3. deploy CF Worker
cd 60-apps/etzhayyim-project-kiyo/wasm/etzhayyim-wasm-kiyo-k1y04rc4 && etzhayyim deploy

# 4. build + deploy kiyo-worker (amd64 必須)
cd 50-infra/k8s/kiyo-worker
docker buildx build --platform linux/amd64 --no-cache --push -t ghcr.io/etzhayyim/kiyo-worker:latest .
kubectl rollout restart deployment/kiyo-worker -n mitama-udf

# 5. verify BPMN deployed
kubectl logs -n mitama-udf deploy/bpmn-dispatcher | grep 'deployed kind=bpmn.*kiyo'
```

## Smoke Test

```bash
# submit a paper
etzhayyim agent-token --lxm com.etzhayyim.kiyo.submitPaper | xargs -I{} \
  curl -s -X POST https://kiyo.etzhayyim.com/xrpc/com.etzhayyim.kiyo.submitPaper \
    -H "Authorization: Bearer {}" \
    -H "Content-Type: application/json" \
    -d '{"title":"Test","abstract":"Test abstract","subject":["cs.AI"],"authors":["did:web:kiyo.etzhayyim.com"],"fileBase64":"..."}'

# get stats
curl https://kiyo.etzhayyim.com/xrpc/com.etzhayyim.kiyo.getStats

# search
curl "https://kiyo.etzhayyim.com/xrpc/com.etzhayyim.kiyo.searchPapers?q=autopoiesis"
```
