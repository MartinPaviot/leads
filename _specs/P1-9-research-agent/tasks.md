# Tasks — P1-9 (research-agent)

Estimation totale : **~4 jours-dev** (MVP boilable ; crawler headless + enrichApollo flaggés océan, hors lot).

## T0 — Audit lecture (read-only)
**Action** : Relire `build-intelligence-brief.ts:50-235`, `brief-synthesizer.ts:37-103`, `types.ts:1-23`, `sources/website.ts`, `traced-ai.ts:73-131`, `ai-provider.ts:126-259`, `ask-agent.ts:50-71`, et confirmer l'API `ai@6.0.199` (`Output`, `stepCountIs`, `prepareStep`, `experimental_output`).
**Verify** : `grep -n "stepCountIs\|experimental_output\|prepareStep" node_modules/.pnpm/ai@6.0.199*/node_modules/ai/dist/index.d.ts` → exports présents (déjà confirmé).
**Test** : N/A.

## T1 — `browsePage` (nouveau scraper qui suit les liens) — [NEW]
**Action** : Créer `lib/campaign-engine/sources/browse-page.ts` (Fix 1) : fetch+cheerio, extrait `{title,headings,mainText(≤3000),internalLinks(≤20 même-domaine)}`, gardes SSRF/scope (schéma http(s), host==root ou sous-domaine, IP privées bloquées, re-check post-redirect), timeout 8s.
**Verify** : `pnpm tsc` ; appel manuel sur un domaine connu retourne `internalLinks` non vide ; appel hors-domaine → `{ok:false,error:"out_of_scope"}`.
**Test** : `lib/campaign-engine/sources/__tests__/browse-page.test.ts` (Vitest, `fetch` mocké) — couvre : page HTML valide → liens extraits ; URL hors-domaine → out_of_scope ; IP privée `http://127.0.0.1` → blocked_host ; non-HTML → not_html ; redirection cross-domain → out_of_scope (R2.2/2.2.1/2.2.2). Réfs : R2.2.
**Effort** : 0.75 j.

## T2 — `ToolSet` de recherche + ledger + mémoïsation — [NEW]
**Action** : Créer `lib/campaign-engine/research-agent-tools.ts` (Fix 2) : `newToolLedger`, `buildResearchTools` (n'ajoute `fetchWebsite/browsePage/fetchJobs/detectTechStack` que si `rootDomain`, `fetchNews` toujours, `enrichApollo` seulement si fourni), chaque `execute` = mémo→timeout(`withTimeout`,8s)→collect ledger→`{ok}` jamais throw, résultats tronqués.
**Verify** : `pnpm tsc` ; un double appel identique n'incrémente `attempted` qu'une fois.
**Test** : `lib/campaign-engine/__tests__/research-agent-tools.test.ts` — outils enregistrés selon dépendances (domaine null → pas de fetchWebsite) ; outil qui throw → `{ok:false}` + `errors` rempli, pas d'exception ; mémoïsation (2e appel = 0 refetch, stub compté) ; `enrichApollo` absent → outil non présent dans le ToolSet (R2.4). Réfs : R2.1,R2.3,R2.4,R2.5,R2.6.
**Effort** : 0.75 j.

## T3 — Boucle agentique `runResearchAgent` — [NEW]
**Action** : Créer `lib/campaign-engine/research-agent.ts` (Fix 3) : schéma zod = champs `IntelligenceBrief`, `runResearchAgent` via `tracedGenerateText({ model: anthropic("claude-sonnet-4-6"), tools, stopWhen: stepCountIs(8), experimental_output: Output.object({schema}), prepareStep: routeStep })`, mappe `experimental_output`→`SynthesizedFields` (+`publicContentDepth`), remonte ledger.
**Verify** : `pnpm tsc` ; run offline avec un modèle mocké (cf. pattern `ask-agent.ts` `opts.model`) produit un `SynthesizedFields` valide et `steps>0`.
**Test** : `lib/campaign-engine/__tests__/research-agent.test.ts` — modèle mock qui appelle `fetchWebsite` puis `browsePage("/pricing")` puis émet l'output (AC1) ; vérifie `synthesized` conforme au schéma + `publicContentDepth=publicContent.length` (R1.5/AC2) ; `prepareStep` renvoie Haiku au step>0 (AC3) ; maxSteps respecté. Réfs : R1.1-R1.6.
**Effort** : 1 j.

## T4 — Câblage dans `buildIntelligenceBrief` + flag + fallback — [NEW]
**Action** : Modifier `build-intelligence-brief.ts:50-69` (Fix 4) : gate `RESEARCH_AGENT_ENABLED`, `runResearchAgent` en primaire, `isBudgetError`→throw (R4.2), autre erreur→`fetchAllSources+synthesizeBrief` (R4.3). Mapper `r.collected`→`sources` pour `briefData` (`:80-83`). Ne PAS toucher upsert/TTL/signature.
**Verify** : `pnpm tsc` ; `pnpm lint` ; diff montre upsert (`:99-106`) inchangé et signature `:19-24` inchangée.
**Test** : `lib/campaign-engine/__tests__/build-intelligence-brief.agent.test.ts` (db + sources + agent mockés) — flag off → `runResearchAgent` jamais appelé, `fetchAllSources` utilisé (AC5) ; flag on + agent ok → brief persisté depuis la sortie agent (AC2) ; agent throw non-budget → fallback produit brief non-null (AC6) ; agent throw budget → propagé, fallback NON appelé (AC7). Réfs : R1.1,R3.1-3.4,R4.2,R4.3,R4.5.
**Effort** : 0.75 j.

## T5 — Garde SSRF/scope ciblée + tronquage tokens (durcissement) — [NEW]
**Action** : Vérifier/compléter dans `browse-page.ts` la re-vérification d'host post-redirection (`res.url`) et la liste IP privées (`10.`, `192.168.`, `172.16-31.`, `127.`, `169.254.`, `::1`, `localhost`) ; confirmer tronquage des résultats outils (≤3000 chars) dans `research-agent-tools.ts`.
**Verify** : test T1 redirection cross-domain rouge sans la garde, vert avec.
**Test** : étendre `browse-page.test.ts` — `res.url` hors-domaine après 302 → out_of_scope (AC8). Réfs : R2.2.1,R2.2.2,R4.4.
**Effort** : 0.25 j.

## T6 — Éval coût/qualité + activation graduée — [NEW]
**Action** : Ajouter un cas dans la suite d'éval recherche (réutiliser l'infra `lib/evals/`) comparant brief agent vs déterministe sur 3 companies fixtures (1 site classique, 1 SPA, 1 sans domaine) ; mesurer coût via `llm_calls`. Documenter le seuil d'activation `RESEARCH_AGENT_ENABLED` dans le PR.
**Verify** : éval tourne, coût agent ≤ ~4x mono-call, qualité (bestAngle/painPoints non vides) ≥ déterministe sur le cas site classique.
**Test** : `lib/campaign-engine/__tests__/research-agent.eval.test.ts` — assert structure non vide sur fixture site classique ; assert dégradation gracieuse (brief non-null) sur fixture sans domaine (edge case 1). Réfs : R4.4,R4.5.
**Effort** : 0.5 j.

## Ordre d'exécution
T0 → T1 → T2 → T3 → T4 → T5 → T6. (T1/T2 parallélisables ; T3 dépend de T1+T2 ; T4 dépend de T3 ; T5 durcit T1 ; T6 valide l'ensemble.)

## Estimation effort (jours)
T1 0.75 · T2 0.75 · T3 1.0 · T4 0.75 · T5 0.25 · T6 0.5 → **~4.0 j-dev**.
Flaggé océan (hors estimation) : crawler headless JS-render, `enrichApollo` réel (P1-10).
