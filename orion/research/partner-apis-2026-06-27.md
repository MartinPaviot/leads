# Orion — Référence API partenaires (sortie + input Fiber)

> Doc de cadrage pour les **adaptateurs de sortie** d'Orion (pack4) + le connecteur **Instantly** déjà en place (`send-adapter.ts:19`, `custom_variables` = map scalaire plat).
> Convention de certitude appliquée partout : **FAIT-VÉRIFIÉ** = lu dans une spec / un package / une réponse d'API. **SUPPOSÉ** (ou **SUPPOSÉ-FORT**) = inféré, absent de la doc, ou non testable sans clé. **INTROUVABLE** = cherché, pas trouvé.
> Date de relevé : 2026-06-28.

---

## 0. Synthèse

| Partenaire | Rôle vis-à-vis d'Orion | API publique ? | Adaptateur OUTPUT possible ? | Certitude globale |
|---|---|---|---|---|
| **Instantly** | OUTPUT (séquenceur d'envoi) | Oui — REST v2, Bearer | **Oui, natif** (`POST /api/v2/leads`, `custom_variables`) | FAIT-VÉRIFIÉ (déjà branché) |
| **Fiber AI** | **INPUT** (data : enrichment + signaux Tracker). PAS d'outbound. | Oui — REST `/v1`, riche, versionnée 1.40.0 | **Non** (aucun endpoint d'envoi). L'intégration est l'inverse : enrichment + webhook Tracker → signaux | FAIT-VÉRIFIÉ (spec OpenAPI lue) |
| **Lopus** | Ni l'un ni l'autre : Beacon = découverte d'intent (pair amont d'Orion), Probe = analytics RevOps | **Non** (tout `docs/api/dev` mort, app WorkOS-gated). Seul artefact public = SDK chat génératif `lopus-ai` (mauvaise direction) | **Non** → handoff **webhook générique** seulement | FAIT-VÉRIFIÉ (absence prouvée) |
| **Orange Slice** | Hybride, mais **pair amont** : tableur-TS qui s'enrichit puis pousse lui-même vers Instantly/HeyReach/Gmail | Partielle : **un seul endpoint** = ingestion webhook par colonne | **Oui via webhook** (`POST /webhook/{sheet}/{col}`, JSON plat) ; pas d'API REST lead/campagne | FAIT-VÉRIFIÉ (doc Wayback 2025-12-07) |
| **Webhook générique** | Fallback vendor-neutre | N/A (contrat Orion) | **Oui** (enveloppe HMAC, brief complet) | Contrat Orion |

**À retenir pour pack4 :**
- Le seul partenaire avec un vrai contrat de champs custom exploitable nativement est **Instantly**.
- **Fiber** est un INPUT (deux sous-rôles : enrichment + signaux) — à brancher comme source de `whyNow`/`warm_path`, pas comme destination.
- **Lopus** et **Orange Slice** n'offrent pas d'API custom-fields → on retombe sur l'**enveloppe webhook générique** (§5), mapping fait côté client/middleware.

---

## 1. Instantly (rappel)

FAIT-VÉRIFIÉ (connecteur en place, `send-adapter.ts:19`).

- **Base URL** : `https://api.instantly.ai/api/v2`
- **Auth** : `Authorization: Bearer <API_KEY_V2>`. **Clé per-tenant** (une clé par espace de travail client).
- **Add lead** : `POST /api/v2/leads` (unitaire). **Bulk** : `POST /api/v2/leads/list` (≤ **1000** leads / appel).
- **Custom variables** : champ `custom_variables` = **map SCALAIRE PLATE** (clé → valeur string/number ; pas d'objet imbriqué). Ces clés deviennent les tokens de merge `{{var}}` consommés dans les steps de campagne.
- **Rattachement** : `campaign_id` **XOR** `list_id` (l'un ou l'autre, pas les deux).
- **Erreurs / limites** : `429` → backoff exponentiel.

> C'est le **gabarit de référence** : tout adaptateur doit savoir aplatir le brief Orion en map scalaire (comme `custom_variables`).

---

## 2. Fiber AI (fiber.ai)

**Désambiguïsation** : il s'agit de **fiber.ai** (YC S23, data broker B2B « freshest data APIs for AI sales »). AUCUN lien avec le framework Go `gofiber/fiber`.

**Sources lues** : Context7 OpenAPI `/openapi/api_fiber_ai_openapi_json` (spec `api.fiber.ai/openapi.json`, **v1.40.0**, source primaire) ; `api.fiber.ai/docs/` ; `api.fiber.ai/llms.txt` ; `fiber.ai` / `/sales` ; `docs.fiber.ai/article/using-mcp-in-llms` ; YC ; catalogue Svix officiel `svix.com/event-types/us/org_36NygGf4vTv8iDHHZgXdCNazcJx/`.

### Cadrage (à lire en premier)
**Fiber n'est PAS un outil outbound / séquenceur.** C'est une **API de DONNÉES (rôle INPUT)** : search firmographique/people, enrichment, **contact reveal en waterfall (16+ providers)**, et **Tracker** (monitoring + signaux poussés par webhook).
FAIT-VÉRIFIÉ : la spec 1.40.0 ne contient **aucun** endpoint d'envoi (email/LinkedIn), de séquence, de campagne outbound, ni de merge `{{var}}` pour une IA d'écriture. La notion la plus proche d'une « campagne » est l'**Audience** (liste cible construite par recherche) ; les **Tracker lists** sont des listes surveillées.

**Implication Orion** : rien à brancher en SORTIE. L'adaptateur naturel est l'**INVERSE** :
1. **INPUT enrichment** — Orion appelle Fiber pour révéler email/téléphone (waterfall) et enrichir firmo/funding.
2. **INPUT signaux** — Orion s'abonne au **Tracker webhook** (job change, hiring, layoffs, funding, posts…) comme source de `whyNow` / `signal_evidence`.

### (1) Rôle
Data API B2B agent-native : 40M+ entreprises, 850M+ personnes, 30M+ jobs. Rôle = **INPUT data** (enrichment ET signaux), PAS output. FAIT-VÉRIFIÉ.

### (2) Base URL + version
- **Base URL : `https://api.fiber.ai`**, chemins sous `/v1/...`. FAIT-VÉRIFIÉ (spec : `# Base URL: https://api.fiber.ai`).
- **Version : 1.40.0**. FAIT-VÉRIFIÉ.
- Docs machine : `/llms.txt`, `/ai-docs/`, `/openapi.json` (style Stripe). SDK : `@fiberai/sdk` (npm), `fiberai` (PyPI). Serveur MCP dispo.

### (3) Auth
FAIT-VÉRIFIÉ — clé API, 3 méthodes (body/query l'emporte sur header) :
1. **Body (POST) / query (GET)** : champ `apiKey` → `{"apiKey":"..."}` ou `?apiKey=...`
2. **Header `x-api-key: <clé>`**
3. **Header `Authorization: Bearer <clé>`**
- Récupération clé : **https://fiber.ai/app/api** (même page gère les webhooks).
- **Per-tenant** : SUPPOSÉ-FORT (non écrit noir sur blanc). Indices : la clé est rattachée à une **organisation** (`get-org-credits`, `rate-limits` parlent de « your organization », override « custom for your organization »). Donc 1 clé = 1 org = 1 client. Pas d'OAuth multi-tenant documenté → **stocker une clé Fiber par tenant**.

### (4) Endpoints « add/create lead » (+ bulk)
Pas de « lead » outbound. Équivalents d'ingestion (FAIT-VÉRIFIÉ) :

**Audiences (liste cible par search — analogue le plus proche d'une campagne) :**
- `POST /v1/audiences/create` — DRAFT. Body : `apiKey`, `name`, `creationMethod` (`NORMAL` | `START_FROM_PROSPECTS`). GRATUIT.
- `PATCH /v1/audiences/{audienceId}/search-params` — filtres. GRATUIT.
- `POST /v1/audiences/{audienceId}/build` — peuple via recherche (facturé).
- `POST /v1/audiences/{audienceId}/enrich` — body : `maxProspectsToEnrich`, `enrichmentType{getWorkEmails,getPersonalEmails,getPhoneNumbers}`, `runCompanyLiveEnrichment`, `runProfileLiveEnrichment`, `runProfileSalesNav`, `runContactEnrichment`, `userEmail?`. Async (poll). Coût : 2/work-email, 2/perso, 3/téléphone, 1/live-enrich prospect.
- Lecture : `GET /v1/audiences/{id}/companies` et `/prospects` (cursor, `pageSize` max 500, GRATUIT). Export : `POST .../export/companies|prospects`.
- **LIMITE clé** : l'audience se **remplit par recherche**, pas par upload de tes propres leads. **Pas de « POST mon prospect par LinkedIn URL dans une audience »** trouvé → tu ne peux pas injecter une cible Orion arbitraire. SUPPOSÉ (absence dans la spec lue).

**Ingestion de tes propres entités → seulement dans le Tracker (surveiller, pas outreach) :**
- `POST /v1/job-changes/add-profiles` — bulk, `{jobChangeListId, profiles:[{linkedinUrl}]}`. 1 crédit/profil. Retourne `invalidProfiles`.
- `PUT /v1/tracker/company-lists/{listId}/companies` — bulk add par `linkedinUrl` | `linkedinOrgId` | `linkedinSlug`. GRATUIT. Retourne `added/skipped/invalidCompanies`.
- `POST /v1/tracker/person-lists` (+ équivalent companies) — crée une liste surveillée ; `refreshIntervalDays`, `trackingRules[]`. 2 crédits/entité/cycle.

**Enrichment unitaire (le vrai usage INPUT Orion) :**
- `POST /v1/contact-details/single` — reveal sync standard. Body : `apiKey`, `linkedinUrl` (URL ou slug nu), `enrichmentType{...}`, `validateEmails`. Coût 2–5 crédits. Timeout reco 2 min. Retour : `profile.emails[]{email,type,status}`, `phoneNumbers[]{number,type}`.
- `POST /v1/contact-details/turbo/sync` — tier rapide premium.
- `POST /v1/contact-details/exhaustive/start` → `POST /v1/contact-details/exhaustive/poll` — **waterfall max-coverage async** (steps parallèles, 16+ providers). 4–12 crédits.
- Batch : `POST /v1/startBatchContactDetails` (10–2000) → `/v1/pollBatchContactDetails`.
- Resolvers : `POST /v1/KitchenSinkProfile`, `POST /v1/kitchenSinkCompany`. Search : `POST /v1/combined-search/paginated` (1 crédit/résultat), `companySearch`/`peopleSearch`, `textToCompanySearch`/`textToProfileSearch`, `jdToProfileSearch`. Live : `profileLiveEnrich`, `companyLiveEnrich`.

### (5) Custom variables
FAIT-VÉRIFIÉ partiel : `companies` et `profiles` (retours de search) exposent **`custom_data` (object, nullable)** — seul porteur de données arbitraires.
- Format : objet JSON libre (map non contrainte par le schéma). Casse = **snake_case** comme tout le payload.
- INTROUVABLE : aucune mécanique de merge `{{variable}}` (logique, Fiber n'écrit pas d'outreach). SUPPOSÉ : utiliser `custom_data.orion_prospect_id` pour réconcilier les webhooks Tracker entrants.

### (6) Campaign/list management
FAIT-VÉRIFIÉ : pas de campagne outbound. Deux notions de liste :
- **Audiences** (cibles par search) — create / search-params / build / enrich / list / export.
- **Tracker lists** — create, `PATCH` (rename, `refreshIntervalDays`, `isActive` pause/reprise, `trackingRules` replace-all OU `addRules`/`removeRuleIds` granulaire — jamais les deux), add entities bulk. « Rattacher un lead » = ajouter une entité à une Tracker list / audience ; pas d'enrôlement séquentiel.

### (7) Webhooks
- **ENTRANTS (Fiber → Orion)** : Fiber pousse des **Tracker signals**. Config endpoints sur **https://fiber.ai/app/api**. Catalogue d'event-types sur **Svix** (`svix.com/event-types/us/org_36NygGf4vTv8iDHHZgXdCNazcJx/`). ~45–52 règles vérifiées : job change, hiring, layoffs, funding, posts/comments/reactions, etc. (`GET /v1/listAvailableTrackerRules`, `POST /v1/previewTrackerSignal`, `POST /v1/fireTrackerDummy` pour tester — vus dans llms.txt). **Payload exact par event = INTROUVABLE dans la spec OpenAPI** (vit côté Svix) → SUPPOSÉ sur la forme des champs.
- **SIGNATURE** : FAIT-VÉRIFIÉ que Fiber utilise **Svix** → schéma = **standard Svix** (SUPPOSÉ-FORT pour Fiber) : headers `svix-id`, `svix-timestamp`, `svix-signature`, HMAC-SHA256 de `{id}.{timestamp}.{body}`, secret `whsec_...`. Vérif via lib `svix` (`Webhook(secret).verify(payload, headers)`). Emplacement du secret = INTROUVABLE dans la doc lue → à confirmer à l'intégration.
- Fiber **ne consomme PAS** de webhook entrant de ta part.

### (8) Rate limits / pagination / erreurs
FAIT-VÉRIFIÉ :
- **Rate limit par endpoint** (→ **429**). Exemples : `contact-details/single` 200/min ; `exhaustive/start` 120/min ; `combined-search/paginated` 30/min ; audiences create/enrich 30/min ; tracker 60/min ; `get-org-credits`/`rate-limits` 20/min. `GET /v1/rate-limits` renvoie les limites effectives (`isCustom` si override).
- **Pagination** : **cursor-based**. `pageSize` (max 500 audiences, 100 défaut). Réponses : `nextCursor` + `hasMore` + `totalCount`. `combined-search/paginated` a **deux curseurs** (`nextCompaniesCursor`, `nextProfilesCursor`).
- **Codes** : 400, 401, 402 (**out of credits** → `outOfCreditsAlert` + lien recharge), 403, 404, **429**, 500, 503. Body `{message}`. Modèle **à crédits** (`chargeInfo{method:"charged-now", creditsCharged, lowCreditAlert}`).
- **Timeouts** : endpoints live/waterfall ont un badge « Recommended timeout » (jusqu'à 2 min).

### (9) Résidence / RGPD
INTROUVABLE dans la doc — aucune mention DPA / région / RGPD. **Indice unique** : infra Svix en région **`us`** → SUPPOSÉ-FORT traitement **US-based**. Société YC US. **Hypothèse RGPD** : sous-traitant US → DPA + base légale requis pour usage UE ; valider avec adi@fiber.ai. (Cohérent avec la directive mémoire « pas d'enrichment par défaut, FullEnrich banni ».)

### Mapping (réinterprété — Fiber n'a pas de cible outbound)
**A) Orion → Fiber (INPUT) :**
| Champ brief Orion | Usage Fiber |
|---|---|
| `warm_path` (LinkedIn URL/slug) | `linkedinUrl` de `POST /v1/contact-details/single` (ou exhaustive) pour révéler email/tél |
| `priority_score` | côté Orion : tier — score haut → `exhaustive/start` ; score bas → `single` |
| (id prospect Orion) | écrire dans `custom_data.orion_prospect_id` pour réconcilier |

**B) Signal Tracker → brief Orion (le vrai flux) :**
| Webhook Tracker (entrant) | Champ brief alimenté |
|---|---|
| event type (job_change / hiring / funding / layoff / social post) | `whyNow` |
| URL source de l'event | `signal_evidence_url` |
| firmo enrichie (headcount, `latest_funding_consensus`, `technologies_used`) | `pain_point_x`, `citable_metric_x` |
| `relevance_score` / fraîcheur | `priority_score` (côté Orion) |
| `custom_data.orion_prospect_id` (round-trip) | réconciliation → `warm_path` |
| (Fiber ne fournit rien) | `best_angle`, `do_not_claim` → générés par Orion |

**Adaptateur reco** : récepteur webhook Svix (vérif `svix-*`), normalise l'event Tracker en signal Orion (`whyNow`+`signal_evidence_url`), puis `contact-details` à la demande pour matérialiser `warm_path`.

---

## 3. Lopus (lopus.ai)

**Verdict** : **aucune API publique d'ingestion lead / outbound** (Beacon ni Probe). Toutes les surfaces docs canoniques 404/DNS-dead (preuves ci-dessous). Seul artefact public = SDK frontend chat génératif `lopus-ai` (embarquer l'agent Lopus dans une app cliente — **mauvaise direction**). **Pas d'adaptateur Orion→Lopus vérifiable aujourd'hui.** Le seul chemin = handoff webhook générique (§5).
**De plus** : aucun produit Lopus n'est un « outil d'envoi qui consomme un brief ». Beacon = **découverte de leads** (pair/concurrent amont d'Orion) ; Probe = **analytics RevOps**. La prémisse « pousser un brief vers l'outil outbound » n'a pas de cible native chez Lopus.

### (1) URLs vérifiées — FAIT-VÉRIFIÉ
| URL | Résultat |
|---|---|
| `docs.lopus.ai` / `api.lopus.ai` / `developers.lopus.ai` | **DNS ENOTFOUND** |
| `lopus.ai/docs` · `/api` · `/integrations` · `/beacon` | **HTTP 404** |
| `lopus.ai/` | Marketing « The Operations Data Platform » (RevOps/BizOps) ; « 500+ integrations » **sans lien** ; nav Pricing/Team/Blogs/Sign In/Book Demo. Aucun lien API/dev. |
| `lopus.ai/pricing` | Plan unique **« Growth » $1 999/mo** + Enterprise (« Forward-Deployed Data Engineer »). **Aucune** mention API/intégration/export/seat. |
| `app.lopus.ai` | 307 → **WorkOS AuthKit** (`client_id=client_01JJWA6S0QT1V8NBTCMZSN0H4D`). App gated. |
| Context7 `resolve-library-id "Lopus"` | **Aucun match**. |
| `github.com/lopus-ai/lopus-ai-sdk` | **404** (privé/renommé). |

Profils corroborants (nature produit, pas API) : YC, The AI Report, Crunchbase.

### (2) Seul artefact API public : SDK `lopus-ai` — FAIT-VÉRIFIÉ (lu dans le package)
Trouvé via `github.com/lopus-ai/example-app` (« Example of `useLopusChat` », Next.js, janv. 2025) → npm **`lopus-ai`**.
- Latest **0.0.15** ; description **« A generative UI SDK that builds dynamic interfaces on-the-fly »**. Repo field `lopus-ai-sdk.git` (privé).
- Exports (`dist/index.d.ts`) : `LopusApp`, `initializeLopusApp`, **`useLopusChat`** (hook React), **`LopusBeacon`** (composant) + UI kit shadcn.
- Auth/transport (`dist/lopus-ai.es.js`) : `LopusApp.setConfig({ apiKey, actions })` ; `getApiKey()`. Transport **Socket.IO** (pas REST) ; header `Authorization` référencé, pas de `x-api-key` ; **aucune base URL extractible** du bundle minifié.
- **Interprétation (SUPPOSÉ bien fondé)** : widget chat embarquable Beacon — `<LopusBeacon>` dans TON app, `apiKey` par-app, generative UI sur websocket. **N'ingère aucun lead, ne consomme aucun brief.** Mauvaise direction (Lopus→client UI).

### (3)–(9) Spec — par produit
Pour **Beacon ET Probe**, (2)–(9) sont **INTROUVABLE / inexistants publiquement** :
- **(1) Rôle** — Beacon : lead discovery (scan posts d'intent, suggère outreach), **upstream**, pair/concurrent d'Orion. Probe : analytics RevOps (semantic layer CRM+billing+produit+unstructured, NL→SQL citations). Aucun n'envoie d'outbound.
- **(2)** Base URL/version : **aucune publiée** (backend WorkOS-gated, Socket.IO non divulgué).
- **(3)** Auth : pas d'auth d'ingestion documentée ; SDK = `apiKey` par-app + `Authorization` sur Socket.IO ; app = WorkOS OAuth. Clé per-tenant d'ingest **non confirmable** (pas d'API d'ingest).
- **(4)** Add lead : **aucun endpoint**.
- **(5)** Custom vars : **aucun schéma publié** (merge/injection inconnus).
- **(6)** Campaign/list : **aucune**.
- **(7)** Webhooks : **aucun** (ni entrant ni signature sortante). « 500+ integrations » = claim marketing non lié (probable couche connecteur tierce pour Probe, SUPPOSÉ).
- **(8)** Rate limits / pagination / 429 : **aucun publié**.
- **(9)** RGPD : **non divulgué**. SF, CA. Auth WorkOS (US). Pas de DPA/région public.

### Chemin reco : webhook générique (§5)
Ne **pas** construire de `LopusAdapter`. Réutiliser l'adaptateur webhook générique d'Orion, pointé vers l'endpoint qu'un client Lopus (ou un middleware Zapier/Make) fournit. Config per-client à l'intégration. Mapping → §6 (colonne « Lopus » = via enveloppe générique).

---

## 4. Orange Slice (YC S25)

> **Honnêteté sources** : `docs.orangeslice.ai` **404 sur toutes les routes** au 2026-06-28 (SPA Mintlify redéployée). Context7 : **aucune** entrée. Tous les faits viennent du **snapshot Wayback du 2025-12-07** (doc réelle lue). Mentions Instantly/HeyReach/Gmail = **marketing** (`/repo`), pas la doc technique.
> **Inventaire doc complet (CDX)** : `ctx/{overview,cells,this-cell,this-row,sheets,utilities,workflow}`, `services/{introduction,ai,company,person,scrape}`, `recipes/overview`, `webhooks/{overview,reference,setup}`. **Aucune** page `api-keys`/`authentication`/`rest`/`leads`/`campaigns`/`integrations`.

### (1) Rôle
FAIT-VÉRIFIÉ. Orange Slice = « *a TypeScript library built for sales* » : un **tableur où chaque colonne exécute du TypeScript** écrit par l'IA depuis un prompt NL. 3 objets par cellule : `ctx` (lire d'autres cellules / pousser des lignes), `services` (100+ enrichments typés), `webhook` (recevoir du HTTP).
**Vis-à-vis d'Orion = hybride mais surtout PAIR/CONCURRENT amont.** Input data : oui (pousser des leads via colonne webhook → lignes enrichies). Consommateur de brief : faible — **pas un séquenceur** ; OS **pousse lui-même** vers Instantly/HeyReach/Gmail (intégrations natives, « 4 actions » Instantly / « 1 action » HeyReach d'après `/repo`). SUPPOSÉ : si le client utilise OS, Orion injecte le brief comme **colonnes d'une ligne** via webhook et OS relaie vers le séquenceur.

### (2) Base URL + version
FAIT-VÉRIFIÉ (un seul endpoint public) : `https://api.orangeslice.ai`
- Format : `https://api.orangeslice.ai/webhook/{spreadsheet_id}/{column_id}`
- **Pas de versioning** (`/v1`). Pas de base REST CRUD générale documentée.

### (3) Auth
FAIT-VÉRIFIÉ — **AUCUN schéma d'auth plateforme.** Le webhook n'a **pas de Bearer/API-key natif** ; l'auth est **codée à la main** dans la colonne :
```ts
const apiKey = webhook.headers["x-api-key"];
if (apiKey !== "your-secret-key") return { error: "Unauthorized", status: 401 };
```
- En-tête : **celui que le client choisit** (exemple doc : `x-api-key`, valeur en dur) → **secret partagé par-tableur/par-colonne**, pas une clé de compte.
- **Per-tenant** : SUPPOSÉ/de fait — l'URL (`{spreadsheet_id}/{column_id}`, UUIDs) est le secret de capabilité → isolation par-client de fait. Vraie « clé client » = à **convenir manuellement**.
- Enrichments `services.*` : **aucune clé exposée** (facturé en crédits interne).

### (4) Add/create lead (+ bulk)
FAIT-VÉRIFIÉ. Pas de `POST /leads`. Création = **POST sur l'URL webhook**, le code de colonne crée la/les ligne(s).
- **Path** : `POST https://api.orangeslice.ai/webhook/{spreadsheet_id}/{column_id}`
- **Headers** : `Content-Type: application/json` (aussi `x-www-form-urlencoded` / `text/plain`)
- **Body** : JSON arbitraire. 3 façons d'écrire en lignes :
  - `webhook.addRootFieldsToSheet("Leads", true)` → mappe les **champs racine** sur des colonnes, `true` = crée les colonnes manquantes. *Imbriqué non aplati.*
  - `await ctx.sheet("Leads").addRow({ email, name, source, ... })` → 1 ligne, mapping explicite.
  - `await ctx.sheet("Leads").addRows(arrayOfData)` → **bulk** (N lignes / appel).
- **Limites** (taille body/batch/quota) : **non documentées** (SUPPOSÉ).
- **Dédup** : à coder (`ctx.getRowByValue("Leads", email, "email")` puis `existing.set({...})`). FAIT-VÉRIFIÉ (pattern doc).

### (5) Custom variables
FAIT-VÉRIFIÉ. Modèle tableur : un « champ custom » = **une colonne**. Mapping par **nom de colonne == clé JSON** (sensible à la casse, doit matcher exactement ; `create=true` crée les absentes).
- **Format** : map **scalaire** clé→valeur (cellules ; pas de typage de schéma à l'ingestion). Casse **respectée**.
- **Consommation IA** : **PAS de merge `{{var}}`.** L'IA est une **colonne** qui lit les autres cellules en TS et les injecte dans un prompt :
```ts
const name = ctx.thisRow.get("Name");
const out = await services.ai.generateText({ prompt: `Write a cold email to ${name}...`, model: "gpt-5-mini" });
return out.text;
```
→ une variable Orion devient une **colonne** lue par `ctx.thisRow.get("col")`, pas un token de template.

### (6) Campaign/list management
FAIT-VÉRIFIÉ : **aucune API de campagne/liste.** Unité d'organisation = **le sheet** (`ctx.sheet("Leads")`). Rattachement à une campagne Instantly/HeyReach = via les **« actions » in-app** (UI, non documentées API). SUPPOSÉ : écrire un nom/ID de campagne **dans une colonne** que l'action consomme.

### (7) Webhooks
**Entrants — FAIT-VÉRIFIÉ** (cœur de l'intégration). Objet `webhook` dans une colonne « Webhook » :
```ts
interface Webhook {
  colId: string; method: string; url: string;
  headers: Record<string,string>;   // noms en minuscules
  query: Record<string,string>;
  body: any;                          // JSON parsé selon Content-Type
  receivedAt: number;                 // epoch ms
  ip?: string;
  addRootFieldsToSheet(sheetName: string, create?: boolean): void;
}
```
La colonne **retourne** la réponse HTTP (`return { success:true }` ou `{ error, status:401 }`). Indispo dans un webhook : `ctx.thisRow`, `ctx.thisCell`.
**Sortants — NON DOCUMENTÉ.** Aucune page d'events sortants, **aucune signature/HMAC**. SUPPOSÉ : pour notifier Orion, créer une colonne TS qui `fetch()` un endpoint Orion → format/signature **à définir côté Orion**.

### (8) Rate limits / pagination / erreurs
**NON DOCUMENTÉ (tout SUPPOSÉ).** Aucune mention 429 / rate limit / pagination. Le code erreur = **ce que la colonne retourne** (`{ status:401 }`) → contrôlé par le client, pas un standard plateforme.

### (9) RGPD
**NON DOCUMENTÉ.** Société **US** (YC S25, SF). Sous-traitants nommés (marketing) : OpenAI, Google Maps, Firecrawl, Apify, BetterContact, **FullEnrich**, BuiltWith → chaîne US/multi-vendor. ⚠️ Drapeau RGPD : pas de DPA/région ; **FullEnrich dans la stack** (rappel mémoire : FullEnrich banni côté Elevay). SUPPOSÉ : hébergement US, transfert hors-UE probable.

### Mapping brief Orion → colonnes OS (POST JSON plat)
| Champ brief | Clé JSON / colonne | Type | Consommation OS |
|---|---|---|---|
| `whyNow` | `why_now` | texte | lu par `ctx.thisRow.get("why_now")` dans le prompt AI |
| `signal_evidence_url` | `signal_evidence_url` | URL | preuve citable / re-scrape `services.scrape` |
| `pain_point_1..n` | `pain_point_1`,… | texte | injectés dans `generateText` |
| `citable_metric_1..n` | `citable_metric_1`,… | texte/nb | « use only these metrics » |
| `best_angle` | `best_angle` | texte | drive l'angle du prompt |
| `do_not_claim` | `do_not_claim` | texte | **garde-fou** explicite dans le prompt (OS n'a pas de notion native) |
| `priority_score` | `priority_score` | nombre | filtrable via FilterSpec OS (seuil d'enrôlement) |
| `warm_path` | `warm_path` | texte | condition warm vs cold avant l'action outbound |

```bash
curl -X POST https://api.orangeslice.ai/webhook/{spreadsheet_id}/{column_id} \
  -H "Content-Type: application/json" -H "x-api-key: <SECRET_CONVENU_PAR_CLIENT>" \
  -d '{"email":"j@acme.com","name":"Jane Doe","company":"Acme","title":"VP Sales",
       "linkedin_url":"https://linkedin.com/in/janedoe",
       "why_now":"Closed Series B 2026-06","signal_evidence_url":"https://...",
       "pain_point_1":"manual CRM entry","citable_metric_1":"3 SDRs hired in 30d",
       "best_angle":"zero-entry capture","do_not_claim":"do not claim we integrate Salesforce",
       "priority_score":87,"warm_path":"intro via shared investor X"}'
```
Côté colonne OS (à faire écrire par le client) : valider `x-api-key`, dédup sur `email`, `webhook.addRootFieldsToSheet("Leads", true)`.

### Verdict OS
- **Marche, vérifié** : adaptateur **webhook générique** (POST JSON plat sur `/webhook/{spreadsheet_id}/{column_id}`, en-tête secret convenu). Le client fournit l'URL de colonne + la valeur de clé ; pas d'auto-provisioning.
- **N'existe pas / à ne pas promettre** : API REST lead/campagne, clé de compte standard, bulk avec limites, webhooks sortants signés, rate-limit/pagination/429, info région RGPD.
- **Positionnement** : pair **amont** d'Orion (enrichit + pousse lui-même vers Instantly/HeyReach/Gmail). Intégration naturelle = Orion **alimente une feuille OS**, OS relaie ; routage campagne via actions in-app (non scriptables).

---

## 5. Webhook générique (fallback vendor-neutre)

Quand un partenaire n'a **pas** d'API custom-fields exploitable (Lopus ; Orange Slice côté contrat ; tout futur partenaire sans REST documenté), Orion émet une **enveloppe stable auto-descriptive**, le mapping vers la destination se fait au step middleware (Zapier/Make) ou dans le code de colonne OS.

**Contrat (config per-client, fournie à l'intégration) :**
- **Transport** : `POST {client_webhook_url}`, `Content-Type: application/json`.
- **Auth** : client-supplied — `Authorization: Bearer <token>` **ou** `x-api-key: <key>`, stocké per-tenant dans le vault connecteur d'Orion.
- **Intégrité** : signature **HMAC-SHA256** du corps brut + headers `x-orion-timestamp` / `x-orion-signature` (schéma type Svix) ; le client vérifie avec un secret `whsec_...` partagé. (Pour une destination Svix-compatible comme Fiber, réutiliser directement `svix-*`.)
- **Idempotence** : `Idempotency-Key: <orion_lead_id>` (header) + `meta.idempotency_key` (corps).
- **Retry/limites** : backoff exponentiel, respect `429 Retry-After`.
- **Payload** : map plate de réconciliation au niveau `lead`/`meta` + **brief imbriqué complet** :

```json
{
  "lead": { "company":"...", "domain":"...",
            "contact": { "name":"...", "title":"...", "email":"...", "linkedin_url":"..." } },
  "brief": {
    "why_now":          "<whyNow>",
    "evidence_url":     "<signal_evidence_url>",
    "pain_points":      ["<pain_point_1>","<pain_point_2>","<pain_point_3>"],
    "citable_metrics":  ["<citable_metric_1>","<citable_metric_2>","<citable_metric_3>"],
    "best_angle":       "<best_angle>",
    "cta_type":         "<cta_type>",
    "do_not_claim":     ["<do_not_claim_1>"],
    "priority_score":   0.0,
    "warm_path":        "<warm_path>",
    "grounded":         true
  },
  "meta": { "source":"orion", "idempotency_key":"<orion_lead_id>", "generated_at":"ISO8601" }
}
```
Côté destination : `why_now`/`best_angle`/`pain_points`/`citable_metrics` → merge vars (`{{why_now}}`…) ; `priority_score` → champ priorité / routage de liste ; `warm_path` → note/intro ; `do_not_claim` → garde-fou que l'IA de la destination doit respecter. **Tout ce mapping aval est SUPPOSÉ** (non vérifiable contre Lopus/OS, pas de schéma lead publié).

---

## 6. Mapping brief Orion → champs, par destination

| Champ brief Orion | Instantly (FAIT-VÉRIFIÉ) | Fiber AI (input) | Orange Slice (FAIT-VÉRIFIÉ doc) | Lopus | Webhook générique |
|---|---|---|---|---|---|
| `whyNow` | `custom_variables.why_now` | ← alimenté PAR le Tracker (pas une cible) | colonne `why_now` | (via générique) | `brief.why_now` |
| `signal_evidence_url` | `custom_variables.signal_evidence_url` | ← URL source de l'event Tracker | colonne `signal_evidence_url` | (via générique) | `brief.evidence_url` |
| `pain_point_1..3` | `custom_variables.pain_point_1..3` | ← firmo enrichie (SUPPOSÉ) | colonnes `pain_point_1..3` | (via générique) | `brief.pain_points[]` |
| `citable_metric_1..3` | `custom_variables.citable_metric_1..3` | ← firmo enrichie (SUPPOSÉ) | colonnes `citable_metric_1..3` | (via générique) | `brief.citable_metrics[]` |
| `best_angle` | `custom_variables.best_angle` | — (généré par Orion) | colonne `best_angle` | (via générique) | `brief.best_angle` |
| `cta_type` | `custom_variables.cta_type` | — | colonne `cta_type` | (via générique) | `brief.cta_type` |
| `do_not_claim` | `custom_variables.do_not_claim` (string aplatie) | — (généré par Orion) | colonne `do_not_claim` | (via générique) | `brief.do_not_claim[]` |
| `priority_score` | `custom_variables.priority_score` | côté Orion : choisit le tier (single vs exhaustive) | colonne `priority_score` (filtrable FilterSpec) | (via générique) | `brief.priority_score` |
| `warm_path` | `custom_variables.warm_path` | `linkedinUrl` du reveal `contact-details` | colonne `warm_path` | (via générique) | `brief.warm_path` |
| `grounded` | `custom_variables.grounded` | — | colonne `grounded` | (via générique) | `brief.grounded` |
| (clé de réconciliation) | n/a (Instantly track son lead_id) | `custom_data.orion_prospect_id` | colonne `orion_lead_id` (dédup email) | `meta.idempotency_key` | `meta.idempotency_key` |

**Notes de mapping :**
- Instantly : `custom_variables` est une **map scalaire plate** → aplatir listes (`pain_points`) en `pain_point_1/2/3` et `do_not_claim` en string unique avant envoi. FAIT-VÉRIFIÉ.
- Fiber : colonne « input », pas « destination » — les champs whyNow/evidence **viennent** de Fiber, ils n'y sont pas poussés.
- Orange Slice / Lopus : aucun nom de champ natif n'est garanti — la colonne « OS » liste les **noms de colonnes conventionnels** que le client doit créer ; Lopus passe par l'enveloppe générique car aucun schéma n'existe.

---

## 7. À vérifier avant de coder l'adaptateur (par partenaire)

| Partenaire | Zone non confirmée | Comment confirmer |
|---|---|---|
| **Instantly** | (rien de bloquant — connecteur en place) | Re-tester `429`/backoff + plafond bulk 1000 sur la clé tenant |
| **Fiber** | Clé **per-tenant** (SUPPOSÉ-FORT) | Obtenir 1 clé sur `fiber.ai/app/api`, appeler `GET /v1/get-org-credits` et vérifier l'org rattachée |
| **Fiber** | **Payload exact par event-type Tracker** (vit côté Svix, pas dans OpenAPI) | `POST /v1/fireTrackerDummy` / `POST /v1/previewTrackerSignal` + inspecter le catalogue Svix `org_36NygGf4vTv8iDHHZgXdCNazcJx` |
| **Fiber** | Emplacement + schéma du **secret webhook** `whsec_` | Page webhooks `fiber.ai/app/api` ; vérifier headers `svix-*` sur un dummy |
| **Fiber** | **RGPD / résidence** (INTROUVABLE) | DPA + région auprès de adi@fiber.ai avant tout enrichment UE |
| **Lopus** | Existence de toute API d'ingestion (INTROUVABLE) | **Book Demo / contact Lopus** — pas de portail self-serve ; sinon rester sur le webhook générique |
| **Lopus** | Schéma lead / merge vars | idem (non public) |
| **Orange Slice** | Doc **live 404** — re-vérifier quand elle revient | Re-fetch `docs.orangeslice.ai/webhooks/reference` ; pour l'instant Wayback 2025-12-07 |
| **Orange Slice** | URL de colonne webhook + valeur `x-api-key` attendue | Fournies **par le client** (pas d'auto-provisioning) |
| **Orange Slice** | Limites bulk `addRows` / quotas / 429 (NON DOCUMENTÉ) | Test empirique sur un sheet de staging client |
| **Orange Slice** | RGPD (FullEnrich dans la stack) | DPA + région ; rappel : FullEnrich banni côté Elevay |
| **Générique** | Schéma de signature accepté par chaque destination | Convenir HMAC vs Bearer vs `x-api-key` par client à l'onboarding |

---

### Sources
- **Fiber** : Context7 `/openapi/api_fiber_ai_openapi_json` (v1.40.0) ; `api.fiber.ai/docs/` ; `api.fiber.ai/llms.txt` ; `docs.fiber.ai/article/using-mcp-in-llms` ; Svix `svix.com/event-types/us/org_36NygGf4vTv8iDHHZgXdCNazcJx/` ; YC.
- **Lopus** : DNS/HTTP checks (docs/api/dev dead, /docs /api 404) ; npm `lopus-ai` 0.0.15 + `github.com/lopus-ai/example-app` ; `app.lopus.ai` WorkOS ; YC / Crunchbase / The AI Report.
- **Orange Slice** : Wayback 2025-12-07 — `docs.orangeslice.ai` + `/webhooks/{overview,reference,setup}` + `/ctx/sheets` + `/services/introduction` ; `orangeslice.ai/repo` + `/pricing` ; YC.
- **Instantly** : connecteur en place, `app/.../send-adapter.ts:19`.
