# Mapping Unipile API → Sales Navigator

> Tout ce que l'API Unipile permet de **récupérer** par rapport à ce que voit
> Sales Navigator. Vérifié **live** le 2026-06-29 contre le seat connecté de
> martin@elevay.dev. Chaque ligne « WIRED » cite le code Elevay ; chaque champ
> cité a été retourné par un appel réel (sondes `unipile-probe*.mjs`).

## Seat de référence (faits live)

| Fait | Valeur live |
|------|-------------|
| Compte Unipile | `0vB-DJ46TbOqW80oiA9Z2Q` — « Martin Paviot » |
| DSN | `https://api30.unipile.com:16037` |
| `premiumFeatures` | `["sales_navigator"]` |
| Contrat SN | `SALES_2009581284` (`product: sales_navigator`, `selected: true`) |
| Crédits InMail | `sales_navigator: 150` (premium/recruiter `null`) |
| Statut source | `OK` |
| `users/me` | `sales_navigator: { contract_id: 2009581284, owner_seat_id: 1528612694 }` |

L'OpenAPI live du DSN (`/api-json`) expose **73 endpoints**. Le sous-ensemble
LinkedIn/Sales-Nav pertinent (38 paths) est l'inventaire exhaustif ci-dessous.

---

## 1. Mapping par surface Sales Navigator

Statut : **WIRED** = déjà dans `lib/providers/unipile/http.ts` ; **PARTIEL** =
fonction existe mais n'extrait pas tout ; **À CÂBLER** = endpoint live OK, aucun
code Elevay.

### A. Recherche de prospects (Lead Search)

- **Endpoint** : `POST /linkedin/search?account_id=&limit=` body `{api:"sales_navigator", category:"people", ...}`
- **Live** : `keywords:"founder"` → `paging.total_count = 11 725 400`, plafond **2 500/requête**.
- **Champs par item (vérifiés)** : `id` (id lead SN `ACwAA…`), `member_urn`
  (`urn:li:member:867701514`), `public_identifier`, `public_profile_url`,
  `profile_url` (= **URL lead Sales-Nav** `…/sales/lead/{id},NAME_SEARCH,xxx`),
  `network_distance`, `headline`, `summary` (texte « À propos » complet),
  `location`, `industry`, `premium`, `pending_invitation` (anti-collision),
  `recent_posts_count` (signal d'activité), `profile_picture_url(_large)`,
  `current_positions[]` = `{company, company_id, role, description, location,
  industry[], tenure_at_company{years}, tenure_at_role{years}, start{month,year}, skills}`.
- **Statut** : **WIRED** — `searchLinkedIn` (`http.ts:282`), `sourceFromSalesNav` (`lib/linkedin/sales-nav-sourcing.ts`).

### B. Recherche de comptes (Account Search)

- **Endpoint** : `POST /linkedin/search` body `{api:"sales_navigator", category:"companies"}`
- **Live** : `keywords:"software"` → `total_count = 1 032 872`.
- **Champs par item** : `id`, `name`, `industry`, `location`, `headcount` (string), `logo`, `profile_url`, `summary`, `type:"COMPANY"`.
- **Statut** : **WIRED** (même fonction). Note : l'item de recherche est pauvre ;
  les firmographics riches viennent du profil société (section G).

### C. Recherche de posts / d'offres

- **Endpoint** : même `POST /linkedin/search`, `category:"posts"` ou `"jobs"`.
- **Statut** : **À CÂBLER** (l'`api`/`category` sont supportés ; non exploités côté Elevay).

### D. Filtres Sales Navigator (résolution d'IDs)

- **Endpoint** : `GET /linkedin/search/parameters?type=&service=SALES_NAVIGATOR&keywords=`
- **Live (service SN)** : `INDUSTRY=software` → `4` ; `LOCATION=France` → `105015875` ;
  `JOB_TITLE=Founder` → `35`. (IDs **scopés par `service`** — résoudre dans le même surface qu'on cherchera.)
- **Statut** : **WIRED** — `resolveLinkedInParameter` (`http.ts:327`), `lib/linkedin/icp-to-salesnav.ts`.
- **Filtres SN avancés disponibles dans le body** : `location[]`, `industry{include,exclude}`,
  `company{include,exclude}`, `school[]`, `job_title[]`, `seniority[]`, `headcount[]`,
  `tenure[{min,max}]`, `profile_language[]`, `network_distance[]`, + Recruiter `role[]`/`skills[]`.
  TRAP live : un body avec tableaux vides (`seniority:[]`, `keywords:""`) → `400 invalid_parameters`. N'envoyer que les filtres renseignés.

### E. Recherche par URL (coller une recherche SN déjà construite)

- **Endpoint** : `POST /linkedin/search` body `{url:"https://www.linkedin.com/sales/search/people?query=(…)"}`.
- **Statut** : **WIRED** (branche `url` de `searchLinkedIn`). Chemin le plus rapide pour un opérateur.

### F. Profil lead complet (la « vue lead » Sales Navigator)

- **Endpoint** : `GET /users/{identifier}?account_id=&linkedin_sections=*`
- **Live — relation 1er degré** (`emile-geeraert`, surface classic) → **200**, profil **complet** :
  `work_experience[]` (11 postes : `company`, `company_id`, `position`, `description`,
  `status`, `start`, `end`), `work_experience_total_count`, `education[]` (3 :
  `school`, `school_id`, `degree`, `start`, `end`), `languages[]` (`name`,
  `proficiency`), `skills[]`, `certifications[]`, `projects[]`, `volunteering_experience[]`,
  `summary`, `birthdate{month,day}`, `connected_at`, `shared_connections_count` (70),
  `follower_count`, `connections_count`, `websites[]`, `hashtags[]`, `is_open_profile`,
  `is_creator`, `is_influencer`, `is_premium`, `network_distance:"FIRST_DEGREE"`, `provider_id`.
- **Live — lead HORS-RÉSEAU** (`DISTANCE_3`) : 
  - via `public_identifier` + `linkedin_api=sales_navigator` → **422 `errors/invalid_recipient`** (profil verrouillé).
  - via **l'id SN `ACwAA…` + `linkedin_api=sales_navigator&linkedin_sections=*`** → **200** avec
    `work_experience`, `education`, `skills`, `languages`, `summary`, **`can_send_inmail`**,
    **`is_open_to_work`**, `is_open_profile`, `connections_count`.
  - **Conclusion clé** : la **surface Sales-Navigator débloque** l'expérience/formation/skills
    de prospects hors-réseau que le classic verrouille. Règle : relation → `public_identifier`
    sur classic ; hors-réseau → **id SN `ACwAA…` sur `linkedin_api=sales_navigator`**.
- **Statut** : **PARTIEL** — `getUnipileUserProfile` (`http.ts:235`) ne lit que
  `provider_id`/`network_distance` et **ne demande pas `linkedin_sections`**. L'enrichissement
  complet (T11) n'est pas construit. C'est le plus gros écart « récupérer tout ».

### G. Profil société / compte (la « page compte » Sales Navigator)

- **Endpoint** : `GET /linkedin/company/{identifier}?account_id=`
- **Live** → **200**, très riche :
  - `insights.employeesCount` = **`growthGraph` (croissance % à 6 / 12 / 24 mois)**,
    **`averageTenure`** (« 3.5 years »), **`employeesCountGraph`** (courbe d'effectifs
    mensuelle sur **25 mois**) — c'est exactement le signal « croissance d'effectif » de SN.
  - `employee_count` (455), `employee_count_range{from,to}`, `foundation_date`,
    `followers_count`, `industry[]`, `locations[]` (`is_headquarter`, ville/pays/CP/rue),
    `activities[]` (spécialités), `tagline`, `description`, `hashtags[]`, `website`,
    `phone`, `logo(_large)`, `claimed`, `messaging{is_enabled, id}`, `viewer_permissions`.
- **Statut** : **À CÂBLER** — aucune fonction `getCompanyProfile` dans `http.ts`.
  Forte valeur : `insights` alimente directement le `priority_score` signal-dominant ([[project_signal-dominant-scoring]]).

### H. Crédits InMail (jauge SN)

- **Endpoint** : `GET /linkedin/inmail_balance?account_id=`
- **Live** → `{premium:null, recruiter:null, sales_navigator:150}`.
- **Statut** : **À CÂBLER** — devrait gater la capacité d'envoi InMail (`lib/sending/linkedin/capacity.ts`).

### I. Contrats / sélection de seat (multi-SN, Recruiter)

- **Endpoints** : `GET /linkedin/contracts` + `POST /linkedin/contracts/{id}/select`.
- **Live** → `[{id:"SALES_2009581284", name:"SALES_NAVIGATOR 2009581284", product:"sales_navigator", selected:true}]`.
- **Statut** : **À CÂBLER** (utile si un seat porte plusieurs contrats SN/Recruiter).

### J. Relations 1er degré (graphe de connexions)

- **Endpoint** : `GET /users/relations?account_id=&limit=` (curseur, `limit` jusqu'à 1000).
- **Live** : item = `member_id` (`ACoAA…` = provider_id), `member_urn`, `connection_urn`,
  `first_name`, `last_name`, `headline`, `public_identifier`, `public_profile_url`,
  `created_at`, `profile_picture_url`. Tout item est implicitement 1er degré.
- **Statut** : **WIRED** — `listUnipileRelations` (`http.ts:370`) → graphe chaud (`buildKnowsFromLinkedInRelations`).

### K. Activité récente d'un lead (signal d'engagement)

- **Endpoints** : `GET /users/{provider_id}/posts`, `/reactions`, `/comments`.
- **Live** : `/posts` via **`provider_id` `ACoAA…`** → **200** : `text`, `date`,
  `impressions_counter`, `reaction_counter`, `comment_counter`, `repost_counter`,
  `is_repost`, `mentions`, `attachments`, `share_url`, `author`. (Via `public_identifier` → 422 ;
  utiliser le `provider_id`.) `recent_posts_count` est aussi déjà dans le résultat de recherche.
- **Statut** : **À CÂBLER** — surface de signal (qui poste/réagit) non exploitée.

### L. Invitations (sortantes + entrantes)

- **Endpoints** : `POST /users/invite` (≤300 car.) ; `GET /users/invite/sent` ;
  `DELETE /users/invite/sent/{id}` ; `GET /users/invite/received` ; `POST /users/invite/received/{id}` (accept/reject).
- **Live** : `invite/sent` et `invite/received` → 200 (Martin a des invites en attente
  des deux côtés). Item received = `id`, `invitation_text`, `inviter`, `invited_user(_id/_public_id/_description)`, `date`, `specifics`.
- **Statut** : **PARTIEL** — envoi câblé (`UnipileAdapter.connect`) ; **lecture sent/received non câblée**
  (détecter les acceptations = diff de la liste `sent`).

### M. InMail / message à un non-connecté

- **Endpoint** : `POST /chats` (multipart) `linkedin[api]=sales_navigator` + `linkedin[inmail]=true`.
- **Statut** : **WIRED** — branche InMail de `UnipileAdapter` (`messaging-client.ts`). Consomme 1 crédit (jauge section H).

### N. Webhooks (équivalent « alertes » temps réel)

- **Endpoints** : `POST /webhooks` `source=messaging` (réponses entrantes) / `source=account_status` (santé seat).
- **Statut** : **WIRED** — capture inbound (`linkedin-capture.ts`, cron `*/15`) + webhook statut compte.

---

## 2. Ce que Sales Navigator a, mais qu'Unipile **n'expose PAS** (vérifié)

| Surface SN | Test live | Verdict |
|------------|-----------|---------|
| Lead Lists sauvegardées | `GET /linkedin/sales_navigator/lead_lists` → **404** | Pas d'endpoint |
| Account Lists sauvegardées | `…/account_lists` → **404** | Pas d'endpoint |
| Saved Searches | `…/saved_searches`, `/linkedin/saved_searches` → **404** | Pas d'endpoint |
| Lead/Account recommendations | absent de l'OpenAPI | Non exposé |
| Alerts / buying-intent feed SN | absent de l'OpenAPI | Non exposé (reconstruire via posts + company `insights`) |
| Notes & Tags SN-internes | absent | Non exposé |
| Followers / Following | `GET /users/following` → **501 `feature_not_implemented`** | Déclaré, non implémenté |
| Profil SN via handle public (hors-réseau) | → **422 `invalid_recipient`** | Utiliser l'id SN `ACwAA…` |

**Implication produit** : les *listes* et *recherches sauvegardées* de Sales Navigator
ne sont pas lisibles par API. Ce n'est pas bloquant — notre CRM canonique EST le
magasin de listes ; on reconstruit la recherche/segmentation côté Elevay et on ne
dépend pas de l'état interne SN. Les *alertes* SN (changement de poste, croissance,
post récent) se **reconstruisent** à partir de `company.insights` (croissance d'effectif),
`current_positions[].start` / `tenure_at_role` (nouveau dans le rôle) et `/users/{id}/posts`.

---

## 3. Cross-cutting : le sélecteur `api`

Le même tri `classic | sales_navigator | recruiter` se passe dans :
- la recherche (`api` dans le body de `POST /linkedin/search`),
- la récupération de profil (`linkedin_api` en query de `GET /users/{id}`),
- l'envoi InMail (`linkedin[api]` form-field de `POST /chats`).

Stocké sur `linkedin_account.seat_type` (= `sales_navigator` pour ce seat, vérifié).
Le filer partout, pas seulement à la connexion.

## 4. Plan pour « récupérer l'ensemble » (priorité décroissante, valeur signal)

1. **`getCompanyProfile`** (`GET /linkedin/company/{id}`) — `insights.employeesCount`
   (croissance 6/12/24 mois + courbe 25 mois) alimente direct le `priority_score`. ~0.5 j-h.
2. **Étendre `getUnipileUserProfile`** avec `linkedin_sections=*` + branche hors-réseau
   (id SN `ACwAA…` sur `linkedin_api=sales_navigator`) → enrichissement complet (T11).
   Route via `upsertContact({provider:"unipile", …})`. ~1.5 j-h.
3. **`getInMailBalance`** → gate la capacité InMail (fail-closed si 0 crédit). ~0.5 j-h.
4. **Activité lead** : `/users/{provider_id}/posts` → signal d'engagement. ~1 j-h.
5. **Lecture invitations** sent/received → détection d'acceptation + réponses aux invites entrantes. ~1 j-h.

Quotas LinkedIn (Unipile n'impose RIEN — c'est à nous) : recherche 2 500/req &
2 500/jour (SN) ; vues de profil ~100/jour ; InMail 30-50/jour (150 crédits) ;
invitations 80-100/jour. Jitter obligatoire, jamais de cadence fixe.

---

## Catalogue COMPLET des champs (OpenAPI modélisé + capture live)

Source = schéma de réponse inline de l'OpenAPI live (DSN api30) + valeurs capturées
le 2026-06-29. "schéma vide live" = champ déclaré mais non peuplé sur les cas testés.

### Société — `GET /linkedin/company/{id}` (arbre complet)

```
id, name, description, tagline, entity_urn, public_identifier, profile_url
followers_count, is_following, is_employee, claimed, organization_type, phone, website, logo, logo_large
industry: string[]                       activities: string[]            hashtags: [{title}]
foundation_date: string
employee_count: number                   employee_count_range: {from, to}
locations: [{is_headquarter, country, city, area, postalCode, street[], description}]
messaging: {is_enabled, id, entity_urn}
localized_description / localized_name / localized_tagline: object[]
viewer_permissions: { ~40 booléens canManage*/canRead* }
insights.employeesCount: { totalCount, averageTenure,
   employeesCountGraph:[{date,count}] (≈25 mois), growthGraph:[{monthRange,growthPercentage}] (6/12/24) }
acquired_by: {id, name, public_identifier, profile_url}                 ← SCHÉMA présent, VIDE live (3/3)
crunchbase_funding: { last_updated_at, company_url,
   rounds:{ url, total_count, last_round:{ announced_on, funding_type, investors_count,
      lead_investors:[{name,url,logo}], money_raised:{amount,currency} } } }  ← SCHÉMA présent, VIDE live (3/3)
```

- **PAS de champ `revenue`/CA.** Confirmé : absent du schéma ET du live (Stripe/Notion/Ramp/Testbytes).
- **`crunchbase_funding` + `acquired_by`** : entièrement modélisés (round, montant, devise, investisseurs,
  date, acquéreur) MAIS reviennent vides sur 3 sociétés financées testées. Le widget Crunchbase de
  Sales-Nav n'est exposé que sous conditions → **ne pas en dépendre** ; funding via Apollo/Crunchbase.

### Personne / lead — `GET /users/{id}` (sections + champs, capturés live)

`linkedin_sections` (enum complet) : `*`, `*_preview`, `about`, `experience`, `education`,
`languages`, `skills`, `certifications`, `volunteering_experience`, `projects`,
`recommendations_received`, `recommendations_given`, `recruiting_activity` (+ variantes `_preview`).
`linkedin_api` (enum) : `recruiter` | `sales_navigator` (omettre = classic).

Champs live (relation 1er degré, sections=*) :
```
provider_id, public_identifier, public_profile_url, member_urn
first_name, last_name, headline, summary, location, primary_locale{country,language}
network_distance, is_relationship, is_self, is_premium, is_open_profile, is_creator, is_influencer
follower_count, connections_count, shared_connections_count, connected_at, birthdate{month,day}
websites[], hashtags[], profile_picture_url(_large), background_picture_url
work_experience[]: {company, company_id, position, description, status, location, start, end, skills}
education[]: {school, school_id, degree, school_picture_url, start, end}
languages[]: {name, proficiency}     skills[]     certifications[]     projects[]     volunteering_experience[]
(out-of-network via id SN + linkedin_api=sales_navigator ajoute: can_send_inmail, is_open_to_work)
```
- **PAS de section `contact_info`** dans l'enum → **email/téléphone d'un lead NON exposés** par Unipile
  (seul `/users/me` renvoie l'email DU compte connecté). Les emails des leads = Apollo. C'est LE gap people.

### Résultat de recherche people SN — `POST /linkedin/search` (item, live)
```
id (id lead SN ACwAA…), member_urn, public_identifier, public_profile_url, profile_url (URL lead SN)
first_name, last_name, name, headline, summary, location, industry, network_distance
premium, pending_invitation, recent_posts_count, profile_picture_url(_large)
current_positions[]: {company, company_id, role, description, location, industry[],
   tenure_at_company{years}, tenure_at_role{years}, start{month,year}, skills}
```
Enveloppe : `{object, items, config, paging{start,page_count,total_count}, cursor, metadata}`.

### Autres objets (OpenAPI modélisé)
- **relations** `GET /users/relations` : `{first_name,last_name,headline,public_identifier,public_profile_url,created_at,member_id,member_urn,connection_urn,profile_picture_url}`.
- **inmail_balance** : `{premium, recruiter, sales_navigator}` (nombres|null) — live SN=150.
- **contracts** : `[{id, name, description, product:recruiter|sales_navigator, selected}]`.
- **invitations sent/received** : `{id, invited_user_*, date, invitation_text, inviter:{inviter_name,inviter_id,inviter_public_identifier}, specifics:{provider,shared_secret}}`.
- **reactions** `GET /users/{id}/reactions` : `value: LIKE|PRAISE|APPRECIATION|EMPATHY|INTEREST|ENTERTAINMENT`, `post_id`, `comment_id`, `author`.
- **posts** `GET /users/{id}/posts` (param `is_company` pour une page société) : `{text,date,impressions_counter,reaction_counter,comment_counter,repost_counter,is_repost,share_url,social_id,author,attachments,mentions}`.

## Annexe — endpoints LinkedIn/SN de l'OpenAPI live (DSN api30)

```
POST   /linkedin                        GET    /users/me
GET    /linkedin/company/{identifier}   PATCH  /users/me/edit
GET    /linkedin/contracts              GET    /users/relations
POST   /linkedin/contracts/{id}/select  GET    /users/{identifier}
GET    /linkedin/inmail_balance         GET    /users/{identifier}/posts
GET,POST /linkedin/jobs                 GET    /users/{identifier}/comments
GET    /linkedin/jobs/applicants/{id}   GET    /users/{identifier}/reactions
GET    /linkedin/jobs/{id}/applicants   GET    /users/followers
POST   /linkedin/profile/endorse        GET    /users/following            (501)
GET    /linkedin/projects               POST   /users/invite
GET    /linkedin/projects/{id}          GET    /users/invite/received
POST   /linkedin/search                 POST   /users/invite/received/{id}
GET    /linkedin/search/parameters      GET    /users/invite/sent
POST   /linkedin/user/{user_id}         DELETE /users/invite/sent/{id}
POST   /posts                           POST   /posts/reaction
GET    /posts/{post_id}                 GET    /posts/{post_id}/comments
GET    /posts/{post_id}/reactions
```
