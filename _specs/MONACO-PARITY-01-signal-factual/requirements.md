# MONACO-PARITY-01: Factual Signal Reasoning + 4-State Confidence

## User Story
As a founder reviewing a TAM, I want every signal flagged on an account to carry (a) a verifiable source URL, (b) a factual reason grounded in evidence I can re-read, and (c) a 4-state confidence label so I instantly know whether to trust the signal — without having to fact-check the AI's claim myself. When the AI hallucinates a "hiring a Head of Growth" signal that doesn't exist, I see "unverified" and skip it; when it cites a real LinkedIn post HEAD-checked 200 OK, I see "verified" and act.

Source : `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 4 Étape 2 — "Signal reasoning factual (anti-hallucination) | Source verification (URL HEAD check), citation enforcement, confidence scoring 4-state".

## Acceptance Criteria

### Scenario: Signal with verifiable URL gets `verified`
GIVEN a signal generation run for company X
AND the LLM returns `sourceUrl = https://linkedin.com/posts/abc123`
AND the URL HEAD check returns HTTP 200 within 5s
WHEN the signal is persisted
THEN `verificationStatus = "verified"` is stored
AND `verifiedAt` is the timestamp of the HEAD check
AND the UI shows a green checkmark badge next to the signal

### Scenario: Signal with broken URL gets `unverified`
GIVEN the LLM returns `sourceUrl = https://example.com/missing-page`
AND the HEAD check returns 404 (or any non-2xx, or times out)
WHEN the signal is persisted
THEN `verificationStatus = "unverified"` is stored
AND the UI shows a red warning badge with title "URL not reachable"
AND the signal is filtered out of the default TAM view (founder must opt-in)

### Scenario: Signal with no URL but high LLM confidence
GIVEN the LLM returns `sourceUrl = null` but `confidence = 0.85`
WHEN the signal is persisted
THEN `verificationStatus = "likely"` is stored
AND the UI shows an amber dot

### Scenario: Signal with no URL and low LLM confidence
GIVEN `sourceUrl = null` and `confidence < 0.6`
THEN `verificationStatus = "uncertain"` is stored
AND the UI shows a grey dot
AND the signal is filtered out of default view

### Scenario: HEAD check is rate-limited
GIVEN we are about to HEAD 200+ URLs in a single batch
THEN we use a token-bucket limiter (max 10 req/sec per host)
AND we cache HEAD results in Postgres for 7 days (URL → status, lastChecked)
AND a re-run within the cache window does not re-fetch

## Edge Cases
- Robots.txt forbids HEAD → fall back to GET with Range: bytes=0-0 (1-byte read).
- LinkedIn / X / Crunchbase block HEAD with 999 / 403 → cache as "blocked" not "unverified", treat as `likely` (the URL is well-formed and from a known reputable host).
- LLM hallucinates `sourceUrl = "https://made-up.fake"` → DNS NXDOMAIN → `unverified`.
- `sourceUrl` is a private/internal URL (`localhost`, `192.168.*`, `10.*`) → reject at validation, do not even HEAD.
- Confidence value missing → treat as 0 → `uncertain`.
- HEAD takes >5s → timeout, mark as `unverified` with reason "timeout"; user can manually re-verify.

## Evaluation Steps
1. Seed a fixture with 4 signals: one with valid URL, one 404, one high-confidence no URL, one low-confidence no URL.
2. Run the signal scanner.
3. Assert `verificationStatus` is `verified | unverified | likely | uncertain` respectively.
4. Assert default TAM view filters out `unverified` and `uncertain`.
5. Performance: 100 signals with HEAD checks complete in <30s on dev.
6. Re-run within 7 days: 0 outbound HEAD calls (all cached).
