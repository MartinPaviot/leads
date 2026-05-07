# PROMPT — Exécution mission Monaco-Parity P0 (à coller dans une nouvelle session Claude Code)

> Copier tout ce qui suit (entre les `===`) et coller comme premier message dans une nouvelle session Claude Code lancée depuis `C:\Users\marti\leads`.

```
===

# MISSION

Tu es l'ingénieur lead chargé d'exécuter le plan Monaco-Parity P0 défini dans `_specs/MONACO-PARITY-P0-IMPLEMENTABLE-SPECS.md`. Ton job : implémenter les 5 P0 jusqu'à merge en main, dans l'ordre prescrit, en mode pleinement autonome. Tu ne demandes pas de permission entre les étapes. Tu ne demandes pas à Martin de "vérifier dans son navigateur" ou de "tester localement" — tu fais tout toi-même via tes outils (Bash, Playwright MCP, Edit, Write, etc.).

Tu n'as pas le contexte de la session précédente. Démarre froid. Tout ce dont tu as besoin est sur disque.

# ÉTAPE 0 — CHARGEMENT DU CONTEXTE (obligatoire, dans cet ordre)

Lis ces 4 fichiers en entier, dans cet ordre, AVANT toute autre action. Ne saute aucun.

1. `CLAUDE.md` — règles du repo (hook-first, write-immediate, screenshot everything, never ask permission, do-it-don't-delegate, git co-author Rippletide).
2. `_research/monaco-bilan-et-classification-2026-05-06.md` — bilan Monaco + classification 6-étapes + actions manuelles Martin + checklist onboarding. C'est ton mental model.
3. `_research/monaco-comment-ils-font-2026-05-07.md` — analyse architecte feature par feature + 6 patterns transversaux + le système nerveux entre étapes.
4. `_specs/MONACO-PARITY-P0-IMPLEMENTABLE-SPECS.md` — TES SPECS. Schema DB, routes API, prompts LLM, UI wireframes, tests, migrations, telemetry. C'est ce que tu dois implémenter.

Puis, recall mémoire persistante :
- `mcp__rippletide__recall("Monaco parity P0 specs Elevay")` (limit 10)
- `mcp__rippletide__recall("Elevay codebase architecture migrations")` (limit 5)

À la fin de l'étape 0, tu écris dans le chat : "Context chargé. Plan d'exécution: <résumé en 5 lignes des 5 P0 dans l'ordre que tu vas attaquer>."

# ÉTAPE 1 — VALIDATION PRÉ-EXÉCUTION

Avant de coder, vérifie 4 choses :

1. **État Git** : `git status`, `git branch`, `git log --oneline -10`. Si la branche actuelle a des modifications non-committées, créer un WIP commit avant de partir.

2. **Tests baseline** : `npm test 2>&1 | tail -30`. Constat connu : ~180 tests fail sur `next-auth` ESM dans vitest. Si ce blocker n'est pas résolu, tu DOIS le résoudre AVANT de lancer le P0-5 (qui ajoute des tests). Solution probable : update vitest config `server.deps.inline` ou alias next-auth → CommonJS build. Investigue dans `vitest.config.ts` et `package.json`.

3. **Migrations DB** : `ls drizzle/ | tail -10`. Vérifie que les migrations 0039, 0040, 0041, 0042 sont appliquées en local (`npm run db:migrate` ou équivalent — check `package.json` scripts).

4. **Code existant pour les 5 P0** : confirme la présence des fichiers tagués dans la spec :
   - `src/db/schema/onboarding-and-visitors.ts`
   - `src/lib/onboarding/checklist.ts` + `phase-validators.ts`
   - `src/lib/coaching/{chunk-transcript,citation-parser,retrieve-transcript-chunks,pre-send-review}.ts`
   - `src/inngest/{coaching-engine,deal-signal-sync}.ts`
   - `src/app/(dashboard)/sequences/[id]/page.tsx` + `/review/page.tsx`
   - `src/app/(dashboard)/onboarding-v3/page.tsx`

Si UN de ces fichiers manque, c'est que ma spec est désalignée avec le code. Tu STOP et tu écris à Martin : "Misalignment détecté: <fichier> manquant. Spec corrigée avant exécution: <correction>."

À la fin de l'étape 1, écris : "Pré-vol OK. Tests baseline: <X passing / Y failing>. Migrations: <à jour | <N> en attente>. Branche cible: feat/monaco-parity-p0."

# ÉTAPE 2 — EXÉCUTION (séquencement strict)

Tu attaques dans cet ordre. Une seule branche par P0. Merge en main UNIQUEMENT après que tous les acceptance criteria de la spec passent.

## Sprint 1 (semaines 1-3) — En parallèle

### P0-5 — Auto-fill deal fields E2E proof
Branch : `feat/monaco-parity-p0-5-deal-autofill`
Spec : `_specs/MONACO-PARITY-P0-IMPLEMENTABLE-SPECS.md` section "P0-5"
Effort estimé : 7.5j

### P0-1 — Sequence approval UI per-draft
Branch : `feat/monaco-parity-p0-1-sequence-drafts`
Spec : section "P0-1"
Effort estimé : 8j

Tu peux les attaquer en parallèle SI tu te disciplines à faire commit fréquents et à ne pas mélanger les changements. En pratique, fais P0-5 d'abord (plus rapide à proof), puis P0-1.

## Sprint 2 (semaines 4-6) — En parallèle

### P0-3 — Onboarding wizard hardening
Branch : `feat/monaco-parity-p0-3-onboarding-quality`
Spec : section "P0-3"
Effort estimé : 12j

### P0-4 — Coaching transcript-grounded
Branch : `feat/monaco-parity-p0-4-coaching-citations`
Spec : section "P0-4"
Effort estimé : 8.5j

## Sprint 3 (semaines 7-9)

### P0-2 — Visitor ID Snitcher integration
Branch : `feat/monaco-parity-p0-2-visitor-id`
Spec : section "P0-2"
Effort estimé : 10j

⚠️ Pré-requis externe : Martin doit signer un contrat Snitcher (~$500-2000/mo). SI les credentials ne sont pas dans `_credentials/bootstrap.json` quand tu attaques le P0-2, tu STOP et tu écris à Martin : "P0-2 bloqué: SNITCHER_API_KEY manquante dans _credentials/bootstrap.json. Cf. https://snitcher.com/api pour signup."

# ÉTAPE 3 — DISCIPLINE D'EXÉCUTION

Pour chaque P0 :

1. **Crée la branche** : `git checkout -b feat/monaco-parity-p0-X-<short-name>`

2. **Read la spec section P0-X** dans le doc spec en entier. Note les 10 tasks listés.

3. **Pour chaque task** dans l'ordre :
   - Code la task
   - Écris les tests AVANT la fin de la task
   - `npm test -- <relevant test file>` doit passer
   - `git add` + `git commit -m "<conventional commit>"` avec trailer `Co-Authored-By: Rippletide <admin@rippletide.com>` (cf. CLAUDE.md ligne 73)
   - Mets à jour le todo list (TaskUpdate)
   - Si la task révèle que la spec est fausse, modifie la spec dans le doc avec un commentaire `<!-- corrected 2026-XX-XX: reason -->` et continue

4. **Quand toutes tasks de P0-X complétées** :
   - `npm test` (full suite) → 0 fail attendu
   - `npx tsc --noEmit` → 0 error attendu
   - `npm run lint` (si existe) → 0 error attendu
   - Vérifier les acceptance criteria GIVEN/WHEN/THEN un par un manuellement (avec Playwright pour les UI)
   - Si tout passe : `git checkout main && git merge --no-ff feat/...` (pas de fast-forward, on garde le merge commit)
   - `git push origin main`

5. **Après merge** : écris dans `_reports/monaco-parity-progress.md` (créer si n'existe pas) une ligne du type :
   ```
   ## P0-X — <titre> — MERGED 2026-XX-XX
   - Branch: feat/monaco-parity-p0-X-...
   - Tests: N added, all passing
   - Migrations: drizzle/00XX_*.sql
   - Files changed: <count>
   - Telemetry: <metrics added>
   - Notes: <any spec correction or surprise>
   ```

6. **Checkpoint Martin** : oui, après chaque P0 mergé, tu peux faire un report court (5 lignes) à Martin et continuer immédiatement le P0 suivant. Tu n'attends PAS sa réponse.

# ÉTAPE 4 — RÈGLES INVIOLABLES

**Sécurité** :
- Ne JAMAIS commit `_credentials/`, `.env*`, ou tout secret. Le `.gitignore` est ton ami — vérifie qu'il les inclut.
- Sur tous les nouveaux endpoints API : tenant scope obligatoire (cf. pattern `src/app/api/sequences/[id]/route.ts` lignes 21-32).
- Toute nouvelle ingestion d'input user passe par Zod validation.

**Qualité** :
- Toute nouvelle migration DB est `IF NOT EXISTS` (idempotente).
- Tout nouveau worker Inngest a `concurrency.limit` si appelle API externe.
- Toute nouvelle UI a au moins 1 test Playwright E2E.
- Tout nouveau prompt LLM a au moins 3 cases dans une eval suite.

**Process** :
- Commits fréquents (au moins 1 par task complété). Pas de "big bang commit".
- Branches feature, jamais commit direct sur main sauf merge.
- Pas de `--no-verify`, pas de `--force`, pas de skip hooks.
- Pas de `git reset --hard` sur du travail non-pushé sans avoir vérifié manuellement.

**Mémoire** :
- À la fin de chaque P0, écrire un memory Rippletide : `mcp__rippletide__remember({ category: "fact", content: "P0-X completed: ..." })`.
- Si tu découvres un pattern réutilisable (ex: nouveau hook React), écris memory `category: "preference"`.

**Communication** :
- Si tu hésites sur une décision architecturale > 30 min, STOP et challenge la spec avant de coder. La spec n'est pas sainte.
- Si un test fail 5x consécutif sur le même issue, escalation : écris dans `_harness/escalation.md` ce qui se passe, propose 3 alternatives (respec, simplify, skip), et CONTINUE sur le P0 suivant.
- Si Martin a posté un message intermédiaire, lis-le, réponds en 2 lignes, continue. Ne dérive pas du plan sauf si Martin demande explicitement un pivot.

# ÉTAPE 5 — CRITÈRES DE FIN DE MISSION

La mission est terminée quand :

1. Les 5 branches `feat/monaco-parity-p0-{1,2,3,4,5}-*` sont mergées en main
2. `npm test` passe avec 0 fail
3. `npx tsc --noEmit` passe avec 0 error
4. Le fichier `_reports/monaco-parity-progress.md` contient les 5 entrées MERGED
5. Pour chaque P0, le Datadog dashboard correspondant existe (ou est documenté en TODO si pas d'accès Datadog)
6. Le repo a ~46 commits supplémentaires (1 par task) avec les bonnes co-authorship trailers

Quand atteint, écris à Martin un message final :
> "Mission Monaco-Parity P0 terminée. 5/5 mergés. Tests: <X> passing. Effort réel: <N> jours. Surprises: <bullet list>. Next: <recommandations 3 lignes pour Sprint suivant>."

# ÉTAPE 6 — ANTI-PATTERNS À ÉVITER

❌ Ne pas écrire `// TODO: implement later` dans du code mergé en main.
❌ Ne pas désactiver des tests pour faire passer le CI ("disabled.test.ts.skip").
❌ Ne pas skip Zod validation parce que "c'est interne".
❌ Ne pas implémenter une feature qui n'est pas dans les 5 P0 (scope creep).
❌ Ne pas refactorer du code existant qui marche, sauf si la spec le demande explicitement.
❌ Ne pas demander permission. Tu agis.
❌ Ne pas attendre la réponse de Martin entre P0s. Tu enchaînes.
❌ Ne pas mocker la DB dans les tests (cf. memory Martin: "integration tests must hit a real database, not mocks. Reason: prior incident where mock/prod divergence masked a broken migration").
❌ Ne pas mettre d'emojis dans l'UI (cf. memory: "Commit e03826c purged emojis as 'AI clichés'").
❌ Ne pas brander "LeadSens" dans l'UI user-facing — c'est "Elevay" (cf. memory: brand is Elevay).
❌ Ne pas hyper, pas de superlatif marketing dans le code, les commits ou les commentaires (cf. memory: "no hype or flattery, stay strictly factual").

# ÉTAPE 7 — DÉMARRAGE IMMÉDIAT

Tu n'attends pas confirmation. Maintenant :

1. Lis `CLAUDE.md` (Read tool)
2. Lis `_research/monaco-bilan-et-classification-2026-05-06.md` (Read tool, full)
3. Lis `_research/monaco-comment-ils-font-2026-05-07.md` (Read tool, full)
4. Lis `_specs/MONACO-PARITY-P0-IMPLEMENTABLE-SPECS.md` (Read tool, full)
5. Recall Rippletide (2 calls)
6. Écris ton plan d'exécution (5 lignes)
7. Lance l'étape 1 (validation pré-vol)
8. Enchaîne directement sur P0-5 puis P0-1
9. Continue jusqu'à mission complète

C'est parti.

===
```

# Comment l'utiliser

1. Tu lances une nouvelle session Claude Code dans `C:\Users\marti\leads`.
2. Tu copies tout ce qui est entre les `===` ci-dessus (sans les `===` eux-mêmes).
3. Tu colles comme premier message.
4. La session démarre cold, charge le contexte, valide, et exécute en autonomie.

# Pourquoi ce prompt fonctionne

- **Self-contained** : aucun "comme on a discuté précédemment". Tout est sur disque ou dans Rippletide.
- **Hook-first** : démarre par CLAUDE.md (qui contient la règle hook-first Rippletide).
- **Write-immediate respecté** : commits fréquents, progress file, memory ingestion.
- **Screenshot everything** : Playwright pour les tests E2E UI implicite dans la spec.
- **One browser** : pas de parallèle Playwright + agents.
- **Never ask permission** : règle inviolable explicite (anti-pattern).
- **Do it don't delegate** : explicitement listé.
- **Spec-driven, not idea-driven** : pointe vers les specs comme source de vérité, mais autorise correction si désaligné.
- **Escalation path** : 5 fails consécutifs → escalation.md + continue.
- **Mesurable end** : 6 critères concrets de fin de mission.

# Variantes possibles selon ton besoin

| Variante | Modification |
|---|---|
| **Sprint unique** (juste P0-5 + P0-1) | Remplace "5 P0" par "2 P0", supprime sections P0-2/3/4 dans Étape 2 |
| **Avec un autre dev humain** | Ajoute "Tu travailles avec @<dev-name>. Communique via PRs et Slack #monaco-parity. Branches taggées `feat/p0-X-<initials>`" |
| **Mode plus prudent** | Change "tu n'attends pas la réponse de Martin" → "tu attends ack Martin entre chaque P0" |
| **Mode plus agressif** | Ajoute "Tu peux skipper les eval suites si elles t'empêchent de merge un P0 dans son budget temps. Tu rajoutes les evals en post-merge." |

Le fichier est sauvé dans `_specs/MONACO-PARITY-EXECUTION-PROMPT.md` — tu peux le réutiliser ou modifier les variantes.