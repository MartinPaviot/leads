# Audit approfondi — Contacts + SmartImport

> Règles appliquées depuis le hook UserPromptSubmit : aucune règle explicite remontée pour cet audit. Respect des principes CLAUDE.md (détail pixel, citation précise, vérifier le code réel, pas de fichier .md créé hors demande explicite — ici le fichier est explicitement demandé).

Date de l'audit : 2026-04-13
Portée : `/contacts` (liste + détail), `SmartImport` (wizard overlay), endpoints `/api/contacts/*`, `/api/import/*`, `/api/enrich-contacts/*`.

---

## 1. UI Contacts

### 1.1 Fichier et sections

Fichier : `app/apps/web/src/app/(dashboard)/contacts/page.tsx` (377 lignes).

Sections structurelles, dans l'ordre d'apparition :

| Bloc | Lignes | Rôle |
|---|---|---|
| Imports + icône LinkedIn inline | 1–23 | SVG LinkedIn custom (pas d'icône lucide) |
| Type `Contact` | 25–40 | Shape client : id, firstName, lastName, email, title, phone, linkedinUrl, companyId, companyName, companyDomain, score, scoreReasons, properties, lastInteraction |
| Helper `timeAgo` | 44–54 | Format "Xm ago / Xh ago / Xd ago / Xmo ago" (pas de i18n, pas de gestion >12 mois) |
| Composant `ContactsPage` | 56–376 | Container principal |
| `PageHeader` (toolbar) | 143–159 | Titre, compteur, 4 boutons |
| `FilterBar` | 161–171 | Recherche textuelle unique |
| Bandeau `importResult` | 173–179 | Toast inline success/error (pas auto-dismiss) |
| Table contacts | 191–333 | Rendu tabulaire, 9 colonnes fixes + N custom fields |
| Historique imports | 337–371 | Accordéon en bas (collapsed par défaut) |
| Modal SmartImport | 373 | Overlay monté conditionnellement |

### 1.2 Toolbar (CTAs du header)

Lignes 143–159. Quatre CTAs conditionnels :

1. **Enrich All (N)** — lignes 144–148. Visible si `unenrichedCount > 0`. `enrichAll()` envoie TOUS les IDs unenriched d'un coup dans un seul POST `/api/enrich-contacts` (ligne 124). Problème : le handler serveur slice à 20 (voir §3.5) donc tout ce qui dépasse est silencieusement ignoré, mais l'UI affiche « done » pour tous.
2. **Smart Import** — lignes 149–151. Ouvre le modal `SmartImport` via `setShowSmartImport(true)`.
3. **Import CSV** — lignes 152–157. Déclenche un input file caché, POST formdata vers `/api/import` (route "legacy" avec papaparse, voir §3.3).
4. **Create contact** — ligne 158. **Non fonctionnel : aucun `onClick`**, le bouton `variant="gradient"` s'affiche mais ne fait rien. Pas de modal de création, pas de redirection. C'est un clic mort.

### 1.3 Barre de filtres

Lignes 161–171. Un **seul** champ de recherche textuel. Filtrage côté client (lignes 133–139) sur : concat(firstName, lastName), email, title, companyName. Insensible à la casse.

**Aucun filtre serveur.** L'endpoint `GET /api/contacts` accepte seulement `page`, `pageSize`, `email` (voir §3.1) mais l'UI n'envoie aucun de ces paramètres : `fetch("/api/contacts")` ligne 72, sans query string. La pagination n'est donc pas consommée — pour un tenant avec > 50 contacts, seuls les 50 premiers sont visibles (default pageSize ligne 17 de `route.ts`).

### 1.4 Tri (sorting)

**Absent.** Les `<th>` (lignes 192–214) n'ont aucun handler click, aucune icône de tri, aucun état `sortBy/sortDir`. L'ordre affiché = ordre retourné par Postgres (aucun `ORDER BY` dans la query `GET /api/contacts`, donc ordre physique/insert indéterministe).

### 1.5 Bulk actions

**Quasi-absentes.** Il n'y a :
- aucune checkbox de sélection par ligne,
- aucun mécanisme de sélection multiple,
- aucun bouton bulk visible (delete, merge, export, assign, tag…).

Le seul traitement batch existant est « Enrich All » (ligne 145) qui cible implicitement tous les unenriched sans sélection utilisateur possible.

### 1.6 Colonnes de la table

Lignes 194–214 (déclaration) puis rendu lignes 217–329. Colonnes fixes (8) + custom fields dynamiques + colonne actions :

| # | Colonne | Rendu | Détail |
|---|---|---|---|
| 1 | Contact | ligne 227 | Dot status coloré (idle=muted, enriching=warning+pulse, done=success, failed=error) + `CompanyLogo` 24px + nom cliquable |
| 2 | Company | ligne 240 | Nom + lien externe `https://${domain}` (ExternalLink 10px). Pas de lien vers la fiche account interne. |
| 3 | Email | ligne 254 | Texte brut, pas de `mailto:`, pas de copy-to-clipboard, pas d'indicateur deliverability. |
| 4 | Title | ligne 259 | `PropertyBadge`, tronqué 180px. |
| 5 | LinkedIn | ligne 266 | Lien externe bleu LinkedIn #0A66C2. Normalise `https://` si manquant. |
| 6 | Phone | ligne 276 | Texte brut, pas de `tel:`, pas de format E.164. |
| 7 | Score | ligne 281 | Badge circulaire 22px avec grade + icon + heat label. Tooltip = `scoreReasons.join("; ")`. |
| 8 | Last Interaction | ligne 301 | `timeAgo` + résumé tronqué 150px. |
| 9+ | Custom fields | ligne 313 | Iteration sur `customFields` issus de `useCustomFields("contact")`. Rendu via `formatFieldValue(value, field.type)`. |
| dernier | Actions | ligne 323 | Bouton « Enrich » ghost visible uniquement si `!isEnriched && state !== "enriching"`. |

Navigation : toute la `<tr>` a `onClick={() => window.location.href = /contacts/${id}}` (ligne 225) — hard navigation (pas de `router.push`). Les `<td>` actions utilisent `e.stopPropagation()`.

### 1.7 Empty state / loading

- Loading : `TableSkeleton rows={5} cols={9 + customFields.length}` (ligne 183).
- Empty tenant : titre "No contacts" + description "Import a CSV or create contacts to get started." (lignes 187–188). Aucun CTA dans l'empty state — l'utilisateur doit remonter chercher les boutons dans le header.
- Empty search : titre "No matching contacts" + description "Try adjusting your search query.".

### 1.8 Historique imports

Lignes 337–371. Accordéon fermé par défaut (`showImportHistory = false`). Liste les 20 derniers imports (limite serveur ligne 16 de `api/import/history/route.ts`). Affiche pour chaque import : `createdCount contacts created, companiesCreated companies, skippedCount skipped`, date locale, `totalRows`, `status`, badge de status (success/warning/error). Non cliquable — pas de drill-down pour voir les lignes en erreur ni re-tenter.

### 1.9 Détail contact

Fichier annexe : `app/apps/web/src/app/(dashboard)/contacts/[id]/page.tsx` (303 lignes).

Pièces notables :
- Chargement séquentiel : contact → activities → N fetches `/api/accounts/:cid` en `Promise.all` pour chaque companyId (primary + `additionalCompanyIds`) (lignes 69–93). **Potentiel N+1 coté client** si beaucoup de companies additionnelles.
- Timeline activités minimaliste : cartes avec `activityType`, direction dot, summary, date `toLocaleDateString()` (pas d'heure).
- Bouton "Suggest reply" pour les activités inbound email (lignes 177–188). Hardcode un template en dur (pas d'appel LLM) avant d'ouvrir le composer.
- Panneau droit : Name, Title, Email (+ additionalEmails listés), Phone, LinkedIn, Associated companies (primary + extras avec badge "primary"). **Aucun champ éditable en place** — c'est en lecture seule. L'endpoint `PUT /api/contacts/:id` existe mais n'est pas câblé au détail.
- Chat scopé `ScopedChat` en bas (ligne 198).

### 1.10 Points forts (UI)

- Status dot avec pulse animation sur enriching — signal visuel clair de l'état d'enrichissement (ligne 229).
- Multi-email / multi-company supportés dans le type (lignes 38, 131) et rendus proprement dans la fiche détail.
- Custom fields dynamiques rendus en fin de ligne — permet d'étendre sans redéploiement.
- Score = badge grade + heat + tooltip reasons — densité d'info élevée dans une colonne compacte.
- `CompanyLogo` par domaine = affordance visuelle forte (pas juste des initiales).

### 1.11 Manquants et blocages UI (résumé)

| Item | Gravité |
|---|---|
| "Create contact" sans `onClick` | Haute — feature morte |
| Aucun tri de colonnes | Haute — au-delà de quelques dizaines de contacts, la liste devient inutilisable |
| Aucun filtre server-side (industry, score, owner, enriched, hasEmail, company, stage, date range) | Haute |
| Pagination UI absente — si > 50 contacts, les suivants sont invisibles | Haute |
| Aucune bulk action (delete, merge, tag, export, assign owner, add to sequence) | Haute |
| Aucune checkbox de sélection | Haute |
| Détail contact en lecture seule — `PUT /api/contacts/[id]` orphelin | Moyenne |
| Pas d'export CSV/Excel | Moyenne |
| Pas de `DELETE /api/contacts/[id]` (route absente) | Moyenne |
| Navigation vers détail = `window.location.href` (reload full) au lieu de `router.push` | Basse |
| `mailto:` / `tel:` absents | Basse |
| Retries / loading skeleton pour enrich individuel absents (status mis à jour mais pas de spinner dans la cellule) | Basse |

---

## 2. SmartImport Component

### 2.1 Fichier et structure

Fichier : `app/apps/web/src/components/smart-import.tsx` (332 lignes).

Composant fonctionnel overlay modal. Props : `{ onClose, onComplete? }` (ligne 17).

### 2.2 Étapes du wizard

L'état `step` (ligne 18) prend **trois** valeurs : `"upload" | "processing" | "result"`. C'est donc un wizard à 3 étapes, pas 4 comme souvent dans ce type d'UX (upload → mapping → preview → confirm). **Il n'y a pas d'étape mapping review ni preview-before-commit.**

| Étape | Lignes | Contenu |
|---|---|---|
| upload | 103–245 | Drop zone, paste textarea, preview 3 rows, sélecteur entityType, bouton "Import with AI" |
| processing | 247–259 | Spinner + copy "AI is mapping your columns..." |
| result | 261–327 | Cards stats (created/skipped/errors) + liste mapping CSV→CRM + bouton Done |

### 2.3 Parsing CSV côté client

Ligne 62–64 :

```ts
const csvLines = csvText.split("\n").filter(Boolean);
const headers = csvLines[0]?.split(",").map((h) => h.trim().replace(/^["']|["']$/g, "")) || [];
const previewRows = csvLines.slice(1, 4).map((l) => l.split(",").map((c) => c.trim().replace(/^["']|["']$/g, "")));
```

**Parsing naïf** : simple `split(",")`, aucune gestion des virgules dans les valeurs quotées, aucun support TSV, aucun support des fins de ligne CRLF / LF mixtes, aucun escape de guillemets doublés (`""`). Le composant n'utilise **pas** `papaparse` (qui pourtant est importé côté serveur dans `/api/import`). Un CSV Apollo ou HubSpot typique avec virgules dans les titres casse ce preview.

Note : le serveur (`/api/import/smart/route.ts` ligne 115–133) a son propre `parseCSVLine` qui gère les quotes mais pas les quotes échappées non plus. Les deux parseurs divergent (client ignore quoting, serveur gère les quotes).

### 2.4 Pas d'Excel

Accept = `".csv,text/csv"` (ligne 130). Aucun support `.xlsx` / `.xls`. Pas de lib `xlsx` / `sheetjs`. L'utilisateur doit exporter manuellement depuis Excel vers CSV.

### 2.5 Auto-mapping des colonnes

Le mapping ne se fait PAS côté client — il est entièrement délégué au serveur `/api/import/smart` qui utilise LLM + fallback heuristique (voir §3.2). L'utilisateur ne voit le mapping qu'**après** l'import, dans l'écran "result" (lignes 304–318).

**Conséquence UX majeure** : l'utilisateur n'a aucune opportunité de corriger un mapping avant l'écriture en DB. Si le LLM mappe mal une colonne (ex. "phone" → "title"), les données sont déjà insérées, et il n'y a pas de "undo import" ni de "rollback".

### 2.6 Déduplication

**Absente du flow SmartImport.** Le handler serveur `/api/import/smart` (lignes 66–96) fait un `db.insert(...)` direct par row, **sans lookup préalable par email/domain/name**. Il n'y a pas non plus de contrainte UNIQUE qui bloquerait — donc un même CSV importé deux fois crée des doublons purs.

Comparaison : le handler "legacy" `/api/import` (ligne 116–137) a une déduplication minimale pour les companies via `.onConflictDoNothing()` + cache local `companyCache`, mais pas pour les contacts.

### 2.7 Gestion gros fichiers

- Limite côté `POST /api/import/smart` : 5 MB (ligne 29–31 : `if (csvText.length > 5 * 1024 * 1024)`).
- Pas de limite en nombre de lignes sur smart route (vs 10k sur `/api/import`, ligne 79).
- **Aucun streaming, aucune chunking.** Tout le CSV est envoyé en JSON (`JSON.stringify({ csvText })`, ligne 43 du component), puis reparsé en mémoire serveur, puis itéré séquentiellement avec `await db.insert` **row par row** (pas de batch insert).
- Timing : pour 1000 lignes, 1000 `INSERT` séquentiels ≈ 5–30 s selon latence DB. Pas de progress bar côté client — l'utilisateur voit juste un spinner statique.
- Pas de `timeout` configuré côté component → repose sur le timeout fetch navigateur (typiquement 5 min mais variable).

### 2.8 Handling erreurs de format

- Si `csvText` vide : bouton désactivé (ligne 238 `disabled={!csvText.trim()}`).
- Si serveur renvoie erreur : bannière rouge `AlertCircle` en bas du form (lignes 224–229) + retour à step "upload". Pas de détail ligne par ligne.
- Si parse server échoue : réponse 400 generique (ligne 37, 51, 111) — pas de feedback granulaire sur *quelle* row a planté.
- **Les `try/catch` serveur (ligne 98–100) incrémentent un compteur `errors` mais n'enregistrent AUCUNE info sur les lignes en erreur.** L'utilisateur voit "3 errors" mais ne sait pas lesquelles ni pourquoi. Aucune download CSV des erreurs.

### 2.9 State management

- 6 `useState` locaux (step, csvText, entityType, result, error, fileInputRef).
- Pas de persistence localStorage → rafraîchir la page perd tout.
- Bug mineur ligne 25–32 : `handleFileUpload` lit le fichier, fait `setCsvText(text)` deux fois (redondant) et calcule `lines` qui n'est jamais utilisé.
- Pas de gestion du cas "utilisateur ferme le modal pendant processing" — le fetch continue en arrière-plan et le résultat est perdu silencieusement.

### 2.10 Points forts SmartImport

- UX modal propre, 3 steps clairs, spinner + copy descriptive.
- Affichage final du mapping utilisé (lignes 310–318) — transparence correcte a posteriori.
- Drag & drop + paste textarea + file picker = 3 input paths.
- Sélecteur "Auto-detect / Contacts / Accounts / Deals" (lignes 205–221) = permet de surcharger le LLM quand il se trompe.
- Fallback heuristique bilingue FR/EN côté serveur (ligne 227–241 : `prenom`, `nom`, `courriel`, `entreprise`, `chiffredaffaires`, etc.) — différenciateur pour le marché francophone.
- Taille upload cappée à 5 MB — protection DoS basique en place.

### 2.11 Manquants critiques SmartImport

| Item | Gravité |
|---|---|
| Pas de step mapping-review avant insert | Haute — aucune chance de corriger un mapping LLM foireux |
| Pas de déduplication (ni email, ni email+domain, ni fuzzy match) | Haute — réimport = doublons purs |
| Pas de rollback / undo import | Haute |
| Pas de support Excel (.xlsx) | Haute |
| Parsing CSV client naïf (split par virgule) | Moyenne — preview faux sur Apollo/HubSpot export |
| Pas de progress bar pour gros fichiers | Moyenne |
| Pas de download CSV des lignes en erreur | Moyenne |
| Pas de détection d'encodage (UTF-8 BOM, latin-1 pour vieux exports FR) | Moyenne |
| Pas d'auto-détection delimiter (`;` vs `,` — export Excel FR) | Moyenne |
| Insert row-par-row séquentiel (pas de batch) | Moyenne — timing ×10 |
| Pas d'enrichment automatique post-import | Moyenne (voir §4) |
| `setCsvText` appelé 2 fois ligne 27+31 | Basse — code mort |

---

## 3. Endpoints API

### 3.1 `GET /api/contacts`

Fichier : `app/apps/web/src/app/api/contacts/route.ts` lignes 8–107.

| Champ | Valeur |
|---|---|
| Auth | `getAuthContext()` obligatoire (ligne 9) → 401 sinon |
| Query params | `page` (default 1, ligne 16), `pageSize` (default 50, max 200, ligne 17), `email` (optionnel, filtre sur email principal + `properties.additionalEmails` via jsonb_array_elements, lignes 24–31) |
| DB reads | 1 SELECT contacts + 1 COUNT (parallélisés ligne 34), puis 1 SELECT companies pour enrichir les noms+domains (lignes 57–64), puis 1 `DISTINCT ON` sur activities pour last interaction (lignes 73–83) |
| DB writes | Aucune |
| LLM calls | Aucun |
| Providers externes | Aucun |
| Response | `{ contacts: [...], pagination: { page, pageSize, total, totalPages } }` |
| Error handling | try/catch global → 500 `{ error: "Failed to fetch contacts" }`. Sous-catchs sur company fetch (ligne 65) et interactions (ligne 88) qui loggent mais ne bloquent pas. |
| Rate limit | Aucun |
| Timing | ~50–200ms typique (3 queries parallélisables partiellement) |

Absences notables : pas de sort server-side, pas de filtre par score / stage / enriched / company / owner / createdAt, pas de search textuelle (seulement email exact).

### 3.2 `POST /api/contacts`

Même fichier, lignes 109–182.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire (ligne 110) |
| Payload | `{ firstName?, lastName?, email?, title?, phone?, companyId?, additionalEmails?, additionalCompanyIds?, name? }` — `name` parsé en firstName/lastName fallback (lignes 120–124) |
| Validation | Au moins email OU firstName OU lastName (lignes 126–128). Pas de regex email, pas de validation longueur, pas de vérification companyId tenant. |
| DB writes | 1 INSERT contacts (lignes 143–155) |
| LLM calls | Aucun directement |
| Providers externes | Aucun |
| Events | `inngest.send({ name: "contact/created" })` (lignes 158–161), best-effort avec `.catch(console.warn)` |
| Side effects | Embedding RAG via `embedEntity(tenantId, "contact", id, text)` asynchrone si `OPENAI_API_KEY` présent (lignes 164–175) |
| Response | `{ contact }` status 201 |
| Error handling | try/catch global → 500 generique |
| Rate limit | **Aucun** — un script peut spammer la création |
| Timing | ~100–300ms (1 INSERT + event fire-and-forget + embedding asynchrone) |

### 3.3 `GET /api/contacts/[id]`

Fichier : `app/apps/web/src/app/api/contacts/[id]/route.ts` lignes 6–33.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire (ligne 10), vérifie tenant scope via `and(eq(id), eq(tenantId))` (ligne 21) |
| DB | 1 SELECT contacts limit 1 |
| Response | `{ contact }` ou 404 |
| Rate limit | Aucun |

### 3.4 `PUT /api/contacts/[id]`

Même fichier, lignes 35–116.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire + tenant check via SELECT existing (lignes 48–56) |
| Payload | `{ firstName?, lastName?, email?, title?, phone?, companyId?, linkedinUrl?, additionalEmails?, additionalCompanyIds? }` — tous optionnels, merge partiel |
| DB | 1 SELECT (vérif) + 1 UPDATE (lignes 105–109) |
| Properties merge | Préserve les propriétés existantes, met à jour `additionalEmails` et `additionalCompanyIds` dans `properties` JSONB (lignes 72–89) |
| Response | `{ contact: updated }` |
| Rate limit | Aucun |
| Side effects | **Aucun** — pas de ré-embedding, pas d'event inngest `contact/updated`. L'index RAG devient stale après édition. |

### 3.5 `DELETE /api/contacts/[id]`

**Absent.** Aucune route DELETE définie. L'app ne peut pas supprimer un contact via API (seul recours : SQL direct).

### 3.6 `POST /api/import`

Fichier : `app/apps/web/src/app/api/import/route.ts` lignes 7–179.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire (ligne 8) |
| Content types | JSON `{ csvData \| csv_data \| csv }` OU multipart form-data `file` |
| Limites | 5 MB (ligne 14–21 par Content-Length, 36–41 par body length, 51–55 par file.size), **10 000 lignes** (lignes 79–84) |
| Parsing | `Papa.parse` avec `header: true, skipEmptyLines: true, transformHeader: toLowerCase` (lignes 60–64). Vrai parser CSV, contrairement à smart route. |
| Mapping | Heuristique hardcoded dans `findCol(...)` — accepte plusieurs aliases par colonne (email, emailaddress, emailaddresses, contactemail, contactemails, etc.) lignes 101–109. **Pas de LLM.** |
| Déduplication | `companies` via `.onConflictDoNothing()` + cache local `companyCache` (lignes 123–136). **Contacts : aucune dédup** (ligne 140, insert direct). |
| DB writes | N INSERT companies + M INSERT contacts + 1 INSERT importHistory |
| Rate limit | **Aucun** (ligne 7 : pas de checkRateLimit). Contradiction avec smart route qui elle l'a. |
| LLM calls | Aucun |
| Providers externes | Aucun |
| Response | `{ success, created, skipped, total, companiesCreated }` |
| Error handling | CSV parse errors → 400 avec détails. Catch global → 500 generique. **Pas de tracking ligne-par-ligne.** |
| Timing | ~100ms par row (INSERT séquentiel) → 1000 rows ≈ 10–100s |

### 3.7 `POST /api/import/smart`

Fichier : `app/apps/web/src/app/api/import/smart/route.ts` lignes 13–113.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire (ligne 14) |
| Rate limit | `checkRateLimit("bulk", authCtx.userId)` — **5 req/min** par user (ligne 19, défini dans `rate-limit.ts` ligne 61) |
| Payload | `{ csvText: string, entityType?: "contact" \| "account" \| "deal" }` |
| Limites | 5 MB (ligne 29–31). **Aucune limite de lignes** (contrairement à `/api/import`). |
| Parsing | `parseCSVLine` maison (lignes 115–133) — gère les quotes mais pas les quotes échappées `""` |
| Mapping | `mapColumnsWithAI(headers, sampleRows, entityType)` (lignes 141–200) : LLM (Claude 3.5 Sonnet via `@ai-sdk/anthropic`, fallback GPT-4o-mini via `@ai-sdk/openai`) sur 5 premières lignes d'échantillon. Fallback heuristique FR/EN si aucune clé API. |
| Model | `claude-sonnet-4-6` (ligne 182) — **identifiant de modèle suspect** : "sonnet-4-6" n'est pas un modèle Anthropic officiel connu (les noms réels sont `claude-sonnet-4-5-20250929` ou `claude-3-5-sonnet`). Risque d'erreur runtime. |
| Prompt | Prompt unique (lignes 154–173) qui inclut les headers + sample rows + demande JSON `{entityType, fieldMap, confidence}`. Pas de few-shots, pas de structured output (il parse manuellement `response.text.replace(/```json\n?/g, "")`). |
| DB writes | 1 INSERT **par row**, séquentiel (lignes 66–97). Pas de batch, pas de transaction. |
| Déduplication | **Aucune.** |
| Import history | **N'est PAS loggé** (pas d'insert dans `importHistory`, contrairement à `/api/import`). L'accordéon d'historique dans l'UI ne verra pas les smart imports. Incohérence majeure. |
| Response | `{ success, entityType, mapping, created, skipped, errors, totalRows }` |
| Error handling | Catch global (ligne 110) + catch par row (98–100) incrémentant `errors`. Aucun détail par row. |
| Timing | ~1–3s LLM + 50–100ms par row. 500 rows ≈ 30–60s. |

### 3.8 `GET /api/import/history`

Fichier : `app/apps/web/src/app/api/import/history/route.ts` lignes 6–23.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire (ligne 7) |
| DB | 1 SELECT importHistory WHERE tenantId, ORDER BY createdAt DESC, LIMIT 20 (lignes 11–16) |
| Response | `{ imports: [...] }` |
| Rate limit | Aucun |
| Timing | ~30–100ms |

Note : tel que vu en §3.7, seul `/api/import` y écrit. SmartImport n'est jamais tracé ici.

### 3.9 `POST /api/enrich-contacts`

Fichier : `app/apps/web/src/app/api/enrich-contacts/route.ts` lignes 22–166.

| Champ | Valeur |
|---|---|
| Auth | Obligatoire (ligne 23) |
| Rate limit | `checkRateLimit("enrich", authCtx.userId)` — **30 req/min** par user (ligne 28) |
| Payload | `{ contactIds: string[] }` |
| Limite batch | Slice à **20 contacts** par call (ligne 42 : `contactIds.slice(0, 20)`). **L'UI n'est pas au courant de cette limite** et envoie parfois plus (voir §1.2 bouton Enrich All). |
| Workflow par contact | 1) SELECT contact (ligne 44), 2) skip si déjà enriched via Apollo (lignes 58–61), 3) Apollo enrichPerson (lignes 64–74) si clé API dispo, 4) si succès → UPDATE avec title/linkedin/phone/properties riches (lignes 92–115) + ré-embedding RAG (lignes 117–127), 5) si échec Apollo → UPDATE avec `enrichment_source: "unavailable"` + `enrichment_error` (lignes 139–152) |
| Providers externes | Apollo.io via `enrichPerson({ email, first_name, last_name, domain })` importé de `@/lib/apollo-client`. Pas de fallback Clearbit / Hunter / ZoomInfo. |
| LLM fallback | **Intentionnellement désactivé** (commentaire ligne 138 : « No LLM fallback — mark as unavailable instead of hallucinating »). Le schéma `llmFallbackSchema` (lignes 13–20) et les imports `anthropic, openai, tracedGenerateObject` (lignes 6–9) sont déclarés mais **jamais utilisés** — code mort. |
| DB writes | 1 UPDATE contacts par contact (succès OU échec) + éventuellement 1 SELECT companies (lignes 80–88) pour associer |
| Side effects | Ré-embedding RAG asynchrone sur succès Apollo |
| Response | `{ success, enriched, failed }` |
| Error handling | try/catch par contact (ligne 155) incrémente `failed` sans détail |
| Timing | ~500ms–2s par contact (Apollo latency) + 100ms embedding. 20 contacts ≈ 10–40s. **Blocant synchrone** côté client — pas de queue Inngest. |

---

## 4. Flow d'import détaillé (SmartImport)

Étapes end-to-end, avec annotations timing, LLM, DB.

1. **Upload côté client** (`smart-import.tsx`)
   - User drag/drop ou paste CSV.
   - `file.text()` (ligne 26) → string en mémoire navigateur.
   - Preview client : split par `\n` + split par `,` (ligne 62–64). **Aucun LLM, aucune API call.**
   - User clique "Import with AI" → `handleImport()` (ligne 34).

2. **POST `/api/import/smart` avec `{ csvText, entityType }`** — payload JSON, jusqu'à 5 MB.

3. **Auth + rate limit serveur** (`route.ts` lignes 14–21)
   - `getAuthContext()` (1 DB read : session/user).
   - `checkRateLimit("bulk", userId)` — in-memory Map (pas de Redis) → 5/min.

4. **Validation du format** (lignes 24–38)
   - Vérifie `csvText` string non vide.
   - Vérifie taille ≤ 5 MB.
   - Vérifie ≥ 2 lignes non-vides.

5. **Parse headers + échantillon** (lignes 40–41)
   - `parseCSVLine(lines[0])` pour headers.
   - `lines.slice(1, 6).map(parseCSVLine)` pour 5 rows de sample.

6. **LLM call — column mapping** (ligne 44, fonction lignes 141–200)
   - **1 appel LLM unique** sur l'échantillon (pas par row).
   - Primaire : Anthropic `claude-sonnet-4-6` via `generateText({ model, prompt })` (lignes 181–184). Identifiant modèle suspect.
   - Fallback : OpenAI `gpt-4o-mini` via `generateText`.
   - Fallback ultime : `heuristicMapping(headers, hintEntityType)` (lignes 202–254) — pattern matching hardcoded bilingue FR/EN.
   - Parse manuel du texte (`response.text.replace(/```json\n?/g, "")`) — pas de `generateObject` avec schema Zod, donc pas de garantie de format.
   - Retour : `{ entityType, fieldMap, confidence }`.
   - Timing : ~1–3s.

7. **Validation entityType** (lignes 46–51)
   - Si `null` → 400 avec `suggestedMapping` pour debug.

8. **Parse exhaustif des rows** (ligne 54)
   - `lines.slice(1).map(parseCSVLine)` — pas de streaming, tout en RAM.

9. **Boucle d'insertion — row par row** (lignes 57–101)
   - `applyMapping(headers, row, fieldMap)` (lignes 256–276) :
     - Pour chaque header, trouve le crmField et pousse la valeur.
     - Strippe quotes externes.
     - Exige ≥ 1 champ identifiant (email/name/firstName/domain) sinon retourne `null` → skip.
   - Selon `entityType` :
     - `contact` : `db.insert(contacts).values({ tenantId, firstName, lastName, email, title, phone })` (lignes 66–73). **`linkedinUrl` et `companyId` ignorés** même s'ils sont dans le mapping — incomplet.
     - `account` : `db.insert(companies).values({ tenantId, name, domain, industry, size, revenue, description })` (lignes 76–85). Pas de dédup.
     - `deal` : valide stage contre enum (lignes 87–89), `db.insert(deals).values({ tenantId, name, stage, value })` (lignes 90–96). Pas de lien contact/company.
   - Try/catch par row → `errors++`.
   - **Pas de transaction globale** — si ligne 500/1000 crashe, les 499 premières sont commit.
   - **Pas de parallélisation, pas de batch.**

10. **Réponse** (lignes 103–109)
    - `{ success, entityType, mapping, created, skipped, errors, totalRows }`.
    - **Aucune entrée dans `importHistory`** (contrairement à `/api/import`).
    - **Aucun event Inngest `contact/created`** (contrairement à `POST /api/contacts`).
    - **Aucun embedding RAG** des contacts importés — ils sont invisibles au chat / search sémantique jusqu'au prochain enrichment manuel.
    - **Aucun enrichment Apollo automatique** — il faut cliquer "Enrich All" ensuite.

11. **Affichage result** (`smart-import.tsx` lignes 261–327)
    - Stats agrégées uniquement.
    - Liste mapping utilisé.
    - Bouton Done → `onComplete()` déclenche `fetchContacts()` dans la page parente.

Durée totale typique pour 500 contacts : **1–3 s LLM + ~50 s inserts = ~60 s**.

---

## 5. Gaps critiques (priorisés)

### Haute priorité (bloque production)

| # | Gap | Fichier | Impact | Mitigation |
|---|---|---|---|---|
| H1 | "Create contact" bouton sans onClick | `contacts/page.tsx:158` | Feature manquante | Câbler une modale de création + POST `/api/contacts` |
| H2 | Pas de step mapping-review avant insert dans SmartImport | `smart-import.tsx` | Mapping LLM foireux = données corrompues sans recours | Ajouter step "review" entre processing et commit ; séparer `/api/import/smart/preview` et `/api/import/smart/commit` |
| H3 | SmartImport ne fait AUCUNE déduplication | `api/import/smart/route.ts:66–97` | Réimport = doublons purs | Lookup par email+tenantId avant INSERT, ou contrainte UNIQUE DB |
| H4 | SmartImport ne log pas dans importHistory | `api/import/smart/route.ts` | Accordéon "Import history" n'affiche jamais les smart imports | Ajouter insert `importHistory` à la fin du handler |
| H5 | SmartImport ne déclenche pas `inngest.send("contact/created")` ni embedding | `api/import/smart/route.ts:66–73` | Contacts importés invisibles au chat / search sémantique, pas d'enrichment auto | Fire event par contact ou batch après insertion |
| H6 | Pas de tri ni filtre server-side sur la liste contacts | `contacts/page.tsx` + `api/contacts/route.ts` | Liste inutilisable > 50 contacts | Ajouter sort/filter params côté serveur, UI avec `<th>` cliquables |
| H7 | Pagination UI absente | `contacts/page.tsx:72` | Contacts > pageSize invisibles | Ajouter pagination controls + query param `page` |
| H8 | Aucune bulk action (delete, merge, sequence, export, tag) | `contacts/page.tsx` | Workflows de masse impossibles | Ajouter checkbox column + toolbar d'actions |
| H9 | Pas de route DELETE contact | absent | Suppression impossible via UI | Créer `DELETE /api/contacts/[id]` |
| H10 | Modèle Anthropic `claude-sonnet-4-6` non standard | `api/import/smart/route.ts:182` | Risque d'erreur runtime si identifiant invalide | Vérifier sur Context7 / Anthropic docs, corriger en `claude-sonnet-4-5-20250929` ou équivalent |
| H11 | SmartImport : limite 5 MB mais pas de limite lignes | `api/import/smart/route.ts` | 50k lignes courtes = timeout Vercel (10s hobby / 60s pro) | Aligner avec 10k lignes cap comme `/api/import` + envisager jobs Inngest pour > 1k |

### Moyenne priorité (dégrade l'expérience)

| # | Gap | Fichier | Impact | Mitigation |
|---|---|---|---|---|
| M1 | Parsing CSV client naïf | `smart-import.tsx:62–64` | Preview faux sur Apollo/HubSpot (virgules dans titres) | Importer papaparse côté client pour le preview aussi |
| M2 | Pas de support .xlsx | `smart-import.tsx:130` | Users exportent à la main depuis Excel | Lib `xlsx` / `sheetjs` + accept `.xlsx` |
| M3 | Pas de détection de delimiter (`;` export FR) | partout | Export Excel FR casse silencieusement | Auto-detect via `papaparse` `{ delimiter: "auto" }` |
| M4 | Aucun feedback ligne-par-ligne en cas d'erreur | `api/import/*` | User voit "3 errors" sans détail | Collecter `{ rowNum, error, rawData }[]`, retourner + téléchargement CSV des erreurs |
| M5 | Insert row-par-row séquentiel | `api/import/smart/route.ts:66–97` et `api/import/route.ts:101–153` | Timing ×10 | Batch inserts (1000 rows/INSERT) + transaction |
| M6 | Détail contact en lecture seule | `contacts/[id]/page.tsx` | Impossible d'éditer title, phone, linkedin depuis UI | Câbler formulaire inline → `PUT /api/contacts/[id]` |
| M7 | `PUT /api/contacts/[id]` ne ré-embed pas | `api/contacts/[id]/route.ts:105–109` | RAG stale après édition | Re-déclencher `embedEntity` + optionnellement event Inngest `contact/updated` |
| M8 | Pas de rate limit sur POST /api/contacts ni /api/import (legacy) | `api/contacts/route.ts` + `api/import/route.ts` | Spam API possible | Ajouter `checkRateLimit("bulk", userId)` |
| M9 | `enrich-contacts` slice à 20 mais UI envoie potentiellement plus | `api/enrich-contacts/route.ts:42` + `contacts/page.tsx:117–129` | Silent data loss : user croit que 100 sont enriched, seulement 20 le sont | Soit augmenter limite soit paginer côté UI soit passer par jobs Inngest |
| M10 | Historique imports non drilldownable | `contacts/page.tsx:348–369` | Impossible de voir les rows échouées | Page dédiée `/settings/imports/[id]` avec détails + retry |
| M11 | `Enrich All` bloquant synchrone | `api/enrich-contacts/route.ts` | Freeze UI 30s+ pour gros volumes | Déporter vers Inngest queue + webhook notification |
| M12 | `heuristicMapping` n'attribue pas de mapping cross-entity (ex. `company` + `email` dans même CSV → soit contact soit account, jamais les deux avec liaison) | `api/import/smart/route.ts:202–254` | Si CSV mixte, relations perdues | Supporter `entityType = "contact+account"` avec création auto des companies |

### Basse priorité (polish)

| # | Gap | Fichier | Impact |
|---|---|---|---|
| B1 | Navigation détail = `window.location.href` (reload full) | `contacts/page.tsx:225, 232` | Perd état SPA, latence |
| B2 | `mailto:` / `tel:` absents | `contacts/page.tsx:254, 276` | Pas d'action rapide depuis la liste |
| B3 | `setCsvText` appelé 2 fois | `smart-import.tsx:27,31` | Code mort |
| B4 | `lines` calculé jamais utilisé | `smart-import.tsx:30` | Code mort |
| B5 | Schéma `llmFallbackSchema` + imports OpenAI/Anthropic inutilisés | `api/enrich-contacts/route.ts:6–20` | Code mort (≈ 15 lignes) |
| B6 | `timeAgo` ne gère pas > 12 mois (reste en `Xmo ago` même à 5 ans) | `contacts/page.tsx:44–54` | Affichage dégradé long terme |
| B7 | Bannière `importResult` n'a pas d'auto-dismiss | `contacts/page.tsx:173–179` | User doit cliquer X |
| B8 | `CompanyLogo` passe `name={firstName}` au lieu du company name si pas de domain | `contacts/page.tsx:230` | Avatar cohérent mais sémantique faussée |

---

## 6. Points forts (ce qui est bien fait)

1. **Fallback en cascade Apollo → "unavailable" sans LLM hallucination.** L'auteur a explicitement refusé de faire du fill-in LLM pour l'enrichissement des contacts (commentaire ligne 138 de `enrich-contacts/route.ts`). C'est une décision correcte pour un CRM : mieux vaut "inconnu" que "inventé".
2. **Heuristique de mapping bilingue FR/EN** (`api/import/smart/route.ts:226–241`) — `prenom`, `courriel`, `entreprise`, `societe`, `taille`, `effectif`, `chiffredaffaires`, `montant`, `etape`. Rare dans les produits US-first et différenciant pour Elevay.
3. **Tenant scoping strict** sur toutes les routes (`eq(contacts.tenantId, authCtx.tenantId)` systématique).
4. **Rate limiting cohérent** sur les routes coûteuses (`bulk` 5/min pour import smart, `enrich` 30/min pour enrich-contacts) — protection raisonnable sans frictions.
5. **Import history tracké** pour `/api/import` legacy (schéma + endpoint history + UI accordéon) — infra réutilisable pour SmartImport quand on la câblera.
6. **Multi-email + multi-company** dans les schémas (`additionalEmails`, `additionalCompanyIds` dans `properties` JSONB) et rendus dans la fiche détail avec badge "primary" — gère les cas réels où un contact a 2 emails ou fait partie de 2 comptes (rare mais différenciant).
7. **Re-embedding automatique** après enrichment Apollo (`embedEntity` lignes 117–127 de enrich-contacts) — le RAG reste frais sans action manuelle.
8. **Status dot animé + 4 états (idle/enriching/done/failed)** dans la liste — signal visuel dense et lisible.
9. **Sélecteur "Auto-detect / Contacts / Accounts / Deals"** dans SmartImport — permet de surcharger le LLM sans changer de flow.
10. **Fallback en 3 niveaux** pour le mapping : LLM Anthropic → LLM OpenAI → heuristique — robustesse correcte même sans clé API.
11. **Ordering `DISTINCT ON`** pour la dernière interaction (ligne 73–83 de `api/contacts/route.ts`) — efficient côté Postgres (vs subquery + join).
12. **`CompanyLogo` basé sur domain** (Clearbit logo service ou équivalent) — affordance visuelle forte sans asset management.

---

Rapport écrit dans _reports/audit-deep/03b-contacts.md
