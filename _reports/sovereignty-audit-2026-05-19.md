# Audit souveraineté Elevay — 2026-05-19

**Contexte commercial.** Elevay sera utilisé pour vendre `pilae.ch` (logiciel
souverain suisse, vitrine `pilae-cloud.pages.dev`). Le produit qui vend du
souverain DOIT être lui-même souverain — sans quoi le pitch est mort à la
première question d'un acheteur public, d'un DSI bancaire CH, ou d'un acheteur
soumis au Cloud Act.

**Cible de cet audit.** Définir l'écart entre l'état actuel d'Elevay et trois
référentiels de souveraineté :

1. **RGPD + nFADP** (CH, en vigueur depuis 2023-09-01) — plancher légal.
2. **Cloud souverain EU/CH** : SecNumCloud 3.2 (FR/ANSSI), EUCS High
   (en cours), C5 BSI (DE), Swiss FINMA outsourcing, hébergement IaaS de
   capital UE/CH, hors emprise extraterritoriale US.
3. **SOC 2 type II + ISO/IEC 27001:2022** — exigences contractuelles
   marché.

**Verdict en une ligne.** Elevay est **non-souverain aujourd'hui**. Le
discours « GDPR compliant » sur la page privacy est partiellement faux
(FINDING-004 déjà identifié, jamais fini). Pour vendre Pilae, il faut un
chantier de **8 à 14 semaines** dont les 4 premières sont bloquantes.

---

## 1. État actuel — cartographie des sous-traitants

Reconstitué depuis `app/apps/web/package.json`, `.env.local`,
`vercel.json`, et le code. La page `/privacy` est **désynchronisée** de la
réalité — elle liste 7 sous-traitants, le code en utilise au moins 14.

| # | Sous-traitant | Usage | Hébergement réel | Capital / juridiction | Cloud Act ? | Souverain EU/CH ? |
|---|---|---|---|---|---|---|
| 1 | **Supabase (Postgres)** | DB primaire, PII clients + emails complets | `aws-1-eu-central-1.pooler.supabase.com` (Frankfurt) | US (Supabase Inc., Delaware) sur infra AWS US | ✅ oui | ❌ non |
| 2 | **Vercel** | Hosting Next.js, edge fns, crons | "Global (US primary)" (vercel.json) | US (Vercel Inc.) | ✅ oui | ❌ non |
| 3 | **Anthropic Claude** | LLM principal (chat, scoring, génération emails) | `api.anthropic.com` (US default — pas de pinning malgré FINDING-004) | US (Anthropic PBC) | ✅ oui | ❌ non |
| 4 | **OpenAI** | LLM + embeddings | `api.openai.com` (US, pas d'EU endpoint) | US | ✅ oui | ❌ non |
| 5 | **Resend** | Envoi email transactionnel + invitations | US (`resend.com`) | US (Resend Inc.) | ✅ oui | ❌ non |
| 6 | **Stripe** | Paiement | US — entité Stripe Payments Europe à Dublin pour facturation EU | US (Stripe Inc.) avec sub IE | ✅ oui (data flows US) | ❌ non |
| 7 | **Google (OAuth + Gmail API)** | Auth + lecture mailbox utilisateur | Global Google | US | ✅ oui | ❌ non |
| 8 | **Microsoft Entra (Graph + Outlook)** | Auth + mailbox MS | Global Microsoft | US | ✅ oui (CLOUD Act + EO 12333) | ❌ non |
| 9 | **Inngest** | Queue / jobs serverless | US-hosted | US | ✅ oui | ❌ non |
| 10 | **Sentry** | Error reporting (envoie PII par défaut, cf H8 audit sécu) | US default (EU region dispo via `de.sentry.io`) | US (Functional Software Inc.) | ✅ oui même en EU region | ❌ non |
| 11 | **PostHog** | Product analytics | `eu.i.posthog.com` — déjà sur EU Cloud (Frankfurt) ✅ | US (PostHog Inc.) | ✅ oui même en EU region | ❌ non |
| 12 | **Recall.ai** | Bot de meeting (Zoom/Meet/Teams) — transcripts | US | US | ✅ oui | ❌ non |
| 13 | **Apollo.io** | Enrichissement contacts B2B | US | US | ✅ oui | ❌ non |
| 14 | **Hunter.io / Datagma / Firmable / Crunchbase** | Enrichissement secondaire | mixte (Datagma=FR, Firmable=AU, Hunter=FR, Crunchbase=US) | mixte | mixte | partiel |
| 15 | **BullMQ + Redis** | Worker queue (`app/apps/worker`) | `redis://localhost:6379` en dev — non configuré en prod | à choisir | — | ouvert |
| 16 | **EmailEngine** | Sync IMAP des mailboxes utilisateurs | self-hosted (à confirmer) | dépend de l'hébergeur | dépend | ouvert |

**Conclusion brute :** sur 16 sous-traitants identifiés, **0** sont
nativement souverains EU/CH. **1** (PostHog) a une région EU mais l'éditeur
reste US donc reste sous Cloud Act. **14** envoient des données vers le sol
US ou un opérateur US.

---

## 2. Écart vs RGPD/nFADP (plancher légal)

Niveau qui suffit pour vendre B2B classique en EU/CH, **insuffisant** pour
vendre dans Pilae.

| Exigence | État | Preuve | Bloquant ? |
|---|---|---|---|
| Liste sous-traitants à jour | ❌ | `/privacy` liste 7, code en a 14, mentionne Supabase quand FINDING-004 spec Neon | OUI |
| DPAs signés (Art. 28) | ❌ | Aucun artefact dans le repo, déclaration "we maintain DPAs" non sourcée | OUI |
| Transferts hors EEE (Art. 44-49) | ⚠️ | Page mentionne SCC + DPF — pas de TIA (transfer impact assessment) versionné | OUI |
| Pinning région EU des sous-traitants EU-capables | ⚠️ | DB OK (Frankfurt), Anthropic NON (pas de `ANTHROPIC_REGION=eu`), Sentry NON (US default), Vercel NON | OUI |
| Registre des traitements (Art. 30) | ❌ | Aucun fichier `/docs/ropa.md` ou équivalent | OUI |
| DPIA / AIPD pour LLM + enrichissement (Art. 35) | ❌ | Aucune trace | OUI |
| Politique de rétention appliquée | ⚠️ | `/privacy` la décrit (30j post-suppression, 24m analytics anonymisées) — pas de job de purge prouvé | MOYEN |
| DSR (export + delete) | ⚠️ | Routes existent (`/api/gdpr/*`) mais audit log inexistant (cf H7 audit sécu) | MOYEN |
| Géo-détection des prospects EU | ❌ | Heuristique TLD email (FINDING-004 AC-6, jamais corrigé) | MOYEN |
| Cookie banner conforme CNIL | À vérifier | Pas vu de composant `<CookieBanner>` dans `src/app/(legal)` | MOYEN |
| Mentions légales accessibles | ⚠️ | `/privacy`, `/terms`, `/acceptable-use` existent — pas de `/legal/sous-traitants` distinct ni `/legal/security` | FAIBLE |
| Suisse — nFADP : registre + DPO joignable CH | ❌ | DPO = `privacy@elevay.dev`, pas de représentant CH listé | OUI si vente CH |

**3 actions RGPD bloquantes (semaine 1) :**

1. Refaire la table sous-processeurs : 16 lignes, juridiction réelle, dates
   DPA, lien vers DPA public de chaque fournisseur, version.
2. Activer le pinning : `ANTHROPIC_REGION=eu`, `SENTRY_DSN=*.de.sentry.io`,
   garde-fou `GDPR_REGION=eu` au boot (FINDING-004 AC-3 — code déjà spec'é,
   pas implémenté).
3. Publier un RoPA + DPIA versionné dans `/docs/ropa.md` et
   `/docs/dpia-llm.md`.

---

## 3. Écart vs cloud souverain EU/CH (vrai positionnement Pilae)

C'est ici que tout casse. RGPD ≠ souverain. AWS Frankfurt est RGPD-compliant
mais soumis au **Cloud Act** (loi US 2018 qui force tout opérateur de
nationalité US à fournir les données aux autorités US, peu importe où elles
sont stockées). Pour qu'Elevay puisse être commercialement crédible auprès
des prospects de Pilae, il faut sortir de chaque ligne du tableau §1.

### 3.1 Plan de substitution vendor-par-vendor

| Composant | Aujourd'hui (non-souverain) | Cible souveraine EU | Cible souveraine CH | Effort | Risque |
|---|---|---|---|---|---|
| **DB Postgres** | Supabase / AWS eu-central-1 | **Scaleway Managed DB** (FR, SecNumCloud-éligible) ou **OVH Public Cloud DB** (FR, SecNumCloud) ou **Clever Cloud** (FR) | **Infomaniak Public Cloud Postgres** (CH, ISO 27001 + ISO 27018) ou **Exoscale DBaaS** (CH, ISO 27001) | M (1-2 sem migration + tests) | DRIZZLE compatible, schéma neutre |
| **Hosting Next.js** | Vercel | **Scaleway Serverless Functions** + **Containers** ou **Clever Cloud** (Next.js officiellement supporté) | **Infomaniak Cloud Server** ou **Exoscale SKS** (Kubernetes managed CH) | M | Perdre les avantages de Vercel (preview deploys, edge — voir §3.2 mitigation) |
| **LLM Claude/GPT** | Anthropic US + OpenAI US | **Mistral La Plateforme** (FR, modèles Mistral Large 2 + Codestral) **ou** **Anthropic via AWS Bedrock eu-west-3 Paris** (atténue mais ne supprime pas Cloud Act) **ou** **self-hosted Llama 3.3 70B / Mistral Small 3** sur Scaleway GPU | Mistral via Infomaniak AI ou self-host CH | L (rewrite prompts, eval suite à re-tourner) | Qualité Mistral Large 2 ≈ Sonnet 3.5 mais < Opus 4.7 sur chat agentique complexe — à mesurer sur le golden eval |
| **Embeddings** | OpenAI `text-embedding-3-*` | **Mistral Embed** ou **BAAI/bge-m3 self-host** | idem | M | Re-vectoriser tout le corpus une fois |
| **Email transactionnel** | Resend | **Brevo (ex-Sendinblue, FR)** ou **Mailjet (FR, racheté par Sinch SE mais infra FR)** ou **Tipimail (FR)** | **Infomaniak Mail Hosting + SMTP** | S | API très standardisée |
| **Email outbound (cold)** | EmailEngine self-host (OK) | EmailEngine self-host **sur infra UE** | EmailEngine self-host **sur infra CH** | S | déjà self-hosted |
| **Bot de meeting** | Recall.ai | **PoC : self-host bot Selenium/Playwright** + Whisper EU self-host OU contracter un wrapper EU (peu d'alternatives matures) | idem | XL | Recall.ai n'a pas d'équivalent EU 1-pour-1 — peut-être garder en option payante US et marquer comme tel |
| **Payment** | Stripe | **Mollie (NL, RGPD-only)** ou **GoCardless (UK/FR — SEPA only)** ou rester Stripe avec contrat EU Stripe Payments Europe Ltd (Dublin) et accepter cet écart | **Stripe Europe + acquéreur CH** ou **Wallee (CH)** | M | Mollie a < features que Stripe (pas de Tax / Connect Express) |
| **OAuth Gmail/Outlook** | Google + Microsoft | **garder** — IMAP/OAuth est nécessaire pour lire la boîte du client. Documenter que cette ligne est **client-side** : la donnée arrive chez Elevay déjà émise depuis Google/MS et le client a déjà accepté ces ToS. | idem | — | non-déplaçable structurellement |
| **Sentry** | US default | **GlitchTip self-host** (open-source, drop-in Sentry-compatible) sur infra EU, ou **Sentry self-host** sur infra EU | idem CH | M | runtime supplémentaire à opérer |
| **PostHog** | eu.i.posthog.com (US owner) | **PostHog self-host** (open-source) sur infra EU, ou **Matomo Cloud (EU)** ou **Plausible (EE)** | idem CH | M | Migration des dashboards |
| **Queue (Inngest + Redis)** | Inngest US | **BullMQ + Redis managé Scaleway / OVH** (FR) — déjà partiellement codé dans `app/apps/worker` | **BullMQ + Redis Infomaniak / Exoscale** (CH) | M | Inngest a un DX supérieur — l'équivalent BullMQ demande plus de code (workflows, retries, etc.) |
| **Enrichissement** | Apollo (US) | **Datagma (FR, déjà intégré)**, **Kaspr (FR)**, **Cognism (UK, GDPR-first)**, **Dropcontact (FR)**, **Societe Info / Pappers (FR, données SIRENE)** | idem + **Moneyhouse (CH)** pour données entreprises CH | S-M | qualité ≠ Apollo sur US mais sur EU/CH meilleure |
| **CDN / WAF** | Vercel | **Bunny.net (SI, EU-only)** ou **Scaleway Edge Services** | **Infomaniak CDN** | S | optionnel |
| **DNS** | actuel inconnu (Cloudflare ?) | **Gandi DNS (FR)** ou **Scaleway DNS** | **Infomaniak DNS** | S | trivial |
| **Object storage** | non identifié — à confirmer si Vercel Blob/S3 utilisé | **Scaleway Object Storage** (S3-compat, FR) ou **OVH Object Storage** | **Exoscale SOS** ou **Infomaniak Swiss Backup** | S | API S3 partout |
| **Logs / SIEM** | aucun (stdout Vercel) | **Logtail / BetterStack EU** ou **Grafana Loki self-host** | **Exoscale Logs** | M | requis pour SOC 2 |
| **Secrets management** | `.env` files (cf A.8.24 gap audit sécu) | **HashiCorp Vault** self-host EU ou **Doppler EU plan** ou **Scaleway Secret Manager** | **Infomaniak kSuite Secrets** ou Vault self-host CH | M | bloquant SOC 2 |

### 3.2 Mitigation perte Vercel

Sortir de Vercel coûte les preview deploys, edge runtime et l'ergonomie git
→ deploy. Trois options :

1. **Clever Cloud + GitHub Actions** : preview deploys via app-per-branch +
   buildpack Next.js officiel. SecNumCloud-éligible (en cours de
   qualification 2026). Setup ~3 jours.
2. **Scaleway Containers + Serverless Functions** : pas de preview deploy
   natif, scripté via Terraform / Workflows. SecNumCloud Outscale Cloud Gouv
   en option premium. Setup ~5 jours.
3. **Kubernetes managé (Scaleway Kapsule / Exoscale SKS / OVH Managed K8s)**
   avec ArgoCD pour preview deploys. Setup ~10 jours, plus de contrôle, plus
   d'overhead opérationnel.

**Recommandation :** Clever Cloud en première itération (le plus proche du
DX Vercel), basculer K8s si besoin >50 clients.

### 3.3 Mitigation perte Anthropic Opus

Le sous-jacent agentique d'Elevay (chat assistant, planification, scoring)
dépend probablement de la qualité Opus. Substitution réaliste :

| Cas d'usage | Modèle souverain | Qualité vs Opus 4.7 |
|---|---|---|
| Génération email court (1 step) | Mistral Large 2 | ≈ 90 % |
| Scoring lead (classification) | Mistral Small 3 ou Llama 3.3 70B | ≈ 95 % |
| Chat agentique multi-tools | Mistral Large 2 + tool use | ≈ 75 % — perte mesurable |
| Embeddings | Mistral Embed | ≈ 95 % |
| Summarization | Mistral Large 2 | ≈ 90 % |

Faire tourner **`pnpm eval:run`** (déjà présent, ligne 12 du package.json
web) avec un router LLM swappable. Si la régression < 5 % sur le golden
eval, basculer. Sinon, hybride : Mistral pour 80 % des appels + Anthropic
Bedrock eu-west-3 (Paris) pour les 20 % critiques, en documentant que cette
ligne reste sous Cloud Act (Anthropic est l'éditeur même sur Bedrock —
seule l'infrastructure AWS est sous SCC).

---

## 4. Écart vs ISO 27001:2022 — état des contrôles

Synthèse mise à jour du tableau "SOC 2 / ISO 27001 control gaps" de
l'audit sécu du 2026-04-15 (`_reports/security-audit-2026-04-15.md`).
Statut au 2026-05-19 à valider — beaucoup des items de la "semaine 1" du
plan d'exécution n'apparaissent pas dans `git log` sous forme de fix
explicite (ex : pas de commit qui mentionne `cron auth`, `Recall webhook`,
`bcrypt cost`). À vérifier au cas par cas avant chantier ISO.

| Annexe A | Contrôle | État actuel | Pour souverain Pilae |
|---|---|---|---|
| A.5.7 | Threat intelligence | ❌ aucun | OK low priority |
| A.5.9 | Inventaire des assets | ❌ aucun fichier `/docs/assets.md` | **bloquant** ISO + SOC 2 |
| A.5.12 | Classification de l'information | ❌ (cité comme gap) | **bloquant** — Pilae voudra savoir où vit la PII |
| A.5.15 | Contrôle d'accès | ⚠️ RBAC tenant existe, MFA absente (L2 audit) | **bloquant** |
| A.5.23 | Sécurité services cloud | ❌ pas de matrice "service → contrôles compensatoires" | **bloquant souverain** |
| A.5.24-26 | Incident response | ❌ undocumented | **bloquant** |
| A.5.30 | ICT readiness for BC | ⚠️ pas de DR runbook testé | **bloquant** |
| A.5.34 | PII protection | ⚠️ DSR existe, audit log spotty | bloquant |
| A.6.3 | Awareness training | ❌ | bloquant à long terme |
| A.8.2 | Privileged access | ❌ pas de PAM, pas de break-glass procedure | bloquant |
| A.8.5 | Secure authentication | ❌ pas de MFA | bloquant |
| A.8.8 | Vulnerability management | ❌ pas de cadence | bloquant |
| A.8.15 | Logging | ⚠️ stdout sans rétention | bloquant SOC 2 CC7.2 |
| A.8.16 | Monitoring | ❌ pas de détection d'anomalies | bloquant |
| A.8.24 | Cryptographie | ⚠️ pas de KMS, secrets en `.env` | bloquant |
| A.8.25 | Cycle de vie sécurisé | ❌ pas de SAST/DAST en CI | bloquant |
| A.8.29 | Tests sécurité | ❌ pas de pentest externe | bloquant |
| A.8.32 | Change management | ⚠️ Git + PR mais pas de CAB ni release approval | acceptable |

**Estimation ISO 27001 readiness :** 4-6 mois calendaires avec un
responsable dédié 50 %, hors implémentation des contrôles (qui prend en
plus 2-3 mois). Coût certif organisme accrédité ≈ 15-30 k€ + audit annuel
≈ 8-15 k€.

---

## 5. Écart vs SOC 2 type II

SOC 2 est plus court qu'ISO 27001 mais demande **6 à 12 mois d'observation
window** où les contrôles fonctionnent en continu. Donc même si on
implémente tout demain, le rapport type II ne sort pas avant
fin 2026 / début 2027.

| Trust Service Criterion | Contrôles principaux | État | Effort restant |
|---|---|---|---|
| **CC1-CC2 Control environment** | board, policies, code of conduct | ❌ aucun policy pack | 2-3 sem rédaction |
| **CC3 Risk assessment** | risk register, threat model | ❌ | 1-2 sem |
| **CC4 Monitoring** | continuous control monitoring | ❌ | nécessite Drata/Vanta/Tugboat |
| **CC5 Control activities** | segregation of duties, change mgmt | ⚠️ partiel via GitHub | 1 sem |
| **CC6.1 Logical access** | MFA, RBAC, provisioning/de-provisioning | ❌ pas de MFA, pas de IGA | 3-4 sem |
| **CC6.6 Boundary protection** | WAF, CSP, segmentation | ⚠️ CSP a des `unsafe-*` (H10, H11) | 2 sem |
| **CC7.1-7.5 System operations** | monitoring, incident, BC | ❌ | 4-6 sem |
| **CC8 Change management** | tests, approvals, rollback | ⚠️ existe mais pas formalisé | 1 sem |
| **CC9 Risk mitigation** | vendor management, BIA | ❌ | 2 sem |
| **A1 Availability** | SLO, monitoring, BCDR | ⚠️ | 3-4 sem |
| **C1 Confidentiality** | encryption, NDAs, data classification | ⚠️ | 2 sem |
| **P1-P8 Privacy** (optionnel) | aligné GDPR | ⚠️ | 2-3 sem |

**Recommandation pragmatique :** souscrire **Drata, Vanta ou Tugboat
Logic** (≈ 7-15 k€/an), qui orchestrent la collecte de preuves
automatiquement et raccourcissent la prep de 60 %. Drata a une bonne
intégration GitHub + Vercel + AWS — mais ironiquement c'est un sous-traitant
US, donc à arbitrer.

---

## 6. Risques spécifiques au discours « souverain » que Pilae achète

Trois pièges où Pilae va vous tester sur la sincérité du positionnement :

1. **Cloud Act sur AWS Frankfurt.** "Données en Allemagne" ≠ "données
   non-accessibles aux autorités US". Tant que l'opérateur (Supabase,
   Anthropic Bedrock) a une mère US, ça reste accessible via
   18 U.S.C. § 2713. Seuls SecNumCloud, EUCS High, ou un opérateur
   100 % capital UE/CH qualifié coupent ce lien.

2. **DPF "Data Privacy Framework".** Page privacy ligne 366 cite le DPF
   comme base de transfert. Le DPF a été attaqué (recours C-247/24
   en cours devant la CJUE) et la CNIL a publié en mars 2026 des doutes
   sur sa pérennité. **Ne pas s'appuyer dessus** dans un argumentaire
   Pilae : préférer SCC + TIA + supplementary measures (chiffrement
   client-side avec clés UE).

3. **LLM US.** Même avec EU endpoint Anthropic, le contrôle final est
   chez Anthropic PBC, US. Mistral est aujourd'hui **le seul** LLM frontier
   100 % EU capitalistiquement. Si vous gardez Anthropic pour la qualité,
   il faut un argumentaire honnête : "LLM optionnel, opt-out par tenant,
   non-souverain explicite, donnée minimisée avant envoi". Pas
   "Anthropic Bedrock = souverain".

---

## 7. Plan d'exécution proposé (12-14 semaines)

### Phase 0 — Honnêteté (semaine 1, blocking)

- [ ] Réécrire `/privacy` table sous-processeurs : 16 entrées avec
      juridiction réelle, dates DPA, lien DPA, version.
- [ ] Supprimer la mention "Supabase EU (Frankfurt)" si décision de migrer,
      sinon noter "AWS Frankfurt — Cloud Act exposure".
- [ ] Supprimer la dépendance au DPF dans la page privacy, remplacer par
      SCC + TIA.
- [ ] Créer `/docs/ropa.md` (registre Art. 30).
- [ ] Créer `/docs/dpia-llm.md` (AIPD pour le traitement LLM).
- [ ] Page publique `/legal/security` : architecture, chiffrement, SOC 2
      roadmap, sub-processors. C'est ce que les acheteurs Pilae demanderont
      au premier call.

### Phase 1 — Fix RGPD/sécu critique (semaines 1-3, parallèle Phase 0)

Issues déjà identifiées dans l'audit sécu 2026-04-15. À vérifier ce qui a
réellement été commité depuis (cf `git log fix(reads): batch 5-7` traite
soft-delete, pas ces items). À refaire si non fait :

- [ ] FINDING-004 AC-1 à AC-6 (région pinning Anthropic + DB + DPA registry
      + geo-IP) — implémentation du spec Kiro existant.
- [ ] Audit sécu C1-C9 + H1-H12 (cron auth, IDOR, SSRF, MFA, etc.).

### Phase 2 — Migration sous-traitants sensibles (semaines 3-8)

Priorité = ce qui touche la PII en clair. Ordre proposé :

1. **DB** — Supabase Frankfurt → Scaleway Managed DB Postgres (FR) ou
   Infomaniak Postgres (CH). Migration : `pg_dump` + `pg_restore`,
   `DATABASE_URL` swap, tests régression `pnpm eval:run`.
2. **LLM** — router multi-provider derrière `@ai-sdk/*`. Tester Mistral
   Large 2 + Mistral Embed. Si golden eval reste vert → bascule.
3. **Email transactionnel** — Resend → Brevo (FR). Refactor mince,
   APIs ≈ équivalentes.
4. **Sentry** → GlitchTip self-host sur infra cible.
5. **PostHog Cloud EU** → PostHog self-host sur infra cible.
6. **Inngest** → BullMQ déjà en place dans worker, étendre les flows.

### Phase 3 — Migration hosting (semaines 6-10, peut chevaucher Phase 2)

1. PoC Clever Cloud : déployer une preview branch Elevay, mesurer DX et
   coûts.
2. Configurer Terraform / IaC pour reproductibilité.
3. Bascule DNS + warm-up.

### Phase 4 — Compliance bureaucratique (semaines 8-14)

1. Choix tooling (Drata/Vanta/Tugboat — ou self-managed via Drata
   self-serve).
2. Souscription cabinet d'accompagnement (Vialtus, Synetis, Sec-Pro pour
   ISO ; Johanson Group, Sensiba pour SOC 2). Coût ≈ 20-40 k€ pour la
   première année.
3. Pré-audit + remédiations.
4. Audit type II observation window : 6 mois minimum.
5. Pentest externe : YesWeHack, Synacktiv, Lexfo (FR — souverains).
   Budget ≈ 8-15 k€.

---

## 8. Coût total estimé

| Poste | One-off | Récurrent annuel |
|---|---|---|
| Migration infra (DB, hosting, LLM router, email, observability) | 0 € (dev interne, ~6-8 sem) | +10-25 % vs Vercel/Supabase actuel (Clever + Scaleway ≈ équivalent, Infomaniak souvent moins cher) |
| Mistral La Plateforme | — | ~0,8 €/M tokens vs Anthropic Opus à ~15 $/M tokens → **-95 % LLM bill** |
| Outil compliance (Drata/Vanta) | 2-3 k€ setup | 7-15 k€ |
| Accompagnement ISO 27001 | 15-25 k€ | 5-10 k€ surveillance |
| Audit ISO 27001 (organisme accrédité) | 12-20 k€ | 8-15 k€ (audit surveillance puis renewal) |
| Audit SOC 2 type I puis II | 10-15 k€ type I + 25-40 k€ type II | 20-30 k€ renewal |
| Pentest externe annuel | 8-15 k€ | 8-15 k€ |
| DPO externalisé (si pas en interne) | — | 6-12 k€ |
| **Total an 1** | **~55-80 k€** | **~55-95 k€/an** |

Le ROI dépend du panier moyen Pilae. À un ARR Elevay > 200 k€ ça
s'auto-finance, en deçà le sovereign play coûte plus qu'il ne rapporte —
sauf si Pilae est le seul ICP et la condition de vente.

---

## 9. Décisions à prendre

Quatre choix qui orientent tout le chantier :

| Décision | Options | Mon avis |
|---|---|---|
| **A — Géographie cible** | (a) EU sovereign seulement / (b) CH sovereign seulement / (c) EU + CH option | **(c)** : DB en FR par défaut, option Infomaniak CH pour clients CH sensibles |
| **B — Niveau de qualification visé** | (a) RGPD/nFADP seulement / (b) ISO 27001 / (c) SOC 2 / (d) SecNumCloud | **(b) + (c)** pour 12 mois, SecNumCloud uniquement si client public FR demande |
| **C — LLM** | (a) full Mistral / (b) Mistral + Anthropic Bedrock EU avec opt-in / (c) statu quo Anthropic US | **(b)** avec opt-in : honnête, et garde la qualité quand le client accepte |
| **D — Hosting** | (a) Clever Cloud / (b) Scaleway / (c) Kubernetes managé / (d) hybride | **(a)** semaine 1 (vélocité), réévaluer K8s à >50 clients |

---

## 10. Quick wins activables cette semaine sans migration

À faire avant tout chantier lourd, parce que ce sont des changements
.env et UI qui rendent immédiatement le discours plus défendable :

1. `ANTHROPIC_REGION=eu` en prod + assert au boot (FINDING-004 AC-1).
2. Migrer Sentry DSN sur la région `de.sentry.io` (free → no infra
   migration).
3. Mettre `sendDefaultPii: false` + `beforeSend` scrub dans les 3 fichiers
   Sentry config (H8 audit sécu).
4. Mettre à jour `/privacy` table sous-processeurs avec la vraie liste de
   16 (cf §1).
5. Publier `/legal/security` minimal listant les contrôles (CSP, TLS,
   isolation tenant, sauvegardes) — c'est la page que les acheteurs
   demandent en premier.
6. Mettre à jour la copie "GDPR compliant" pour qu'elle reflète la réalité
   (préciser sous-processeurs US + bases légales transfert).
7. Désactiver `sendDefaultPii` PostHog si pas déjà fait (vérifier
   `posthog-js` init).

---

## 11. Pour aller plus loin (références à creuser)

- **ANSSI SecNumCloud 3.2** : référentiel FR de qualification cloud
  souverain, exigé par État FR + secteurs sensibles.
- **EUCS** (European Cybersecurity Certification Scheme for Cloud Services)
  : en cours d'adoption ENISA, niveau "High" = équivalent SecNumCloud.
- **C5 BSI** : équivalent allemand.
- **FINMA Outsourcing FINMA-RS 18/3** : exigences sous-traitance pour
  établissements financiers suisses — important si Pilae cible la banque
  CH.
- **CLOUD Act** : 18 U.S.C. § 2713 — texte de référence pour comprendre
  l'extraterritorialité US.
- **Arrêt Schrems II (C-311/18)** : pourquoi le Privacy Shield est tombé
  et pourquoi le DPF reste fragile.
- **nFADP suisse** : Loi fédérale sur la protection des données révisée,
  en vigueur 2023-09-01, alignée GDPR avec quelques spécificités
  (notification ≤ 72 h, registre obligatoire >250 employés).

---

## Annexe — fichiers et documents à produire

Liste minimale pour un dossier "sovereignty pack" prêt à envoyer à un
acheteur Pilae :

- `/docs/ropa.md` — Registre des activités de traitement Art. 30
- `/docs/dpia-llm.md` — AIPD traitement LLM
- `/docs/dpia-enrichment.md` — AIPD enrichissement données
- `/docs/data-classification.md` — Cartographie PII/PII spéciale
- `/docs/incident-response.md` — Runbook IR + notification 72 h
- `/docs/dr-runbook.md` — DR + RPO/RTO + tests
- `/docs/asset-inventory.md` — Assets logiques + propriétaires
- `/docs/access-control-policy.md` — Politique accès
- `/docs/encryption-policy.md` — Algos + rotation clés
- `/docs/vendor-management.md` — Procédure sélection + revue annuelle
- `/docs/risk-register.md` — Risques + traitements
- `/docs/security-policies/` — pack 12 policies ISO (info security,
  cryptography, access, ops, supplier, BCM, incident, HR, physical,
  comms, dev, compliance)
- `/legal/security` page publique — résumé client-facing
- `/legal/sub-processors` page publique avec date dernière maj +
  notification flow (email opt-in)
- `/legal/dpa-template.pdf` — modèle DPA signable par les clients
- `app/.kiro/specs/FINDING-004/` — finir l'implémentation des 6 AC

---

*Audit produit le 2026-05-19. Sources : `package.json`, `.env.local`,
`vercel.json`, `_reports/security-audit-2026-04-15.md`,
`app/.kiro/specs/FINDING-004/*`, `app/apps/web/src/app/(legal)/privacy/page.tsx`,
état Git au commit 75f4d0d.*

Co-Authored-By: Rippletide <admin@rippletide.com>
