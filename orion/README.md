# Orion — corpus de conception

Dossier consolidé pour réutilisation. Tout ce qui concerne **Orion** (le produit signal → brief → outbound sorti d'Elevay) est ici.

- `spec/` — la spec produit/backend (Kiro) + le design UI + le CLAUDE.md.
- `research/` — les 8 rapports d'analyse. Ce sont des copies ; les originaux restent dans `_reports/` (référencés par la mémoire et par des liens internes aux docs).

> Note : certains liens internes aux docs pointent encore vers `_reports/…` ou `_specs/orion/…` (chemins d'origine). Le contenu est identique ; la source canonique de réutilisation est désormais ce dossier `orion/`.

## spec/

| Fichier | Contenu | État |
|---|---|---|
| `CLAUDE.md` | Règles de comportement de l'agent, voix Garry Tan (transposées du CLAUDE.md Elevay, sans perte opérationnelle) | OK (8.8k) |
| `requirements.md` | Exigences EARS backend (auth, data Supabase/Drizzle, Inngest, adaptateurs entrée/sortie, gates) — ancré sur le backend Elevay réel | Approfondi (70k) |
| `design.md` | Architecture : décisions DB, schéma Drizzle, install/versions exactes, adaptateurs `InputSource`/`OutboundDestination`, carte d'intégration Elevay | Approfondi (65k) |
| `tasks.md` | 42 tâches ordonnées (T-1..42, 11 lots, verify + test par tâche, chemin critique hackathon) | Approfondi (62k) ✓ |
| `ui-spec.md` | Design language Elevay : tokens vérifiés (light+dark, accent `#2C6BED`), inventaire composants, mockups ASCII, contraintes no-emoji + demi-écran | OK (30k) |

## research/ (ordre de lecture conseillé)

1. `signals-world-class-2026-06-27.md` — audit du système de signaux actuel + taxonomie legacy/hard-to-get + framework "expert conseil signaux" + architecture cible. (défaut #1 multipliers — depuis corrigé)
2. `signal-intelligence-design-2026-06-27.md` — sous-système produit-intégré : 3 piliers Découverte / Acquisition / Activation, branché aux coutures Elevay.
3. `signal-deep-tech-2026-06-27.md` — la couche technologique profonde (6 moteurs : identité probabiliste, extraction sémantique, temporel/velocity, fusion ML, warm-path, research agent) + le moat.
4. `signal-agent-mcp-2026-06-27.md` — surface MCP agent-native (outils + resources + gates non-contournables).
5. `signal-outreach-brief-2026-06-27.md` — **le pivot** : le produit n'écrit pas le mail, il émet un brief (`citableFacts[]`/`doNotClaim[]`) consommé par un agent outbound + intégration Instantly.
6. `signal-agent-prd-2026-06-27.md` — PRD d'expert + parcours démo 2 min.
7. `orion-differentiation-2026-06-27.md` — pourquoi Orion > Fiber AI / Orange Slice / Lopus + la data d'entrée (Tier 0/1/2) + table de valeur signal.
8. `orion-backend-verification-2026-06-27.md` — le backend Elevay réel : versions exactes, câblage drizzle/inngest/next-auth/AI, env, pièges à porter dans Orion.

## Décisions fondatrices (2026-06-27)
Repo Orion séparé, **même stack** qu'Elevay (Next 15 / Drizzle / Postgres-Supabase / Inngest / AI SDK v6 / next-auth v5), on **copie** les ~6 modules clés (evaluateSend, IntelligenceBrief, serveur MCP, waterfall, record-signal, identity). DB = **Supabase/Postgres + Drizzle** (zéro migration le jour de la fusion ; la réactivité native de Convex ne justifie pas la dette de migration pour ce workload async). Démo standalone (hackathon YC) puis intégration Elevay. Sortie vers **Instantly + Fiber AI + Orange Slice + Lopus** + webhook générique. UI **identique à Elevay**.
