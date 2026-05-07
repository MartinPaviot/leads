# MONACO-PARITY-07: ML Scoring Trained on Closed-Won

P2. L effort (4-6 sem). Per `_research/monaco-bilan-et-classification-2026-05-06.md` Partie 4 Étape 1 — *"ML scoring (vrai modèle entraîné sur closed-won) | Rule-based heuristic + LLM judge | Pipeline d'entraînement : extract closed-won features → train gradient boosting → serve via API. Plus expérimentation A/B vs rule-based."*

Defer until each tenant has ≥30 closed-won deals — fewer than that and a learned model is worse than the heuristic.

## Requirements

### Story
As a founder with ≥30 closed-won deals, I want my TAM scoring to be trained on which accounts I've actually closed (not generic ICP heuristics), so the A/B/C/D grades reflect *my* historical pattern of success, not Sam Blond's. The model must be transparent: when I see an account scored "A", I can click through to see which features contributed.

### Acceptance
- A nightly training job runs per-tenant when `closed_won_count >= 30`.
- The trained model serves account scores via the same `/api/companies` endpoint with no client-side change.
- A/B test mode: 50% of accounts continue scoring via heuristic, 50% via ML, for 14 days.
- After 14 days, compare conversion rates of A-scored accounts under each method; winner becomes default.
- Each scored account exposes `scoreExplanation: { topFeatures: [{ feature, weight }, ...] }`.

### Edge cases
- Fewer than 30 wins → fall back to heuristic, no warning.
- Class imbalance (1 win, 1000 losses) → SMOTE or class-weighted loss.
- New tenant with imported HubSpot history → use that as bootstrap closed_won.

## Design

### Feature engineering
Per-account features:
- Firmographic: industry one-hot, size bucket, country, founded year, funding stage.
- Behavioral: meeting count, email reply rate, days from first contact to close.
- Signal: signal counts by type, signal verification rate.
- ICP-fit text similarity: cosine of `companies.icp_text_embedding` vs tenant's ICP description embedding.

### Model
Gradient Boosting (XGBoost or LightGBM via Python service). Python service deployed as a separate Cloud Run / Modal endpoint.

### Training pipeline
1. Inngest weekly cron `train-tenant-scoring-model`.
2. Pull `(features, label)` pairs where label = 1 for closed_won, 0 for closed_lost or stale > 90 days.
3. Train, save model artifact to S3 / R2 with `(tenantId, version)` key.
4. Update `tenant.scoringModelVersion` pointer.

### Serving
- `lib/scoring/ml-score.ts` calls a small Python microservice that loads the latest tenant model and returns `{ score, topFeatures }`.
- Heuristic fallback when ML service unavailable.

### A/B harness
- New `tenant_settings.scoringMode = "heuristic" | "ml" | "ab_test"`.
- In `ab_test`, hash account ID modulo 2 → assigns to A or B bucket.
- Log assignment + outcome to `scoring_experiment` table.
- After 14d, dashboard shows lift; founder can pick winner.

## Tasks

1. Python microservice scaffold (FastAPI + LightGBM).
2. Cloud deployment (Modal or Cloud Run).
3. Feature extractor in TS calling out to service.
4. Training cron (weekly).
5. Tenant settings UI for scoring mode + A/B opt-in.
6. Experiment table + dashboard.
7. Top-features explanation panel on account detail page.
8. Doc + master plan ✅.
