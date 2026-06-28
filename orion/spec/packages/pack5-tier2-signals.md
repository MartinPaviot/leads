# LOT 5 — `tier2-signals` · BRIEF DE LOT AUTO-SUFFISANT

> **Tu n'as QUE ce fichier + les docs pointés.** Exécute sans rien redériver. Tout `file:line`
> non préfixé désigne la **SOURCE Elevay à COPIER** sous `C:/Users/ombel/leads/app/apps/web/src/`
> (la provenance à vendorer, PAS un import workspace) ; Orion est un **repo SÉPARÉ** (`@orion/web`)
> où ces fichiers, une fois copiés, vivent sous `src/`. Branche : **`feat/orion-pack5`**. Effort : **≈ 5,5 j-h**. `[P1]` (hors chemin
> critique MVP — mais la **vélocité** est l'EDGE : *le retard est irrattrapable rétroactivement*, donc
> démarrer `signal_snapshots` dès le lancement même si le reste est P1).
>
> **Docs à lire (et SEULEMENT celles-ci, déjà digérées dans ce brief) :**
> - `orion/spec/00-ARCHITECTURE.md` (D1-D8, règles d'or §3, schéma §2) — **autoritaire**.
> - `orion/spec/00-EXECUTION-GUIDE.md` (§3 ownership, §3.2 registres append-only, §4 conventions, §5 multi-session).
> - `orion/spec/00-PREREQUISITES.md` (§3 pièges, §4 DÉP-1, GAP-4/G6).
> - `orion/research/signals-world-class-2026-06-27.md` (taxonomie hard-to-get, endpoints :153/:185/:186/:187).
> - `orion/research/orion-differentiation-2026-06-27.md` (data d'entrée Tier 2, why-now composé :77-132).
> - `orion/research/signal-deep-tech-2026-06-27.md` (§4 velocity event-source, decay/OLS — moteurs).
> - `orion/spec/design.md §5.4` (table Tier 2), `§4.3` (cron), `§2.6` (DDL `signal_snapshots`).
> - `orion/spec/tasks.md` T-20, T-21, T-24, T-25, T-26.

---

## 1. OBJECTIF + PÉRIMÈTRE

### Objectif
Livrer les **sources DIFFÉRENCIANTES** d'Orion — l'edge que Fiber AI / Orange Slice / Lopus
**ne peuvent pas occuper** en restant des agrégateurs : registres souverains, sources publiques
gratuites hard-to-get, et surtout la **dérivée** (vélocité) qui n'existe qu'avec un historique
snapshotté propriétaire. Concrètement, comme **`IngestSource`** alimentant l'orchestrateur d'ingestion
(pack2) et le bus signal via **`recordCompanySignal`** (Elevay) :

1. **`waterfallSource`** (T-24) — wrappe l'enrichissement firmo Elevay (REUSE).
2. **`sireneSource`** (T-24) — registre FR souverain `recherche-entreprises.api.gouv.fr` (keyless, rank 80).
3. **`secSource`/`edgarSource`** (T-25) — SEC EDGAR Form D / 8-K : financement US **pré-annonce** (J+0 vs Crunchbase J+30).
4. **`bodaccSource`** (T-25) — BODACC FR : job-change dirigeant + financement FR (gratuit là où UserGems = 2750 $/mo).
5. **`atsSource`** (T-25) — Greenhouse/Lever/Ashby publics : stack + intent + **vélocité d'embauche** `[snap]`.
6. **`ossSource`** (T-25) — npm/PyPI/GitHub/deps.dev : **dérivée d'adoption** `[snap]`.
7. **`techchurnSource`** (T-25) — tech-detect HTML+headers : **fenêtre de migration** `[snap]`.
8. **`crtshSource`** (T-25) — crt.sh + DNS : **lancement produit/infra** (sous-domaine neuf) `[snap]`.
9. **`fiberTrackerSource` + `fiberSignalIngestor`** (T-26) — **source « Fiber Tracker »**, Fiber **as INPUT**
   (data-API), **à côté** des sources souveraines (SEC/BODACC/ATS/GitHub/velocity) : webhook **Svix**
   `/v1/tracker/*` → events **job-change / hiring / funding** → `recordCompanySignal` via `toCanonicalSignal`.
   (Le **reveal contact** Fiber `contact-details/single` = **pack2** `lib/ingest/enrich/fiber-reveal.ts`,
   PAS ce lot ; ici on ne fait que les **signaux Tracker**.)
10. **`velocity-snapshot`** cron (T-20) — snapshote les sources `[snap]` → `signal_snapshots` → diff → signal **dérivé** (`hiring_velocity`, `adoption_accel`, `tech_churn`).

### IN (ce lot le possède)
- Les 9 fichiers `lib/ingest/sources/*-source.ts` listés §3, + 1 util HTTP Tier2, + le cron `inngest/velocity-snapshot.ts`.
- L'ajout append-only de `velocitySnapshot` dans le registre Inngest (1 import + 1 entrée d'array).
- Les tests Vitest de chacun (fixtures réseau enregistrées).

### OUT (NE PAS TOUCHER — possédé par un autre lot)
- **Table `signal_snapshots`** = DDL **possédé par pack1** (`db/schema/snapshots.ts`, T-20 DDL). Pack5 la **REUSE** (import du modèle Drizzle `signalSnapshots`), **ne la crée pas**, n'écrit aucune migration de table.
- **`lib/signals/taxonomy.ts`** (alias-map canonique, T-14) = **pack1**. Pack5 l'**importe** (`toCanonicalSignal`), ne l'édite pas.
- **`lib/ingest/types.ts`** (contrats `IngestItem`/`IngestSource`) = **pack1**. Pack5 code **contre** ce contrat, ne le modifie pas.
- **Orchestrateur `inngest/ingest-run.ts`, `lib/ingest/mcp-handlers.ts`, `lib/ingest/sources/{csv,apollo}-source.ts`** = **pack2**. Le câblage des providers `waterfall_enrich`/`fiber` dans le switch pack2 est un **handoff d'intégration** (§Étape 12) — pack5 livre des modules conformes, pack2/pack7 les branche.
- **`evaluateSend`, brief, export, gate, identité, scoring** = packs 1/3/4 + modules Elevay COPIÉS (vendorés, §2.3 ; PAS un import workspace).
- **Route MCP, route Inngest, client DB, RLS, runner migration** = **pack0** (squelettes). Pack5 n'édite **que** la zone balisée `<<< ORION:INNGEST-FNS >>>`. **Exception net-new pack5** : la route webhook `app/api/webhooks/fiber/route.ts` (récepteur Tracker Svix) est créée par pack5 — ce n'est pas un squelette pack0, c'est un endpoint propre au flux Fiber Tracker.

---

## 2. PRÉREQUIS (avant de coder une ligne)

### 2.1 Lots à finir avant
- **pack0 mergé** : scaffold bootable, `db/index.ts` (postgres-js), `db/rls.ts` (`withTenantTx`), client+route Inngest + `inngest/registry.ts` avec la zone `<<< ORION:INNGEST-FNS >>>`, provider AI tracé (`lib/ai/*`).
- **pack1 mergé** : `lib/ingest/types.ts` (`IngestItem`/`IngestSource`), `lib/signals/taxonomy.ts` (`toCanonicalSignal`), `db/schema/snapshots.ts` (`signalSnapshots`), `db/schema/integrations.ts` (`integrationCredentials`).
- Démarrage session (00-EXECUTION-GUIDE §4) :
  ```sh
  git fetch origin && git checkout main && git pull
  git checkout -b feat/orion-pack5 && git rebase origin/main
  cd app && pnpm install --frozen-lockfile && pnpm --filter @orion/web tsc
  ```

### 2.2 Cartes nécessaires de 00-PREREQUISITES (les seules pertinentes pour pack5)
- **DÉP-1 (T-14 taxonomie, prérequis dur).** Les signaux écrits `{type:'funding_recent'}` ne matchent pas les multipliers keyés canonique `{funding}` → `bestMultiplierForCompany`→`undefined`→**plancher 1.0×** (`signal-score-daily.ts:87`). **Conséquence pack5 :** TOUT signal émis passe par `toCanonicalSignal(type)` (pack1) **avant** `recordCompanySignal`. Les types dérivés (`hiring_velocity`, `adoption_accel`, `tech_churn`, `product_launch`, `job_change`) **doivent** se canonicaliser vers les types connus (`SIGNAL_TTL_DAYS` en `freshness.ts:31` : `hiring`, `funding`, `tech_stack_change`/`tech_adoption`, `leadership_change`, `expansion`…). Vérifier que l'alias-map pack1 les couvre ; sinon **flagger pack1/pack7** (additif), ne pas éditer leur fichier.
- **Piège #1 (00-PREREQUISITES §3).** `inngest.createFunction` est **2-arg** : `createFunction(config, handler)`, triggers DANS la config, `concurrency` = **array**, gabarit `signal-score-daily.ts:95-108`.
- **Piège #2.** `set_config(..., true)` **transaction-local** uniquement (jamais `false`). TOUT accès DB pack5 passe par `withTenantTx(elevayTenantId, fn)` (`db/rls.ts:44-54`). Jamais le `db` global, jamais le rôle owner.
- **Piège #4.** baseURL Anthropic finit par `/v1` (n'impacte pack5 que si NLP ATS via Haiku — voir Étape 6, gardé OFF par défaut).
- **Piège #5/#10.** Migrations additives `IF NOT EXISTS`, runner custom. Pack5 **n'ajoute aucune table** (REUSE `signal_snapshots` de pack1).
- **Piège #9.** **Pas de cron Vercel** — Orion = Inngest seul. `velocity-snapshot` est un cron Inngest, **pas** une entrée `vercel.json`.
- **GAP-4 / G4 (RLS grants).** `signal_snapshots` et `integration_credentials` doivent avoir GRANT + policy RLS pour `elevay_app`, **et la policy de `signal_snapshots` doit autoriser `tenant_id IS NULL`** (snapshots globaux npm/PyPI/SEC, design §2.6). C'est dans la migration **pack1** ; si la policy NULL manque, le `velocity-snapshot` 42501 sur les writes globaux → **flagger pack1** (additif `USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::uuid)`). Contournement pack5 si bloqué : écrire les snapshots OSS/SEC avec `tenant_id = elevayTenantId` (scope = elevay uniquement, acceptable).
- **G6.** Tier 2 + velocity sont **P1**. Mais démarrer les snapshots **dès maintenant** (la dérivée à J0 est nulle sinon).

### 2.3 Modules Elevay/cross-pack à COPIER (vendorés dans le repo Orion — le `file:line` est la SOURCE à copier)
| Symbole | Provenance (source Elevay à copier) | Usage pack5 |
|---|---|---|
| `withTenantTx`, `elevayTenantId` | `db/rls.ts` (pack0) | enrober chaque accès DB (cron + helpers) |
| `recordCompanySignal(tenantId, companyId, entry)` | `lib/signals/record-signal.ts:86` | écrire le signal dérivé / interprété → `properties.signals[]` |
| `SignalEntry` (`{type,detectedAt,strength?,detail?,source?,evidence?}`) | `lib/signals/record-signal.ts:39` | forme du signal |
| `ttlDaysFor`, `SIGNAL_TTL_DAYS` | `lib/signals/freshness.ts:31/88` | demi-vie / fraîcheur des types canoniques |
| `toCanonicalSignal` | `lib/signals/taxonomy.ts` (pack1) | canonicaliser AVANT `recordCompanySignal` |
| `IngestItem`, `IngestSource` | `lib/ingest/types.ts` (pack1) | contrat des sources |
| `signalSnapshots` (table Drizzle) | `db/schema/snapshots.ts` (pack1) | lire/écrire l'historique |
| `integrationCredentials` (table) | `db/schema/integrations.ts` (pack1) | secret **webhook Svix Fiber `whsec_…`** per-tenant chiffré (le reveal `x-api-key` est consommé par pack2) |
| `decryptSecret` | `lib/crypto/settings-encryption.ts:65` | déchiffrer le secret Svix `whsec_` (pattern Instantly `lib/providers/instantly-client.ts:16-17`) |
| `enrichCompany` | `lib/providers/company-enrichment/waterfall.ts:148` (merge first-non-null `:77`, `isSaturated:59`) | `waterfallSource` |
| registry/precedence enrichissement | `lib/providers/company-enrichment/registry.ts`, `precedence.ts:9/53` | provider par champ |
| `inngest` (client) | `inngest/client.ts` (pack0) | `createFunction` |
| `sourceFromSalesNav`, `buildSalesNavBody` | `lib/linkedin/sales-nav-sourcing.ts:54`, `lib/linkedin/icp-to-salesnav.ts:68` | **[HERO]** Unipile Sales-Nav *changed-jobs* (`linkedinJobChangeSource`) — filtre « recently changed jobs (90 j) » résolu via le parameter-service |
| `resolveIcpToSalesNavQuery` | `lib/linkedin/icp-to-salesnav.ts:123` | **[HERO]** restreindre la veille froide VP-Eng à l'ICP (titre × seniority × secteur) |

---

## 3. FICHIERS POSSÉDÉS PAR CE LOT (création/édition exclusives — zéro chevauchement)

Tous à la racine du repo Orion séparé (préfixe `src/`) :

| Fichier | Type | Tâche |
|---|---|---|
| `src/lib/ingest/sources/tier2-http.ts` | **NET-NEW** (util HTTP never-throw + `SnapshotProvider` iface) | T-25 (support) |
| `src/lib/ingest/sources/waterfall-source.ts` | **NET-NEW sur REUSE** (`enrichCompany`) | T-24 |
| `src/lib/ingest/sources/sirene-source.ts` | **NET-NEW** | T-24 |
| `src/lib/ingest/sources/sec-source.ts` | **NET-NEW** (`[snap]` pour `latest_filing`) | T-25 |
| `src/lib/ingest/sources/bodacc-source.ts` | **NET-NEW** | T-25 |
| `src/lib/ingest/sources/ats-source.ts` | **NET-NEW** `[snap]` | T-25 |
| `src/lib/ingest/sources/oss-source.ts` | **NET-NEW** `[snap]` | T-25 |
| `src/lib/ingest/sources/techchurn-source.ts` | **NET-NEW** `[snap]` | T-25 |
| `src/lib/ingest/sources/crtsh-source.ts` | **NET-NEW** `[snap]` | T-25 |
| `src/lib/ingest/sources/fiber-source.ts` | **NET-NEW** (`fiberTrackerSource` + `fiberSignalIngestor` + `verifySvix`) — **signaux Tracker uniquement** (le reveal contact = pack2 `enrich/fiber-reveal.ts`) | T-26 |
| `src/app/api/webhooks/fiber/route.ts` | **NET-NEW** (récepteur webhook Svix Fiber Tracker → `fiberSignalIngestor`) | T-26 |
| `src/lib/ingest/sources/linkedin-jobchange-source.ts` | **NET-NEW** (`linkedinJobChangeSource` — Unipile Sales-Nav *changed-jobs* → `leadership_change.vp_eng`, daté `role_start_date`) **[HERO]** | T-26 |
| `src/lib/ingest/sources/eng-title.ts` | **NET-NEW** (classifieur pur `isEngLeadershipTitle` → sous-type `vp_eng` ; partagé Fiber/BODACC/LinkedIn) **[HERO]** | T-26 |
| `src/inngest/velocity-snapshot.ts` | **NET-NEW** (cron) | T-20 |
| `src/inngest/registry.ts` | **ÉDITION zone balisée seulement** (`<<< ORION:INNGEST-FNS >>>`) | T-20 wiring |
| `src/__tests__/tier2-sources.test.ts` | **NET-NEW** test | T-25 |
| `src/__tests__/waterfall-source.test.ts` | **NET-NEW** test | T-24 |
| `src/__tests__/sirene-source.test.ts` | **NET-NEW** test | T-24 |
| `src/__tests__/fiber-source.test.ts` | **NET-NEW** test | T-26 |
| `src/__tests__/linkedin-jobchange-source.test.ts` | **NET-NEW** test **[HERO]** | T-26 |
| `src/__tests__/velocity-snapshot.test.ts` | **NET-NEW** test | T-20 |
| `src/__tests__/fixtures/tier2/*.json` | **NET-NEW** fixtures réseau enregistrées | tests |

> `tier2-http.ts` vit dans `sources/` mais ne collisionne **pas** avec pack2 (qui ne touche que `csv-source.ts`/`apollo-source.ts`). Nom préfixé `tier2-` = namespace pack5 explicite.
> **Note :** pack6 (UI) possède `src/components/orion/*` (badges source) — pack5 ne crée **aucun** composant.

---

## 4. CONTRATS PARTAGÉS (rappel — viennent de pack1, ne pas redéfinir)

```ts
// lib/ingest/types.ts (pack1) — code CONTRE ça
export interface IngestItem {
  kind: "company" | "person";
  identity: { domain?: string; name?: string; country?: string; siren?: string; siret?: string;
    uid?: string; email?: string; linkedinUrl?: string; firstName?: string; lastName?: string; companyRef?: string; };
  fields: Partial<Record<"industry"|"size"|"revenue"|"description"|"title"|"phone", string|null>>;
  vendorIds?: Record<string, string>;
  rawSignals?: Array<{ type: string; detectedAt: string; strength?: string; detail?: string;
    evidence?: { url: string; quote?: string } }>;
  sourceRef: string;     // dédup niveau 2 (ex 'edgar:CIK1234-D-2026', 'gh:acme/jobs')
  provider: string;      // 'sirene'|'edgar'|'bodacc'|'greenhouse'|'lever'|'ashby'|'npm'|'pypi'|'github'|'techchurn'|'crtsh'|'waterfall'|'fiber'
}
export interface IngestSource {
  name: string; kind: "file" | "provider"; subjectKind: "company" | "person" | "mixed";
  inputFingerprint(): string;   // sha256(entrée) → dédup job-level (niveau 1)
  pull(ctx: PullCtx, cursor?: string): Promise<{ items: IngestItem[]; nextCursor?: string; total?: number }>;
  // pull() NE THROW JAMAIS — erreur source → items partiels + log.
}
```

**Extension pack5 (dans `tier2-http.ts`) — le contrat snapshot pour le cron `velocity-snapshot` :**
```ts
export interface SnapshotProvider {
  source: string;     // 'greenhouse'|'lever'|'ashby'|'npm'|'pypi'|'github'|'techchurn'|'crtsh'|'edgar'
  metric: string;     // 'open_roles'|'weekly_downloads'|'tech_set_hash'|'subdomain_set'|'latest_filing'
  /** lit l'état courant d'un sujet ; null si introuvable/erreur (ne throw jamais). */
  fetchSnapshot(subjectKey: string, ctx: PullCtx): Promise<{ value: unknown } | null>;
  /** diff prev→curr → SignalEntry dérivé déjà canonicalisé, ou null si pas de mouvement. */
  derive(prevValue: unknown | null, currValue: unknown, subjectKey: string): SignalEntry | null;
}
```
Chaque source `[snap]` exporte **et** son `IngestSource` (pull → `IngestItem` état courant) **et** son `SnapshotProvider` (consommé par le cron). `derive` retourne déjà un `type` canonicalisé via `toCanonicalSignal`.

---

## 5. ÉTAPES ORDONNÉES (chacune : action → code clé → VERIFY → TEST)

> Règle commune à **toutes** les sources : `pull()` **NE THROW JAMAIS**. Tout réseau passe par `safeFetch`
> (Étape 1) qui retourne `null` sur erreur/timeout. Tout signal émis est **canonicalisé** (`toCanonicalSignal`)
> et **daté** (`detectedAt` ISO). Tout accès DB sous `withTenantTx(elevayTenantId, ...)`.

### Étape 1 — `tier2-http.ts` : util réseau never-throw + iface `SnapshotProvider`
**Action.** Helper HTTP partagé par les 9 sources : User-Agent obligatoire (SEC), timeout (crt.sh lent/flaky), retry léger, jamais d'exception. + l'interface `SnapshotProvider` (§4) + helpers de set-diff.
```ts
const UA = "Elevay/1.0 (+https://elevay.dev; contact@elevay.dev)"; // SEC l'EXIGE (403 sinon)
export async function safeFetch(url: string, init?: RequestInit & { timeoutMs?: number; json?: boolean }):
  Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init?.timeoutMs ?? 12_000);
  try {
    const res = await fetch(url, { ...init, signal: ctl.signal,
      headers: { "user-agent": UA, "accept": init?.json === false ? "*/*" : "application/json", ...(init?.headers ?? {}) } });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, data: init?.json === false ? await res.text() : await res.json() };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "fetch_failed" }; }
  finally { clearTimeout(t); }
}
export function setDiff(prev: string[] = [], curr: string[] = []) {
  const ps = new Set(prev), cs = new Set(curr);
  return { added: curr.filter(x => !ps.has(x)), removed: prev.filter(x => !cs.has(x)) };
}
export interface SnapshotProvider { /* …§4… */ }
```
**VERIFY.** `pnpm --filter @orion/web tsc` vert ; `node -e "import('./...').then(m=>m.safeFetch('https://httpstat.us/500').then(console.log))"` → `{ok:false}` (pas de throw).
**TEST.** Couvert par `tier2-sources.test.ts` (Étape 13) : mock `fetch` rejette → `safeFetch` retourne `{ok:false}`.

### Étape 2 — `waterfall-source.ts` (T-24, REUSE `enrichCompany`)
**Action.** `waterfallSource(seeds)` : pour chaque seed (domaine/nom), appelle `enrichCompany` (`waterfall.ts:148`, merge first-non-null `:77`, `isSaturated:59`) → `IngestItem` firmo, **provenance par champ** = `provenance[i].provider` (donc `provider` de l'item = le provider gagnant du champ clé, sinon `'waterfall'`). **Enrichissement par défaut OFF** (mémoire `no-fullenrich`, FullEnrich banni) — sert le brief, pas un enrichissement auto.
```ts
export function waterfallSource(seeds: Array<{ domain?: string; name?: string; country?: string }>): IngestSource {
  return { name: "waterfall", kind: "provider", subjectKind: "company",
    inputFingerprint: () => sha256(JSON.stringify(seeds)),
    async pull() {
      const items: IngestItem[] = [];
      for (const s of seeds) {
        const r = await enrichCompany({ domain: s.domain, name: s.name }).catch(() => null); // never-throw
        if (!r) continue;
        items.push({ kind: "company", identity: { domain: r.domain, name: r.name, country: s.country },
          fields: { industry: r.industry ?? null, size: r.size ?? null, revenue: r.revenue ?? null, description: r.description ?? null },
          provider: "waterfall", sourceRef: `wf:${r.domain ?? s.name}` });
      }
      return { items, total: items.length };
    } };
}
```
**VERIFY.** `waterfallSource([{domain:'acme.io'}]).pull()` → firmo first-non-null remplie, provenance par champ non vide.
**TEST.** `waterfall-source.test.ts` : mock `enrichCompany` (2 providers, champs disjoints) → first-non-null respecté + provenance présente ; `enrichCompany` throw → `pull()` ne propage pas.

### Étape 3 — `sirene-source.ts` (T-24, registre FR souverain, keyless, **rank 80**)
**Action.** `sireneSource(query)` : `https://recherche-entreprises.api.gouv.fr/search?q={query}` (keyless, **~7 req/s → throttle**) → firmo officielle FR + état entreprise. SIREN/SIRET → identité ; domaine si dispo. `provider:'sirene'` (précédence rank 80, `precedence.ts:9` : > apollo 50 > csv 40).
```ts
export function sireneSource(query: string): IngestSource {
  return { name: "sirene", kind: "provider", subjectKind: "company",
    inputFingerprint: () => sha256(`sirene:${query}`),
    async pull(_ctx, cursor) {
      const page = cursor ? Number(cursor) : 1;
      const r = await safeFetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(query)}&page=${page}&per_page=20`);
      if (!r.ok) return { items: [] };                 // never-throw
      const items: IngestItem[] = (r.data.results ?? []).map((e: any) => ({
        kind: "company", provider: "sirene", sourceRef: `siren:${e.siren}`,
        identity: { name: e.nom_complet, siren: e.siren, country: "FR" },
        fields: { industry: e.activite_principale ?? null, size: e.tranche_effectif_salarie ?? null,
                  description: e.etat_administratif === "A" ? "active" : "ceased" } }));
      const next = (r.data.total_pages ?? 1) > page ? String(page + 1) : undefined;
      return { items, nextCursor: next, total: r.data.total_results };
    } };
}
```
**VERIFY.** `sireneSource("blablacar").pull()` → ≥1 item `provider:'sirene'`, `identity.siren` rempli, `country:'FR'`.
**TEST.** `sirene-source.test.ts` : fixture FR enregistrée → firmo rank 80 ; pagination `nextCursor` ; réseau KO → `{items:[]}`.

### Étape 4 — `sec-source.ts` / `edgarSource` (T-25, SEC EDGAR Form D — **User-Agent obligatoire**) `[snap]`
**Action.** `secSource(query)` : full-text `https://efts.sec.gov/LATEST/search-index?q=...&forms=D` + flux Atom Form D, `https://data.sec.gov/submissions/CIK{10-digit}.json` pour CIK→nom/domaine. **User-Agent obligatoire** (403 sinon — via `safeFetch`). Émet `rawSignals:[{type:'funding'}]` (canonicalisé) **pré-annonce J+0**, daté, CIK→domaine.
Exporte aussi le `SnapshotProvider` `edgar` (metric `latest_filing`) : `derive` = nouvelle accession depuis le dernier snapshot → `funding`.
```ts
export function secSource(query: string): IngestSource { /* pull → IngestItem company, rawSignals funding daté, evidence.url = filing */ }
export const edgarSnapshot: SnapshotProvider = {
  source: "edgar", metric: "latest_filing",
  async fetchSnapshot(cik) {
    const r = await safeFetch(`https://data.sec.gov/submissions/CIK${cik.padStart(10,"0")}.json`);
    return r.ok ? { value: { accession: r.data.filings?.recent?.accessionNumber?.[0] ?? null } } : null;
  },
  derive(prev: any, curr: any, cik) {
    if (!curr?.accession || prev?.accession === curr.accession) return null; // diff=0 → null
    return { type: toCanonicalSignal("funding"), detectedAt: new Date().toISOString(),
      strength: "high", detail: `New SEC filing ${curr.accession}`, source: "sec_edgar",
      evidence: { url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}` } };
  } };
```
**VERIFY.** Fixture Form D → `rawSignals:[{type:'funding'}]` daté + CIK→domaine résolu ; header `user-agent` présent dans la requête mockée.
**TEST.** Dans `tier2-sources.test.ts` : fixture EDGAR → signal `funding` canonique ; `edgarSnapshot.derive(prev,prev)` (même accession) → `null`.

### Étape 5 — `bodacc-source.ts` (T-25, BODACC FR, keyless)
**Action.** `bodaccSource(query)` : Opendatasoft `https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/?dataset=annonces-commerciales&q={query}` + `recherche-entreprises` pour SIREN→domaine. Émet **job-change dirigeant** (`leadership_change` canonique) + financement FR. Mapping SIREN→domaine (best-effort via sirene). Non `[snap]` (event-based).
**VERIFY.** Fixture BODACC `modification` dirigeant → `rawSignals:[{type:<canonical leadership_change>}]` daté + SIREN.
**TEST.** Dans `tier2-sources.test.ts` : fixture BODACC → signal canonique attendu ; réseau KO → `{items:[]}`.

### Étape 6 — `ats-source.ts` (T-25, Greenhouse/Lever/Ashby publics, **no auth**) `[snap]`
**Action.** Trois fabriques (`greenhouseSource`/`leverSource`/`ashbySource`) + un `SnapshotProvider` par ATS (metric `open_roles`). Endpoints publics (signals-world-class:153) :
- Greenhouse `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`
- Lever `https://api.lever.co/v0/postings/{company}?mode=json`
- Ashby `https://api.ashbyhq.com/posting-api/job-board/{name}?includeCompensation=false`

`pull()` → état courant : compte de postes + fonctions (classif **keyword par défaut**, mapping slug ATS→domaine). Émet `rawSignals:[{type:'hiring'}]` (canonique). NLP description via Haiku **OFF par défaut** (coût ; si activé : routing `light→haiku`, `enforceLlmBudget(elevayTenantId)` avant dispatch, baseURL `/v1`).
`SnapshotProvider.fetchSnapshot(slug)` → `{value:{count, byFunction}}`. `derive(prev,curr)` = Δroles sur Δ jours → si > 0 : `hiring_velocity`→canonical `hiring`, `detail:"+N roles/Xsem"`, `strength` par magnitude ; diff=0 → `null`.
```ts
export const greenhouseSnapshot: SnapshotProvider = {
  source: "greenhouse", metric: "open_roles",
  async fetchSnapshot(token) {
    const r = await safeFetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
    return r.ok ? { value: { count: (r.data.jobs ?? []).length } } : null;
  },
  derive(prev: any, curr: any) {
    const d = (curr?.count ?? 0) - (prev?.count ?? 0);
    if (!prev || d <= 0) return null;                 // pas de mouvement positif → pas de signal
    return { type: toCanonicalSignal("hiring_velocity"), detectedAt: new Date().toISOString(),
      strength: d >= 4 ? "high" : "medium", detail: `+${d} open roles`, source: "greenhouse" };
  } };
```
**VERIFY.** Fixture Greenhouse → `rawSignals` hiring + `open_roles` count ; 2 snapshots J/J+21 → dérivée `+N roles/3sem`.
**TEST.** Dans `tier2-sources.test.ts` : chaque ATS produit `hiring` ; `velocity-snapshot.test.ts` couvre la dérivée.

### Étape 7 — `oss-source.ts` (T-25, npm/PyPI/GitHub/deps.dev) `[snap]`
**Action.** `npmSource`/`pypiSource`/`githubSource` + `SnapshotProvider` par registre (metric `weekly_downloads`). Endpoints (signals-world-class:185) :
- npm `https://api.npmjs.org/downloads/point/last-week/{pkg}` → `{downloads}`
- PyPI `https://pypistats.org/api/packages/{pkg}/recent` → `{data.last_week}`
- GitHub stars via deps.dev / GitHub REST (snapshot+diff), **filtrer le bruit CI**.

`pull()` → état courant + `rawSignals:[{type:'tech_adoption'}]`. `derive` = % variation → `adoption_accel`→canonical `tech_adoption`, `detail:"+X%/mo"` ; lier **repo/package→entreprise** (best-effort : mapping connu, sinon snapshot **global** `tenant_id=NULL`). diff=0 → `null`.
**VERIFY.** Fixture npm → `weekly_downloads` ; 2 snapshots → `adoption_accel` % correct.
**TEST.** Dans `tier2-sources.test.ts` + `velocity-snapshot.test.ts`.

### Étape 8 — `techchurn-source.ts` (T-25, tech-detect HTML+headers, diff) `[snap]`
**Action.** `techStackSource(domain)` : `safeFetch(url, {json:false})` (HTML brut) + analyse headers, détecte le set d'outils (cheerio — déjà dans le stack Elevay ; si absent, regex sur signatures connues). `SnapshotProvider` metric `tech_set_hash` → `{value:{tools:[...], hash}}`. `derive` via `setDiff(prev.tools, curr.tools)` : outil **retiré** = fenêtre de migration → `tech_churn`→canonical `tech_stack_change`, `detail:"<outil> removed"`, `strength:"high"`. diff vide → `null`.
**VERIFY.** Deux fixtures HTML (outil présent → retiré) → signal `tech_churn`.
**TEST.** Dans `tier2-sources.test.ts` + `velocity-snapshot.test.ts`.

### Étape 9 — `crtsh-source.ts` (T-25, crt.sh + DNS, diff quotidien) `[snap]`
**Action.** `crtshSource(domain)` : `https://crt.sh/?q=%25.{domain}&output=json` (**lent/flaky → timeout généreux 20s + retry 1**, via `safeFetch`). `SnapshotProvider` metric `subdomain_set` → `{value:{subdomains:[...uniques...]}}`. `derive` via `setDiff` : sous-domaine **neuf** (ex `app.`, `staging.`) = lancement produit/infra → `product_launch`→canonical (alias pack1 ; sinon `expansion`), `detail:"new subdomain app.acme.io"`. diff vide → `null`.
**VERIFY.** Deux fixtures crt.sh (sous-domaine apparu) → signal `product_launch`/`expansion`.
**TEST.** Dans `tier2-sources.test.ts` + `velocity-snapshot.test.ts` ; crt.sh timeout simulé → `null`, pas de throw.

### Étape 10 — `fiber-source.ts` (T-26, source **« Fiber Tracker »**, Fiber **as INPUT — signaux**)
**Cadrage.** Fiber est une **source d'ENTRÉE**, jamais une destination outbound (OpenAPI **v1.40.0** :
zéro endpoint d'envoi — `research/partner-apis-2026-06-27.md §2`). Ce lot couvre **uniquement le volet
signaux** : le **Tracker** Fiber, qui **pousse** des events via **webhook Svix** (`/v1/tracker/*`).
Le **reveal contact** (`POST /v1/contact-details/single`, waterfall email/phone) appartient à **pack2**
(`lib/ingest/enrich/fiber-reveal.ts`) — **ne pas le réimplémenter ici**. La « source Fiber Tracker »
prend place **à côté** des sources souveraines (SEC/BODACC/ATS/GitHub/velocity) comme un autre flux
`whyNow`/`signal_evidence`, mais **push** (webhook) au lieu de **pull** (cron/HTTP).

**Action.** Trois exports dans `fiber-source.ts` + un récepteur de route :
1. **`fiberSignalIngestor(payload, ctx)`** — normalise **N'IMPORTE QUEL** payload Tracker → `rawSignals`
   **via `toCanonicalSignal`** (T-14). Les events Tracker visés : **`job-change` → `job_change`/`leadership_change`**,
   **`hiring` → `hiring`**, **`funding` → `funding`** (+ layoffs/posts best-effort). Aucune casse si la
   taxonomie Fiber diffère : type inconnu → conservé tel quel + log (multiplier plancher, documenté, DÉP-1).
   Puis `recordCompanySignal(ctx.tenantId, companyId, entry)` (`lib/signals/record-signal.ts:94`) si le
   sujet résout (domaine / `custom_data.orion_prospect_id` round-trip) ; sinon skip + log.
2. **`verifySvix(rawBody, headers, secret)`** — vérif **signature Svix** (Fiber = Svix, §2(7) du doc) :
   headers `svix-id` / `svix-timestamp` / `svix-signature`, HMAC-SHA256 de `{id}.{timestamp}.{rawBody}`,
   secret **`whsec_…`** per-tenant chiffré dans `integration_credentials` (déchiffré `decryptSecret`,
   `lib/crypto/settings-encryption.ts:65` ; **jamais** `process.env`, D7). Réutiliser la lib `svix`
   (`new Webhook(secret).verify(rawBody, headers)`) si dispo, sinon HMAC manuel. Échec → rejet (pas d'ingest).
3. **`fiberTrackerSource(opts?)`** — thin `IngestSource` (`subjectKind:"mixed"`, `provider:"fiber"`) pour
   l'orchestrateur : `pull()` renvoie `{items:[]}` par défaut (Tracker est **push**, pas pull — Fiber ne
   poll pas), exposé surtout pour l'uniformité du contrat + un éventuel rattrapage via `GET
   /v1/listAvailableTrackerRules`. `inputFingerprint()` = `sha256("fiber-tracker")`.

```ts
export async function fiberSignalIngestor(payload: unknown, ctx: { tenantId: string }):
  Promise<{ rawSignals: NonNullable<IngestItem["rawSignals"]>; recorded: number }> {
  const raw = normalizeAny(payload); // best-effort: {trackerEvent, detectedAt, detail, evidence{url}, domain/email, custom_data}
  const rawSignals = raw.map(s => ({ ...s, type: toCanonicalSignal(s.type) })); // job-change/hiring/funding → canonique
  // pour chaque signal dont domaine/email/orion_prospect_id résout un companyId :
  //   await recordCompanySignal(ctx.tenantId, companyId, entry)  // sous withTenantTx en aval
  return { rawSignals, recorded };
}
```

**Récepteur webhook (`app/api/webhooks/fiber/route.ts`, NET-NEW pack5).** `POST` : lit le **corps brut**
(pour Svix), `verifySvix(rawBody, headers, secret)` → `200` rejet si KO ; sinon `fiberSignalIngestor` sous
`withTenantTx(elevayTenantId, …)`. Renvoie `200` rapidement (Svix retry sur non-2xx) ; idempotence sur
`svix-id` (dédup). Le `tenantId` du webhook = résolu côté serveur (mapping endpoint→tenant), **jamais**
un champ du payload.

> **⚠️ Payloads exacts = à SORTIR, pas à deviner.** La forme exacte de chaque event-type Tracker
> **n'est pas dans l'OpenAPI** (elle vit côté Svix). Avant de figer le mapping de `normalizeAny`,
> **matérialiser** les payloads réels via **`POST /v1/previewTrackerSignal`** (+ `POST /v1/fireTrackerDummy`
> pour un dummy bout-en-bout, et `GET /v1/listAvailableTrackerRules` pour l'inventaire des règles) — c'est
> le **point réservé §7** de `research/partner-apis-2026-06-27.md` (« Payload exact par event-type Tracker
> → `previewTrackerSignal`/`fireTrackerDummy` + catalogue Svix `org_36NygGf4vTv8iDHHZgXdCNazcJx` »).
> Tant que ce relevé n'est pas fait, `normalizeAny` reste **best-effort + tolérant** (type inconnu → log,
> jamais throw) ; aucune décision de mapping n'est durcie sur une supposition.

**Fiber-Sales EXCLU** (pas d'API d'injection / d'envoi). **Lopus EXCLU en dur** (API non vérifiée —
best-effort `fiberSignalIngestor`-like si jamais, jamais en dépendance).
**VERIFY.** (a) Payload Tracker arbitraire (taxonomie inconnue) → `rawSignals` canonicalisés sans throw.
(b) `verifySvix` : signature valide → accepte ; corps altéré → rejette. (c) Event `funding` mocké avec
domaine résolvable → `recordCompanySignal` appelé une fois (canonique `funding`).
**TEST.** `fiber-source.test.ts` : (1) payload Tracker arbitraire → `rawSignals` normalisés via alias-map
(`job-change`→`leadership_change`/`job_change`, `hiring`→`hiring`, `funding`→`funding`) ; (2) signature
Svix invalide → rejet, `recordCompanySignal` **non** appelé ; (3) secret `whsec_` lu de
`integration_credentials`, **jamais** `process.env` ; (4) sujet non résolu → skip sans throw.

### Étape 11 — `inngest/velocity-snapshot.ts` (T-20, le cron — l'EDGE)
**Action.** Cron Inngest **2-arg** (gabarit `signal-score-daily.ts:95-108`). Agrège les `SnapshotProvider` des Étapes 4/6/7/8/9. Pour chaque sujet actif (companies du tenant elevay résolvant un `subject_key` : domaine, slug ATS, package, CIK — via `properties`/`vendorIds`/domaine), pour chaque provider :
1. `fetchSnapshot(subjectKey)` → état courant ; si `null` → skip.
2. Charger le **dernier snapshot antérieur** (`signalSnapshots` where `subject_key,source,metric` order by `observed_at desc`).
3. **Anti-jitter** : si un snapshot existe déjà pour **aujourd'hui** (même grille-jour), ne pas ré-insérer (skip insert), mais toujours possible de diff vs antérieur.
4. INSERT le snapshot courant (`tenant_id` = elevayTenantId, ou `NULL` si global npm/PyPI/SEC **et** la policy NULL existe — sinon elevayTenantId, cf. GAP-4).
5. `provider.derive(prev, curr, subjectKey)` → si `SignalEntry` non-null → `recordCompanySignal(elevayTenantId, companyId, entry)` (déjà canonicalisé). diff=0/négatif → **aucun signal** (invariant testé).
Chaque sujet = un `step.run` (durable, resume-safe). `concurrency:[{limit:2}]`. Plafonner à **3-5 signaux actionnables** par sujet (anti-bruit, design §5.4) ; exiger **convergence 2+ sources** avant de marquer haute priorité (laisser le scoring downstream juger via `strength`).
```ts
import { inngest } from "./client";
export const velocitySnapshot = inngest.createFunction(
  { id: "velocity-snapshot", name: "Velocity: snapshot Tier2 → diff → derived signal",
    retries: 1, concurrency: [{ limit: 2 }], triggers: [{ cron: "0 4 * * *" }] },
  async ({ step }) => {
    const providers = [greenhouseSnapshot, leverSnapshot, ashbySnapshot, npmSnapshot, pypiSnapshot,
                       githubSnapshot, techStackSnapshot, crtshSnapshot, edgarSnapshot];
    const subjects = await step.run("load-subjects", () =>
      withTenantTx(elevayTenantId, (tx) => loadActiveSubjects(tx)));   // {companyId, keys:{domain?,atsSlug?,pkg?,cik?}}
    for (const s of subjects) {
      await step.run(`snap-${s.companyId}`, () => withTenantTx(elevayTenantId, async (tx) => {
        for (const p of providers) {
          const key = pickKey(s, p.source); if (!key) continue;
          const curr = await p.fetchSnapshot(key, ctx); if (!curr) continue;
          const prev = await latestSnapshot(tx, key, p.source, p.metric);   // signalSnapshots desc
          if (!sameDay(prev, now)) await insertSnapshot(tx, { tenantId: elevayTenantId, subjectKey: key, source: p.source, metric: p.metric, value: curr.value });
          const sig = p.derive(prev?.value ?? null, curr.value, key);
          if (sig) await recordCompanySignal(elevayTenantId, s.companyId, sig);
        }
      }));
    }
    return { subjects: subjects.length };
  });
```
**Wiring registre (zone balisée — `inngest/registry.ts`, ÉDITION zone seulement) :**
```ts
// <<< ORION:INNGEST-FNS (append-only) >>>
import { velocitySnapshot } from "./velocity-snapshot";   // pack5
// <<< /ORION:INNGEST-FNS >>>
export const INNGEST_FUNCTIONS = [/* …autres… */ velocitySnapshot];
```
Si contention multi-session sur le registre → **déléguer le branchement à pack7** (livrer `velocitySnapshot` exporté ; ne pas bloquer). `route.ts` (pack0) garde `export const maxDuration = 300`.
**VERIFY.** Deux runs avec fixtures J et J+21 (ATS) → un signal dérivé `+N roles/3sem` écrit dans `properties.signals[]` ; deuxième run identique (diff=0) → **aucun** nouveau signal.
**TEST.** `velocity-snapshot.test.ts` : (a) 2 snapshots ATS (count 3 → 7) → `derive` émet `hiring` `+4` ; (b) snapshots identiques → `derive`=null, `recordCompanySignal` **non** appelé ; (c) `fetchSnapshot` null → pas d'insert, pas de throw.

### Étape 12 — Handoff d'intégration providers `waterfall_enrich` / `fiber` (soft dep → pack2/pack7)
**Action.** Pack5 livre `waterfallSource` (`IngestSource`) et `fiberTrackerSource`/`fiberSignalIngestor`
(volet **signaux** Fiber). Le câblage `waterfall_enrich` dans le switch provider de pack2
(`lib/ingest/mcp-handlers.ts` / `inngest/ingest-run.ts`, enum T-27) est **possédé par pack2** — **ne pas
l'éditer ici**. Pour Fiber, **deux flux distincts**, deux packs :
- **reveal contact** (`fiber` dans le COMPOSE pack2) = pack2 `enrich/fiber-reveal.ts` — rien à câbler ici.
- **signaux Tracker** (pack5) = **push** via le webhook `app/api/webhooks/fiber/route.ts` → `fiberSignalIngestor`,
  **pas** une branche du switch `ingest_from_provider` (Tracker ne se *pull* pas).

Snippet de branchement (à appliquer en intégration pack7) :
```ts
// pack2/pack7 — dans le résolveur de provider :
case "waterfall_enrich": return waterfallSource(seeds);
// fiber : PAS de pull provider — reveal = compose pack2 ; signaux = webhook Svix pack5
```
**VERIFY.** N/A (handoff documenté). Les sources/ingestors sont importables et `tsc`-valides isolément ;
la route webhook répond `200` sur un dummy `fireTrackerDummy` signé.
**TEST.** Couvert par les tests unitaires de chaque source (Étapes 2/10).

### Étape 13 — Suite de tests + fixtures réseau enregistrées
**Action.** `tier2-sources.test.ts` (fixtures `__tests__/fixtures/tier2/*.json`, `fetch` mocké via `vi.stubGlobal('fetch', ...)`) : pour **chaque** source, le payload fixture → le signal **canonique** attendu ; et `pull()`/`fetchSnapshot` **ne throw jamais** sur erreur réseau (mock rejette / status 500). + les tests dédiés `waterfall-source`, `sirene-source`, `fiber-source`, `velocity-snapshot`.
**VERIFY.** `pnpm --filter @orion/web test -- tier2 waterfall sirene fiber velocity` → tout vert.
**TEST.** (c'est l'étape test) couvre : canonicalisation, never-throw, dérivée correcte, diff=0→pas de signal, anti-jitter, clé Fiber absente → dégradé.

---

## 5bis. HERO — DÉTECTEURS POINT-IN-TIME (offline discovery du CSV closed-won/lost)

> **Pourquoi cette section.** Le hero figé (`orion/spec/demo-hero-FROZEN.md`) exige qu'à l'upload d'un
> CSV `closed-won/lost` (qui ne donne QUE **identité + label + date de close `J`**), Orion **reconstruise
> à froid** le vecteur de signaux **datés** de chaque ligne (won ET lost), puis ne compte un signal que si
> son événement tombe dans `[J−90 → J]`. Ça n'est possible que si **chaque détecteur de ce lot expose la
> VRAIE date de l'événement** (pas la date de détection) ET reste **ré-acquérable sur un compte jamais
> touché**. Les Étapes 4–10 livrent déjà les sources ; cette section **les rend point-in-time** et
> **ajoute le détecteur hero `leadership_change.vp_eng`** (Fiber + LinkedIn + BODACC). Aucun calcul de
> lift / prior ici — ça appartient au **pilier Discovery** (pack2) et au **seed** (pack7) ; pack5 ne
> fournit que les **détecteurs datés ré-acquérables** qu'ils consomment.

### 5bis.0 — L'INVARIANT POINT-IN-TIME (s'applique à TOUTES les sources, Étapes 4–15)
**Règle dure.** Tout signal **événementiel** émis (`recordCompanySignal` direct ou `derive`) porte
`detectedAt = la date RÉELLE de l'événement` (ISO), **jamais `new Date()`** :
- `leadership_change` → `role_start_date` (date de prise de poste) ;
- `funding` → `filingDate` du Form D (SEC) / date de l'annonce BODACC ;
- `hiring` → `first_seen` du poste (ATS `updated_at`/`created_at`) ou la **borne basse** de la fenêtre de diff snapshot ;
- `tech_adoption` (churn/adoption) → date du **1er certificat** (crt.sh) / `published_at` (npm/PyPI) / date du diff BuiltWith ;
- `product_launch` → date du 1er certificat du sous-domaine neuf.

> **Correctif aux Étapes 4/6/7/8/9.** Les snippets `derive(...)` y posent `detectedAt: new Date().toISOString()`.
> C'est **acceptable pour la veille LIVE** (snapshot pris aujourd'hui = l'événement est « maintenant »),
> mais **FAUX pour la reconstruction offline**. Donc : `derive(prev, curr, key, observedAt?)` accepte un
> 4ᵉ argument **optionnel** `observedAt` (ISO) ; s'il est fourni (mode reconstruction), `detectedAt =
> observedAt` ; sinon (mode cron live) `detectedAt = now`. **Quand la source porte une date d'événement
> intrinsèque** (Form D filingDate, cert date, published_at, role_start_date), c'est **elle** qui prime sur
> les deux. Cet argument est rétro-compatible (Étape 11 appelle `derive(prev,curr,key)` inchangé).

**Le contrat de reconstruction (net-new dans `tier2-http.ts`, consommé par pack2 Discovery) :**
```ts
export interface PointInTimeSource {
  /** type producteur (sera canonicalisé) ; ex 'job_change'|'funding'|'hiring_surge'|'tech_churn'. */
  signalType: string;
  /** reconstruit les événements DATÉS d'un sujet dans une fenêtre [from→to] depuis une source HORODATÉE ;
   *  ne throw jamais (réseau KO → []). Chaque event porte sa date RÉELLE. */
  reconstruct(
    subject: { domain?: string; siren?: string; name?: string; linkedinCompanyId?: string },
    window: { from: string; to: string },     // typiquement {from: J-90, to: J}
    ctx: PullCtx,
  ): Promise<Array<{ type: string; detectedAt: string; strength?: string; detail?: string;
                     source: string; evidence?: { url: string; quote?: string } }>>;
}
```
Chaque source hero exporte **et** son `IngestSource`/`SnapshotProvider` (veille live) **et** un
`PointInTimeSource` (reconstruction offline du passé). Le filtre `[J−90→J]` est appliqué par le
**consommateur** (Discovery, pack2) : pack5 garantit seulement que les dates retournées sont les **vraies
dates d'événement**, donc filtrables sans fuite temporelle. **Tout `type` est canonicalisé via
`toCanonicalSignal` (pack1)** avant émission (invariant DÉP-1).

### Étape 14 — `eng-title.ts` + `linkedin-jobchange-source.ts` : le détecteur HERO `leadership_change.vp_eng`
**Cadrage.** Le signal hero = **un nouveau VP/Head/SVP Engineering** chez la cible, `role_start_date ∈
[J−90→J]`. Canonique = `leadership_change` (alias `job_change → leadership_change`, taxonomy pack1) ;
**sous-type `vp_eng`** porté dans `detail` + `evidence` (le canonique reste `leadership_change` pour le
multiplier — pas de sur-fragmentation). Trois sources **ré-acquérables à froid**, par ordre de primauté :
1. **Fiber Tracker job-change** (primaire, US + monde) — **déjà** ingéré Étape 10 (`fiberSignalIngestor`),
   event Tracker `job-change`. **Ajout hero** : si le payload porte un titre, classer via `isEngLeadershipTitle`
   et, si eng-leadership, marquer `detail:"vp_eng"` + `detectedAt = role_start_date` du payload (pas `now`).
2. **Unipile / LinkedIn Sales-Nav — *changed-jobs*** (secondaire, couverture mondiale) — **net-new Étape 14**.
3. **BODACC modification-dirigeant** (cibles **FR**) — **déjà** Étape 5 (`bodaccSource` → `leadership_change`).
   **Ajout hero** : classer le rôle (`isEngLeadershipTitle` sur la qualité/fonction du dirigeant) + dater à
   la **date de l'annonce** (champ `dateparution`), pas `now`.

**`eng-title.ts` (pur, partagé).**
```ts
// src/lib/ingest/sources/eng-title.ts — NET-NEW pack5, pur (no I/O), testé
const ENG_LEADERSHIP = [
  /\b(vp|svp|evp|head|director|chief)\b.*\b(eng|engineering|technology|technical|platform|infrastructure)\b/i,
  /\b(cto|vpe)\b/i,
];
/** true si le titre est une fonction de DIRECTION engineering (VP/Head/SVP Eng, CTO, VPE). */
export function isEngLeadershipTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return ENG_LEADERSHIP.some((re) => re.test(title));
}
/** sous-type hero porté dans detail/evidence ; null si la fonction n'est pas eng-leadership. */
export function engLeadershipSubtype(title: string | null | undefined): "vp_eng" | null {
  return isEngLeadershipTitle(title) ? "vp_eng" : null;
}
```

**`linkedin-jobchange-source.ts` (Unipile Sales-Nav *changed-jobs*).** REUSE le seam d'EXISTANT
(`sourceFromSalesNav` `:54`, `buildSalesNavBody` `:68`, `resolveIcpToSalesNavQuery` `:123`) ; le filtre
Sales-Nav natif **« recently changed jobs (past 90 days) »** est résolu via le parameter-service (id
numérique, jamais en dur — mémoire `unipile-integration` : « SN search body = `{include:[strIds]}`, pas de
`job_title` libre »). `linkedinJobChangeSource(icp, opts)` :
```ts
export function linkedinJobChangeSource(
  icp: { titles: string[]; seniority?: string[]; industries?: string[]; geos?: string[] },
  opts?: { changedJobsWithinDays?: number },          // défaut 90 (fenêtre hero)
): IngestSource & { pit: PointInTimeSource } {
  return {
    name: "linkedin_jobchange", kind: "provider", subjectKind: "person",
    provider: "unipile", inputFingerprint: () => sha256(`li-jobchange:${JSON.stringify(icp)}`),
    async pull(ctx) {
      // resolveIcpToSalesNavQuery(icp) + filtre "recently changed jobs (90d)" → sourceFromSalesNav
      // pour chaque hit eng-leadership : IngestItem person + rawSignals:[{type:'job_change', detectedAt: role_start_date, detail:'vp_eng', evidence:{url: profile}}]
      // role_start_date = date de prise de poste du hit (jamais now) ; titre filtré par isEngLeadershipTitle
      return { items: [] /* peuplé via le seam */ };
    },
    pit: {
      signalType: "job_change",
      async reconstruct(subject, window, ctx) {
        // requête Sales-Nav scoptée à l'ENTREPRISE (subject.linkedinCompanyId/domain) + changed-jobs,
        // garde les hits eng-leadership dont role_start_date ∈ [window.from→window.to] ;
        // chaque event: { type:'job_change', detectedAt: role_start_date, strength:'high',
        //                 detail:'vp_eng', source:'linkedin', evidence:{url: profileUrl} }
        return [];   // never-throw : seam KO → []
      },
    },
  };
}
```
> **Auth/seat.** Le seat LinkedIn + l'`account_id` Unipile sont per-tenant (mémoire `unipile-integration`,
> `#415` seat-detect) ; aucun secret en `process.env`. Si aucun seat n'est connecté → `pull()`/`reconstruct()`
> renvoient `[]` (dégradé propre, Fiber/BODACC couvrent), **jamais** throw. **LinkedIn = canal primaire**
> (mémoire `prod-readiness-and-channel`) : c'est la source de couverture la plus large pour le hero hors-FR.

**L'appel re-jouable (cf `demo-hero-offers.md §1.7` — la veille FROIDE qui prolonge la discovery offline) :**
```http
# PRIMAIRE — Fiber Tracker job-change (US + monde) : déjà ingéré via webhook Svix (Étape 10),
# OU rattrapage on-demand listAvailableTrackerRules ; on garde role_start_date ∈ [today-90d → today]
GET /fiber/job-changes
  ?title_in=["VP Engineering","VP Eng","Head of Engineering","SVP Engineering","CTO"]
  &event=role_started
  &started_after=<today-90d>
  &company_filter=icp:"saas,series_a_c,eng_40_250"
→ pour chaque hit : recordCompanySignal(type=toCanonicalSignal("job_change") /* = leadership_change */,
                      detectedAt=role_start_date, detail="vp_eng", source="fiber",
                      evidence={url: profile})

# SECONDAIRE — Unipile Sales-Nav changed-jobs (couverture mondiale)
linkedinJobChangeSource({ titles:["VP Engineering","Head of Engineering","SVP Engineering","CTO"],
  seniority:["vp","head","cxo"], industries:["software"], geos:["us","fr"] },
  { changedJobsWithinDays: 90 }).pull(ctx)
→ filtre isEngLeadershipTitle + role_start_date ∈ [today-90d → today]

# FR FALLBACK — BODACC modification dirigeant (Étape 5) ; date = dateparution de l'annonce
BODACC /annonces?type=modification&objet=dirigeant&date_after=<today-90d>
→ match fonction technique (isEngLeadershipTitle) → recordCompanySignal(type="leadership_change",
                      detectedAt=dateparution, detail="vp_eng", source="bodacc")
```
**Reconstruction offline (le wedge day-one).** Pour CHAQUE ligne du CSV (won ET lost), Discovery (pack2)
appelle `pit.reconstruct(subject, {from: closeDate−90d, to: closeDate})` sur les 3 sources, **union** des
events, filtre `[J−90→J]`, dédup → un seul `leadership_change.vp_eng` daté par compte si présent. Le
**dénominateur = les LOST** (cf hero : won 6/10 vs lost 1/7 → lift ≈4,2×). pack5 ne calcule **pas** le lift —
il garantit que les events reconstruits sont **datés à la vraie date** et **ré-acquérables**.

**VERIFY.**
- `isEngLeadershipTitle("VP of Engineering")===true` ; `("VP Sales")===false` ; `("Chief Technology Officer")===true`.
- Fixture Sales-Nav changed-jobs (1 hit « Head of Engineering », `role_start_date` daté) → `pull()` émet
  `rawSignals:[{type:'job_change', detectedAt:<role_start_date>, detail:'vp_eng'}]` ; un hit « VP Marketing » → **filtré** (0 signal).
- `pit.reconstruct(subject, {from:'2024-06-14', to:'2024-09-12'})` sur la fixture Northwind (role_start 2024-07-18)
  → 1 event daté `2024-07-18` (dans la fenêtre) ; même appel avec un role_start `2024-05-01` (hors fenêtre) → `[]`.
- Seam Unipile absent (pas de seat) → `pull()`/`reconstruct()` = `[]`, **pas de throw**.

**TEST** (`linkedin-jobchange-source.test.ts`). (1) classifieur : table de titres eng vs non-eng ;
(2) `pull()` fixture → `job_change` canonicalisé `leadership_change` + `detail:'vp_eng'` + `detectedAt =
role_start_date` (jamais `now`) ; (3) titre non-eng → 0 signal ; (4) `pit.reconstruct` respecte la fenêtre
(in/out) sur **role_start_date** ; (5) seam KO → `[]` sans throw ; (6) `recordCompanySignal` jamais appelé
avec un type brut (`job_change`) — toujours le canonique.

### Étape 15 — Couverture HORODATÉE des autres signaux du seed (confirmation point-in-time)
**Action.** **Confirmer** (et compléter au besoin) que chaque signal datable du seed hero a une source
**horodatée** ré-acquérable à froid et un mapping canonique correct. Tableau de couverture (= ce que
Discovery reconstruit par ligne) :

| Signal seed (`demo-hero-offers §1.2`) | type brut émis | → canonique (`toCanonicalSignal`) | Source HORODATÉE (Étape) | Champ-date (point-in-time) | Froid ? |
|---|---|---|---|:---:|:---:|
| `vp_eng` (hero) | `job_change` | `leadership_change` | Fiber (10) · LinkedIn (14) · BODACC (5) | `role_start_date` / `dateparution` | **oui** |
| `fund` (levée) | `funding` / `funding_recent` | `funding` | SEC EDGAR Form D (4, US) · BODACC (5, FR) | `filingDate` / annonce | **oui** |
| `hire` (surge eng) | `hiring_surge` / `hiring_velocity` | `hiring` | ATS Greenhouse/Lever/Ashby (6) + diff snapshot (11) | poste `updated_at` / borne-basse fenêtre diff | **oui** |
| `tech` (churn outillage) | `tech_churn` | `tech_adoption` | techchurn BuiltWith-diff (8) + snapshot (11) | date du diff (1er constat) | **oui** |
| `gh` (commit-velocity) | `adoption_accel` | `tech_adoption` | OSS/GitHub velocity (7) + snapshot (11) | `published_at` / date du commit-spike | **oui** |
| `inv` (investor_overlap) | `investor_overlap` | `investor_overlap` *(passe-plat ; structurel, TTL `null` `freshness.ts:74`)* | Crunchbase / Form D co-lead (corroboration) | date du tour | **NON — confounder** |

**Deux clarifications hero à coder :**
1. **`investor_overlap` = le confounder, volontairement NON ré-acquérable à froid.** Il est **reconstructible**
   pour l'historique (afin que le tie-break `vp_eng` vs `inv` tourne sur les données affichées, hero §1.8),
   mais **aucun détecteur de veille froide** ne l'émet : sur un compte jamais touché, « même investisseur »
   = ton **canal d'intro**, pas un signal de marché. Donc pack5 **n'ajoute pas** de source cold
   `investor_overlap` ; il reste un **input de discovery** (corroboration datée), jamais une voie de
   prospection. (C'est exactement le reveal de la restitution.) `investor_overlap` n'a **pas** d'alias dans
   `taxonomy.ts` → passe-plat → reste keyé `investor_overlap` (cohérent avec `freshness.ts:74`, structurel).
2. **`commit_velocity` (libellé seed §4.2) doit alias-er vers un canonique.** Le détecteur GitHub de pack5
   émet déjà le pack5-canonique `adoption_accel → tech_adoption` (Étape 7) — **OK**. **Mais** si le seed/le
   CSV charge le type brut `commit_velocity`, `toCanonicalSignal('commit_velocity')` = passe-plat →
   **plancher 1.0×** (bug DÉP-1). → **flag additif pack1/pack7** : ajouter `commit_velocity: "tech_adoption"`
   à `SIGNAL_ALIASES` (`taxonomy.ts`). pack5 **ne l'édite pas** (ownership pack1) ; il émet `adoption_accel`
   et documente le flag. (Idem `hiring_surge`→`hiring` et `executive_hire`→`leadership_change` : déjà couverts pack1.)

**VERIFY.**
- `toCanonicalSignal('funding_recent')==='funding'`, `'hiring_surge'==='hiring'`, `'tech_churn'==='tech_adoption'`,
  `'adoption_accel'==='tech_adoption'`, `'job_change'==='leadership_change'` ; `'investor_overlap'==='investor_overlap'` (passe-plat).
- Sur le seed Northwind Labs (won, `J=2024-09-12`) : reconstruction `[J−90→J]=[2024-06-14→2024-09-12]` →
  `vp_eng` 2024-07-18 (in), `hire` 2024-08-05 (in), `gh` 2024-08-20 (in), `inv` 2024-06-30 (in, mais
  confounder), `fund`/`tech` absents → vecteur conforme à la table §1.2.
- Chaque source porte la **vraie date** (assert : aucun `detectedAt` ≈ `now` en mode reconstruction).

**TEST.** Couvert par `tier2-sources.test.ts` (canonicalisation par type) + un cas dédié dans
`linkedin-jobchange-source.test.ts` : table de mapping seed→canonique (6 lignes ci-dessus) + assert
`investor_overlap` reste passe-plat + assert `commit_velocity` flaggé (présent dans la liste des alias
attendus côté pack1, sinon le test **xfail-documente** le flag). Le calcul de lift/fenêtre lui-même est
**testé côté pack2/pack7** (Discovery), pas ici.

---

## 6. CRITÈRES D'ACCEPTATION (testables)
1. **Chaque source expose un `IngestSource`** conforme au contrat pack1 (`name/kind/subjectKind/inputFingerprint/pull`) ; `tsc` vert.
2. **`pull()` ne throw JAMAIS** : sur erreur réseau / timeout / payload corrompu → items partiels + log, jamais d'exception propagée (testé pour les 9 sources).
3. **Tout signal émis est canonicalisé** via `toCanonicalSignal` AVANT `recordCompanySignal` (aucun type brut `funding_recent`/`hiring_velocity` n'atteint `properties.signals[]`) → multiplier ≠ plancher pour un type connu.
4. **SEC** : requête porte un `user-agent` non vide ; fixture Form D → `rawSignals:[{type:<funding>}]` daté + CIK→domaine.
5. **Sirene** : `provider:'sirene'`, identité `siren`+`country:'FR'`, précédence rank 80.
6. **`velocity-snapshot`** : 2 snapshots J/J+21 → **un** signal dérivé daté ; snapshots identiques (diff=0) → **zéro** signal ; aucun double-snapshot le même jour (anti-jitter).
7. **`signal_snapshots`** est **lue/écrite** par pack5 mais **jamais créée/altérée** (aucune migration de table dans le diff pack5).
8. **Fiber Tracker (INPUT signaux)** : secret webhook Svix `whsec_` lu depuis `integration_credentials`
   (per-tenant chiffré), **jamais** `process.env` ; signature Svix vérifiée (corps brut) avant tout ingest ;
   payload Tracker arbitraire → `rawSignals` **canonicalisés** (`job-change`/`hiring`/`funding`) via
   `toCanonicalSignal` ; aucun chemin d'envoi Fiber (entrée seule). Reveal contact = hors scope (pack2).
9. **Cron** : `createFunction` 2-arg, `concurrency:[{limit:2}]`, `triggers:[{cron:"0 4 * * *"}]`, **aucune entrée dans `vercel.json`**.
10. **Tout accès DB** sous `withTenantTx(elevayTenantId, ...)` ; aucun `db` global, aucun `DATABASE_URL_OWNER` (grep `src` = 0).
11. **Scope** : le cron n'itère **que** le tenant `elevay`.
12. **[HERO] Point-in-time** : tout signal événementiel porte `detectedAt = la VRAIE date de l'événement` (`role_start_date` / `filingDate` / cert-date / `published_at`), **jamais `new Date()`** en mode reconstruction (`derive(...,observedAt)` / `reconstruct(...)`). Testé : un event hors `[J−90→J]` n'est PAS compté (filtre consommateur), un event dans la fenêtre l'est, à sa date réelle.
13. **[HERO] Détecteur `leadership_change.vp_eng`** : ré-acquérable à froid via **Fiber Tracker** (primaire) + **Unipile/LinkedIn changed-jobs** (`linkedinJobChangeSource`) + **BODACC** (FR) ; titre filtré par `isEngLeadershipTitle` (VP/Head/SVP Eng, CTO, VPE) ; sous-type `vp_eng` dans `detail` ; canonique `leadership_change` (jamais `job_change` brut vers `recordCompanySignal`). Seam LinkedIn absent → `[]`, pas de throw.
14. **[HERO] Couverture des autres signaux datables** confirmée (Étape 15) : `fund→funding` (Form D/BODACC), `hire→hiring` (ATS), `tech→tech_adoption` (BuiltWith-diff), `gh→tech_adoption` (GitHub-velocity), chacun avec source HORODATÉE. `investor_overlap` reste **input de discovery uniquement** (confounder) — **aucune** voie de veille froide ne l'émet ; `commit_velocity` → flag additif pack1 (`taxonomy.ts`), non édité par pack5.

---

## 7. DEFINITION OF DONE
- [ ] Les **21 fichiers** §3 créés/édités (9 sources Tier2 + **2 fichiers hero** `linkedin-jobchange-source.ts`/`eng-title.ts` + util + cron + wiring registre + **route webhook Fiber** + 6 tests + fixtures), **rien hors ownership** (`git diff --stat` scopé pack5).
- [ ] `pnpm --filter @orion/web tsc` **vert** + `pnpm --filter @orion/web test` **vert** (tous les tests pack5 passent).
- [ ] Les 11 critères d'acceptation §6 prouvés (logs/sorties de test attachés — « voilà la vérification »).
- [ ] VERIFY runtime exécuté soi-même : `velocity-snapshot` sur fixtures J/J+21 → signal dérivé observé (log).
- [ ] Aucune table créée par pack5 ; `taxonomy.ts`/`types.ts`/`snapshots.ts` non modifiés (REUSE par import).
- [ ] Aliases dérivés (`hiring_velocity`,`adoption_accel`,`tech_churn`,`product_launch`,`job_change`) **vérifiés présents** dans l'alias-map pack1 ; sinon flag ouvert pour pack1/pack7 (additif). **[HERO]** `commit_velocity → tech_adoption` flaggé pour pack1 (le seed §4.2 peut charger ce libellé brut).
- [ ] **[HERO]** Détecteur `leadership_change.vp_eng` à froid livré sur les 3 sources (Fiber primaire / LinkedIn `changed-jobs` / BODACC FR), titre filtré `isEngLeadershipTitle`, daté `role_start_date`. Appel re-jouable §5bis Étape 14 exécuté soi-même (log « voilà la vérification »).
- [ ] **[HERO]** Invariant point-in-time prouvé : reconstruction d'une ligne du seed (ex Northwind Labs, `J=2024-09-12`) sur `[J−90→J]` rend le vecteur daté attendu (§1.2) ; aucun `detectedAt ≈ now` en mode reconstruction (critères §6 #12–14).
- [ ] Handoff providers `waterfall_enrich`/`fiber` documenté pour pack2/pack7 (Étape 12).
- [ ] Commits atomiques (un changement logique chacun) avec le trailer obligatoire ; branche+HEAD re-vérifiés juste avant chaque commit (`git rev-parse --abbrev-ref HEAD` == `feat/orion-pack5`) ; pathspecs scopés (**jamais** `git add -A`).
- [ ] PR ouverte, **full CI verte** (gitleaks + tsc/vitest + Vercel) → `/evaluate` → merge squash + delete-branch + surveiller le push CI de `main`.

---

## 8. PIÈGES SPÉCIFIQUES À CE LOT
1. **SEC 403 sans User-Agent.** `efts.sec.gov`/`data.sec.gov` **exigent** un `User-Agent` identifiant (mail). Le 403 se manifeste en « source vide » silencieuse. → `safeFetch` pose l'UA partout (Étape 1).
2. **crt.sh lent/flaky.** Timeout généreux (20s) + retry 1, sinon faux négatifs. `pull()` ne throw jamais → snapshot manquant ce jour = pas de diff (acceptable).
3. **La dérivée n'existe pas à J0.** `derive(prev=null, curr)` doit retourner `null` (pas de signal au premier snapshot d'un sujet). Le moat se construit dans le temps → **lancer le cron dès le départ** (G6).
4. **Multiplier plancher si non-canonicalisé (DÉP-1).** Émettre `hiring_velocity` brut → `bestMultiplierForCompany`=undefined→1.0× (`signal-score-daily.ts:87`). **Toujours** `toCanonicalSignal` avant `recordCompanySignal`.
5. **Snapshots globaux `tenant_id NULL` + RLS (GAP-4).** La policy `signal_snapshots` doit autoriser `tenant_id IS NULL` pour npm/PyPI/SEC partagés. Si absente → 42501 au write. Contournement scope-elevay : écrire `tenant_id=elevayTenantId`. Flag pour pack1.
6. **`set_config(...,false)` interdit (Supavisor).** Tout DB via `withTenantTx` (transaction-local). Le cron fait plusieurs `step.run` → **un `withTenantTx` par step**, jamais un binding session.
7. **`createFunction` 3-arg = faux.** Forme 2-arg uniquement, triggers DANS la config, `concurrency` array (piège #1).
8. **Repo/package→entreprise = bruit.** Lier un repo npm/GitHub à une entreprise est ambigu ; filtrer le bruit CI (downloads de CI), et en l'absence de mapping fiable → snapshot **global** (`tenant_id NULL`) sans `recordCompanySignal` ciblé.
9. **Convergence avant priorité.** Ne pas inonder : plafonner 3-5 signaux actionnables/sujet, exiger 2+ sources convergentes avant « haute priorité » (laisser le scoring downstream arbitrer via `strength`). « Plus de sources = mieux » est faux (design §5.4).
10. **Anti-jitter snapshot.** Ne pas insérer 2 snapshots le même jour pour `(subject_key,source,metric)` (sinon dérivée = 0 ou bruit). Vérifier la grille-jour avant INSERT.
11. **Fiber secret en DB, pas en env.** Secret webhook Svix `whsec_` (et, côté pack2, `x-api-key` reveal)
    per-tenant chiffré dans `integration_credentials` (D7). Un test env-shape (pack7) asserte qu'aucune
    clé/secret Fiber n'est lue de `process.env`.
12. **Fiber = INPUT, Tracker = PUSH.** Fiber n'a **aucun** endpoint d'envoi (v1.40.0) → pas de `FiberAdapter`
    de sortie. Le Tracker se reçoit par **webhook Svix** (push), il ne se *pull* pas → `fiberTrackerSource.pull()`
    = `{items:[]}` par défaut, le vrai chemin est la route webhook. Vérifier la **signature Svix** (corps brut,
    `svix-*`, HMAC-SHA256) avant tout ingest. Le **reveal** contact est à pack2, ne pas le dupliquer ici.
13. **Payloads Tracker = à relever, pas à supposer.** La forme exacte par event-type vit **côté Svix**, pas
    dans l'OpenAPI → la sortir via `POST /v1/previewTrackerSignal` (+ `fireTrackerDummy`, `listAvailableTrackerRules`)
    avant de durcir `normalizeAny` (réserve §7 du doc partenaires). En attendant : best-effort tolérant, jamais throw.
14. **Lopus exclu en dur.** Ne crée **aucune** dépendance sur Lopus (API non vérifiée) ; au mieux via `fiberSignalIngestor`-like best-effort.
15. **[HERO] `detectedAt` ≠ `now` en reconstruction.** Le piège qui casse le hero : un détecteur qui date à `new Date()` fait passer un event hors-fenêtre comme « récent » → fuite temporelle → lift faux. Toujours la VRAIE date d'événement (`role_start_date`/`filingDate`/cert-date/`published_at`). Le `observedAt` optionnel de `derive` et `reconstruct()` existent **pour ça**.
16. **[HERO] `investor_overlap` = confounder, pas une source froide.** Ne JAMAIS ajouter de détecteur de veille froide `investor_overlap` : sur un compte jamais touché c'est le canal d'intro, pas un signal de marché (reveal du hero §1.8). Reconstructible pour la discovery (tie-break), jamais émis en prospection.
17. **Ownership `sources/`.** pack2 possède `csv-source.ts`/`apollo-source.ts` dans le **même** dossier — n'édite **que** tes sources Tier2 + `tier2-http.ts` + les fichiers hero (`linkedin-jobchange-source.ts`, `eng-title.ts`) ; `git add` par pathspec scopé.
