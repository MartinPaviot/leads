# Orion — BRIEF DE LOT · pack4 « output-gates » (`feat/orion-pack4`)

> **Brief auto-suffisant.** Cette session n'a QUE ce fichier + les docs pointés. Tout ce qu'il faut
> pour EXÉCUTER pack4 sans rien redériver est ici. Orion est un **repo SÉPARÉ** qui reproduit en interne le **monorepo** Elevay (racine `app/` : turbo +
> pnpm-workspace + `pnpm.overrides`) ; le package `@orion/web` vit sous `app/apps/web/`, ses fichiers sous **`app/apps/web/src/`**. Les `file:line` REUSE sont **réels et
> vérifiés** : ils désignent la **SOURCE Elevay À COPIER** (provenance, relative à
> `C:/Users/ombel/leads/app/apps/web/src/`, le repo Elevay d'où l'on **copie**). Les modules Elevay sont
> **vendorés (copiés)** dans Orion, **PAS** importés via workspace.
>
> **Sortie = VÉRIFIÉE sur les API réelles** (`orion/research/partner-apis-2026-06-27.md`, relevé
> 2026-06-28). Correction majeure vs versions antérieures du brief :
> - **Fiber AI N'EST PAS une SORTIE.** OpenAPI 1.40.0 lue : **zéro** endpoint d'envoi. Fiber est une
>   **ENTRÉE** (reveal waterfall `POST /v1/contact-details/single` + signaux **Tracker** par webhook
>   Svix). → Fiber sort de pack4 ; il est branché en **pack2** (reveal) + **pack5** (signaux Tracker).
>   **PAS de `FiberAdapter` de sortie.**
> - **Lopus n'a AUCUNE API publique** (docs/api/dev morts, app WorkOS-gated, seul artefact = SDK chat
>   `lopus-ai`). → **PAS de `LopusAdapter` REST.** « Lopus » = alias vers le **webhook générique**
>   (URL fournie par le client). Ne JAMAIS tenter un POST REST Lopus.
> - **Sorties RÉELLES (pack4) = 4** : **Instantly** (natif, `custom_variables` map scalaire plate),
>   **Orange Slice** (webhook colonne `POST api.orangeslice.ai/webhook/{sheet}/{col}`, JSON **plat**,
>   secret convenu côté colonne), **webhook générique HMAC** (enveloppe `{lead, brief, meta}`),
>   **generic** (renvoie le brief imbriqué, aucun POST). **Lopus** route via le webhook générique.
>
> **Lire (dans l'ordre, seulement ces passages) :**
> 1. `orion/research/partner-apis-2026-06-27.md` — **la vérité API** : §0 synthèse, §1 Instantly,
>    §4 Orange Slice (webhook colonne), §5 webhook générique, §6 **mapping brief→champs par destination**.
> 2. `orion/spec/00-ARCHITECTURE.md` — D7 (clés chiffrées per-tenant), D8 (gate non-contournable),
>    §3 règles d'or 1-8.
> 3. `orion/spec/00-EXECUTION-GUIDE.md` — §1 pack4, §3.1 ownership, §3.2 registres append-only, §4 invariants.
> 4. `orion/spec/00-PREREQUISITES.md` — §3 pièges #12 (Instantly scalaire), #1 (Inngest 2-arg),
>    #11 (page export gap), §1.1 (clés sink JAMAIS en env), GAP-3 (clés non fournies → `dryRun`).
> 5. `orion/spec/design.md` §6 (ADAPTATEURS SORTIE) — l'interface, le gate-avant-push, les destinations.
> 6. `orion/spec/tasks.md` T-32..T-37 — DDL d'I/O, signatures, VERIFY, TEST de chaque tâche.

---

## 0. PILE & FAITS VÉRIFIÉS (figés — ne pas redécouvrir)

| Dépendance | Version réelle | Note d'exécution |
|---|---|---|
| `next` | `^15.5.15` | App Router (Turbopack), React 19, **Tailwind 4 config-less** (`@theme` dans `globals.css`). |
| `drizzle-orm` | `^0.45.2` | via `pnpm.overrides` ; le `db` global est typé `db as any` (hérité pack0/pack1). |
| `next-auth` | `5.0.0-beta.30` | v5 beta. |
| `inngest` | `^4.5.1` | **`createFunction` 2-arg** ; `triggers` DANS la config ; **`concurrency` = array**. |
| `ai` | `^6.0.199` | AI SDK v6 + `@anthropic-ai/sdk` (modèles Claude récents). |
| `postgres` | `^3.4.9` | client `postgres` (Supabase). |
| `zod` | `^4.4.3` | inputSchema des outils MCP. |
| `pnpm` / Node | `10.15.1` / **Node 22** | `pnpm install --frozen-lockfile` (pas de `node_modules` junctionné — divergence CI connue). |

- **DB partagée** : base `leads` (Supabase Postgres), tenant applicatif `elevay`. RLS via le rôle
  `elevay_app` ; **toute** lecture/écriture passe par `withTenantTx(tenantId, …)` qui pose
  `set_config(..., true)` (**transaction-local** ; jamais `false`, jamais le `db` global).
- **Runner migration** : custom `scripts/apply-migrations.ts` — table de suivi **`__elevay_migrations`**
  (`scripts/apply-migrations.ts:52`). `pnpm db:migrate` est **désactivé et sort en exit 1** (journal
  drizzle figé à idx 12). Dev = `db:push` ; appliquer = `db:migrate:apply` ; prod via `DATABASE_URL_OWNER`.
  **pack4 ne crée AUCUNE migration** (tables export/credentials appartiennent à pack1).

**Modules Elevay COPIÉS (vendorés) dans Orion tels quels (REUSE, JAMAIS édités après copie) — `file:line` sources Elevay vérifiés :**
- `lib/guardrails/sending-gate.ts:212` → `evaluateSend` (oracle d'éligibilité ; 8 gates, fail-closed).
- `lib/providers/instantly/send-adapter.ts:19` → `toInstantlyCustomVariables` (scalaires only ; droppe
  objets/arrays en silence).
- `lib/campaign-engine/types.ts:50` → `IntelligenceBrief` ; `build-intelligence-brief.ts:26` →
  `buildIntelligenceBrief` (cache `intelligenceBriefs`, 14 j) — contexte d'entrée du brief.
- `lib/signals/record-signal.ts:94` → `recordCompanySignal` (écrit `properties.signals[]`).
- `db/canonical/identity.ts:67` + `db/canonical/upsert.ts:108` → identité canonique (réconciliation).
- `app/api/mcp/route.ts` (`MCP_TOOLS` `:19`) — squelette MCP JSON-RPC ; Bearer `mcp_*` →
  `tenants.settings.mcpApiKeys`. pack0 a extrait le dispatch ; pack4 ajoute **une** entrée au registre.
- `lib/crypto/settings-encryption.ts` → `encryptSecret(plaintext):string` (`:49`),
  `decryptSecret(encoded):string` (`:65`), `verifyCiphertextIntegrity(encoded):boolean` (`:90`) ;
  format `EncryptedSecret = {iv, ciphertext, tag}`. **Déchiffrer au call-time uniquement.**

---

## 1. OBJECTIF + PÉRIMÈTRE

**Objectif.** Construire la **couche de sortie gatée** d'Orion :
1. l'interface `OutboundDestination` (**importée** de `lib/outbound/types.ts`, produite par **pack1** —
   pack4 ne la crée PAS) ;
2. l'orchestrateur `export_to_outbound` (outil MCP + job Inngest durable) qui **passe CHAQUE lead par
   `evaluateSend` AVANT tout POST tiers** — le gate vit DANS le wrapper serveur, **inatteignable depuis
   le JSON-RPC** ;
3. les **adaptateurs de sortie RÉELS** : **Instantly** (natif, flatten scalaire), **Orange Slice**
   (webhook colonne, JSON plat), **webhook générique HMAC** (enveloppe `{lead, brief, meta}`),
   **generic** (brief imbriqué, sans POST), + **Lopus → webhook générique** (alias) ;
4. le câblage des **clés partenaires per-tenant chiffrées** (`integration_credentials`) ;
5. le **mapping brief→champs par destination** (table §6 du doc partner-apis, reproduite ici en §6) ;
6. les **tripwires** prouvant (a) qu'aucun chemin d'export ne contourne le gate, (b) qu'Orion n'envoie
   jamais de cold via une infra cliente (pas de mailer interne sur ce chemin).

**Hors-périmètre explicite (corrections vérifiées) :**
- **Fiber AI** = ENTRÉE, pas sortie → **pack2** (reveal `contact-details/single`) + **pack5** (signaux
  Tracker via webhook Svix). **Aucun fichier Fiber dans pack4.**
- **Lopus** = pas d'API → **pas d'adaptateur dédié** ; route via `webhook` générique.

**Mapping tâches :** T-32 (interface + orchestrateur MCP), T-33 (Instantly + flatten), T-35 (job Inngest
durable), T-37 (tripwire handoff) — **MVP** ; T-34 (Orange Slice + webhook HMAC + generic + alias Lopus)
— **`[P1]`** mais inclus (lac boilable). Effort total **≈ 5,25 j-h** (réduit : Fiber retiré).

### IN (ce lot POSSÈDE — voir §3)
Orchestrateur d'export, les **4 destinations réelles** + flatten partagé, `export_to_outbound` (MCP),
`export/run` (Inngest durable gaté), lecture/déchiffrement des credentials sink, mapping par destination,
tripwires d'export.

### OUT (possédé par un AUTRE lot — NE PAS créer/éditer)
- **pack1** possède : `src/lib/outbound/types.ts` (le **contrat** `OutboundDestination`/`ExportResult`/
  `EncryptedSecret` — pack4 l'**importe**), les tables `export_jobs`/`export_items`/
  `outbound_destinations`/`integration_credentials` (`db/schema/{outbound,integrations}.ts`), le contrat
  zod `OutreachBrief` (`src/lib/mcp/contracts/outreach-brief.schema.ts`), le wrapper d'import
  `src/lib/guardrails/sending-gate.ts` (réexport `evaluateSend`).
- **pack2** possède l'**ingestion** — y compris le **reveal Fiber** (`contact-details/single`).
- **pack3** possède : `get_outreach_brief` (`src/lib/mcp/outreach-brief.ts`), `evaluate_send` (dry-run),
  le bump proto MCP `structuredContent`. pack4 code contre le **contrat `OutreachBrief` de pack1** + un
  **mock** ; le câblage runtime réel de `getOutreachBrief` se fait en **pack7**.
- **pack0** possède : `src/app/api/mcp/route.ts` (squelette + dispatch), `src/lib/mcp/registry.ts`
  (append-only), `src/inngest/registry.ts` (append-only), `src/inngest/client.ts`, `src/lib/ai/*`,
  `src/db/{index,rls}.ts`, `lib/crypto/*`. pack4 **ajoute UNE ligne** dans chaque registre, ne réécrit rien.
- **pack5** possède les **signaux Tracker Fiber** (récepteur webhook Svix → `whyNow`/`signal_evidence`).
- **pack6** l'UI ; **pack7** l'intégration finale + suite cœur.

**RÈGLE D'OR :** pack4 n'édite QUE ses fichiers (§3). Les modules Elevay REUSE (`sending-gate.ts`,
`send-adapter.ts`, `settings-encryption.ts`) sont **copiés depuis Elevay tels quels, jamais édités après copie**.

---

## 2. PRÉREQUIS

**Lots à finir avant (durs) :** **pack0** (coquille bootable : registres MCP/Inngest, client DB, RLS,
AI tracé, crypto) **+ pack1** (tables export/credentials, contrats `OutboundDestination`, `OutreachBrief`,
`EncryptedSecret`, wrapper `evaluateSend`). Soft : **pack3** (`getOutreachBrief` runtime) — coder contre
le contrat + mock, intégrer en pack7.

**Démarrage de session :**
```sh
git fetch origin && git checkout main && git pull
git checkout -b feat/orion-pack4
git rebase origin/main          # récupérer pack0 + pack1 (contrats à jour)
cd app && pnpm install --frozen-lockfile && pnpm --filter @orion/web tsc
```

**Cartes nécessaires de 00-PREREQUISITES (résumé exécutable) :**
- **Piège #12 — Instantly = scalaires uniquement.** `toInstantlyCustomVariables`
  (`send-adapter.ts:19`) **droppe silencieusement objets/arrays** → un brief imbriqué poussé tel quel =
  perte de données muette. **Flatten obligatoire AVANT POST.** Même filet réutilisé pour Orange Slice
  (le tableur n'accepte que des cellules scalaires).
- **Piège #1 — Inngest 2-arg.** `inngest.createFunction(config, handler)`. Triggers DANS la config
  (`triggers:[{event}]`), `concurrency` = **array**, `maxDuration 300` au niveau route. JAMAIS la forme 3-arg.
- **Clés sink JAMAIS en env** (§1.1, D7). Instantly / Orange Slice / webhook = **per-tenant chiffrées**
  dans `integration_credentials`. Aucun `process.env.INSTANTLY_API_KEY`. Un test env-shape (pack7)
  l'asserte ; ne l'introduis pas.
- **GAP-3 — clés non fournies.** Aucune clé sink réelle dans cette session → la **démo tourne en
  `dryRun:true`** (plan sans POST tiers). Le code doit gérer **clé absente → erreur explicite, pas de
  POST** (et `dryRun` court-circuite la lecture credential).
- **Piège #11 — export nommé sur `page.tsx`/`layout.tsx` casse `next build`** : non pertinent ici (pas
  de page) mais ne pas exporter du non-route depuis un fichier de page.
- **`tenantId` ← Bearer, jamais argument** (invariant #1). L'`inputSchema` de `export_to_outbound` **ne
  contient PAS** `tenantId`.

---

## 3. FICHIERS POSSÉDÉS PAR pack4 (création + édition exclusives)

> Tous sous `app/apps/web/src/` (package `@orion/web`, miroir du monorepo Elevay ; chemins relatifs à ce `src/`). **NET-NEW** sauf mention. Zéro chevauchement avec
> un autre lot (vérifié contre 00-EXECUTION-GUIDE §3.1). **Aucun fichier `fiber.ts` ni `lopus.ts`.**

| Fichier | Type | Rôle |
|---|---|---|
| `lib/outbound/flatten.ts` | NET-NEW | `flattenBriefScalar(brief): Record<string, string\|number\|boolean>` — flatten pur PARTAGÉ (Instantly + Orange Slice + le bloc `flat` du webhook). |
| `lib/outbound/instantly-map.ts` | NET-NEW | `flattenBriefForInstantly` = `flattenBriefScalar` → passé par `toInstantlyCustomVariables` (`send-adapter.ts:19`) comme filet. |
| `lib/outbound/destinations/instantly.ts` | NET-NEW | Client Instantly V2 (`/api/v2/leads`·`/api/v2/leads/list`, XOR `campaign_id`/`list_id`, `429` backoff, `skip_if_in_workspace`). Implémente `OutboundDestination`. |
| `lib/outbound/destinations/orange-slice.ts` | NET-NEW (`[P1]`) | `POST {config.webhookUrl}` (= `https://api.orangeslice.ai/webhook/{sheet}/{col}`) ; **body JSON PLAT** (`flattenBriefScalar`) ; auth = header convenu (`config.headerName`/`headerValue`, déchiffré). URL+secret **fournis par le client** (pas d'auto-provisioning). |
| `lib/outbound/destinations/webhook.ts` | NET-NEW (`[P1]`) | `POST {config.webhookUrl}` enveloppe **`{lead, brief, meta}`**, **HMAC-SHA256** du corps brut (`X-Orion-Signature: sha256=<hmac>` + `X-Orion-Timestamp`) ; secret per-tenant `config.webhookSecret`. Vendor-neutre (Smartlead/Lemlist/maison + **Lopus**). |
| `lib/outbound/destinations/generic.ts` | NET-NEW (`[P1]`) | Ne POST rien — renvoie le **brief imbriqué complet** (+`citableFacts[]`/`doNotClaim[]`) en `structuredContent` (l'agent écrit+envoie sur SA pile). Pas de flatten. |
| `lib/outbound/destinations/index.ts` | NET-NEW | Registre `Record<kind, OutboundDestination>` + `getDestination(kind)`. **`lopus` → résout sur l'adaptateur `webhook`** (alias). **Pas de `fiber`** (input only → throw « Fiber est une source d'entrée, pas une destination »). |
| `lib/outbound/credentials.ts` | NET-NEW | `loadSinkCredential(tx, tenantId, provider) → {apiKey?, config}` : lit `integration_credentials`, REUSE `decryptSecret` (`settings-encryption.ts:65`). Jamais env. |
| `lib/mcp/export-to-outbound.ts` | NET-NEW | Handler MCP `export_to_outbound` : zod input + refine XOR Instantly + délègue le volume à `export/run`. |
| `lib/mcp/outbound-tools.ts` | NET-NEW | `McpToolModule` exporté `outboundTools = {tools, handlers}` (branché au registre §3.2a). |
| `inngest/export-to-outbound.ts` | NET-NEW | Job durable `export/run` : boucle leads → **gate** → flatten/project → POST ; bulk ≤1000 ; 429 backoff. |
| `lib/outbound/__tests__/flatten.test.ts` | NET-NEW | T-33 (flatten partagé scalaire). |
| `lib/outbound/__tests__/instantly-map.test.ts` | NET-NEW | T-33. |
| `lib/outbound/__tests__/export-to-outbound.test.ts` | NET-NEW | T-32. |
| `lib/outbound/__tests__/outbound-destinations.test.ts` | NET-NEW | T-34 (Orange Slice / webhook HMAC / generic / alias Lopus / Fiber rejeté). |
| `lib/outbound/__tests__/export-job.test.ts` | NET-NEW | T-35. |
| `lib/outbound/__tests__/no-internal-mailer-in-export.test.ts` | NET-NEW | T-37 tripwire. |

**Édition d'UNE ligne dans les registres append-only (zone balisée `<<< ORION:* >>>` — guide §3.2) :**
- `lib/mcp/registry.ts` : `import { outboundTools } from "@/lib/mcp/outbound-tools";` + ajout dans `MCP_MODULES[]`.
- `inngest/registry.ts` : `import { exportToOutbound } from "./export-to-outbound";` + ajout dans `INNGEST_FUNCTIONS[]`.
> Contention concurrente sur ces lignes → **garder les deux** (additif) ; au pire déléguer le branchement
> à pack7 (livrer les modules handler, pack7 câble).

**IMPORTÉ depuis pack1 (NE PAS créer) :** `lib/outbound/types.ts` (`OutboundDestination`, `ExportResult`,
`EncryptedSecret`), `lib/mcp/contracts/outreach-brief.schema.ts` (`OutreachBrief`),
`lib/guardrails/sending-gate.ts` (réexport `evaluateSend`), `db/schema.ts` (tables export/credentials).

---

## 4. ÉTAPES ORDONNÉES

> Avant CHAQUE commit : `git rev-parse --abbrev-ref HEAD` == `feat/orion-pack4` ; `git add` **scopé**
> (jamais `-A`/`.`). Un changement logique par commit. Trailer obligatoire (§6). Par tâche :
> code → TEST écrit → VERIFY exécuté soi-même (preuve : log) → commit.

### Étape 0 — Vérifier les contrats pack1 disponibles
**Action.** Confirmer que `lib/outbound/types.ts` exporte `OutboundDestination`/`ExportResult`/
`EncryptedSecret` et que `lib/mcp/contracts/outreach-brief.schema.ts` (zod `OutreachBrief`) existe.
Sinon : pack1 pas encore mergé → `git rebase origin/main`.
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `grep -n "OutboundDestination" lib/outbound/types.ts`.
**TEST.** —

### Étape 1 — T-33 · `flatten.ts` (partagé) + `instantly-map.ts` + `destinations/instantly.ts`
**Action.** Écrire le **flatten pur partagé** `flattenBriefScalar(brief)` → map **scalaire plate**
(`string|number|boolean`). Mapping exact (= §6, colonne Instantly/clé canonique) :

| Clé plate | Source brief (`OutreachBrief`) | Flatten |
|---|---|---|
| `email`/`first_name`/`company_name`/`job_title` (natifs Instantly) | persona + identity | as-is ; `email` déjà gaté |
| `personalization` (natif Instantly) | `messaging.bestAngle` | une phrase |
| `why_now` | `whyNow.whyNowSummary` | string |
| `signal_type`/`signal_strength` | `whyNow.topSignal.{type,strength}` | string |
| `signal_evidence_url`/`signal_evidence_quote` | `topSignal.evidence.{url,quote}` | url ; quote ≤200c |
| `pain_point_1..3` | `messaging.painPoints[]` | indexé, **blank-fill** |
| `citable_metric_1..3` | `citableFacts` (type metric) | `"{quote} [{url}]"` |
| `best_angle`/`cta_type`/`max_words`/`tone` | `messaging.{bestAngle,suggestedCta,methodology.maxWords,communicationStyle.tone}` | scalaires |
| `warm_path` | `warmPath.warmthSignals[0].detail` | `"{type}: {detail}"` |
| `firmo_source` | `firmographicProvenance[]` | `"industry:apollo; funding:crunchbase"` |
| `do_not_claim` | `doNotClaim[]` | **string** joint `" \| "` |
| `priority_score` | `whyNow.priorityScore` | number |
| `grounded`/`brief_expires_at` | `meta.{briefCompleteness>0, expiresAt}` | bool / iso |

`instantly-map.ts` : `flattenBriefForInstantly(brief) = toInstantlyCustomVariables(flattenBriefScalar(brief))`
(REUSE `send-adapter.ts:19` — filet 100% scalaire ; le flatten ne doit déjà rien imbriquer).
Client Instantly : base `https://api.instantly.ai/api/v2`, header `Authorization: Bearer <V2>`,
`POST /api/v2/leads` (single) / `POST /api/v2/leads/list` (bulk **≤1000**), `campaign_id` **XOR**
`list_id`, `skip_if_in_workspace:true` (dedup), `429` → backoff exponentiel. Clé via
`loadSinkCredential(provider:'instantly')` ; **clé absente → throw explicite, AUCUN POST** ;
`dryRun:true` → plan, pas de POST.
```ts
// flatten.ts — pur, réutilisé par Instantly + Orange Slice + webhook.flat
export function flattenBriefScalar(brief: OutreachBrief): Record<string, string | number | boolean> {
  const flat = { /* mapping ci-dessus ; blank-fill pain_point_1..3 / citable_metric_1..3 */ };
  return flat; // déjà scalaire ; Instantly le re-filtre par toInstantlyCustomVariables
}
```
**VERIFY.** Brief imbriqué de test → `flattenBriefScalar` → assert chaque valeur ∈
`string|number|boolean` (aucun objet/array) ; mock `fetch` 429 → 2e tentative après backoff.
**TEST `flatten.test.ts` + `instantly-map.test.ts`.** (a) projection **100% scalaire**, jamais le brief
imbriqué ; (b) XOR campaign/list respecté côté client ; (c) backoff 429 (mock) ; (d) clé absente →
erreur, 0 POST ; (e) `do_not_claim` joint `" | "` ; (f) quote tronquée ≤200c ; (g) `dryRun:true` → 0 POST.

### Étape 2 — T-37 · `credentials.ts` + tripwire handoff (no-internal-mailer)
**Action.** `loadSinkCredential(tx, tenantId, provider)` : `withTenantTx`, lit `integration_credentials`
(uniqueIndex `(tenantId, provider)`), `decryptSecret` (`settings-encryption.ts:65`) sur `encryptedApiKey`
+ déchiffre le `config` éventuel (URL webhook, header secret, HMAC secret), renvoie `{apiKey?, config}`.
**Jamais `process.env`.** Providers attendus : `instantly`, `orange_slice`, `webhook` (le `lopus` réutilise
le credential `webhook` du client). Écrire le **tripwire** prouvant que le chemin export n'importe
**ni `sendViaMailbox` ni un transport SMTP** (directive own-infra : l'envoi est celui du client).
**VERIFY.** `grep -rn "sendViaMailbox\|nodemailer\|createTransport\|owner-smtp" lib/outbound inngest/export-to-outbound.ts` → **0 hit**.
**TEST `no-internal-mailer-in-export.test.ts`.** (a) grep statique de `lib/outbound/` +
`inngest/export-to-outbound.ts` : aucune import de mailer interne/SMTP ; (b) `destination:"instantly"`
n'appelle (mock) que le client Instantly, jamais un mailer.

### Étape 3 — T-34 · Orange Slice + webhook HMAC + generic + alias Lopus `[P1]`
**Action.** Chacune implémente `OutboundDestination`.
- **Orange Slice** (`orange-slice.ts`) : `POST {config.webhookUrl}` où l'URL =
  `https://api.orangeslice.ai/webhook/{spreadsheet_id}/{column_id}` (UUIDs = secret de capabilité, fournis
  par le client). **Body = JSON PLAT** = `flattenBriefScalar(brief)` (les **noms de clés == noms de
  colonnes** du sheet, casse respectée). Auth = **header convenu** (`config.headerName` p.ex.
  `x-api-key`, `config.headerValue` = secret déchiffré côté colonne) — **pas** de Bearer plateforme.
  `Content-Type: application/json`. Pas d'endpoint REST lead/campagne (n'existe pas). URL/secret absents
  → `dryRun`/erreur explicite, **jamais** un POST hasardeux.
- **webhook générique** (`webhook.ts`) : `POST {config.webhookUrl}` enveloppe **`{lead, brief, meta}`**
  (`lead` = identity plate de réconciliation, `brief` = OutreachBrief imbriqué complet pour les agents IA,
  `meta` = `{source:"orion", idempotency_key:<orion_lead_id>, generated_at:ISO}`). **Signée HMAC-SHA256**
  du **corps brut** ; headers `X-Orion-Signature: sha256=<hmac>` + `X-Orion-Timestamp` + `Idempotency-Key`.
  Secret per-tenant `config.webhookSecret`. Vendor-neutre.
- **generic** (`generic.ts`) : ne POST rien — renvoie le **brief imbriqué complet** + `citableFacts[]`/
  `doNotClaim[]` dans `structuredContent`. Pas de flatten. (L'agent écrit+envoie sur SA pile et interroge
  notre verdict via `evaluate_send` de pack3.)
- **alias Lopus** : `getDestination('lopus')` **résout sur l'adaptateur `webhook`** (Lopus n'a aucune API
  → on POST l'enveloppe `{lead,brief,meta}` HMAC sur l'URL que le client Lopus / un middleware fournit).
  **Pas** de `LopusAdapter` REST. Si aucun credential `webhook` configuré → erreur explicite, 0 POST.
- **Fiber rejeté en dur** : `getDestination('fiber')` → throw « Fiber est une source d'ENTRÉE
  (reveal + signaux Tracker), pas une destination de sortie » (Fiber = pack2/pack5).
```ts
// webhook.ts — HMAC sur le corps brut
const rawBody = JSON.stringify({ lead, brief, meta });
const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
headers["X-Orion-Signature"] = `sha256=${sig}`;
headers["X-Orion-Timestamp"] = String(Date.now());
```
**VERIFY.** webhook → recalculer le HMAC côté test == signature envoyée ; Orange Slice → body **plat**
(aucune clé imbriquée) posté sur l'URL `{sheet}/{col}` avec le header convenu ; generic → sortie =
brief imbriqué entier ; `getDestination('lopus')` → utilise le client webhook ; `getDestination('fiber')`
→ throw.
**TEST `outbound-destinations.test.ts`.** (a) HMAC vérifiable ; (b) Orange Slice = JSON **plat**, header
convenu, 0 POST si URL absente ; (c) generic = brief imbriqué (pas de flatten) ; (d) `lopus` route vers
le webhook (enveloppe `{lead,brief,meta}`) ; (e) `getDestination('fiber')` → throw « entrée, pas
destination » ; (f) clé/URL absente → erreur, 0 POST.

### Étape 4 — T-32 · `export-to-outbound.ts` (handler MCP) + `outbound-tools.ts`
**Action.** Outil MCP `export_to_outbound`. **inputSchema zod (PAS de `tenantId`)** :
```ts
z.object({
  prospectIds: z.array(z.string()).min(1).max(1000),               // 1000 = plafond bulk Instantly
  destination: z.enum(["instantly","orange_slice","lopus","webhook","generic"]), // PAS de "fiber"
  campaignId: z.string().optional(),
  listId: z.string().optional(),
  skipIfInWorkspace: z.boolean().default(true),
  webhookUrl: z.string().url().optional(),                          // override par appel (sinon credential)
  dryRun: z.boolean().default(false),
}).refine(v => v.destination !== "instantly" || (!!v.campaignId !== !!v.listId),
  { message: "Instantly requires exactly one of campaignId|listId (XOR)" })
```
Annotation outil `{readOnlyHint:false, destructiveHint:true, openWorldHint:true}`. Le handler : résout
`tenantId` du Bearer (jamais argument), crée une ligne `export_jobs` (status `queued`), **délègue le gros
volume** via `inngest.send("export/run", {data:{exportJobId, tenantId, prospectIds, destination, config,
dryRun}})`, renvoie l'`ExportResult` (ou accusé `{jobId, status}` si async).
`outbound-tools.ts` exporte `outboundTools: McpToolModule = { tools:[…], handlers:{ export_to_outbound } }`.
**VERIFY.** `destination:"instantly"` sans exactement un de campaignId/listId → `refine` échoue ;
`destination:"fiber"` → l'enum rejette (validation) ; `tenantId` absent de l'inputSchema (grep).
**TEST `export-to-outbound.test.ts`.** (a) refine XOR (instantly: ni les deux, ni aucun) ; (b)
`dryRun:true` → **aucun POST tiers** ; (c) `inputSchema` sans `tenantId` (tripwire) ; (d) `prospectIds`
>1000 ou vide → validation échoue ; (e) `destination:"fiber"` → validation échoue (input only).

### Étape 5 — T-35 · `inngest/export-to-outbound.ts` (job durable gaté)
**Action.** `inngest.createFunction({ id:"export-to-outbound", retries:2, concurrency:[{key:
"event.data.exportJobId", limit:1}], triggers:[{event:"export/run"}] }, async ({event, step}) => …)`.
Boucle leads (tenant du Bearer via `event.data.tenantId`), **gate-d'abord** :
```
pour chaque lead :
  1. brief = getOutreachBrief(...)   // pack3 runtime / MOCK ici (soft dep) — contrat OutreachBrief pack1
  2. GATE = evaluateSend({ tenantId, toAddress, companyId, contactId, isCold:true, interactive:false })
        send:false → SKIP + export_items{outcome:'skipped', gate_code} ; PAS d'export
        send:true  → continue
  3. project = getDestination(destination)  // instantly: flatten ; orange_slice: flat ;
                                            // webhook/lopus: {lead,brief,meta} HMAC ; generic: brief
  4. POST sink (bulk ≤1000/appel, 429 → backoff exp) ; dryRun → plan sans POST
mettre à jour export_jobs{requested,exported,skipped,duplicates,status:'done'}
```
**INVARIANT (D8) :** `evaluateSend` (`sending-gate.ts:212`, REUSE INCHANGÉ) tourne **DANS** ce wrapper →
inatteignable depuis le JSON-RPC. `interactive:false` garde la **targeting SAFE_MODE active** → un compte
`unreviewed` produit `send:false code:"not_targeted"` (`:305`). Codes gate **réels vérifiés** :
`opted_out` (`:219`), `suppressed` (`:247`), `invalid_email` (`:261`), `lawful_basis_blocked` (`:274`),
`deliverability_paused` (`:286`), `not_targeted` (`:305`), `no-provider-connected` (`:336`/`:342`) ;
`catch` final → `{send:false}` (`:339`, zéro fail-open). Toute lecture DB via `withTenantTx` (RLS
`elevay_app`, `set_config(...,true)`). Credential per-tenant via `loadSinkCredential` ; **clé absente →
erreur explicite, pas de POST**.
**VERIFY (exécuter soi-même).** 3 leads dont 1 `unreviewed` + `dryRun:true` → **2 exportés (plan), 1 skip
`not_targeted`** ; `export_jobs`/`export_items` reflètent (`gate_code` renseigné sur le skip). Log la sortie.
**TEST `export-job.test.ts`.** (a) comptage exact + gate appelé **par lead** ; (b) skip
`unreviewed`→`not_targeted` avec `gate_code` persisté ; (c) mock 429 → backoff ; (d) clé absente →
erreur, 0 POST ; (e) `dryRun:true` → 0 POST tiers, plan correct.

### Étape 6 — Câblage registres (append-only) + pack-level green
**Action.** Ajouter `outboundTools` à `lib/mcp/registry.ts` et `exportToOutbound` à `inngest/registry.ts`
(UNE ligne import + UNE entrée array, dans les balises `<<< ORION:* >>>`).
**VERIFY.** `pnpm --filter @orion/web tsc` + `pnpm --filter @orion/web test` verts ;
`git diff --stat` scopé pack4 ; tripwires verts.
**TEST.** La suite pack4 complète passe.

---

## 5. CRITÈRES D'ACCEPTATION (testables)

1. **Gate-avant-push non-contournable.** Aucun chemin d'export n'effectue un POST sink avant
   `evaluateSend`. Preuve : `no-internal-mailer-in-export.test.ts` + revue : `push()` n'est appelé que sur
   des leads déjà `send:true`. (T-36 tripwire `export-passes-gate` côté pack1/pack7 reste vert.)
2. **Skip gaté tracé.** Un lead `unreviewed` + `interactive:false` → `send:false code:"not_targeted"`,
   **non poussé**, `export_items.gate_code` renseigné, `export_jobs.skipped` incrémenté.
3. **Instantly 100% scalaire.** Un brief imbriqué → `custom_variables` ne contenant que
   `string|number|boolean` (aucun objet/array survit `flattenBriefScalar`→`toInstantlyCustomVariables`).
4. **XOR Instantly.** `destination:"instantly"` sans exactement un de `campaignId|listId` → validation échoue.
5. **Orange Slice = JSON plat sur l'URL colonne.** Body 100% scalaire posté sur
   `api.orangeslice.ai/webhook/{sheet}/{col}` avec le header convenu ; clés == noms de colonnes ; **aucun
   POST si URL/secret absent**.
6. **Webhook HMAC vérifiable.** Enveloppe `{lead, brief, meta}`, `X-Orion-Signature: sha256=<hmac>` du
   corps brut recalculable côté test ; **generic** = brief imbriqué complet en `structuredContent`.
7. **Lopus = webhook générique.** `getDestination('lopus')` route sur l'adaptateur `webhook` (URL fournie
   par le client) ; **aucun** appel REST `*.lopus.ai`.
8. **Fiber rejeté.** `getDestination('fiber')` throw « entrée, pas destination » ; `"fiber"` absent de
   l'enum `destination` ; **aucun** fichier `destinations/fiber.ts`.
9. **`dryRun:true` → zéro POST tiers** sur toutes les destinations (plan seul).
10. **Clé absente → erreur explicite, aucun POST** pour chaque destination nécessitant une clé/URL.
11. **Clés sink jamais en env.** `grep -rn "process.env.*INSTANTLY\|process.env.*ORANGE\|process.env.*WEBHOOK_SECRET" lib/outbound inngest/export-to-outbound.ts` → **0**.
12. **`tenantId` jamais argument.** L'`inputSchema` de `export_to_outbound` ne contient pas `tenantId`.
13. **Pas d'envoi propre.** Le chemin export n'importe ni `sendViaMailbox` ni SMTP (directive own-infra).
14. **Inngest conforme :** `createFunction` 2-arg, `concurrency` array, `id:"export-to-outbound"`,
    `triggers:[{event:"export/run"}]`.

---

## 6. MAPPING brief Orion → champs, par DESTINATION (table §6 du doc partner-apis)

> Source de vérité : `orion/research/partner-apis-2026-06-27.md §6`. **Fiber n'est PAS une colonne de
> destination** (input only). Instantly + Orange Slice = **FAIT-VÉRIFIÉ** ; webhook/generic = contrat Orion.

| Champ brief (`OutreachBrief`) | Instantly (FAIT-VÉRIFIÉ) | Orange Slice (FAIT-VÉRIFIÉ, JSON plat) | Lopus (→ webhook) | Webhook générique |
|---|---|---|---|---|
| `whyNow` | `custom_variables.why_now` | colonne `why_now` | (via webhook) | `brief.why_now` |
| `signal_evidence_url` | `custom_variables.signal_evidence_url` | colonne `signal_evidence_url` | (via webhook) | `brief.evidence_url` |
| `pain_point_1..3` | `custom_variables.pain_point_1..3` | colonnes `pain_point_1..3` | (via webhook) | `brief.pain_points[]` |
| `citable_metric_1..3` | `custom_variables.citable_metric_1..3` | colonnes `citable_metric_1..3` | (via webhook) | `brief.citable_metrics[]` |
| `best_angle` | `custom_variables.best_angle` | colonne `best_angle` | (via webhook) | `brief.best_angle` |
| `cta_type` | `custom_variables.cta_type` | colonne `cta_type` | (via webhook) | `brief.cta_type` |
| `do_not_claim` | `custom_variables.do_not_claim` (string aplatie `" \| "`) | colonne `do_not_claim` | (via webhook) | `brief.do_not_claim[]` |
| `priority_score` | `custom_variables.priority_score` | colonne `priority_score` (filtrable FilterSpec) | (via webhook) | `brief.priority_score` |
| `warm_path` | `custom_variables.warm_path` | colonne `warm_path` | (via webhook) | `brief.warm_path` |
| `grounded` | `custom_variables.grounded` | colonne `grounded` | (via webhook) | `brief.grounded` |
| (réconciliation) | n/a (Instantly track son lead_id) | colonne `orion_lead_id` (dédup `email`) | `meta.idempotency_key` | `meta.idempotency_key` |

**Notes de mapping :**
- **Instantly** : `custom_variables` = **map scalaire plate** → aplatir listes (`pain_points`) en
  `pain_point_1/2/3` et `do_not_claim` en string unique avant envoi (FAIT-VÉRIFIÉ `send-adapter.ts:19`).
- **Orange Slice** : un « champ custom » = **une colonne** (nom de colonne == clé JSON, casse respectée).
  Pas de merge `{{var}}` natif — une colonne TS lit `ctx.thisRow.get("col")`. Mapping fait côté colonne
  par le client. Body **JSON plat** = `flattenBriefScalar` (le même filet scalaire qu'Instantly).
- **Lopus** : aucun schéma de champ natif (pas d'API) → passe par l'**enveloppe webhook générique**
  `{lead, brief, meta}` ; le client/middleware mappe en aval.
- **Webhook générique** : `why_now`/`best_angle`/`pain_points`/`citable_metrics` → merge vars côté
  destination ; `priority_score` → priorité/routage ; `warm_path` → note/intro ; `do_not_claim` →
  garde-fou que l'IA aval doit respecter.

**À CONFIRMER avant prod (depuis le doc §7) :** Instantly — re-tester `429`/backoff + plafond bulk 1000
sur la clé tenant. Orange Slice — URL de colonne + valeur du header secret **fournies par le client**
(pas d'auto-provisioning) ; limites bulk `addRows`/quotas non documentées (test empirique staging).
Webhook — schéma de signature accepté (HMAC vs Bearer vs `x-api-key`) convenu par client à l'onboarding.

---

## 7. DEFINITION OF DONE

- Tous les fichiers de §3 créés ; les 2 lignes de registre ajoutées dans les balises. **Aucun**
  `destinations/fiber.ts` ni `destinations/lopus.ts`.
- `pnpm --filter @orion/web tsc` **vert** + `pnpm --filter @orion/web test` **vert** localement
  (sur `pnpm install --frozen-lockfile` **propre**, pas un `node_modules` junctionné — divergence CI connue).
- Les 6 fichiers de test pack4 écrits et verts ; chaque critère §5 couvert par ≥1 test ; tripwires verts.
- Chaque tâche T-32/33/34/35/37 a son **VERIFY exécuté soi-même** (log/sortie en preuve, écrit sur disque).
- `git diff --stat` **scopé pack4** (aucun fichier hors ownership §3 modifié, hors les 2 lignes de registre).
- Aucun module Elevay REUSE édité (`sending-gate.ts`, `send-adapter.ts`, `settings-encryption.ts` copiés
  depuis Elevay tels quels, jamais édités après copie).
- Commits atomiques, un changement logique chacun, trailer :
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: <URL de ta propre session Claude Code>
  ```
- PR `feat/orion-pack4` ouverte ; CI pleine verte (gitleaks + tsc/vitest + Vercel) ; `/evaluate` PASS ;
  merge squash + delete-branch ; surveiller le push CI de `main`.
- **Re-vérifier branche + HEAD juste avant chaque commit/push** (tree partagé, sessions parallèles).

---

## 8. PIÈGES SPÉCIFIQUES À CE LOT

1. **Fiber = ENTRÉE, PAS sortie.** OpenAPI 1.40.0 : zéro endpoint d'envoi. **Ne construis PAS de
   `FiberAdapter` de sortie.** `getDestination('fiber')` throw ; Fiber vit en pack2 (reveal) + pack5
   (signaux Tracker Svix). Pousser un brief à Fiber est une erreur de conception.
2. **Lopus n'a AUCUNE API.** Docs/api/dev morts, app WorkOS-gated. **Pas de `LopusAdapter` REST.** Lopus
   = alias vers le **webhook générique** (URL fournie par le client). Ne tente jamais un POST `*.lopus.ai`.
3. **Instantly droppe les objets/arrays EN SILENCE** (`send-adapter.ts:19`). Brief imbriqué poussé tel
   quel = perte muette de why-now/citableFacts. **Flatten d'abord** (`flattenBriefScalar`), puis filet
   `toInstantlyCustomVariables`. Jamais le brief brut.
4. **Orange Slice = webhook colonne, JSON PLAT.** Pas d'API REST lead/campagne (n'existe pas). POST sur
   `api.orangeslice.ai/webhook/{sheet}/{col}` ; auth = header convenu côté colonne (pas de Bearer
   plateforme) ; clés == noms de colonnes. URL/secret **du client** → sans eux : `dryRun`/erreur, jamais
   un POST hasardeux. Flatten partagé avec Instantly (cellules scalaires).
5. **Le gate DOIT vivre dans le job/wrapper, pas dans l'outil MCP exposé.** Sinon un agent l'esquive en
   JSON-RPC. `evaluateSend` tourne dans `inngest/export-to-outbound.ts`, **après** résolution `tenantId`
   serveur.
6. **`interactive:false` obligatoire** sur `evaluateSend` — `interactive:true` esquive le gate targeting
   SAFE_MODE (`:301`) et laisserait passer un compte `unreviewed`. C'est le climax de la démo.
7. **Clés sink JAMAIS en env** (D7). Toujours `loadSinkCredential` → `integration_credentials` (chiffré)
   + `decryptSecret` (`settings-encryption.ts:65`). Un `process.env.INSTANTLY_API_KEY` casse l'invariant.
8. **`tenantId` jamais dans l'inputSchema** (invariant #1). Bearer `mcp_*` au runtime / `event.data` côté
   Inngest.
9. **Jamais de mailer interne sur ce chemin** (T-37) : ni `sendViaMailbox` ni SMTP/owner-SMTP. L'envoi est
   celui du client sur SES comptes. Le tripwire le garde.
10. **Inngest 2-arg** (piège #1) : `createFunction(config, handler)`, `concurrency` array,
    `triggers:[{event:"export/run"}]` dans la config. Pas la forme 3-arg.
11. **Tests pack4 co-localisés** sous `lib/outbound/__tests__/` (PAS `src/__tests__/*` qui appartient à
    pack7) — évite la collision d'ownership avec la suite cœur.
12. **Soft dep pack3 :** `getOutreachBrief` runtime appartient à pack3. Coder contre le contrat
    `OutreachBrief` (pack1) + un mock ; le câblage réel se fait en pack7. Ne pas créer
    `lib/mcp/outreach-brief.ts` (c'est pack3).
13. **`db as any` + `pnpm.overrides drizzle-orm` + `set_config(...,true)` transaction-local** : hérités de
    pack0/pack1 ; toutes les I/O DB de pack4 passent par `withTenantTx(tenantId, …)`, jamais le `db`
    global, jamais `set_config(...,false)`.
