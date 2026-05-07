# MONACO-PARITY-05: Coaching from Real Transcripts (RAG with Time-Stamped Citations)

P0. M effort (1-2 sem). Per `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 4 Étape 6 — *"Coaching depuis transcript exact (citations time-stamped) | Coaching depuis email summary | Pipeline RAG : transcript chunks + embeddings + citations time-stamped dans la réponse"*. This is the visible differentiator vs ChatGPT — without transcript-grounded coaching, our chat is just a generic LLM.

## Requirements

### Story
As a founder asking the coaching panel "What did Acme push back on in the last call?", I want the answer to quote the exact words used by the prospect with a click-to-jump time-stamp into the recording — never paraphrase, never invent. If I ask "Did they confirm budget?" and the transcript doesn't say so, the answer must say "no evidence in the transcript" rather than guessing.

### Acceptance
- GIVEN a meeting recording exists with a Whisper transcript
- WHEN the founder asks "What objections did they raise?"
- THEN the coaching response cites at least 1 verbatim quote
- AND each citation has `[mm:ss]` timestamp linking to the recording at that offset
- AND clicking the citation opens the meeting page seeked to that time
- AND the LLM is instructed to answer "no evidence" if the transcript doesn't contain the answer (anti-hallucination)

### Edge cases
- No transcript exists → answer "Recording not transcribed yet — try again in a few minutes" + enqueue retry.
- Transcript has speaker mis-attribution → cite with `[mm:ss, speaker uncertain]` so user can verify.
- Multiple meetings cited → group by meeting, ordered chronologically newest-first.
- Long transcript (>100k tokens) → retrieve top-K chunks via vector similarity; never stuff full transcript into context.

## Design

### Pipeline
1. **Ingest**: when a Recall.ai meeting completes, the existing `meeting-post-call` route triggers a new `transcript-chunk-and-embed` Inngest fn.
2. Chunks transcript by speaker turn (or by 60s windows when speaker labels are sparse). Each chunk: `{ meetingId, startSec, endSec, speaker, text }`.
3. Embeds each chunk via `text-embedding-3-small` (matches existing `embeddings.ts`).
4. Stores in new `transcript_chunks` table with `pgvector` ANN index.

### Schema
```sql
create table transcript_chunks (
  id text primary key,
  tenantId text not null,
  meetingId text not null references meetings(id) on delete cascade,
  speaker text,
  startSec int not null,
  endSec int not null,
  text text not null,
  embedding vector(1536) not null,
  createdAt timestamptz default now()
);
create index transcript_chunks_meeting_idx on transcript_chunks(meetingId);
create index transcript_chunks_embedding_idx on transcript_chunks using hnsw (embedding vector_cosine_ops);
```

### RAG retrieval
`lib/coaching/retrieve-transcript-chunks.ts`:
```ts
async function retrieveChunks(query: string, tenantId: string, scope: { dealId?: string; companyId?: string }, k = 8): Promise<Chunk[]>;
```
- Embeds query.
- Filters by tenant + optional scope (deal → list of meetings via `meetings.dealId`; company → all meetings).
- Returns top-k by cosine similarity, threshold 0.3.

### Prompt
System prompt addition (added to `lib/prompts/chat-system-prompt.ts`):
```
You have access to verbatim transcript chunks from this customer's meetings. When you cite something, format it exactly as: "[mm:ss] verbatim quote here" — preserve exact words, no paraphrase. If the question cannot be answered from the chunks below, say "I don't have evidence in the transcript for this" — never guess.
```
Followed by injected chunks formatted as: `[meetingTitle, mm:ss, speaker]: "<text>"`.

### UI — citation rendering
- Extend `app/(dashboard)/chat/page.tsx` markdown renderer to detect `[mm:ss]` patterns following a quote.
- Render as a clickable chip linking to `/meetings/<id>?t=<seconds>`.
- Meeting page reads `?t=` and seeks the audio/video player to that offset.

### Failure handling
- No chunks pass threshold → respond "no evidence in this customer's transcripts" instead of falling back to LLM general knowledge.
- Embedding API down → cache last 24h embeddings; if cold-cache miss, return graceful error.
- pgvector index missing → migration script auto-creates on `CREATE EXTENSION vector`.

## Tasks

1. **Schema migration** — `transcript_chunks` table + `pgvector` extension check.
2. **Chunking helper** — `lib/coaching/chunk-transcript.ts` with speaker-turn detection + 60s fallback windows. Tests for both branches.
3. **Embedding job** — `inngest/transcript-chunk-and-embed.ts`: triggered on meeting transcript ready; chunks + embeds in batches of 50. Idempotent on re-run.
4. **Retrieval helper** — `lib/coaching/retrieve-transcript-chunks.ts` with similarity threshold + scope filter.
5. **Prompt update** — extend `lib/prompts/chat-system-prompt.ts` with citation instructions.
6. **Chat tool** — register `transcript_search` chat tool that calls retrieval + injects chunks into context.
7. **Citation rendering** — `[mm:ss]` parser + clickable chip in `chat/page.tsx`.
8. **Meeting page seek** — `meetings/[id]/page.tsx` reads `?t=` query, seeks player.
9. **Eval** — create `_specs/MONACO-PARITY-05/evals/`: 20 question-answer pairs grounded in real transcripts; run `pnpm eval:coaching` and assert ≥80% citation accuracy.
10. **Doc + master plan ✅**.
