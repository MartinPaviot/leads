# PRD — Signaux agent-natifs (Elevay)

## 1. TL;DR

Elevay expose son moteur GTM (résolution d'identité, composition multi-source, signaux, scoring, grounding, gates d'envoi) comme une **surface MCP agent-native**. Une liste brute (CSV ou provider) entre ; l'identité est résolue, les champs composés par précédence, les signaux acquis et scorés ; et un agent externe — Claude Desktop, Cursor, ou l'agent in-product — fait l'outreach signal-driven, grounded et cité, **sous des gates fail-closed qu'il ne peut pas atteindre depuis le JSON-RPC**. L'agent décide *quoi tenter* ; il ne décide jamais *si ça passe*.

**Moment wow (1:14–1:30)** : l'agent demande un envoi sur un compte non-revu et **se le refuse à lui-même** — `evaluate_send → {send:false, code:"not_targeted"}`. La preuve visuelle que l'autonomie est sûre par construction : les gates vivent dans le corps des wrappers (`sending-gate.ts:212`, `catch→{send:false}` `:339`), pas dans un paramètre fourni par l'agent.

**MVP démontrable en hackathon** : slice de ~6 wrappers MCP minces + bump protocole + ingestion synchrone + seed scoré, en REUSE à 100 % de la logique métier. Le MVP agent-natif complet (pipeline Inngest durable, dédup 3 niveaux, resources, hookpoints) est chiffré **≈ 11,5 j-h** — au-delà d'un week-end ; on livre le slice prouvant-la-thèse (~2×26 h) et on présente le reste comme roadmap déjà cartographiée file:line.

**Métrique nord** : `0` envoi échappant aux gates, y compris piloté par un agent externe — *et* temps « liste brute → 1er draft gaté » **< 3 min**.

---

## 2. Problème & opportunité

Un founder en founder-led sales a une liste brute (export CSV, dump Apollo, recherche Sales-Nav) et une seule vraie question par ligne : **« dois-je contacter cette boîte maintenant, et pourquoi ? »** Y répondre est aujourd'hui un travail manuel de plusieurs heures, à la ligne :

- **Dédup et résolution d'identité à la main** — « ACME SAS » et « acme.io » sont deux lignes à fusionner avant de raisonner. L'import actuel insère **brut** dans les colonnes legacy, sans dédup ni identité (`app/api/import/smart/route.ts:66-96`).
- **Composition multi-source de tête** — le secteur vient de l'un, le domaine de l'autre, l'effectif d'un troisième ; le founder arbitre dans sa tête.
- **Chasse au why-now dans Clay et dix onglets** — recouper financement, recrutement, tech-stack, changement de dirigeant, une source à la fois, sans citation vérifiée. C'est exactement le travail que **Clay + UserGems + Bombora facturent 30 à 120 k$/an**.
- **Rédiger un message qui tienne le signal** sans fabriquer un fait faute de grounding.
- **Se rappeler les règles d'envoi** (base légale, fenêtre horaire, cap, froid sur domaine primaire) **avant** d'appuyer sur envoyer.

Le founder fait ce pipeline dans sa tête et abandonne avant la centième ligne. Le moteur Elevay sait déjà résoudre, composer, scorer, grounder et garder — mais **rien n'expose cette chaîne à un agent**, et l'entrée brute ne traverse jamais le pipeline. Le travail de jugement reste 100 % humain.

**Why now.** Trois courbes se croisent et déplacent la valeur de la donnée vers le jugement :
1. **MCP est standardisé** (`2025-06-18` : annotations, `structuredContent`, resources, élicitation). Elevay a déjà un serveur MCP fonctionnel (12 outils, JSON-RPC, Bearer tenant-scope — `app/api/mcp/route.ts:19`/`:293`/`:921`) : la marche restante est l'exposition, pas la fondation.
2. **Les agents enchaînent** découverte → draft → évaluation → envoi de façon fiable s'ils reçoivent des sorties structurées et des annotations de sûreté. L'orchestration métier n'a plus besoin d'être codée page par page.
3. **Les signaux se commoditisent** (ATS publics, SEC Form D, BODACC/recherche-entreprises FR, GitHub, npm/PyPI). Quand la donnée tend vers zéro, **le moat n'est plus la donnée mais la composition + le jugement** : recouper 3+ sources en un why-now cité, grounder chaque claim, garder l'envoi.

Le défaut #1 historique (multipliers signal au plancher 1.0× faute de canonicalisation) **est déjà corrigé dans le tree** (`fix/signal-learned-alias` : `SIGNAL_PRIORS` + alias + `inheritAliasMultipliers`) — la canonicalisation n'est plus un bloqueur.

---

## 3. Vision & positionnement

**Vision (une phrase)** : une liste brute ou N providers entrent ; l'identité est résolue, les champs composés par précédence, les signaux acquis et scorés ; la surface ressort par MCP pour qu'un agent fasse l'outreach signal-driven, grounded et sous gates, **sans jamais réécrire la logique métier ni court-circuiter l'envoi**.

| | Ce qu'ils sont | La limite | Pourquoi agent-natif + gates + grounding diffère |
|---|---|---|---|
| **Clay** (signal aggregator) | Lance à incendie de signaux isolés + enrich waterfall, orchestré par un humain dans une table | Signaux **isolés** ; le founder relie les points, devine le why-now, rédige à la main. Pas de gate d'envoi, pas de grounding vérifié | Elevay **synthétise** un why-now compound (3+ sources → une preuve citée, HEAD-vérifiée) et **boucle jusqu'à l'action gated**. Le travail que Clay laisse à l'humain est l'output |
| **Monaco** (AI SDR) | SDR autonome boîte-noire qui décide et envoie | L'humain **subit** les décisions ; pas de surface ouverte, pas de citation par claim, pas de dry-run du gate | Elevay sépare **décision (agent, ouvert via MCP)** et **exécution (gates fail-closed serveur-side)**. L'agent lit `evaluate_send` **avant** d'agir ; chaque envoi nomme son gate. Auditable, pas boîte-noire |
| **Le wrapper d'API providers** | Proxy fin vers Apollo/Crunchbase | Renvoie de la donnée brute non résolue, non composée, non scorée, non groundée | Entre l'API et l'agent, Elevay intercale **identité + précédence + signaux + score + grounding + gates** — la valeur est la composition, pas le passe-plat |

**Thèse en une ligne** : tout le marché valide que *le moat est la couche de jugement, pas la donnée*. Elevay est le seul à l'exposer **comme une surface agent-native** — entrée indifférente, sorties typées+citées, action sous gates non contournables.

---

## 4. Personas

**P1 — Le founder-led seller (utilisateur humain).** Vend lui-même, pas de SDR, pas de RevOps, budget data ≈ 0. Pré-PMF, souvent EU/FR (RGPD décisif). Profil sans trafic web ni télémétrie produit → l'intent web est hors-jeu ; le moat est timing + warm-path (financement, recrutement, job-change champion, investor-overlap). Il veut passer de « liste froide » à « messages source prêts » sans devenir opérateur d'outil. **Canal primaire = LinkedIn** (base légale tranchée par le founder — non rediscutée ici).

**P2 — L'agent lui-même (utilisateur via MCP) — persona de première classe.** L'agent (Claude Desktop / Cursor / in-product) est un **consommateur du produit**, pas un détail d'implémentation. Il s'authentifie par Bearer `mcp_*` (tenant-scope serveur-side, jamais en argument d'outil — `authenticateMcpRequest`), enchaîne les outils, et exige un contrat machine :
- des sorties **typées** (`outputSchema` + `structuredContent`), pas un blob texte à reparser (`route.ts:957`) ;
- des **annotations** (`readOnly`/`destructive`/`idempotent`) pour graduer la confirmation — aujourd'hui absentes (gap P0) ;
- des **resources** adressables (le « dossier prospect ») pour ne pas brûler 4 tool-calls à reconstituer un contexte.

Invariant qui définit ce persona : **l'agent pilote quoi tenter ; il ne décide jamais si ça passe.** Les gates vivent dans le corps des wrappers, inatteignables depuis le JSON-RPC.

---

## 5. Le parcours utilisateur — DEMO 2 MIN (pièce maîtresse)

**Setup de scène.** Écran partagé : **Claude Desktop à gauche** (client MCP externe, connecté en Bearer `mcp_*` au serveur Elevay via un tunnel HTTPS), **l'app Elevay à droite** (page Accounts/Inbox du tenant de démo). Le point : *ce n'est pas notre UI qui agit, c'est le Claude du founder* qui pilote Elevay par MCP, et qui ne peut pas déraper. Transport réel : `POST /api/mcp`, JSON-RPC 2.0 (`route.ts`, routeur `:917`, dispatch `:293`).

**Pré-seed OBLIGATOIRE (sinon la démo casse silencieusement — pièges vérifiés file:line) :**

| # | Risque | Parade de pré-seed (AVANT de filmer) |
|---|---|---|
| P1 | **Climax raté en silence** : le gate targeting ne se déclenche que si `targetingGateEnabled()` est vrai (`sending-gate.ts:301`). Sur un tenant neuf sans flag, la branche est **sautée → `{send:true}`** et le refus n'arrive jamais | **`TARGETING_GATE_ENABLED=on` + `safeModeEnabled=true`** sur le tenant. **Vérifier live le `{send:false, not_targeted}` avant de filmer.** Dépendance bloquante #1 |
| P2 | **`find_prospects` sort vide** : `priorityScore` est `NULL` (`icp/fit-recompute-core.ts:92`) tant qu'un run de scoring n'a pas tourné. Le tri `companies_priority_score_idx` ne ramène rien | Seed = **insérer PUIS scorer** : exécuter `computePriorityScore` (+ poser `priorityScoreComputedAt`) sur les 5-10 comptes de démo |
| P3 | **Body vide** sur le mauvais chemin de copie (`generate-message.ts`/`copy_asset_block` vide platform-wide ; `gradeEmail` 0.57 ne l'attrape pas) | **Câbler `draft_outreach` sur `generateOpener` (`signal-opener.ts:162`), déterministe — `fillTemplate` `:146` substitue des fallbacks, ne rend JAMAIS un body vide.** Pré-seeder `product`/contexte pour que les fallbacks lisent bien |
| P4 | **Send légitime bloqué** : `enforceSendingIdentity` (`sending-gate.ts:324`) refuse cold-on-primary par défaut (`allowCold` default false) ; un prospect jamais contacté est cold (`isColdRecipient:87`) | Destinataire du send-OK = boîte **outlook.com/elevay.dev réellement warm** (thread préalable depuis l'outlook du founder) **OU** `sendingAllowColdOnPrimary=true` sur le tenant |
| P5 | **Fenêtre 08-18** (gate 7 fenêtre) bloque tout envoi hors-plage | **Filmer entre 08:00 et 18:00 locale.** `interactive:true` esquive ce gate en secours |
| P6 | Compte-piège du refus | Pré-marquer le compte du send-OK `targeting_status=targeted` ; **laisser** le compte-piège `unreviewed` → c'est lui qui déclenche le `send:false` |
| P7 | Allowlist test-mode | Cible du send réel = `elevay.dev`/`outlook` (idéalement la boîte du founder, projetée) |

**Transport à dérisquer dès vendredi** : Claude Desktop attend HTTPS. Le serveur est POST JSON-RPC **sans SSE** (`route.ts:938`). Prévoir un tunnel HTTPS (ngrok / Vercel preview) et valider `initialize`+`tools/list` round-trip **avant** de builder quoi que ce soit. Dépendance bloquante #2.

### Table seconde-par-seconde (happy path filmé, regroundé honnête)

| t (s) | À l'écran | Action | Outil MCP | Retour affiché | Narration |
|---|---|---|---|---|---|
| **0:00–0:12** | Claude Desktop, un `prospects.csv` (~25 lignes) sur le bureau | Le founder glisse le CSV : « ingère ça » | `ingest_csv {csv_text, sync:true}` — **NET-NEW (mode synchrone, stretch)** | retour **inline direct** : `{ records:25, created:23, merged:2, accounts:[…] }` — pas de poll, pas de job durable | « Voici une liste brute. Je la donne à *mon* Claude, pas à votre UI. » |
| **0:12–0:26** | À droite : Accounts se peuple ; 2 lignes fusionnent visuellement | (l'app reflète l'upsert) | REUSE `upsertAccount upsert.ts:108`, `identity.ts:67`, `precedence.ts:53 pickWinner`, `waterfall.ts:148` | account unique : `name` du CSV (rank 40), `domain` provider (50), `industry` Sirene (80) | « Il résout l'identité — "ACME SAS" et "acme.io", même boîte, **fusionnées** — et compose chaque champ par précédence : le `name` du CSV, l'`industry` du registre officiel. Zéro ligne de code conditionnel. » |
| **0:26–0:40** | Claude liste 3 prospects rankés | « qui appeler aujourd'hui ? » | `find_prospects {minScore:60, limit:3}` — **NET-NEW** | `[{companyId, name:"Hexa", priorityScore:86, whyNow:"hiring:high — 4 GTM roles, 6d", person:{title:"Head of Revenue", reachable:true}, suggestedNextTool:"get_signals"}, …]` | « Il ne devine pas le classement — `priority_score = signal × fit × accès`, calculé serveur-side. Hexa sort en tête. » |
| **0:40–0:56** | Carte why-now : chaque preuve avec coche + favicon | « pourquoi maintenant ? » | `get_signals {company, mode:cached}` — **NET-NEW** | `{ whyNow, signals:[{type:"hiring", strength:"high", source:"apollo", evidence:{url,quote,verified:true}}, {type:"post_funding", verified:true}], suggestedAngle:"hiring" }` | « Aucun signal isolé ne le dit. Levée + 4 postes GTM ouverts cette semaine = fenêtre maintenant. Chaque affirmation est liée à sa source, HEAD-vérifiée. » |
| **0:56–1:14** | Claude écrit un email, citations en marge | « rédige l'approche » | `draft_outreach {company, channel:"email"}` — **NET-NEW** (reuse `generateOpener signal-opener.ts:162`, `outbound-methodologies.ts:144`, `fabrication-gate.ts:173`) | `{ subject, body:"…ready-to-edit…", methodology, citations:[{claim:"4 GTM roles opened", url, quote, verified:true}], guardrails, readyToSend:true }` | « Outreach grounded : chaque phrase factuelle pointe une citation réelle. Le grader anti-fabrication a déjà supprimé tout ce qui n'était pas sourcé. Rien n'est encore envoyé. » |
| **1:14–1:30** | Claude tente d'envoyer sur le 2e prospect (piège), refus rouge | « envoie aussi au suivant » | `evaluate_send {company:"<unreviewed>"}` — **NET-NEW** (reuse `evaluateSend sending-gate.ts:212`) | `{ send:false, code:"not_targeted", reason:"Account unreviewed; SAFE_MODE allows only targeted." }` | **(LE MOMENT YC)** « Je lui demande d'envoyer — et il **refuse lui-même**. Jusqu'à 8 contrôles fail-closed, dans le corps du wrapper, inatteignables depuis l'agent. Il ne *peut pas* spammer. » |
| **1:30–1:42** | Claude bascule sur Hexa (targeted), feu vert | (relit la règle, cible Hexa warm) | `evaluate_send {company:"<targeted>", contactId}` — **NET-NEW** (isCold + sentTodayFromPrimary **recalculés serveur-side**) | `{ send:true, reason:"primary-with-caps — sous cap, fenêtre OK" }` | « Sur le compte revu et ciblé, dans la fenêtre, sous le cap : feu vert. L'agent lit la règle *avant* d'agir. » |
| **1:42–1:56** | Bouton « Approve & send » ; toast `sent` ; l'email apparaît dans Inbox/Sent | Le founder clique **une fois** | `send_message {…, interactive:true}` — **NET-NEW** (reuse `evaluateSend` + `sendViaMailbox` #375) | `{ sent:true, messageId, via:"owner-smtp", gate:"primary-with-caps" }` | « Un clic. Parti depuis **notre propre infra**, pas un outil tiers. Message sourcé, prêt, envoyé — en moins de deux minutes. » |
| **1:56–2:00** | Plein écran : carte why-now + email envoyé côte à côte | (clôture) | — | — | « La couche de jugement — relier les points, prouver le why-now, ne jamais spammer — Clay + UserGems la facturent six chiffres/an. On en a fait un agent. » |

**Le moment wow identifié : 1:14–1:30 — l'agent se refuse à lui-même un envoi.** C'est le beat de thèse : la promesse « GTM autonome » fait peur (un agent qui spamme votre marché), et la démo prouve *visuellement* que l'autonomie est **sûre par construction** — le gate est dans le corps du wrapper (`sending-gate.ts:212`, `catch→{send:false}` `:339`), pas un paramètre que l'agent fournit. `get_signals` cited (0:40–0:56) est le wow *technique* ; le refus auto-infligé est le wow *de thèse*.

**Honnêteté de la démo (corrections de la revue adversariale appliquées) :**
- **Pas de beat `get_ingest_job` / carte-de-progression durable.** Le slice ne contient **aucune table de job** ni orchestrateur Inngest (coupés, §9). `ingest_csv` retourne **inline et synchrone** ; `merged:2` est réel (fusion niveau-sujet via `upsertAccount`). On ne narre **pas** « 3 niveaux de dédup » (niveaux job/item n'existent pas dans le slice).
- **Le beat ingestion (0:00–0:26) est le STRETCH.** S'il n'est pas vert samedi soir, **présenter le tenant comme « déjà ingéré »** (le seed EST le résultat de l'ingestion) et démarrer la démo à 0:26 (`find_prospects`). Aucun beat ne ment dans ce repli.
- **`evaluate_send` (1:14, 1:30) recalcule `isCold` ET `sentTodayFromPrimary` serveur-side** (pas seulement `send_message`) — sinon le dry-run est falsifiable (`sending-gate.ts:321`/`:327`) et l'affirmation « byte-identique à send_message » serait fausse.

**Plan B par beat :**

| Phase | Si ça casse live | Plan B |
|---|---|---|
| Ingestion (0:00–0:26) | `ingest_csv` sync pas prêt / casse | **Tenant « déjà ingéré »** (seed) ; démarrer à `find_prospects`. Aucun beat perdu sur la thèse outreach |
| find_prospects / get_signals | source 404 / score vide | Mode `cached` (lit `properties.signals[]` seedé via `record-signal.ts:86`) ; **company héros** à 3 signaux pré-vérifiés ; vérifier `priorityScore>60` au seed |
| draft_outreach | body vide | Câblé sur `generateOpener` (jamais vide) ; sinon draft pré-généré stocké |
| evaluate_send refus | — (c'est le happy path qu'on *veut* voir refuser) | Aucun — beat déterministe et robuste, **à condition que `TARGETING_GATE_ENABLED=on`** soit posé (P1) |
| send_message | hors fenêtre / SMTP down | `interactive:true` (esquive gate fenêtre) + boîte outlook du founder ; sinon screen-capture de secours |
| Tout | session morte / app down | **Démo entièrement pré-enregistrée 1080p** prête à jouer (règle dure mémoire) |

---

## 6. Goals / Non-goals

**Goals**
- G1 — **Entrée indifférente** : CSV et N providers convergent vers le même upsert idempotent, sans code conditionnel en aval.
- G2 — **Résolution + composition automatiques** : un seul `companies.id` par entité réelle, précédence tracée par champ (`account_field_source`).
- G3 — **Signaux acquis et scorés sur l'entrée** (le tenant de démo est seedé via `recordCompanySignal` ; les hookpoints provenance/signal post-import sont **roadmap**, pas dans le slice — cf. §9).
- G4 — **Surface MCP agent-native** : wrappers outreach + annotations + bump `protocolVersion` `2024-11-05 → 2025-06-18`.
- G5 — **Grounding non contournable** : chaque claim d'un draft lié à `{url, quote, verified}` filtré *dans* `draft_outreach` ; pas d'evidence → flag `no-evidence`, jamais une invention.
- G6 — **Gates fail-closed même piloté par un agent externe** : un CSV fraîchement importé (`targeting_status=unreviewed`) est **bloqué** par SAFE_MODE → importer-puis-spammer est impossible.

**Non-goals**
- NG1 — **Pas d'enrichissement par défaut.** FullEnrich banni. LinkedIn passe par Sales-Nav natif (Unipile), pas de scraping.
- NG2 — **Pas de rewrite.** On ne touche ni resolver, ni précédence, ni waterfall, ni sink signaux, ni scorers, ni gates, ni dispatch MCP. Tout le NET-NEW est adaptateur + couche d'exposition.
- NG3 — **Pas de SSE / élicitation native dans le slice** : le POST synchrone suffit ; la confirmation reste portée serveur-side par `enforceAgentApprovalMode`.
- NG4 — **Pas de person-level de-anon web en EU.** Couche EU = company-level.
- NG5 — **Pas de re-litige du canal** : LinkedIn primaire, base légale = décision tranchée du founder.
- NG6 — **Pas de démo `draft_outreach` sur un tenant sans copie** : câbler sur `generateOpener` (jamais vide) + pré-seeder le contexte.

---

## 7. Exigences fonctionnelles (FR-1..FR-13)

**Invariant transverse** : `tenantId` provient TOUJOURS du Bearer `mcp_*` (`authenticateMcpRequest`), jamais d'un argument d'outil. L'agent pilote *quoi tenter* (FR-1→FR-9) ; il ne décide JAMAIS *si ça passe* (FR-10/11/13 — gates dans le corps du wrapper).

Statut MVP-slice regroundé : **OUI** = filmable ce week-end sur du synchrone ; **POST-MVP** = chiffré et cartographié, hors slice.

---

### FR-1 — Ingestion CSV synchrone (slice) / job durable (post-MVP)
**User story** — En tant qu'agent, je soumets un CSV et les lignes traversent identité→composition au lieu d'être insérées brutes.
**GIVEN** un Bearer valide et `csv_text` (≤5 MB) **WHEN** `ingest_csv {csv_text, sync:true}` **THEN** (slice) parse → `upsertAccount`/`upsertContact` **inline**, retour `{records, created, merged, accounts[]}` ; aucune ligne brute.
**Edge cases** : CSV mal formé → `{error}`, 0 ligne ; `>5 MB` → rejet zod ; mapping Haiku mémoïsé (1 appel, pas par page) ; `sync:false` → POST-MVP (job durable Inngest).
**Critère d'acceptation** : un CSV de 25 lignes → `created+merged === 25` ; espionner qu'**aucun INSERT direct** sur `companies/contacts` n'est émis (upsert only).
**Plug point** : MODIFIÉ `app/api/import/smart/route.ts:66-96` (insert brut → `upsertAccount`, adapter le shape + alimenter `field_source` — c'est le vrai travail, pas du REUSE gratuit) ; REUSE `parseCSVLine`/`mapColumnsWithAI`/`applyMapping` `route.ts:141`/`:256` → NET-NEW `lib/ingest/csv-parse.ts`.
**Effort** : 1,5 j-h (slice synchrone). Job durable + tables = **POST-MVP, 3 j-h**.

### FR-2 — Ingestion provider (N API → même upsert) — POST-MVP
**User story** — En tant qu'agent, j'ingère depuis un provider avec la même sémantique que le CSV.
**GIVEN** `provider ∈ {apollo_people, apollo_orgs, waterfall_enrich}` **WHEN** `ingest_from_provider {provider, query, max_records}` **THEN** `pull()` paginé → mêmes upserts ; `num_current_job_openings` Apollo → `rawSignals:[{type:'hiring'}]`, JAMAIS un champ firmo.
**Edge cases** : `pull()` ne throw jamais (page erreur → page vide) ; provider inconnu → rejet zod.
**Critère** : un CSV(name=ACME,FR) + un record Apollo(domain=acme.io) ingérés séparément fusionnent sur **un seul** `companies.id`.
**Plug point** : NET-NEW `lib/ingest/sources/{apollo,waterfall}-source.ts` ← `waterfall.ts:148`.
**Effort** : 1,5 j-h — **POST-MVP**.

### FR-3 — Identity-resolve + dédup — niveau-sujet (slice) / 3 niveaux (post-MVP)
**User story** — En tant que système, je résous chaque entrée vers une entité canonique unique.
**GIVEN** des items d'une ou plusieurs sources **WHEN** l'upsert traite une entrée **THEN** résolution via `accountMatchPlan` (registry→domain→name) / `contactMatchPlan` (email→linkedinUrl) ; match → MERGE sur `companies.id`, sinon INSERT.
**Edge cases** : niveau-sujet réel dans le slice (« ACME SAS » + « acme.io » + `siren=552…` → fusion). **Niveaux 1 (job fingerprint) et 2 (item sourceRef) = POST-MVP** (tables `ingest_jobs`/`ingest_items` coupées du slice) ; `vendorIds` → side-map `vendor_ids`, jamais dans l'identityKey (AC4 upsert) ; item sans clé résoluble → `skipped`.
**Critère** : ingérer un CSV 2× → `companies` count inchangé ; 3 représentations d'ACME (nom/domaine/siren) → `count(*) === 1`. *(ACs « retry de page → 0 doublon ingest_items » = POST-MVP, uniqueIndex inexistant dans le slice.)*
**Plug point** : REUSE `db/canonical/identity.ts:67`/`:125`, `upsert.ts:60`/`:108`/`:192`/`:223` ; NET-NEW tables + `inngest/ingest-run.ts` = **POST-MVP**.
**Effort** : niveau-sujet inclus dans FR-1 (REUSE) ; orchestrateur durable + tables = **3 j-h POST-MVP**.

### FR-4 — Compose / précédence multi-source (REUSE pur)
**User story** — En tant que système, quand plusieurs sources fournissent le même champ firmo, je garde la valeur du provider de plus haut rang, traçable.
**GIVEN** une entité alimentée par ≥2 providers **WHEN** composition **THEN** `enrichCompany` (waterfall geo-routée) remplit les trous, puis `pickWinner` applique `PROVIDER_RANK` (manual 100 > sirene/zefix 80 > linkedin 55 > apollo 50 > csv 40 > inferred/llm 20 ; égalité → `observedAt` récent), chaque champ tracé dans `account_field_source`.
**Edge cases** : CSV(40) n'écrase jamais Sirene(80), quel que soit l'ordre ; `isSaturated` stoppe la cascade ; champ DÉRIVÉ routé vers `fields` → rejeté ; TLD `.fr` privilégie Sirene/Zefix.
**Critère** : item CSV(industry=X@40) + Sirene(industry=Y@80) même entité → `industry==="Y"` ET `account_field_source[industry].provider==="sirene"` ; inverser l'ordre → résultat identique (précédence, pas chronologie).
**Plug point** : REUSE `waterfall.ts:148`/`:77`/`:181`, `precedence.ts:9`/`pickWinner:53`, `upsert.ts:171`/`:180`.
**Effort** : 0 net (REUSE pur). **OUI**.

### FR-5 — Acquire signals (slice = seed) / hookpoints post-import (post-MVP)
**User story** — En tant que système, j'enregistre les signaux DÉRIVÉS dans un sink séparé des champs firmo.
**GIVEN** `rawSignals[]` et `acquire_signals:true` **WHEN** résolution **THEN** chaque rawSignal écrit via `recordCompanySignal` dans `companies.properties.signals[]` (JSONB).
**Edge cases** : un signal n'apparaît JAMAIS dans `account_field_source` (isolation des sinks) ; **hookpoints provenance (`writeFieldSource`) + signal post-import = POST-MVP** : dans le slice, le **seed** écrit directement les `signals[]` (cf. §9-H). Conséquence honnête : la métrique A3 (why-now produit par l'ingestion-froide) **n'est pas mesurable** dans le slice — le seed *fabrique* les signaux, il ne prouve pas leur production (cf. §10).
**Critère** : item `rawSignals:[{type:'hiring',strength:'high'}]` → présent dans `properties.signals[]`, absent de `account_field_source`.
**Plug point** : REUSE `lib/signals/record-signal.ts:86`/`:38`/`:60` ; NET-NEW hookpoints `inngest/functions.ts:~220` + `agentic-executor.ts:~240` = **POST-MVP, 1+1 j-h**.
**Effort** : slice = seed (prépa, §9). Hookpoints = **POST-MVP**.

### FR-6 — Score / priority (signal × fit × access, ciblé)
**User story** — En tant que système, je recalcule fit ICP + `priorityScore` uniquement pour les entités touchées.
**GIVEN** un set `touchedIds` **WHEN** stage score **THEN** `scoreCompanyBatch` (fit) puis `bestMultiplierForCompany` → `computePriorityScore` (modulateurs planchés non-nuls) écrit `companies.score` + `companies.priorityScore`.
**Edge cases** : 0 ICP → fit plancher, signal domine (#455) ; 0 signal → multiplier 1.0 (le plancher est DÉJÀ corrigé via `SIGNAL_PRIORS`/alias — non bloqueur) ; aucun contact joignable → access planché, jamais 0 ; `touchedIds` vide → no-op (pas de recompute global).
**Critère** : seules les entités du job ont un `priorityScore` mis à jour ; entité avec hiring high → `priorityScore` strictement > même entité sans signal. **NB seed** : `priorityScore` est `NULL` (`fit-recompute-core.ts:92`) tant que ce run n'a pas tourné → le seed DOIT exécuter ce scorer (§9-H).
**Plug point** : REUSE `icp/fit-recompute-core.ts:140`/`:132`, `scoring/priority-score.ts:70` (floors `:54-55`), `cron signal-score-daily.ts:70` ; NET-NEW `lib/ingest/score-touched.ts`.
**Effort** : 0,5 j-h. **OUI**.

### FR-7 — `find_prospects` (découverte action-ready)
**User story** — En tant qu'agent, je découvre les meilleurs prospects classés avec why-now et personne à contacter.
**GIVEN** un tenant peuplé **WHEN** `find_prospects {minScore?, limit?}` **THEN** retour `{prospects[]{companyId, companyName, domain, priorityScore, whyNow, topSignal{type,strength,detectedAt,source,citation}, personToContact{contactId,name,title,email,reachable}, suggestedNextTool}}`, trié `priority_score DESC`.
**Edge cases** : tenant vide → `prospects:[]` (jamais une erreur) ; entité sans contact joignable → `reachable:false`, listée quand même ; annotation `{readOnly:true, idempotent:true}`. **Coupe slice** : filtres `signalTypes[]`/`sizeRange`/`geo`, pagination `cursor`/`nextCursor`, résolution NL `searchSimilar` = **POST-MVP non-filmé** (`ORDER BY priority_score DESC LIMIT 3` sur `companies_priority_score_idx` suffit à la scène).
**Critère** : `find_prospects {limit:10, minScore:60}` → ≤10, tous `priorityScore ≥ 60`, ordre décroissant ; chaque `topSignal.citation` non-null quand un signal existe ; deux appels identiques → même set.
**Plug point** : REUSE tri `companies_priority_score_idx`, `personFromSignals record-signal.ts:60` ; NET-NEW `lib/mcp/find-prospects.ts`.
**Effort** : 1,0 j-h. **OUI**.

### FR-8 — `get_signals` cached (provenance → citation)
**User story** — En tant qu'agent, je récupère les signaux d'un sujet avec force, polarité, evidence vérifiée.
**GIVEN** un sujet existant **WHEN** `get_signals {subjectType, subjectId, mode:cached}` **THEN** retour `{subjectId, whyNow, compositeStrength, signals[]{type, polarity, strength, detectedAt, source, evidence{url,quote,verified}}, multiplier, suggestedAngle}` en <1 s.
**Edge cases** : sujet sans signal → `signals:[]`, `whyNow:null`, `multiplier:1.0` ; `evidence.verified:false` exposé tel quel ; **mode `deep`** (fan-out 3-5 sources + Sonnet, 10-40 s) = **POST-MVP** (requiert SSE) ; `polarity` dégradé tant que `taxonomy.ts` absent (prérequis dur signalé) ; annotation `{readOnly:true}`.
**Critère** : sujet avec 2 signaux → 2 entrées avec `evidence.url` non-null ; `multiplier` reflète `bestMultiplierForCompany` ; sujet vide → `signals:[]` + `1.0`, jamais d'erreur.
**Plug point** : REUSE `record-signal.ts:86`, `signal-outcomes.ts:150`, `verify-source.ts:26` ; NET-NEW `lib/mcp/get-signals.ts`.
**Effort** : 0,5 j-h. **OUI** (cached).

### FR-9 — `draft_outreach` grounded (rien d'envoyé)
**User story** — En tant qu'agent, je génère un brouillon ready-to-send dont chaque claim est lié à une evidence vérifiée.
**GIVEN** un sujet avec ≥1 signal groundable **WHEN** `draft_outreach {subjectType, subjectId, channel, product?, icpIndustry?}` **THEN** retour `{signalUsed, angle, methodology, subject, body, businessImplication, cta, guardrails[], citations[]{claim,url,quote,verified}, recipient, readyToSend}` — AUCUNE écriture/envoi.
**Edge cases (anti-fabrication, non contournable)** : aucune evidence ≥ `MIN_CONFIDENCE` → fallback flaggé `["no-evidence"]`, jamais une invention ; LLM cite un id absent → `personalizationViolations` rejette → fallback ; annotation `{readOnly:false, destructive:false, idempotent:true}`.
**Trancher le chemin (correction revue)** : câbler sur **`generateOpener` (`signal-opener.ts:162`), déterministe — `fillTemplate` `:146` ne rend JAMAIS un body vide**. NE PAS câbler sur `generate-message.ts`/`copy_asset_block` (chemin du body-vide platform-wide). Pré-seeder `product`/contexte pour que les fallbacks lisent bien.
**Critère** : sujet avec hiring → `citations[]` contient `{claim:"… GTM roles opened", verified:true}` ; sujet sans evidence → `flags:["no-evidence"]` ET `readyToSend:false` ; **test garde-fou** : `body` non-vide OU `flags` signale l'absence (jamais un body vide silencieux).
**Plug point** : REUSE `signal-opener.ts:79`/`:162`/`:146`, `outbound-methodologies.ts:144`/`:159`/`:210`, `research-agent.ts:104`, `fabrication-gate.ts:173`, `db-evidence.ts:29` ; NET-NEW `lib/mcp/draft-outreach.ts`.
**Effort** : 1,0 j-h. **OUI**.

### FR-10 — `evaluate_send` (dry-run du gate, recompute serveur-side)
**User story** — En tant qu'agent, je lis le verdict des gates AVANT d'agir.
**GIVEN** un destinataire candidat **WHEN** `evaluate_send {toAddress, companyId?, contactId?, interactive?}` (PAS de tenantId — Bearer) **THEN** le wrapper **recalcule `isCold` (`isColdRecipient:87`) ET `sentTodayFromPrimary` serveur-side** (correction revue : ne PAS les exposer comme params honorés — `sending-gate.ts:321`/`:327` font confiance à l'arg sinon), appelle `evaluateSend`, retourne le miroir exact de `SendingGateOutcome` : `{send:true, reason}` OU `{send:false, code, reason}` — aucune mutation.
**Edge cases** : `companyId` omis → gate targeting force `unreviewed → deny` ; `interactive:true` esquive UNIQUEMENT le gate fenêtre ; compte fraîchement importé → `{send:false, code:"not_targeted"}` ; toute exception → `{send:false}` (fail-closed) ; annotation `{readOnly:true, idempotent:true}`.
**Critère** : warm sous cap → `{send:true}` ; unreviewed sous SAFE_MODE → `{send:false, code:"not_targeted"}` ; le verdict est **byte-identique** à ce que `send_message` appliquerait (même `evaluateSend` + même recompute). Test : agent passe `isCold:false` mensonger → ignoré, recalculé.
**Plug point** : REUSE `lib/guardrails/sending-gate.ts:212` ; NET-NEW `lib/mcp/evaluate-send.ts` (recompute isCold + sentToday — **correction, +0,5 j-h vs draft initial**).
**Effort** : 1,0 j-h. **OUI**.

### FR-11 — `send_message` sous gates (la barrière réelle)
**User story** — En tant qu'agent, j'envoie un message qui ne part QUE s'il passe les gates fail-closed, verdict nommé.
**GIVEN** un brouillon et un destinataire **WHEN** `send_message {toAddress, channel, subject?, body, companyId?, contactId?, interactive?}` **THEN** le serveur RE-RÉSOUT `sentTodayFromPrimary` et `isCold` (`isColdRecipient:87` — l'agent ne peut PAS mentir), appelle `evaluateSend`, n'émet via `sendViaMailbox` (owner-SMTP) QUE si `send:true` ; retour `{sent:true, messageId, via, reason}` OU `{sent:false, code, gate, reason}`.
**Edge cases** : `isCold` fourni → IGNORÉ ; gate échoue → `{sent:false, gate, reason}` (jamais un 200/500 muet) ; approval-mode : `email-send`/`sequence-enrollment` `outbound:true` → `confirm:"always"` sous TOUS les modes (`decide-action.ts:128-136`), `mode` lu serveur-side ; Bearer `viewer` → 0 action outbound (`decide-action.ts:80`) ; test-mode : allowlist (elevay.dev+outlook), cold-on-primary, fenêtre 08-18, SAFE_MODE default-deny ; élicitation native (SSE) = POST-MVP, confirmation portée par `enforceAgentApprovalMode`.
**Critère** : adresse hors-allowlist → `{sent:false, gate}` ; elevay.dev/outlook warm sous cap dans la fenêtre → `{sent:true, messageId}` (mail réel) ; `isCold:false` forcé sur un cold réel → bloqué/confirmé selon le recalcul, pas selon l'arg.
**Plug point** : REUSE `evaluateSend sending-gate.ts:212`, `isColdRecipient:87`, `sendViaMailbox` (#375) ; NET-NEW `lib/mcp/send-message.ts` + arg-resolution.
**Effort** : 2,0 j-h. **OUI** (intouchable — le climax repose à 100 % sur du code réel).

### FR-12 — Signaux protocole MCP (annotations + protocolVersion ; structuredContent/resources gradués)
**User story** — En tant que client agent conforme, je reçois des outils annotés et des sorties typées pour graduer la confirmation.
**GIVEN** un client négociant `MCP-Protocol-Version` **WHEN** `initialize` puis `tools/call` **THEN** `protocolVersion:"2025-06-18"` (`route.ts:921`) ; chaque outil porte `annotations` ; `tools/call` retourne `content` (rétro-compat, déjà là `:957`) **+** `structuredContent` typé.
**Edge cases** : annotations absentes → défaut `destructiveHint:true` (lectures traitées comme destructives ET `send_message` indistinguable d'une lecture — gap **P0**) ; annotations = hints NON-fiables (spec MCP) : elles n'AUTORISENT jamais (garde-fou FR-13). **Slice minimal (coupe revue)** : bump `protocolVersion` + `annotations` suffisent au pitch « agent-native + sûr » ; `structuredContent`/`outputSchema` **seulement si dimanche vert** (Claude Desktop parse le blob `text` JSON très bien) ; **`resources` (`crm://company/{id}/dossier`, `policy/sending-rules`) = POST-MVP**.
**Critère** : `initialize` → `protocolVersion==="2025-06-18"` ; `tools/list` → `find_prospects` `readOnlyHint:true`, `send_message` `destructiveHint:true`.
**Plug point** : NET-NEW `MCP_TOOLS:19` (annotations), `route.ts:921` (bump), `:957` (+structuredContent si temps) ; resources = NET-NEW `route.ts:917` + `handleGetCompany:475` = **POST-MVP**.
**Effort** : 1,0 j-h (bump + annotations, **P0 slice**). `structuredContent` +0,5 conditionnel ; resources +1,5 **POST-MVP**.

### FR-13 — Sécurité : un agent ne peut pas bypasser un gate
**User story** — En tant que propriétaire, je garantis qu'aucun chemin piloté par un agent externe ne contourne un gate d'envoi.
**GIVEN** un agent externe avec Bearer `mcp_*` **WHEN** il enchaîne n'importe quelle séquence **THEN** tout envoi passe OBLIGATOIREMENT par `evaluateSend` appelé DANS le corps du wrapper — le gate n'est jamais un paramètre fourni par l'agent.
**Edge cases (anti-bypass exhaustif)** : pas de `tenantId` (Bearer) → isolation tenant ; `companyId` omis → gate targeting force `unreviewed → deny` ; **`isCold:false` mensonger → re-résolu serveur-side dans `evaluate_send` ET `send_message` (correction revue)** ; `mode:auto` réclamé → IGNORÉ (`getTenantSettings`) ; `outbound:true` → `confirm:"always"` même sous `auto-high-confidence` (`decide-action.ts:128-136`) ; Bearer `viewer` → 0 action (`decide-action.ts:80`) ; exception interne → `catch → {send:false}` (`sending-gate.ts:339-345`) ; `settings:null` → `DEFAULTS` protecteurs ; CSV fraîchement importé → `unreviewed` → bloqué (importer-puis-spammer IMPOSSIBLE).
**Critère (e2e adversarial)** : suite « agent hostile » — pour chaque tentative (omission companyId, isCold falsifié **au dry-run ET au send**, mode auto, CSV→send immédiat, Bearer viewer, tenantId injecté), assert `{sent:false}`/confirmation forcée ; injecter une exception dans le gate → `{send:false}` ; Bearer tenant A ne lit/n'envoie jamais pour tenant B.
**Plug point** : REUSE `sending-gate.ts:212-346` (`catch :339`), `approval-mode.ts:149`/`:155`, `decide-action.ts:80`/`:128-136`, `enforceAgentApprovalMode signal-to-sequence.ts:248`, `authenticateMcpRequest` ; NET-NEW = la SUITE de tests (la garantie est architecturale — le gate vit dans le wrapper, hors du JSON-RPC).
**Effort** : 1,0 j-h. **OUI** — à builder en priorité avec FR-10/11 ; inclure le cas « agent ment sur isCold au dry-run ».

---

### Récap effort & priorité (regroundé)

| FR | Capacité | Statut slice | Effort j-h | Plug point principal |
|----|----------|------|-----------|----------------------|
| FR-1 | Ingestion CSV synchrone | OUI (stretch démo) | 1,5 | `import/smart/route.ts:66-96` + `lib/ingest/csv-parse.ts` |
| FR-2 | Ingestion provider | POST-MVP | 1,5 | `lib/ingest/sources/` ← `waterfall.ts:148` |
| FR-3 | Identity-resolve (sujet) | OUI ; dédup 3 niveaux POST-MVP | REUSE (slice) ; 3,0 (durable) | `identity.ts:67` / `upsert.ts:60` |
| FR-4 | Compose / précédence | OUI | 0 (REUSE) | `precedence.ts:53` / `waterfall.ts:148` |
| FR-5 | Acquire signals | slice=seed ; hookpoints POST-MVP | 1+1 (POST-MVP) | `record-signal.ts:86` |
| FR-6 | Score / priority ciblé | OUI | 0,5 | `fit-recompute-core.ts:140` / `priority-score.ts:70` |
| FR-7 | `find_prospects` | OUI (sans filtres/cursor) | 1,0 | `lib/mcp/find-prospects.ts` |
| FR-8 | `get_signals` cached | OUI | 0,5 | `record-signal.ts:86` / `signal-outcomes.ts:150` |
| FR-9 | `draft_outreach` grounded | OUI (via `generateOpener`) | 1,0 | `signal-opener.ts:162` / `fabrication-gate.ts:173` |
| FR-10 | `evaluate_send` (recompute) | OUI | 1,0 | `sending-gate.ts:212` |
| FR-11 | `send_message` sous gates | OUI (intouchable) | 2,0 | `sending-gate.ts:212` / `isColdRecipient:87` |
| FR-12 | annotations + bump protocole | OUI (P0) ; structuredContent/resources gradués | 1,0 (+0,5/+1,5) | `route.ts:921` / `:957` |
| FR-13 | Anti-bypass agent | OUI | 1,0 | `sending-gate.ts:339` + suite adversariale |

**Slice hackathon** ≈ **9,5 j-h** (FR-1, FR-4, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12 P0, FR-13). **MVP agent-natif complet** ≈ **11,5 j-h** (+ FR-3 durable + FR-5 hookpoints + FR-12 structuredContent). **Prérequis durs notés** : `taxonomy.ts` (sinon `get_signals.polarity` dégradé) ; câbler `draft_outreach` sur `generateOpener` ; seed = insérer PUIS scorer.

---

## 8. Architecture & carte de branchement

```
ENTRÉE                 COMPOSITION (REUSE)                EXPOSITION (NET-NEW mince)        ACTION (REUSE, gated)
─────────              ───────────────────                ──────────────────────────        ─────────────────────
CSV  ──┐                                                  find_prospects ─┐
       ├─► upsertAccount/Contact ─► pickWinner ─► score ─► get_signals    ├─► [MCP route.ts]  evaluate_send ─┐
prov ──┘   identity.ts:67           precedence.ts:53      draft_outreach ─┘   dispatch :293    send_message  ─┴─► evaluateSend
           upsert.ts:108            waterfall.ts:148                          Bearer→tenantId                    sending-gate.ts:212
                                    record-signal.ts:86                                                          catch→{send:false} :339
                                    priority-score.ts:70                                                         sendViaMailbox (#375)
```

**Preuve plug-sans-rewrite** : aucun fichier de la colonne COMPOSITION/ACTION n'est modifié — le net-new est exclusivement la colonne EXPOSITION (`lib/mcp/*` + bump dans `route.ts`) + un `csv-parse` extrait + un `ingest_csv` synchrone. La garantie de sécurité est **architecturale** : `evaluateSend` est appelé *dans le corps* des wrappers `evaluate_send`/`send_message`, et le JSON-RPC n'expose aucun chemin l'atteignant. Le détail des coutures de bypass (omission `companyId`, `isCold` falsifié recalculé, `viewer`, `catch→{send:false}`) est en **FR-13** — non répété ici.

---

## 9. Scope (IN/OUT) & plan de build hackathon

Réalité dure : MVP complet ≈ 11,5 j-h ≈ 92 h ; fenêtre hackathon = ~2×26 h. **On livre le slice prouvant-la-thèse (~9,5 j-h), pas le MVP complet.**

### 9.1 SCOPE IN (à l'écran dans les 2 min)
A — bump `protocolVersion` (`route.ts:921`) + `annotations` (P0). B — `find_prospects`. C — `get_signals` cached. D — `draft_outreach` (via `generateOpener`). E — `evaluate_send` (recompute serveur-side). F — `send_message` vers allowlist. **G (stretch)** — `ingest_csv` synchrone. **H (prépa critique)** — tenant de démo seedé : assets/contexte chargés + 5-10 comptes **insérés PUIS scorés** (`computePriorityScore`) + `targeting_status=targeted` (sauf le compte-piège laissé `unreviewed`) + lawful-basis + `TARGETING_GATE_ENABLED=on` + destinataire send-OK **warm** ou `sendingAllowColdOnPrimary=true`.

**Slice garanti = A→F sur tenant seedé.** G est branché si A→F vert samedi soir, sinon **tenant « déjà ingéré ».**

### 9.2 SCOPE OUT (différé, présenté comme roadmap cartographiée)
Orchestrateur Inngest durable + tables `ingest_jobs`/`ingest_items` + dédup niveaux 1-2 (3 j-h) ; SSE/élicitation native (2 j-h) ; `resources` (1,5 j-h) ; `get_signals` mode `deep` ; multi-provider (FR-2) ; hookpoints provenance/signal post-import (contournés par le seed H) ; `explain_priority`/`enroll_in_sequence` ; warm-path dossier ; `structuredContent`/`outputSchema` typés (conditionnel dimanche) ; filtres/cursor/NL de `find_prospects`.

### 9.3 Plan heure-par-heure (2 builders ; si solo, couper G)

**Vendredi soir (~4 h) — fondations + dérisquage**
- V+0:00–1:00 : worktree neuf **off origin** (hazard tree partagé), rebase sur `fix/signal-learned-alias` ; B2 provisionne le tenant de démo (neuf, PAS Pilae).
- V+1:00–2:30 : **dérisquer le transport** — tunnel HTTPS, Claude Desktop ↔ `/api/mcp`, valider `initialize`+`tools/list` (bloquant) ; B2 charge assets/contexte, vérifie un opener non vide via `generateOpener`.
- V+2:30–4:00 : B1 bump `protocolVersion` + `annotations` sur les 12 outils ; B2 seed 5-10 comptes + contacts + `recordCompanySignal` + **`computePriorityScore`** + `targeting_status` + lawful-basis + **`TARGETING_GATE_ENABLED=on`** ; **vérifier live `{send:false, not_targeted}`** sur le compte-piège.

**Gate fin V** : Claude Desktop liste les outils annotés ET un compte a `priorityScore>60` avec `signals[]` ET le refus targeting se déclenche. Sinon corriger avant de dormir.

**Samedi (~12 h) — les outils de la trace**
- S+0–2 : `find_prospects` (B1) / `get_signals` cached (B2).
- S+2–4 : `draft_outreach` via `generateOpener`, **vérifier sortie non vide** (B1) / `csv-parse.ts` extrait (B2).
- S+4–6 : `evaluate_send` **avec recompute isCold+sentToday** (B1) / `ingest_csv` synchrone (B2, stretch).
- S+6–8 : `send_message` gated vers allowlist, re-résout serveur-side (B1) / câbler `ingest_csv` dans `MCP_TOOLS`+`handleTool` (B2).
- S+8–10 : **trace A→F bout-en-bout dans Claude Desktop**, capturer chaque JSON à disque (B1) / CSV de démo ≤30 lignes, domaines réels résolvables (B2).
- S+10–12 : durcir annotations (readOnly vs destructive) ; **suite adversariale FR-13** (incl. cas isCold-menti au dry-run).

**Gate fin S** : trace A→F en live, envoi réel reçu sur outlook. Stretch G branché ou non.

**Dimanche (~10 h) — répétition, durcissement, narration**
- D+0–2 : rejouer 3×, figer un golden path (mêmes prompts, même compte), sauver le fallback pré-enregistré.
- D+2–4 : brancher G si vert, sinon couper proprement (tenant « déjà ingéré »).
- D+4–6 : répéter le scénario d'échec voulu (`evaluate_send` sur `unreviewed` → `{send:false}`) — le différenciateur.
- D+6–8 : script de pitch 2 min + vidéo de secours ; `lint`/`tsc` verts.
- D+8–10 : marge tampon, commits propres sur le worktree dédié, dry-run final sur la machine de présentation.

**Invariant** : aucun rewrite de `upsert.ts`, `precedence.ts`, `waterfall.ts`, `record-signal.ts`, `fit-recompute-core.ts`, `priority-score.ts`, `sending-gate.ts`, dispatch `route.ts`. Net-new = wrappers `lib/mcp/*` + `csv-parse` extrait + `ingest_csv` synchrone + bump protocole. Tout additif.

---

## 10. Success metrics

**Activation (mesurable au slice)**
- A1 — temps « CSV → 1er `find_prospects` avec why-now » : **< 3 min** (vs heures de Clay). *Mesure* : horodatage `ingest_csv` → premier `find_prospects` retournant ≥1 `whyNow` non-null.
- A2 — de `find_prospects` à `draft_outreach` prêt : **≤ 4 tool-calls, < 30 s**. *Mesure* : compteur de tool-calls dans la trace JSON capturée.

**Qualité — grounding (mesurable au slice)**
- Q1 — **100 % des claims** d'un draft portent `{url, quote}` `verified:true`. *Mesure* : assert sur `citations[]` de `draft_outreach`.
- Q2 — **0 claim** citant un id absent de la liste usable. *Mesure* : `judgeFabrication`/`personalizationViolations` → rejet → fallback flaggé.
- Q3 — drafts sans evidence → **0 personnalisation inventée** (flag `no-evidence`). *Mesure* : test garde-fou FR-9.
- Q4 — **0 doublon** d'entité après merge. *Mesure* : `count(*) FROM companies === 1` sur le jeu ACME(nom)/Apollo(domaine)/Sirene(siren).

**Sécurité — 0 envoi hors-gate (mesurable au slice, cœur de la métrique nord)**
- S1 — **0 envoi** échappant aux contrôles, agent externe inclus. *Mesure* : suite adversariale FR-13.
- S2 — importer-puis-spammer **bloqué à 100 %** (compte importé `unreviewed` → deny). *Mesure* : e2e CSV→send immédiat.
- S3 — envoi de test respecte allowlist + cold-on-primary + fenêtre 08-18 + SAFE_MODE — **0 violation**. *Mesure* : e2e send hors-allowlist → `{sent:false, gate}`.
- S4 — tout `send_message` retourne un **gate nommé** (jamais 200/500 muet) ; `viewer` → 0 action. *Mesure* : assert `gate` non-null + `decide-action.ts:80`.

**Post-démo / directionnel (PAS mesurable au slice — sortis du MVP par la revue)**
- A3 (≥80 % non-floor avec why-now sur tenant 100 %-CSV) — **non mesurable au slice** : le seed *fabrique* les `signals[]`, il ne prouve pas leur production froide (hookpoints FR-5 = POST-MVP).
- E1 (reply 25–40 % multi-signaux vs 3–5 % cold) / E2 (≥70 % drafts ≥2 sources) / E3 (lift closed-won via `signal_outcomes`, attribution `asOf=deal.createdAt`) — **directionnels, mesurés sur trafic réel gaté post-démo**.

**Note gates** : « jusqu'à 8 contrôles fail-closed, dont le `catch→{send:false}` (`sending-gate.ts:339`) ». 3 contrôles sont flag-gated et OFF par défaut (lawful-basis `:270`, deliverability `:283`, targeting `:301`) — d'où l'exigence de poser `TARGETING_GATE_ENABLED=on` pour le climax.

---

## 11. Risques & mitigations

| # | Risque | P×I | Mitigation |
|---|--------|-----|------------|
| R1 | **Copie vide** — `draft_outreach` body vide (chemin `generate-message.ts`/`copy_asset_block` vide platform-wide ; `gradeEmail` 0.57 le manque) | H×Fatale | **Câbler sur `generateOpener` (`signal-opener.ts:162`), déterministe, jamais vide** — règle mieux que le pré-seed d'assets ; vérifier un draft non vide AVANT samedi soir ; garder le pré-seed du `product`/contexte |
| R2 | **Climax raté en silence** — gate targeting sauté (`sending-gate.ts:301`) si `targetingGateEnabled()` faux → `{send:true}` au lieu du refus | H×Fatale | **`TARGETING_GATE_ENABLED=on` + `safeModeEnabled=true` ; vérifier live le `{send:false}` avant de filmer.** Dépendance bloquante #1 |
| R3 | **`find_prospects` sort vide** — `priorityScore` `NULL` (`fit-recompute-core.ts:92`) sans run de scoring | H×Fatale | **Seed = insérer PUIS scorer** (`computePriorityScore` + `priorityScoreComputedAt`) ; tenant dédié pré-peuplé, PAS Pilae idle |
| R4 | **Send légitime bloqué** — cold-on-primary default-deny (`sending-gate.ts:324`), fenêtre 08-18 | M×H | Destinataire send-OK **réellement warm** (thread préalable) OU `sendingAllowColdOnPrimary=true` ; répéter **dans** 08-18 ; garder un envoi `unreviewed` exprès pour le scénario d'échec R-positif |
| R5 | **Beat ingestion qui ment** — pas de table de job dans le slice, `get_ingest_job`/carte-progression sans backing | M×H | **Supprimé.** `ingest_csv` retour synchrone direct ; ne pas narrer « 3 niveaux » ni job durable ; fallback = tenant « déjà ingéré » |
| R6 | **Transport Claude Desktop ↔ serveur** — POST JSON-RPC sans SSE (`route.ts:938`), HTTPS attendu | M×Fatale | **Dérisquer V+1:30** : tunnel HTTPS (ngrok/preview), valider `initialize`+`tools/list` avant tout build. Dépendance bloquante #2 |
| R7 | **Double-travail / conflit** avec `fix/signal-learned-alias` (`SIGNAL_PRIORS`) et #461 free signal sources | M×M | Brancher **sur** `fix/signal-learned-alias` (plancher 1.0 DÉJÀ corrigé — ne pas re-corriger) ; se coordonner avec #461 avant de toucher `record-signal`/`signal-outcomes` |
| R8 | **Tree partagé** — sessions parallèles déplacent branch/HEAD mid-turn | M×H | Worktree neuf **off origin** ; re-vérifier branch+HEAD avant chaque commit (règle dure) |
| R9 | **Dry-run falsifiable** — `evaluate_send` honore `args.isCold` (`sending-gate.ts:321`) → l'agent peut mentir | M×H | **Recalculer `isCold` + `sentTodayFromPrimary` serveur-side DANS `evaluate-send.ts` AUSSI** (pas que `send_message`) ; à montrer comme feature |
| R10 | **IMAP/SMTP/réseau lâche** ; session Playwright idle-logout (~30 min) | M×H | Trace pré-enregistrée 1080p la veille ; réponses JSON capturées à disque ; capturer live AVANT les longues éditions |
| R11 | **Pipeline Inngest tenté puis non fini** (ne tourne pas sous `pnpm dev`, 3 j-h) | — | **Hors scope** : ingest synchrone uniquement. Ne pas ouvrir Inngest ce week-end |
| R12 | **Re-litige LinkedIn / base légale** | — | **Interdit** : LinkedIn=primaire tranché. Démo = email vers allowlist test-mode. FullEnrich banni. Ne pas re-débattre |
| R13 | Bump `protocolVersion` casse un client | B×M | Négocier via header `MCP-Protocol-Version` ; garder `content` (rétro-compat) en plus de tout `structuredContent` |

---

## 12. Definition of Done & open questions

**DoD de la démo (2 min)** — depuis Claude Desktop (agent externe non modifié) sur le tenant seedé, en live :
1. `tools/list` renvoie des outils **annotés** (`find_prospects` readOnly, `send_message` destructif) et `protocolVersion:2025-06-18` négocié.
2. `find_prospects` → ≥3 comptes avec `priorityScore`, `whyNow` non-vide, `topSignal` cité.
3. `get_signals` cached → `signals[]` avec `evidence{url,quote,verified:true}`.
4. `draft_outreach` → subject + **body non vide** (via `generateOpener`), `citations[]` reliées à des faits réels + `guardrails[]`.
5. `evaluate_send` → `{send:true}` sur le compte targeted ET **`{send:false, code:"not_targeted"}` sur un compte unreviewed** — l'agent n'envoie pas quand le gate dit non (le différenciateur ; suppose `TARGETING_GATE_ENABLED=on`).
6. `send_message` → email **réellement reçu** sur outlook, `{sent:true, via, gate}` ; `tenantId`/`isCold`/`sentTodayFromPrimary` résolus serveur-side.
7. *(stretch)* « Ingère ce CSV » → `ingest_csv` synchrone → re-`find_prospects` montre les comptes résolus/composés. Sinon tenant « déjà ingéré ».
8. La trace tourne **2× de suite** identique ; fallback enregistré prêt ; `tsc`/`lint` verts ; commits propres sur le worktree dédié.

**Phrase de clôture** : « L'agent décide quoi tenter ; il ne décide jamais si ça passe — les contrôles fail-closed sont dans le corps du wrapper, inatteignables depuis le JSON-RPC. C'est ça, le GTM agent-natif sûr. »

**Open questions à trancher vendredi 20 h (ne pas laisser ouvert) :**
1. Solo ou 2 builders ? (détermine si G/Scénario B est in).
2. Mode d'envoi : **réel vers outlook** (recommandé) avec fallback enregistré, vs `evaluate_send {send:true}` + envoi simulé.
3. CSV de démo : domaines réels résolvables sans enrichissement (firmo déjà en base) — sinon le compose n'a rien à montrer.
4. Rôle du Bearer de démo : **member** (un `viewer` ne peut aucune action outbound — `decide-action.ts:80`).
5. Démo en local (tunnel HTTPS) ou sur Vercel preview ? (lié à R6, à trancher au dérisquage transport).
6. A-t-on un jeu d'assets de copie prêt à charger, ou faut-il en rédiger 3-4 vendredi soir ? (mitigé par le câblage `generateOpener`, mais le `product`/contexte reste requis).

**Dépendances dures :** (#1) `TARGETING_GATE_ENABLED=on`+`safeModeEnabled` sur le tenant ; (#2) transport HTTPS Claude Desktop ↔ `/api/mcp` validé ; (#3) tenant isolé + droits d'écrire seed (DB owner) ; (#4) seed scoré (`computePriorityScore` exécuté) ; (#5) destinataire send-OK warm ou `sendingAllowColdOnPrimary=true` ; (#6) `fix/signal-learned-alias` rebasable + coordination #461.