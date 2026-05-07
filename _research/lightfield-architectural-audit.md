# Audit Architectural Chirurgical : Lightfield CRM

**Date**: 2026-05-05
**Sources**: System prompt leake (24 tools), REST API docs (44 endpoints), SDK v0.6.0-alpha,
trial account deep teardown, 8 blog posts (Mar-May 2026), chat intelligence forensics,
SaaStr gap analysis, Lightfield extraction data.

---

## 1. LE GRAPHE D'INTERDEPENDANCES

Lightfield n'est pas une collection de features. C'est un **systeme de systemes**
ou chaque couche alimente les autres. Retirer une couche degrade toutes les couches
en aval. Voici le graphe complet :

```
                    EMAIL / CALENDAR SYNC (OAuth)
                         |
                         | raw emails, meetings, transcripts
                         v
              +-----------------------+
              |    CONVERSATION       |
              |    CORPUS             |  <-- stockage brut des conversations
              |    (per-account)      |
              +-----------+-----------+
                          |
            +-------------+-------------+
            |                           |
            v                           v
   AUTO-ENRICHMENT              EMBEDDING / RAG
   (on $website)                (askAccountQuestionArray)
            |                           |
            v                           v
   +------------------+    +-------------------+
   | STRUCTURED       |    | <Account> TAGS    |
   | FIELDS           |    | (context window   |
   | ($industry,      |    |  injection)       |
   | $howTheyMakeMoney|    +--------+----------+
   | $accountStatus)  |             |
   +--------+---------+             |
            |                       |
            +----------+------------+
                       |
                       v
              TABLE SNAPSHOTS
              (pre-loaded dans le system prompt)
                       |
                       v
           +-----------+-----------+
           |   AGENT CONTEXT       |
           |   LAYER               |  <-- 3 couches fusionnees :
           |   1. Table snapshots  |      snapshots + <Account> + RAG
           |   2. <Account> XML    |
           |   3. RAG on-demand    |
           +-----------+-----------+
                       |
         +-------------+-------------+
         |             |             |
         v             v             v
    KNOWLEDGE     24 TOOLS       SKILLS
    LAYER         (query +       (prompt
    (business     create +       templates
    context)      update +       avec steps/
                  utility)       constraints)
         |             |             |
         +------+------+------+-----+
                |             |
                v             v
        CONFIRMATION     PROCESS
        CARDS            TRANSPARENCY
        (approval)       (tool call logs)
                |             |
                v             v
           +----+-------------+----+
           |   USER TRUST          |
           |   SURFACE             |
           |   (graduated          |
           |   autonomy)           |
           +-----------------------+
```

---

## 2. LES 7 COUCHES ARCHITECTURALES

### Couche 0 : DATA CAPTURE (fondation invisible)

**Ce que c'est** : Email OAuth (Google + Microsoft), Calendar sync, backsync 24 mois.

**Pourquoi c'est la fondation** : Sans donnees de conversation, `askAccountQuestionArray`
retourne du vide. Les AI-generated fields (`$howTheyMakeMoney`, account summary) n'ont
rien a synthetiser. Les Skills produisent du generique. Les proposals sont creux.

**Ce que Lightfield fait** :
- Settings > Mail and Calendar : configuration AVANT l'OAuth (choix de privacy/scope)
- `autoCreateRecords` : quand un meeting contient un attendee externe inconnu, cree
  automatiquement un Contact + tente de matcher/creer un Account depuis le domain email
- Backsync : 1/3/6/12/24 mois au choix
- Selective sync : "Records created only from emails you sent and meetings you organized"
- Do-not-track : domains/emails exclus du sync
- Meetings page : READ-ONLY, pas de creation manuelle. Les meetings viennent du calendar.

**Interdependance critique** : La conversation corpus alimente DIRECTEMENT :
- `askAccountQuestionArray` (RAG queries sur le corpus per-account)
- `<Account>` tags (injection dans le context window)
- AI-generated fields (`$howTheyMakeMoney` est synthetise depuis conversations + web)
- Table snapshots (les stats comme "last interaction" viennent du corpus)

**Etat Elevay** :
- Gmail OAuth : OUI
- Microsoft OAuth : NON (Azure app registered mais pas wire)
- Calendar sync : NON
- Backsync 24 mois : OUI (implementee)
- Auto-create records from email : PARTIEL (contacts oui, accounts depuis domain non)
- Do-not-track : NON
- Privacy settings pre-OAuth : NON

**Gap critique** : Sans calendar sync, on perd les meetings. Sans meetings, pas de
meeting prep, pas de post-meeting follow-up, pas de transcript processing. C'est la
moitie du corpus de conversations qui manque.

---

### Couche 1 : CONTEXT COMPOSITION (le coeur invisible)

**Ce que c'est** : Le mecanisme par lequel l'agent voit le monde CRM.

**Architecture 3 couches** (revele par le system prompt leake) :

#### 1a. Table Snapshots (passif, pre-charge)

Avant meme de recevoir le message utilisateur, le system prompt injecte des **tables
CSV** de l'ensemble du CRM : accounts, opportunities, contacts, tasks, meetings, notes.

Le system prompt dit : "the above table snapshots" -- ce qui signifie que des snapshots
tabulaires sont injectees en haut du prompt.

**Pourquoi c'est critique** : L'agent peut repondre a "combien de deals ai-je ?" sans
aucun tool call. La reponse est dans le prompt. Ca rend les reponses simples instantanees.

**Limite** : Le prompt dit aussi "table snapshots are potentially incomplete or outdated",
ce qui implique que pour les gros CRM les snapshots sont tronquees (pagination ou
selection). L'agent est instruit de "consider checking additional accounts and entities."

#### 1b. `<Account>` XML Tags (passif, contextuel)

Quand l'utilisateur est sur une page de detail d'un account, ou quand le chat est scoped
a un account, le contenu complet de cet account est injecte via des tags XML `<Account>`.

Le system prompt dit : "If account information is already provided in the context
(e.g., within <Account> tags), do not call the askAccountQuestionArray tool -- it does
not have access to any additional information beyond what is already available in the
context."

**Ce que ca contient** (infere depuis les tools et le comportement observe) :
- Toutes les proprietes de l'account (system + custom fields)
- Les contacts lies
- Les opportunities liees
- Les meetings recents avec summaries
- Les notes liees
- L'historique d'activite recent
- Les emails recents (sujets, extraits)

**Pourquoi c'est critique** : C'est ce qui permet "tell me about this person" sur une
page de detail. Le contexte est DEJA dans le prompt -- zero latence de retrieval.

#### 1c. RAG via `askAccountQuestionArray` (actif, on-demand)

Quand les snapshots et les `<Account>` tags ne suffisent pas, l'agent appelle
`askAccountQuestionArray(crmAccountIds, question)`.

**Parametres** :
- `crmAccountIds` : array d'IDs account -- peut querier PLUSIEURS accounts en parallele
- `question` : question en langage naturel

**Ce que ca fait** : Query le corpus de conversations de l'account (emails, transcripts,
notes) via RAG (embeddings + retrieval). Retourne les passages pertinents.

**Pourquoi c'est critique** : C'est le seul moyen d'acceder au contenu profond des
conversations. Les snapshots ont les metadata (date, sujet), mais le RAG a le texte
complet.

**Etat Elevay** :
- Table snapshots : OUI (system prompt injecte un CRM snapshot avec counts + recent records)
- `<Account>` XML tags : NON (pas d'injection contextuelle par page)
- RAG per-account : PARTIEL (searchSimilar existe mais pas scope par account)
- Multi-account RAG : NON

**Gap critique** : On n'injecte pas le contexte complet de l'entite courante dans le
prompt. Quand un utilisateur est sur la page d'un account et dit "resumer cette entreprise",
notre agent doit faire des tool calls pour retriever les donnees. Lightfield a deja tout
dans le prompt.

---

### Couche 2 : LES 24 TOOLS (le catalogue d'actions)

**Repartition par categorie** :

#### Query / Retrieval (10 tools)

| Tool | Ce qu'il fait | Pattern |
|------|---------------|---------|
| `askAccountQuestionArray` | RAG sur le corpus per-account | NL question + account IDs |
| `getAccounts` | Lister/filtrer accounts | description + filterExpression + offset + sort |
| `getOpportunities` | Lister/filtrer opportunities | idem |
| `getContacts` | Lister/filtrer contacts | idem |
| `getMeetings` | Lister/filtrer meetings | idem |
| `getTasks` | Lister/filtrer tasks | idem |
| `getNotes` | Lister/filtrer notes | idem |
| `findEntities` | Recherche full-text cross-entity | query string |
| `getMeetingDetails` | Detail complet d'un meeting | entityId |
| `getNoteDetails` | Detail complet d'une note | entityId |

**Pattern commun** : Les 6 tools `get*` (accounts, opportunities, contacts, meetings,
tasks, notes) partagent EXACTEMENT la meme signature : `description` (NL intent),
`filterExpression` (filtre structure), `offset` (pagination), `sortExpression` (tri).
C'est un pattern generique applique a 6 entity types.

**Detail tools** : `getMeetingDetails` et `getNoteDetails` existent separement parce que
les list tools ne retournent que les summaries. Le contenu complet (transcript, note body)
necessite un appel dedie. Ca economise des tokens dans les list responses.

#### Create (5 tools)

| Tool | Ce qu'il fait | Pattern |
|------|---------------|---------|
| `createCrmAccounts` | Creer des accounts en batch | items: [{name, domain}] |
| `createCrmContacts` | Creer des contacts en batch | items: [{firstName, lastName, title, crmAccountId, email}] |
| `createCrmOpportunities` | Creer des opportunities en batch | items: [{crmOpportunityName, crmAccountId, crmOpportunityStage, ownerId, associateUnassociatedActivity}] |
| `createEmail` | Composer un email | toEmails, ccEmails, bccEmails, subject, body |
| `createTask` | Creer une task | assignedToUserId, crmAccountId, title, description, status, dueAt, remindAt, crmOpportunityId, sourceEntityId, sourceEntityType |

**Design critique -- batch create** : `createCrmAccounts`, `createCrmContacts`,
`createCrmOpportunities` prennent des ARRAYS. L'agent peut creer 10 accounts en un seul
tool call. C'est ce qui permet "import these contacts from my CSV" en un seul step.

**Design critique -- `associateUnassociatedActivity`** : Quand on cree une opportunity,
ce flag dit "retroactivement, lie toutes les activites orphelines (emails, meetings) de
cet account a cette opportunity". C'est CRUCIAL : ca enrichit instantanement le contexte
de l'opportunity avec tout l'historique de conversation existant.

**Design critique -- `sourceEntityId` / `sourceEntityType` sur task** : Les tasks
tracent leur ORIGINE. Une task creee depuis un meeting reference ce meeting. Ca cree
un graphe de traceabilite : "cette task vient de ce meeting, ce meeting a discute de
cette opportunity".

#### Update (5 tools)

| Tool | Ce qu'il fait | Pattern |
|------|---------------|---------|
| `updateEmail` | Modifier un brouillon | id, toEmails, ccEmails, bccEmails, subject, body |
| `updateTask` | Modifier une task | id + tous les champs |
| `updateFieldValuesAccount` | MAJ custom fields sur accounts | items: [{crmAccountId, fieldSlug, fieldLabel, newValue}] |
| `updateFieldValuesOpportunity` | MAJ custom fields sur opportunities | items: [{crmOpportunityId, fieldSlug, fieldLabel, newValue}] |
| `updateFieldValuesContact` | MAJ custom fields sur contacts | items: [{crmContactId, fieldSlug, fieldLabel, newValue}] |

**Design critique -- `updateFieldValues*`** : Ces 3 tools sont le bridge entre le
schema-less data model et l'agent. L'agent peut ecrire DANS les custom fields. C'est
ce qui permet "AI fill: Auto" -- l'agent remplit les champs automatiquement.

Le pattern `fieldSlug` + `fieldLabel` + `newValue` est generique. L'agent n'a pas besoin
de connaitre le schema a l'avance -- il recoit les field definitions et ecrit dans
n'importe quel champ.

**Ce qui MANQUE** : Pas de `deleteAccount`, `deleteContact`, etc. Le system prompt
confirme : "Delete is not a capability" et l'agent refuse les demandes de suppression.

#### Utility (4 tools)

| Tool | Ce qu'il fait |
|------|---------------|
| `calculator` | Arithmetique (sum, avg, etc.) |
| `exa_web_search` | Recherche web via Exa API |
| `getCalendarAvailability` | Disponibilites calendrier |
| `supportBot` | Questions sur Lightfield lui-meme |

**Design critique -- `exa_web_search`** : L'agent peut rechercher sur le web. C'est ce
qui alimente `$howTheyMakeMoney` -- l'agent recherche l'entreprise sur le web et synthetise
comment elle gagne de l'argent. C'est aussi utilise par les Skills comme "Research & Write
Outreach" qui combinent CRM data + web research.

**Design critique -- `getCalendarAvailability`** : L'agent peut proposer des creneaux.
"Schedule a meeting with Sarah next week" fonctionne nativement.

**Etat Elevay** :

| Lightfield Tool | Equivalent Elevay | Gap |
|-----------------|-------------------|-----|
| `askAccountQuestionArray` | `searchSimilar` (non scope account) | RAG non scope par entity |
| `getAccounts` | `queryAccounts` | Similaire |
| `getOpportunities` | `queryDeals` | Similaire |
| `getContacts` | `queryContacts` | Similaire |
| `getMeetings` | AUCUN | Pas de meetings dans le CRM |
| `getTasks` | AUCUN | Pas de tasks queryable en chat |
| `getNotes` | AUCUN | Pas de notes entity |
| `findEntities` | `searchCRM` | Similaire |
| `getMeetingDetails` | AUCUN | -- |
| `getNoteDetails` | AUCUN | -- |
| `createCrmAccounts` | `createAccount` (singulier) | Pas de batch |
| `createCrmContacts` | `createContact` (singulier) | Pas de batch |
| `createCrmOpportunities` | `createDeal` (singulier) | Pas de batch, pas de associateUnassociatedActivity |
| `createEmail` | OUI (email composer) | Similaire |
| `createTask` | AUCUN | Pas de createTask tool |
| `updateFieldValues*` | AUCUN | Pas de custom field update tools |
| `updateEmail` | AUCUN | Pas de update draft |
| `updateTask` | AUCUN | -- |
| `calculator` | AUCUN | Trivial a ajouter |
| `exa_web_search` | AUCUN | Enrichment provider different |
| `getCalendarAvailability` | AUCUN | Pas de calendar integration |
| `supportBot` | AUCUN | Low priority |

**Bilan : 24 tools Lightfield vs ~11 tools Elevay. Gap : 13 tools manquants.**
Les plus critiques : `askAccountQuestionArray` (RAG scope), `getMeetings`/`getMeetingDetails`,
`createTask`, `updateFieldValues*` (3 tools), `exa_web_search`, `getCalendarAvailability`.

---

### Couche 3 : KNOWLEDGE LAYER (le contexte business stable)

**Ce que c'est** : Paires topic/content qui representent la connaissance stable de
l'entreprise. Injectees dans le system prompt quand pertinentes.

**Architecture** :
```
Settings > Knowledge
  |
  | workspace-level (visible par tous)
  | user-level (personnel)
  |
  v
Entries : Topic (text) + Content (text)
  |
  | injection dans le system prompt
  | (par pertinence semantique ou par
  |  requiredKnowledge dans un Skill)
  |
  v
Agent context enrichi
```

**Exemples de Knowledge** :
- ICP definition ("We target B2B SaaS companies, 50-500 employees, Series A-C...")
- Pricing sheet ("Starter: $49/mo, Pro: $99/mo, Enterprise: custom...")
- Competitive positioning ("vs Salesforce: we're faster to deploy, vs HubSpot: deeper AI")
- Objection handling ("When they say too expensive: emphasize ROI...")
- Product messaging ("Our value prop is...")
- Discovery framework ("MEDDIC: Metrics, Economic Buyer, Decision Criteria...")

**Ingestion** :
- UI manuelle (topic + content textarea)
- API upload : `POST /v1/files` avec `purpose: knowledge_workspace` ou `knowledge_user`
- Skill "Onboarding" : conduit une interview utilisateur et GENERE automatiquement
  les Knowledge entries

**Interdependance critique** :
- Skills referencent Knowledge via `requiredKnowledge` -- "Draft Proposal" injecte
  automatiquement la Knowledge "Pricing" et "Product Positioning"
- L'agent draw on Knowledge automatiquement pendant toute conversation
- La qualite des Skills depend DIRECTEMENT de la qualite du Knowledge
- Sans Knowledge, le "Draft Proposal" skill ne connait pas les prix, les terms,
  le positioning -- il produit du generique

**Etat Elevay** :
- Knowledge layer : NON (seulement ICP settings dans l'onboarding)
- Knowledge API : NON
- Onboarding skill qui genere Knowledge : NON
- Knowledge injection dans le system prompt : NON

**Gap critique** : C'est un multiplicateur. Chaque dollar investi dans le Knowledge layer
ameliore TOUTES les interactions agent. Sans Knowledge, les emails sont generiques,
les proposals sont creux, le coaching est surface.

---

### Couche 4 : SKILLS SYSTEM (les workflows agent composables)

**Ce que c'est** : Templates de prompt en langage naturel avec steps et constraints,
qui orchestrent les 24 tools + le Knowledge pour accomplir des taches complexes.

**Architecture** :
```
Skill Definition
  |
  +-- Task (quoi faire)
  |    "Draft a proposal for this opportunity"
  |
  +-- Steps (comment le faire)
  |    1. Retrieve the opportunity and its account
  |    2. Query all meetings and notes for this opportunity
  |    3. Review the Knowledge entries for Pricing and Product Positioning
  |    4. Write an executive summary based on discovery conversations
  |    5. Map solution capabilities to problems discussed in meetings
  |    6. Include pricing from the Knowledge pricing sheet
  |    7. Include standard terms from the Knowledge terms document
  |    8. Save as a note attached to the opportunity
  |
  +-- Constraints (guardrails)
  |    - Never invent pricing not in Knowledge
  |    - Always reference actual conversations, not generic claims
  |    - Include specific names and dates from meetings
  |    - Output in markdown format
  |
  +-- requiredKnowledge (injection forcee)
       ["pricing-sheet", "product-positioning", "standard-terms"]
```

**3 tiers** :
1. **System Skills** (read-only, maintenues par Lightfield) -- les 16+ annonces.
   En realite, seulement 8 sont visibles sur le tier Startup :
   - Add knowledge
   - Associate contacts to opportunity
   - Create skill (meta-skill)
   - Create visual report
   - Import data
   - Onboarding
   - Use HTML
   - Use Lightfield SDK

2. **Workspace Skills** (admin-created, partages) -- custom, stockes en DB
3. **User Skills** (personnels) -- pour experimentation

**Comment un Skill s'execute** :

```
User: "Draft a proposal for the Meridian Labs opportunity"
  |
  v
Skill Resolution
  Agent identifie que "Draft Proposal" skill matche l'intent
  |
  v
Knowledge Injection
  Les entries requiredKnowledge sont injectees dans le prompt
  (Pricing, Product Positioning, Standard Terms)
  |
  v
Steps Execution (sequentiel)
  Step 1: getOpportunities(filter: name="Meridian Labs")
  Step 2: askAccountQuestionArray(accountId, "what was discussed in meetings?")
  Step 3: getMeetings(filter: accountId=X)
  Step 4: getMeetingDetails(meetingId=Y)
  Step 5: getNotes(filter: opportunityId=Z)
  |
  v
Composition
  L'agent synthetise tout le contexte retrieve + Knowledge
  en un document structure (exec summary, solution, pricing, terms)
  |
  v
Output
  createNote ou markdown inline dans le chat
  Attache a l'opportunity
```

**L'interdependance cle** : Les Skills ne sont PAS du code. Ce sont des PROMPTS. Leur
qualite depend de :
1. La richesse du corpus de conversations (Couche 0)
2. La qualite du RAG (Couche 1)
3. La completude du Knowledge (Couche 3)
4. La puissance des tools (Couche 2)

Un Skill identique produit des resultats radicalement differents selon que
l'utilisateur a 0 ou 24 mois d'emails synces, 0 ou 5 Knowledge entries, 0 ou 20
meetings enregistres.

**Etat Elevay** :
- Skills system : NON
- Create skill meta-skill : NON
- Skill resolution depuis intent : NON
- Skill execution engine : NON (mais la logique est triviale -- c'est de l'injection
  de prompt)

---

### Couche 5 : HUMAN-IN-THE-LOOP (la surface de confiance)

**Ce que c'est** : Le systeme qui permet a l'utilisateur de controler le degre
d'autonomie de l'agent.

**Composants** :

#### 5a. Confirmation Cards

Quand l'agent veut creer/modifier un record :
- **Create card** : icon entite + header + details + Dismiss/Create buttons
- **Update card** : breadcrumb entite + diff (old -> new) + per-field approve/reject
- **Batch actions** : "Create all N" / "Dismiss all"
- **Editable** : les champs sont EDITABLES sur la card avant confirmation
- **Sequential** : pour multi-step (creer account PUIS contact), cards sequentielles

#### 5b. Graduated Autonomy

Settings > Agent > "Record creation and updates" :
- **Ask every time** (default) : chaque action demande confirmation
- **Auto-run** (configurable) : l'agent agit sans demander

Le blog du 6 mars 2026 annonce "disable approval requirement for agent record operations",
et celui du 17 avril 2026 annonce "auto-populate and refresh record fields WITHOUT requiring
human approval during processing."

#### 5c. Process Transparency

Panels collapsibles dans le chat montrant :
- "Retrieved CRM data" : ce que l'agent a cherche et trouve
- "Ran code" : le code Python execute dans le sandbox
- "Analyzed data" : les resultats d'analyse

**Pourquoi c'est une couche architecturale** : Sans confiance, les utilisateurs
n'activent jamais l'autonomie. Sans autonomie, l'agent est juste un assistant passif.
Le pipeline est :

```
Transparency --> Trust --> Autonomy --> Value
```

Un agent qui agit en silence sans montrer son travail ne sera jamais autorise a
envoyer des emails ou modifier des deals automatiquement.

**Etat Elevay** :
- Confirmation cards : PARTIEL (ActionCard pour creates, pas de update diff)
- Graduated autonomy : OUI (settings page avec toggle)
- Process transparency : OUI (ToolCallGroup panels)
- Editable fields on cards : NON
- Per-field approve/reject on updates : NON

---

### Couche 6 : ENTITY LINKING (le tissu connectif)

**Ce que c'est** : Le systeme qui transforme les reponses agent en experiences
navigables.

**Syntaxe dans le system prompt** :
```
[displayName](#entityType:entityId)
```

**Types supportes** : `CrmAccount`, `CrmOpportunity`, `CrmContact`, `CrmMeeting`,
`CrmTask`, `CrmNote`, `User`

**Effet** : Chaque mention d'un record dans une reponse agent devient un lien cliquable
qui ouvre un slide-over panel DANS le chat thread. Pas de navigation away.

**URL pattern observe** : `?hsot={type}&hsid={id}` appended au thread URL.

**Pourquoi c'est critique** : Un proposal qui dit "Based on your meeting with Sarah Chen
on March 15" avec "Sarah Chen" cliquable et "March 15 meeting" cliquable est
fondamentalement different d'un wall of text. L'utilisateur peut VERIFIER chaque claim
de l'agent.

**Etat Elevay** : OUI (EntityLink + ChatMarkdown + SlideOver). Gap ferme.

---

## 3. LES BOUCLES DE RETROACTION

### Boucle 1 : Conversation -> Intelligence -> Action -> Conversation

```
Email sync capture conversation
  --> Agent analyse et extrait insights
  --> Agent propose action (email, task, stage update)
  --> User approuve --> execution
  --> Nouvelle conversation generee (email envoye, meeting planifie)
  --> Email sync capture la reponse
  --> Cycle recommence
```

C'est le **flywheel** de Lightfield. Plus il y a de conversations, plus l'agent est
intelligent. Plus l'agent est intelligent, plus il genere de conversations de qualite
(emails personalises, follow-ups contextuels). Plus de conversations = plus de donnees
= plus d'intelligence.

**Etat Elevay** : La boucle existe conceptuellement mais est cassee a plusieurs endroits :
- Calendar sync manquant (moitie du corpus perdu)
- RAG non scope par account (retrieval moins precis)
- Pas de batch create tools (actions agent limitees)
- Custom field updates impossibles depuis l'agent

### Boucle 2 : Knowledge -> Skills -> Output Quality -> Knowledge

```
User ajoute Knowledge (pricing, positioning)
  --> Skills utilisent Knowledge pour produire des outputs meilleurs
  --> User voit la qualite et ajoute plus de Knowledge
  --> Skills s'ameliorent encore
```

C'est la boucle de **teachability**. L'utilisateur "enseigne" au CRM via Knowledge.
Le CRM devient meilleur. L'utilisateur voit le resultat et enseigne plus.

Le skill "Onboarding" accelere cette boucle : il interview l'utilisateur et genere
automatiquement les premieres Knowledge entries.

**Etat Elevay** : Boucle inexistante. Pas de Knowledge layer.

### Boucle 3 : Usage -> Custom Fields -> Structured Data -> Better Queries

```
User decouvre qu'il a besoin d'un champ "Competitor" sur les opportunities
  --> Cree le custom field via Data Model settings
  --> Agent remplit le champ automatiquement (AI fill: Auto)
  --> Les queries "which deals mention competitor X?" deviennent possibles
  --> User cree plus de champs
```

C'est la boucle de **schema evolution**. Le data model grandit avec l'usage.
Le blog du 27 mars 2026 annonce "Agent Data Model Tools" -- l'agent SUGGERE
des changements de schema pendant l'import.

**Etat Elevay** : JSONB `properties` existe mais pas de UI, pas de AI fill, pas
de field definitions. La boucle est morte.

---

## 4. CE QUI REND "DRAFT PROPOSAL" POSSIBLE

"Draft Proposal" n'est pas une feature. C'est **l'aboutissement de 6 couches** :

| Couche | Ce qu'elle apporte au proposal | Sans cette couche |
|--------|-------------------------------|-------------------|
| 0. Data Capture | Emails, meetings, transcripts avec le prospect | Proposal generique sans contexte reel |
| 1. Context Composition | Acces au corpus de conversations via RAG | Agent ne sait pas ce qui a ete discute |
| 2. Tools | `getOpportunities`, `getMeetings`, `askAccountQuestionArray`, `getNoteDetails` | Agent ne peut pas retriever les donnees |
| 3. Knowledge | Pricing, terms, product positioning | Proposal sans prix, sans terms, sans positioning |
| 4. Skills | Steps structures + constraints | Pas de structure, output imprevisible |
| 5. Trust Surface | Confirmation card, process transparency | User n'a pas confiance, n'utilise pas |
| 6. Entity Links | Liens cliquables vers meetings/contacts references | Wall of text non verifiable |

**Implication pour Elevay** : Implementer "Draft Proposal" comme une feature isolee
produirait un resultat mediocre. Il faut d'abord les couches 0-3. Les couches 4-6
sont des multiplicateurs de qualite.

---

## 5. PLAN D'IMPLEMENTATION PAR INTERDEPENDANCE

### Phase 0 : Fondations (pre-requis pour tout le reste)

| # | Composant | Effort | Debloque |
|---|-----------|--------|----------|
| 0.1 | Calendar sync (Microsoft + Google) | M | Meetings dans le corpus, meeting prep, follow-up |
| 0.2 | RAG scope par account (`askAccountQuestionArray` equivalent) | M | Context quality, entity-scoped queries |
| 0.3 | `<Account>` context injection (quand user est sur page detail) | S | Zero-latency entity-scoped chat |
| 0.4 | Auto-create accounts depuis email domains | S | Corpus d'accounts plus complet |

### Phase 1 : Knowledge Layer (multiplicateur de qualite)

| # | Composant | Effort | Debloque |
|---|-----------|--------|----------|
| 1.1 | Knowledge table (topic + content, workspace + user scope) | S | Fondation Knowledge |
| 1.2 | Knowledge CRUD UI (Settings > Knowledge) | S | Utilisateurs peuvent ajouter Knowledge |
| 1.3 | Knowledge injection dans system prompt (auto, par pertinence) | M | Agent utilise Knowledge automatiquement |
| 1.4 | Knowledge API (upload via `purpose: knowledge_workspace`) | S | Programmatic Knowledge ingestion |

### Phase 2 : Agent Tools (catalogue complet)

| # | Composant | Effort | Debloque |
|---|-----------|--------|----------|
| 2.1 | `getMeetings` / `getMeetingDetails` tools | S | Agent query meetings |
| 2.2 | `createTask` tool avec `sourceEntityId/sourceEntityType` | S | Tasks tracables |
| 2.3 | `updateFieldValues*` (3 tools pour account/contact/deal) | M | AI fill, schema-less updates |
| 2.4 | Batch create tools (arrays au lieu de singulier) | S | Import agent, bulk actions |
| 2.5 | `exa_web_search` equivalent (web research) | M | Enrichment, research skills |
| 2.6 | `getCalendarAvailability` tool | S | Scheduling depuis le chat |
| 2.7 | Notes entity + `getNotes` / `getNoteDetails` tools | M | Stockage structuree des outputs agent |

### Phase 3 : Skills System (le differentiateur)

| # | Composant | Effort | Debloque |
|---|-----------|--------|----------|
| 3.1 | Skill definition schema (task + steps + constraints + requiredKnowledge) | S | Fondation Skills |
| 3.2 | System Skills (8-10 pre-built en markdown) | M | Draft Proposal, Meeting Brief, etc. |
| 3.3 | Skill resolution depuis user intent | M | Auto-detection du skill pertinent |
| 3.4 | Custom Skills CRUD (workspace + user level) | M | Teachability |
| 3.5 | "Create skill" meta-skill | M | Utilisateurs creent des skills en NL |

### Phase 4 : Trust Surface (graduation d'autonomie)

| # | Composant | Effort | Debloque |
|---|-----------|--------|----------|
| 4.1 | Update confirmation cards avec field diff (old -> new) | S | Updates agent visibles |
| 4.2 | Editable fields sur confirmation cards | M | User controle final |
| 4.3 | Per-field approve/reject sur updates | M | Granularite fine |
| 4.4 | `associateUnassociatedActivity` sur create opportunity | S | Enrichissement auto du contexte deal |

---

## 6. METRIQUES DE PARITE

Pour mesurer si on atteint la qualite Lightfield, tester ces scenarios end-to-end :

| Scenario | Lightfield Score | Elevay Target |
|----------|-----------------|---------------|
| "How many contacts do I have?" | 10/10 | 10/10 (table snapshots) |
| "Show me all contacts at [company]" avec table + entity links | 9/10 | 9/10 |
| "Draft a follow-up email to [contact] referencing [meeting]" | 10/10 | Requires: email sync + RAG + entity scoping |
| "Draft a proposal for [opportunity]" avec pricing + terms + discovery context | 8/10 | Requires: ALL 6 layers |
| "What should I focus on today?" avec priorities synthetisees | 9/10 | Requires: meetings + tasks + deals + signals |
| "Prep me for my meeting with [contact] in 30 minutes" | 8/10 | Requires: calendar sync + account RAG |
| "Create a skill that does X" en NL | 7/10 | Requires: Skills system + meta-skill |
| "Which deals mention competitor X?" cross-entity query | 7/10 | Requires: scoped RAG + entity linking |

---

## 7. LA VERITE SUR L'ECART

Lightfield n'est pas en avance par UNE feature. Ils sont en avance par
l'**integration profonde entre 7 couches interdependantes** :

1. Data Capture (email + calendar + backsync) alimente...
2. Context Composition (snapshots + XML tags + RAG) qui alimente...
3. 24 Tools (query + create + update + utility) qui sont orchestres par...
4. Skills (prompt templates avec steps/constraints) qui referencent...
5. Knowledge (contexte business stable) et le tout est rendu utilisable par...
6. Trust Surface (confirmation cards + graduated autonomy + transparency) connecte via...
7. Entity Links (navigabilite, verifiabilite)

Chaque couche est individuellement simple. La difficulte est dans l'INTEGRATION.
Un Knowledge layer sans Skills est inutile. Des Skills sans RAG sont generiques.
Du RAG sans data capture est vide. Des tools sans trust surface ne sont pas utilises.

**L'ordre d'implementation DOIT respecter les dependances.** Implementer les Skills
avant le Knowledge Layer produit des skills generiques. Implementer le Knowledge Layer
avant le data capture produit du Knowledge sans donnees pour le valider.

Le chemin critique est : **Data Capture -> RAG scope -> Knowledge -> Tools -> Skills -> Trust**.
